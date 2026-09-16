import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { requireIdentity } from "./auth"
import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import {
  loadMatchedPaymentTotalsByOrderId,
  loadOrderAmountDueBreakdowns,
} from "./finance"
import { deriveAllocationPaymentBreakdowns } from "../lib/domain/finance/allocation-payment-state"
import {
  deriveAllocationReadProjection,
  deriveAllocationRemainingMinor,
  digestAllocationEnvelope,
  sumRecordedAllocationMinor,
  throwAllocationError,
  validateAllocationPlan,
  DONATION_ALLOCATION_ERROR_CODES,
  type AllocationCeiling,
  type DonationAllocationPlanRow,
} from "../lib/domain/finance/donation-allocation"

/**
 * Donation allocation module (Phase 55).
 *
 * The allocation credit layer is SEPARATE from payment-to-order assignment:
 * this module allocates a recorded standalone donation across attendees of its
 * own event. Per DACC-03 it must NEVER issue any write against the `payments`
 * table — no patch, replace or delete of a payment row, in any handler of this
 * file. The donation's own payment row stays event-scoped, `orderId ===
 * undefined`, `status === "donation"`, `donationKind === "standalone"`; only
 * `donationAllocations` rows carry the credit.
 *
 * All domain helpers are imported by RELATIVE path (`../lib/…`): the Convex
 * bundler cannot resolve the `@/` alias.
 */

type FinanceDbCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">

const allocationScopeValidator = v.union(
  v.literal("event_charges"),
  v.literal("whole_order")
)

const allocationManualRowValidator = v.object({
  attendeeId: v.id("orderAttendees"),
  amountMinor: v.number(),
  scope: allocationScopeValidator,
})

const allocationTargetValidator = v.object({
  attendeeId: v.id("orderAttendees"),
  scope: allocationScopeValidator,
})

/**
 * Declared in full NOW so the mutation's published contract never changes.
 * `equal` and `largest_balance_first` are wired in plan 55-04; until then they
 * fail closed with `DONATION_ALLOCATION_UNSUPPORTED_METHOD`.
 */
const allocationRequestValidator = v.union(
  v.object({
    method: v.literal("manual"),
    rows: v.array(allocationManualRowValidator),
  }),
  v.object({
    method: v.literal("equal"),
    targets: v.array(allocationTargetValidator),
  }),
  v.object({
    method: v.literal("largest_balance_first"),
    targets: v.array(allocationTargetValidator),
  })
)

type AllocationRequest =
  | {
      method: "manual"
      rows: Array<{
        attendeeId: Id<"orderAttendees">
        amountMinor: number
        scope: "event_charges" | "whole_order"
      }>
    }
  | {
      method: "equal"
      targets: Array<{
        attendeeId: Id<"orderAttendees">
        scope: "event_charges" | "whole_order"
      }>
    }
  | {
      method: "largest_balance_first"
      targets: Array<{
        attendeeId: Id<"orderAttendees">
        scope: "event_charges" | "whole_order"
      }>
    }

