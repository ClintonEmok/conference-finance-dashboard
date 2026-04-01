import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/convex/server", () => ({
  convexQuery: vi.fn(),
}))

import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"
import { getAttendeeDetail } from "@/lib/domain/finance/attendee-detail"

describe("getAttendeeDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses canonical order ids when provider ids are missing", async () => {
    let orderIdCallCount = 0

    vi.mocked(convexQuery).mockImplementation(async (_ref, args) => {
      if (args && typeof args === "object" && "attendeeId" in args) {
        return {
          _id: "attendee_1",
          name: "Ada Lovelace",
          email: "ada@example.com",
          ticketTypeLabel: "Weekend",
          ticketStatus: "issued",
          checkedInAt: null,
          providerIssuedTicketId: "issued_1",
          providerOrderId: null,
          providerEventId: null,
          amountDueMinor: 2500,
          eventId: "event_1",
          orderId: "order_1",
          assignedRoomId: null,
          customAnswers: {
            location: "Amsterdam",
            dietary: "Vegan",
          },
          genderType: "FEMALE",
          allocationPriority: "NORMAL",
          priorityReason: null,
          ageGroup: null,
          ticketCategory: null,
          tikkieAmountOverrideMinor: null,
        }
      }

      if (args && typeof args === "object" && "ticketTypeLabel" in args) {
        return null
      }

      if (args && typeof args === "object" && "orderId" in args) {
        orderIdCallCount += 1

        if (orderIdCallCount === 1) {
          return {
            order: {
              id: "order_1",
              providerOrderId: null,
              providerEventId: null,
              buyerName: "Ada Lovelace",
              buyerEmail: "ada@example.com",
              normalizedStatus: "pending",
              orderedAt: "2026-03-01T10:00:00.000Z",
              amountDueMinor: 2500,
              totalAmountMinor: 5000,
            },
            attendees: [
              {
                id: "attendee_1",
                amountDueMinor: 2500,
              },
            ],
          }
        }

        return []
      }

      if (args && typeof args === "object" && Object.keys(args).length === 0) {
        return [
          {
            _id: "payment_1",
            amountMinor: 2500,
            paidAt: 1740787200000,
            orderId: "order_1",
            status: "manual_assignment",
            source: "cash",
            payerName: "Ada Lovelace",
            _creationTime: 1740787200000,
          },
        ]
      }

      if (args && typeof args === "object" && "eventId" in args) {
        return {
          _id: "event_1",
          name: "Conference",
        }
      }
      return null
    })

    const detail = await getAttendeeDetail("attendee_1")

    expect(detail.attendee.providerOrderId).toBeNull()
    expect(detail.order.providerOrderId).toBeNull()
    expect(detail.finance.paidAmountMinor).toBe(2500)
    expect(detail.tikkie.actions.listEndpoint).toBe(
      "/api/dashboard/tikkie-links?orderId=order_1"
    )
    expect(detail.tikkie.generationDefaults.referenceId).toBe("order_1")
    expect(detail.tikkie.generationDefaults.description).toBe("Order order_1")
  })
})
