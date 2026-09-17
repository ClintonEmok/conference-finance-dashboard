/**
 * Pure event donation-income composition (Phase 56, DACC-02 second half).
 *
 * OWNER OF ONE FIGURE: the event-level donation income, defined as the
 * UNALLOCATED REMAINDER of each standalone donation (D-08). This module is the
 * only place that composes it, and it owns no money rule of its own beyond
 * the one Phase 55 already ships: every row's remainder comes from
 * `deriveAllocationRemainingMinor` (`./donation-allocation`) — the writer's own
 * ranked derivation — never from a local `amount − allocated` subtraction. A
 * second remainder rule is exactly the divergence this phase forbids.
 *
 * THE NO-DOUBLE-COUNT RULE, stated once:
 *   - a donation of X with Y allocated contributes Y ONCE to its target
 *     attendee/order (through the canonical attribution owner), and
 *   - X − Y ONCE here as event donation income.
 *   Never X to both, never Y in both figures. `totals.unallocatedRemainderMinor`
 *   below IS the event donation-income figure.
 *
 * THE IDENTITY: `totals.donationsMinor === totals.allocatedMinor +
 * totals.unallocatedRemainderMinor` holds exactly for every writer-validated
 * donation, because `validateAllocationPlan` bounds each donation's recorded
 * rows by the donation's own `availableMinor` (Phase 55), so the derivation's
 * `max(0, …)` clamp never bites. No fudge and no second clamp is added here.
 * For a degenerate, writer-unreachable over-recorded input the remainder
 * clamps to zero and the recorded sum is reported as-is (the D-16
 * reported-not-absorbed shape) — the excess stays visible rather than being
 * silently folded into the donation amount.
 *
 * DISJOINT CLASS — `deriveBalanceAmounts().donationAmountMinor`: that figure is
 * the ORDER-OVERPAYMENT class. A standalone donation has no `orderId`, so
 * `isOrderAppliedPayment` excludes it and it can never surface there; and the
 * Phase 55 order-capacity bound keeps allocation credit inside the order's own
 * outstanding, so credit can never manufacture an overpayment either. The two
 * figures are SEPARATE CLASSES: nothing may sum them, and no consumer may treat
 * one as part of the other.
 *
 * Row order follows the input order; no sorting happens here (the caller owns
 * presentation order). The module reads no database and imports only the ONE
 * Phase 55 derivation, so it stays bundleable by the Convex runtime.
 */

import { deriveAllocationRemainingMinor } from "./donation-allocation"

/** One standalone donation as this composition consumes it. */
export type DonationIncomeInputRow = {
  donationId: string
  amountMinor: number
  /**
   * The RECORDED `donationAllocations` rows of this donation. Only
   * `amountMinor` is read; the caller supplies the rows it already loaded, so
   * no consumer re-reads allocation rows to compute a remainder.
   */
  recordedAllocations: ReadonlyArray<{ amountMinor: number }>
}

/** One donation's composition, as returned to a caller. */
export type DonationIncomeRow = {
  donationId: string
  /** The donation's face value, normalized (never negative). */
  donationAmountMinor: number
  /** Σ recorded allocation rows — counted ONCE against the attendee side. */
  allocatedMinor: number
  /** The event donation income of this donation — counted ONCE here. */
  unallocatedRemainderMinor: number
  allocationCount: number
}

/** The event-level composition plus its totals. */
export type DonationIncomeBreakdown = {
  rows: DonationIncomeRow[]
  totals: {
    donationCount: number
    donationsMinor: number
    allocatedMinor: number
    unallocatedRemainderMinor: number
  }
}

/**
 * Derives each donation's allocated/unallocated composition and the event
 * totals. Every remainder is the Phase 55 derivation's own `remainingMinor`;
 * this function never computes `amount − allocated` itself.
 */
export function deriveEventDonationIncome(input: {
  donations: ReadonlyArray<DonationIncomeInputRow>
}): DonationIncomeBreakdown {
  const rows: DonationIncomeRow[] = []
  let donationsMinor = 0
  let allocatedMinor = 0
  let unallocatedRemainderMinor = 0

  for (const donation of input.donations) {
    const { donationAmountMinor, recordedAllocatedMinor, remainingMinor } =
      deriveAllocationRemainingMinor({
        donationAmountMinor: donation.amountMinor,
        recordedRows: donation.recordedAllocations,
      })

    rows.push({
      donationId: donation.donationId,
      donationAmountMinor,
      allocatedMinor: recordedAllocatedMinor,
      unallocatedRemainderMinor: remainingMinor,
      allocationCount: donation.recordedAllocations.length,
    })

    donationsMinor += donationAmountMinor
    allocatedMinor += recordedAllocatedMinor
    unallocatedRemainderMinor += remainingMinor
  }

  return {
    rows,
    totals: {
      donationCount: rows.length,
      donationsMinor,
      allocatedMinor,
      unallocatedRemainderMinor,
    },
  }
}
