/**
 * Pure allocation-aware donation attribution (Phase 56, DACC-01 / DACC-02).
 *
 * THE ONE derivation of canonical per-attendee paid / outstanding that also
 * knows about the Phase 55 allocation credit layer. `convex/finance.ts`
 * composes it and every consumer (order ledger, attendee detail, allocation
 * board, reconciliation, reporting) reads the result — no consumer recomputes
 * money.
 *
 * ---------------------------------------------------------------------------
 * SCOPE DETERMINES ATTRIBUTION (D-01) — the entire reason this module exists
 * ---------------------------------------------------------------------------
 * `donationAllocations.scope` decides how a credit is attributed, before any
 * distribution happens:
 *   - `event_charges` -> attendee-targeted: it belongs to the named attendee's
 *     own charges.
 *   - `whole_order`   -> order-level: it belongs to the ORDER and distributes
 *     across the order exactly like a real payment. The named attendee records
 *     operator intent, not exclusive attribution.
 *
 * The defect this module exists to prevent is precise: `paidTotalMinor` must
 * NEVER be inflated with allocation credit before the due-weight spread.
 * `deriveAllocationPaymentBreakdowns` spreads an order's `paidTotalMinor`
 * across EVERY attendee by due weight, so folding a donation in first would
 * spread it across attendees the operator never selected — the named
 * individual is under-credited and DON-01/04/07 targeting is silently
 * destroyed. The order total reconciles under both models; the defect is in
 * attribution, not in the total.
 *
 * ---------------------------------------------------------------------------
 * THE DERIVATION (D-02), in order
 * ---------------------------------------------------------------------------
 *   1. `T_a` = Σ `event_charges` allocations to attendee *a*, each capped at
 *      *a*'s ATTRIBUTABLE outstanding (`due_a − paymentShare_a`, and
 *      `paymentShare_a` is the payment-only due-weighted share from
 *      `deriveAllocationPaymentBreakdowns`). Excess is reported, never
 *      silently absorbed (Phase 55 D-04/D-16).
 *   2. Order pool = Σ applied REAL payments to the order + Σ `whole_order`
 *      allocations to the order.
 *   3. Distribute the order pool across attendees by REMAINING attributable
 *      outstanding (`due_a − T_a`) through `allocateMinorAmountByWeight` — the
 *      ONE largest-remainder convention, never a second weighting rule.
 *   4. Per-attendee paid = `T_a` + their share of the order pool; order paid =
 *      Σ per-attendee paid. `Σ attendee outstanding ≡ order outstanding`
 *      therefore holds UNCONDITIONALLY.
 *
 * With no allocation rows at all the derivation DELEGATES to
 * `deriveAllocationPaymentBreakdowns` (D-10): the no-allocation path IS the
 * old function, so existing orders and attendee payment states cannot shift.
 *
 * The delegation branch keeps the order-level paid figure at the normalized
 * applied payment total even when every due weight is zero. That carve-out is
 * load-bearing: `deriveAllocationPaymentBreakdowns` allocates nothing across
 * zero weights, so an order with no attributable charges but real applied
 * payments must still report its payment total (never 0) or `getPaymentSummary
 * .totalPaid`, the reconciliation row and `deriveBalanceAmounts`' overpayment
 * class would all shift. The general path applies the same rule as its
 * all-zero-weight branch.
 *
 * ---------------------------------------------------------------------------
 * REPORTED, NEVER ABSORBED (Phase 55 D-04/D-16)
 * ---------------------------------------------------------------------------
 *   - `unappliedTargetedCreditMinor` (per attendee): an `event_charges` row
 *     above its target's attributable outstanding applies only the cap; the
 *     difference is reported here.
 *   - `unattributedTargetedCreditMinor` (order level): an `event_charges` row
 *     naming an attendee ABSENT from the due map is not dropped silently — its
 *     full amount is reported here (mirroring the
 *     `deriveAllocationReadProjection` dangling-row contract) and it fabricates
 *     no attendee row.
 * A `whole_order` row joins the order pool even when the attendee it names is
 * absent from the due map, because D-01 attributes it to the ORDER.
 *
 * ---------------------------------------------------------------------------
 * THE TWO SCOPES MEAN DIFFERENT THINGS (D-05)
 * ---------------------------------------------------------------------------
 * Phase 55's largest-balance-first still RANKS by the attendee's own
 * outstanding, so ordering stays meaningful on a multi-attendee order — even
 * though a `whole_order` credit is attributed at order level. Ranking basis ≠
 * attribution basis for `whole_order`; this module must not contradict it.
 *
 * ---------------------------------------------------------------------------
 * THE AGGREGATE BOUND (D-12) — ONE order-capacity rule, all three terms
 * ---------------------------------------------------------------------------
 * The reason the pool can never exceed the remaining need is Phase 55's ONE
 * order-capacity rule, with all three terms named and none omitted:
 *
 *   capacity(O, D) = orderOutstanding(O)
 *                  − Σ other donations' allocations to O (ANY scope)
 *                  − Σ D's own other recorded rows on O   (ANY scope; excludes
 *                    only the row(s) that submission replaces)
 *   Σ (this submission's rows for O, ANY scope) ≤ capacity(O, D)
 *
 * so that no allocation — from this or any other donation — can push an
 * order's total allocated amount above its outstanding. The other-donations
 * subtraction is only term one; the other two live in `validateAllocationPlan`.
 * Do NOT restate the earlier, falsified claim that the other-donations
 * subtraction alone bounds the aggregate. Do NOT assert
 * `wholeOrderOutstandingMinor >= eventChargesOutstandingMinor` as a universal
 * invariant: that holds only when no other donation holds a claim on the
 * order, and with a competing claim the two ceilings may legitimately cross.
 *
 * D-11: `orders.totalAmountMinor` is a provider/write-time total and is NEVER
 * an outstanding base — this module never receives it.
 *
 * ---------------------------------------------------------------------------
 * BOUNDARIES
 * ---------------------------------------------------------------------------
 * This module never computes or returns an overpayment/donation figure:
 * `deriveBalanceAmounts` remains the ONE owner of `donationAmountMinor`, and a
 * second owner is exactly how double-counting starts. It also never reads the
 * database, never inspects `orders.status`, and never formats display values.
 * Phase 55's per-row `appliedMinor` / `unappliedMinor` is a scope-ceiling
 * STALENESS signal, NOT this figure — this module is the authoritative
 * per-attendee economic figure Phase 56 owns, and no consumer may present the
 * Phase-55 per-row number as the canonical attendee balance.
 *
 * `convex/finance.ts` bundles this file and the Convex bundler resolves
 * relative paths only, so it imports exactly `./amounts` and
 * `./allocation-payment-state` — no path alias, no React, no database.
 */

