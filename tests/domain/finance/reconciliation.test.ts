import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Must be set before the module is evaluated so that convexQuery captures the URL correctly
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CONVEX_URL = "http://convex.test"
})

import { getReconciliationRows } from "@/lib/domain/finance/reconciliation"

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
    orderedAt: "2024-03-01T10:00:00.000Z",
    refundedAt: null,
    buyerName: "Ada Lovelace",
    buyerEmail: "ada@example.com",
    ...overrides,
  }
}

const FROM = "2024-01-01T00:00:00.000Z"
const TO = "2024-12-31T23:59:59.000Z"

describe("getReconciliationRows", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("excludes paid orders from reconciliation output", async () => {
    installFetchMock({ orders: [makeOrder({ normalizedStatus: "paid" })], events: [] })

    const result = await getReconciliationRows({ from: FROM, to: TO })

    expect(result.rows).toHaveLength(0)
    expect(result.totals.rows).toBe(0)
    expect(result.totals.outstandingMinor).toBe(0)
  })

  it("includes a pending order with reason pending-payment", async () => {
    const pendingOrder = makeOrder({
      normalizedStatus: "pending",
      totalAmountMinor: 4000,
    })
    installFetchMock({ orders: [pendingOrder], events: [] })

    const result = await getReconciliationRows({ from: FROM, to: TO })

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].reasons).toContain("pending-payment")
    expect(result.rows[0].outstandingMinor).toBe(4000)
    expect(result.totals.outstandingMinor).toBe(4000)
  })

  it("includes a cancelled order with positive amount and reason cancelled-with-amount", async () => {
    const cancelledOrder = makeOrder({
      normalizedStatus: "cancelled",
      totalAmountMinor: 3000,
    })
    installFetchMock({ orders: [cancelledOrder], events: [] })

    const result = await getReconciliationRows({ from: FROM, to: TO })

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].reasons).toContain("cancelled-with-amount")
    expect(result.rows[0].outstandingMinor).toBe(3000)
  })

  it("does not flag a cancelled order with zero amount", async () => {
    const cancelledFree = makeOrder({
      normalizedStatus: "cancelled",
      totalAmountMinor: 0,
    })
    installFetchMock({ orders: [cancelledFree], events: [] })

    const result = await getReconciliationRows({ from: FROM, to: TO })

    expect(result.rows).toHaveLength(0)
  })

  it("includes a refunded order missing refundedAt with reason refund-without-refunded-at", async () => {
    const refundedNoDate = makeOrder({
      normalizedStatus: "refunded",
      refundedAt: null,
    })
    installFetchMock({ orders: [refundedNoDate], events: [] })

    const result = await getReconciliationRows({ from: FROM, to: TO })

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].reasons).toContain("refund-without-refunded-at")
  })

  it("does not flag a refunded order that has a refundedAt date", async () => {
    const refundedWithDate = makeOrder({
      normalizedStatus: "refunded",
      refundedAt: "2024-03-10T12:00:00.000Z",
    })
    installFetchMock({ orders: [refundedWithDate], events: [] })

    const result = await getReconciliationRows({ from: FROM, to: TO })

    expect(result.rows).toHaveLength(0)
  })

  it("adds missing-amount reason when totalAmountMinor is null", async () => {
    const noAmount = makeOrder({
      normalizedStatus: "pending",
      totalAmountMinor: null as unknown as number,
    })
    installFetchMock({ orders: [noAmount], events: [] })

    const result = await getReconciliationRows({ from: FROM, to: TO })

    expect(result.rows[0].reasons).toContain("missing-amount")
    expect(result.rows[0].reasons).toContain("pending-payment")
  })

  it("accumulates total outstanding amount across multiple flagged orders", async () => {
    const orders = [
      makeOrder({ providerOrderId: "ord_1", normalizedStatus: "pending", totalAmountMinor: 2000 }),
      makeOrder({ providerOrderId: "ord_2", normalizedStatus: "cancelled", totalAmountMinor: 1500 }),
    ]
    installFetchMock({ orders, events: [] })

    const result = await getReconciliationRows({ from: FROM, to: TO })

    expect(result.totals.outstandingMinor).toBe(3500)
    expect(result.totals.rows).toBe(2)
  })

  it("throws for an invalid from date", async () => {
    installFetchMock({ orders: [], events: [] })

    await expect(
      getReconciliationRows({ from: "not-a-date", to: TO })
    ).rejects.toThrow("Invalid 'from' date")
  })

  it("throws for an invalid to date", async () => {
    installFetchMock({ orders: [], events: [] })

    await expect(
      getReconciliationRows({ from: FROM, to: "not-a-date" })
    ).rejects.toThrow("Invalid 'to' date")
  })

  it("throws when from is after to", async () => {
    installFetchMock({ orders: [], events: [] })

    await expect(
      getReconciliationRows({ from: "2024-12-31T00:00:00Z", to: "2024-01-01T00:00:00Z" })
    ).rejects.toThrow("'from' must be less than or equal to 'to'")
  })

  it("normalises blank eventId to null in output filters", async () => {
    installFetchMock({ orders: [], events: [] })

    const result = await getReconciliationRows({ eventId: "   ", from: FROM, to: TO })

    expect(result.filters.eventId).toBeNull()
  })

  it("exposes availableEvents from the backend response", async () => {
    const events = [{ providerEventId: "evt_1", name: "Conf 2024" }]
    installFetchMock({ orders: [], events })

    const result = await getReconciliationRows({ from: FROM, to: TO })

    expect(result.availableEvents).toEqual(events)
  })

  it("passes the status filter through to the convex query", async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      const path = new URL(url).pathname.replace(/^\//, "")
      const data = path === "orders/getOrdersForReconciliation" ? [] : []
      return { ok: true, status: 200, json: async () => data, text: async () => "[]" } as Response
    })
    vi.stubGlobal("fetch", fetchSpy)

    await getReconciliationRows({ from: FROM, to: TO, status: "pending" })

    const orderCall = fetchSpy.mock.calls.find(([url]: [string]) =>
      (url as string).includes("getOrdersForReconciliation")
    )
    expect(orderCall).toBeTruthy()
    const body = JSON.parse(orderCall![1]?.body as string)
    expect(body.args.status).toBe("pending")
  })
})
