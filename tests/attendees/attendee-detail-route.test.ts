import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth/server", () => ({
  requireApiUser: vi.fn(),
}))

vi.mock("@/lib/domain/finance/attendee-detail", () => ({
  getAttendeeDetail: vi.fn(),
}))

vi.mock("@/lib/convex/server", () => ({
  convexMutation: vi.fn(),
}))

import { NextResponse } from "next/server"

import { GET, PATCH } from "@/app/api/dashboard/attendees/[attendeeId]/route"
import { requireApiUser } from "@/lib/auth/server"
import { convexMutation } from "@/lib/convex/server"
import {
  getAttendeeDetail,
  type AttendeeDetail,
} from "@/lib/domain/finance/attendee-detail"

describe("/api/dashboard/attendees/[attendeeId] route", () => {
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
      new Request("http://localhost/api/dashboard/attendees/attendee_1"),
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
    expect(getAttendeeDetail).not.toHaveBeenCalled()
  })

  it("returns attendee detail payload for authenticated GET requests", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })

    const detailPayload: AttendeeDetail = {
      attendee: {
        id: "attendee_1",
        name: "Ada Lovelace",
        email: "ada@example.com",
        ticketTypeId: "ticket_type_1",
        ticketTypeLabel: "Weekend",
        ticketStatus: "issued",
        checkedInAt: null,
        providerIssuedTicketId: "issued_1",
        providerOrderId: null,
        providerEventId: null,
        amountDueMinor: 2500,
        tikkieAmountOverrideMinor: 2500,
      },
      signals: {
        genderType: "FEMALE",
        location: "Amsterdam",
        remarks: null,
        dietary: null,
        roommatePreference: null,
        allocationPriority: "NORMAL",
        priorityReason: null,
        ageGroup: null,
        ticketCategory: null,
      },
      familyGroup: null,
      event: {
        id: "event_1",
        name: "Conference",
      },
      order: {
        id: "order_1",
        providerOrderId: null,
        providerEventId: null,
        buyerName: "Ada Lovelace",
        buyerEmail: "ada@example.com",
        normalizedStatus: "pending" as const,
        orderedAt: "2026-03-01T10:00:00.000Z",
        amountDueMinor: 2500,
        totalAmountMinor: 5000,
      },
      finance: {
        outstandingAmountMinor: 2500,
        paidAmountMinor: 2500,
        overpaidAmountMinor: 0,
        installmentProgress: {
          totalLinks: 1,
          paidLinks: 0,
          openLinks: 1,
          expiredLinks: 0,
        },
      },
      tikkie: {
        latestLink: null,
        history: [],
        providerLastCheckedAt: null,
        latestLinkCheckState: null,
        generationDefaults: {
          amountMinor: 2500,
          expiryDate: "2026-03-31",
          description: "Balance",
          referenceId: "ref_1",
        },
        templateFallback: null,
        actions: {
          createEndpoint: "/api/dashboard/tikkie-links",
          listEndpoint: "/api/dashboard/tikkie-links?orderId=order_1",
          refreshEndpoint:
            "/api/dashboard/tikkie-links?orderId=order_1&refresh=1",
          updateOverrideEndpoint: "/api/dashboard/attendees/attendee_1",
        },
      },
      paymentHistory: [],
      roomStatus: {
        status: "unassigned" as const,
        roomLabel: null,
        hotelName: null,
        roomTypeLabel: null,
        expectedRoomTypeLabel: null,
      },
    }

    vi.mocked(getAttendeeDetail).mockResolvedValue(detailPayload)

    const response = await GET(
      new Request("http://localhost/api/dashboard/attendees/attendee_1"),
      { params: Promise.resolve({ attendeeId: " attendee_1 " }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual(detailPayload)
    expect(getAttendeeDetail).toHaveBeenCalledWith("attendee_1")
  })

  it("keeps PATCH updates available on the same route", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
    vi.mocked(convexMutation).mockResolvedValue({
      id: "attendee_1",
      tikkieAmountOverrideMinor: 1900,
    })

    const response = await PATCH(
      new Request("http://localhost/api/dashboard/attendees/attendee_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: "Amsterdam" }),
      }),
      { params: Promise.resolve({ attendeeId: "attendee_1" }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      attendee: {
        id: "attendee_1",
        tikkieAmountOverrideMinor: null,
        genderType: null,
        ticketTypeId: null,
        location: "Amsterdam",
      },
    })
    expect(convexMutation).toHaveBeenCalledTimes(1)
    expect(vi.mocked(convexMutation).mock.calls[0]?.[1]).toMatchObject({
      attendeeId: "attendee_1",
      location: "Amsterdam",
    })
  })
})
