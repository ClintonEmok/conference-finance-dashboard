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
  buildDistributionPlan,
  deriveAllocationReadProjection,
  deriveAllocationRemainingMinor,
  digestAllocationEnvelope,
  resolveScopeOutstandingMinor,
  sumRecordedAllocationMinor,
  throwAllocationError,
  validateAllocationPlan,
  DONATION_ALLOCATION_ERROR_CODES,
  type AllocationCeiling,
  type DonationAllocationPlanRow,
  type DonationDistributionMethod,
  type DonationDistributionPlan,
  type DonationDistributionTarget,
  type DonationDistributionTargetResult,
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
 * The operator supplies ONLY a method, its selected targets and each target's
 * scope (D-07 / T-55-19). There is deliberately NO amount field on the `equal`
 * and `largest_balance_first` branches, so a client can never submit a
 * distribution result — the server computes every distributed amount through
 * `buildDistributionPlan`. `manual` amounts are explicit operator inputs and
 * are validated as such.
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
 * Resolves one selected target's attendee to its order under the SAME rules for
 * every method: the attendee must exist (else
 * `DONATION_ALLOCATION_UNKNOWN_TARGET`) and its order must belong to THIS event
 * (else `DONATION_ALLOCATION_CROSS_EVENT`). Orders are resolved server-side —
 * the client never supplies an order — and the first time an order is seen it
 * is appended to `orderIds`, so the ceiling pass reads each order once.
 */
