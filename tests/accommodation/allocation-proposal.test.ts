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
  const board: RoomAllocationBoard = {
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
    hotels: [{ id: "hotel-1", name: "Main Hotel" }],
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

  return {
    ...board,
    rooms: board.rooms.map((room) => ({
      ...room,
      occupantCount: room.occupantCount ?? room.occupants.length,
    })),
  }
}

/** Server-owned payment projection fields shared by every board row. */
function paymentFields(
  paymentState: "paid" | "partial" | "unpaid" | null = null
) {
  return {
    eventId: "event-1",
    paymentState,
    amountDueMinor: null,
    paidAmountMinor: null,
    bookingRef: null,
    bookerName: null,
    groupMemberIds: [],
    groupAssignmentAvailable: false,
  }
}

type BoardAttendee = RoomAllocationBoard["unassignedAttendees"][number]

function boardAttendee(overrides: Partial<BoardAttendee> = {}): BoardAttendee {
  return {
    attendeeId: "attendee-default",
    attendeeName: "Default Attendee",
    attendeeEmail: null,
    orderId: "order-default",
    providerOrderId: "order-default",
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
    ...overrides,
  }
}

describe("allocation proposal compatibility strategy", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("keeps a parent-led family unit together and counts one cohesive outcome", async () => {
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
            familyRole: "parent",
            familyGroupId: "family-1",
            familyLabel: "Siblings",
            familyParentAttendeeId: "attendee-1",
            familyState: "unresolved",
            eligibleChildren: [
              {
                attendeeId: "attendee-2",
                attendeeName: "Younger Sibling",
                attendeeEmail: null,
                requiresBed: false,
                familyRole: "child",
                familyState: "unresolved",
              },
            ],
            eligibleChildCount: 1,
            separateMemberCount: 0,
             ...paymentFields(),
          },
        ],
      })
    )

    const proposal = await generateAllocationProposal({ eventId: "event-1" })

    expect(proposal.suggestions).toHaveLength(1)
    expect(proposal.suggestions[0]?.roomId).toBe("room-1")
    expect(proposal.suggestions[0]?.familyRole).toBe("parent")
    expect(proposal.suggestions[0]?.eligibleChildIds).toEqual(["attendee-2"])
    expect(proposal.suggestions[0]?.eligibleChildCount).toBe(1)
    expect(proposal.summary.familyGroupsKeptTogether).toBe(1)
    expect(proposal.suggestions[0]?.reason.toLowerCase()).toContain("family")
    expect(proposal.suggestions[0]?.reason).not.toContain("Available room with")
  })

  it("suppresses child rows and lets a no-bed child follow a parent into a bed-full outcome", async () => {
    vi.mocked(convexQuery).mockResolvedValueOnce(
      buildBoard({
        rooms: [
          {
            id: "room-1",
            label: "A-101",
            capacity: 1,
            occupiedBeds: 0,
            availableBeds: 1,
            availability: "available",
            notes: null,
            hotel: { id: "hotel-1", name: "Main Hotel", city: "Amsterdam" },
            roomType: { id: "type-1", label: "Single", defaultCapacity: 1 },
            occupants: [],
            pendingAssignments: [],
          },
        ],
        unassignedAttendees: [
          boardAttendee({
            attendeeId: "parent",
            attendeeName: "Parent",
            orderId: "parent-order",
            hasFamily: true,
            requiresBed: true,
            familyRole: "parent",
            familyGroupId: "family-1",
            familyLabel: "Family One",
            familyParentAttendeeId: "parent",
            familyState: "unresolved",
            eligibleChildren: [
              {
                attendeeId: "child",
                attendeeName: "Child",
                attendeeEmail: null,
                requiresBed: false,
                familyRole: "child",
                familyState: "unresolved",
              },
            ],
            eligibleChildCount: 1,
          }),
          boardAttendee({
            attendeeId: "child",
            attendeeName: "Child",
            orderId: "child-order",
            hasFamily: true,
            requiresBed: false,
            familyRole: "child",
            familyGroupId: "family-1",
            familyParentAttendeeId: "parent",
            familyState: "waiting-for-parent-room",
          }),
        ],
      })
    )

    const proposal = await generateAllocationProposal({ eventId: "event-1" })

    expect(proposal.suggestions).toHaveLength(1)
    expect(proposal.suggestions[0]).toMatchObject({
      attendeeId: "parent",
      familyRole: "parent",
      eligibleChildIds: ["child"],
      eligibleChildCount: 1,
    })
    expect(proposal.suggestions.map((suggestion) => suggestion.attendeeId)).not.toContain(
      "child"
    )
    expect(proposal.unplacedAttendees.map((attendee) => attendee.attendeeId)).not.toContain(
      "child"
    )
    expect(proposal.summary.familyGroupsKeptTogether).toBe(1)
  })

  it("exposes zero and many child cardinalities only on their parent outcomes", async () => {
    vi.mocked(convexQuery).mockResolvedValueOnce(
      buildBoard({
        rooms: [
          {
            id: "room-1",
            label: "A-101",
            capacity: 4,
            occupiedBeds: 0,
            availableBeds: 4,
            availability: "empty",
            notes: null,
            hotel: { id: "hotel-1", name: "Main Hotel", city: "Amsterdam" },
            roomType: { id: "type-1", label: "Shared", defaultCapacity: 4 },
            occupants: [],
            pendingAssignments: [],
          },
        ],
        unassignedAttendees: [
          boardAttendee({ attendeeId: "solo", attendeeName: "Solo" }),
          boardAttendee({
            attendeeId: "parent-many",
            attendeeName: "Parent Many",
            familyRole: "parent",
            hasFamily: true,
            familyGroupId: "family-many",
            familyParentAttendeeId: "parent-many",
            eligibleChildren: [
              {
                attendeeId: "child-one",
                attendeeName: "Child One",
                requiresBed: false,
                familyRole: "child",
                familyState: "unresolved",
              },
              {
                attendeeId: "child-two",
                attendeeName: "Child Two",
                requiresBed: false,
                familyRole: "child",
                familyState: "unresolved",
              },
            ],
            eligibleChildCount: 2,
          }),
        ],
      })
    )

    const proposal = await generateAllocationProposal({ eventId: "event-1" })
    const solo = proposal.suggestions.find((suggestion) => suggestion.attendeeId === "solo")
    const parent = proposal.suggestions.find((suggestion) => suggestion.attendeeId === "parent-many")
    expect(solo).toMatchObject({ familyRole: "solo", eligibleChildIds: [], eligibleChildCount: 0 })
    expect(parent).toMatchObject({
      familyRole: "parent",
      eligibleChildIds: ["child-one", "child-two"],
      eligibleChildCount: 2,
    })
    expect(proposal.suggestions.map((suggestion) => suggestion.attendeeId)).not.toEqual(
      expect.arrayContaining(["child-one", "child-two"])
    )
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

  it("does not let an unpaid buyer suggestion bypass a paid attendee", async () => {
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
        buyerSuggestions: [
          {
            assignmentId: "assignment-unpaid",
            attendeeId: "attendee-unpaid",
            attendeeName: "Unpaid Suggested Guest",
            attendeeEmail: null,
            roomId: "room-1",
            roomLabel: "A-101",
            hotelName: "Main Hotel",
            assignmentIntent: "assign",
            sortOrder: 0,
            ...paymentFields("unpaid"),
          },
        ],
        unassignedAttendees: [
          {
            attendeeId: "attendee-unpaid",
            attendeeName: "Unpaid Suggested Guest",
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
            attendeeId: "attendee-paid",
            attendeeName: "Paid Guest",
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

    expect(proposal.suggestions.map((s) => s.attendeeId)).toEqual([
      "attendee-paid",
      "attendee-unpaid",
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

  it("places a no-bed attendee in a bed-full room and defaults missing metadata to one bed", async () => {
    vi.mocked(convexQuery).mockResolvedValueOnce(
      buildBoard({
        rooms: [
          {
            id: "room-full",
            label: "A-101",
            capacity: 2,
            occupantCount: 2,
            occupiedBeds: 2,
            availableBeds: 0,
            availability: "full",
            notes: null,
            hotel: { id: "hotel-1", name: "Main Hotel", city: "Amsterdam" },
            roomType: { id: "type-1", label: "Shared", defaultCapacity: 2 },
            occupants: [
              {
                attendeeId: "existing-1",
                attendeeName: "Existing One",
                attendeeEmail: null,
                orderId: "order-existing-1",
                providerOrderId: null,
                providerEventId: null,
                eventName: "Camp",
                ticketTypeLabel: null,
                ...paymentFields(),
              },
              {
                attendeeId: "existing-2",
                attendeeName: "Existing Two",
                attendeeEmail: null,
                orderId: "order-existing-2",
                providerOrderId: null,
                providerEventId: null,
                eventName: "Camp",
                ticketTypeLabel: null,
                ...paymentFields(),
              },
            ],
            pendingAssignments: [],
          },
        ],
        unassignedAttendees: [
          {
            attendeeId: "no-bed",
            attendeeName: "No Bed Child",
            attendeeEmail: null,
            orderId: "order-no-bed",
            providerOrderId: null,
            providerEventId: null,
            eventName: "Camp",
            ticketTypeLabel: null,
            allocatedRoomTypeId: null,
            genderType: "UNKNOWN",
            allocationPriority: "NORMAL",
            location: null,
            remarks: null,
            hasFamily: false,
            requiresBed: false,
            ...paymentFields(),
          },
          {
            attendeeId: "legacy-bed",
            attendeeName: "Legacy Bed Guest",
            attendeeEmail: null,
            orderId: "order-legacy-bed",
            providerOrderId: null,
            providerEventId: null,
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
    expect(proposal.suggestions[0]?.attendeeId).toBe("no-bed")
    expect(proposal.unplacedAttendees).toMatchObject([
      {
        attendeeId: "legacy-bed",
        reason: "No rooms with available beds",
      },
    ])
  })

  it("seeds the gender guard from existing room occupants", async () => {
    vi.mocked(convexQuery).mockResolvedValueOnce(
      buildBoard({
        rooms: [
          {
            id: "room-occupied",
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
                attendeeId: "existing-female",
                attendeeName: "Existing Female",
                attendeeEmail: null,
                genderType: "FEMALE",
                orderId: "order-existing",
                providerOrderId: null,
                providerEventId: null,
                eventName: "Camp",
                ticketTypeLabel: null,
                ...paymentFields(),
              },
            ],
            pendingAssignments: [],
          },
          {
            id: "room-empty",
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
          boardAttendee({
            attendeeId: "male-attendee",
            attendeeName: "Male Attendee",
            genderType: "MALE",
          }),
        ],
      })
    )

    const proposal = await generateAllocationProposal({ eventId: "event-1" })

    expect(proposal.suggestions).toHaveLength(1)
    // The pre-existing female occupant must exclude the incompatible room even
    // though it has an available bed and outranks the empty alternative.
    expect(proposal.suggestions[0]?.roomId).toBe("room-empty")
  })

  it("never proposes a room whose occupancy read is incomplete", async () => {
    vi.mocked(convexQuery).mockResolvedValueOnce(
      buildBoard({
        rooms: [
          {
            id: "room-incomplete",
            label: "A-101",
            capacity: 2,
            occupiedBeds: 0,
            availableBeds: 0,
            availability: "review",
            occupancyIncomplete: true,
            notes: null,
            hotel: { id: "hotel-1", name: "Main Hotel", city: "Amsterdam" },
            roomType: { id: "type-1", label: "Shared", defaultCapacity: 2 },
            occupants: [],
            pendingAssignments: [],
          },
        ],
        unassignedAttendees: [
          boardAttendee({
            attendeeId: "review-attendee",
            attendeeName: "Review Attendee",
            requiresBed: false,
          }),
        ],
      })
    )

    const proposal = await generateAllocationProposal({ eventId: "event-1" })

    expect(proposal.suggestions).toHaveLength(0)
    expect(proposal.unplacedAttendees).toMatchObject([
      {
        attendeeId: "review-attendee",
        reason:
          "All candidate rooms have incomplete occupancy data; verify occupancy before assigning",
      },
    ])
  })
})