/**
 * The ONE server-owned ceiling projection, used by preview, commit and read.
 * Keyed by `attendeeId`.
 *
 * It is DONATION-SCOPED: it takes the donation id so it can subtract OTHER
 * donations' allocations while excluding the current donation's own rows. The
 * lock-step rule (CONTEXT "Ceiling basis — exclude SELF, include OTHERS"):
 *
 *   ceiling_A(forDonation D) =
 *     max(0, attributableOutstanding_A − Σ allocations to A from donations ≠ D)
 *
 * Two failure modes pull in opposite directions and both are closed by this
 * one rule:
 *
 *   - CIRCULARITY. If a ceiling included D's OWN rows, editing D would
 *     validate against a ceiling D had itself lowered, so a second submission
 *     could never fit. Therefore every subtraction below filters
 *     `row.donationId !== args.donationId` — exclude SELF entirely, in both
 *     scopes.
 *   - CROSS-DONATION DOUBLE ALLOCATION (DON-06). If a ceiling were computed
 *     from the payment-only base and ignored OTHER donations' rows, two
 *     donations could each fully allocate the same attendee (€100 + €100
 *     against a €100 obligation) and, because each donation's read projection
 *     is computed per donation and independently caps at that attendee's
 *     outstanding, BOTH would report fully applied. Therefore the other
 *     donations' rows MUST be subtracted.
 *
 * The clamp is per scope:
 *
 *   eventChargesOutstandingMinor  = max(0, (due_A − paidShare_A) − otherEventChargesToA)
 *   wholeOrderOutstandingMinor    = max(0, (orderDue − orderPaid) − otherAllocationsToOrder)
 *
 * where `otherAllocationsToOrder` counts EVERY other donation's allocation to
 * that order REGARDLESS OF SCOPE — not just `whole_order` rows. An
 * `event_charges` claim on an attendee of the order is still a claim on the
 * order's shared outstanding pool. Filtering that subtraction to
 * `scope === "whole_order"` would leave a mixed-scope hole: D1 `event_charges`
 * €100 + D2 `whole_order` €100 on a €100 order would each pass their own scope
 * check and allocate €200 against a €100 obligation, and because the reader
 * derives from this same function it could never report the excess.
 *
 * MISSING-ORDER CONTRACT (one rule, three consumers):
 *   - an order that cannot be read is OMITTED from the returned map; this
 *     function never fabricates a ceiling and never throws for it.
 *   - the WRITER's `validateAllocationPlan` raises
 *     `DONATION_ALLOCATION_UNKNOWN_TARGET` for a row whose target has no
 *     ceiling entry.
 *   - the READ projection (`deriveAllocationReadProjection`) fails SAFE and
 *     reports `scopeOutstandingMinor = 0` for a dangling row.
 *
 * BOUND — ONE order-capacity rule with three terms. Do NOT read the
 * `otherAllocationsToOrder` subtraction as sufficient on its own: it EXCLUDES
 * SELF and each row is still compared against the same undecremented,
 * attendee-agnostic `wholeOrderOutstandingMinor`, so a single submission could
 * place rows summing above the order's outstanding (sibling `whole_order`
 * pair, or a scope-mixed pair). The other two terms live in
 * `validateAllocationPlan`:
 *
 *   capacity(O, D) = orderOutstanding(O)
 *                  − Σ other donations' allocations to O (ANY scope)
 *                  − Σ D's own other recorded rows on O   (ANY scope)
 *   Σ (this submission's rows for O, ANY scope) ≤ capacity(O, D)
 *
 * Term one is the subtraction here; term two is the `alreadyClaimedByOrder`
 * input supplied by the caller; term three is the any-scope pool debit inside
 * the pure validator. Together they make the bound true: no allocation, from
 * this or any other donation, can push an order's total allocated amount above
 * its outstanding. For `event_charges`, the per-attendee ceiling remains a
 * separate, narrower bound that handles attendee targeting.
 *
 * The rule is deliberately blind to WHICH attendees those other rows name: a
 * claim on the order is a claim on the shared pool, not on the named
 * individual.
 *
 * Do NOT assert `wholeOrderOutstandingMinor >= eventChargesOutstandingMinor`
 * as an invariant. Subtraction makes it hold only when no other donation holds
 * a claim on this order (then both reduce to their payment-only bases). With a
 * competing claim the two ceilings can legitimately cross, and that is
 * correct — the order-level pool is what is actually constrained.
 *
 * D-12 CONSEQUENCE AS IT NOW STANDS: the WRITE path bounds the aggregate per
 * order via the three-term rule above. What REMAINS is a read-side residual:
 * `deriveAllocationReadProjection` is per-row against the SCOPE ceiling and is
 * not pool-aware across a distribution, so it can report a `whole_order` row
 * as applied where Phase 56's targeted-first per-attendee application is less.
 * Phase 56 owns per-attendee application; the Phase 55 read figure is a
 * scope-ceiling staleness view and is never the canonical economic number.
 */