import {
  deriveAllocationPaymentBreakdowns,
  deriveAllocationPaymentState,
  type AllocationPaymentState,
} from "./allocation-payment-state"
import { allocateMinorAmountByWeight } from "./amounts"

/** The recorded attribution scope of one allocation credit row (D-01). */
export type DonationAttributionScope = "event_charges" | "whole_order"

/** One recorded allocation credit row, as the caller reads it from Convex. */
export type DonationAttributionCreditRow = {
  attendeeId: string
  amountMinor: number
  scope: DonationAttributionScope
}

export type DonationAttributionInput = {
  amountDueByAttendeeId: ReadonlyMap<string, number>
  /** The `isOrderAppliedPayment` total — payment-only, never allocation credit. */
  appliedPaymentsMinor: number | null | undefined
  allocationRows: ReadonlyArray<DonationAttributionCreditRow>
}

/** One attendee's canonical attribution row. */
export type DonationAttributionAttendeeRow = {
  attendeeId: string
  amountDueMinor: number
  /** The payment-only due-weighted share; the cap base for targeted credit. */
  paymentShareMinor: number
  /** `event_charges` credit actually applied to this attendee (capped). */
  targetedCreditMinor: number
  /** `event_charges` credit above the cap — reported, never absorbed. */
  unappliedTargetedCreditMinor: number
  /** This attendee's share of the order pool (payments + `whole_order`). */
  poolShareMinor: number
  paidAmountMinor: number
  outstandingAmountMinor: number
  paymentState: AllocationPaymentState
}

export type DonationAttribution = {
  byAttendeeId: Map<string, DonationAttributionAttendeeRow>
  totalDueMinor: number
  /**
   * The normalized payment-only base, echoed back on every result. Plan 56-03's
   * `loadCanonicalOrderBalances` consumes this field as its order-level
   * applied-payment figure, so it must stay exactly the `isOrderAppliedPayment`
   * total — never inflated with `wholeOrderCreditMinor` or targeted credit.
   */
  appliedPaymentsMinor: number
  targetedCreditMinor: number
  wholeOrderCreditMinor: number
  orderPoolMinor: number
  unattributedTargetedCreditMinor: number
  orderPaidAmountMinor: number
  orderOutstandingAmountMinor: number
}

