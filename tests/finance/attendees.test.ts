import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/convex/server", () => ({
  convexQuery: vi.fn(),
}))

import { convexQuery } from "@/lib/convex/server"
import { getAttendeeLedger } from "@/lib/domain/finance/attendees"

describe("attendee-ledger domain", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
          amountDueMinor: 5000,
          // Server-owned figures: the ledger row must surface these, not a
          // due-weighted spread rebuilt in the client.
          paidAmountMinor: 5000,
          outstandingAmountMinor: 0,
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
      expect(result.rows[0].paidAmountMinor).toBe(5000)
      expect(result.rows[0].outstandingAmountMinor).toBe(0)
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
          amountDueMinor: 5000,
          paidAmountMinor: 2000,
          outstandingAmountMinor: 3000,
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
          amountDueMinor: 3000,
          paidAmountMinor: 3000,
          outstandingAmountMinor: 0,
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

      const ttRow = result.rows.find((r) => r.attendeeId === "attendee-tt-1")
      const subRow = result.rows.find((r) => r.attendeeId === "attendee-sub-1")
      expect(ttRow?.paidAmountMinor).toBe(2000)
      expect(ttRow?.outstandingAmountMinor).toBe(3000)
      expect(ttRow?.overpaidAmountMinor).toBe(0)
      expect(subRow?.paidAmountMinor).toBe(3000)
      expect(subRow?.outstandingAmountMinor).toBe(0)
      expect(subRow?.overpaidAmountMinor).toBe(0)
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
          amountDueMinor: 5000,
          paidAmountMinor: 4000,
          outstandingAmountMinor: 1000,
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

    it("surfaces the server-provided per-attendee paid figure, never a due-weighted spread", async () => {
      const now = Date.now()

      // One order, two attendees with EQUAL due. A due-weighted spread of a
      // 15_000 payment would report 7_500 / 7_500 here; the server says an
      // allocation cleared the second attendee (15_000 / 0). The client has no
      // payments read left in this module, so only the server figure can surface.
      const mockAttendees = [
        {
          _id: "attendee-a",
          providerAttendeeId: null,
          providerIssuedTicketId: null,
          providerOrderId: "order-alloc",
          eventId: "event-internal-1",
          orderId: "order-alloc",
          name: "Cleared Attendee",
          email: null,
          ticketTypeLabel: "General",
          genderType: "UNKNOWN" as const,
          allocationPriority: "NORMAL" as const,
          priorityReason: null,
          ageGroup: null,
          ticketCategory: null,
          assignedRoomId: null,
          amountDueMinor: 10_000,
          paidAmountMinor: 15_000,
          outstandingAmountMinor: 0,
          customAnswers: null,
        },
        {
          _id: "attendee-b",
          providerAttendeeId: null,
          providerIssuedTicketId: null,
          providerOrderId: "order-alloc",
          eventId: "event-internal-1",
          orderId: "order-alloc",
          name: "Credit-targeted Attendee",
          email: null,
          ticketTypeLabel: "General",
          genderType: "UNKNOWN" as const,
          allocationPriority: "NORMAL" as const,
          priorityReason: null,
          ageGroup: null,
          ticketCategory: null,
          assignedRoomId: null,
          amountDueMinor: 10_000,
          paidAmountMinor: 0,
          outstandingAmountMinor: 10_000,
          customAnswers: null,
        },
      ]

      const mockEvents = [
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
          _id: "order-alloc",
          providerOrderId: "order-alloc",
          eventId: "event-internal-1",
          normalizedStatus: "pending" as const,
          totalAmountMinor: 20_000,
          orderedAt: now - 2 * 24 * 60 * 60 * 1000,
        },
      ]

      vi.mocked(convexQuery)
        .mockResolvedValueOnce(mockAttendees)
        .mockResolvedValueOnce(mockEvents)
        .mockResolvedValueOnce(mockOrders)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await getAttendeeLedger({})

      const cleared = result.rows.find((r) => r.attendeeId === "attendee-a")
      const targeted = result.rows.find((r) => r.attendeeId === "attendee-b")
      expect(cleared?.paidAmountMinor).toBe(15_000)
      expect(cleared?.outstandingAmountMinor).toBe(0)
      expect(targeted?.paidAmountMinor).toBe(0)
      expect(targeted?.outstandingAmountMinor).toBe(10_000)
      // The exact integers survive the mapping — no rounding, no re-spread.
      expect(result.rows.map((r) => r.paidAmountMinor)).toEqual([15_000, 0])
      expect(result.rows.map((r) => r.outstandingAmountMinor)).toEqual([
        0, 10_000,
      ])
    })
  })
})
