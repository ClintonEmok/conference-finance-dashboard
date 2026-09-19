/**
 * Phase 56 allocation-aware attribution matrix (DACC-01 / DACC-02, D-03, D-10).
 *
 * This suite exists to catch two regressions:
 *   1. a blanket targeted-first rule folding `whole_order` credit into the
 *      attendee it names instead of the order pool — caught by the D-03
 *      forcing example (case 1, where A can reach 120 only if the credit joins
 *      the pool) and by the whole_order matrix case (2b, which the broken rule
 *      reports as A 75 / B 0 instead of A 38 / B 37), and
 *   2. folding allocation credit into the payment base before the due-weight
 *      spread, which spreads a donation across attendees the operator never
 *      selected — caught by the part-payment worked example (2c, where the
 *      fold reports A 63 / B 62 instead of A 85 / B 40).
 *
 * Attendee figures are asserted individually in every case: order totals
 * reconcile under BOTH the correct and the broken model, so a totals-only
 * assertion would pass on the broken one.
 */

import { describe, expect, it } from "vitest"

import { deriveAllocationPaymentBreakdowns } from "@/lib/domain/finance/allocation-payment-state"
import { deriveBalanceAmounts } from "@/lib/domain/finance/amounts"
import {
  deriveDonationAttribution,
  type DonationAttribution,
  type DonationAttributionAttendeeRow,
  type DonationAttributionCreditRow,
} from "@/lib/domain/finance/donation-attribution"

type Fixture = {
  name: string
  due: Array<[string, number]>
  applied: number | null | undefined
  credits: DonationAttributionCreditRow[]
}

function dueMap(entries: Array<[string, number]>): Map<string, number> {
  return new Map(entries)
}

function normalize(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0
}

function derive(fixture: Fixture): DonationAttribution {
  return deriveDonationAttribution({
    amountDueByAttendeeId: dueMap(fixture.due),
    appliedPaymentsMinor: fixture.applied,
    allocationRows: fixture.credits,
  })
}

function attendeeRow(
  result: DonationAttribution,
  attendeeId: string
): DonationAttributionAttendeeRow {
  const row = result.byAttendeeId.get(attendeeId)
  if (!row) {
    throw new Error(`expected an attendee row for ${attendeeId}`)
  }
  return row
}

function totalsOf(result: DonationAttribution) {
  return {
    totalDueMinor: result.totalDueMinor,
    appliedPaymentsMinor: result.appliedPaymentsMinor,
    targetedCreditMinor: result.targetedCreditMinor,
    wholeOrderCreditMinor: result.wholeOrderCreditMinor,
    orderPoolMinor: result.orderPoolMinor,
    unattributedTargetedCreditMinor: result.unattributedTargetedCreditMinor,
    orderPaidAmountMinor: result.orderPaidAmountMinor,
    orderOutstandingAmountMinor: result.orderOutstandingAmountMinor,
  }
}

function expectNoDonationInflation(result: DonationAttribution) {
  // The Phase 55 three-term capacity bound keeps `Σ allocation rows on an
  // order <= orderOutstanding`, so allocation credit can never manufacture the
  // overpayment class `deriveBalanceAmounts` owns.
  const withCredit = deriveBalanceAmounts(
    result.totalDueMinor,
    result.orderPaidAmountMinor
  ).donationAmountMinor
  const paymentOnly = deriveBalanceAmounts(
    result.totalDueMinor,
    result.appliedPaymentsMinor
  ).donationAmountMinor

  expect(withCredit).toBe(paymentOnly)
}

// ---------------------------------------------------------------------------
// The no-allocation byte-identity fixtures (D-10)
// ---------------------------------------------------------------------------

const ZERO_DUE_ZERO_PAID: Fixture = {
  name: "zero due everywhere with zero paid",
  due: [
    ["a", 0],
    ["b", 0],
  ],
  applied: null,
  credits: [],
}

