import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Must be set before the module is evaluated so that convexQuery captures the URL correctly
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CONVEX_URL = "http://convex.test"
})

import { getRevenueOverview } from "@/lib/domain/finance/reporting"

type ConvexOrder = {
  providerOrderId: string
  providerEventId: string
  eventName: string | null
  normalizedStatus: "paid" | "refunded" | "cancelled" | "pending"
  totalAmountMinor: number
  currency: string | null
  orderedAt: string | null
  refundedAt: string | null
  buyerName: string | null
  buyerEmail: string | null
}

type FetchMockState = {
  orders: ConvexOrder[]
  events: Array<{ providerEventId: string; name: string | null }>
}

function installFetchMock(state: FetchMockState) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname.replace(/^\//, "")
      let data: unknown

      if (path === "orders/getOrdersForReconciliation") {
        data = state.orders
      } else if (path === "events/getEventsForLedger") {
        data = state.events
      } else {
        data = []
      }

      return {
        ok: true,
        status: 200,
        json: async () => data,
        text: async () => JSON.stringify(data),
      } as Response
    })
  )
}

function makeOrder(overrides: Partial<ConvexOrder> = {}): ConvexOrder {
  return {
    providerOrderId: "ord_001",
    providerEventId: "evt_001",
    eventName: "Test Conference",
    normalizedStatus: "paid",
    totalAmountMinor: 5000,
    currency: "EUR",
    orderedAt: "2024-03-15T10:00:00.000Z",
    refundedAt: null,
    buyerName: "Ada Lovelace",
    buyerEmail: "ada@example.com",
    ...overrides,
  }
}

const FROM = "2024-01-01T00:00:00.000Z"
const TO = "2024-12-31T23:59:59.000Z"

