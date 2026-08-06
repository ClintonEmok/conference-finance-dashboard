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

/** Server-owned payment projection fields shared by every board row. */
function paymentFields(
  paymentState: "paid" | "partial" | "unpaid" | null = null
) {
  return {
    paymentState,
    amountDueMinor: null,
    paidAmountMinor: null,
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
            pendingAssignments: [],
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
            pendingAssignments: [],
          },
        ],
        unassignedAttendees: [
          {
            attendeeId: "attendee-1",
            attendeeName: "Older Sibling",
            attendeeEmail: null,
            orderId: "order-family",
            providerOrderId: "order-family",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            allocatedRoomTypeId: null,
            genderType: "FEMALE",
            allocationPriority: "HIGH",
            location: null,
            remarks: null,
            hasFamily: true,
            ...paymentFields(),
          },
          {
            attendeeId: "attendee-2",
            attendeeName: "Younger Sibling",
            attendeeEmail: null,
            orderId: "order-family",
            providerOrderId: "order-family",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            allocatedRoomTypeId: null,
            genderType: "FEMALE",
            allocationPriority: "HIGH",
            location: null,
            remarks: null,
            hasFamily: true,
            ...paymentFields(),
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
            pendingAssignments: [],
          },
        ],
        unassignedAttendees: [
          {
            attendeeId: "attendee-male",
            attendeeName: "Daniel",
            attendeeEmail: null,
            orderId: "order-a",
            providerOrderId: "order-a",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            allocatedRoomTypeId: null,
            genderType: "MALE",
            allocationPriority: "HIGH",
            location: null,
            remarks: null,
            hasFamily: false,
            ...paymentFields(),
          },
          {
            attendeeId: "attendee-female",
            attendeeName: "Hannah",
            attendeeEmail: null,
            orderId: "order-b",
            providerOrderId: "order-b",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            allocatedRoomTypeId: null,
            genderType: "FEMALE",
            allocationPriority: "HIGH",
            location: null,
            remarks: null,
            hasFamily: false,
            ...paymentFields(),
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

  it("honors buyer room suggestions before the greedy availability order", async () => {
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
            pendingAssignments: [],
          },
          {
            id: "room-2",
            label: "B-201",
            capacity: 2,
            occupiedBeds: 1,
            availableBeds: 1,
            availability: "available",
            notes: null,
            hotel: { id: "hotel-1", name: "Main Hotel", city: "Amsterdam" },
            roomType: { id: "type-1", label: "Shared", defaultCapacity: 2 },
            occupants: [
              {
                attendeeId: "attendee-occupied",
                attendeeName: "Existing Guest",
                attendeeEmail: null,
                orderId: "order-occupied",
                providerOrderId: "order-occupied",
                providerEventId: "event-1",
                eventName: "Camp",
                ticketTypeLabel: null,
                ...paymentFields(),
              },
            ],
            pendingAssignments: [],
          },
        ],
        buyerSuggestions: [
          {
            assignmentId: "assignment-1",
            attendeeId: "attendee-suggested",
            attendeeName: "Suggested Guest",
            attendeeEmail: null,
            roomId: "room-1",
            roomLabel: "A-101",
            hotelName: "Main Hotel",
            assignmentIntent: "assign",
            sortOrder: 0,
            ...paymentFields(),
          },
        ],
        unassignedAttendees: [
          {
            attendeeId: "attendee-suggested",
            attendeeName: "Suggested Guest",
            attendeeEmail: null,
            orderId: "order-suggested",
            providerOrderId: "order-suggested",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            allocatedRoomTypeId: null,
            genderType: "UNKNOWN",
            allocationPriority: "NORMAL",
            location: null,
            remarks: null,
            hasFamily: false,
            ...paymentFields(),
          },
        ],
      })
    )

    const proposal = await generateAllocationProposal({ eventId: "event-1" })

    expect(proposal.suggestions).toHaveLength(1)
    expect(proposal.suggestions[0]?.roomId).toBe("room-1")
    expect(proposal.suggestions[0]?.reason.toLowerCase()).toContain(
      "buyer room suggestion"
    )
  })

  it("does not treat roommate avoid as a hard placement constraint", async () => {
    vi.mocked(convexQuery).mockResolvedValueOnce(
      buildBoard({
        rooms: [
          {
            id: "room-1",
            label: "A-101",
            capacity: 2,
            occupiedBeds: 1,
            availableBeds: 1,
            availability: "available",
            notes: null,
            hotel: { id: "hotel-1", name: "Main Hotel", city: "Amsterdam" },
            roomType: { id: "type-1", label: "Shared", defaultCapacity: 2 },
            occupants: [
              {
                attendeeId: "attendee-existing",
                attendeeName: "Jamie",
                attendeeEmail: "jamie@example.com",
                orderId: "order-existing",
                providerOrderId: "order-existing",
                providerEventId: "event-1",
                eventName: "Camp",
                ticketTypeLabel: null,
                ...paymentFields(),
              },
            ],
            pendingAssignments: [],
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
            pendingAssignments: [],
          },
        ],
        unassignedAttendees: [
          {
            attendeeId: "attendee-new",
            attendeeName: "Morgan",
            attendeeEmail: "morgan@example.com",
            orderId: "order-new",
            providerOrderId: "order-new",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            allocatedRoomTypeId: null,
            genderType: "UNKNOWN",
            allocationPriority: "NORMAL",
            location: null,
            remarks: null,
            roommatePreference: null,
            roommateAvoid: "Jamie",
            hasFamily: false,
            ...paymentFields(),
          },
        ],
      })
    )

    const proposal = await generateAllocationProposal({ eventId: "event-1" })

    expect(proposal.suggestions).toHaveLength(1)
    expect(proposal.suggestions[0]?.roomId).toBe("room-1")
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
            pendingAssignments: [],
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
            pendingAssignments: [],
          },
        ],
        unassignedAttendees: [
          {
            attendeeId: "attendee-normal",
            attendeeName: "Alice",
            attendeeEmail: null,
            orderId: "order-z",
            providerOrderId: "order-z",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            allocatedRoomTypeId: null,
            genderType: "UNKNOWN",
            allocationPriority: "NORMAL",
            location: null,
            remarks: null,
            hasFamily: false,
            ...paymentFields(),
          },
          {
            attendeeId: "attendee-critical",
            attendeeName: "Zoe",
            attendeeEmail: null,
            orderId: "order-a",
            providerOrderId: "order-a",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            allocatedRoomTypeId: null,
            genderType: "UNKNOWN",
            allocationPriority: "CRITICAL",
            location: null,
            remarks: null,
            hasFamily: false,
            ...paymentFields(),
          },
        ],
      })
    )

    const proposal = await generateAllocationProposal({ eventId: "event-1" })

    expect(proposal.suggestions).toHaveLength(2)
    expect(proposal.suggestions[0]?.attendeeId).toBe("attendee-critical")
    expect(proposal.suggestions[0]?.reason).toContain("priority CRITICAL")
  })

  it("keeps payment state on generated suggestion and unplaced rows", async () => {
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
            pendingAssignments: [],
          },
        ],
        unassignedAttendees: [
          {
            attendeeId: "attendee-paid",
            attendeeName: "Paid Guest",
            attendeeEmail: null,
            orderId: "order-paid",
            providerOrderId: "order-paid",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            allocatedRoomTypeId: null,
            genderType: "UNKNOWN",
            allocationPriority: "NORMAL",
            location: null,
            remarks: null,
            hasFamily: false,
            ...paymentFields("paid"),
          },
          {
            attendeeId: "attendee-unpaid",
            attendeeName: "Unpaid Guest",
            attendeeEmail: null,
            orderId: "order-unpaid",
            providerOrderId: "order-unpaid",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            allocatedRoomTypeId: null,
            genderType: "MALE",
            allocationPriority: "NORMAL",
            location: null,
            remarks: null,
            hasFamily: false,
            ...paymentFields("unpaid"),
          },
        ],
      })
    )

    const proposal = await generateAllocationProposal({ eventId: "event-1" })

    expect(proposal.suggestions).toHaveLength(1)
    expect(proposal.suggestions[0]?.paymentState).toBe("paid")
    expect(proposal.unplacedAttendees).toHaveLength(1)
    expect(proposal.unplacedAttendees[0]?.paymentState).toBe("unpaid")
  })

  it("places a paid LOW attendee before an unpaid CRITICAL attendee", async () => {
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
            pendingAssignments: [],
          },
        ],
        unassignedAttendees: [
          {
            attendeeId: "attendee-unpaid-critical",
            attendeeName: "Unpaid Critical",
            attendeeEmail: null,
            orderId: "order-unpaid",
            providerOrderId: "order-unpaid",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            allocatedRoomTypeId: null,
            genderType: "MALE",
            allocationPriority: "CRITICAL",
            location: null,
            remarks: null,
            hasFamily: false,
            ...paymentFields("unpaid"),
          },
          {
            attendeeId: "attendee-paid-low",
            attendeeName: "Paid Low",
            attendeeEmail: null,
            orderId: "order-paid",
            providerOrderId: "order-paid",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            allocatedRoomTypeId: null,
            genderType: "MALE",
            allocationPriority: "LOW",
            location: null,
            remarks: null,
            hasFamily: false,
            ...paymentFields("paid"),
          },
        ],
      })
    )

    const proposal = await generateAllocationProposal({ eventId: "event-1" })

    expect(proposal.suggestions[0]?.attendeeId).toBe("attendee-paid-low")
    expect(proposal.suggestions[1]?.attendeeId).toBe(
      "attendee-unpaid-critical"
    )
  })

  it("places partial attendees before unpaid and keeps priority as the tie-breaker", async () => {
    vi.mocked(convexQuery).mockResolvedValueOnce(
      buildBoard({
        rooms: [
          {
            id: "room-1",
            label: "A-101",
            capacity: 3,
            occupiedBeds: 0,
            availableBeds: 3,
            availability: "empty",
            notes: null,
            hotel: { id: "hotel-1", name: "Main Hotel", city: "Amsterdam" },
            roomType: { id: "type-1", label: "Shared", defaultCapacity: 2 },
            occupants: [],
            pendingAssignments: [],
          },
        ],
        unassignedAttendees: [
          {
            attendeeId: "attendee-unpaid-normal",
            attendeeName: "Unpaid Normal",
            attendeeEmail: null,
            orderId: "order-unpaid-normal",
            providerOrderId: "order-unpaid-normal",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            allocatedRoomTypeId: null,
            genderType: "MALE",
            allocationPriority: "NORMAL",
            location: null,
            remarks: null,
            hasFamily: false,
            ...paymentFields("unpaid"),
          },
          {
            attendeeId: "attendee-partial-high",
            attendeeName: "Partial High",
            attendeeEmail: null,
            orderId: "order-partial-high",
            providerOrderId: "order-partial-high",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            allocatedRoomTypeId: null,
            genderType: "MALE",
            allocationPriority: "HIGH",
            location: null,
            remarks: null,
            hasFamily: false,
            ...paymentFields("partial"),
          },
          {
            attendeeId: "attendee-partial-low",
            attendeeName: "Partial Low",
            attendeeEmail: null,
            orderId: "order-partial-low",
            providerOrderId: "order-partial-low",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            allocatedRoomTypeId: null,
            genderType: "MALE",
            allocationPriority: "LOW",
            location: null,
            remarks: null,
            hasFamily: false,
            ...paymentFields("partial"),
          },
        ],
      })
    )

    const proposal = await generateAllocationProposal({ eventId: "event-1" })

    // Payment rank first: both partial attendees precede the unpaid attendee.
    expect(proposal.suggestions.map((s) => s.attendeeId)).toEqual([
      "attendee-partial-high",
      "attendee-partial-low",
      "attendee-unpaid-normal",
    ])
  })

  it("keeps CRITICAL/HIGH/NORMAL/LOW ordering when payment states are equal", async () => {
    vi.mocked(convexQuery).mockResolvedValueOnce(
      buildBoard({
        rooms: [
          {
            id: "room-1",
            label: "A-101",
            capacity: 3,
            occupiedBeds: 0,
            availableBeds: 3,
            availability: "empty",
            notes: null,
            hotel: { id: "hotel-1", name: "Main Hotel", city: "Amsterdam" },
            roomType: { id: "type-1", label: "Shared", defaultCapacity: 2 },
            occupants: [],
            pendingAssignments: [],
          },
        ],
        unassignedAttendees: [
          {
            attendeeId: "attendee-unpaid-normal",
            attendeeName: "Unpaid Normal",
            attendeeEmail: null,
            orderId: "order-z",
            providerOrderId: "order-z",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            allocatedRoomTypeId: null,
            genderType: "MALE",
            allocationPriority: "NORMAL",
            location: null,
            remarks: null,
            hasFamily: false,
            ...paymentFields("unpaid"),
          },
          {
            attendeeId: "attendee-unpaid-critical",
            attendeeName: "Unpaid Critical",
            attendeeEmail: null,
            orderId: "order-a",
            providerOrderId: "order-a",
            providerEventId: "event-1",
            eventName: "Camp",
            ticketTypeLabel: null,
            allocatedRoomTypeId: null,
            genderType: "MALE",
            allocationPriority: "CRITICAL",
            location: null,
            remarks: null,
            hasFamily: false,
            ...paymentFields("unpaid"),
          },
        ],
      })
    )

    const proposal = await generateAllocationProposal({ eventId: "event-1" })

    // Equal payment state falls back to allocation priority: CRITICAL first.
    expect(proposal.suggestions.map((s) => s.attendeeId)).toEqual([
      "attendee-unpaid-critical",
      "attendee-unpaid-normal",
    ])
  })
})
