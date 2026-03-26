import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/integrations/ticket-tailor/sync", () => ({
  runTicketTailorSync: vi.fn(),
}))

import { runTicketTailorSync } from "@/lib/integrations/ticket-tailor/sync"

import { POST } from "@/app/api/ticket-tailor/sync/route"

describe("POST /api/ticket-tailor/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns sync summary on success", async () => {
    vi.mocked(runTicketTailorSync).mockResolvedValue({
      runId: "run_123",
      status: "success",
      scope: {
        eventId: "ev_1",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-31T23:59:59.000Z",
      },
      counts: {
        eventsScanned: 2,
        ordersFetched: 8,
        ordersUpserted: 8,
        ordersSkippedByScope: 1,
        attendeesFetched: 12,
        attendeesUpserted: 12,
        attendeesSkipped: 1,
        normalizedFallbackCount: 0,
        failedItems: 0,
      },
      diagnostics: {
        fallbackNotes: [],
        errors: [],
      },
    })

    const response = await POST(
      new Request("http://localhost/api/ticket-tailor/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: "ev_1",
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-31T23:59:59.000Z",
        }),
      })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      runId: "run_123",
      status: "success",
      scope: {
        eventId: "ev_1",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-31T23:59:59.000Z",
      },
      counts: {
        eventsScanned: 2,
        ordersFetched: 8,
        ordersUpserted: 8,
        ordersSkippedByScope: 1,
        attendeesFetched: 12,
        attendeesUpserted: 12,
        attendeesSkipped: 1,
        normalizedFallbackCount: 0,
        failedItems: 0,
      },
      diagnostics: {
        fallbackNotes: [],
        errors: [],
      },
    })
    expect(runTicketTailorSync).toHaveBeenCalledWith({
      eventId: "ev_1",
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-01-31T23:59:59.000Z"),
    })
  })

  it("returns 500 diagnostics when sync fails", async () => {
    vi.mocked(runTicketTailorSync).mockRejectedValue(
      new Error("Provider timeout")
    )

    const response = await POST(
      new Request("http://localhost/api/ticket-tailor/sync", { method: "POST" })
    )
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: {
        code: "SYNC_FAILED",
        message: "Ticket Tailor sync failed",
      },
      diagnostics: {
        detail: "Provider timeout",
      },
    })
  })

  it("returns 400 when from is after to", async () => {
    const response = await POST(
      new Request("http://localhost/api/ticket-tailor/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "2026-02-01T00:00:00.000Z",
          to: "2026-01-01T00:00:00.000Z",
        }),
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: {
        code: "BAD_REQUEST",
        message:
          "Invalid date range. 'from' must be less than or equal to 'to'.",
      },
    })
    expect(runTicketTailorSync).not.toHaveBeenCalled()
  })

  it("returns 400 when the request body is invalid json", async () => {
    const response = await POST(
      new Request("http://localhost/api/ticket-tailor/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid-json",
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Invalid JSON payload",
      },
    })
    expect(runTicketTailorSync).not.toHaveBeenCalled()
  })
})