const SINGLE_ATTENDEE: Fixture = {
  name: "single attendee",
  due: [["solo", 1000]],
  applied: 400,
  credits: [],
}

const THREE_WAY_ROUNDING: Fixture = {
  name: "three attendees with a largest-remainder split",
  due: [
    ["a", 100],
    ["b", 100],
    ["c", 100],
  ],
  applied: 100,
  credits: [],
}

const OVERPAID_ORDER: Fixture = {
  name: "overpaid order (paid above due)",
  due: [
    ["a", 100],
    ["b", 300],
  ],
  applied: 1000,
  credits: [],
}

const ZERO_PAID_ORDER: Fixture = {
  name: "zero-paid order",
  due: [
    ["a", 250],
    ["b", 750],
  ],
  applied: 0,
  credits: [],
}

const ZERO_DUE_ATTENDEE: Fixture = {
  name: "one zero-due attendee alongside a positive-due attendee",
  due: [
    ["free", 0],
    ["paying", 2000],
  ],
  applied: 800,
  credits: [],
}

const ZERO_CHARGES_WITH_PAYMENTS: Fixture = {
  name: "zero attributable charges with real applied payments",
  due: [
    ["a", 0],
    ["b", 0],
  ],
  applied: 150,
  credits: [],
}

const NO_ALLOCATION_FIXTURES: Fixture[] = [
  ZERO_DUE_ZERO_PAID,
  SINGLE_ATTENDEE,
  THREE_WAY_ROUNDING,
  OVERPAID_ORDER,
  ZERO_PAID_ORDER,
  ZERO_DUE_ATTENDEE,
  ZERO_CHARGES_WITH_PAYMENTS,
]

// ---------------------------------------------------------------------------
// The allocation-bearing fixtures
// ---------------------------------------------------------------------------

const FORCING_EXAMPLE: Fixture = {
  name: "D-03 forcing example",
  due: [
    ["a", 120],
    ["b", 80],
  ],
  applied: 100,
  credits: [{ attendeeId: "b", amountMinor: 100, scope: "whole_order" }],
}

const TARGETED_CREDIT: Fixture = {
  name: "event_charges credit for A on an unpaid 100/100 order",
  due: [
    ["a", 100],
    ["b", 100],
  ],
  applied: 0,
  credits: [{ attendeeId: "a", amountMinor: 75, scope: "event_charges" }],
}

const WHOLE_ORDER_CREDIT: Fixture = {
  name: "whole_order credit naming A on an unpaid 100/100 order",
  due: [
    ["a", 100],
    ["b", 100],
  ],
  applied: 0,
  credits: [{ attendeeId: "a", amountMinor: 75, scope: "whole_order" }],
}

const PART_PAYMENT_WORKED_EXAMPLE: Fixture = {
  name: "55-CONTEXT part-payment worked example",
  due: [
    ["a", 100],
    ["b", 100],
  ],
  applied: 50,
  credits: [{ attendeeId: "a", amountMinor: 75, scope: "event_charges" }],
}

const DANGLING_ROWS: Fixture = {
  name: "dangling attendee across both scopes",
  due: [
    ["a", 100],
    ["b", 100],
  ],
  applied: 0,
  credits: [
    { attendeeId: "ghost", amountMinor: 60, scope: "event_charges" },
    { attendeeId: "ghost", amountMinor: 50, scope: "whole_order" },
  ],
}

const TARGETED_EXCESS: Fixture = {
  name: "event_charges credit above attributable outstanding",
  due: [
    ["a", 40],
    ["b", 60],
  ],
  applied: 0,
  credits: [{ attendeeId: "a", amountMinor: 100, scope: "event_charges" }],
}

const EXCESS_OVER_PAYMENT_SHARE: Fixture = {
  name: "event_charges credit above the payment-adjusted cap",
  due: [
    ["a", 100],
    ["b", 100],
  ],
  applied: 50,
  credits: [{ attendeeId: "a", amountMinor: 80, scope: "event_charges" }],
}

