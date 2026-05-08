import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth/server", () => ({
  requireApiUser: vi.fn(),
}))

vi.mock("@/lib/convex/server", () => ({
  convexMutation: vi.fn(),
  convexQuery: vi.fn(),
}))

import { NextResponse } from "next/server"

import { GET, PATCH } from "@/app/api/dashboard/orders/[orderId]/route"
import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { convexMutation, convexQuery } from "@/lib/convex/server"

describe("/api/dashboard/orders/[orderId] route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 for unauthenticated GET requests", async () => {
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

    const response = await GET(
      new Request("http://localhost/api/dashboard/orders/order_1"),
      { params: Promise.resolve({ orderId: "order_1" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    })
    expect(convexQuery).not.toHaveBeenCalled()
  })

  it("returns order detail payload for authenticated GET requests", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })

    const detailPayload = {
      order: {
        id: "order_1",
        providerOrderId: "ORD-123",
        bookerName: "Ada Lovelace",
        bookerEmail: "ada@example.com",
        bookingRef: "BK-20260330-ABC123",
        eventId: "event_1",
        normalizedStatus: "pending" as const,
        isArchived: false,
        archivedAt: null,
        archiveReason: null,
        amountDueMinor: 2500,
        totalAmountMinor: 5000,
        orderedAt: "2026-03-01T10:00:00.000Z",
      },
      attendees: [],
    }

    vi.mocked(convexQuery).mockResolvedValue(detailPayload)

    const response = await GET(
      new Request("http://localhost/api/dashboard/orders/order_1"),
      { params: Promise.resolve({ orderId: " order_1 " }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual(detailPayload)
    expect(convexQuery).toHaveBeenCalledWith(api.orders.getOrderWithAttendees, {
      orderId: "order_1",
    })
  })

  it("rejects PATCH requests with unexpected fields", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })

    const response = await PATCH(
      new Request("http://localhost/api/dashboard/orders/order_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerOrderId: "ORD-123" }),
      }),
      { params: Promise.resolve({ orderId: "order_1" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: {
        code: "BAD_REQUEST",
        message:
          "Unexpected field 'providerOrderId'. Allowed fields: bookerName, bookerEmail, bookingRef, normalizedStatus, totalAmountMinor, orderedAt.",
      },
    })
    expect(convexMutation).not.toHaveBeenCalled()
  })

  it("returns the updated order detail payload after PATCH requests", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })

    const updatedDetail = {
      order: {
        id: "order_1",
        providerOrderId: "ORD-123",
        bookerName: "Ada Byron",
        bookerEmail: "ada@example.com",
        bookingRef: "BK-20260330-ABC123",
        eventId: "event_1",
        normalizedStatus: "paid" as const,
        isArchived: false,
        archivedAt: null,
        archiveReason: null,
        amountDueMinor: 0,
        totalAmountMinor: 5000,
        orderedAt: "2026-03-01T10:00:00.000Z",
      },
      attendees: [],
    }

    vi.mocked(convexMutation).mockResolvedValue("order_1")
    vi.mocked(convexQuery).mockResolvedValue(updatedDetail)

    const response = await PATCH(
      new Request("http://localhost/api/dashboard/orders/order_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookerName: "Ada Byron",
          normalizedStatus: "paid",
          totalAmountMinor: 5000,
        }),
      }),
      { params: Promise.resolve({ orderId: "order_1" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual(updatedDetail)
    expect(convexMutation).toHaveBeenCalledWith(api.orders.updateOrderDetails, {
      orderId: "order_1",
      bookerName: "Ada Byron",
      normalizedStatus: "paid",
      totalAmountMinor: 5000,
    })
  })
})