export async function loadAllocationCeilings(
  ctx: FinanceDbCtx,
  args: { donationId: Id<"payments">; orderIds: ReadonlyArray<Id<"orders">> }
): Promise<Map<string, AllocationCeiling>> {
  const ceilings = new Map<string, AllocationCeiling>()

  const uniqueOrderIds: Id<"orders">[] = []
  const seenOrderIds = new Set<string>()
  for (const orderId of args.orderIds) {
    const orderKey = String(orderId)
    if (!seenOrderIds.has(orderKey)) {
      seenOrderIds.add(orderKey)
      uniqueOrderIds.push(orderId)
    }
  }

  const orderDocs = await Promise.all(
    uniqueOrderIds.map((orderId) => ctx.db.get("orders", orderId))
  )
  const orders = orderDocs.filter(
    (order): order is Doc<"orders"> => order !== null
  )

  // Gross charges only — `loadOrderAmountDueBreakdowns` reads no payments, so
  // the applied-payment netting below is this projection's job.
  const dueByOrder = await loadOrderAmountDueBreakdowns(ctx, orders)
  // Already filtered by `isOrderAppliedPayment`, so standalone donations are
  // excluded and Phase 56's no-double-count contract is preserved.
  const paidByOrder = await loadMatchedPaymentTotalsByOrderId(ctx, orders)

  for (const order of orders) {
    const orderKey = String(order._id)
    const due = dueByOrder.get(orderKey)
    const orderDue = due?.amountDueMinor ?? 0
    const orderPaid = paidByOrder.get(orderKey) ?? 0

    // Pass the UNFILTERED `amountDueByAttendeeId` map: the paid share must be
    // weighted over the whole order, exactly as the canonical loader weights
    // it. A filtered subset would shift the shares and could make
    // `event_charges` exceed the attendee's true outstanding.
    const paidShares = deriveAllocationPaymentBreakdowns({
      amountDueByAttendeeId: due?.amountDueByAttendeeId ?? new Map(),
      paidTotalMinor: orderPaid,
    })

    // D-12, attendee-agnostic and the same value for every attendee of the
    // order. Never `orders.totalAmountMinor` (a provider/write-time total).
    const attributableOrderOutstanding = Math.max(0, orderDue - orderPaid)

    // Term one: OTHER donations' allocations to this order, ANY scope.
    let otherAllocationsToOrder = 0
    for await (const row of ctx.db
      .query("donationAllocations")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))) {
      if (row.donationId !== args.donationId) {
        otherAllocationsToOrder += row.amountMinor
      }
    }

    const wholeOrderOutstandingMinor = Math.max(
      0,
      attributableOrderOutstanding - otherAllocationsToOrder
    )

    // Bounded async iteration (guidelines.md:242) so an attendee with zero
    // attributed charges still gets a ceiling.
    for await (const attendee of ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))) {
      const attendeeKey = String(attendee._id)
      const attendeeDue = due?.amountDueByAttendeeId.get(attendeeKey) ?? 0
      const paidShare = paidShares.get(attendeeKey)?.paidAmountMinor ?? 0

      // D-11.
      const attributableOutstanding = Math.max(0, attendeeDue - paidShare)

      // OTHER donations' event_charges rows on THIS attendee, excluding SELF.
      let otherEventChargesToAttendee = 0
      for await (const row of ctx.db
        .query("donationAllocations")
        .withIndex("by_attendeeId", (q) => q.eq("attendeeId", attendee._id))) {
        if (
          row.scope === "event_charges" &&
          row.donationId !== args.donationId
        ) {
          otherEventChargesToAttendee += row.amountMinor
        }
      }

      ceilings.set(attendeeKey, {
        attendeeId: attendeeKey,
        orderId: orderKey,
        eventChargesOutstandingMinor: Math.max(
          0,
          attributableOutstanding - otherEventChargesToAttendee
        ),
        wholeOrderOutstandingMinor,
      })
    }
  }

  return ceilings
}

/**
 * Reads the event and the donation payment, then refuses anything that is not a
 * same-event standalone donation (the exact shape `createStandaloneDonation`
 * writes). `payments.orderId` is an optional STRING for provider aliases, so it
 * is never treated as a typed order ref.
 */
async function loadDonationForAllocation(
  ctx: FinanceDbCtx,
  args: { donationId: Id<"payments">; eventId: Id<"events"> }
): Promise<Doc<"payments">> {
  const event = await ctx.db.get("events", args.eventId)
  if (!event) {
    throw new Error("Event not found")
  }

  const payment = await ctx.db.get("payments", args.donationId)
  if (!payment) {
    throwAllocationError(
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_NOT_FOUND,
      `donation ${String(args.donationId)} does not exist`
    )
  }

  if (
    payment.donationKind !== "standalone" ||
    payment.orderId !== undefined ||
    payment.status !== "donation"
  ) {
    throwAllocationError(
      DONATION_ALLOCATION_ERROR_CODES.DONATION_NOT_STANDALONE,
      `donation ${String(args.donationId)} is not a standalone donation`
    )
  }

  if (payment.eventId !== args.eventId) {
    throwAllocationError(
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_CROSS_EVENT,
      `donation ${String(args.donationId)} belongs to another event`
    )
  }

  return payment
}