const ALLOCATION_FIXTURES: Fixture[] = [
  FORCING_EXAMPLE,
  TARGETED_CREDIT,
  WHOLE_ORDER_CREDIT,
  PART_PAYMENT_WORKED_EXAMPLE,
  DANGLING_ROWS,
  TARGETED_EXCESS,
  EXCESS_OVER_PAYMENT_SHARE,
]

const ALL_FIXTURES: Fixture[] = [
  ...NO_ALLOCATION_FIXTURES,
  ...ALLOCATION_FIXTURES,
]

// ---------------------------------------------------------------------------

describe("donation attribution - the D-03 forcing example", () => {
  it("attributes a whole_order credit to the ORDER pool, not to the attendee it names", () => {
    const result = derive(FORCING_EXAMPLE)
    const a = attendeeRow(result, "a")
    const b = attendeeRow(result, "b")

    // THE DISCRIMINATING ASSERTION. A blanket targeted-first rule caps B's 100
    // whole_order credit at B's own attributable outstanding (40) and strands
    // the other 60, so the 100 real payment spreads either by due weight (A ->
    // 60) or by remaining need (A -> 75) while the stranded credit is dropped —
    // A can never reach 120 even though the order total can still be made to
    // read 0 under that failing variant. `A.paidAmountMinor === 120` (and
    // `B.outstandingAmountMinor === 0` on B's own row) is what discriminates;
    // the order totals below reconcile under both models.
    expect(a.paidAmountMinor).toBe(120)
    expect(a.outstandingAmountMinor).toBe(0)
    expect(b.paidAmountMinor).toBe(80)
    expect(b.outstandingAmountMinor).toBe(0)

    expect(result.orderPaidAmountMinor).toBe(200)
    expect(result.orderOutstandingAmountMinor).toBe(0)

    // The 100 real payment stays the payment-only base; the allocation adds a
    // separate 100 whole_order credit to the order pool — the two are never
    // folded into each other.
    expect(result.appliedPaymentsMinor).toBe(100)
    expect(result.wholeOrderCreditMinor).toBe(100)
    expect(result.orderPoolMinor).toBe(200)
    expect(result.targetedCreditMinor).toBe(0)

    // The unconditional invariant: Sigma attendee outstanding === order
    // outstanding.
    expect(a.outstandingAmountMinor + b.outstandingAmountMinor).toBe(
      result.orderOutstandingAmountMinor
    )
  })
})

