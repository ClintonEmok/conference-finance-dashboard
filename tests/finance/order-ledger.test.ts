import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/convex/server", () => ({
  convexQuery: vi.fn(),
}))

import { convexQuery } from "@/lib/convex/server"
import { getOrderLedger } from "@/lib/domain/finance/order-ledger"

describe("order-ledger domain", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getOrderLedger", () => {
    it("includes both integration and internal events in availableEvents", async () => {
      const mockOrdersResult = {
        orders: [],
        totalRows: 0,
        totalPages: 1,
      }

      const mockEvents = [
        {
          eventId: "event-integration-1",
          slug: "integration-camp",
          title: "Integration Summer Camp",
          startsAt: 1743340800000,
          currency: "EUR",
        },
        {
          eventId: "event-internal-1",
          slug: "internal-retreat",
          title: "Internal Team Retreat",
          startsAt: 1743427200000,
          currency: "EUR",
        },
      ]

      vi.mocked(convexQuery)
        .mockResolvedValueOnce(mockOrdersResult)
        .mockResolvedValueOnce(mockEvents)

      const result = await getOrderLedger({})

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
      const mockOrdersResult = {
        orders: [],
        totalRows: 0,
        totalPages: 1,
      }

      const mockEvents = [
        {
          eventId: "event-internal-new",
          slug: "new-internal-event",
          title: "New Internal Conference",
          startsAt: 1743513600000,
          currency: "USD",
        },
      ]

      vi.mocked(convexQuery)
        .mockResolvedValueOnce(mockOrdersResult)
        .mockResolvedValueOnce(mockEvents)

      const result = await getOrderLedger({})

      expect(result.availableEvents[0]).toMatchObject({
        eventId: "event-internal-new",
        slug: "new-internal-event",
        title: "New Internal Conference",
        currency: "USD",
      })
    })

    it("preserves integration filter behavior when eventId is specified", async () => {
      const mockOrdersResult = {
        orders: [
          {
            providerOrderId: "order-tt-1",
            eventId: "event-integration-1",
            eventSlug: "integration-camp",
            eventTitle: "Integration Summer Camp",
            normalizedStatus: "paid" as const,
            isArchived: false,
            archivedAt: null,
            archiveReason: null,
            totalAmountMinor: 5000,
            currency: "EUR",
            orderedAt: "2026-03-30T10:00:00.000Z",
            buyerName: "Alice Brown",
            buyerEmail: "alice@example.com",
          },
        ],
        totalRows: 1,
        totalPages: 1,
      }

      const mockEvents = [
        {
          _id: "event-integration-1",
          slug: "integration-camp",
          title: "Integration Summer Camp",
          startsAt: 1743340800000,
          currency: "EUR",
        },
        {
          _id: "event-internal-1",
          slug: "internal-retreat",
          title: "Internal Team Retreat",
          startsAt: 1743427200000,
          currency: "EUR",
        },
      ]

      vi.mocked(convexQuery)
        .mockResolvedValueOnce(mockOrdersResult)
        .mockResolvedValueOnce(mockEvents)

      const result = await getOrderLedger({ eventId: "event-integration-1" })

      expect(result.filters.eventId).toBe("event-integration-1")
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].eventId).toBe("event-integration-1")
      expect(result.availableEvents).toHaveLength(2)
    })

    it("returns empty orders when no orders match filter", async () => {
      const mockOrdersResult = {
        orders: [],
        totalRows: 0,
        totalPages: 1,
      }

      const mockEvents = [
        {
          _id: "event-integration-1",
          slug: "integration-camp",
          title: "Integration Summer Camp",
          startsAt: 1743340800000,
          currency: "EUR",
        },
      ]

      vi.mocked(convexQuery)
        .mockResolvedValueOnce(mockOrdersResult)
        .mockResolvedValueOnce(mockEvents)

      const result = await getOrderLedger({ eventId: "event-nonexistent" })

      expect(result.rows).toHaveLength(0)
      expect(result.page.totalRows).toBe(0)
    })

    it("handles date range filtering correctly", async () => {
      const mockOrdersResult = {
        orders: [],
        totalRows: 0,
        totalPages: 1,
      }

      const mockEvents = [
        {
          _id: "event-integration-1",
          slug: "integration-camp",
          title: "Integration Summer Camp",
          startsAt: 1743340800000,
          currency: "EUR",
        },
      ]

      vi.mocked(convexQuery)
        .mockResolvedValueOnce(mockOrdersResult)
        .mockResolvedValueOnce(mockEvents)

      const from = new Date("2026-03-01T00:00:00.000Z")
      const to = new Date("2026-03-31T23:59:59.999Z")

      const result = await getOrderLedger({ from, to })

      expect(result.filters.from).toBe(from.toISOString())
      expect(result.filters.to).toBe(to.toISOString())
    })

    it("normalizes null title to null in availableEvents", async () => {
      const mockOrdersResult = {
        orders: [],
        totalRows: 0,
        totalPages: 1,
      }

      const mockEvents = [
        {
          _id: "event-no-title",
          slug: "untitled-event",
          title: null,
          startsAt: 1743340800000,
          currency: "EUR",
        },
      ]

      vi.mocked(convexQuery)
        .mockResolvedValueOnce(mockOrdersResult)
        .mockResolvedValueOnce(mockEvents)

      const result = await getOrderLedger({})

      expect(result.availableEvents[0].title).toBeNull()
    })
  })
})
