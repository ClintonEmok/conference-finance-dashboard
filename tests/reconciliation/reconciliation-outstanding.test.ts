import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/convex/server", () => ({
  convexQuery: vi.fn(),
}))

import { convexQuery } from "@/lib/convex/server"
import { getReconciliationRows } from "@/lib/domain/finance/reconciliation"

const baseOrder = {
  providerOrderId: "ORD-1",
  providerEventId: "event-1",
  eventName: "Conference",
  normalizedStatus: "pending",
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
        { providerEventId: "event-1", name: "Conference" },
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
          totalAmountMinor: 900,
        },
      ])
      .mockResolvedValueOnce([
        { providerEventId: "event-1", name: "Conference" },
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
    expect(result.rows[0]?.outstandingMinor).toBe(200)
  })
})
