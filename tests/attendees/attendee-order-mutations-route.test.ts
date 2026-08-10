import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth/server", () => ({
  requireApiUser: vi.fn(),
}))

vi.mock("@/lib/convex/server", () => ({
  convexMutation: vi.fn(),
}))

import { NextResponse } from "next/server"

import { PATCH as PATCH_ACCOMMODATION } from "@/app/api/dashboard/attendees/[attendeeId]/accommodation/route"
import { POST as POST_MOVE } from "@/app/api/dashboard/attendees/[attendeeId]/move/route"
import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { convexMutation } from "@/lib/convex/server"

describe("/api/dashboard/attendees/[attendeeId]/accommodation route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 for unauthenticated PATCH requests", async () => {
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

    const response = await PATCH_ACCOMMODATION(
      new Request("http://localhost/api/dashboard/attendees/attendee_1/accommodation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: "event_1", occupancy: "shared" }),
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

  it("rejects PATCH requests with unexpected fields", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })

    const response = await PATCH_ACCOMMODATION(
      new Request("http://localhost/api/dashboard/attendees/attendee_1/accommodation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: "event_1", amountDueMinor: 999 }),
      }),
      { params: Promise.resolve({ attendeeId: "attendee_1" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: {
        code: "BAD_REQUEST",
        message:
          "Unexpected field 'amountDueMinor'. Allowed fields: eventId, occupancy, optionSelections, nightBeforeLevel, nightBeforeOccupancy.",
      },
    })
    expect(convexMutation).not.toHaveBeenCalled()
  })

  it("rejects invalid occupancy and malformed option selections", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })

    const invalidOccupancy = await PATCH_ACCOMMODATION(
      new Request("http://localhost/api/dashboard/attendees/attendee_1/accommodation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: "event_1", occupancy: "family" }),
      }),
      { params: Promise.resolve({ attendeeId: "attendee_1" }) }
    )
    expect(invalidOccupancy.status).toBe(400)
    expect(await invalidOccupancy.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Invalid occupancy. Expected one of: single, shared.",
      },
    })

    const invalidOption = await PATCH_ACCOMMODATION(
      new Request("http://localhost/api/dashboard/attendees/attendee_1/accommodation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: "event_1",
          occupancy: "shared",
          optionSelections: [{ optionKey: "cot", quantity: -1, nights: 2 }],
        }),
      }),
      { params: Promise.resolve({ attendeeId: "attendee_1" }) }
    )
    expect(invalidOption.status).toBe(400)
    expect(await invalidOption.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message:
          "Invalid optionSelections[0].quantity. Expected a non-negative integer.",
      },
    })
  })

  it("requires a nightBeforeLevel when a nightBeforeOccupancy is supplied", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })

    const response = await PATCH_ACCOMMODATION(
      new Request("http://localhost/api/dashboard/attendees/attendee_1/accommodation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: "event_1",
          occupancy: "shared",
          nightBeforeOccupancy: "shared",
        }),
      }),
      { params: Promise.resolve({ attendeeId: "attendee_1" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "nightBeforeOccupancy requires a nightBeforeLevel.",
      },
    })
    expect(convexMutation).not.toHaveBeenCalled()
  })

  it("maps a missing attendee mutation error to 404", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
    vi.mocked(convexMutation).mockRejectedValue(
      new Error("Attendee not found.")
    )

    const response = await PATCH_ACCOMMODATION(
      new Request("http://localhost/api/dashboard/attendees/attendee_1/accommodation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: "event_1", occupancy: "shared" }),
      }),
      { params: Promise.resolve({ attendeeId: "attendee_1" }) }
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

  it("forwards validated args and returns the canonical payload", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })

    const canonicalPayload = {
      attendeeId: "attendee_1",
      orderId: "order_1",
      selection: {
        categoryId: "category_standard",
        categoryCode: "standard",
        categoryLabel: "Standard",
        occupancy: "shared",
        nightCount: 2,
        nightBeforeLevel: null,
        nightBeforeOccupancy: null,
        options: [
          {
            optionKey: "superior_upgrade",
            label: "Superior upgrade",
            pricePerUnitMinor: 1000,
            quantity: 1,
            nights: 2,
          },
        ],
      },
      amountDueMinor: 11000,
    }
    vi.mocked(convexMutation).mockResolvedValue(canonicalPayload)

    const response = await PATCH_ACCOMMODATION(
      new Request("http://localhost/api/dashboard/attendees/attendee_1/accommodation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: "event_1",
          occupancy: "shared",
          optionSelections: [
            { optionKey: "superior_upgrade", quantity: 1, nights: 2 },
          ],
          nightBeforeLevel: "standard",
          nightBeforeOccupancy: "shared",
        }),
      }),
      { params: Promise.resolve({ attendeeId: " attendee_1 " }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual(canonicalPayload)
    expect(convexMutation).toHaveBeenCalledWith(
      api.attendees.setAttendeeAccommodation,
      {
        attendeeId: "attendee_1",
        eventId: "event_1",
        occupancy: "shared",
        optionSelections: [
          { optionKey: "superior_upgrade", quantity: 1, nights: 2 },
        ],
        nightBeforeLevel: "standard",
        nightBeforeOccupancy: "shared",
      }
    )
  })
})

describe("/api/dashboard/attendees/[attendeeId]/move route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 for unauthenticated POST requests", async () => {
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

    const response = await POST_MOVE(
      new Request("http://localhost/api/dashboard/attendees/attendee_1/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetOrderId: "order_2" }),
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

  it("requires targetOrderId", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })

    const response = await POST_MOVE(
      new Request("http://localhost/api/dashboard/attendees/attendee_1/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ attendeeId: "attendee_1" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "targetOrderId is required",
      },
    })
    expect(convexMutation).not.toHaveBeenCalled()
  })

  it("rejects unexpected fields", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })

    const response = await POST_MOVE(
      new Request("http://localhost/api/dashboard/attendees/attendee_1/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetOrderId: "order_2", amountDueMinor: 1 }),
      }),
      { params: Promise.resolve({ attendeeId: "attendee_1" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Unexpected field 'amountDueMinor'. Allowed fields: targetOrderId.",
      },
    })
    expect(convexMutation).not.toHaveBeenCalled()
  })

  it("maps a cross-event mutation error to 400", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
    vi.mocked(convexMutation).mockRejectedValue(
      new Error("Orders must belong to the same event")
    )

    const response = await POST_MOVE(
      new Request("http://localhost/api/dashboard/attendees/attendee_1/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetOrderId: "order_2" }),
      }),
      { params: Promise.resolve({ attendeeId: "attendee_1" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Orders must belong to the same event",
      },
    })
  })

  it("forwards the target and returns the canonical move payload", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })

    const movePayload = {
      orderId: "order_2",
      sourceAmountDueMinor: 0,
      targetAmountDueMinor: 11000,
    }
    vi.mocked(convexMutation).mockResolvedValue(movePayload)

    const response = await POST_MOVE(
      new Request("http://localhost/api/dashboard/attendees/attendee_1/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetOrderId: " order_2 " }),
      }),
      { params: Promise.resolve({ attendeeId: "attendee_1" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, ...movePayload })
    expect(convexMutation).toHaveBeenCalledWith(
      api.attendees.moveAttendeeToOrder,
      {
        attendeeId: "attendee_1",
        targetOrderId: "order_2",
      }
    )
  })
})