/** The exact `normalizeMinorAmount` idiom used across the finance domain. */
function normalizeMinorAmount(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0
}

/**
 * Derives the canonical, allocation-aware per-attendee paid / outstanding for
 * one order, plus the order-level totals. Pure and deterministic: repeated
 * calls with identical input return deeply equal results (D-09).
 */
export function deriveDonationAttribution(
  input: DonationAttributionInput
): DonationAttribution {
  const appliedPaymentsMinor = normalizeMinorAmount(input.appliedPaymentsMinor)

  // ONE pass over the due map; its insertion order is preserved throughout
  // because `allocateMinorAmountByWeight` tie-breaks the leftover minor unit by
  // the index of the weight array, and that must match the order
  // `deriveAllocationPaymentBreakdowns` builds its own weights in.
  const dueEntries = [...input.amountDueByAttendeeId.entries()].map(
    ([attendeeId, dueMinor]) => ({
      attendeeId: String(attendeeId),
      amountDueMinor: normalizeMinorAmount(dueMinor),
    })
  )

  const totalDueMinor = dueEntries.reduce(
    (sum, entry) => sum + entry.amountDueMinor,
    0
  )

  // `paymentShare_a` is the payment-only attributable share. It is BOTH the cap
  // base for `T_a` (D-11: attributableOutstanding_A = due_A − paymentShare_A)
  // and the thing the delegation branch mirrors. Never a second weighting rule.
  const paymentBreakdowns = deriveAllocationPaymentBreakdowns({
    amountDueByAttendeeId: input.amountDueByAttendeeId,
    paidTotalMinor: appliedPaymentsMinor,
  })

  // --- No-allocation delegation (D-10) -------------------------------------
  // The no-allocation path IS today's function. Nothing is reimplemented, so
  // existing orders cannot shift.
  if (input.allocationRows.length === 0) {
    const byAttendeeId = new Map<string, DonationAttributionAttendeeRow>()

    for (const entry of dueEntries) {
      const breakdown = paymentBreakdowns.get(entry.attendeeId)
      const paidAmountMinor = breakdown?.paidAmountMinor ?? 0

      byAttendeeId.set(entry.attendeeId, {
        attendeeId: entry.attendeeId,
        amountDueMinor: entry.amountDueMinor,
        paymentShareMinor: paidAmountMinor,
        targetedCreditMinor: 0,
        unappliedTargetedCreditMinor: 0,
        poolShareMinor: paidAmountMinor,
        paidAmountMinor,
        outstandingAmountMinor: Math.max(
          0,
          entry.amountDueMinor - paidAmountMinor
        ),
        paymentState:
          breakdown?.paymentState ??
          deriveAllocationPaymentState(entry.amountDueMinor, paidAmountMinor),
      })
    }

    return {
      byAttendeeId,
      totalDueMinor,
      appliedPaymentsMinor,
      targetedCreditMinor: 0,
      wholeOrderCreditMinor: 0,
      orderPoolMinor: appliedPaymentsMinor,
      unattributedTargetedCreditMinor: 0,
      orderPaidAmountMinor: appliedPaymentsMinor,
      orderOutstandingAmountMinor: Math.max(
        0,
        totalDueMinor - appliedPaymentsMinor
      ),
    }
  }

  // --- General path (D-02) --------------------------------------------------

  // Step 2: aggregate `event_charges` credit per attendee; report rows whose
  // named attendee is absent from the due map instead of dropping them. A
  // `whole_order` row is attendee-agnostic and is summed before that check.
  const dueAttendeeIds = new Set(dueEntries.map((entry) => entry.attendeeId))
  const rawTargetedByAttendeeId = new Map<string, number>()
  let wholeOrderCreditMinor = 0
  let unattributedTargetedCreditMinor = 0

  for (const row of input.allocationRows) {
    const amountMinor = normalizeMinorAmount(row.amountMinor)

    if (row.scope === "whole_order") {
      wholeOrderCreditMinor += amountMinor
      continue
    }

    const attendeeId = String(row.attendeeId)
    if (!dueAttendeeIds.has(attendeeId)) {
      unattributedTargetedCreditMinor += amountMinor
      continue
    }

    rawTargetedByAttendeeId.set(
      attendeeId,
      (rawTargetedByAttendeeId.get(attendeeId) ?? 0) + amountMinor
    )
  }

  // Steps 3 and 6: cap every targeted credit at its attendee's attributable
  // outstanding, and build the order-pool weights from the REMAINING
  // outstanding (`due_a − T_a`) — never `due_a`, never `due_a − paymentShare_a`.
  const targetedCreditByAttendeeId = new Map<string, number>()
  const unappliedByAttendeeId = new Map<string, number>()
  const weights: Array<{ id: string; weightMinor: number }> = []
  let targetedCreditMinor = 0
  let hasPositiveWeight = false

  for (const entry of dueEntries) {
    const paymentShareMinor =
      paymentBreakdowns.get(entry.attendeeId)?.paidAmountMinor ?? 0
    const rawTargeted =
      rawTargetedByAttendeeId.get(entry.attendeeId) ?? 0
    const attributableOutstandingMinor = Math.max(
      0,
      entry.amountDueMinor - paymentShareMinor
    )
    const targeted = Math.min(rawTargeted, attributableOutstandingMinor)
    const weightMinor = Math.max(0, entry.amountDueMinor - targeted)

    targetedCreditByAttendeeId.set(entry.attendeeId, targeted)
    unappliedByAttendeeId.set(entry.attendeeId, rawTargeted - targeted)
    targetedCreditMinor += targeted

    if (weightMinor > 0) {
      hasPositiveWeight = true
    }

    weights.push({ id: entry.attendeeId, weightMinor })
  }

  // Steps 4 and 5: the order pool is applied REAL payments plus every
  // `whole_order` credit, attendee-agnostic.
  const orderPoolMinor = appliedPaymentsMinor + wholeOrderCreditMinor

  // Step 6: distribute the pool by remaining attributable outstanding.
  const poolShareByAttendeeId = allocateMinorAmountByWeight(
    orderPoolMinor,
    weights
  )

  // Step 7: per-attendee paid = targeted credit + pool share.
  const byAttendeeId = new Map<string, DonationAttributionAttendeeRow>()
  let summedPaidAmountMinor = 0

  for (const entry of dueEntries) {
    const targetedCredit = targetedCreditByAttendeeId.get(entry.attendeeId) ?? 0
    const paymentShareMinor =
      paymentBreakdowns.get(entry.attendeeId)?.paidAmountMinor ?? 0
    const poolShareMinor = poolShareByAttendeeId.get(entry.attendeeId) ?? 0
    const paidAmountMinor = targetedCredit + poolShareMinor

    summedPaidAmountMinor += paidAmountMinor

    byAttendeeId.set(entry.attendeeId, {
      attendeeId: entry.attendeeId,
      amountDueMinor: entry.amountDueMinor,
      paymentShareMinor,
      targetedCreditMinor: targetedCredit,
      unappliedTargetedCreditMinor:
        unappliedByAttendeeId.get(entry.attendeeId) ?? 0,
      poolShareMinor,
      paidAmountMinor,
      outstandingAmountMinor: Math.max(
        0,
        entry.amountDueMinor - paidAmountMinor
      ),
      paymentState: deriveAllocationPaymentState(
        entry.amountDueMinor,
        paidAmountMinor
      ),
    })
  }

  // Step 8: the order-level paid figure. The Phase 55 capacity bound keeps the
  // pool inside the remaining need, so in the normal case (at least one weight
  // is positive) no attendee clamps and the Σ consumes the whole pool. When
  // EVERY weight is 0 — the order has no attributable charges anywhere — the
  // per-attendee shares are all 0 by construction and the order-level paid
  // figure must not vanish: report the applied payment total plus any
  // `whole_order` credit, exactly as the delegation branch does when there is
  // no whole-order credit. That order class is reported at the order level and
  // never silently erased.
  const orderPaidAmountMinor = hasPositiveWeight
    ? summedPaidAmountMinor
    : appliedPaymentsMinor + wholeOrderCreditMinor

  return {
    byAttendeeId,
    totalDueMinor,
    appliedPaymentsMinor,
    targetedCreditMinor,
    wholeOrderCreditMinor,
    orderPoolMinor,
    unattributedTargetedCreditMinor,
    orderPaidAmountMinor,
    orderOutstandingAmountMinor: Math.max(
      0,
      totalDueMinor - orderPaidAmountMinor
    ),
  }
}
