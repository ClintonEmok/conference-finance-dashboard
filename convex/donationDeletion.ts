import { mutation } from "./_generated/server"
import { v } from "convex/values"
import { requireIdentity } from "./auth"
import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"
import {
  findSubmissionByKey,
  loadRecordedAllocations,
  toLedgerRows,
  writeAllocationRemovalAudit,
} from "./donations"
import { digestAllocationEnvelope } from "../lib/domain/finance/donation-allocation"
import {
  buildDonationDeletionResult,
  classifyDonationDeletability,
  DONATION_DELETE_ERROR_CODES,
  throwDonationDeletionError,
  type DonationDeletionResult,
} from "../lib/domain/finance/donation-deletion"

/**
 * Donation deletion module (Phase 57).
 *
 * THE REPLAY-ORDERING DEVIATION — do not "fix" this back to Phase 55's order.
 * `allocateDonation` calls `loadDonationForAllocation` before
 * `findSubmissionByKey` / `resolveSubmissionReplay`, and `removeDonationAllocation`
 * does the same (both in `convex/donations.ts`). Deletion CANNOT copy that: a
 * successful deletion leaves no `payments` row, so a guard-first order would
 * make every legitimate same-key replay throw a spurious not-found. The ledger
 * lookup therefore runs FIRST, before any donation read, and the request digest
 * is recomputed server-side from `{ donationId, eventId, operation: "delete",
 * payload: {} }` before the event, the donation or the classifier is consulted.
 * A replay of a completed deletion returns the stored frozen result with ZERO
 * writes.
 *
 * THE KEY IS THE SUBMISSION IDENTITY (the Phase 55 D-21 rule). A key identifies
 * ONE submission per donation, never one operation: a key already used for this
 * donation is either the SAME request (matching digest — the stored result is
 * returned verbatim) or a different one (digest mismatch — the typed
 * `DONATION_DELETE_IDEMPOTENCY_CONFLICT`). Retrying with a fresh key against a
 * donation that is already gone refuses with `DONATION_DELETE_ALREADY_DELETED`
 * through the bounded `by_donationId_and_operation` lookup, never a misleading
 * not-found for work that already succeeded.
 *
 * THE TIKKIE REFUSAL. Tikkie-sourced standalone donations are permanently
 * refused (`DONATION_DELETE_TIKKIE_SOURCED`): the Tikkie poller re-fetches from
 * its overlap window and, finding no row at `(source, sourceId)` for the linked
 * payment request, re-inserts the payment — so a hard delete would be
 * resurrected by a later poll. Refusal is the product decision, not an
 * implementation limitation; a durable deletion marker is explicitly future
 * work and Phase 57 must not touch the poller's hot path. The rationale lives
 * here so a future author cannot relax the guard without deleting it first.
 *
 * ATOMICITY. All writes are direct `ctx.db` calls in this handler: one
 * transaction, all-or-nothing; no nested mutations and no scheduler. Every
 * predicate above runs before the first write, so a refusal leaves the
 * donation, its allocations and every ledger/audit table byte-unchanged. There
 * is deliberately NO per-donation transaction cap: a deletion of N allocations
 * costs 2N + 2 writes (N allocation deletes, N removal-audit inserts, one
 * ledger/audit insert, one payment-row hard delete), far below Convex's
 * 16,000-document write limit, and N is bounded by the donation's own row count
 * (D-02: at most one allocation row per donation + attendee).
 *
 * AUDIT SHAPE. One `donationAllocationRemovals` row per reversed allocation —
 * written through the shared `writeAllocationRemovalAudit`, so a reversed row
 * and a removed row are the same shape by construction — PLUS the
 * donation-level deletion record, which IS the `operation: "delete"` ledger row
 * in `donationAllocationSubmissions` (the donation amount, the allocation count
 * via `rows.length` and each reversal). Neither substitutes for the other: the
 * per-allocation rows preserve provenance, the ledger row records that the
 * donation itself was deleted.
 *
 * LEDGER FIRST. The `operation: "delete"` row is inserted BEFORE the rows it
 * stamps, and its `_id` is passed into `writeAllocationRemovalAudit` as
 * `submissionId`, so this deletion keeps the provenance link Phase 55 declared
 * Phase 57 depends on. Removing the donation row is the LAST write.
 */

