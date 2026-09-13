import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

vi.mock("@/lib/auth/server", () => ({ requireApiUser: vi.fn() }))
vi.mock("@/lib/domain/finance/order-ledger", () => ({ getOrderLedger: vi.fn() }))

import { GET } from "@/app/api/dashboard/orders/route"
import { requireApiUser } from "@/lib/auth/server"
import { getOrderLedger } from "@/lib/domain/finance/order-ledger"

const ledger = {
  generatedAt: "2026-09-10T00:00:00.000Z",
  filters: { eventId: "event-1", from: null, to: null, status: null, location: null, page: 1, pageSize: 25, search: "alice", searchCursor: "s:cursor" },
  availableEvents: [],
  page: { number: 1, size: 25, totalRows: null, totalPages: null, nextCursor: "s:next", hasNextPage: true },
  totals: { amountDueMinor: 1000, matchedAmountMinor: 0, outstandingAmountMinor: 1000 },
  rows: [{ orderId: "canonical-order", providerOrderId: "provider-order", eventId: "event-1", eventSlug: "event", eventTitle: "Event", normalizedStatus: "pending", isArchived: false, archivedAt: null, archiveReason: null, amountDueMinor: 1000, totalAmountMinor: 1000, currency: "EUR", orderedAt: null, buyerName: "Alice", buyerEmail: "alice@example.com" }],
}

describe("/api/dashboard/orders route", () => {
  beforeEach(() => vi.clearAllMocks())

  it("checks auth before calling the ledger domain", async () => {
    vi.mocked(requireApiUser).mockResolvedValue(NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 }))
    const response = await GET(new Request("http://localhost/api/dashboard/orders?search=alice"))
    expect(response.status).toBe(401)
    expect(getOrderLedger).not.toHaveBeenCalled()
  })

  it("trims and forwards event-scoped cursor search", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user-1" })
    vi.mocked(getOrderLedger).mockResolvedValue(ledger as never)
    const response = await GET(new Request("http://localhost/api/dashboard/orders?eventId=event-1&search=%20%20Alice%20%20&searchCursor=s%3Acursor"))
    expect(response.status).toBe(200)
    expect(getOrderLedger).toHaveBeenCalledWith(expect.objectContaining({ eventId: "event-1", search: "Alice", searchCursor: "s:cursor" }))
    expect((await response.json()).rows[0].orderId).toBe("canonical-order")
  })

  it("rejects oversized search and cursor with offset pagination before domain call", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user-1" })
    const tooLong = "x".repeat(513)
    expect((await GET(new Request(`http://localhost/api/dashboard/orders?search=${tooLong}`))).status).toBe(400)
    expect((await GET(new Request("http://localhost/api/dashboard/orders?page=2&searchCursor=s%3Acursor"))).status).toBe(400)
    expect(getOrderLedger).not.toHaveBeenCalled()
  })

  it("maps domain cursor validation failures to the established 400 shape", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user-1" })
    vi.mocked(getOrderLedger).mockRejectedValue(new Error("Invalid search continuation cursor."))
    const response = await GET(new Request("http://localhost/api/dashboard/orders?search=alice&searchCursor=bad"))
    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe("BAD_REQUEST")
  })
})
