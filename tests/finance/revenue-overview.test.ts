import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/convex/server", () => ({
  convexQuery: vi.fn(),
}))

import { convexQuery } from "@/lib/convex/server"
import { getRevenueOverview } from "@/lib/domain/finance/reporting"

/**
 * The finance summary reports standalone donations on TWO disjoint bases:
 *
 *  - cash received (`totals.paidMinor`) uses each donation's FULL
 *    `amountMinor` — the money did arrive;
 *  - donation INCOME (`totals.standaloneDonationMinor`) uses the
 *    server-derived `unallocatedRemainderMinor` only, with the allocated part
 *    exposed separately as `totals.standaloneAllocatedMinor` (it is already
 *    counted against its order/attendee through the canonical attribution).
 *
 * The load-bearing assertion is the identity
 * `standaloneDonationMinor + standaloneAllocatedMinor === Σ amountMinor`:
 * a failure means an amount was lost or counted twice on the summary.
 */
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
      standaloneDonationMinor: 0,
      standaloneAllocatedMinor: 0,
    })

    expect(result.donations).toEqual([
      expect.objectContaining({
         orderId: "order_1",
         providerOrderId: "ORD-1",
         donationMinor: 300,
         matchedAmountMinor: 7300,
         // The overpayment class has no allocations of its own.
         allocatedMinor: 0,
         unallocatedRemainderMinor: 0,
         type: "overpayment",
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
    // Cash received keeps the FULL standalone face value; donation income uses
    // only the server remainder. Nothing was lost: 150 + 250 === 400.
    expect(result.totals.paidMinor).toBe(7000)
  })

  it("includes standalone donations in totals and the daily trend on the remainder basis", async () => {
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
            // Partially allocated: 250 already counts against its order; 150 is
            // the event donation income.
            allocatedMinor: 250,
            unallocatedRemainderMinor: 150,
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
      // Cash received: the full face value.
      paidMinor: 400,
      netMinor: 400,
      // Donation income: the unallocated remainder only.
      standaloneDonationMinor: 150,
      // The allocated part, exposed separately instead of dropped.
      standaloneAllocatedMinor: 250,
    })
    // No amount lost or counted twice on the summary.
    expect(
      result.totals.standaloneDonationMinor +
        result.totals.standaloneAllocatedMinor
    ).toBe(400)
    expect(result.donations).toEqual([
      expect.objectContaining({
        type: "standalone",
        donationMinor: 400,
        allocatedMinor: 250,
        unallocatedRemainderMinor: 150,
        currency: "EUR",
      }),
    ])
    expect(result.trend[0]).toMatchObject({
      bucket: "2026-03-20",
      paidMinor: 400,
      netMinor: 400,
    })
  })

  it("reports each donation's composition without losing an amount", async () => {
    // (a) fully allocated, (b) partially allocated, (c) unallocated, plus an
    // overpaid order control whose class must stay separate.
    vi.mocked(convexQuery)
      .mockResolvedValueOnce([
        {
          orderId: "order_overpaid",
          providerOrderId: "ORD-OVER",
          eventId: "event-1",
          eventSlug: "conference",
          eventTitle: "Conference",
          normalizedStatus: "paid" as const,
          amountDueMinor: 100,
          matchedAmountMinor: 150,
          totalAmountMinor: 100,
          currency: "EUR",
          orderedAt: "2026-03-20T10:00:00.000Z",
          refundedAt: null,
          buyerName: "Over Payer",
          buyerEmail: "over@example.com",
        },
        {
          orderId: "order_pending",
          providerOrderId: "ORD-PEND",
          eventId: "event-1",
          eventSlug: "conference",
          eventTitle: "Conference",
          normalizedStatus: "pending" as const,
          amountDueMinor: 1000,
          matchedAmountMinor: 0,
          totalAmountMinor: 1000,
          currency: "EUR",
          orderedAt: "2026-03-20T11:00:00.000Z",
          refundedAt: null,
          buyerName: "Pend Ing",
          buyerEmail: "pend@example.com",
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
            _id: "donation_a",
            _creationTime: 1774001000000,
            source: "bank_transfer" as const,
            payerName: "Fully Allocated",
            amountMinor: 100,
            allocatedMinor: 100,
            unallocatedRemainderMinor: 0,
            paidAt: Date.parse("2026-03-20T14:00:00.000Z"),
            eventId: "event-1",
          },
          {
            _id: "donation_b",
            _creationTime: 1774002000000,
            source: "cash" as const,
            payerName: "Partially Allocated",
            amountMinor: 250,
            allocatedMinor: 100,
            unallocatedRemainderMinor: 150,
            paidAt: Date.parse("2026-03-20T15:00:00.000Z"),
            eventId: "event-1",
          },
          {
            _id: "donation_c",
            _creationTime: 1774003000000,
            source: "tikkie" as const,
            payerName: "Unallocated",
            amountMinor: 75,
            allocatedMinor: 0,
            unallocatedRemainderMinor: 75,
            paidAt: Date.parse("2026-03-20T16:00:00.000Z"),
            eventId: "event-1",
          },
        ],
        isDone: true,
        continueCursor: "",
      })

    const result = await getRevenueOverview({
      from: new Date("2026-03-01T00:00:00.000Z"),
      to: new Date("2026-03-31T23:59:59.999Z"),
    })

    const faceValueSum = 100 + 250 + 75

    // Income is the remainder sum: 0 + 150 + 75.
    expect(result.totals.standaloneDonationMinor).toBe(225)
    // The allocated part is exposed separately: 100 + 100 + 0.
    expect(result.totals.standaloneAllocatedMinor).toBe(200)
    // No amount lost or counted twice.
    expect(
      result.totals.standaloneDonationMinor +
        result.totals.standaloneAllocatedMinor
    ).toBe(faceValueSum)
    // Cash received still includes the FULL amounts (100 control order paid +
    // the three donations' face values).
    expect(result.totals.paidMinor).toBe(100 + faceValueSum)
    expect(result.totals.orderValueMinor).toBe(1100)
    // The overpayment class is its own figure and is never summed with either
    // standalone-donation figure.
    expect(result.totals.overpaidMinor).toBe(50)
    expect(
      result.totals.standaloneDonationMinor +
        result.totals.standaloneAllocatedMinor
    ).not.toBe(result.totals.overpaidMinor)
    // (The identity holds on the standalone classes only.)
    expect(
      result.totals.standaloneDonationMinor +
        result.totals.standaloneAllocatedMinor +
        result.totals.overpaidMinor
    ).toBe(faceValueSum + 50)

    // The overpaid control produces its own `overpayment` entry, with both
    // composition fields 0 (it has no allocations of its own).
    const overpaymentEntry = result.donations.find(
      (entry) => entry.type === "overpayment"
    )
    expect(overpaymentEntry).toBeDefined()
    expect(overpaymentEntry).toMatchObject({
      orderId: "order_overpaid",
      donationMinor: 50,
      allocatedMinor: 0,
      unallocatedRemainderMinor: 0,
      matchedAmountMinor: 150,
    })

    // Standalone rows carry the server composition verbatim; the listing stays
    // a donation list (`donationMinor` is the face value).
    const standaloneEntries = result.donations.filter(
      (entry) => entry.type === "standalone"
    )
    expect(standaloneEntries).toHaveLength(3)
    expect(
      standaloneEntries.map((entry) => ({
        donationMinor: entry.donationMinor,
        allocatedMinor: entry.allocatedMinor,
        unallocatedRemainderMinor: entry.unallocatedRemainderMinor,
      }))
    ).toEqual([
      { donationMinor: 250, allocatedMinor: 100, unallocatedRemainderMinor: 150 },
      { donationMinor: 100, allocatedMinor: 100, unallocatedRemainderMinor: 0 },
      { donationMinor: 75, allocatedMinor: 0, unallocatedRemainderMinor: 75 },
    ])

    // Every row's composition adds back to its own face value.
    for (const entry of result.donations) {
      expect(
        entry.allocatedMinor + entry.unallocatedRemainderMinor
      ).toBe(entry.type === "standalone" ? entry.donationMinor : 0)
    }
  })
})
