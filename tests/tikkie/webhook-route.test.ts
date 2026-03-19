import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/integrations/tikkie/webhook", () => ({
  verifyTikkieWebhook: vi.fn(),
  processTikkieWebhookNotification: vi.fn(),
}))

import {
  processTikkieWebhookNotification,
  verifyTikkieWebhook,
} from "@/lib/integrations/tikkie/webhook"

import { POST } from "@/app/api/webhooks/tikkie/route"

describe("POST /api/webhooks/tikkie", () => {
  it("returns 401 when signature verification fails", async () => {
    vi.mocked(verifyTikkieWebhook).mockReturnValue(false)

    const response = await POST(
      new Request("http://localhost/api/webhooks/tikkie", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    )

    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      error: {
        code: "INVALID_SIGNATURE",
        message: "Webhook signature verification failed",
      },
    })
    expect(processTikkieWebhookNotification).not.toHaveBeenCalled()
  })

  it("returns 400 on invalid json", async () => {
    vi.mocked(verifyTikkieWebhook).mockReturnValue(true)

    const response = await POST(
      new Request("http://localhost/api/webhooks/tikkie", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "not-json",
      }),
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
    vi.mocked(verifyTikkieWebhook).mockReturnValue(true)
    vi.mocked(processTikkieWebhookNotification).mockResolvedValue({
      accepted: true,
      duplicate: false,
      paymentRequestToken: "qzdnzr8hnVWTgXXcFRLUMc",
      changed: true,
      status: "paid",
    })

    const response = await POST(
      new Request("http://localhost/api/webhooks/tikkie", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscriptionId: "sub-1",
          notificationType: "PAYMENT",
          paymentRequestToken: "qzdnzr8hnVWTgXXcFRLUMc",
          paymentToken: "pay-1",
        }),
      }),
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      accepted: true,
      duplicate: false,
      paymentRequestToken: "qzdnzr8hnVWTgXXcFRLUMc",
      changed: true,
      status: "paid",
    })
  })
})
