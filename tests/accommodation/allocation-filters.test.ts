import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/convex/server", () => ({
  convexQuery: vi.fn(),
  convexMutation: vi.fn(),
}))

import { convexQuery } from "@/lib/convex/server"
import { getRoomAllocationBoard } from "@/lib/domain/accommodation/assignments"
import {
  attendeeMatchesSignalFilters,
  hasFamilySignal,
} from "@/convex/accommodation"

describe("accommodation allocation signal filters", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("plumbs familyGroupId and location from domain filter inputs to Convex query args", async () => {
    vi.mocked(convexQuery).mockResolvedValueOnce({
      generatedAt: "2026-03-27T00:00:00.000Z",
      filters: {
        eventId: null,
        search: null,
        hotelId: null,
        roomTypeId: null,
        availability: "all",
        genderType: null,
        familyGroupId: "family-1",
        location: "Amsterdam",
        allocationPriority: null,
        hasPriority: null,
      },
      availableEvents: [],
      hotels: [],
      roomTypes: [],
      rooms: [],
      unassignedAttendees: [],
      summary: {
        totalRooms: 0,
        emptyRooms: 0,
        availableRooms: 0,
        fullRooms: 0,
        totalBeds: 0,
        occupiedBeds: 0,
        availableBeds: 0,
        unassignedAttendeesCount: 0,
      },
    })

    await getRoomAllocationBoard({
      familyGroupId: " family-1 ",
      location: " Amsterdam ",
    })

    expect(convexQuery).toHaveBeenCalledTimes(1)
    expect(vi.mocked(convexQuery).mock.calls[0]?.[1]).toMatchObject({
      familyGroupId: "family-1",
      location: "Amsterdam",
    })
  })

  it("filters attendees by location and family group id", () => {
    const attendee = {
      customAnswers: { location: " Amsterdam " },
      genderType: "FEMALE" as const,
      allocationPriority: "HIGH" as const,
    }

    expect(
      attendeeMatchesSignalFilters({
        attendee,
        attendeeFamilyGroupId: "family-1",
        filters: {
          familyGroupId: "family-1",
          location: "amsterdam",
        },
      })
    ).toBe(true)

    expect(
      attendeeMatchesSignalFilters({
        attendee,
        attendeeFamilyGroupId: "family-1",
        filters: { location: "rotterdam" },
      })
    ).toBe(false)

    expect(
      attendeeMatchesSignalFilters({
        attendee,
        attendeeFamilyGroupId: null,
        filters: { familyGroupId: "family-1" },
      })
    ).toBe(false)
  })

  it("computes hasFamily from explicit group first, then same-order fallback", () => {
    const attendeeCountByOrderId = new Map<string, number>([
      ["order-explicit", 1],
      ["order-fallback", 2],
      ["order-single", 1],
    ])

    expect(
      hasFamilySignal({
        attendeeId: "attendee-explicit",
        orderId: "order-explicit",
        attendeeFamilyGroupId: "family-1",
        attendeeCountByOrderId,
      })
    ).toBe(true)

    expect(
      hasFamilySignal({
        attendeeId: "attendee-fallback",
        orderId: "order-fallback",
        attendeeFamilyGroupId: null,
        attendeeCountByOrderId,
      })
    ).toBe(true)

    expect(
      hasFamilySignal({
        attendeeId: "attendee-single",
        orderId: "order-single",
        attendeeFamilyGroupId: null,
        attendeeCountByOrderId,
      })
    ).toBe(false)
  })
})
