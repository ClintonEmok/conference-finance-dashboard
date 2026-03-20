import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  getSession: vi.fn(),
  prisma: {
    ticketTailorOrder: {
      findUnique: vi.fn(),
    },
    tikkiePaymentLink: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    tikkiePaymentLinkTransition: {
      findUnique: vi.fn(),
    },
  },
  createPaymentRequest: vi.fn(),
  getPaymentRequest: vi.fn(),
  getPaymentRequestPayments: vi.fn(),
  TikkieApiError: class TikkieApiError extends Error {
    status: number
    kind: "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "UPSTREAM"
    details: unknown

    constructor(status: number, message: string, details: unknown) {
      super(message)
      this.name = "TikkieApiError"
      this.status = status
      this.kind =
        status === 400
          ? "BAD_REQUEST"
          : status === 401
            ? "UNAUTHORIZED"
            : status === 403
              ? "FORBIDDEN"
              : "UPSTREAM"
      this.details = details
    }
  },
}))

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}))

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
    },
  },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}))

vi.mock("@/lib/integrations/tikkie/client", () => ({
  createPaymentRequest: mocks.createPaymentRequest,
  getPaymentRequest: mocks.getPaymentRequest,
  getPaymentRequestPayments: mocks.getPaymentRequestPayments,
  TikkieApiError: mocks.TikkieApiError,
}))

import { GET, POST } from "@/app/api/dashboard/tikkie-links/route"
import {
  TIKKIE_OPEN_LINK_STALE_MINUTES,
  listTikkiePaymentLinksByOrder,
  refreshTikkiePaymentLinkStatus,
  validateCreateTikkiePaymentLinkInput,
} from "@/lib/domain/finance/tikkie-links"
import { processTikkieWebhookNotification } from "@/lib/integrations/tikkie/webhook"

function session() {
  return {
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
      email: "admin@example.com",
      emailVerified: true,
      name: "Admin",
    },
  }
}

function dbLink(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "tpl_1",
    providerOrderId: "ord_1",
    providerEventId: "ev_1",
    paymentRequestToken: "token_1",
    paymentRequestUrl: "https://pay.example/token_1",
    status: "created",
    statusSource: "create",
    providerStatus: "OPEN",
    amountMinor: 2500,
    description: "Order ord_1",
    expiryDate: new Date("2026-04-10T00:00:00.000Z"),
    referenceId: "ord_1",
    providerPayload: { status: "OPEN" },
    providerLastCheckedAt: new Date(),
    statusUpdatedAt: new Date("2026-03-20T01:00:00.000Z"),
    createdAt: new Date("2026-03-20T01:00:00.000Z"),
    updatedAt: new Date("2026-03-20T01:00:00.000Z"),
    ...overrides,
  }
}