/**
 * Trims the caller-supplied key and refuses a blank one BEFORE any other work,
 * mirroring `requireAllocationIdempotencyKey` in `convex/donations.ts`: an
 * unusable key can never be recorded, so a later retry with the same (blank)
 * key can never be mistaken for a replay. The key is opaque: trimmed and
 * compared, never parsed.
 */
function requireDeletionIdempotencyKey(raw: string): string {
  const idempotencyKey = raw.trim()
  if (idempotencyKey.length === 0) {
    throwDonationDeletionError(
      DONATION_DELETE_ERROR_CODES.DONATION_DELETE_INVALID_KEY,
      "An idempotency key is required."
    )
  }
  return idempotencyKey
}

/**
 * The bounded "does this donation already have a delete submission?" lookup,
 * through the `by_donationId_and_operation` index so it reads at most one row.
 * Used only when the donation row is already gone.
 */
async function findDeletionSubmissionForDonation(
  ctx: Pick<MutationCtx, "db">,
  donationId: Id<"payments">
): Promise<Doc<"donationAllocationSubmissions"> | null> {
  return ctx.db
    .query("donationAllocationSubmissions")
    .withIndex("by_donationId_and_operation", (q) =>
      q.eq("donationId", donationId).eq("operation", "delete")
    )
    .first()
}

/**
 * Replays a stored deletion submission VERBATIM: every field is read from the
 * frozen ledger row and nothing is recomputed from live state (the donation row
 * is gone; the removal audits are the only other evidence left).
 *
 * The `??` fallback exists for a ledger row written before `donationAmountMinor`
 * was stored. Delete rows always carry the explicit amount — this module is
 * their only writer — and the fallback pair (`allocatedTotalMinor +
 * remainingMinor`) is itself frozen on the same row, so the fallback can never
 * lie about a deletion that already happened.
 */
function replayDeletionSubmission(
  submission: Doc<"donationAllocationSubmissions">,
  donationId: Id<"payments">
): DonationDeletionResult {
  return {
    donationId: String(donationId),
    deleted: true,
    donationAmountMinor:
      submission.donationAmountMinor ??
      submission.allocatedTotalMinor + submission.remainingMinor,
    reversedAllocationMinor: submission.allocatedTotalMinor,
    remainingMinor: submission.remainingMinor,
    allocationCount: submission.rows.length,
    rows: submission.rows,
  }
}

/**
 * Deletes one standalone donation and atomically reverses every allocation it
 * holds.
 *
 * Step order is deliberate and load-bearing (all predicates precede the first
 * write):
 *   auth -> blank-key refusal -> server digest -> ledger lookup + replay/conflict
 *   -> event existence -> donation existence (or already-deleted) -> the pure
 *   classifier's refusal classes -> read the recorded rows -> freeze the result
 *   -> ledger insert (LEDGER FIRST) -> per-row hard delete + removal audit
 *   -> donation hard delete -> return the frozen result with the typed id.
 *
 * The replay lookup runs BEFORE the donation read on purpose (see the module
 * header): a same-key retry of a completed deletion has no donation row to
 * guard on and must return the stored result instead.
 *
 * The pure classifier in `lib/domain/finance/donation-deletion.ts` owns every
 * refusal class — the handler must not restate any predicate.
 */
