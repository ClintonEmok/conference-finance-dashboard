/**
 * Pure donation-deletion contract (Phase 57).
 *
 * WHAT THIS MODULE OWNS: exactly two things — the deletion refusal classes
 * (DDEL-03) that decide whether a standalone donation may be deleted, and the
 * FROZEN deletion result (DDEL-02) that records the reversal. Nothing else: it
 * reads no database, holds no `ctx` and performs no I/O, so the refusal matrix
 * and the reversal arithmetic are provable in a plain unit test rather than
 * behind a handler.
 *
 * WHY A NEW CODE BLOCK: `DONATION_ALLOCATION_ERROR_CODES`
 * (`donation-allocation.ts:59-77`) is LOCKED — its own comment states the block
 * "is never edited by a later task". Deletion therefore declares its own
 * `DONATION_DELETE_ERROR_CODES` block, so a deletion caller can never match an
 * allocation code and a future allocation code can never masquerade as a
 * deletion refusal. Nothing is imported or re-exported from that block.
 *
 * WHY THE CLASSIFIER IS PURE AND WIDENED: the live `payments.source` union is
 * CLOSED — `tikkie | bank_transfer | cash` (`convex/schema.ts:947-951`) — and a
 * closed union cannot express the refusal this module owes a source that does
 * not exist yet. The classifier types `source` as a plain `string` and fails
 * closed on anything that is not one of the two manual sources, so a future
 * fourth source is REFUSED by default instead of silently becoming deletable.
 * The widening is also what makes the generic guard branch unit-testable at all.
 *
 * THE TIKKIE REFUSAL RATIONALE (a deliberate product decision, not a
 * limitation): a Tikkie-sourced standalone donation is refused because the sync
 * is watermarked per link and every poll re-fetches from
 * `watermark − TIKKIE_POLL_OVERLAP_MS` (`convex/autoSync.ts:23,68`; the
 * watermark is persisted at `convex/sync/internal.ts:216`) — roughly the last
 * five minutes of provider history on every poll. A donation created inside
 * that overlap is fetched again, and `upsertTikkiePayment`
 * (`convex/payments.ts:463-517`) finds no row at `(source, sourceId)` and
 * RE-INSERTS it, so a hard-delete would be resurrected by a later cron and the
 * deletion would silently lie. Refusal is chosen because that failure mode is
 * non-deterministic and money-bearing. Tombstoning `(source, sourceId)` so the
 * sync could skip a deleted donation is explicitly out of scope: Phase 57 must
 * not touch the sync hot path.
 */

import {
  deriveAllocationRemainingMinor,
  sumRecordedAllocationMinor,
  type DonationAllocationScope,
} from "./donation-allocation"

/**
 * Stable, assertable deletion error codes. Each key equals its string literal
 * so a caller can throw the code alone and a test can match on the code prefix
 * without parsing human detail — the same convention as
 * `DONATION_ALLOCATION_ERROR_CODES`. The WHOLE set is declared here even where
 * a later task first throws it, so this block is never edited later.
 *
 * The first four are the pure classifier's refusal classes; the last four are
 * the mutation-level codes (missing row, replay states, key validation) that
 * 57-03 throws once the classifier has passed. Keeping them in ONE block means
 * a deletion caller never needs a second code vocabulary.
 */
export const DONATION_DELETE_ERROR_CODES = {
  DONATION_DELETE_NOT_STANDALONE: "DONATION_DELETE_NOT_STANDALONE",
  DONATION_DELETE_CROSS_EVENT: "DONATION_DELETE_CROSS_EVENT",
  DONATION_DELETE_TIKKIE_SOURCED: "DONATION_DELETE_TIKKIE_SOURCED",
  DONATION_DELETE_PAYMENT_GUARD: "DONATION_DELETE_PAYMENT_GUARD",
  DONATION_DELETE_NOT_FOUND: "DONATION_DELETE_NOT_FOUND",
  DONATION_DELETE_ALREADY_DELETED: "DONATION_DELETE_ALREADY_DELETED",
  DONATION_DELETE_INVALID_KEY: "DONATION_DELETE_INVALID_KEY",
  DONATION_DELETE_IDEMPOTENCY_CONFLICT: "DONATION_DELETE_IDEMPOTENCY_CONFLICT",
} as const

export type DonationDeletionErrorCode = keyof typeof DONATION_DELETE_ERROR_CODES

/**
 * Throws with the code as a stable prefix so the code is assertable without
 * parsing the human detail. Mirrors `throwAllocationError` in
 * `donation-allocation.ts`.
 */
export function throwDonationDeletionError(
  code: DonationDeletionErrorCode,
  detail?: string
): never {
  throw new Error(detail ? `${code}: ${detail}` : code)
}

/**
 * The payment facts the deletability predicate reads, structurally — never a
 * `Doc<"payments">`, so the classifier stays pure and widened:
 *
 *   - `donationKind` / `orderId` / `status` are the standalone terms;
 *     `markPaymentAsDonation` keeps an order-linked row's `orderId` and
 *     classifies it `overpayment`, so all three terms are load-bearing.
 *   - `eventId` is the ownership term; `undefined` (an eventless payment)
 *     refuses too, mirroring `deletePayment`'s eventless case.
 *   - `source` is deliberately a plain `string`: the live union is closed but
 *     this module must fail closed for a source that does not exist yet.
 */