describe("getRevenueOverview", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns zero totals when there are no orders", async () => {
    installFetchMock({ orders: [], events: [] })

    const result = await getRevenueOverview({ from: FROM, to: TO })

    expect(result.totals.grossMinor).toBe(0)
    expect(result.totals.paidMinor).toBe(0)
    expect(result.totals.refundedMinor).toBe(0)
    expect(result.totals.netMinor).toBe(0)
  })

  it("counts status occurrences correctly", async () => {
    const orders = [
      makeOrder({ providerOrderId: "o1", normalizedStatus: "paid" }),
      makeOrder({ providerOrderId: "o2", normalizedStatus: "paid" }),
      makeOrder({ providerOrderId: "o3", normalizedStatus: "refunded" }),
      makeOrder({ providerOrderId: "o4", normalizedStatus: "pending" }),
      makeOrder({ providerOrderId: "o5", normalizedStatus: "cancelled" }),
    ]
    installFetchMock({ orders, events: [] })

    const result = await getRevenueOverview({ from: FROM, to: TO })

    expect(result.statusCounts.paid).toBe(2)
    expect(result.statusCounts.refunded).toBe(1)
    expect(result.statusCounts.pending).toBe(1)
    expect(result.statusCounts.cancelled).toBe(1)
  })

  it("computes gross, paid, refunded, and net totals", async () => {
    const orders = [
      makeOrder({ providerOrderId: "o1", normalizedStatus: "paid", totalAmountMinor: 3000 }),
      makeOrder({ providerOrderId: "o2", normalizedStatus: "paid", totalAmountMinor: 2000 }),
      makeOrder({ providerOrderId: "o3", normalizedStatus: "refunded", totalAmountMinor: 1000 }),
      makeOrder({ providerOrderId: "o4", normalizedStatus: "cancelled", totalAmountMinor: 500 }),
    ]
    installFetchMock({ orders, events: [] })

    const result = await getRevenueOverview({ from: FROM, to: TO })

    expect(result.totals.grossMinor).toBe(6500)
    expect(result.totals.paidMinor).toBe(5000)
    expect(result.totals.refundedMinor).toBe(1000)
    expect(result.totals.netMinor).toBe(4000) // paid - refunded
  })

  it("groups orders into daily trend buckets", async () => {
    const orders = [
      makeOrder({ providerOrderId: "o1", orderedAt: "2024-03-15T09:00:00.000Z" }),
      makeOrder({ providerOrderId: "o2", orderedAt: "2024-03-15T18:00:00.000Z" }),
      makeOrder({ providerOrderId: "o3", orderedAt: "2024-03-16T08:00:00.000Z" }),
    ]
    installFetchMock({ orders, events: [] })

    const result = await getRevenueOverview({ from: FROM, to: TO })

    expect(result.trend).toHaveLength(2)
    const day15 = result.trend.find((t) => t.bucket === "2024-03-15")
    const day16 = result.trend.find((t) => t.bucket === "2024-03-16")
    expect(day15).toBeDefined()
    expect(day15!.orderCount).toBe(2)
    expect(day16!.orderCount).toBe(1)
  })

  it("skips orders with null orderedAt when building trend", async () => {
    const orders = [
      makeOrder({ providerOrderId: "o1", orderedAt: null }),
      makeOrder({ providerOrderId: "o2", orderedAt: "2024-03-15T08:00:00.000Z" }),
    ]
    installFetchMock({ orders, events: [] })

    const result = await getRevenueOverview({ from: FROM, to: TO })

    expect(result.trend).toHaveLength(1)
    expect(result.trend[0].bucket).toBe("2024-03-15")
  })

  it("labels the trend bucket with the event name", async () => {
    const orders = [
      makeOrder({ providerOrderId: "o1", eventName: "Conf 2024", orderedAt: "2024-03-15T08:00:00.000Z" }),
    ]
    installFetchMock({ orders, events: [] })

    const result = await getRevenueOverview({ from: FROM, to: TO })

    expect(result.trend[0].eventLabel).toBe("Conf 2024")
  })

  it("uses providerEventId as event label when eventName is blank", async () => {
    const orders = [
      makeOrder({ providerOrderId: "o1", eventName: null, providerEventId: "evt_xyz", orderedAt: "2024-03-15T08:00:00.000Z" }),
    ]
    installFetchMock({ orders, events: [] })

    const result = await getRevenueOverview({ from: FROM, to: TO })

    expect(result.trend[0].eventLabel).toBe("evt_xyz")
  })

  it("sets eventLabel to 'Multiple events' when a bucket has orders from different events", async () => {
    const orders = [
      makeOrder({ providerOrderId: "o1", eventName: "Event A", orderedAt: "2024-03-15T08:00:00.000Z" }),
      makeOrder({ providerOrderId: "o2", eventName: "Event B", orderedAt: "2024-03-15T09:00:00.000Z" }),
    ]
    installFetchMock({ orders, events: [] })

    const result = await getRevenueOverview({ from: FROM, to: TO })

    expect(result.trend[0].eventLabel).toBe("Multiple events")
  })

  it("sorts trend buckets chronologically", async () => {
    const orders = [
      makeOrder({ providerOrderId: "o1", orderedAt: "2024-03-20T08:00:00.000Z" }),
      makeOrder({ providerOrderId: "o2", orderedAt: "2024-03-10T08:00:00.000Z" }),
      makeOrder({ providerOrderId: "o3", orderedAt: "2024-03-15T08:00:00.000Z" }),
    ]
    installFetchMock({ orders, events: [] })

    const result = await getRevenueOverview({ from: FROM, to: TO })

    const buckets = result.trend.map((t) => t.bucket)
    expect(buckets).toEqual(["2024-03-10", "2024-03-15", "2024-03-20"])
  })

  it("throws for an invalid from date", async () => {
    installFetchMock({ orders: [], events: [] })

    await expect(
      getRevenueOverview({ from: "bad-date", to: TO })
    ).rejects.toThrow("Invalid 'from' date")
  })

  it("throws for an invalid to date", async () => {
    installFetchMock({ orders: [], events: [] })

    await expect(
      getRevenueOverview({ from: FROM, to: "bad-date" })
    ).rejects.toThrow("Invalid 'to' date")
  })

  it("throws when from is after to", async () => {
    installFetchMock({ orders: [], events: [] })

    await expect(
      getRevenueOverview({ from: "2024-12-31T00:00:00Z", to: "2024-01-01T00:00:00Z" })
    ).rejects.toThrow("'from' must be less than or equal to 'to'")
  })

  it("normalises blank eventId to null in applied filters", async () => {
    installFetchMock({ orders: [], events: [] })

    const result = await getRevenueOverview({ eventId: "   ", from: FROM, to: TO })

    expect(result.appliedFilters.eventId).toBeNull()
  })

  it("defaults trendGranularity to 'day'", async () => {
    installFetchMock({ orders: [], events: [] })

    const result = await getRevenueOverview({ from: FROM, to: TO })

    expect(result.appliedFilters.trendGranularity).toBe("day")
  })

  it("exposes availableEvents in the result", async () => {
    const events = [{ providerEventId: "evt_1", name: "My Event" }]
    installFetchMock({ orders: [], events })

    const result = await getRevenueOverview({ from: FROM, to: TO })

    expect(result.availableEvents).toEqual(events)
  })

  it("accumulates paidMinor and refundedMinor separately per bucket", async () => {
    const orders = [
      makeOrder({ providerOrderId: "o1", normalizedStatus: "paid", totalAmountMinor: 2000, orderedAt: "2024-03-15T08:00:00.000Z" }),
      makeOrder({ providerOrderId: "o2", normalizedStatus: "refunded", totalAmountMinor: 500, orderedAt: "2024-03-15T09:00:00.000Z" }),
    ]
    installFetchMock({ orders, events: [] })

    const result = await getRevenueOverview({ from: FROM, to: TO })

    expect(result.trend[0].paidMinor).toBe(2000)
    expect(result.trend[0].refundedMinor).toBe(500)
    expect(result.trend[0].netMinor).toBe(1500)
  })
})
