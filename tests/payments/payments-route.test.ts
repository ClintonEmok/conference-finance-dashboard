import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

vi.mock("@/lib/auth/server", () => ({
  requireApiUser: vi.fn(),
}))

vi.mock("@/lib/convex/server", () => ({
  convexQuery: vi.fn(),
}))

vi.mock("@/lib/domain/finance/payments", () => ({
  listPayments: vi.fn(),
}))

import { GET } from "@/app/api/payments/route"
import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"
import { listPayments } from "@/lib/domain/finance/payments"

describe("/api/payments route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns shared unauthorized payload for unauthenticated requests", async () => {
    vi.mocked(requireApiUser).mockResolvedValue(
      NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
        },
        { status: 401 }
      )
    )

    const response = await GET(new Request("http://localhost/api/payments"))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    })
    expect(listPayments).not.toHaveBeenCalled()
    expect(convexQuery).not.toHaveBeenCalled()
  })

  it("enriches linked payments using provider order id lookup first", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
    vi.mocked(listPayments).mockResolvedValue({
      total: 1,
      payments: [
        {
          _id: "payment_1",
          source: "cash",
          sourceId: null,
          payerName: "Alice",
          payerAccountNumber: null,
          amountMinor: 4500,
          paidAt: Date.parse("2026-03-26T10:00:00.000Z"),
          orderId: "ORD-123",
          status: "manual_assignment",
          matchedAt: Date.parse("2026-03-26T10:05:00.000Z"),
          matchedBy: "user_1",
          reference: null,
          notes: null,
          providerPayload: null,
        },
      ],
    })

    vi.mocked(convexQuery).mockResolvedValue({
      _id: "jt7providerdoc",
      providerOrderId: "ORD-123",
      buyerName: "Alice Buyer",
      totalAmountMinor: 4500,
    })

    const response = await GET(new Request("http://localhost/api/payments"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(convexQuery).toHaveBeenCalledTimes(1)
    expect(convexQuery).toHaveBeenCalledWith(api.orders.getOrderByProviderId, {
      providerOrderId: "ORD-123",
    })
    expect(body.payments[0].order).toEqual({
      id: "jt7providerdoc",
      providerOrderId: "ORD-123",
      buyerName: "Alice Buyer",
      totalAmountMinor: 4500,
    })
  })

  it("falls back to Convex order id lookup when provider lookup misses", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
    vi.mocked(listPayments).mockResolvedValue({
      total: 1,
      payments: [
        {
          _id: "payment_2",
          source: "bank_transfer",
          sourceId: null,
          payerName: "Bob",
          payerAccountNumber: "NL11BANK",
          amountMinor: 3200,
          paidAt: Date.parse("2026-03-26T11:00:00.000Z"),
          orderId: "jt7legacyorderid",
          status: "manual_assignment",
          matchedAt: Date.parse("2026-03-26T11:05:00.000Z"),
          matchedBy: "user_1",
          reference: "REF",
          notes: null,
          providerPayload: null,
        },
      ],
    })

    vi.mocked(convexQuery).mockResolvedValueOnce(null).mockResolvedValueOnce({
      _id: "jt7legacyorderid",
      providerOrderId: "ORD-LEGACY",
      buyerName: "Bob Buyer",
      totalAmountMinor: 3200,
    })

    const response = await GET(new Request("http://localhost/api/payments"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(convexQuery).toHaveBeenNthCalledWith(
      1,
      api.orders.getOrderByProviderId,
      {
        providerOrderId: "jt7legacyorderid",
      }
    )
    expect(convexQuery).toHaveBeenNthCalledWith(2, api.orders.getOrderById, {
      orderId: "jt7legacyorderid",
    })
    expect(body.payments[0].order).toEqual({
      id: "jt7legacyorderid",
      providerOrderId: "ORD-LEGACY",
      buyerName: "Bob Buyer",
      totalAmountMinor: 3200,
    })
  })
})