describe("donation attribution - scope-gated attribution matrix", () => {
  it("(a) reduces only the named attendee for an event_charges credit", () => {
    const result = derive(TARGETED_CREDIT)
    const a = attendeeRow(result, "a")
    const b = attendeeRow(result, "b")

    expect(a.paidAmountMinor).toBe(75)
    expect(a.outstandingAmountMinor).toBe(25)
    expect(b.paidAmountMinor).toBe(0)
    expect(b.outstandingAmountMinor).toBe(100)

    expect(result.targetedCreditMinor).toBe(75)
    expect(result.orderPoolMinor).toBe(0)
    expect(result.orderPaidAmountMinor).toBe(75)
    expect(result.orderOutstandingAmountMinor).toBe(125)
  })

  it("(b) joins the order pool for a whole_order credit naming an attendee", () => {
    const result = derive(WHOLE_ORDER_CREDIT)
    const a = attendeeRow(result, "a")
    const b = attendeeRow(result, "b")

    // The credit joins the pool and distributes 100:100 with A's index winning
    // the largest-remainder tie-break (75 -> 38/37). NOTE: the plan's stated
    // figures for this case (A 75 / B 25) are internally inconsistent — they
    // sum to 100 paid against a 75 pool and contradict the plan's own Sigma
    // assertion (25 + 75 = 100 !== 125 = order outstanding) and D-01, because
    // "A 75 / B 0" is the blanket targeted-first outcome this module forbids.
    // The mechanism the plan states ("joins the pool", "distributes 100:100")
    // gives 38/37 and is asserted here.
    expect(a.paidAmountMinor).toBe(38)
    expect(a.outstandingAmountMinor).toBe(62)
    expect(b.paidAmountMinor).toBe(37)
    expect(b.outstandingAmountMinor).toBe(63)

    expect(result.targetedCreditMinor).toBe(0)
    expect(result.wholeOrderCreditMinor).toBe(75)
    expect(result.orderPoolMinor).toBe(75)
    expect(result.orderPaidAmountMinor).toBe(75)
    expect(result.orderOutstandingAmountMinor).toBe(125)
    expect(a.outstandingAmountMinor + b.outstandingAmountMinor).toBe(
      result.orderOutstandingAmountMinor
    )
  })

  it("(c) matches the 55-CONTEXT part-payment worked example", () => {
    const result = derive(PART_PAYMENT_WORKED_EXAMPLE)
    const a = attendeeRow(result, "a")
    const b = attendeeRow(result, "b")

    // Payment-only shares are 25/25; the 75 targeted credit caps at A's
    // attributable outstanding (100 - 25 = 75); the 50 pool then spreads over
    // the REMAINING need 25:100 -> 10/40.
    expect(a.paidAmountMinor).toBe(85)
    expect(a.outstandingAmountMinor).toBe(15)
    expect(b.paidAmountMinor).toBe(40)
    expect(b.outstandingAmountMinor).toBe(60)

    expect(a.paymentShareMinor).toBe(25)
    expect(a.targetedCreditMinor).toBe(75)
    expect(result.orderPaidAmountMinor).toBe(125)
    expect(result.orderOutstandingAmountMinor).toBe(75)
    expect(a.outstandingAmountMinor + b.outstandingAmountMinor).toBe(75)
  })
})

describe("donation attribution - no-allocation byte identity (D-10)", () => {
  for (const fixture of NO_ALLOCATION_FIXTURES) {
    it(`matches deriveAllocationPaymentBreakdowns exactly: ${fixture.name}`, () => {
      const expected = deriveAllocationPaymentBreakdowns({
        amountDueByAttendeeId: dueMap(fixture.due),
        paidTotalMinor: fixture.applied,
      })
      const result = derive(fixture)

      expect([...result.byAttendeeId.keys()]).toEqual([...expected.keys()])
      expect(result.byAttendeeId.size).toBe(expected.size)

      for (const [attendeeId, breakdown] of expected) {
        const actual = attendeeRow(result, attendeeId)
        expect(actual.attendeeId).toBe(attendeeId)
        expect(actual.amountDueMinor).toBe(breakdown.amountDueMinor)
        expect(actual.paidAmountMinor).toBe(breakdown.paidAmountMinor)
        expect(actual.paymentState).toBe(breakdown.paymentState)
        expect(actual.paymentShareMinor).toBe(breakdown.paidAmountMinor)
        expect(actual.poolShareMinor).toBe(breakdown.paidAmountMinor)
        expect(actual.targetedCreditMinor).toBe(0)
        expect(actual.unappliedTargetedCreditMinor).toBe(0)
        expect(actual.outstandingAmountMinor).toBe(
          Math.max(0, breakdown.amountDueMinor - breakdown.paidAmountMinor)
        )
      }

      expect(result.totalDueMinor).toBe(
        fixture.due.reduce((sum, [, dueMinor]) => sum + normalize(dueMinor), 0)
      )
      expect(result.appliedPaymentsMinor).toBe(normalize(fixture.applied))
      expect(result.targetedCreditMinor).toBe(0)
      expect(result.wholeOrderCreditMinor).toBe(0)
      expect(result.orderPoolMinor).toBe(normalize(fixture.applied))
      expect(result.unattributedTargetedCreditMinor).toBe(0)
      expect(result.orderPaidAmountMinor).toBe(normalize(fixture.applied))
      expect(result.orderOutstandingAmountMinor).toBe(
        Math.max(0, result.totalDueMinor - normalize(fixture.applied))
      )
    })
  }

  it("keeps a zero-attributable-charge order's real applied payments at the order level", () => {
    // Today's figures for this order class: every per-attendee row is 0 (the
    // weight allocator has no weight to spread over) while the order-level paid
    // figure keeps the applied payment total. A Sigma-only shortcut would erase
    // it and shift getPaymentSummary.totalPaid, the reconciliation row and the
    // overpayment class — so both directions are pinned here.
    const result = derive(ZERO_CHARGES_WITH_PAYMENTS)

    expect(result.totalDueMinor).toBe(0)
    expect(
      [...result.byAttendeeId.values()].every(
        (row) => row.paidAmountMinor === 0
      )
    ).toBe(true)
    expect([...result.byAttendeeId.values()].reduce(
      (sum, row) => sum + row.paidAmountMinor,
      0
    )).toBe(0)

    expect(result.orderPaidAmountMinor).toBe(150)
    expect(result.orderOutstandingAmountMinor).toBe(0)
    expect(
      deriveBalanceAmounts(result.totalDueMinor, result.orderPaidAmountMinor)
        .donationAmountMinor
    ).toBe(150)
  })
})