/** Every recorded allocation row for a donation, read through a bounded scan. */
async function loadRecordedAllocations(
  ctx: FinanceDbCtx,
  donationId: Id<"payments">
): Promise<Doc<"donationAllocations">[]> {
  const rows: Doc<"donationAllocations">[] = []
  for await (const row of ctx.db
    .query("donationAllocations")
    .withIndex("by_donationId", (q) => q.eq("donationId", donationId))) {
    rows.push(row)
  }
  return rows
}

/**
 * A set-replace submission replaces the donation's ENTIRE allocation set, so
 * the donation has no other recorded rows on any order: its per-order capacity
 * is exactly that order's `wholeOrderOutstandingMinor`.
 */
const EMPTY_ALREADY_CLAIMED_BY_ORDER: ReadonlyMap<string, number> = new Map()

/**
 * Resolves a request into plan rows plus the single donation-scoped ceiling
 * map. The `donationId` is threaded through because it is what makes the
 * projection exclude SELF and include OTHERS.
 *
 * Manual amounts are persisted exactly as entered and returned in the
 * operator's submitted order (DON-02). Duplicate detection is left to
 * `validateAllocationPlan`. Orders are resolved server-side (the client never
 * supplies an order), and each resolved order must belong to the event.
 */
async function resolvePlanRows(
  ctx: FinanceDbCtx,
  args: {
    request: AllocationRequest
    eventId: Id<"events">
    donationId: Id<"payments">
  }
): Promise<{
  rows: DonationAllocationPlanRow[]
  orderIds: Id<"orders">[]
  ceilings: Map<string, AllocationCeiling>
}> {
  if (args.request.method !== "manual") {
    // `equal` / `largest_balance_first` are wired in plan 55-04. Until then
    // they fail closed rather than silently allocating nothing.
    throwAllocationError(
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_UNSUPPORTED_METHOD,
      args.request.method
    )
  }

  const rows: DonationAllocationPlanRow[] = []
  const orderIds: Id<"orders">[] = []
  const seenOrderIds = new Set<string>()

  for (const requested of args.request.rows) {
    const attendee = await ctx.db.get("orderAttendees", requested.attendeeId)
    if (!attendee) {
      throwAllocationError(
        DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_UNKNOWN_TARGET,
        `attendee ${String(requested.attendeeId)} does not exist`
      )
    }

    const order = await ctx.db.get("orders", attendee.orderId)
    if (!order) {
      throwAllocationError(
        DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_UNKNOWN_TARGET,
        `order ${String(attendee.orderId)} does not exist`
      )
    }

    // Refuse an order with no eventId, and any order outside this event.
    if (!order.eventId || order.eventId !== args.eventId) {
      throwAllocationError(
        DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_CROSS_EVENT,
        `attendee ${String(attendee._id)} targets an order outside this event`
      )
    }

    const orderKey = String(attendee.orderId)
    if (!seenOrderIds.has(orderKey)) {
      seenOrderIds.add(orderKey)
      orderIds.push(attendee.orderId)
    }

    rows.push({
      attendeeId: String(requested.attendeeId),
      orderId: orderKey,
      amountMinor: requested.amountMinor,
      scope: requested.scope,
    })
  }

  const ceilings = await loadAllocationCeilings(ctx, {
    donationId: args.donationId,
    orderIds,
  })

  return { rows, orderIds, ceilings }
}

/**
 * D-01 set-replace, shared by every write path (`allocateDonation` here;
 * `allocateDonationToAttendee` and `removeDonationAllocation` in later plans).
 *
 * The merge key is `attendeeId` (D-02: at most one row per donation+attendee,
 * identified through `by_donationId_and_attendeeId`). A stored row whose
 * `(amountMinor, scope, orderId)` are all UNCHANGED is left completely
 * untouched — no patch — preserving its original `createdAt`/`createdBy`.
 *
 * Deliberate asymmetry of the re-stamp rule: a CHANGED
 * `amountMinor`/`scope` on an existing row IS re-stamped (fresh
 * `createdAt`/`createdBy`, advancing `submissionId`) because D-19 mandates an
 * audit only for REMOVAL and D-17 only requires that UNTOUCHED siblings stay
 * untouched. Changing a row's TARGET (`attendeeId`/`orderId`) is unsupported:
 * allocations are removed and recreated instead, so a target change is
 * expressed as a delete + insert, never a patch.
 *
 * Uses only `ctx.db`, so N writes are one atomic Convex transaction
 * (guidelines.md:245); a throw anywhere rolls everything back.
 */
