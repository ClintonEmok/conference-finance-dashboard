import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/convex/server", () => ({
  convexQuery: vi.fn(),
}))

import { convexQuery } from "@/lib/convex/server"
import { getRevenueOverview } from "@/lib/domain/finance/reporting"

describe("getRevenueOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses derived order value instead of persisted total amount", async () => {
    vi.mocked(convexQuery)
      .mockResolvedValueOnce([
        {
          orderId: "order_1",
          providerOrderId: "ORD-1",
          eventId: "event-1",
          eventSlug: "conference",
          eventTitle: "Conference",
          normalizedStatus: "paid" as const,
          amountDueMinor: 7000,
          matchedAmountMinor: 7300,
          totalAmountMinor: 1000,
          currency: "EUR",
          orderedAt: "2026-03-20T10:00:00.000Z",
          refundedAt: null,
          buyerName: "Alice Brown",
          buyerEmail: "alice@example.com",
        },
        {
          orderId: "order_2",
          providerOrderId: "ORD-2",
          eventId: "event-1",
          eventSlug: "conference",
          eventTitle: "Conference",
          normalizedStatus: "refunded" as const,
          amountDueMinor: 2000,
          matchedAmountMinor: 2000,
          totalAmountMinor: 9999,
          currency: "EUR",
          orderedAt: "2026-03-20T12:00:00.000Z",
          refundedAt: null,
          buyerName: "Bob Smith",
          buyerEmail: "bob@example.com",
        },
      ])
      .mockResolvedValueOnce([
        {
          eventId: "event-1",
          slug: "conference",
          title: "Conference",
          startsAt: 1742428800000,
          currency: "EUR",
        },
      ])
      .mockResolvedValueOnce({
        page: [],
        isDone: true,
        continueCursor: "",
      })

    const result = await getRevenueOverview({
      from: new Date("2026-03-01T00:00:00.000Z"),
      to: new Date("2026-03-31T23:59:59.999Z"),
    })

    expect(result.totals).toMatchObject({
      orderValueMinor: 9000,
      paidMinor: 7000,
      refundedMinor: 2000,
      netMinor: 5000,
      overpaidMinor: 300,
    })

    expect(result.donations).toEqual([
      expect.objectContaining({
         orderId: "order_1",
         providerOrderId: "ORD-1",
         donationMinor: 300,
         matchedAmountMinor: 7300,
       }),
    ])

    expect(result.trend).toHaveLength(1)
    expect(result.trend[0]).toMatchObject({
      bucket: "2026-03-20",
      eventLabel: "Conference",
      orderValueMinor: 9000,
      paidMinor: 7000,
      refundedMinor: 2000,
      netMinor: 5000,
      overpaidMinor: 300,
      orderCount: 2,
    })
  })

  it("includes standalone donations in totals and the daily trend", async () => {
    vi.mocked(convexQuery)
      .mockResolvedValueOnce([
        {
          orderId: "order_1",
          providerOrderId: "ORD-1",
          eventId: "event-1",
          eventSlug: "conference",
          eventTitle: "Conference",
          normalizedStatus: "pending" as const,
          amountDueMinor: 1000,
          matchedAmountMinor: 0,
          totalAmountMinor: 1000,
          currency: "EUR",
          orderedAt: "2026-03-20T10:00:00.000Z",
          refundedAt: null,
          buyerName: "Alice Brown",
          buyerEmail: "alice@example.com",
        },
      ])
      .mockResolvedValueOnce([
        {
          eventId: "event-1",
          slug: "conference",
          title: "Conference",
          startsAt: 1742428800000,
          currency: "EUR",
        },
      ])
      .mockResolvedValueOnce({
        page: [
          {
            _id: "donation_1",
            _creationTime: 1774000000000,
            source: "bank_transfer" as const,
            payerName: "Supporter",
            amountMinor: 400,
            paidAt: Date.parse("2026-03-20T14:00:00.000Z"),
            eventId: "event-1",
            notes: "General support",
          },
        ],
        isDone: true,
        continueCursor: "",
      })

    const result = await getRevenueOverview({
      from: new Date("2026-03-01T00:00:00.000Z"),
      to: new Date("2026-03-31T23:59:59.999Z"),
    })

    expect(result.totals).toMatchObject({
      paidMinor: 400,
      netMinor: 400,
      standaloneDonationMinor: 400,
    })
    expect(result.donations).toEqual([
      expect.objectContaining({
        type: "standalone",
        donationMinor: 400,
        currency: "EUR",
      }),
    ])
    expect(result.trend[0]).toMatchObject({
      bucket: "2026-03-20",
      paidMinor: 400,
      netMinor: 400,
    })
  })
})