describe("donation attribution - no double-count invariants", () => {
  for (const fixture of ALL_FIXTURES) {
    it(`never inflates the order-level overpayment figure: ${fixture.name}`, () => {
      expectNoDonationInflation(derive(fixture))
    })
  }

  for (const fixture of ALL_FIXTURES) {
    it(`holds the matrix invariants: ${fixture.name}`, () => {
      const result = derive(fixture)
      const rows = [...result.byAttendeeId.values()]

      const sumOutstanding = rows.reduce(
        (sum, row) => sum + row.outstandingAmountMinor,
        0
      )
      const sumPaid = rows.reduce((sum, row) => sum + row.paidAmountMinor, 0)
      const sumRemainingWeights = rows.reduce(
        (sum, row) =>
          sum + Math.max(0, row.amountDueMinor - row.targetedCreditMinor),
        0
      )

      // Sigma attendee outstanding === order outstanding, unconditionally.
      expect(sumOutstanding).toBe(result.orderOutstandingAmountMinor)

      if (sumRemainingWeights > 0) {
        expect(sumPaid).toBe(result.orderPaidAmountMinor)
      } else {
        // The all-zero-weight carve-out, pinned in both directions.
        expect(sumPaid).toBe(0)
        expect(result.orderPaidAmountMinor).toBe(
          result.appliedPaymentsMinor + result.wholeOrderCreditMinor
        )
      }

      // No negative field, anywhere.
      for (const row of rows) {
        for (const value of [
          row.amountDueMinor,
          row.paymentShareMinor,
          row.targetedCreditMinor,
          row.unappliedTargetedCreditMinor,
          row.poolShareMinor,
          row.paidAmountMinor,
          row.outstandingAmountMinor,
        ]) {
          expect(value).toBeGreaterThanOrEqual(0)
        }
      }
      for (const value of Object.values(totalsOf(result))) {
        expect(value).toBeGreaterThanOrEqual(0)
      }

      // The Phase 55 write bound keeps the pool inside the remaining need.
      if (fixture.credits.length > 0) {
        expect(result.orderPoolMinor).toBeLessThanOrEqual(sumRemainingWeights)
      }
    })
  }
})

