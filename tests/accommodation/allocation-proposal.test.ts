import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/convex/server", () => ({
  convexQuery: vi.fn(),
  convexMutation: vi.fn(),
}))

import { convexQuery } from "@/lib/convex/server"
import type { RoomAllocationBoard } from "@/lib/domain/accommodation/assignments"
import { generateAllocationProposal } from "@/lib/domain/accommodation/assignments"

function buildBoard(
  overrides: Partial<RoomAllocationBoard>
): RoomAllocationBoard {
  return {
    generatedAt: "2026-03-27T00:00:00.000Z",
    filters: {
      eventId: null,
      search: null,
      hotelId: null,
      roomTypeId: null,
      availability: "all",
      genderType: null,
      familyGroupId: null,
      location: null,
      allocationPriority: null,
      hasPriority: null,
    },
    availableEvents: [],
    hotels: [{ id: "hotel-1", name: "Main Hotel", assignedEventIds: [] }],
    roomTypes: [{ id: "type-1", label: "Shared", defaultCapacity: 2 }],
    rooms: [],
    unassignedAttendees: [],
    submissionQueueRows: [],
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
    ...overrides,
  }
}

describe("allocation proposal compatibility strategy", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("keeps family/order attendees together when feasible and counts cohesive groups", async () => {
    vi.mocked(convexQuery).mockResolvedValueOnce(
      buildBoard({
        rooms: [
          {
            id: "room-1",
            label: "A-101",
            capacity: 2,
            occupiedBeds: 0,
            availableBeds: 2,
            availability: "empty",
            notes: null,
            hotel: { id: "hotel-1", name: "Main Hotel", city: "Amsterdam" },
            roomType: { id: "type-1", label: "Shared", defaultCapacity: 2 },
            occupants: [],
          },
          {
            id: "room-2",
            label: "B-201",
            capacity: 2,
            occupiedBeds: 0,
            availableBeds: 2,
            availability: "empty",
            notes: null,
            hotel: { id: "hotel-1", name: "Main Hotel", city: "Amsterdam" },
            roomType: { id: "type-1", label: "Shared", defaultCapacity: 2 },
            occupants: [],
          },
        ],
        unassignedAttendees: [
          {
            attendeeId: "attendee-1",
            attendeeName: "Older Sibling",
            attendeeEmail: null,
            providerOrderId: "order-family",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            genderType: "FEMALE",
            allocationPriority: "HIGH",
            location: null,
            remarks: null,
            hasFamily: true,
          },
          {
            attendeeId: "attendee-2",
            attendeeName: "Younger Sibling",
            attendeeEmail: null,
            providerOrderId: "order-family",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            genderType: "FEMALE",
            allocationPriority: "HIGH",
            location: null,
            remarks: null,
            hasFamily: true,
          },
        ],
      })
    )

    const proposal = await generateAllocationProposal({ eventId: "event-1" })

    expect(proposal.suggestions).toHaveLength(2)
    expect(proposal.suggestions[0]?.roomId).toBe("room-1")
    expect(proposal.suggestions[1]?.roomId).toBe("room-1")
    expect(proposal.summary.familyGroupsKeptTogether).toBe(1)
    expect(proposal.suggestions[1]?.reason.toLowerCase()).toContain("family")
    expect(proposal.suggestions[0]?.reason).not.toContain("Available room with")
  })

  it("rejects clearly incompatible gender mixing when no alternate room exists", async () => {
    vi.mocked(convexQuery).mockResolvedValueOnce(
      buildBoard({
        rooms: [
          {
            id: "room-1",
            label: "A-101",
            capacity: 2,
            occupiedBeds: 0,
            availableBeds: 2,
            availability: "empty",
            notes: null,
            hotel: { id: "hotel-1", name: "Main Hotel", city: "Amsterdam" },
            roomType: { id: "type-1", label: "Shared", defaultCapacity: 2 },
            occupants: [],
          },
        ],
        unassignedAttendees: [
          {
            attendeeId: "attendee-male",
            attendeeName: "Daniel",
            attendeeEmail: null,
            providerOrderId: "order-a",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            genderType: "MALE",
            allocationPriority: "HIGH",
            location: null,
            remarks: null,
            hasFamily: false,
          },
          {
            attendeeId: "attendee-female",
            attendeeName: "Hannah",
            attendeeEmail: null,
            providerOrderId: "order-b",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            genderType: "FEMALE",
            allocationPriority: "HIGH",
            location: null,
            remarks: null,
            hasFamily: false,
          },
        ],
      })
    )

    const proposal = await generateAllocationProposal({ eventId: "event-1" })

    expect(proposal.suggestions).toHaveLength(1)
    expect(proposal.suggestions[0]?.attendeeId).toBe("attendee-male")
    expect(proposal.unplacedAttendees).toHaveLength(1)
    expect(proposal.unplacedAttendees[0]?.attendeeId).toBe("attendee-female")
    expect(proposal.unplacedAttendees[0]?.reason.toLowerCase()).toContain(
      "gender"
    )
  })

  it("prioritizes critical attendees before lower-priority names", async () => {
    vi.mocked(convexQuery).mockResolvedValueOnce(
      buildBoard({
        rooms: [
          {
            id: "room-1",
            label: "A-101",
            capacity: 1,
            occupiedBeds: 0,
            availableBeds: 1,
            availability: "empty",
            notes: null,
            hotel: { id: "hotel-1", name: "Main Hotel", city: "Amsterdam" },
            roomType: { id: "type-1", label: "Shared", defaultCapacity: 2 },
            occupants: [],
          },
          {
            id: "room-2",
            label: "B-201",
            capacity: 1,
            occupiedBeds: 0,
            availableBeds: 1,
            availability: "empty",
            notes: null,
            hotel: { id: "hotel-1", name: "Main Hotel", city: "Amsterdam" },
            roomType: { id: "type-1", label: "Shared", defaultCapacity: 2 },
            occupants: [],
          },
        ],
        unassignedAttendees: [
          {
            attendeeId: "attendee-normal",
            attendeeName: "Alice",
            attendeeEmail: null,
            providerOrderId: "order-z",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            genderType: "UNKNOWN",
            allocationPriority: "NORMAL",
            location: null,
            remarks: null,
            hasFamily: false,
          },
          {
            attendeeId: "attendee-critical",
            attendeeName: "Zoe",
            attendeeEmail: null,
            providerOrderId: "order-a",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            genderType: "UNKNOWN",
            allocationPriority: "CRITICAL",
            location: null,
            remarks: null,
            hasFamily: false,
          },
        ],
      })
    )

    const proposal = await generateAllocationProposal({ eventId: "event-1" })

    expect(proposal.suggestions).toHaveLength(2)
    expect(proposal.suggestions[0]?.attendeeId).toBe("attendee-critical")
    expect(proposal.suggestions[0]?.reason).toContain("priority CRITICAL")
  })
})
