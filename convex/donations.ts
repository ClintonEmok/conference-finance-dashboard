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
  deriveAllocationRemainingMinor,
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
