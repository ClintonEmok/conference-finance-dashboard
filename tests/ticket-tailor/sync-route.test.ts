import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}))

vi.mock("@/lib/integrations/ticket-tailor/sync", () => ({
  runTicketTailorSync: vi.fn(),
}))

import { headers } from "next/headers"

import { auth } from "@/lib/auth"
import { runTicketTailorSync } from "@/lib/integrations/ticket-tailor/sync"

import { POST } from "@/app/api/ticket-tailor/sync/route"

describe("POST /api/ticket-tailor/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(headers).mockResolvedValue(new Headers())
  })

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)

    const response = await POST(new Request("http://localhost/api/ticket-tailor/sync", { method: "POST" }))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    })
    expect(runTicketTailorSync).not.toHaveBeenCalled()
  })

  it("returns sync summary when authenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      session: {
        id: "session_1",
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: "user_1",
        expiresAt: new Date(Date.now() + 60_000),
        token: "token_1",
      },
      user: {
        id: "user_1",
        createdAt: new Date(),
        updatedAt: new Date(),
        email: "test@example.com",
        emailVerified: true,
        name: "Test User",
      },
    })

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
      }),
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
  })

  it("returns 500 diagnostics when sync fails", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      session: {
        id: "session_1",
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: "user_1",
        expiresAt: new Date(Date.now() + 60_000),
        token: "token_1",
      },
      user: {
        id: "user_1",
        createdAt: new Date(),
        updatedAt: new Date(),
        email: "test@example.com",
        emailVerified: true,
        name: "Test User",
      },
    })

    vi.mocked(runTicketTailorSync).mockRejectedValue(new Error("Provider timeout"))

    const response = await POST(new Request("http://localhost/api/ticket-tailor/sync", { method: "POST" }))
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
    vi.mocked(auth.api.getSession).mockResolvedValue({
      session: {
        id: "session_1",
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: "user_1",
        expiresAt: new Date(Date.now() + 60_000),
        token: "token_1",
      },
      user: {
        id: "user_1",
        createdAt: new Date(),
        updatedAt: new Date(),
        email: "test@example.com",
        emailVerified: true,
        name: "Test User",
      },
    })

    const response = await POST(
      new Request("http://localhost/api/ticket-tailor/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "2026-02-01T00:00:00.000Z",
          to: "2026-01-01T00:00:00.000Z",
        }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Invalid date range. 'from' must be less than or equal to 'to'.",
      },
    })
    expect(runTicketTailorSync).not.toHaveBeenCalled()
  })
})