async function applyAllocationSetReplace(
  ctx: MutationCtx,
  args: {
    donation: Doc<"payments">
    eventId: Id<"events">
    rows: ReadonlyArray<DonationAllocationPlanRow>
    actor: string
    submissionId?: Id<"donationAllocationSubmissions">
  }
): Promise<void> {
  const desiredByAttendeeId = new Map<string, DonationAllocationPlanRow>()
  for (const row of args.rows) {
    desiredByAttendeeId.set(row.attendeeId, row)
  }

  const existingRows = await loadRecordedAllocations(ctx, args.donation._id)
  const existingByAttendeeId = new Map<string, Doc<"donationAllocations">>()
  for (const row of existingRows) {
    existingByAttendeeId.set(String(row.attendeeId), row)
  }

  for (const existing of existingRows) {
    if (!desiredByAttendeeId.has(String(existing.attendeeId))) {
      await ctx.db.delete("donationAllocations", existing._id)
    }
  }

  const now = Date.now()
  for (const [attendeeKey, desired] of desiredByAttendeeId) {
    const existing = existingByAttendeeId.get(attendeeKey)

    if (!existing) {
      await ctx.db.insert("donationAllocations", {
        donationId: args.donation._id,
        eventId: args.eventId,
        orderId: desired.orderId as Id<"orders">,
        attendeeId: desired.attendeeId as Id<"orderAttendees">,
        amountMinor: desired.amountMinor,
        scope: desired.scope,
        createdAt: now,
        createdBy: args.actor,
        ...(args.submissionId ? { submissionId: args.submissionId } : {}),
      })
      continue
    }

    const unchanged =
      existing.amountMinor === desired.amountMinor &&
      existing.scope === desired.scope &&
      String(existing.orderId) === desired.orderId

    if (unchanged) {
      // D-04/D-17: never silently rewrite a row whose balance moved. Plan
      // 55-04's single-row path depends on siblings keeping their provenance.
      continue
    }

    await ctx.db.patch("donationAllocations", existing._id, {
      amountMinor: desired.amountMinor,
      scope: desired.scope,
      orderId: desired.orderId as Id<"orders">,
      createdAt: now,
      createdBy: args.actor,
      ...(args.submissionId ? { submissionId: args.submissionId } : {}),
    })
  }
}

// ---------------------------------------------------------------------------
// D-21 submission ledger (retry idempotency) and the D-19 removal audit.
//
// D-15 (Convex transactional conflict) guards CONCURRENT double-spend: the
// mutation re-reads the donation's rows and the ceilings inside one
// transaction. It does NOT guard RETRY double-spend — a caller whose response
// was lost can resubmit and, without this ledger, the set-replace would simply
// run twice. The two guards are complementary and both are required.
//
//   - Every submission carries a caller-minted, opaque `idempotencyKey`. The
//     server stores `(donationId, idempotencyKey)` plus a SHA-256
//     `requestDigest` recomputed from the ACTUAL mutation arguments and the
//     FROZEN result. No handler accepts a digest, a fingerprint, a ceiling or
//     an amount total from the caller (T-55-14, mirroring CR-09 at
//     `convex/signupSubmission.ts:387-399`).
//   - Replay lookup runs through `by_donationId_and_idempotencyKey` and the
//     digest is compared IN MEMORY: an index on the digest would be dead
//     weight (schema.ts:1043-1046).
//   - A matching digest returns the STORED result and writes NOTHING. The
//     result is never recomputed from the current allocation rows, which may
//     have drifted since (exactly the contract at
//     `convex/publicTracking.ts:855-882`).
//   - A differing digest is a typed `DONATION_ALLOCATION_IDEMPOTENCY_CONFLICT`
//     — never a misleading "replayed" for a replacement that was not applied.
//   - The key is scoped per `donationId` ONLY, never per
//     `(donationId, operation)`: a key identifies ONE SUBMISSION, not one
//     operation. Reusing an `allocate` key for a `remove` on the same donation
//     is therefore an intended conflict, not a replay.
//
// LEDGER-FIRST ORDERING (load-bearing). The ledger row is inserted BEFORE the
// rows it describes and its `_id` is passed INTO the writer as
// `submissionId`, so every written allocation row and every removal-audit row
// carries provenance. Inserting it afterwards would leave `submissionId`
// undefined on every row (the schema field is optional, so nothing else would
// catch it) and silently sever the link Phase 57's reversal primitive depends
// on.
// ---------------------------------------------------------------------------

