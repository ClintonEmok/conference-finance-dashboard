/**
 * Phase 56 plan 05 — the pure event donation-income composition (DACC-02/D-08).
 *
 * This suite exists to catch three regressions:
 *   1. a minor unit dropped or double-counted between the allocated and the
 *      unallocated sides — caught by the exact-integer identity asserted on
 *      every case;
 *   2. a re-implemented remainder rule — caught by the per-row cross-check
 *      against the REAL `deriveAllocationRemainingMinor` and by the degenerate
 *      over-recorded case, where a naive `amount − allocated` subtraction goes
 *      negative instead of clamping at zero;
 *   3. row reordering — the composition must map its input 1:1, leaving
 *      presentation order to the caller.
 *
 * Money figures are minor units (the house convention); no mocks.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import {
  deriveEventDonationIncome,
  type DonationIncomeInputRow,
} from "@/lib/domain/finance/donation-income"
import { deriveAllocationRemainingMinor } from "@/lib/domain/finance/donation-allocation"

function donation(
  donationId: string,
  amountMinor: number,
  recordedAmounts: number[]
): DonationIncomeInputRow {
  return {
    donationId,
    amountMinor,
    recordedAllocations: recordedAmounts.map((recordedMinor) => ({
      amountMinor: recordedMinor,
    })),
  }
}

type IncomeCase = {
  name: string
  donations: DonationIncomeInputRow[]
  expectedRows: Array<{
    donationId: string
    donationAmountMinor: number
    allocatedMinor: number
    unallocatedRemainderMinor: number
    allocationCount: number
  }>
  expectedTotals: {
    donationCount: number
    donationsMinor: number
    allocatedMinor: number
    unallocatedRemainderMinor: number
  }
}

const CASES: IncomeCase[] = [
  {
    name: "a donation with zero recorded rows is fully unallocated",
    donations: [donation("d-zero", 7_500, [])],
    expectedRows: [
      {
        donationId: "d-zero",
        donationAmountMinor: 7_500,
        allocatedMinor: 0,
        unallocatedRemainderMinor: 7_500,
        allocationCount: 0,
      },
    ],
    expectedTotals: {
      donationCount: 1,
      donationsMinor: 7_500,
      allocatedMinor: 0,
      unallocatedRemainderMinor: 7_500,
    },
  },
  {
    name: "a fully allocated donation with several rows leaves a zero remainder",
    donations: [donation("d-full", 10_000, [6_000, 4_000])],
    expectedRows: [
      {
        donationId: "d-full",
        donationAmountMinor: 10_000,
        allocatedMinor: 10_000,
        unallocatedRemainderMinor: 0,
        allocationCount: 2,
      },
    ],
    expectedTotals: {
      donationCount: 1,
      donationsMinor: 10_000,
      allocatedMinor: 10_000,
      unallocatedRemainderMinor: 0,
    },
  },
  {
    name: "a partially allocated donation splits into allocated plus remainder",
    donations: [donation("d-partial", 25_000, [10_000])],
    expectedRows: [
      {
        donationId: "d-partial",
        donationAmountMinor: 25_000,
        allocatedMinor: 10_000,
        unallocatedRemainderMinor: 15_000,
        allocationCount: 1,
      },
    ],
    expectedTotals: {
      donationCount: 1,
      donationsMinor: 25_000,
      allocatedMinor: 10_000,
      unallocatedRemainderMinor: 15_000,
    },
  },
  {
    name: "an empty donation set reports zero totals and a zero count",
    donations: [],
    expectedRows: [],
    expectedTotals: {
      donationCount: 0,
      donationsMinor: 0,
      allocatedMinor: 0,
      unallocatedRemainderMinor: 0,
    },
  },
  {
    name: "several allocations summing exactly to the amount leave a zero remainder",
    donations: [donation("d-three", 30_000, [10_000, 10_000, 10_000])],
    expectedRows: [
      {
        donationId: "d-three",
        donationAmountMinor: 30_000,
        allocatedMinor: 30_000,
        unallocatedRemainderMinor: 0,
        allocationCount: 3,
      },
    ],
    expectedTotals: {
      donationCount: 1,
      donationsMinor: 30_000,
      allocatedMinor: 30_000,
      unallocatedRemainderMinor: 0,
    },
  },
]

describe("deriveEventDonationIncome", () => {
  for (const testCase of CASES) {
    it(testCase.name, () => {
      const breakdown = deriveEventDonationIncome({
        donations: testCase.donations,
      })

      expect(breakdown.rows).toEqual(testCase.expectedRows)
      expect(breakdown.totals).toEqual(testCase.expectedTotals)

      // Row order follows the input order 1:1 — no sorting here.
      expect(breakdown.rows.map((row) => row.donationId)).toEqual(
        testCase.donations.map((row) => row.donationId)
      )

      // THE identity, exact integers, on every case: each minor unit is in
      // exactly one of the two sides.
      expect(breakdown.totals.donationsMinor).toBe(
        breakdown.totals.allocatedMinor +
          breakdown.totals.unallocatedRemainderMinor
      )

      // Per-row figures and the count come from the REAL Phase 55 derivation —
      // a re-implemented remainder rule cannot agree on all three fields.
      for (const inputRow of testCase.donations) {
        const phase55 = deriveAllocationRemainingMinor({
          donationAmountMinor: inputRow.amountMinor,
          recordedRows: inputRow.recordedAllocations,
        })
        const row = breakdown.rows.find(
          (entry) => entry.donationId === inputRow.donationId
        )

        expect(row).toBeDefined()
        expect(row?.donationAmountMinor).toBe(phase55.donationAmountMinor)
        expect(row?.allocatedMinor).toBe(phase55.recordedAllocatedMinor)
        expect(row?.unallocatedRemainderMinor).toBe(phase55.remainingMinor)
        expect(row?.allocationCount).toBe(inputRow.recordedAllocations.length)
      }
    })
  }

  it("composes many donations into event totals without dropping a unit", () => {
    const breakdown = deriveEventDonationIncome({
      donations: [
        donation("d-a", 10_000, [6_000, 4_000]),
        donation("d-b", 25_000, [10_000]),
        donation("d-c", 7_500, []),
      ],
    })

    expect(breakdown.rows.map((row) => row.donationId)).toEqual([
      "d-a",
      "d-b",
      "d-c",
    ])
    expect(breakdown.totals).toEqual({
      donationCount: 3,
      donationsMinor: 42_500,
      allocatedMinor: 20_000,
      unallocatedRemainderMinor: 22_500,
    })
    expect(breakdown.totals.donationsMinor).toBe(
      breakdown.totals.allocatedMinor +
        breakdown.totals.unallocatedRemainderMinor
    )
  })

  it("clamps a degenerate over-recorded input to a zero remainder and never goes negative", () => {
    // Writer-unreachable state (Phase 55 refuses over-allocation), asserted so
    // a naive `amount − allocated` subtraction — which would report −400 —
    // fails loudly. The shape is Phase 55's D-16: reported, not absorbed.
    const breakdown = deriveEventDonationIncome({
      donations: [donation("d-over", 100, [500])],
    })

    const row = breakdown.rows[0]
    expect(row.donationAmountMinor).toBe(100)
    expect(row.allocatedMinor).toBe(500)
    expect(row.unallocatedRemainderMinor).toBe(0)
    expect(row.unallocatedRemainderMinor).toBeGreaterThanOrEqual(0)
    expect(row.allocationCount).toBe(1)

    // The clamp is the REAL derivation's, not a local copy of the rule.
    expect(
      deriveAllocationRemainingMinor({
        donationAmountMinor: 100,
        recordedRows: [{ amountMinor: 500 }],
      })
    ).toEqual({
      donationAmountMinor: 100,
      recordedAllocatedMinor: 500,
      remainingMinor: 0,
    })

    // Reported, not absorbed: the excess above the donation stays visible
    // because the recorded sum is reported as-is. The exact-integer identity is
    // a property of the writer-validated state (see the module header); here
    // the clamp is what keeps the remainder non-negative.
    expect(breakdown.totals).toEqual({
      donationCount: 1,
      donationsMinor: 100,
      allocatedMinor: 500,
      unallocatedRemainderMinor: 0,
    })
    expect(
      breakdown.totals.allocatedMinor +
        breakdown.totals.unallocatedRemainderMinor
    ).toBeGreaterThan(breakdown.totals.donationsMinor)
  })

  it("reuses the ONE Phase 55 remainder derivation instead of reimplementing it", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/domain/finance/donation-income.ts"),
      "utf8"
    )

    expect(source).toContain('from "./donation-allocation"')
    expect(source).toContain("deriveAllocationRemainingMinor(")
    // The module's own money arithmetic is limited to accumulating the
    // derivation's three outputs; there is no local `amount − allocated`.
    expect(source).not.toContain("amountMinor -")
    expect(source).not.toContain("recordedAllocatedMinor -")
  })
})
