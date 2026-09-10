import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

vi.mock("@/lib/auth/server", () => ({
  requireApiUser: vi.fn(),
}))

vi.mock("@/lib/convex/server", () => ({
  convexMutation: vi.fn(),
}))

import { DELETE } from "@/app/api/payments/[id]/route"
import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { convexMutation } from "@/lib/convex/server"

describe("/api/payments/[id] DELETE route", () => {
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

    const response = await DELETE(
      new Request("http://localhost/api/payments/payment_1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "payment_1" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    })
    expect(convexMutation).not.toHaveBeenCalled()
  })

  it("deletes an unassigned manual payment for authenticated requests", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
    vi.mocked(convexMutation).mockResolvedValue("payment_1")

    const response = await DELETE(
      new Request("http://localhost/api/payments/payment_1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "payment_1" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(convexMutation).toHaveBeenCalledWith(api.payments.deletePayment, {
      paymentId: "payment_1",
    })
  })

  it("returns 404 when the payment does not exist", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
    vi.mocked(convexMutation).mockRejectedValue(new Error("Payment not found"))

    const response = await DELETE(
      new Request("http://localhost/api/payments/payment_missing", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "payment_missing" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Payment not found",
      },
    })
  })

  it("returns 400 for guarded payment rows (assigned or synced)", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
    vi.mocked(convexMutation).mockRejectedValue(
      new Error("Only unassigned payments can be deleted")
    )

    const response = await DELETE(
      new Request("http://localhost/api/payments/payment_1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "payment_1" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Only unassigned payments can be deleted",
      },
    })
  })

  it("returns 500 for unexpected failures", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
    vi.mocked(convexMutation).mockRejectedValue(new Error("boom"))

    const response = await DELETE(
      new Request("http://localhost/api/payments/payment_1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "payment_1" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to delete payment",
      },
    })
  })
})