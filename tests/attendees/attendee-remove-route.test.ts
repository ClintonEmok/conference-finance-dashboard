import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

vi.mock("@/lib/auth/server", () => ({
  requireApiUser: vi.fn(),
}))

vi.mock("@/lib/convex/server", () => ({
  convexMutation: vi.fn(),
}))

import { DELETE } from "@/app/api/dashboard/attendees/[attendeeId]/remove/route"
import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { convexMutation } from "@/lib/convex/server"

describe("/api/dashboard/attendees/[attendeeId]/remove DELETE route", () => {
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
      new Request("http://localhost/api/dashboard/attendees/attendee_1/remove", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ attendeeId: "attendee_1" }) }
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

  it("forwards the attendee and returns the canonical removal payload", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })

    const removePayload = {
      attendeeId: "attendee_1",
      orderId: "order_1",
      remainingAttendees: 2,
      amountDueMinor: 6000,
    }
    vi.mocked(convexMutation).mockResolvedValue(removePayload)

    const response = await DELETE(
      new Request("http://localhost/api/dashboard/attendees/attendee_1/remove", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ attendeeId: " attendee_1 " }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, ...removePayload })
    expect(convexMutation).toHaveBeenCalledWith(
      api.attendees.removeAttendeeFromOrder as any,
      {
        attendeeId: "attendee_1",
      }
    )
  })

  it("returns 404 when the attendee does not exist", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
    vi.mocked(convexMutation).mockRejectedValue(new Error("Attendee not found."))

    const response = await DELETE(
      new Request("http://localhost/api/dashboard/attendees/attendee_missing/remove", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ attendeeId: "attendee_missing" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Attendee not found",
      },
    })
  })

  it("returns 400 when the order would lose its last attendee", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
    vi.mocked(convexMutation).mockRejectedValue(
      new Error("An order must retain at least one attendee.")
    )

    const response = await DELETE(
      new Request("http://localhost/api/dashboard/attendees/attendee_1/remove", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ attendeeId: "attendee_1" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "An order must retain at least one attendee.",
      },
    })
  })
})