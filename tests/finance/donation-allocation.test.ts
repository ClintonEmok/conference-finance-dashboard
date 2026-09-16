import { describe, expect, it } from "vitest"

import {
  DONATION_ALLOCATION_ERROR_CODES,
  MAX_ALLOCATION_PLAN_ROWS,
  buildDistributionPlan,
  deriveAllocationReadProjection,
  deriveAllocationRemainingMinor,
  digestAllocationEnvelope,
  distributeEqually,
  distributeLargestBalanceFirst,
  rankTargetsByScopeBalance,
  resolveScopeOutstandingMinor,
  runAllocationWaterfall,
  sumRecordedAllocationMinor,
  validateAllocationPlan,
  type AllocationCeiling,
  type DonationAllocationPlanRow,
  type DonationAllocationScope,
  type DonationDistributionPlan,
  type DonationDistributionTarget,
} from "@/lib/domain/finance/donation-allocation"

function ceiling(
  input: Partial<AllocationCeiling> & { attendeeId: string; orderId: string }
): AllocationCeiling {
  return {
    attendeeId: input.attendeeId,
    orderId: input.orderId,
    eventChargesOutstandingMinor: input.eventChargesOutstandingMinor ?? 0,
    wholeOrderOutstandingMinor: input.wholeOrderOutstandingMinor ?? 0,
  }
}

function ceilingMap(
  ...ceilings: AllocationCeiling[]
): Map<string, AllocationCeiling> {
  return new Map(ceilings.map((entry) => [entry.attendeeId, entry]))
}

function row(
  attendeeId: string,
  orderId: string,
  amountMinor: number,
  scope: DonationAllocationPlanRow["scope"]
): DonationAllocationPlanRow {
  return { attendeeId, orderId, amountMinor, scope }
}

function expectCode(fn: () => void, code: string) {
  expect(fn).toThrowError(new RegExp(`^${code}`))
}

function target(
  attendeeId: string,
  orderId: string,
  scope: DonationAllocationScope = "whole_order"
): DonationDistributionTarget {
  return { attendeeId, orderId, scope }
}

/** Applies the plan's own rows to the writer contract: it must never reject. */
function expectPlanAccepted(
  plan: DonationDistributionPlan,
  availableMinor: number,
  ceilings: ReadonlyMap<string, AllocationCeiling>
) {
  expect(() =>
    validateAllocationPlan({
      availableMinor,
      rows: plan.rows,
      ceilings,
      alreadyClaimedByOrder: new Map(),
    })
  ).not.toThrow()
}

/** Per-order totals of the written rows — the order-capacity bound. */
function orderTotalsMinor(plan: DonationDistributionPlan): Map<string, number> {
  const totals = new Map<string, number>()
  for (const entry of plan.rows) {
    totals.set(
      entry.orderId,
      (totals.get(entry.orderId) ?? 0) + entry.amountMinor
    )
  }
  return totals
}

describe("deriveAllocationRemainingMinor", () => {
  it("derives the remainder from the recorded rows", () => {
    const result = deriveAllocationRemainingMinor({
      donationAmountMinor: 1000,
      recordedRows: [{ amountMinor: 400 }, { amountMinor: 300 }],
    })

    expect(result).toEqual({
      donationAmountMinor: 1000,
      recordedAllocatedMinor: 700,
      remainingMinor: 300,
    })
  })

  it("clamps at zero when recorded rows exceed the donation", () => {
    const result = deriveAllocationRemainingMinor({
      donationAmountMinor: 500,
      recordedRows: [{ amountMinor: 800 }],
    })

    expect(result.recordedAllocatedMinor).toBe(800)
    expect(result.remainingMinor).toBe(0)
  })

  it("uses RECORDED amounts, never the applied amount of a stale row", () => {
    // A row whose ceiling later dropped still consumes the donation's budget:
    // applications are a read-time cap, the recorded amount is the ledger.
    const result = deriveAllocationRemainingMinor({
      donationAmountMinor: 1000,
      recordedRows: [{ amountMinor: 1000 }, { amountMinor: 0 }],
    })

    expect(result.remainingMinor).toBe(0)
  })

  it("normalizes non-finite and negative inputs", () => {
    const result = deriveAllocationRemainingMinor({
      donationAmountMinor: Number.NaN,
      recordedRows: [{ amountMinor: -50 }],
    })

    expect(result).toEqual({
      donationAmountMinor: 0,
      recordedAllocatedMinor: 0,
      remainingMinor: 0,
    })
  })
})

describe("sumRecordedAllocationMinor", () => {
  it("sums normalized recorded amounts", () => {
    expect(
      sumRecordedAllocationMinor([
        { amountMinor: 100 },
        { amountMinor: 250 },
        { amountMinor: 0 },
      ])
    ).toBe(350)
  })

  it("ignores negative and non-finite amounts instead of shrinking the sum", () => {
    expect(
      sumRecordedAllocationMinor([
        { amountMinor: 100 },
        { amountMinor: -100 },
        { amountMinor: Number.NaN },
      ])
    ).toBe(100)
  })
})

describe("resolveScopeOutstandingMinor", () => {
  const both = ceiling({
    attendeeId: "a-1",
    orderId: "o-1",
    eventChargesOutstandingMinor: 120,
    wholeOrderOutstandingMinor: 200,
  })

  it("returns the attendee ceiling for event_charges", () => {
    expect(resolveScopeOutstandingMinor(both, "event_charges")).toBe(120)
  })

  it("returns the order ceiling for whole_order", () => {
    expect(resolveScopeOutstandingMinor(both, "whole_order")).toBe(200)
  })

  it("clamps a negative ceiling to zero", () => {
    const negative = ceiling({
      attendeeId: "a-1",
      orderId: "o-1",
      eventChargesOutstandingMinor: -40,
      wholeOrderOutstandingMinor: -10,
    })

    expect(resolveScopeOutstandingMinor(negative, "event_charges")).toBe(0)
    expect(resolveScopeOutstandingMinor(negative, "whole_order")).toBe(0)
  })
})

