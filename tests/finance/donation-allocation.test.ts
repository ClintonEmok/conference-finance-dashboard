import { describe, expect, it } from "vitest"

import {
  DONATION_ALLOCATION_ERROR_CODES,
  deriveAllocationReadProjection,
  deriveAllocationRemainingMinor,
  digestAllocationEnvelope,
  resolveScopeOutstandingMinor,
  sumRecordedAllocationMinor,
  validateAllocationPlan,
  type AllocationCeiling,
  type DonationAllocationPlanRow,
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
