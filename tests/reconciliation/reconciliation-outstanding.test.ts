import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/convex/server", () => ({
  convexQuery: vi.fn(),
}))

import { convexQuery } from "@/lib/convex/server"
import { getReconciliationRows } from "@/lib/domain/finance/reconciliation"

/**
 * The reconciliation consumer reads the CANONICAL row fields:
 * `matchedAmountMinor` (the row's canonical paid, including allocation credit)
 * and the standalone donation's `unallocatedRemainderMinor`. It never rebuilds a
 * matched total locally (`buildMatchedTotalsByOrderId` and the
 * `payments.getPayments` read are gone from the module) and never offsets the
 * full donation amount — the allocated portion already reduced its target
 * order's outstanding.
 */
const baseOrder = {
  providerOrderId: "ORD-1",
  orderId: "order-1",
  eventId: "event-1",
  eventSlug: "conference",
  eventTitle: "Conference",
  normalizedStatus: "pending",
  amountDueMinor: 1000,
  matchedAmountMinor: 0,
  totalAmountMinor: 1000,
  currency: "EUR",
  orderedAt: "2026-03-20T10:00:00.000Z",
  refundedAt: null,
}

const emptyDonationsPage = { page: [], isDone: true, continueCursor: "" }

describe("getReconciliationRows outstanding totals", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reduces outstanding to zero when the canonical matched amount covers the order", async () => {
    vi.mocked(convexQuery)
      .mockResolvedValueOnce([{ ...baseOrder, matchedAmountMinor: 1000 }])
      .mockResolvedValueOnce([
        { eventId: "event-1", slug: "conference", title: "Conference" },
      ])
      .mockResolvedValueOnce(emptyDonationsPage)

    const result = await getReconciliationRows()

    expect(result.totals.outstandingMinor).toBe(0)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      providerOrderId: "ORD-1",
      amountDueMinor: 1000,
      outstandingMinor: 0,
      reasons: ["pending-payment"],
    })
  })

  it("consumes the server-provided canonical matched amount for a legacy provider order id", async () => {
    vi.mocked(convexQuery)
      .mockResolvedValueOnce([
        {
          ...baseOrder,
          providerOrderId: "ORD-LEGACY",
          amountDueMinor: 900,
          matchedAmountMinor: 700,
          totalAmountMinor: 900,
        },
      ])
      .mockResolvedValueOnce([
        { eventId: "event-1", slug: "conference", title: "Conference" },
      ])
      .mockResolvedValueOnce(emptyDonationsPage)

    const result = await getReconciliationRows()

    expect(result.totals.outstandingMinor).toBe(200)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.amountDueMinor).toBe(900)
    expect(result.rows[0]?.outstandingMinor).toBe(200)
  })

  it("keeps missing amounts explicit and does not inflate outstanding", async () => {
    vi.mocked(convexQuery)
      .mockResolvedValueOnce([
        {
          ...baseOrder,
          providerOrderId: null,
          amountDueMinor: null,
          matchedAmountMinor: 0,
          totalAmountMinor: null,
        },
      ])
      .mockResolvedValueOnce([
        { eventId: "event-1", slug: "conference", title: "Conference" },
      ])
      .mockResolvedValueOnce(emptyDonationsPage)

    const result = await getReconciliationRows()

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      providerOrderId: null,
      amountDueMinor: null,
      totalAmountMinor: null,
      outstandingMinor: 0,
      reasons: ["missing-amount", "pending-payment"],
    })
  })

  it("offsets displayed outstanding by the standalone donation's unallocated remainder only", async () => {
    vi.mocked(convexQuery)
      .mockResolvedValueOnce([{ ...baseOrder, matchedAmountMinor: 0 }])
      .mockResolvedValueOnce([
        { eventId: "event-1", slug: "conference", title: "Conference" },
      ])
      .mockResolvedValueOnce({
        page: [
          {
            _id: "donation_1",
            _creationTime: 1,
            source: "cash" as const,
            payerName: "Supporter",
            amountMinor: 400,
            // 250 is already allocated to its target order/attendee through the
            // canonical attribution; only 150 is still unlinked money.
            allocatedMinor: 250,
            unallocatedRemainderMinor: 150,
            paidAt: Date.parse("2026-03-20T14:00:00.000Z"),
            eventId: "event-1",
          },
        ],
        isDone: true,
        continueCursor: "",
      })

    const result = await getReconciliationRows({
      from: new Date("2026-03-01T00:00:00.000Z"),
      to: new Date("2026-03-31T23:59:59.999Z"),
    })

    expect(result.totals).toMatchObject({
      outstandingMinor: 850,
      standaloneDonationMinor: 150,
    })
    expect(result.rows[0]?.outstandingMinor).toBe(850)
  })

  it("never subtracts an allocation twice from a canonical row that already cleared it", async () => {
    // The row's canonical matched amount already cleared the order (due 200 /
    // matched 200). The donation's allocated 250 is inside that 200 and must not
    // be offset again, and the donation's remainder may only offset rows that
    // still owe money — the row stays at 0 and never goes negative.
    vi.mocked(convexQuery)
      .mockResolvedValueOnce([
        {
          ...baseOrder,
          orderId: "order-alloc",
          amountDueMinor: 200,
          matchedAmountMinor: 200,
          totalAmountMinor: 200,
        },
      ])
      .mockResolvedValueOnce([
        { eventId: "event-1", slug: "conference", title: "Conference" },
      ])
      .mockResolvedValueOnce({
        page: [
          {
            _id: "donation_2",
            _creationTime: 2,
            source: "cash" as const,
            payerName: "Supporter",
            amountMinor: 400,
            allocatedMinor: 250,
            unallocatedRemainderMinor: 150,
            paidAt: Date.parse("2026-03-20T14:00:00.000Z"),
            eventId: "event-1",
          },
        ],
        isDone: true,
        continueCursor: "",
      })

    const result = await getReconciliationRows({
      from: new Date("2026-03-01T00:00:00.000Z"),
      to: new Date("2026-03-31T23:59:59.999Z"),
    })

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.outstandingMinor).toBe(0)
    expect(result.totals.outstandingMinor).toBe(0)
    expect(result.totals.standaloneDonationMinor).toBe(150)
  })
})