describe("validateAllocationPlan - structural refusals", () => {
  const ceilings = ceilingMap(
    ceiling({
      attendeeId: "a-1",
      orderId: "o-1",
      eventChargesOutstandingMinor: 100,
      wholeOrderOutstandingMinor: 200,
    })
  )

  it("accepts an empty plan (set-replace clears the allocation set)", () => {
    expect(() =>
      validateAllocationPlan({
        availableMinor: 1000,
        rows: [],
        ceilings: new Map(),
        alreadyClaimedByOrder: new Map(),
      })
    ).not.toThrow()
  })

  it("accepts a valid multi-row plan", () => {
    expect(() =>
      validateAllocationPlan({
        availableMinor: 150,
        rows: [row("a-1", "o-1", 100, "event_charges")],
        ceilings,
        alreadyClaimedByOrder: new Map(),
      })
    ).not.toThrow()
  })

  it("refuses a plan larger than MAX_ALLOCATION_PLAN_ROWS", () => {
    const rows = Array.from({ length: 201 }, (_unused, index) =>
      row(`a-${index}`, "o-1", 1, "event_charges")
    )
    const bigCeilings = ceilingMap(
      ...rows.map((entry) =>
        ceiling({
          attendeeId: entry.attendeeId,
          orderId: "o-1",
          eventChargesOutstandingMinor: 1,
          wholeOrderOutstandingMinor: 500,
        })
      )
    )

    expectCode(
      () =>
        validateAllocationPlan({
          availableMinor: 1000,
          rows,
          ceilings: bigCeilings,
          alreadyClaimedByOrder: new Map(),
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_PLAN_TOO_LARGE
    )
  })

  it("refuses a duplicate target", () => {
    expectCode(
      () =>
        validateAllocationPlan({
          availableMinor: 100,
          rows: [
            row("a-1", "o-1", 50, "event_charges"),
            row("a-1", "o-1", 50, "event_charges"),
          ],
          ceilings,
          alreadyClaimedByOrder: new Map(),
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_DUPLICATE_TARGET
    )
  })

  it("refuses zero, negative, fractional and non-finite amounts", () => {
    for (const amountMinor of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectCode(
        () =>
          validateAllocationPlan({
            availableMinor: 100,
            rows: [row("a-1", "o-1", amountMinor, "event_charges")],
            ceilings,
            alreadyClaimedByOrder: new Map(),
          }),
        DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_INVALID_AMOUNT
      )
    }
  })

  it("refuses a row with no ceiling entry", () => {
    expectCode(
      () =>
        validateAllocationPlan({
          availableMinor: 100,
          rows: [row("a-missing", "o-1", 10, "event_charges")],
          ceilings,
          alreadyClaimedByOrder: new Map(),
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_UNKNOWN_TARGET
    )
  })

  it("refuses a row whose ceiling names a different order", () => {
    expectCode(
      () =>
        validateAllocationPlan({
          availableMinor: 100,
          rows: [row("a-1", "o-OTHER", 10, "event_charges")],
          ceilings,
          alreadyClaimedByOrder: new Map(),
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_UNKNOWN_TARGET
    )
  })
})

describe("validateAllocationPlan - money refusals", () => {
  const ceilings = ceilingMap(
    ceiling({
      attendeeId: "a-1",
      orderId: "o-1",
      eventChargesOutstandingMinor: 100,
      wholeOrderOutstandingMinor: 200,
    })
  )

  it("refuses a total over the donation remainder", () => {
    expectCode(
      () =>
        validateAllocationPlan({
          availableMinor: 50,
          rows: [row("a-1", "o-1", 60, "event_charges")],
          ceilings,
          alreadyClaimedByOrder: new Map(),
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_EXCEEDS_REMAINDER
    )
  })

  it("lets over-remainder win over over-ceiling", () => {
    // Both checks would fail; the code must be predictable and remainder wins.
    expectCode(
      () =>
        validateAllocationPlan({
          availableMinor: 50,
          rows: [row("a-1", "o-1", 150, "event_charges")],
          ceilings,
          alreadyClaimedByOrder: new Map(),
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_EXCEEDS_REMAINDER
    )
  })

  it("refuses a row over the attendee event_charges ceiling", () => {
    expectCode(
      () =>
        validateAllocationPlan({
          availableMinor: 150,
          rows: [row("a-1", "o-1", 150, "event_charges")],
          ceilings,
          alreadyClaimedByOrder: new Map(),
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_EXCEEDS_CEILING
    )
  })

  it("refuses a row over the whole_order ceiling", () => {
    expectCode(
      () =>
        validateAllocationPlan({
          availableMinor: 400,
          rows: [row("a-1", "o-1", 201, "whole_order")],
          ceilings,
          alreadyClaimedByOrder: new Map(),
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_EXCEEDS_CEILING
    )
  })
})

describe("validateAllocationPlan - ONE order-capacity rule", () => {
  // Order o-1 owes 200: A 100 + B 100. Both scopes are server-derived.
  const ceilings = ceilingMap(
    ceiling({
      attendeeId: "a-1",
      orderId: "o-1",
      eventChargesOutstandingMinor: 100,
      wholeOrderOutstandingMinor: 200,
    }),
    ceiling({
      attendeeId: "b-1",
      orderId: "o-1",
      eventChargesOutstandingMinor: 100,
      wholeOrderOutstandingMinor: 200,
    })
  )

  it("refuses a sibling whole_order pair that sums past the order outstanding", () => {
    // A donation of exactly 200 would be caught by EXCEEDS_REMAINDER first,
    // so the donation (and thus availableMinor) is sized above the order.
    expectCode(
      () =>
        validateAllocationPlan({
          availableMinor: 400,
          rows: [
            row("a-1", "o-1", 200, "whole_order"),
            row("b-1", "o-1", 200, "whole_order"),
          ],
          ceilings,
          alreadyClaimedByOrder: new Map(),
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY
    )
  })

  it("accepts a sibling pair that sums exactly to the order outstanding", () => {
    expect(() =>
      validateAllocationPlan({
        availableMinor: 400,
        rows: [
          row("a-1", "o-1", 120, "whole_order"),
          row("b-1", "o-1", 80, "whole_order"),
        ],
        ceilings,
        alreadyClaimedByOrder: new Map(),
      })
    ).not.toThrow()
  })

  it("debits the pool per row, not 'any over-ceiling row fails'", () => {
    // A's 200 is itself legal against the order; the SECOND row has only 0 of
    // pool left, so the refusal is about the pool remainder.
    expectCode(
      () =>
        validateAllocationPlan({
          availableMinor: 400,
          rows: [
            row("a-1", "o-1", 200, "whole_order"),
            row("b-1", "o-1", 1, "whole_order"),
          ],
          ceilings,
          alreadyClaimedByOrder: new Map(),
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY
    )
  })

  it("keeps pools independent per order", () => {
    // Exhausting o-1's pool (200) must not reject a valid row on o-2.
    const twoOrders = ceilingMap(
      ceiling({
        attendeeId: "a-1",
        orderId: "o-1",
        eventChargesOutstandingMinor: 100,
        wholeOrderOutstandingMinor: 200,
      }),
      ceiling({
        attendeeId: "c-1",
        orderId: "o-2",
        eventChargesOutstandingMinor: 300,
        wholeOrderOutstandingMinor: 300,
      })
    )

    expect(() =>
      validateAllocationPlan({
        availableMinor: 700,
        rows: [
          row("a-1", "o-1", 200, "whole_order"),
          row("c-1", "o-2", 300, "whole_order"),
        ],
        ceilings: twoOrders,
        alreadyClaimedByOrder: new Map(),
      })
    ).not.toThrow()
  })

  it("refuses each row of an exhausted order in a mixed plan", () => {
    expectCode(
      () =>
        validateAllocationPlan({
          availableMinor: 700,
          rows: [
            row("a-1", "o-1", 200, "whole_order"),
            row("b-1", "o-1", 1, "whole_order"),
            row("c-1", "o-2", 300, "whole_order"),
          ],
          ceilings: ceilingMap(
            ceiling({
              attendeeId: "a-1",
              orderId: "o-1",
              eventChargesOutstandingMinor: 100,
              wholeOrderOutstandingMinor: 200,
            }),
            ceiling({
              attendeeId: "b-1",
              orderId: "o-1",
              eventChargesOutstandingMinor: 100,
              wholeOrderOutstandingMinor: 200,
            }),
            ceiling({
              attendeeId: "c-1",
              orderId: "o-2",
              eventChargesOutstandingMinor: 300,
              wholeOrderOutstandingMinor: 300,
            })
          ),
          alreadyClaimedByOrder: new Map(),
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY
    )
  })

  it("debits the same pool for a scope-mixed pair (CE-1)", () => {
    // Each row passes its OWN scope check (A 100 <= 100; B 200 <= 200) and the
    // remainder check passes (300 <= 300), yet together they are 300 against a
    // 200 order. A whole_order-only pool would accept this.
    expectCode(
      () =>
        validateAllocationPlan({
          availableMinor: 300,
          rows: [
            row("a-1", "o-1", 100, "event_charges"),
            row("b-1", "o-1", 200, "whole_order"),
          ],
          ceilings,
          alreadyClaimedByOrder: new Map(),
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY
    )
  })

  it("accepts the scope-mixed counterpart that sums to the order outstanding", () => {
    expect(() =>
      validateAllocationPlan({
        availableMinor: 300,
        rows: [
          row("a-1", "o-1", 80, "event_charges"),
          row("b-1", "o-1", 120, "whole_order"),
        ],
        ceilings,
        alreadyClaimedByOrder: new Map(),
      })
    ).not.toThrow()
  })

  it("subtracts the donation's OWN other rows on the order", () => {
    // The ceiling excludes SELF, so the caller supplies the donation's other
    // rows explicitly. Only 100 of the 200 pool is free.
    expectCode(
      () =>
        validateAllocationPlan({
          availableMinor: 400,
          rows: [row("a-1", "o-1", 150, "whole_order")],
          ceilings,
          alreadyClaimedByOrder: new Map([["o-1", 100]]),
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY
    )
  })

  it("accepts a row that fits the pool left by the donation's own other rows", () => {
    expect(() =>
      validateAllocationPlan({
        availableMinor: 400,
        rows: [row("a-1", "o-1", 100, "whole_order")],
        ceilings,
        alreadyClaimedByOrder: new Map([["o-1", 100]]),
      })
    ).not.toThrow()
  })

  it("never collapses the capacity refusal into the ceiling refusal", () => {
    // Both rows are within their own event_charges ceilings; only the order
    // pool is exhausted. The code must name the order bound.
    let caught: unknown
    try {
      validateAllocationPlan({
        availableMinor: 300,
        rows: [
          row("a-1", "o-1", 100, "event_charges"),
          row("b-1", "o-1", 150, "whole_order"),
        ],
        ceilings,
        alreadyClaimedByOrder: new Map(),
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain(
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY
    )
    expect((caught as Error).message).not.toContain(
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_EXCEEDS_CEILING
    )
  })
})

describe("deriveAllocationReadProjection", () => {
  it("caps applied at the scope ceiling and reports the unabsorbed excess", () => {
    const projection = deriveAllocationReadProjection({
      rows: [row("a-1", "o-1", 150, "event_charges")],
      ceilings: ceilingMap(
        ceiling({
          attendeeId: "a-1",
          orderId: "o-1",
          eventChargesOutstandingMinor: 100,
          wholeOrderOutstandingMinor: 200,
        })
      ),
    })

    expect(projection).toHaveLength(1)
    expect(projection[0]).toMatchObject({
      amountMinor: 150,
      scopeOutstandingMinor: 100,
      effectiveCapacityMinor: 100,
      appliedMinor: 100,
      unappliedMinor: 50,
      exceedsCeiling: true,
      exceedsCapacity: true,
    })
  })

  it("reports a whole_order row fully applied against its scope ceiling", () => {
    // D-12 residual: whole_order is the larger, attendee-agnostic ceiling.
    // Phase 56's targeted-first projection is what caps it per attendee.
    const projection = deriveAllocationReadProjection({
      rows: [row("a-1", "o-1", 150, "whole_order")],
      ceilings: ceilingMap(
        ceiling({
          attendeeId: "a-1",
          orderId: "o-1",
          eventChargesOutstandingMinor: 100,
          wholeOrderOutstandingMinor: 200,
        })
      ),
    })

    expect(projection[0]).toMatchObject({
      scopeOutstandingMinor: 200,
      effectiveCapacityMinor: 200,
      appliedMinor: 150,
      unappliedMinor: 0,
      exceedsCeiling: false,
      exceedsCapacity: false,
    })
  })

  it("limits the writable amount by the OTHER rows on the same order", () => {
    // Order o-1 owes 200: A 120 + B 80. Each row's order remaining capacity
    // excludes only its own amount, so the pair applies to exactly 200.
    const projection = deriveAllocationReadProjection({
      rows: [
        row("a-1", "o-1", 120, "whole_order"),
        row("b-1", "o-1", 80, "whole_order"),
      ],
      ceilings: ceilingMap(
        ceiling({
          attendeeId: "a-1",
          orderId: "o-1",
          eventChargesOutstandingMinor: 100,
          wholeOrderOutstandingMinor: 200,
        }),
        ceiling({
          attendeeId: "b-1",
          orderId: "o-1",
          eventChargesOutstandingMinor: 100,
          wholeOrderOutstandingMinor: 200,
        })
      ),
    })

    const [a, b] = projection
    expect(a).toMatchObject({
      effectiveCapacityMinor: 120,
      appliedMinor: 120,
      exceedsCapacity: false,
    })
    expect(b).toMatchObject({
      effectiveCapacityMinor: 80,
      appliedMinor: 80,
      exceedsCapacity: false,
    })
    expect(a.appliedMinor + b.appliedMinor).toBe(200)
  })

  it("shows effective capacity binding below the attendee ceiling (order headroom)", () => {
    // Worked case: order A owes 200 (Maria 120, Tom 80). Another donation
    // already holds 100 whole_order, so D2's wholeOrderOutstanding is 100
    // while Maria's event_charges ceiling is still 120. Only 100 fits.
    const projection = deriveAllocationReadProjection({
      rows: [row("maria", "o-1", 120, "event_charges")],
      ceilings: ceilingMap(
        ceiling({
          attendeeId: "maria",
          orderId: "o-1",
          eventChargesOutstandingMinor: 120,
          wholeOrderOutstandingMinor: 100,
        })
      ),
    })

    expect(projection[0]).toMatchObject({
      scopeOutstandingMinor: 120,
      effectiveCapacityMinor: 100,
      appliedMinor: 100,
      unappliedMinor: 20,
      exceedsCeiling: false,
      exceedsCapacity: true,
    })
  })

  it("fails safe with a missing ceiling instead of throwing", () => {
    const projection = deriveAllocationReadProjection({
      rows: [row("dangling", "o-deleted", 90, "event_charges")],
      ceilings: new Map(),
    })

    expect(projection[0]).toMatchObject({
      scopeOutstandingMinor: 0,
      effectiveCapacityMinor: 0,
      appliedMinor: 0,
      unappliedMinor: 90,
      exceedsCeiling: true,
      exceedsCapacity: true,
    })
  })

  it("never emits a negative value and leaves the recorded amount untouched", () => {
    const projection = deriveAllocationReadProjection({
      rows: [row("a-1", "o-1", 40, "event_charges")],
      ceilings: ceilingMap(
        ceiling({
          attendeeId: "a-1",
          orderId: "o-1",
          eventChargesOutstandingMinor: -25,
          wholeOrderOutstandingMinor: -10,
        })
      ),
    })

    expect(projection[0].amountMinor).toBe(40)
    expect(projection[0].scopeOutstandingMinor).toBe(0)
    expect(projection[0].effectiveCapacityMinor).toBe(0)
    expect(projection[0].appliedMinor).toBe(0)
    expect(projection[0].unappliedMinor).toBe(40)
    expect(projection[0].unappliedMinor).toBeGreaterThanOrEqual(0)
  })
})

describe("allocation request digest", () => {
  it("is stable when the rows are reordered", async () => {
    const first = await digestAllocationEnvelope({
      donationId: "p-1",
      eventId: "e-1",
      operation: "allocate",
      payload: {
        rows: [
          { attendeeId: "b-1", amountMinor: 200, scope: "whole_order" },
          { attendeeId: "a-1", amountMinor: 100, scope: "event_charges" },
        ],
      },
    })
    const second = await digestAllocationEnvelope({
      donationId: "p-1",
      eventId: "e-1",
      operation: "allocate",
      payload: {
        rows: [
          { attendeeId: "a-1", amountMinor: 100, scope: "event_charges" },
          { attendeeId: "b-1", amountMinor: 200, scope: "whole_order" },
        ],
      },
    })

    expect(first).toBe(second)
  })

  it("changes when any amount, scope, target or operation changes", async () => {
    const base = {
      donationId: "p-1",
      eventId: "e-1",
      operation: "allocate",
      payload: {
        rows: [
          { attendeeId: "a-1", amountMinor: 100, scope: "event_charges" as const },
        ],
      },
    }
    const digest = await digestAllocationEnvelope(base)

    const changedAmount = await digestAllocationEnvelope({
      ...base,
      payload: {
        rows: [
          { attendeeId: "a-1", amountMinor: 101, scope: "event_charges" as const },
        ],
      },
    })
    const changedScope = await digestAllocationEnvelope({
      ...base,
      payload: {
        rows: [
          { attendeeId: "a-1", amountMinor: 100, scope: "whole_order" as const },
        ],
      },
    })
    const changedTarget = await digestAllocationEnvelope({
      ...base,
      payload: {
        rows: [
          { attendeeId: "a-2", amountMinor: 100, scope: "event_charges" as const },
        ],
      },
    })
    const changedOperation = await digestAllocationEnvelope({
      ...base,
      operation: "remove",
    })

    for (const other of [
      changedAmount,
      changedScope,
      changedTarget,
      changedOperation,
    ]) {
      expect(other).not.toBe(digest)
    }
  })

  it("produces a 64-character hex digest", async () => {
    const digest = await digestAllocationEnvelope({
      donationId: "p-1",
      eventId: "e-1",
      operation: "allocate",
      payload: { rows: [] },
    })

    expect(digest).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("distribution engine - equal split arithmetic and remainder (DON-03/D-05)", () => {
  it("splits 1000 across three equal-ceiling targets as 334/333/333 and names the first as the remainder recipient", () => {
    const ceilings = ceilingMap(
      ceiling({
        attendeeId: "t-1",
        orderId: "o-1",
        eventChargesOutstandingMinor: 1000,
        wholeOrderOutstandingMinor: 1000,
      }),
      ceiling({
        attendeeId: "t-2",
        orderId: "o-2",
        eventChargesOutstandingMinor: 1000,
        wholeOrderOutstandingMinor: 1000,
      }),
      ceiling({
        attendeeId: "t-3",
        orderId: "o-3",
        eventChargesOutstandingMinor: 1000,
        wholeOrderOutstandingMinor: 1000,
      })
    )

    const plan = buildDistributionPlan({
      method: "equal",
      availableMinor: 1000,
      targets: [
        target("t-1", "o-1", "event_charges"),
        target("t-2", "o-2", "event_charges"),
        target("t-3", "o-3", "event_charges"),
      ],
      ceilings,
    })

    expect(plan.breakdown.map((entry) => entry.amountMinor)).toEqual([
      334, 333, 333,
    ])
    expect(plan.totalAllocatedMinor).toBe(1000)
    expect(plan.leftoverMinor).toBe(0)
    // The largest-remainder step awards the single extra unit to the first
    // equal-weight target (stable selection-order tie-break) and says so.
    expect(plan.remainderMinor).toBe(1)
    expect(plan.remainderRecipientAttendeeIds).toEqual(["t-1"])
    expect(plan.breakdown[0].extraMinorUnits).toBe(1)
    expect(plan.breakdown[1].extraMinorUnits).toBe(0)
    expect(plan.breakdown[2].extraMinorUnits).toBe(0)
    expectPlanAccepted(plan, 1000, ceilings)
  })

  it("splits 1000 across four targets into 250 each with no remainder", () => {
    const ceilings = ceilingMap(
      ...["t-1", "t-2", "t-3", "t-4"].map((attendeeId, index) =>
        ceiling({
          attendeeId,
          orderId: `o-${index}`,
          eventChargesOutstandingMinor: 1000,
          wholeOrderOutstandingMinor: 1000,
        })
      )
    )

    const plan = buildDistributionPlan({
      method: "equal",
      availableMinor: 1000,
      targets: ["t-1", "t-2", "t-3", "t-4"].map((attendeeId, index) =>
        target(attendeeId, `o-${index}`, "event_charges")
      ),
      ceilings,
    })

    expect(plan.breakdown.map((entry) => entry.amountMinor)).toEqual([
      250, 250, 250, 250,
    ])
    expect(plan.remainderMinor).toBe(0)
    expect(plan.remainderRecipientAttendeeIds).toEqual([])
    expectPlanAccepted(plan, 1000, ceilings)
  })

  it("uses the submitted order for the breakdown and the rows", () => {
    const ceilings = ceilingMap(
      ceiling({
        attendeeId: "z-last",
        orderId: "o-1",
        eventChargesOutstandingMinor: 100,
        wholeOrderOutstandingMinor: 100,
      }),
      ceiling({
        attendeeId: "a-first",
        orderId: "o-2",
        eventChargesOutstandingMinor: 100,
        wholeOrderOutstandingMinor: 100,
      })
    )

    const plan = buildDistributionPlan({
      method: "equal",
      availableMinor: 200,
      targets: [
        target("z-last", "o-1", "event_charges"),
        target("a-first", "o-2", "event_charges"),
      ],
      ceilings,
    })

    expect(plan.breakdown.map((entry) => entry.attendeeId)).toEqual([
      "z-last",
      "a-first",
    ])
    expect(plan.rows.map((entry) => entry.attendeeId)).toEqual([
      "z-last",
      "a-first",
    ])
  })
})

describe("distribution engine - waterfall redistribution (D-06)", () => {
  it("redistributes a capped target's surplus across the remaining targets over multiple rounds", () => {
    const ceilings = ceilingMap(
      ceiling({
        attendeeId: "capped",
        orderId: "o-capped",
        eventChargesOutstandingMinor: 10,
        wholeOrderOutstandingMinor: 10,
      }),
      ceiling({
        attendeeId: "roomy-b",
        orderId: "o-b",
        eventChargesOutstandingMinor: 1000,
        wholeOrderOutstandingMinor: 1000,
      }),
      ceiling({
        attendeeId: "roomy-c",
        orderId: "o-c",
        eventChargesOutstandingMinor: 1000,
        wholeOrderOutstandingMinor: 1000,
      })
    )

    const plan = buildDistributionPlan({
      method: "equal",
      availableMinor: 100,
      targets: [
        target("capped", "o-capped", "event_charges"),
        target("roomy-b", "o-b", "event_charges"),
        target("roomy-c", "o-c", "event_charges"),
      ],
      ceilings,
    })

    // Round 1 offers the helper 100 (floors 33/33/33, extra unit -> index 0),
    // but `capped` can absorb only 10, so the unit the helper awarded it never
    // lands; round 2 redistributes the remaining 24 across the other two.
    expect(plan.breakdown.map((entry) => entry.amountMinor)).toEqual([10, 45, 45])
    expect(plan.totalAllocatedMinor).toBe(100)
    expect(plan.leftoverMinor).toBe(0)
    // THE regression guard: a capped target must never be reported as a
    // remainder recipient, because its awarded unit did not land.
    expect(plan.remainderMinor).toBe(0)
    expect(plan.remainderRecipientAttendeeIds).toEqual([])
    expectPlanAccepted(plan, 100, ceilings)
  })

  it("returns an unplaceable amount as leftover and never throws (DON-05)", () => {
    const ceilings = ceilingMap(
      ceiling({
        attendeeId: "small",
        orderId: "o-1",
        eventChargesOutstandingMinor: 10,
        wholeOrderOutstandingMinor: 10,
      }),
      ceiling({
        attendeeId: "medium",
        orderId: "o-2",
        eventChargesOutstandingMinor: 20,
        wholeOrderOutstandingMinor: 20,
      })
    )

    const plan = buildDistributionPlan({
      method: "equal",
      availableMinor: 100,
      targets: [
        target("small", "o-1", "event_charges"),
        target("medium", "o-2", "event_charges"),
      ],
      ceilings,
    })

    expect(plan.breakdown.map((entry) => entry.amountMinor)).toEqual([10, 20])
    expect(plan.totalAllocatedMinor).toBe(30)
    expect(plan.leftoverMinor).toBe(70)
    expect(plan.breakdown.every((entry) => entry.skipped === false)).toBe(true)
    expectPlanAccepted(plan, 100, ceilings)
  })
})

describe("distribution engine - ONE shared per-order pool, ANY scope", () => {
  // Order o-1 owes 200: attendee A 100 + attendee B 100, and because the
  // whole-order ceiling is attendee-agnostic BOTH read 200.
  const ceilings = ceilingMap(
    ceiling({
      attendeeId: "a",
      orderId: "o-1",
      eventChargesOutstandingMinor: 100,
      wholeOrderOutstandingMinor: 200,
    }),
    ceiling({
      attendeeId: "b",
      orderId: "o-1",
      eventChargesOutstandingMinor: 100,
      wholeOrderOutstandingMinor: 200,
    })
  )

  it("equal: two whole_order siblings split the 200 pool 100/100 and leave 200", () => {
    const plan = buildDistributionPlan({
      method: "equal",
      availableMinor: 400,
      targets: [target("a", "o-1"), target("b", "o-1")],
      ceilings,
    })

    expect(plan.breakdown.map((entry) => entry.amountMinor)).toEqual([100, 100])
    expect(plan.totalAllocatedMinor).toBe(200)
    expect(plan.leftoverMinor).toBe(200)
    // Never [{200}, {200}] — the rows total the ORDER outstanding.
    expect(orderTotalsMinor(plan).get("o-1")).toBe(200)
    for (const entry of plan.breakdown) {
      expect(entry.amountMinor).toBeLessThanOrEqual(entry.ceilingMinor)
    }
    expectPlanAccepted(plan, 400, ceilings)
  })

  it("largest_balance_first: the first sibling absorbs the whole pool and the second is skipped", () => {
    const plan = buildDistributionPlan({
      method: "largest_balance_first",
      availableMinor: 400,
      targets: [target("a", "o-1"), target("b", "o-1")],
      ceilings,
    })

    expect(plan.breakdown.map((entry) => entry.amountMinor)).toEqual([200, 0])
    expect(plan.totalAllocatedMinor).toBe(200)
    expect(plan.leftoverMinor).toBe(200)
    expect(orderTotalsMinor(plan).get("o-1")).toBe(200)
    expect(plan.breakdown[1].skipped).toBe(true)
    expect(plan.breakdown[1].skipReason).toBe("no_funds_remaining")
    expect(plan.rows).toHaveLength(1)
    expectPlanAccepted(plan, 400, ceilings)
  })

  it("equal: a mixed-scope pair still totals the order outstanding (CE-1 guard)", () => {
    const plan = buildDistributionPlan({
      method: "equal",
      availableMinor: 400,
      targets: [
        target("a", "o-1", "event_charges"),
        target("b", "o-1", "whole_order"),
      ],
      ceilings,
    })

    // A's headroom is min(order pool 200, its own cap 100) and B's is the pool,
    // so the pair totals 200 — never the 300 a whole_order-only pool would allow.
    expect(plan.breakdown.map((entry) => entry.amountMinor)).toEqual([100, 100])
    expect(plan.totalAllocatedMinor).toBe(200)
    expect(plan.leftoverMinor).toBe(200)
    expect(orderTotalsMinor(plan).get("o-1")).toBe(200)

    // The engine's own rows satisfy the validator's order-capacity rule …
    expectPlanAccepted(plan, 400, ceilings)

    // … whereas the over-capacity CE-1 plan the engine must never emit is
    // rejected (each row passes its own scope check, yet together 300 > 200).
    expectCode(
      () =>
        validateAllocationPlan({
          availableMinor: 300,
          rows: [
            row("a", "o-1", 100, "event_charges"),
            row("b", "o-1", 200, "whole_order"),
          ],
          ceilings,
          alreadyClaimedByOrder: new Map(),
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY
    )
  })
})

describe("distribution engine - LIVE pool clamp across orders (over-allocation reproduction)", () => {
  // One event, no payments, no other donations.
  //   O1 owes 300: A1/A2/A3 at 100 each  -> whole_order reads 300 for all three
  //   O2 owes 200: B1                     -> whole_order reads 200
  const ceilings = ceilingMap(
    ceiling({
      attendeeId: "a-1",
      orderId: "o-1",
      eventChargesOutstandingMinor: 100,
      wholeOrderOutstandingMinor: 300,
    }),
    ceiling({
      attendeeId: "a-2",
      orderId: "o-1",
      eventChargesOutstandingMinor: 100,
      wholeOrderOutstandingMinor: 300,
    }),
    ceiling({
      attendeeId: "a-3",
      orderId: "o-1",
      eventChargesOutstandingMinor: 100,
      wholeOrderOutstandingMinor: 300,
    }),
    ceiling({
      attendeeId: "b-1",
      orderId: "o-2",
      eventChargesOutstandingMinor: 200,
      wholeOrderOutstandingMinor: 200,
    })
  )

  const targets = [
    target("a-1", "o-1"),
    target("a-2", "o-1"),
    target("a-3", "o-1"),
    target("b-1", "o-2"),
  ]

  it("equal: the third O1 take is clamped by the order's LIVE pool", () => {
    const plan = buildDistributionPlan({
      method: "equal",
      availableMinor: 1000,
      targets,
      ceilings,
    })

    // Round 1's round-start snapshot would give every O1 target the full 300,
    // so a snapshot-only engine splits the 500 of round capacity across four
    // targets at 125 each and sends O1 to 375. The live clamp makes A3's take
    // 50 — the pool is already at 50 by then.
    expect(plan.breakdown.map((entry) => entry.amountMinor)).toEqual([
      125, 125, 50, 200,
    ])
    expect(plan.totalAllocatedMinor).toBe(500)
    expect(plan.leftoverMinor).toBe(500)
    expect(orderTotalsMinor(plan).get("o-1")).toBe(300)
    expect(orderTotalsMinor(plan).get("o-2")).toBe(200)
    // 55-02 truth 4: the engine's own rows must survive the validator.
    expectPlanAccepted(plan, 1000, ceilings)

    // The snapshot-only rows (A3 125) replay on O1 as 300 -> 175 -> 50 and are
    // rejected — the defect this test guards by name.
    expectCode(
      () =>
        validateAllocationPlan({
          availableMinor: 1000,
          rows: [
            row("a-1", "o-1", 125, "whole_order"),
            row("a-2", "o-1", 125, "whole_order"),
            row("a-3", "o-1", 125, "whole_order"),
            row("b-1", "o-2", 200, "whole_order"),
          ],
          ceilings,
          alreadyClaimedByOrder: new Map(),
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY
    )
  })

  it("largest_balance_first: A1 fills O1 to 300 and B1 fills O2 to 200; A2/A3 are skipped", () => {
    const plan = buildDistributionPlan({
      method: "largest_balance_first",
      availableMinor: 1000,
      targets,
      ceilings,
    })

    // Ranking is by each target's OWN whole_order balance: A1/A2/A3 tie at 300
    // in selection order, B1 is last at 200.
    expect(
      plan.breakdown.map((entry) => [entry.attendeeId, entry.amountMinor])
    ).toEqual([
      ["a-1", 300],
      ["a-2", 0],
      ["a-3", 0],
      ["b-1", 200],
    ])
    expect(plan.totalAllocatedMinor).toBe(500)
    expect(plan.leftoverMinor).toBe(500)
    expect(orderTotalsMinor(plan).get("o-1")).toBe(300)
    expect(orderTotalsMinor(plan).get("o-2")).toBe(200)
    expect(
      plan.breakdown.filter((entry) => entry.skipped).map((entry) => entry.attendeeId)
    ).toEqual(["a-2", "a-3"])
    expect(plan.breakdown[1].skipReason).toBe("no_funds_remaining")
    expect(plan.rows).toHaveLength(2)
    expectPlanAccepted(plan, 1000, ceilings)
  })
})

describe("distribution engine - largest-balance-first ranking (DON-04/D-08/D-09/D-20)", () => {
  it("fills targets in descending own-scope-balance order, not array order", () => {
    const ceilings = ceilingMap(
      ceiling({
        attendeeId: "small",
        orderId: "o-1",
        eventChargesOutstandingMinor: 100,
        wholeOrderOutstandingMinor: 100,
      }),
      ceiling({
        attendeeId: "large",
        orderId: "o-2",
        eventChargesOutstandingMinor: 500,
        wholeOrderOutstandingMinor: 500,
      }),
      ceiling({
        attendeeId: "middle",
        orderId: "o-3",
        eventChargesOutstandingMinor: 300,
        wholeOrderOutstandingMinor: 300,
      })
    )

    const plan = buildDistributionPlan({
      method: "largest_balance_first",
      availableMinor: 1000,
      targets: [
        target("small", "o-1"),
        target("large", "o-2"),
        target("middle", "o-3"),
      ],
      ceilings,
    })

    expect(
      plan.breakdown.map((entry) => [entry.attendeeId, entry.amountMinor])
    ).toEqual([
      ["large", 500],
      ["middle", 300],
      ["small", 100],
    ])
    expect(plan.totalAllocatedMinor).toBe(900)
    expect(plan.leftoverMinor).toBe(100)
    expectPlanAccepted(plan, 1000, ceilings)
  })

  it("ranks a zero-balance target last, skips it, and writes no row (D-20)", () => {
    const ceilings = ceilingMap(
      ceiling({
        attendeeId: "cleared",
        orderId: "o-1",
        eventChargesOutstandingMinor: 0,
        wholeOrderOutstandingMinor: 0,
      }),
      ceiling({
        attendeeId: "owing",
        orderId: "o-2",
        eventChargesOutstandingMinor: 250,
        wholeOrderOutstandingMinor: 250,
      })
    )

    const plan = buildDistributionPlan({
      method: "largest_balance_first",
      availableMinor: 250,
      targets: [target("cleared", "o-1"), target("owing", "o-2")],
      ceilings,
    })

    expect(plan.breakdown.map((entry) => entry.attendeeId)).toEqual([
      "owing",
      "cleared",
    ])
    const cleared = plan.breakdown[1]
    expect(cleared.amountMinor).toBe(0)
    expect(cleared.ceilingMinor).toBe(0)
    expect(cleared.skipped).toBe(true)
    expect(cleared.skipReason).toBe("zero_scope_balance")
    expect(plan.rows.map((entry) => entry.attendeeId)).toEqual(["owing"])
    expect(plan.totalAllocatedMinor).toBe(250)
    expect(plan.leftoverMinor).toBe(0)
  })

  it("breaks equal balances by submitted selection order (D-09)", () => {
    const ceilings = ceilingMap(
      ceiling({
        attendeeId: "first",
        orderId: "o-1",
        eventChargesOutstandingMinor: 100,
        wholeOrderOutstandingMinor: 100,
      }),
      ceiling({
        attendeeId: "second",
        orderId: "o-2",
        eventChargesOutstandingMinor: 100,
        wholeOrderOutstandingMinor: 100,
      })
    )

    const forward = buildDistributionPlan({
      method: "largest_balance_first",
      availableMinor: 100,
      targets: [target("first", "o-1"), target("second", "o-2")],
      ceilings,
    })
    expect(
      forward.breakdown.map((entry) => [entry.attendeeId, entry.amountMinor])
    ).toEqual([
      ["first", 100],
      ["second", 0],
    ])

    // Reversing the selection order reverses who absorbs the balance.
    const reversed = buildDistributionPlan({
      method: "largest_balance_first",
      availableMinor: 100,
      targets: [target("second", "o-2"), target("first", "o-1")],
      ceilings,
    })
    expect(
      reversed.breakdown.map((entry) => [entry.attendeeId, entry.amountMinor])
    ).toEqual([
      ["second", 100],
      ["first", 0],
    ])
  })

  it("ranks and caps by the SELECTED scope (D-08)", () => {
    // `a` has a small event_charges ceiling but a large whole_order one.
    const ceilings = ceilingMap(
      ceiling({
        attendeeId: "a",
        orderId: "o-1",
        eventChargesOutstandingMinor: 50,
        wholeOrderOutstandingMinor: 500,
      }),
      ceiling({
        attendeeId: "b",
        orderId: "o-2",
        eventChargesOutstandingMinor: 100,
        wholeOrderOutstandingMinor: 100,
      })
    )

    const byAttendeeScope = buildDistributionPlan({
      method: "largest_balance_first",
      availableMinor: 1000,
      targets: [
        target("a", "o-1", "event_charges"),
        target("b", "o-2", "event_charges"),
      ],
      ceilings,
    })
    // On the event_charges basis a (50) ranks BELOW b (100), so b fills first.
    expect(
      byAttendeeScope.breakdown.map((entry) => [
        entry.attendeeId,
        entry.amountMinor,
      ])
    ).toEqual([
      ["b", 100],
      ["a", 50],
    ])
    expect(byAttendeeScope.totalAllocatedMinor).toBe(150)
    expect(byAttendeeScope.leftoverMinor).toBe(850)

    const byOrderScope = buildDistributionPlan({
      method: "largest_balance_first",
      availableMinor: 1000,
      targets: [
        target("a", "o-1", "whole_order"),
        target("b", "o-2", "whole_order"),
      ],
      ceilings,
    })
    // On the whole_order basis a (500) outranks b (100) and absorbs the lot.
    expect(
      byOrderScope.breakdown.map((entry) => [
        entry.attendeeId,
        entry.amountMinor,
      ])
    ).toEqual([
      ["a", 500],
      ["b", 100],
    ])
    expect(byOrderScope.totalAllocatedMinor).toBe(600)
    expect(byOrderScope.leftoverMinor).toBe(400)
  })
})

describe("distribution engine - lower-level exports", () => {
  it("rankTargetsByScopeBalance ranks by own scope balance with a stable tie-break", () => {
    const ceilings = ceilingMap(
      ceiling({
        attendeeId: "small",
        orderId: "o-1",
        eventChargesOutstandingMinor: 10,
        wholeOrderOutstandingMinor: 1000,
      }),
      ceiling({
        attendeeId: "tie-a",
        orderId: "o-2",
        eventChargesOutstandingMinor: 500,
        wholeOrderOutstandingMinor: 500,
      }),
      ceiling({
        attendeeId: "tie-b",
        orderId: "o-3",
        eventChargesOutstandingMinor: 500,
        wholeOrderOutstandingMinor: 500,
      })
    )

    const ranked = rankTargetsByScopeBalance(
      [
        target("small", "o-1", "event_charges"),
        target("tie-a", "o-2", "event_charges"),
        target("tie-b", "o-3", "event_charges"),
      ],
      ceilings
    )

    expect(ranked.map((entry) => entry.attendeeId)).toEqual([
      "tie-a",
      "tie-b",
      "small",
    ])
  })

  it("runAllocationWaterfall honours a custom active selector without a second waterfall", () => {
    const ceilings = ceilingMap(
      ceiling({
        attendeeId: "a",
        orderId: "o-a",
        eventChargesOutstandingMinor: 100,
        wholeOrderOutstandingMinor: 100,
      }),
      ceiling({
        attendeeId: "b",
        orderId: "o-b",
        eventChargesOutstandingMinor: 100,
        wholeOrderOutstandingMinor: 100,
      })
    )

    const result = runAllocationWaterfall({
      totalMinor: 150,
      targets: [target("a", "o-a"), target("b", "o-b")],
      ceilings,
      weights: [1, 1],
      // Reverse priority: fill the LAST target first.
      activeSelector: (headroom) => {
        for (let index = headroom.length - 1; index >= 0; index--) {
          if (headroom[index] > 0) {
            return [index]
          }
        }
        return []
      },
    })

    expect(result.amountsByAttendeeId.get("b")).toBe(100)
    expect(result.amountsByAttendeeId.get("a")).toBe(50)
    expect(result.extraUnitsByAttendeeId.get("a")).toBe(0)
    expect(result.extraUnitsByAttendeeId.get("b")).toBe(0)
  })

  it("distributeEqually splits the shared order pool evenly across siblings", () => {
    const ceilings = ceilingMap(
      ceiling({
        attendeeId: "a",
        orderId: "o-1",
        eventChargesOutstandingMinor: 100,
        wholeOrderOutstandingMinor: 200,
      }),
      ceiling({
        attendeeId: "b",
        orderId: "o-1",
        eventChargesOutstandingMinor: 100,
        wholeOrderOutstandingMinor: 200,
      })
    )

    const result = distributeEqually({
      totalMinor: 400,
      targets: [target("a", "o-1"), target("b", "o-1")],
      ceilings,
    })

    expect(result.amountsByAttendeeId.get("a")).toBe(100)
    expect(result.amountsByAttendeeId.get("b")).toBe(100)
  })

  it("distributeLargestBalanceFirst fills the order pool in rank order", () => {
    const ceilings = ceilingMap(
      ceiling({
        attendeeId: "a",
        orderId: "o-1",
        eventChargesOutstandingMinor: 100,
        wholeOrderOutstandingMinor: 200,
      }),
      ceiling({
        attendeeId: "b",
        orderId: "o-1",
        eventChargesOutstandingMinor: 100,
        wholeOrderOutstandingMinor: 200,
      })
    )

    const result = distributeLargestBalanceFirst({
      totalMinor: 400,
      targets: [target("a", "o-1"), target("b", "o-1")],
      ceilings,
    })

    // Equal whole_order balances tie-break by selection order, so the first
    // target absorbs the whole 200 pool and the sibling sees it exhausted.
    expect(result.amountsByAttendeeId.get("a")).toBe(200)
    expect(result.amountsByAttendeeId.get("b")).toBe(0)
  })
})

describe("distribution engine - refusals", () => {
  const ceilings = ceilingMap(
    ceiling({
      attendeeId: "a",
      orderId: "o-1",
      eventChargesOutstandingMinor: 100,
      wholeOrderOutstandingMinor: 200,
    })
  )

  it("refuses an empty target list", () => {
    expectCode(
      () =>
        buildDistributionPlan({
          method: "equal",
          availableMinor: 100,
          targets: [],
          ceilings,
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_EMPTY_PLAN
    )
  })

  it("refuses a duplicate target", () => {
    expectCode(
      () =>
        buildDistributionPlan({
          method: "equal",
          availableMinor: 100,
          targets: [target("a", "o-1"), target("a", "o-1")],
          ceilings,
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_DUPLICATE_TARGET
    )
  })

  it("refuses an unknown target", () => {
    expectCode(
      () =>
        buildDistributionPlan({
          method: "equal",
          availableMinor: 100,
          targets: [target("missing", "o-1")],
          ceilings,
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_UNKNOWN_TARGET
    )
  })

  it("refuses a ceiling bound to a different order", () => {
    expectCode(
      () =>
        buildDistributionPlan({
          method: "equal",
          availableMinor: 100,
          targets: [target("a", "o-OTHER")],
          ceilings,
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_UNKNOWN_TARGET
    )
  })

  it("refuses a plan larger than MAX_ALLOCATION_PLAN_ROWS", () => {
    const targetCount = MAX_ALLOCATION_PLAN_ROWS + 1
    const bigTargets = Array.from({ length: targetCount }, (_unused, index) =>
      target(`a-${index}`, `o-${index}`)
    )
    const bigCeilings = ceilingMap(
      ...bigTargets.map((entry) =>
        ceiling({
          attendeeId: entry.attendeeId,
          orderId: entry.orderId,
          eventChargesOutstandingMinor: 100,
          wholeOrderOutstandingMinor: 100,
        })
      )
    )

    expectCode(
      () =>
        buildDistributionPlan({
          method: "equal",
          availableMinor: 1000,
          targets: bigTargets,
          ceilings: bigCeilings,
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_PLAN_TOO_LARGE
    )
  })

  it("refuses the manual method", () => {
    expectCode(
      () =>
        buildDistributionPlan({
          method: "manual",
          availableMinor: 100,
          targets: [target("a", "o-1")],
          ceilings,
        }),
      DONATION_ALLOCATION_ERROR_CODES.DONATION_ALLOCATION_UNSUPPORTED_METHOD
    )
  })
})

describe("distribution engine - invariants", () => {
  function expectDistributionInvariants(
    plan: DonationDistributionPlan,
    totalMinor: number
  ) {
    // The finiteness checks are the regression guard for the target-indexed
    // weight rule: a mis-indexed round weight makes the exact share NaN.
    for (const entry of plan.breakdown) {
      expect(Number.isFinite(entry.amountMinor)).toBe(true)
      expect(Number.isFinite(entry.ceilingMinor)).toBe(true)
      expect(Number.isFinite(entry.extraMinorUnits)).toBe(true)
      expect(Number.isInteger(entry.amountMinor)).toBe(true)
      expect(Number.isInteger(entry.ceilingMinor)).toBe(true)
      expect(Number.isInteger(entry.extraMinorUnits)).toBe(true)
      expect(entry.amountMinor).toBeLessThanOrEqual(entry.ceilingMinor)
    }

    expect(Number.isFinite(plan.totalAllocatedMinor)).toBe(true)
    expect(Number.isFinite(plan.leftoverMinor)).toBe(true)
    expect(Number.isFinite(plan.remainderMinor)).toBe(true)
    expect(Number.isInteger(plan.totalAllocatedMinor)).toBe(true)
    expect(Number.isInteger(plan.leftoverMinor)).toBe(true)
    expect(Number.isInteger(plan.remainderMinor)).toBe(true)
    expect(plan.totalAllocatedMinor + plan.leftoverMinor).toBe(totalMinor)

    for (const entry of plan.rows) {
      expect(entry.amountMinor).toBeGreaterThan(0)
    }

    expect(plan.totalAllocatedMinor).toBe(
      plan.rows.reduce((sum, entry) => sum + entry.amountMinor, 0)
    )
    expect(plan.remainderMinor).toBe(
      plan.breakdown.reduce((sum, entry) => sum + entry.extraMinorUnits, 0)
    )
  }

  it("holds for every shape the engine can produce", () => {
    const variants: Array<{
      plan: DonationDistributionPlan
      totalMinor: number
      ceilings: Map<string, AllocationCeiling>
    }> = []

    const threeBy1000 = ceilingMap(
      ...["t-1", "t-2", "t-3"].map((attendeeId, index) =>
        ceiling({
          attendeeId,
          orderId: `o-${index}`,
          eventChargesOutstandingMinor: 1000,
          wholeOrderOutstandingMinor: 1000,
        })
      )
    )
    variants.push({
      plan: buildDistributionPlan({
        method: "equal",
        availableMinor: 1000,
        targets: ["t-1", "t-2", "t-3"].map((attendeeId, index) =>
          target(attendeeId, `o-${index}`, "event_charges")
        ),
        ceilings: threeBy1000,
      }),
      totalMinor: 1000,
      ceilings: threeBy1000,
    })

    const capped = ceilingMap(
      ceiling({
        attendeeId: "capped",
        orderId: "o-1",
        eventChargesOutstandingMinor: 10,
        wholeOrderOutstandingMinor: 10,
      }),
      ceiling({
        attendeeId: "roomy",
        orderId: "o-2",
        eventChargesOutstandingMinor: 1000,
        wholeOrderOutstandingMinor: 1000,
      })
    )
    variants.push({
      plan: buildDistributionPlan({
        method: "equal",
        availableMinor: 100,
        targets: [
          target("capped", "o-1", "event_charges"),
          target("roomy", "o-2", "event_charges"),
        ],
        ceilings: capped,
      }),
      totalMinor: 100,
      ceilings: capped,
    })

    const siblings = ceilingMap(
      ceiling({
        attendeeId: "a",
        orderId: "o-1",
        eventChargesOutstandingMinor: 100,
        wholeOrderOutstandingMinor: 200,
      }),
      ceiling({
        attendeeId: "b",
        orderId: "o-1",
        eventChargesOutstandingMinor: 100,
        wholeOrderOutstandingMinor: 200,
      })
    )
    variants.push({
      plan: buildDistributionPlan({
        method: "equal",
        availableMinor: 400,
        targets: [target("a", "o-1"), target("b", "o-1")],
        ceilings: siblings,
      }),
      totalMinor: 400,
      ceilings: siblings,
    })
    variants.push({
      plan: buildDistributionPlan({
        method: "largest_balance_first",
        availableMinor: 400,
        targets: [target("a", "o-1"), target("b", "o-1")],
        ceilings: siblings,
      }),
      totalMinor: 400,
      ceilings: siblings,
    })

    const multiOrder = ceilingMap(
      ceiling({
        attendeeId: "a-1",
        orderId: "o-1",
        eventChargesOutstandingMinor: 100,
        wholeOrderOutstandingMinor: 300,
      }),
      ceiling({
        attendeeId: "a-2",
        orderId: "o-1",
        eventChargesOutstandingMinor: 100,
        wholeOrderOutstandingMinor: 300,
      }),
      ceiling({
        attendeeId: "a-3",
        orderId: "o-1",
        eventChargesOutstandingMinor: 100,
        wholeOrderOutstandingMinor: 300,
      }),
      ceiling({
        attendeeId: "b-1",
        orderId: "o-2",
        eventChargesOutstandingMinor: 200,
        wholeOrderOutstandingMinor: 200,
      })
    )
    const multiOrderTargets = [
      target("a-1", "o-1"),
      target("a-2", "o-1"),
      target("a-3", "o-1"),
      target("b-1", "o-2"),
    ]
    variants.push({
      plan: buildDistributionPlan({
        method: "equal",
        availableMinor: 1000,
        targets: multiOrderTargets,
        ceilings: multiOrder,
      }),
      totalMinor: 1000,
      ceilings: multiOrder,
    })
    variants.push({
      plan: buildDistributionPlan({
        method: "largest_balance_first",
        availableMinor: 1000,
        targets: multiOrderTargets,
        ceilings: multiOrder,
      }),
      totalMinor: 1000,
      ceilings: multiOrder,
    })

    for (const variant of variants) {
      expectDistributionInvariants(variant.plan, variant.totalMinor)
      // Every variant is also acceptable to the writer contract, so the engine
      // can never emit a plan `validateAllocationPlan` would reject.
      expectPlanAccepted(
        variant.plan,
        variant.totalMinor,
        variant.ceilings
      )
    }
  })
})
