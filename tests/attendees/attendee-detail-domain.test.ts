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
          ticketTypeId: "ticket_type_1",
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
                // Server-owned per-attendee money: paid / outstanding come from
                // the canonical attribution owner on the server.
                paidAmountMinor: 2500,
                outstandingAmountMinor: 0,
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
    expect(detail.finance.outstandingAmountMinor).toBe(0)
    expect(detail.tikkie.actions.listEndpoint).toBe(
      "/api/dashboard/tikkie-links?orderId=order_1"
    )
    expect(detail.tikkie.generationDefaults.referenceId).toBe("order_1")
    expect(detail.tikkie.generationDefaults.description).toBe("Order order_1")
  })

  it("surfaces the server-provided paid figure instead of a due-weighted spread", async () => {
    // The order carries a real 5_000 applied payment (payments history mock)
    // and two attendees with equal 2_500 dues — a client-side due-weighted
    // spread would report 2_500 paid for attendee_1. The server says an
    // allocation credited the sibling, so attendee_1 reads 0 paid / 2_500
    // outstanding. The SERVER figure must surface.
    let orderWithAttendeesCalls = 0
    vi.mocked(convexQuery).mockImplementation(async (_ref, args) => {
      if (args && typeof args === "object" && "attendeeId" in args) {
        return {
          _id: "attendee_1",
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
          eventId: "event_1",
          orderId: "order_1",
          assignedRoomId: null,
          customAnswers: null,
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
        // Call 1 is `orders.getOrderWithAttendees`; the following orderId call
        // is the Tikkie payment-link read, which returns a list.
        orderWithAttendeesCalls += 1
        if (orderWithAttendeesCalls === 1) {
          return {
            order: {
              id: "order_1",
              providerOrderId: null,
              providerEventId: null,
              buyerName: "Ada Lovelace",
              buyerEmail: "ada@example.com",
              normalizedStatus: "pending",
              orderedAt: "2026-03-01T10:00:00.000Z",
              amountDueMinor: 5000,
              totalAmountMinor: 5000,
            },
            attendees: [
              {
                id: "attendee_1",
                amountDueMinor: 2500,
                paidAmountMinor: 0,
                outstandingAmountMinor: 2500,
              },
              {
                id: "attendee_2",
                amountDueMinor: 2500,
                paidAmountMinor: 5000,
                outstandingAmountMinor: 0,
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
            amountMinor: 5000,
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

    expect(detail.finance.paidAmountMinor).toBe(0)
    expect(detail.finance.outstandingAmountMinor).toBe(2500)
    expect(detail.finance.overpaidAmountMinor).toBe(0)
  })
})