export const deleteDonation = mutation({
  args: {
    donationId: v.id("payments"),
    eventId: v.id("events"),
    // D-21: REQUIRED, never optional. Every submission must be replay-safe, so
    // there is no path that deletes without a ledger row.
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    const idempotencyKey = requireDeletionIdempotencyKey(args.idempotencyKey)

    // Recomputed server-side from the ACTUAL arguments. No caller-supplied
    // digest can exist, so a client can never forge a replay identity.
    const requestDigest = await digestAllocationEnvelope({
      donationId: args.donationId,
      eventId: args.eventId,
      operation: "delete",
      payload: {},
    })

    // THE REPLAY LOOKUP RUNS BEFORE EVERY DONATION READ (the deliberate
    // deviation from Phase 55's order documented in the module header).
    const submission = await findSubmissionByKey(ctx, {
      donationId: args.donationId,
      idempotencyKey,
    })

    if (submission) {
      if (submission.requestDigest !== requestDigest) {
        throwDonationDeletionError(
          DONATION_DELETE_ERROR_CODES.DONATION_DELETE_IDEMPOTENCY_CONFLICT,
          "This idempotency key was already used for a different request. Retry with a fresh key."
        )
      }
      // The stored frozen result, returned verbatim. Zero writes on this path.
      return replayDeletionSubmission(submission, args.donationId)
    }

    const event = await ctx.db.get("events", args.eventId)
    if (!event) {
      throwDonationDeletionError(
        DONATION_DELETE_ERROR_CODES.DONATION_DELETE_NOT_FOUND,
        `event ${String(args.eventId)} does not exist`
      )
    }

    const donation = await ctx.db.get("payments", args.donationId)
    if (!donation) {
      const deletionSubmission = await findDeletionSubmissionForDonation(
        ctx,
        args.donationId
      )
      if (deletionSubmission) {
        throwDonationDeletionError(
          DONATION_DELETE_ERROR_CODES.DONATION_DELETE_ALREADY_DELETED,
          `donation ${String(args.donationId)} was already deleted`
        )
      }
      throwDonationDeletionError(
        DONATION_DELETE_ERROR_CODES.DONATION_DELETE_NOT_FOUND,
        `donation ${String(args.donationId)} does not exist`
      )
    }

    // The pure classifier owns all four refusal classes (non-standalone,
    // cross-event, Tikkie-sourced, generic source guard). Any refusal throws
    // before the first write, so nothing is persisted.
    //
    // It takes a STRUCTURAL payment projection by contract, never a
    // `Doc<"payments">` — the projection's fields are declared
    // required-with-`undefined` while the doc's are optional — so the five
    // predicate terms are passed explicitly.
    const verdict = classifyDonationDeletability(
      {
        donationKind: donation.donationKind,
        orderId: donation.orderId,
        status: donation.status,
        eventId: donation.eventId,
        source: donation.source,
      },
      { eventId: args.eventId }
    )
    if (!verdict.deletable) {
      throwDonationDeletionError(verdict.code, verdict.detail)
    }

    // Read exactly the rows this deletion will reverse, through the shared
    // bounded `by_donationId` scan — never a `.collect()`. The read joins them
    // to this transaction's read set, so a concurrent allocation aborts the
    // transaction rather than leaving an orphan row.
    const rows = await loadRecordedAllocations(ctx, args.donationId)

    // The frozen result is computed BEFORE any write, from the rows already in
    // hand. `buildDonationDeletionResult` adds no arithmetic of its own: every
    // figure is delegated to Phase 55's owners.
    const frozen = buildDonationDeletionResult({
      donationId: String(args.donationId),
      donationAmountMinor: donation.amountMinor,
      rows,
    })

    // LEDGER FIRST (load-bearing): the removal-audit writer below needs
    // `submissionId` as an INPUT, so the row must exist before the rows it
    // stamps are written. This row is also the donation-level deletion record.
    const submissionId = await ctx.db.insert("donationAllocationSubmissions", {
      donationId: args.donationId,
      idempotencyKey,
      requestDigest,
      operation: "delete",
      actor: identity.tokenIdentifier,
      createdAt: Date.now(),
      allocatedTotalMinor: frozen.reversedAllocationMinor,
      remainingMinor: frozen.remainingMinor,
      rows: toLedgerRows(frozen.rows),
      eventId: args.eventId,
      donationAmountMinor: frozen.donationAmountMinor,
    })

    // ONE timestamp for the whole deletion, so every reversed row of this
    // deletion shares one `removedAt` (audit legibility).
    const removedAt = Date.now()

    // Reverse every allocation: hard delete the row, then write its append-only
    // audit row through the shared writer. Direct `ctx.db` calls only — a
    // per-row nested mutation would mint keys and sub-transactions.
    for (const row of rows) {
      await ctx.db.delete("donationAllocations", row._id)
      await writeAllocationRemovalAudit(ctx, {
        row,
        eventId: args.eventId,
        actor: identity.tokenIdentifier,
        submissionId,
        removedAt,
      })
    }

    // The hard delete, LAST. This is the module's only write against the
    // payments table — never insert, patch or replace a payments row (DACC-03).
    await ctx.db.delete("payments", args.donationId)

    return { ...frozen, donationId: args.donationId }
  },
})