/** One frozen allocation row as the ledger's `v.id(...)` validators store it. */
type FrozenAllocationRow = {
  attendeeId: Id<"orderAttendees">
  orderId: Id<"orders">
  amountMinor: number
  scope: "event_charges" | "whole_order"
}

/** The shape every mutation in this module returns and the ledger replays. */
type FrozenAllocationResult = {
  donationId: Id<"payments">
  allocatedTotalMinor: number
  remainingMinor: number
  rows: FrozenAllocationRow[]
}

/**
 * Trims the caller-supplied key and refuses a blank one BEFORE any other work,
 * so an unusable key can never be recorded and a later retry with the same
 * (blank) key can never be mistaken for a replay. The key is opaque: trimmed
 * and compared, never parsed.
 */
function requireAllocationIdempotencyKey(raw: string): string {
  const idempotencyKey = raw.trim()
  if (idempotencyKey.length === 0) {
    throwAllocationError(
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_INVALID_KEY,
      "An idempotency key is required."
    )
  }
  return idempotencyKey
}

/** The `(donationId, idempotencyKey)` ledger lookup, bounded to one row. */
async function findSubmissionByKey(
  ctx: FinanceDbCtx,
  args: { donationId: Id<"payments">; idempotencyKey: string }
): Promise<Doc<"donationAllocationSubmissions"> | null> {
  return ctx.db
    .query("donationAllocationSubmissions")
    .withIndex("by_donationId_and_idempotencyKey", (q) =>
      q
        .eq("donationId", args.donationId)
        .eq("idempotencyKey", args.idempotencyKey)
    )
    .first()
}

/**
 * Resolves the D-21 replay contract for an already-fetched ledger row:
 *   - no row      -> `null`, the caller proceeds with a fresh submission;
 *   - digest match -> the STORED frozen result, returned verbatim;
 *   - digest differ -> the typed conflict.
 */
function resolveSubmissionReplay(
  submission: Doc<"donationAllocationSubmissions"> | null,
  requestDigest: string,
  donationId: Id<"payments">
): FrozenAllocationResult | null {
  if (!submission) {
    return null
  }

  if (submission.requestDigest !== requestDigest) {
    throwAllocationError(
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_IDEMPOTENCY_CONFLICT,
      "This idempotency key was already used for a different allocation request. Retry with a fresh key."
    )
  }

  // Return the FROZEN result. Never recompute money from the current
  // allocation rows: a ceiling, a ticket price or a payment may have moved
  // between the original submission and this retry, and a recomputed answer
  // would break the idempotent-replay contract.
  return {
    donationId,
    allocatedTotalMinor: submission.allocatedTotalMinor,
    remainingMinor: submission.remainingMinor,
    rows: submission.rows,
  }
}

/**
 * Projects plan rows onto the ledger's `v.id(...)` validators.
 *
 * These are FROZEN VALUE SNAPSHOTS, never re-resolved references: on replay the
 * stored ids are returned verbatim and are never looked up again, so a since
 * deleted attendee or order cannot re-link or invalidate a replayed result.
 * The cast is exactly that statement — the plan row's `attendeeId`/`orderId`
 * are plain strings by contract (`DonationAllocationPlanRow`), while the
 * ledger's validator declares the id types.
 */
function toLedgerRows(
  rows: ReadonlyArray<DonationAllocationPlanRow>
): FrozenAllocationRow[] {
  return rows.map((row) => ({
    attendeeId: row.attendeeId as Id<"orderAttendees">,
    orderId: row.orderId as Id<"orders">,
    amountMinor: row.amountMinor,
    scope: row.scope,
  }))
}

/**
 * The ONE frozen submission-result shape every mutation in this module
 * returns, so the idempotency ledger (plan 55-03) can store and replay it
 * verbatim.
 */