async function resolveTargetOrderId(
  ctx: FinanceDbCtx,
  args: {
    attendeeId: Id<"orderAttendees">
    eventId: Id<"events">
    orderIds: Id<"orders">[]
    seenOrderIds: Set<string>
  }
): Promise<Id<"orders">> {
  const attendee = await ctx.db.get("orderAttendees", args.attendeeId)
  if (!attendee) {
    throwAllocationError(
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_UNKNOWN_TARGET,
      `attendee ${String(args.attendeeId)} does not exist`
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
  if (!args.seenOrderIds.has(orderKey)) {
    args.seenOrderIds.add(orderKey)
    args.orderIds.push(attendee.orderId)
  }

  return attendee.orderId
}

/**
 * Resolves a request into plan rows plus the single donation-scoped ceiling
 * map. The `donationId` is threaded through because it is what makes the
 * projection exclude SELF and include OTHERS.
 *
 * METHOD DISPATCH (D-07 / T-55-19). The server computes every distributed
 * amount: a `manual` request's amounts are operator inputs (DON-02) returned in
 * the submitted order, while `equal` / `largest_balance_first` are computed by
 * the pure engine and exposed through `distribution`. The resolved `targets`
 * keep the operator's submitted order — that array order IS the stable
 * selection order D-09 depends on — and are never sorted. Duplicate detection
 * is left to the validator / engine, which both use the same stable codes.
 *
 * The ceilings are loaded ONCE, after every order is resolved, and the SAME map
 * is returned to the caller, so the mutation's `validateAllocationPlan` step
 * and the read-only preview query both read the identical net-of-others
 * projection (T-55-20).
 *
 * An empty plan is legitimate: every target of a distribution may be skipped,
 * and under set-replace semantics that clears the donation's allocations while
 * the remainder stays at the donation's full amount (DON-05 / D-20).
 */
async function resolvePlanRows(
  ctx: FinanceDbCtx,
  args: {
    request: AllocationRequest
    eventId: Id<"events">
    donationId: Id<"payments">
    availableMinor: number
  }
): Promise<{
  method: DonationDistributionMethod
  rows: DonationAllocationPlanRow[]
  /** The full engine output for the distribution methods; null for `manual`. */
  distribution: DonationDistributionPlan | null
  orderIds: Id<"orders">[]
  ceilings: Map<string, AllocationCeiling>
}> {
  const orderIds: Id<"orders">[] = []
  const seenOrderIds = new Set<string>()

  if (args.request.method === "manual") {
    const rows: DonationAllocationPlanRow[] = []
    for (const requested of args.request.rows) {
      const orderId = await resolveTargetOrderId(ctx, {
        attendeeId: requested.attendeeId,
        eventId: args.eventId,
        orderIds,
        seenOrderIds,
      })
      rows.push({
        attendeeId: String(requested.attendeeId),
        orderId: String(orderId),
        amountMinor: requested.amountMinor,
        scope: requested.scope,
      })
    }

    const ceilings = await loadAllocationCeilings(ctx, {
      donationId: args.donationId,
      orderIds,
    })

    return { method: "manual", rows, distribution: null, orderIds, ceilings }
  }

  // Distribution methods: resolve every selected target server-side, in the
  // operator's submitted order (never sorted).
  const targets: DonationDistributionTarget[] = []
  for (const requested of args.request.targets) {
    const orderId = await resolveTargetOrderId(ctx, {
      attendeeId: requested.attendeeId,
      eventId: args.eventId,
      orderIds,
      seenOrderIds,
    })
    targets.push({
      attendeeId: String(requested.attendeeId),
      orderId: String(orderId),
      scope: requested.scope,
    })
  }

  const ceilings = await loadAllocationCeilings(ctx, {
    donationId: args.donationId,
    orderIds,
  })

  const distribution = buildDistributionPlan({
    method: args.request.method,
    availableMinor: args.availableMinor,
    targets,
    ceilings,
  })

  return {
    method: args.request.method,
    rows: distribution.rows,
    distribution,
    orderIds,
    ceilings,
  }
}

/**
 * D-01 set-replace, shared by every set-replace write path (`allocateDonation`
 * below; `allocateDonationToAttendee` in plan 55-04). Removal is NOT a
 * set-replace: `removeDonationAllocation` hard-deletes one row and appends one
 * audit row instead (D-19).
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
 * METHOD DISPATCH: `manual` persists the operator's amounts; `equal` and
 * `largest_balance_first` are computed server-side by the pure engine from the
 * submitted targets and the server-owned ceilings (D-07), so a client never
 * supplies a distribution result.
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
      availableMinor: donation.amountMinor,
    })

    // Validate BEFORE any write, so an over-allocation fails the whole
    // submission with nothing persisted (D-13). The donation-scoping lives
    // entirely in `ceilings`, so `DONATION_ALLOCATION_EXCEEDS_CEILING` now
    // fires for a row that would double-allocate an obligation another
    // donation already holds. `alreadyClaimedByOrder` is EMPTY because a
    // set-replace replaces the donation's entire set. The engine's own output
    // is re-checked here rather than trusted: it is designed to pass (55-02),
    // and this belt-and-braces pass is what keeps preview and commit aligned.
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

/**
 * D-17 single-row additive allocation: add or replace exactly ONE allocation
 * for this `(donation, attendee)` pair, validating ONLY the submitted row.
 *
 * Why this exists. The set-replace batch re-validates the donation's ENTIRE
 * submitted set, so a sibling whose balance has since moved would force its
 * repair. D-17 says the opposite: untouched rows keep their historical amounts,
 * and allocating to attendee B must never force repair of a stale attendee A.
 *
 * The single row is bounded by THREE complementary inputs, each guarding a
 * different resource — all three must stay consistent or a legitimate edit is
 * wrongly refused (or double-counted):
 *
 *   - `availableMinor = remainingMinor + thisAttendeeCurrentRecordedAmount`.
 *     The set-replace is about to OVERWRITE this attendee's own row, so that
 *     row's recorded amount is re-added to the donation's unallocated money.
 *     This bounds the DONATION's money.
 *   - `ceilings`, loaded with this donation's id: every other donation's claim
 *     is subtracted and this donation's own rows are EXCLUDED. So the target's
 *     ceiling is its real outstanding net of OTHER donations. This bounds the
 *     ATTENDEE's obligation.
 *   - `alreadyClaimedByOrder`: this donation's OTHER recorded rows on the
 *     target's order, ANY scope, excluding the target attendee's own row. This
 *     bounds the ORDER's capacity. It is required because the projection above
 *     excludes ALL of this donation's own rows — without this term a donation
 *     already holding €200 on a €200 order could add a second row and push the
 *     order to €300 (CE-2).
 *
 * D-02 guarantees at most one row per `(donation, attendee)`, so excluding the
 * target attendee's row excludes exactly the row this submission replaces. A
 * zero or negative `amountMinor` is refused by `validateAllocationPlan` with
 * `DONATION_ALLOCATION_INVALID_AMOUNT`: clearing an allocation is
 * `removeDonationAllocation`'s job, never a zero row.
 *
 * Never issues a write against the `payments` table (DACC-03). Uses only
 * `ctx.db`, so ledger + rows are one atomic transaction; a throw rolls back.
 */
export const allocateDonationToAttendee = mutation({
  args: {
    donationId: v.id("payments"),
    eventId: v.id("events"),
    attendeeId: v.id("orderAttendees"),
    amountMinor: v.number(),
    scope: allocationScopeValidator,
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    const idempotencyKey = requireAllocationIdempotencyKey(args.idempotencyKey)

    const donation = await loadDonationForAllocation(ctx, args)

    const requestDigest = await digestAllocationEnvelope({
      donationId: args.donationId,
      eventId: args.eventId,
      operation: "allocate_one",
      payload: {
        attendeeId: args.attendeeId,
        amountMinor: args.amountMinor,
        scope: args.scope,
      },
    })

    const replayed = resolveSubmissionReplay(
      await findSubmissionByKey(ctx, {
        donationId: args.donationId,
        idempotencyKey,
      }),
      requestDigest,
      args.donationId
    )
    if (replayed) {
      return replayed
    }

    // Join the donation's rows to this transaction's read set (D-15) before
    // reading any of them below.
    const recorded = await loadRecordedAllocations(ctx, args.donationId)

    // Resolve the target's order under the same cross-event rule every method
    // uses, then load ONE ceiling pass for that single order — reused by the
    // `validateAllocationPlan` call below.
    const orderId = await resolveTargetOrderId(ctx, {
      attendeeId: args.attendeeId,
      eventId: args.eventId,
      orderIds: [],
      seenOrderIds: new Set<string>(),
    })

    const ceilings = await loadAllocationCeilings(ctx, {
      donationId: args.donationId,
      orderIds: [orderId],
    })

    const remaining = deriveAllocationRemainingMinor({
      donationAmountMinor: donation.amountMinor,
      recordedRows: recorded,
    })

    const attendeeKey = String(args.attendeeId)
    const orderKey = String(orderId)

    // The row being replaced (D-02: at most one) and this donation's OTHER
    // rows on the order, ANY scope.
    let thisAttendeeCurrentRecordedAmount = 0
    let alreadyClaimedByOrder = 0
    for (const row of recorded) {
      if (String(row.attendeeId) === attendeeKey) {
        thisAttendeeCurrentRecordedAmount += row.amountMinor
        continue
      }
      if (String(row.orderId) === orderKey) {
        alreadyClaimedByOrder += row.amountMinor
      }
    }

    const submittedRow: DonationAllocationPlanRow = {
      attendeeId: attendeeKey,
      orderId: orderKey,
      amountMinor: args.amountMinor,
      scope: args.scope,
    }

    // D-17: validate ONLY the submitted row. Sibling rows are deliberately NOT
    // validated — allocating to B must never force repair of a stale A.
    validateAllocationPlan({
      availableMinor:
        remaining.remainingMinor + thisAttendeeCurrentRecordedAmount,
      rows: [submittedRow],
      ceilings,
      alreadyClaimedByOrder: new Map([[orderKey, alreadyClaimedByOrder]]),
    })

    // The merged set is the recorded rows with this attendee's row swapped for
    // the submitted row. `applyAllocationSetReplace` leaves a sibling whose
    // `(amountMinor, scope, orderId)` are unchanged completely untouched, so
    // its original `createdAt`/`createdBy` survive (D-04/T-55-21).
    const mergedRows: DonationAllocationPlanRow[] = []
    let replaced = false
    for (const row of recorded) {
      if (String(row.attendeeId) === attendeeKey) {
        mergedRows.push(submittedRow)
        replaced = true
        continue
      }
      mergedRows.push({
        attendeeId: String(row.attendeeId),
        orderId: String(row.orderId),
        amountMinor: row.amountMinor,
        scope: row.scope,
      })
    }
    if (!replaced) {
      mergedRows.push(submittedRow)
    }

    const frozen = serializeAllocationResult(
      args.donationId,
      donation.amountMinor,
      mergedRows
    )

    // LEDGER FIRST, mirroring the batch path: the writer needs `submissionId`
    // as an INPUT, so the ledger row must exist before the rows it stamps.
    const submissionId = await ctx.db.insert("donationAllocationSubmissions", {
      donationId: args.donationId,
      idempotencyKey,
      requestDigest,
      operation: "allocate_one",
      actor: identity.tokenIdentifier,
      createdAt: Date.now(),
      allocatedTotalMinor: frozen.allocatedTotalMinor,
      remainingMinor: frozen.remainingMinor,
      rows: toLedgerRows(frozen.rows),
    })

    await applyAllocationSetReplace(ctx, {
      donation,
      eventId: args.eventId,
      rows: mergedRows,
      actor: identity.tokenIdentifier,
      submissionId,
    })

    return frozen
  },
})

/**
 * D-19 removal: a HARD delete of one allocation row plus ONE append-only
 * `donationAllocationRemovals` audit row, written in the same transaction.
 *
 * Why hard delete and not a `removedAt`/`status` soft flag: Convex has no
 * partial-unique index (RESEARCH Pitfall 4), so a soft row would keep occupying
 * the `(donationId, attendeeId)` slot and break D-02's at-most-one-row
 * invariant — a re-allocation to the same attendee would collide with the
 * tombstone. The audit row preserves the operator's action instead, and gives
 * Phase 57 an exact reversal primitive.
 *
 * NOTHING is clamped, re-spent or redistributed automatically (D-03): the freed
 * amount simply returns to the donation's DERIVED remainder.
 *
 * This path is deliberately NOT ceiling-bounded — the freed amount can never
 * exceed the recorded amount, so there is no ceiling to load and no ceiling to
 * over-run. Removal never writes to the `payments` table (DACC-03).
 */
export const removeDonationAllocation = mutation({
  args: {
    donationId: v.id("payments"),
    eventId: v.id("events"),
    attendeeId: v.id("orderAttendees"),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)

    const idempotencyKey = requireAllocationIdempotencyKey(args.idempotencyKey)

    const donation = await loadDonationForAllocation(ctx, args)

    const requestDigest = await digestAllocationEnvelope({
      donationId: args.donationId,
      eventId: args.eventId,
      operation: "remove",
      payload: { attendeeId: args.attendeeId },
    })

    // The key is scoped per donation and NOT per operation, so reusing an
    // `allocate` key here is an intended conflict: a key identifies ONE
    // submission, and a digest mismatch means this is not the submission the
    // key was minted for.
    const replayed = resolveSubmissionReplay(
      await findSubmissionByKey(ctx, {
        donationId: args.donationId,
        idempotencyKey,
      }),
      requestDigest,
      args.donationId
    )
    if (replayed) {
      return replayed
    }

    // Join the donation's rows to this transaction's read set (D-15) before
    // touching the target row.
    const recorded = await loadRecordedAllocations(ctx, args.donationId)

    // D-02 identity: at most one row per (donation, attendee).
    const row = await ctx.db
      .query("donationAllocations")
      .withIndex("by_donationId_and_attendeeId", (q) =>
        q
          .eq("donationId", args.donationId)
          .eq("attendeeId", args.attendeeId)
      )
      .first()

    if (!row) {
      throwAllocationError(
        DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_NOT_FOUND,
        `No allocation exists for this attendee on this donation.`
      )
    }

    // The post-removal state is computed BEFORE the delete, from the rows
    // already in hand. The surviving rows keep their recorded amounts and their
    // provenance: a removal never re-stamps a sibling (D-17).
    const frozenRows: FrozenAllocationRow[] = recorded
      .filter((existing) => existing._id !== row._id)
      .map((existing) => ({
        attendeeId: existing.attendeeId,
        orderId: existing.orderId,
        amountMinor: existing.amountMinor,
        scope: existing.scope,
      }))

    const allocatedTotalMinor = sumRecordedAllocationMinor(frozenRows)
    const remainingMinor = deriveAllocationRemainingMinor({
      donationAmountMinor: donation.amountMinor,
      recordedRows: frozenRows,
    }).remainingMinor

    // LEDGER FIRST, exactly as the batch path: the audit row below needs
    // `submissionId` as an INPUT.
    const submissionId = await ctx.db.insert("donationAllocationSubmissions", {
      donationId: args.donationId,
      idempotencyKey,
      requestDigest,
      operation: "remove",
      actor: identity.tokenIdentifier,
      createdAt: Date.now(),
      allocatedTotalMinor,
      remainingMinor,
      rows: frozenRows,
    })

    await ctx.db.delete("donationAllocations", row._id)

    // T-55-15: a deletion with no trace is repudiation. One immutable row
    // records donation, attendee, order, amount, scope, actor and timestamp.
    await ctx.db.insert("donationAllocationRemovals", {
      donationId: args.donationId,
      eventId: args.eventId,
      orderId: row.orderId,
      attendeeId: args.attendeeId,
      amountMinor: row.amountMinor,
      scope: row.scope,
      actor: identity.tokenIdentifier,
      removedAt: Date.now(),
      submissionId,
    })

    return {
      donationId: args.donationId,
      allocatedTotalMinor,
      remainingMinor,
      rows: frozenRows,
    }
  },
})

/**
 * The Phase 55 read projection (D-16/D-18), server-owned so Phase 56's canonical
 * math and Phase 58's UI consume ONE staleness authority instead of each
 * re-deriving it.
 *
 * It owns three locked behaviours:
 *
 *   1. The donation-level remainder is derived from RECORDED amounts, never
 *      from APPLIED ones — so a stale row never frees budget and the same
 *      donation can never be spent twice (RESEARCH Pitfall 3, T-55-16).
 *   2. A stored allocation whose ceiling has since dropped KEEPS its recorded
 *      `amountMinor`; only `appliedMinor` is capped at
 *      `min(amountMinor, ceiling)` and the excess is reported. Nothing is
 *      silently rewritten (D-16/D-04).
 *   3. `appliedMinor` / `unappliedMinor` / `exceedsCeiling` /
 *      `exceedsCapacity` / `effectiveCapacityMinor` ARE the staleness signal
 *      Phase 56 and Phase 58 read (D-18). No consumer re-derives them.
 *
 * The ceilings are DONATION-SCOPED, exactly as the writer's are: this donation's
 * own rows are excluded and OTHER donations' claims are subtracted. So a row
 * reports fully applied only against the obligation left after every other
 * donation's claim, and a competing donation's claim surfaces here as
 * `unappliedMinor` / `exceedsCeiling` rather than being invisible.
 *
 * The per-row figure is a SCOPE-CEILING staleness signal, NOT the authoritative
 * economic figure for an attendee: Phase 56 owns per-attendee application,
 * including the `whole_order` order-pool distribution. No consumer may present
 * `appliedMinor` as a canonical attendee balance.
 *
 * FAILS SAFE where the writer fails closed: a row with no ceiling (dangling
 * attendee/order) reports `scopeOutstandingMinor = 0` (fully unapplied) instead
 * of throwing, so one orphan row never breaks the donations list.
 *
 * No argument lets a caller supply a ceiling, an applied amount or a remaining
 * balance.
 */
export const getDonationAllocationSummary = query({
  args: { donationId: v.id("payments") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const donation = await ctx.db.get("payments", args.donationId)
    if (!donation) {
      throw new Error("Donation not found")
    }

    const rows = await loadRecordedAllocations(ctx, args.donationId)

    const orderIds: Id<"orders">[] = []
    const seenOrderKeys = new Set<string>()
    for (const row of rows) {
      const orderKey = String(row.orderId)
      if (!seenOrderKeys.has(orderKey)) {
        seenOrderKeys.add(orderKey)
        orderIds.push(row.orderId)
      }
    }

    // The SAME donation-scoped projection the writer uses, so the read and the
    // write can never disagree about what fits.
    const ceilings = await loadAllocationCeilings(ctx, {
      donationId: args.donationId,
      orderIds,
    })

    // `deriveAllocationReadProjection` maps its input array 1:1, so `rows` and
    // `projection` stay index-aligned.
    const projection = deriveAllocationReadProjection({
      rows: rows.map((row) => ({
        attendeeId: String(row.attendeeId),
        orderId: String(row.orderId),
        amountMinor: row.amountMinor,
        scope: row.scope,
      })),
      ceilings,
    })

    const { donationAmountMinor, recordedAllocatedMinor, remainingMinor } =
      deriveAllocationRemainingMinor({
        donationAmountMinor: donation.amountMinor,
        recordedRows: rows,
      })

    return {
      donationId: args.donationId,
      eventId: donation.eventId ?? null,
      donationAmountMinor,
      recordedAllocatedMinor,
      remainingMinor,
      rows: projection.map((row, index) => ({
        ...row,
        createdAt: rows[index].createdAt,
        createdBy: rows[index].createdBy,
      })),
    }
  },
})
