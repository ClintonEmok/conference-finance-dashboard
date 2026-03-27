import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  api,
  fetchTicketTailorEventsPaginated,
  fetchTicketTailorOrdersByEventPaginated,
  fetchTicketTailorAttendeesForOrder,
  convexMutation,
  convexQuery,
} = vi.hoisted(() => ({
  api: {
    sync: {
      startSyncRun: "sync:startSyncRun",
      upsertTicketTailorEvent: "sync:upsertTicketTailorEvent",
      upsertTicketTailorOrder: "sync:upsertTicketTailorOrder",
      archiveMissingOrdersForEvent: "sync:archiveMissingOrdersForEvent",
      upsertTicketTailorAttendee: "sync:upsertTicketTailorAttendee",
      completeSyncRun: "sync:completeSyncRun",
      getTicketTailorAttendeesByOrderId:
        "sync:getTicketTailorAttendeesByOrderId",
      getAttendeeFamilyGroupByPrimaryId:
        "sync:getAttendeeFamilyGroupByPrimaryId",
      getFamilyMembersByGroupId: "sync:getFamilyMembersByGroupId",
      createAttendeeFamilyGroup: "sync:createAttendeeFamilyGroup",
      addAttendeeToFamilyGroup: "sync:addAttendeeToFamilyGroup",
    },
  },
  fetchTicketTailorEventsPaginated: vi.fn(),
  fetchTicketTailorOrdersByEventPaginated: vi.fn(),
  fetchTicketTailorAttendeesForOrder: vi.fn(),
  convexMutation: vi.fn(),
  convexQuery: vi.fn(),
}))

vi.mock("@/lib/convex/api", () => ({
  api,
}))

vi.mock("@/lib/convex/server", () => ({
  convexMutation,
  convexQuery,
}))

vi.mock("@/lib/integrations/ticket-tailor/client", () => ({
  fetchTicketTailorEventsPaginated,
  fetchTicketTailorOrdersByEventPaginated,
  fetchTicketTailorAttendeesForOrder,
}))

import { runTicketTailorSync } from "@/lib/integrations/ticket-tailor/sync"

describe("runTicketTailorSync", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    fetchTicketTailorEventsPaginated.mockResolvedValue({
      items: [{ id: "ev_provider_1", name: "Main event" }],
      pagesFetched: 1,
    })

    fetchTicketTailorOrdersByEventPaginated.mockResolvedValue({
      items: [
        {
          id: "ord_provider_1",
          event_id: "ev_provider_1",
          status: "paid",
          created_at: "2026-01-05T10:00:00.000Z",
        },
      ],
      pagesFetched: 1,
    })

    fetchTicketTailorAttendeesForOrder.mockResolvedValue({
      items: [],
      source: "embedded",
      usedFallback: false,
    })

    convexQuery.mockResolvedValue([])
  })

  it("reuses returned Convex ids when upserting downstream records", async () => {
    convexMutation.mockImplementation(async (reference, args) => {
      switch (reference) {
        case api.sync.startSyncRun:
          return "run_1"
        case api.sync.upsertTicketTailorEvent:
          return "event_doc_1"
        case api.sync.upsertTicketTailorOrder:
          expect(args.eventId).toBe("event_doc_1")
          return "order_doc_1"
        case api.sync.archiveMissingOrdersForEvent:
          return { scanned: 1, archived: 0 }
        case api.sync.completeSyncRun:
          expect(args.runId).toBe("run_1")
          expect(args.status).toBe("success")
          return "run_1"
        default:
          throw new Error(`Unexpected mutation ref: ${String(reference)}`)
      }
    })

    const summary = await runTicketTailorSync()

    expect(summary).toMatchObject({
      runId: "run_1",
      status: "success",
      counts: {
        eventsScanned: 1,
        ordersFetched: 1,
        ordersUpserted: 1,
        ordersArchived: 0,
        attendeesFetched: 0,
        attendeesUpserted: 0,
        failedItems: 0,
      },
    })

    expect(convexMutation).toHaveBeenCalledWith(
      api.sync.upsertTicketTailorEvent,
      expect.any(Object)
    )
    expect(convexMutation).toHaveBeenCalledWith(
      api.sync.upsertTicketTailorOrder,
      expect.objectContaining({
        eventId: "event_doc_1",
      })
    )
    expect(fetchTicketTailorAttendeesForOrder).toHaveBeenCalledTimes(1)
  })
})
