import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/convex/server", () => ({
  convexQuery: vi.fn(),
}))

import { convexQuery } from "@/lib/convex/server"
import {
  allocateMinorAmountByWeight,
  deriveBalanceAmounts,
  deriveDonationAmountMinor,
  deriveOrderAmountBreakdown,
  isOrderFullyPaid,
} from "@/lib/domain/finance/amounts"
import { getReconciliationRows } from "@/lib/domain/finance/reconciliation"

describe("money model", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("keeps zero-value attendee allocations visible in canonical breakdowns", () => {
    const breakdown = deriveOrderAmountBreakdown({
      selections: [
        {
          attendeeId: "attendee-paid",
          ticketTypeId: "ticket-paid",
          quantity: 1,
        },
        {
          attendeeId: "attendee-free",
          ticketTypeId: "ticket-free",
          quantity: 2,
        },
      ],
      ticketTypePriceById: new Map([
        ["ticket-paid", 1250],
        ["ticket-free", 0],
      ]),
    })

    expect(breakdown.amountDueMinor).toBe(1250)
    expect(breakdown.amountDueByAttendeeId.get("attendee-paid")).toBe(1250)
    expect(breakdown.amountDueByAttendeeId.get("attendee-free")).toBe(0)
  })

  it("collapses missing balance inputs to zero instead of NaN", () => {
    const balance = deriveBalanceAmounts(undefined as unknown as number, 2000)

    expect(balance.amountDueMinor).toBe(0)
    expect(balance.paidAmountMinor).toBe(2000)
    expect(balance.outstandingAmountMinor).toBe(0)
    expect(balance.overpaidAmountMinor).toBe(2000)
    expect(balance.donationAmountMinor).toBe(2000)
  })

  it("derives donation amount from a single order balance", () => {
    expect(deriveDonationAmountMinor(1500, 2200)).toBe(700)
  })

  it("treats fully covered orders as paid", () => {
    expect(isOrderFullyPaid(1500, 1500)).toBe(true)
    expect(isOrderFullyPaid(1500, 2000)).toBe(true)
    expect(isOrderFullyPaid(1500, 1499)).toBe(false)
  })

  it("derives reconciliation outstanding amounts from canonical money math only", async () => {
    vi.mocked(convexQuery)
      .mockResolvedValueOnce([
        {
          orderId: "order_1",
          providerOrderId: "provider_order_1",
          eventId: "event_1",
          eventSlug: "summer-conference",
          eventTitle: "Summer Conference",
          normalizedStatus: "pending" as const,
          amountDueMinor: null,
          totalAmountMinor: 5000,
          currency: "EUR",
          orderedAt: "2026-04-01T10:00:00.000Z",
          refundedAt: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          eventId: "event_1",
          slug: "summer-conference",
          title: "Summer Conference",
          startsAt: 1743494400000,
          currency: "EUR",
        },
      ])
      .mockResolvedValueOnce({
        page: [],
        isDone: true,
        continueCursor: "",
      })
      .mockResolvedValueOnce([
        {
          amountMinor: 2000,
          orderId: "order_1",
          status: "manual_assignment" as const,
        },
      ])

    const result = await getReconciliationRows({ eventId: "event_1" })

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].amountDueMinor).toBeNull()
    expect(result.rows[0].outstandingMinor).toBe(0)
    expect(result.totals.outstandingMinor).toBe(0)
  })

  it("still allocates weighted amounts deterministically", () => {
    const allocations = allocateMinorAmountByWeight(5, [
      { id: "a", weightMinor: 1 },
      { id: "b", weightMinor: 1 },
      { id: "c", weightMinor: 1 },
    ])

    expect([...allocations.values()].reduce((sum, value) => sum + value, 0)).toBe(5)
  })
})