function serializeAllocationResult(
  donationId: Id<"payments">,
  donationAmountMinor: number,
  rows: ReadonlyArray<DonationAllocationPlanRow>
) {
  const remaining = deriveAllocationRemainingMinor({
    donationAmountMinor,
    recordedRows: rows,
  })

  return {
    donationId,
    allocatedTotalMinor: sumRecordedAllocationMinor(rows),
    remainingMinor: remaining.remainingMinor,
    rows,
  }
}

/**
 * Set-replace batch allocation. NOTE: this mutation must never issue a write
 * against the `payments` table (DACC-03) — the donation's payment row stays
 * event-scoped and standalone; only `donationAllocations` rows carry credit.
 *
 * Guard order is deliberate and fixed:
 *   auth -> idempotency key -> donation guards -> server digest -> replay ->
 *   read set + plan -> validate -> freeze the result -> ledger -> write rows.
 *
 * The donation guard sits BEFORE the digest so a cross-event or
 * non-standalone donation is refused regardless of the key (its digest must
 * never be recorded against a donation that cannot be allocated), and the
 * replay lookup sits BEFORE the plan so a replay returns without touching the
 * ceilings at all.
 */
export const allocateDonation = mutation({
  args: {
    donationId: v.id("payments"),
    eventId: v.id("events"),
    // D-21: REQUIRED, never optional. Every submission must be replay-safe, so
    // there is no path that writes without a ledger row.
    idempotencyKey: v.string(),
    request: allocationRequestValidator,
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    const idempotencyKey = requireAllocationIdempotencyKey(args.idempotencyKey)

    const donation = await loadDonationForAllocation(ctx, args)

    // The digest is recomputed server-side from the ACTUAL arguments. Nothing
    // in `args` can supply it, so a tampered client cannot forge a replay
    // identity (T-55-14).
    const requestDigest = await digestAllocationEnvelope({
      donationId: args.donationId,
      eventId: args.eventId,
      operation: "allocate",
      payload: args.request,
    })

    const replayed = resolveSubmissionReplay(
      await findSubmissionByKey(ctx, { donationId: args.donationId, idempotencyKey }),
      requestDigest,
      args.donationId
    )
    if (replayed) {
      return replayed
    }

    // Read the donation's existing allocations even though the set-replace
    // re-reads them, so they join THIS transaction's read set (D-15). The
    // replay early return above never skips these reads because it writes
    // nothing, so there is no OCC guard to evaporate.
    await loadRecordedAllocations(ctx, args.donationId)

    const { rows, ceilings } = await resolvePlanRows(ctx, {
      request: args.request,
      eventId: args.eventId,
      donationId: args.donationId,
    })

    // Validate BEFORE any write, so an over-allocation fails the whole
    // submission with nothing persisted (D-13). The donation-scoping lives
    // entirely in `ceilings`, so `DONATION_ALLOCATION_EXCEEDS_CEILING` now
    // fires for a row that would double-allocate an obligation another
    // donation already holds. `alreadyClaimedByOrder` is EMPTY because a
    // set-replace replaces the donation's entire set.
    validateAllocationPlan({
      availableMinor: donation.amountMinor,
      rows,
      ceilings,
      alreadyClaimedByOrder: EMPTY_ALREADY_CLAIMED_BY_ORDER,
    })

    // The frozen result is computed from the VALIDATED plan, before any write:
    // the allocated total, the remainder and the rows are all known from
    // `rows` and the donation amount, so nothing here depends on a write
    // having happened.
    const frozen = serializeAllocationResult(
      args.donationId,
      donation.amountMinor,
      rows
    )

    // LEDGER FIRST (load-bearing, see the section comment above): the writer
    // needs `submissionId` as an INPUT, so the row must exist before the
    // allocation rows it stamps are written.
    const submissionId = await ctx.db.insert("donationAllocationSubmissions", {
      donationId: args.donationId,
      idempotencyKey,
      requestDigest,
      operation: "allocate",
      actor: identity.tokenIdentifier,
      createdAt: Date.now(),
      allocatedTotalMinor: frozen.allocatedTotalMinor,
      remainingMinor: frozen.remainingMinor,
      rows: toLedgerRows(frozen.rows),
    })

    await applyAllocationSetReplace(ctx, {
      donation,
      eventId: args.eventId,
      rows,
      actor: identity.tokenIdentifier,
      submissionId,
    })

    return frozen
  },
})