describe("donation attribution - idempotence (D-09)", () => {
  for (const fixture of [FORCING_EXAMPLE, DANGLING_ROWS]) {
    it(`returns deeply equal results for identical input: ${fixture.name}`, () => {
      const input = {
        amountDueByAttendeeId: dueMap(fixture.due),
        appliedPaymentsMinor: fixture.applied,
        allocationRows: fixture.credits,
      }

      const first = deriveDonationAttribution(input)
      const second = deriveDonationAttribution(input)

      expect(second.byAttendeeId.size).toBe(first.byAttendeeId.size)
      expect(second.byAttendeeId.size).toBe(dueMap(fixture.due).size)
      expect([...second.byAttendeeId.entries()]).toEqual([
        ...first.byAttendeeId.entries(),
      ])
      expect(totalsOf(second)).toEqual(totalsOf(first))

      // No total grows on the second call.
      expect(second.orderPaidAmountMinor).toBe(first.orderPaidAmountMinor)
      expect(second.orderOutstandingAmountMinor).toBe(
        first.orderOutstandingAmountMinor
      )
      expect(second.targetedCreditMinor).toBe(first.targetedCreditMinor)
      expect(second.wholeOrderCreditMinor).toBe(first.wholeOrderCreditMinor)
      expect(second.orderPoolMinor).toBe(first.orderPoolMinor)
    })
  }
})

describe("donation attribution - edge rows and excess reporting", () => {
  it("reports a targeted row naming an absent attendee without fabricating a row", () => {
    const result = derive(DANGLING_ROWS)

    expect(result.byAttendeeId.has("ghost")).toBe(false)
    expect(result.byAttendeeId.size).toBe(2)
    expect(result.targetedCreditMinor).toBe(0)
    expect(result.unattributedTargetedCreditMinor).toBe(60)

    // The whole_order row naming the same absent attendee is attendee-agnostic:
    // it still joins the pool and distributes across the attendees that exist.
    expect(result.wholeOrderCreditMinor).toBe(50)
    expect(result.orderPoolMinor).toBe(50)
    const a = attendeeRow(result, "a")
    const b = attendeeRow(result, "b")
    expect(a.poolShareMinor).toBe(25)
    expect(b.poolShareMinor).toBe(25)
    expect(a.paidAmountMinor).toBe(25)
    expect(b.paidAmountMinor).toBe(25)
    expect(a.outstandingAmountMinor).toBe(75)
    expect(b.outstandingAmountMinor).toBe(75)
  })

  it("caps a targeted row at attributable outstanding and reports the excess", () => {
    const result = derive(TARGETED_EXCESS)
    const a = attendeeRow(result, "a")
    const b = attendeeRow(result, "b")

    expect(a.targetedCreditMinor).toBe(40)
    expect(a.unappliedTargetedCreditMinor).toBe(60)
    expect(a.paidAmountMinor).toBe(40)
    expect(a.outstandingAmountMinor).toBe(0)

    expect(b.targetedCreditMinor).toBe(0)
    expect(b.unappliedTargetedCreditMinor).toBe(0)
    expect(b.paidAmountMinor).toBe(0)
    expect(b.outstandingAmountMinor).toBe(60)

    expect(result.orderPaidAmountMinor).toBe(40)
    expect(result.orderOutstandingAmountMinor).toBe(60)
  })

  it("uses attributable outstanding (due minus payment share) as the cap base", () => {
    const result = derive(EXCESS_OVER_PAYMENT_SHARE)
    const a = attendeeRow(result, "a")

    // The cap is 100 - 25 = 75, not the raw due of 100.
    expect(a.paymentShareMinor).toBe(25)
    expect(a.targetedCreditMinor).toBe(75)
    expect(a.unappliedTargetedCreditMinor).toBe(5)

    // The 50 payment pool spreads over the remaining need 25:100 -> 10/40.
    expect(a.paidAmountMinor).toBe(85)
    expect(a.outstandingAmountMinor).toBe(15)
    const b = attendeeRow(result, "b")
    expect(b.paidAmountMinor).toBe(40)
    expect(b.outstandingAmountMinor).toBe(60)
  })
})
