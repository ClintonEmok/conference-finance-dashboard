import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn<() => Promise<Response | { userId: string }>>(),
  subscribePaymentRequestNotifications:
    vi.fn<() => Promise<{ subscriptionId: string }>>(),
  getTikkieConfig: vi.fn(),
}))

vi.mock("@/lib/auth/server", () => ({
  requireApiUser: mocks.requireApiUser,
}))

vi.mock("@/lib/integrations/tikkie/client", () => ({
  subscribePaymentRequestNotifications:
    mocks.subscribePaymentRequestNotifications,
}))

vi.mock("@/lib/integrations/tikkie/config", () => ({
  getTikkieConfig: mocks.getTikkieConfig,
}))

const user = () => ({ userId: "user-1" })

import { POST } from "@/app/api/admin/tikkie/subscription/route"

describe("POST /api/admin/tikkie/subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when no session is present", async () => {
    mocks.requireApiUser.mockResolvedValue(
      NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
        },
        { status: 401 }
      )
    )

    const response = await POST(
      new Request("http://localhost/api/admin/tikkie/subscription", {
        method: "POST",
      })
    )

    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    })
    expect(mocks.subscribePaymentRequestNotifications).not.toHaveBeenCalled()
  })

  it("returns 403 when subscription setup is disabled", async () => {
    mocks.requireApiUser.mockResolvedValue(user())
    mocks.getTikkieConfig.mockReturnValue({
      configured: true,
      errors: [],
      metadata: {
        baseUrl: "https://api.tikkie.me",
        hasApiKey: true,
        keyPreview: "test",
        appTokenConfigured: true,
        subscriptionSetupEnabled: false,
        hasWebhookCallbackUrl: false,
        webhookCallbackUrl: null,
      },
      values: {
        apiKey: "test-key",
        baseUrl: "https://api.tikkie.me",
        appToken: "test-token",
        subscriptionSetupEnabled: false,
        webhookCallbackUrl: null,
      },
    })

    const response = await POST(
      new Request("http://localhost/api/admin/tikkie/subscription", {
        method: "POST",
      })
    )

    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({
      error: {
        code: "SUBSCRIPTION_SETUP_DISABLED",
        message:
          "Subscription setup is not enabled. Set TIKKIE_SUBSCRIPTION_SETUP_ENABLED=true to activate.",
      },
    })
    expect(mocks.subscribePaymentRequestNotifications).not.toHaveBeenCalled()
  })

  it("returns 400 when callback URL is missing but setup is enabled", async () => {
    mocks.requireApiUser.mockResolvedValue(user())
    mocks.getTikkieConfig.mockReturnValue({
      configured: true,
      errors: [],
      metadata: {
        baseUrl: "https://api.tikkie.me",
        hasApiKey: true,
        keyPreview: "test",
        appTokenConfigured: true,
        subscriptionSetupEnabled: true,
        hasWebhookCallbackUrl: false,
        webhookCallbackUrl: null,
      },
      values: {
        apiKey: "test-key",
        baseUrl: "https://api.tikkie.me",
        appToken: "test-token",
        subscriptionSetupEnabled: true,
        webhookCallbackUrl: null,
      },
    })

    const response = await POST(
      new Request("http://localhost/api/admin/tikkie/subscription", {
        method: "POST",
      })
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: {
        code: "MISSING_CALLBACK_URL",
        message:
          "Webhook callback URL is not configured. Set TIKKIE_WEBHOOK_CALLBACK_URL to your public callback endpoint.",
      },
    })
    expect(mocks.subscribePaymentRequestNotifications).not.toHaveBeenCalled()
  })

  it("returns 201 and subscription details when enabled and valid", async () => {
    mocks.requireApiUser.mockResolvedValue(user())
    mocks.getTikkieConfig.mockReturnValue({
      configured: true,
      errors: [],
      metadata: {
        baseUrl: "https://api.tikkie.me",
        hasApiKey: true,
        keyPreview: "test",
        appTokenConfigured: true,
        subscriptionSetupEnabled: true,
        hasWebhookCallbackUrl: true,
        webhookCallbackUrl: "https://example.com/webhook",
      },
      values: {
        apiKey: "test-key",
        baseUrl: "https://api.tikkie.me",
        appToken: "test-token",
        subscriptionSetupEnabled: true,
        webhookCallbackUrl: "https://example.com/webhook",
      },
    })
    mocks.subscribePaymentRequestNotifications.mockResolvedValue({
      subscriptionId: "sub-123-abc",
    })

    const response = await POST(
      new Request("http://localhost/api/admin/tikkie/subscription", {
        method: "POST",
      })
    )

    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toEqual({
      success: true,
      subscriptionId: "sub-123-abc",
      callbackUrl: "https://example.com/webhook",
      message: "Payment request notification subscription created successfully",
    })
    expect(mocks.subscribePaymentRequestNotifications).toHaveBeenCalledWith({
      url: "https://example.com/webhook",
    })
  })

  it("returns 500 when Tikkie configuration is invalid", async () => {
    mocks.requireApiUser.mockResolvedValue(user())
    mocks.getTikkieConfig.mockReturnValue({
      configured: false,
      errors: ["TIKKIE_API_KEY is missing", "TIKKIE_APP_TOKEN is missing"],
      metadata: {
        baseUrl: "https://api.tikkie.me",
        hasApiKey: false,
        keyPreview: null,
        appTokenConfigured: false,
        subscriptionSetupEnabled: true,
        hasWebhookCallbackUrl: true,
        webhookCallbackUrl: "https://example.com/webhook",
      },
      values: {
        apiKey: null,
        baseUrl: "https://api.tikkie.me",
        appToken: null,
        subscriptionSetupEnabled: true,
        webhookCallbackUrl: "https://example.com/webhook",
      },
    })

    const response = await POST(
      new Request("http://localhost/api/admin/tikkie/subscription", {
        method: "POST",
      })
    )

    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error.code).toBe("INVALID_CONFIGURATION")
    expect(body.error.message).toContain("TIKKIE_API_KEY is missing")
    expect(mocks.subscribePaymentRequestNotifications).not.toHaveBeenCalled()
  })

  it("returns 502 when Tikkie API returns authorization error", async () => {
    mocks.requireApiUser.mockResolvedValue(user())
    mocks.getTikkieConfig.mockReturnValue({
      configured: true,
      errors: [],
      metadata: {
        baseUrl: "https://api.tikkie.me",
        hasApiKey: true,
        keyPreview: "test",
        appTokenConfigured: true,
        subscriptionSetupEnabled: true,
        hasWebhookCallbackUrl: true,
        webhookCallbackUrl: "https://example.com/webhook",
      },
      values: {
        apiKey: "test-key",
        baseUrl: "https://api.tikkie.me",
        appToken: "test-token",
        subscriptionSetupEnabled: true,
        webhookCallbackUrl: "https://example.com/webhook",
      },
    })
    mocks.subscribePaymentRequestNotifications.mockRejectedValue(
      new Error("Tikkie request failed (401)")
    )

    const response = await POST(
      new Request("http://localhost/api/admin/tikkie/subscription", {
        method: "POST",
      })
    )

    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.error.code).toBe("TIKKIE_UNAUTHORIZED")
    expect(body.error.message).toContain("Tikkie API authentication failed")
  })

  it("returns 502 when Tikkie API returns forbidden error", async () => {
    mocks.requireApiUser.mockResolvedValue(user())
    mocks.getTikkieConfig.mockReturnValue({
      configured: true,
      errors: [],
      metadata: {
        baseUrl: "https://api.tikkie.me",
        hasApiKey: true,
        keyPreview: "test",
        appTokenConfigured: true,
        subscriptionSetupEnabled: true,
        hasWebhookCallbackUrl: true,
        webhookCallbackUrl: "https://example.com/webhook",
      },
      values: {
        apiKey: "test-key",
        baseUrl: "https://api.tikkie.me",
        appToken: "test-token",
        subscriptionSetupEnabled: true,
        webhookCallbackUrl: "https://example.com/webhook",
      },
    })
    mocks.subscribePaymentRequestNotifications.mockRejectedValue(
      new Error("Tikkie request failed (403)")
    )

    const response = await POST(
      new Request("http://localhost/api/admin/tikkie/subscription", {
        method: "POST",
      })
    )

    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.error.code).toBe("TIKKIE_FORBIDDEN")
    expect(body.error.message).toContain("payment request permission")
  })
})
