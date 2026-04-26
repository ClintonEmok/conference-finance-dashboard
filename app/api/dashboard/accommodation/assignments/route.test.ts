import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth/server", () => ({
  requireApiUser: vi.fn(),
}))

vi.mock("@/lib/domain/accommodation/assignments", () => ({
  getRoomAllocationBoard: vi.fn(),
  assignAttendeeToRoom: vi.fn(),
}))

import { NextResponse } from "next/server"

import { GET, POST } from "@/app/api/dashboard/accommodation/assignments/route"
import { requireApiUser } from "@/lib/auth/server"
import {
  getRoomAllocationBoard,
  assignAttendeeToRoom,
} from "@/lib/domain/accommodation/assignments"

describe("/api/dashboard/accommodation/assignments route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("GET", () => {
    it("returns 401 for unauthenticated requests", async () => {
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
        new Request("http://localhost/api/dashboard/accommodation/assignments")
      )
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body).toEqual({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      })
      expect(getRoomAllocationBoard).not.toHaveBeenCalled()
    })

    it("returns room allocation board with submission queue rows for authenticated requests", async () => {
      vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })

      const boardPayload = {
        generatedAt: "2026-03-30T10:00:00.000Z",
        filters: {
          eventId: null,
          search: null,
          hotelId: null,
          roomTypeId: null,
          availability: "all" as const,
          genderType: null,
          familyGroupId: null,
          location: null,
          allocationPriority: null,
          hasPriority: null,
        },
        availableEvents: [
          { providerEventId: "event-integration", name: "Integration Camp" },
        ],
        hotels: [],
        roomTypes: [],
        rooms: [],
        unassignedAttendees: [],
        submissionQueueRows: [
          {
            attendeeId: "sub-attendee-1",
            attendeeName: "Jane Doe",
            attendeeEmail: "jane@example.com",
            source: "internal" as const,
            submissionId: "submission-123",
            bookingRef: "BK-20260330-ABC123",
            submissionNotes: "Roommate request: Sarah",
            assignmentIntent: "assign" as const,
            slotId: "slot-456",
            roommatePreference: "Sarah Johnson",
            roommateAvoid: null,
            dietaryRestrictions: "none",
            bookerName: "John Doe",
            genderType: "FEMALE" as const,
            location: "Amsterdam",
            unresolved: true,
            unresolvedReason: "no_assignment_record",
            submittedAt: 1743340800000,
            sortOrder: 0,
          },
          {
            attendeeId: "sub-attendee-2",
            attendeeName: "Bob Smith",
            attendeeEmail: null,
            source: "internal" as const,
            submissionId: "submission-456",
            bookingRef: "BK-20260330-DEF456",
            submissionNotes: null,
            assignmentIntent: "skip" as const,
            slotId: null,
            roommatePreference: null,
            roommateAvoid: "snoring",
            dietaryRestrictions: "vegetarian",
            bookerName: "Robert Smith",
            genderType: "MALE" as const,
            location: "Utrecht",
            unresolved: true,
            unresolvedReason: "skipped_intent",
            submittedAt: 1743340800001,
            sortOrder: 1,
          },
        ],
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
      }

      vi.mocked(getRoomAllocationBoard).mockResolvedValue(boardPayload)

      const response = await GET(
        new Request("http://localhost/api/dashboard/accommodation/assignments")
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.submissionQueueRows).toHaveLength(2)
      expect(body.submissionQueueRows[0]).toMatchObject({
        attendeeId: "sub-attendee-1",
        attendeeName: "Jane Doe",
        source: "internal",
        submissionId: "submission-123",
        bookingRef: "BK-20260330-ABC123",
        submissionNotes: "Roommate request: Sarah",
        assignmentIntent: "assign",
        roommatePreference: "Sarah Johnson",
        unresolved: true,
        unresolvedReason: "no_assignment_record",
      })
      expect(body.submissionQueueRows[1]).toMatchObject({
        attendeeId: "sub-attendee-2",
        attendeeName: "Bob Smith",
        source: "internal",
        submissionId: "submission-456",
        bookingRef: "BK-20260330-DEF456",
        assignmentIntent: "skip",
        unresolved: true,
        unresolvedReason: "skipped_intent",
      })
      expect(getRoomAllocationBoard).toHaveBeenCalledWith({
        eventId: null,
        search: null,
        hotelId: null,
        roomTypeId: null,
        availability: undefined,
        genderType: undefined,
        familyGroupId: null,
        location: null,
        allocationPriority: undefined,
        hasPriority: undefined,
      })
    })

    it("passes query parameters to getRoomAllocationBoard", async () => {
      vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
      vi.mocked(getRoomAllocationBoard).mockResolvedValue({
        generatedAt: "2026-03-30T10:00:00.000Z",
        filters: {
          eventId: "event-1",
          search: "jane",
          hotelId: "hotel-1",
          roomTypeId: "type-1",
          availability: "available" as const,
          genderType: "FEMALE",
          familyGroupId: "family-1",
          location: "Amsterdam",
          allocationPriority: "HIGH",
          hasPriority: true,
        },
        availableEvents: [],
        hotels: [],
        roomTypes: [],
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
      })

      const response = await GET(
        new Request(
          "http://localhost/api/dashboard/accommodation/assignments?eventId=event-1&search=jane&hotelId=hotel-1&roomTypeId=type-1&availability=available&genderType=FEMALE&familyGroupId=family-1&location=Amsterdam&allocationPriority=HIGH&hasPriority=true"
        )
      )

      expect(response.status).toBe(200)
      expect(getRoomAllocationBoard).toHaveBeenCalledWith({
        eventId: "event-1",
        search: "jane",
        hotelId: "hotel-1",
        roomTypeId: "type-1",
        availability: "available",
        genderType: "FEMALE",
        familyGroupId: "family-1",
        location: "Amsterdam",
        allocationPriority: "HIGH",
        hasPriority: true,
      })
    })

    it("returns 400 for invalid availability parameter", async () => {
      vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
      vi.mocked(getRoomAllocationBoard).mockRejectedValue(
        new Error(
          "Invalid 'availability'. Expected one of: all, empty, available, full."
        )
      )

      const response = await GET(
        new Request(
          "http://localhost/api/dashboard/accommodation/assignments?availability=invalid"
        )
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body).toEqual({
        error: {
          code: "BAD_REQUEST",
          message:
            "Invalid 'availability'. Expected one of: all, empty, available, full.",
        },
      })
    })

    it("returns 400 for invalid gender type parameter", async () => {
      vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
      vi.mocked(getRoomAllocationBoard).mockRejectedValue(
        new Error("Invalid parameter")
      )

      const response = await GET(
        new Request(
          "http://localhost/api/dashboard/accommodation/assignments?genderType=INVALID"
        )
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error.code).toBe("BAD_REQUEST")
    })

    it("returns 400 for invalid allocation priority parameter", async () => {
      vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
      vi.mocked(getRoomAllocationBoard).mockRejectedValue(
        new Error("Invalid parameter")
      )

      const response = await GET(
        new Request(
          "http://localhost/api/dashboard/accommodation/assignments?allocationPriority=INVALID"
        )
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error.code).toBe("BAD_REQUEST")
    })

    it("returns 500 for internal errors", async () => {
      vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
      vi.mocked(getRoomAllocationBoard).mockRejectedValue(
        new Error("Database connection failed")
      )

      const response = await GET(
        new Request("http://localhost/api/dashboard/accommodation/assignments")
      )
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body).toEqual({
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load room allocation board",
        },
      })
    })

    it("includes mixed integration and internal submission rows in board payload", async () => {
      vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })

      const boardPayload = {
        generatedAt: "2026-03-30T10:00:00.000Z",
        filters: {
          eventId: null,
          search: null,
          hotelId: null,
          roomTypeId: null,
          availability: "all" as const,
          genderType: null,
          familyGroupId: null,
          location: null,
          allocationPriority: null,
          hasPriority: null,
        },
        availableEvents: [
          { providerEventId: "event-integration", name: "Integration Camp" },
          { providerEventId: "event-internal", name: "Internal Retreat" },
        ],
        hotels: [],
        roomTypes: [],
        rooms: [],
        unassignedAttendees: [
          {
            attendeeId: "tt-attendee-1",
            attendeeName: "Alice Brown",
            attendeeEmail: "alice@example.com",
            orderId: "order-tt-1",
            providerOrderId: "order-tt-1",
            providerEventId: "event-integration",
            eventName: "Integration Camp",
            ticketTypeLabel: "Weekend",
            allocatedRoomTypeId: null,
            genderType: "FEMALE" as const,
            allocationPriority: "NORMAL" as const,
            location: "Rotterdam",
            remarks: null,
            hasFamily: false,
          },
        ],
        submissionQueueRows: [
          {
            attendeeId: "sub-attendee-1",
            attendeeName: "Charlie Wilson",
            attendeeEmail: "charlie@example.com",
            source: "internal" as const,
            submissionId: "submission-internal-1",
            bookingRef: "BK-20260330-INT001",
            submissionNotes: "Please assign near Charlie's family",
            assignmentIntent: "assign" as const,
            slotId: "slot-internal-1",
            roommatePreference: "Family members",
            roommateAvoid: null,
            dietaryRestrictions: "none",
            bookerName: "Charlie Wilson",
            genderType: "MALE" as const,
            location: "Rotterdam",
            unresolved: false,
            unresolvedReason: null,
            submittedAt: 1743340800000,
            sortOrder: 0,
          },
        ],
        summary: {
          totalRooms: 5,
          emptyRooms: 2,
          availableRooms: 3,
          fullRooms: 0,
          totalBeds: 10,
          occupiedBeds: 4,
          availableBeds: 6,
          unassignedAttendeesCount: 1,
        },
      }

      vi.mocked(getRoomAllocationBoard).mockResolvedValue(boardPayload)

      const response = await GET(
        new Request("http://localhost/api/dashboard/accommodation/assignments")
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.unassignedAttendees).toHaveLength(1)
      expect(body.unassignedAttendees[0].attendeeId).toBe("tt-attendee-1")
      expect(body.submissionQueueRows).toHaveLength(1)
      expect(body.submissionQueueRows[0].attendeeId).toBe("sub-attendee-1")
      expect(body.submissionQueueRows[0].source).toBe("internal")
      expect(body.submissionQueueRows[0].submissionId).toBe(
        "submission-internal-1"
      )
      expect(body.submissionQueueRows[0].bookingRef).toBe("BK-20260330-INT001")
      expect(body.submissionQueueRows[0].submissionNotes).toBe(
        "Please assign near Charlie's family"
      )
      expect(body.summary.totalRooms).toBe(5)
    })
  })

  describe("POST", () => {
    it("returns 401 for unauthenticated requests", async () => {
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

      const response = await POST(
        new Request(
          "http://localhost/api/dashboard/accommodation/assignments",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attendeeId: "att-1", roomId: "room-1" }),
          }
        )
      )
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body).toEqual({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      })
      expect(assignAttendeeToRoom).not.toHaveBeenCalled()
    })

    it("returns 400 for invalid JSON body", async () => {
      vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })

      const response = await POST(
        new Request(
          "http://localhost/api/dashboard/accommodation/assignments",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "not json",
          }
        )
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body).toEqual({
        error: {
          code: "BAD_REQUEST",
          message: "Request body must be valid JSON",
        },
      })
    })

    it("assigns attendee to room successfully", async () => {
      vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
      vi.mocked(assignAttendeeToRoom).mockResolvedValue({
        id: "att-1",
        assignedRoomId: "room-1",
      })

      const response = await POST(
        new Request(
          "http://localhost/api/dashboard/accommodation/assignments",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attendeeId: "att-1", roomId: "room-1" }),
          }
        )
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        ok: true,
        attendee: { id: "att-1", assignedRoomId: "room-1" },
      })
      expect(assignAttendeeToRoom).toHaveBeenCalledWith({
        attendeeId: "att-1",
        roomId: "room-1",
      })
    })

    it("returns 400 for invalid attendee id", async () => {
      vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
      vi.mocked(assignAttendeeToRoom).mockRejectedValue(
        new Error("Attendee not found")
      )

      const response = await POST(
        new Request(
          "http://localhost/api/dashboard/accommodation/assignments",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attendeeId: "invalid", roomId: "room-1" }),
          }
        )
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error.code).toBe("BAD_REQUEST")
    })

    it("returns 500 for internal errors during assignment", async () => {
      vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
      vi.mocked(assignAttendeeToRoom).mockRejectedValue(
        new Error("Database error")
      )

      const response = await POST(
        new Request(
          "http://localhost/api/dashboard/accommodation/assignments",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attendeeId: "att-1", roomId: "room-1" }),
          }
        )
      )
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body).toEqual({
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to assign attendee to room",
        },
      })
    })
  })
})