describe("Tikkie payment link contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.headers.mockResolvedValue(new Headers())
    mocks.getSession.mockResolvedValue(session())
  })

  it("rejects too-long description, referenceId, and past expiry dates", () => {
    expect(() =>
      validateCreateTikkiePaymentLinkInput({
        providerOrderId: "ord_1",
        providerEventId: "ev_1",
        amountMinor: 2500,
        description: "x".repeat(36),
        expiryDate: "2026-04-12",
        referenceId: "ord_1",
      }),
    ).toThrow("Invalid 'description'. Maximum length is 35 characters.")

    expect(() =>
      validateCreateTikkiePaymentLinkInput({
        providerOrderId: "ord_1",
        providerEventId: "ev_1",
        amountMinor: 2500,
        description: "Order ord_1",
        expiryDate: "2026-04-12",
        referenceId: "r".repeat(36),
      }),
    ).toThrow("Invalid 'referenceId'. Maximum length is 35 characters.")

    expect(() =>
      validateCreateTikkiePaymentLinkInput({
        providerOrderId: "ord_1",
        providerEventId: "ev_1",
        amountMinor: 2500,
        description: "Order ord_1",
        expiryDate: "2020-01-01",
        referenceId: "ord_1",
      }),
    ).toThrow("Invalid 'expiryDate'. Expected a future date.")
  })

  it("returns latest-link-first summary with history and freshness metadata", async () => {
    const freshTime = new Date().toISOString()
    const staleTime = new Date(Date.now() - (TIKKIE_OPEN_LINK_STALE_MINUTES + 5) * 60_000).toISOString()

    mocks.prisma.tikkiePaymentLink.findMany.mockResolvedValue([
      dbLink({ id: "tpl_2", paymentRequestToken: "token_2", createdAt: new Date("2026-03-20T03:00:00.000Z"), providerLastCheckedAt: new Date(freshTime) }),
      dbLink({ id: "tpl_1", paymentRequestToken: "token_1", createdAt: new Date("2026-03-19T03:00:00.000Z"), providerLastCheckedAt: new Date(staleTime) }),
    ])

    const result = await listTikkiePaymentLinksByOrder({ providerOrderId: " ord_1 " })

    expect(result.count).toBe(2)
    expect(result.latestLink?.paymentRequestToken).toBe("token_2")
    expect(result.latestLink?.checkState).toBe("fresh")
    expect(result.history).toHaveLength(1)
    expect(result.history[0]?.paymentRequestToken).toBe("token_1")
    expect(result.history[0]?.checkState).toBe("stale")
    expect(result.providerLastCheckedAt).toBe(result.latestLink?.providerLastCheckedAt ?? null)
  })

  it("returns BAD_REQUEST from the route for invalid provider-safe create payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/dashboard/tikkie-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerOrderId: "ord_1",
          providerEventId: "ev_1",
          amountMinor: 2500,
          description: "x".repeat(36),
          expiryDate: "2030-04-12",
          referenceId: "ord_1",
        }),
      }),
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Invalid 'description'. Maximum length is 35 characters.",
      },
    })
  })

  it("returns latest-link-first contract from the route and refreshes only open links", async () => {
    mocks.prisma.tikkiePaymentLink.findMany
      .mockResolvedValueOnce([
        dbLink({ id: "tpl_2", paymentRequestToken: "token_2", status: "created" }),
        dbLink({ id: "tpl_1", paymentRequestToken: "token_1", status: "paid", providerStatus: "CLOSED" }),
      ])
      .mockResolvedValueOnce([
        dbLink({ id: "tpl_2", paymentRequestToken: "token_2", status: "paid", providerStatus: "CLOSED" }),
        dbLink({ id: "tpl_1", paymentRequestToken: "token_1", status: "paid", providerStatus: "CLOSED" }),
      ])
    mocks.prisma.tikkiePaymentLinkTransition.findUnique.mockResolvedValue(null)
    mocks.prisma.tikkiePaymentLink.findUnique.mockResolvedValue(dbLink({ id: "tpl_2", paymentRequestToken: "token_2", status: "created" }))
    mocks.getPaymentRequest.mockResolvedValue({ status: "CLOSED" })
    mocks.getPaymentRequestPayments.mockResolvedValue({ payments: [{ id: "pay_1" }], totalElementCount: 1 })
    mocks.prisma.tikkiePaymentLink.update.mockResolvedValue(
      dbLink({ id: "tpl_2", paymentRequestToken: "token_2", status: "paid", providerStatus: "CLOSED" }),
    )

    const response = await GET(
      new Request("http://localhost/api/dashboard/tikkie-links?providerOrderId=ord_1&refresh=1"),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.latestLink.paymentRequestToken).toBe("token_2")
    expect(body.history).toHaveLength(1)
    expect(mocks.getPaymentRequest).toHaveBeenCalledTimes(1)
    expect(mocks.getPaymentRequest).toHaveBeenCalledWith("token_2")
  })

  it("treats duplicate webhook notifications as unchanged without refetching provider state", async () => {
    mocks.prisma.tikkiePaymentLinkTransition.findUnique.mockResolvedValue({
      paymentLink: dbLink({ status: "paid", providerStatus: "CLOSED" }),
    })

    const result = await refreshTikkiePaymentLinkStatus({
      paymentRequestToken: "token_1",
      source: "webhook",
      providerNotificationKey: "sub:PAYMENT:token_1:pay_1:",
    })

    expect(result.duplicate).toBe(true)
    expect(result.changed).toBe(false)
    expect(result.link.status).toBe("paid")
    expect(mocks.getPaymentRequest).not.toHaveBeenCalled()
  })

  it("reports missing webhook links explicitly", async () => {
    mocks.prisma.tikkiePaymentLinkTransition.findUnique.mockResolvedValue(null)
    mocks.prisma.tikkiePaymentLink.findUnique.mockResolvedValue(null)

    const result = await processTikkieWebhookNotification({
      subscriptionId: "sub_1",
      notificationType: "PAYMENT",
      paymentRequestToken: "missing_token",
      paymentToken: "pay_1",
    })

    expect(result).toEqual({
      accepted: true,
      duplicate: false,
      missing: true,
      paymentRequestToken: "missing_token",
      changed: false,
      status: null,
    })
  })
})