export type DonationDeletabilityPayment = {
  donationKind: "overpayment" | "standalone" | undefined
  /** Provider alias string, never a typed order ref. */
  orderId: string | undefined
  status:
    | "auto_matched"
    | "manual_assignment"
    | "ambiguous"
    | "unassigned"
    | "donation"
    | undefined
  eventId: string | undefined
  source: string
}

export type DonationDeletability =
  | { deletable: true }
  | { deletable: false; code: DonationDeletionErrorCode; detail: string }

/**
 * The ONE pure deletability decision. The predicate order is FIXED and each
 * branch exists for a reason; reordering changes which code a caller sees for a
 * row that violates more than one rule, so the order is pinned by the unit
 * suite:
 *
 *   1. non-standalone — the faithful donation-side equivalent of
 *      `deletePayment`'s "only unassigned" clause. A standalone donation is by
 *      definition `status: "donation"` / `donationKind: "standalone"` with no
 *      `orderId`, so the three terms refuse an overpayment, an ambiguous or
 *      unassigned row, and an order-linked alias alike.
 *   2. cross-event — `eventId` must equal the supplied event; `undefined`
 *      fails here too (eventless refusal).
 *   3. Tikkie-sourced — its OWN code, checked BEFORE the generic guard so a
 *      caller can discriminate the resurrection-hazard refusal from an unknown
 *      source (see the module header for the full rationale).
 *   4. generic manual-source guard — fail-closed default for any source
 *      outside the two manual ones, including a future fourth source.
 */
export function classifyDonationDeletability(
  payment: DonationDeletabilityPayment,
  args: { eventId: string }
): DonationDeletability {
  if (
    payment.donationKind !== "standalone" ||
    payment.orderId !== undefined ||
    payment.status !== "donation"
  ) {
    return {
      deletable: false,
      code: DONATION_DELETE_ERROR_CODES.DONATION_DELETE_NOT_STANDALONE,
      detail: "only a standalone, unlinked donation can be deleted",
    }
  }

  if (payment.eventId !== args.eventId) {
    return {
      deletable: false,
      code: DONATION_DELETE_ERROR_CODES.DONATION_DELETE_CROSS_EVENT,
      detail: "the donation does not belong to the supplied event",
    }
  }

  if (payment.source === "tikkie") {
    return {
      deletable: false,
      code: DONATION_DELETE_ERROR_CODES.DONATION_DELETE_TIKKIE_SOURCED,
      detail:
        "a Tikkie-sourced donation would be re-created by the next sync poll",
    }
  }

  if (payment.source !== "cash" && payment.source !== "bank_transfer") {
    return {
      deletable: false,
      code: DONATION_DELETE_ERROR_CODES.DONATION_DELETE_PAYMENT_GUARD,
      detail: "only manually recorded donations can be deleted",
    }
  }

  return { deletable: true }
}

/**
 * One frozen reversal row. This is deliberately the SAME four fields the
 * ledger's `rows` array serializes (`toLedgerRows`, `convex/donations.ts`) —
 * the frozen result carries the ledger's serialization shape, never the live
 * `donationAllocations` row shape.
 */
export type DonationDeletionResultRow = {
  attendeeId: string
  orderId: string
  amountMinor: number
  scope: DonationAllocationScope
}

/**
 * The frozen deletion result (DDEL-02). This is a VALUE SNAPSHOT, not a
 * projection over live state: the caller stores it in the deletion ledger and
 * replays it VERBATIM, and nothing in it may ever be recomputed on replay —
 * the donation row is gone and the removal audits are the only mutable
 * evidence left.
 */
export type DonationDeletionResult = {
  donationId: string
  deleted: true
  donationAmountMinor: number
  reversedAllocationMinor: number
  remainingMinor: number
  allocationCount: number
  rows: DonationDeletionResultRow[]
}

/**
 * Freezes the reversal arithmetic. It adds NO arithmetic of its own: the
 * reversed total comes from Phase 55's `sumRecordedAllocationMinor` and the
 * never-credited remainder from Phase 55's `deriveAllocationRemainingMinor`,
 * so the exactness of a reversed deletion has exactly one owner. A local
 * `amount − Σ` would drift from the recorded-basis rule (D-01) and is
 * cross-checked against by the unit suite.
 *
 * The `rows` array is PROJECTED to the four declared fields (and kept in input
 * order, never sorted) rather than spread or returned by reference: 57-03
 * passes full `Doc<"donationAllocations">` rows and structural typing accepts
 * them, so a spread would carry `_id`, `_creationTime` and `donationId` into
 * the frozen snapshot at runtime while the ledger stores only the four fields —
 * and 57-04's ledger-versus-result deep-equals could then never pass.
 */
export function buildDonationDeletionResult(input: {
  donationId: string
  donationAmountMinor: number
  rows: ReadonlyArray<DonationDeletionResultRow>
}): DonationDeletionResult {
  const reversedAllocationMinor = sumRecordedAllocationMinor(input.rows)
  const { remainingMinor } = deriveAllocationRemainingMinor({
    donationAmountMinor: input.donationAmountMinor,
    recordedRows: input.rows,
  })

  return {
    donationId: input.donationId,
    deleted: true,
    donationAmountMinor: input.donationAmountMinor,
    reversedAllocationMinor,
    remainingMinor,
    allocationCount: input.rows.length,
    rows: input.rows.map((row) => ({
      attendeeId: row.attendeeId,
      orderId: row.orderId,
      amountMinor: row.amountMinor,
      scope: row.scope,
    })),
  }
}
