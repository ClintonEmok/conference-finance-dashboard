import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CONVEX_URL = "http://convex.test"
})

vi.mock("@/lib/integrations/ticket-tailor/webhook", () => ({
  verifyTicketTailorWebhook: vi.fn(),
  ingestTicketTailorWebhook: vi.fn(),
  processTicketTailorWebhookEvent: vi.fn(),
}))

import {
  ingestTicketTailorWebhook,
  processTicketTailorWebhookEvent,
  verifyTicketTailorWebhook,
} from "@/lib/integrations/ticket-tailor/webhook"

import { POST } from "@/app/api/webhooks/ticket-tailor/route"

describe("POST /api/webhooks/ticket-tailor", () => {
  it("returns 401 when webhook secret is not configured", async () => {
    vi.mocked(verifyTicketTailorWebhook).mockReturnValue(false)

    const response = await POST(
      new Request("http://localhost/api/webhooks/ticket-tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "evt-1" }),
      })
    )

    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      error: {
        code: "INVALID_SIGNATURE",
        message: "Webhook signature verification failed",
      },
    })
    expect(ingestTicketTailorWebhook).not.toHaveBeenCalled()
    expect(processTicketTailorWebhookEvent).not.toHaveBeenCalled()
  })

  it("returns 401 when signature verification fails", async () => {
    vi.mocked(verifyTicketTailorWebhook).mockReturnValue(false)

    const response = await POST(
      new Request("http://localhost/api/webhooks/ticket-tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    )

    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      error: {
        code: "INVALID_SIGNATURE",
        message: "Webhook signature verification failed",
      },
    })
    expect(ingestTicketTailorWebhook).not.toHaveBeenCalled()
  })

  it("returns 400 on invalid json", async () => {
    vi.mocked(verifyTicketTailorWebhook).mockReturnValue(true)

    const response = await POST(
      new Request("http://localhost/api/webhooks/ticket-tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      })
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: {
        code: "BAD_PAYLOAD",
        message: "Webhook body must be valid JSON",
      },
    })
  })

  it("returns 200 and accepts valid payload", async () => {
    vi.mocked(verifyTicketTailorWebhook).mockReturnValue(true)
    vi.mocked(ingestTicketTailorWebhook).mockResolvedValue({
      eventId: "evt_123",
      providerEventId: "tt-1",
      duplicate: false,
    })
    vi.mocked(processTicketTailorWebhookEvent).mockResolvedValue({
      status: "processed",
      attempts: 1,
      nextRetryAt: null,
      lastError: null,
    })

    const response = await POST(
      new Request("http://localhost/api/webhooks/ticket-tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "tt-1", event: "order.created" }),
      })
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      accepted: true,
      duplicate: false,
      providerEventId: "tt-1",
      eventId: "evt_123",
      processing: {
        status: "processed",
        attempts: 1,
        nextRetryAt: null,
        lastError: null,
      },
    })
  })
})
