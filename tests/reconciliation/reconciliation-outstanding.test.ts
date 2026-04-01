import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/convex/server", () => ({
  convexQuery: vi.fn(),
}))

import { convexQuery } from "@/lib/convex/server"
import { getReconciliationRows } from "@/lib/domain/finance/reconciliation"

const baseOrder = {
  providerOrderId: "ORD-1",
  orderId: "jt7order1",
  eventId: "event-1",
  eventSlug: "conference",
  eventTitle: "Conference",
  normalizedStatus: "pending",
  amountDueMinor: 1000,
  totalAmountMinor: 1000,
  currency: "EUR",
  orderedAt: "2026-03-20T10:00:00.000Z",
  refundedAt: null,
}

describe("getReconciliationRows outstanding totals", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reduces outstanding to zero when matched payments cover the provider order", async () => {
    vi.mocked(convexQuery)
      .mockResolvedValueOnce([baseOrder])
      .mockResolvedValueOnce([
        { eventId: "event-1", slug: "conference", title: "Conference" },
      ])
      .mockResolvedValueOnce([
        {
          amountMinor: 400,
          orderId: "ORD-1",
          status: "manual_assignment",
        },
        {
          amountMinor: 600,
          orderId: "ORD-1",
          status: "auto_matched",
        },
        {
          amountMinor: 100,
          orderId: "ORD-1",
          status: "unassigned",
        },
      ])

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

  it("uses legacy Convex order ids as fallback to resolve provider order matching", async () => {
    vi.mocked(convexQuery)
      .mockResolvedValueOnce([
        {
          ...baseOrder,
          providerOrderId: "ORD-LEGACY",
          amountDueMinor: 900,
          totalAmountMinor: 900,
        },
      ])
      .mockResolvedValueOnce([
        { eventId: "event-1", slug: "conference", title: "Conference" },
      ])
      .mockResolvedValueOnce([
        {
          amountMinor: 700,
          orderId: "jt7vzc9k9xyzlegacyid",
          status: "manual_assignment",
        },
      ])
      .mockResolvedValueOnce({
        _id: "jt7vzc9k9xyzlegacyid",
        providerOrderId: "ORD-LEGACY",
      })

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
          totalAmountMinor: null,
        },
      ])
      .mockResolvedValueOnce([
        { eventId: "event-1", slug: "conference", title: "Conference" },
      ])
      .mockResolvedValueOnce([])

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
})
