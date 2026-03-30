import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/convex/server", () => ({
  convexQuery: vi.fn(),
}))

vi.mock("@/lib/domain/finance/matched-payments", () => ({
  buildMatchedTotalsByProviderOrderId: vi.fn(),
}))

import { convexQuery } from "@/lib/convex/server"
import { buildMatchedTotalsByProviderOrderId } from "@/lib/domain/finance/matched-payments"
import { getAttendeeLedger } from "@/lib/domain/finance/attendees"

describe("attendee-ledger domain", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(buildMatchedTotalsByProviderOrderId).mockResolvedValue(
      new Map<string, number>()
    )
  })

  describe("getAttendeeLedger", () => {
    it("includes both integration and internal events in availableEvents", async () => {
      const mockAttendees: never[] = []
      const mockEvents = [
        {
          _id: "event-integration-1",
          _creationTime: 1743340800000,
          slug: "integration-camp",
          title: "Integration Summer Camp",
          startsAt: 1743340800000,
          timezone: "Europe/Amsterdam",
          currency: "EUR",
          isPublished: true,
          isSignupOpen: true,
          accommodationEnabled: true,
          primarySourceKind: "integration" as const,
          primarySourceProvider: "ticketTailor",
          updatedAt: 1743340800000,
        },
        {
          _id: "event-internal-1",
          _creationTime: 1743427200000,
          slug: "internal-retreat",
          title: "Internal Team Retreat",
          startsAt: 1743427200000,
          timezone: "Europe/Amsterdam",
          currency: "EUR",
          isPublished: true,
          isSignupOpen: true,
          accommodationEnabled: true,
          primarySourceKind: "internal" as const,
          updatedAt: 1743427200000,
        },
      ]
      const mockOrders: never[] = []
      const mockRooms: never[] = []
      const mockHotels: never[] = []
      const mockRoomTypes: never[] = []

      vi.mocked(convexQuery)
        .mockResolvedValueOnce(mockAttendees)
        .mockResolvedValueOnce(mockEvents)
        .mockResolvedValueOnce(mockOrders)
        .mockResolvedValueOnce(mockRooms)
        .mockResolvedValueOnce(mockHotels)
        .mockResolvedValueOnce(mockRoomTypes)

      const result = await getAttendeeLedger({})

      expect(result.availableEvents).toHaveLength(2)
      expect(result.availableEvents).toContainEqual({
        eventId: "event-integration-1",
        slug: "integration-camp",
        title: "Integration Summer Camp",
        startsAt: expect.any(String),
        currency: "EUR",
      })
      expect(result.availableEvents).toContainEqual({
        eventId: "event-internal-1",
        slug: "internal-retreat",
        title: "Internal Team Retreat",
        startsAt: expect.any(String),
        currency: "EUR",
      })
    })

    it("maps source-agnostic event fields from Convex events query", async () => {
      const mockAttendees: never[] = []
      const mockEvents = [
        {
          _id: "event-internal-new",
          _creationTime: 1743513600000,
          slug: "new-internal-event",
          title: "New Internal Conference",
          startsAt: 1743513600000,
          timezone: "Europe/Amsterdam",
          currency: "USD",
          isPublished: true,
          isSignupOpen: true,
          accommodationEnabled: false,
          primarySourceKind: "internal" as const,
          updatedAt: 1743513600000,
        },
      ]
      const mockOrders: never[] = []
      const mockRooms: never[] = []
      const mockHotels: never[] = []
      const mockRoomTypes: never[] = []

      vi.mocked(convexQuery)
        .mockResolvedValueOnce(mockAttendees)
        .mockResolvedValueOnce(mockEvents)
        .mockResolvedValueOnce(mockOrders)
        .mockResolvedValueOnce(mockRooms)
        .mockResolvedValueOnce(mockHotels)
        .mockResolvedValueOnce(mockRoomTypes)

      const result = await getAttendeeLedger({})

      expect(result.availableEvents[0]).toMatchObject({
        eventId: "event-internal-new",
        slug: "new-internal-event",
        title: "New Internal Conference",
        currency: "USD",
      })
    })

    it("does not drop integration attendees when filtering by eventId", async () => {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
      const now = Date.now()

      const mockAttendees = [
        {
          _id: "attendee-tt-1",
          providerAttendeeId: "tt-attendee-1",
          providerIssuedTicketId: "tt-ticket-1",
          providerOrderId: "order-tt-1",
          eventId: "event-integration-1",
          orderId: "order-1",
          name: "Alice Brown",
          email: "alice@example.com",
          ticketTypeLabel: "Weekend",
          genderType: "FEMALE" as const,
          allocationPriority: "NORMAL" as const,
          priorityReason: null,
          ageGroup: null,
          ticketCategory: null,
          assignedRoomId: null,
          customAnswers: null,
        },
      ]

      const mockEvents = [
        {
          _id: "event-integration-1",
          _creationTime: 1743340800000,
          slug: "integration-camp",
          title: "Integration Summer Camp",
          startsAt: 1743340800000,
          timezone: "Europe/Amsterdam",
          currency: "EUR",
          isPublished: true,
          isSignupOpen: true,
          accommodationEnabled: true,
          primarySourceKind: "integration" as const,
          primarySourceProvider: "ticketTailor",
          updatedAt: 1743340800000,
        },
      ]

      const mockOrders = [
        {
          _id: "order-1",
          providerOrderId: "order-tt-1",
          eventId: "event-integration-1",
          normalizedStatus: "paid" as const,
          totalAmountMinor: 5000,
          orderedAt: now - 10 * 24 * 60 * 60 * 1000,
        },
      ]

      const mockRooms: never[] = []
      const mockHotels: never[] = []
      const mockRoomTypes: never[] = []

      vi.mocked(convexQuery)
        .mockResolvedValueOnce(mockAttendees)
        .mockResolvedValueOnce(mockEvents)
        .mockResolvedValueOnce(mockOrders)
        .mockResolvedValueOnce(mockRooms)
        .mockResolvedValueOnce(mockHotels)
        .mockResolvedValueOnce(mockRoomTypes)

      const result = await getAttendeeLedger({ eventId: "event-integration-1" })

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].attendeeId).toBe("attendee-tt-1")
      expect(result.rows[0].eventId).toBe("event-integration-1")
    })

    it("handles mixed integration and internal attendees in same result set", async () => {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
      const now = Date.now()

      const mockAttendees = [
        {
          _id: "attendee-tt-1",
          providerAttendeeId: "tt-attendee-1",
          providerIssuedTicketId: "tt-ticket-1",
          providerOrderId: "order-tt-1",
          eventId: "event-integration-1",
          orderId: "order-1",
          name: "Alice Brown",
          email: "alice@example.com",
          ticketTypeLabel: "Weekend",
          genderType: "FEMALE" as const,
          allocationPriority: "NORMAL" as const,
          priorityReason: null,
          ageGroup: null,
          ticketCategory: null,
          assignedRoomId: null,
          customAnswers: null,
        },
        {
          _id: "attendee-sub-1",
          providerAttendeeId: null,
          providerIssuedTicketId: null,
          providerOrderId: "order-sub-1",
          eventId: "event-internal-1",
          orderId: "order-2",
          name: "Bob Wilson",
          email: "bob@example.com",
          ticketTypeLabel: "General",
          genderType: "MALE" as const,
          allocationPriority: "HIGH" as const,
          priorityReason: "Volunteer",
          ageGroup: null,
          ticketCategory: null,
          assignedRoomId: null,
          customAnswers: null,
        },
      ]

      const mockEvents = [
        {
          _id: "event-integration-1",
          _creationTime: 1743340800000,
          slug: "integration-camp",
          title: "Integration Summer Camp",
          startsAt: 1743340800000,
          timezone: "Europe/Amsterdam",
          currency: "EUR",
          isPublished: true,
          isSignupOpen: true,
          accommodationEnabled: true,
          primarySourceKind: "integration" as const,
          primarySourceProvider: "ticketTailor",
          updatedAt: 1743340800000,
        },
        {
          _id: "event-internal-1",
          _creationTime: 1743427200000,
          slug: "internal-retreat",
          title: "Internal Team Retreat",
          startsAt: 1743427200000,
          timezone: "Europe/Amsterdam",
          currency: "EUR",
          isPublished: true,
          isSignupOpen: true,
          accommodationEnabled: true,
          primarySourceKind: "internal" as const,
          updatedAt: 1743427200000,
        },
      ]

      const mockOrders = [
        {
          _id: "order-1",
          providerOrderId: "order-tt-1",
          eventId: "event-integration-1",
          normalizedStatus: "paid" as const,
          totalAmountMinor: 5000,
          orderedAt: now - 10 * 24 * 60 * 60 * 1000,
        },
        {
          _id: "order-2",
          providerOrderId: "order-sub-1",
          eventId: "event-internal-1",
          normalizedStatus: "pending" as const,
          totalAmountMinor: 3000,
          orderedAt: now - 5 * 24 * 60 * 60 * 1000,
        },
      ]

      const mockRooms: never[] = []
      const mockHotels: never[] = []
      const mockRoomTypes: never[] = []

      vi.mocked(convexQuery)
        .mockResolvedValueOnce(mockAttendees)
        .mockResolvedValueOnce(mockEvents)
        .mockResolvedValueOnce(mockOrders)
        .mockResolvedValueOnce(mockRooms)
        .mockResolvedValueOnce(mockHotels)
        .mockResolvedValueOnce(mockRoomTypes)

      const result = await getAttendeeLedger({})

      expect(result.rows).toHaveLength(2)
      expect(result.rows.map((r) => r.attendeeId)).toContain("attendee-tt-1")
      expect(result.rows.map((r) => r.attendeeId)).toContain("attendee-sub-1")
    })

    it("returns empty rows when no attendees match date filter", async () => {
      const mockAttendees: never[] = []
      const mockEvents = [
        {
          _id: "event-integration-1",
          _creationTime: 1743340800000,
          slug: "integration-camp",
          title: "Integration Summer Camp",
          startsAt: 1743340800000,
          timezone: "Europe/Amsterdam",
          currency: "EUR",
          isPublished: true,
          isSignupOpen: true,
          accommodationEnabled: true,
          primarySourceKind: "integration" as const,
          primarySourceProvider: "ticketTailor",
          updatedAt: 1743340800000,
        },
      ]
      const mockOrders: never[] = []
      const mockRooms: never[] = []
      const mockHotels: never[] = []
      const mockRoomTypes: never[] = []

      vi.mocked(convexQuery)
        .mockResolvedValueOnce(mockAttendees)
        .mockResolvedValueOnce(mockEvents)
        .mockResolvedValueOnce(mockOrders)
        .mockResolvedValueOnce(mockRooms)
        .mockResolvedValueOnce(mockHotels)
        .mockResolvedValueOnce(mockRoomTypes)

      const from = new Date("2027-01-01T00:00:00.000Z")
      const to = new Date("2027-12-31T23:59:59.999Z")

      const result = await getAttendeeLedger({ from, to })

      expect(result.rows).toHaveLength(0)
      expect(result.page.totalRows).toBe(0)
    })

    it("maps customAnswers location and remarks to ledger row fields", async () => {
      const now = Date.now()

      const mockAttendees = [
        {
          _id: "attendee-1",
          providerAttendeeId: "tt-attendee-1",
          providerIssuedTicketId: "tt-ticket-1",
          providerOrderId: "order-tt-1",
          eventId: "event-integration-1",
          orderId: "order-1",
          name: "Charlie Davis",
          email: "charlie@example.com",
          ticketTypeLabel: "Weekend",
          genderType: "MALE" as const,
          allocationPriority: "NORMAL" as const,
          priorityReason: null,
          ageGroup: null,
          ticketCategory: null,
          assignedRoomId: null,
          customAnswers: {
            location: "Rotterdam",
            remarks: "Near window preferred",
          },
        },
      ]

      const mockEvents = [
        {
          _id: "event-integration-1",
          _creationTime: 1743340800000,
          slug: "integration-camp",
          title: "Integration Summer Camp",
          startsAt: 1743340800000,
          timezone: "Europe/Amsterdam",
          currency: "EUR",
          isPublished: true,
          isSignupOpen: true,
          accommodationEnabled: true,
          primarySourceKind: "integration" as const,
          primarySourceProvider: "ticketTailor",
          updatedAt: 1743340800000,
        },
      ]

      const mockOrders = [
        {
          _id: "order-1",
          providerOrderId: "order-tt-1",
          eventId: "event-integration-1",
          normalizedStatus: "paid" as const,
          totalAmountMinor: 5000,
          orderedAt: now - 10 * 24 * 60 * 60 * 1000,
        },
      ]

      const mockRooms: never[] = []
      const mockHotels: never[] = []
      const mockRoomTypes: never[] = []

      vi.mocked(convexQuery)
        .mockResolvedValueOnce(mockAttendees)
        .mockResolvedValueOnce(mockEvents)
        .mockResolvedValueOnce(mockOrders)
        .mockResolvedValueOnce(mockRooms)
        .mockResolvedValueOnce(mockHotels)
        .mockResolvedValueOnce(mockRoomTypes)

      const result = await getAttendeeLedger({})

      expect(result.rows[0].location).toBe("Rotterdam")
      expect(result.rows[0].remarks).toBe("Near window preferred")
    })
  })
})
