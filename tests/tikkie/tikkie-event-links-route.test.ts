import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CONVEX_URL = "http://convex.test"

  return {
    requireApiUser: vi.fn(),
    createEventTikkieLink: vi.fn(),
    getTikkieMonthlyCreationQuotaStatus: vi.fn(),
    enforceTikkieMonthlyCreationQuota: vi.fn(),
    TikkieMonthlyQuotaExceededError: class TikkieMonthlyQuotaExceededError extends Error {
      quota: unknown

      constructor(quota: unknown) {
        super("Monthly Tikkie quota reached")
        this.name = "TikkieMonthlyQuotaExceededError"
        this.quota = quota
      }
    },
  }
})

vi.mock("@/lib/auth/server", () => ({
  requireApiUser: mocks.requireApiUser,
}))

vi.mock("@/lib/domain/finance/tikkie-event-links", () => ({
  createEventTikkieLink: mocks.createEventTikkieLink,
}))

vi.mock("@/lib/domain/finance/tikkie-quota", () => ({
  getTikkieMonthlyCreationQuotaStatus:
    mocks.getTikkieMonthlyCreationQuotaStatus,
  enforceTikkieMonthlyCreationQuota: mocks.enforceTikkieMonthlyCreationQuota,
  TikkieMonthlyQuotaExceededError: mocks.TikkieMonthlyQuotaExceededError,
}))

vi.mock("@/lib/domain/finance/tikkie-event-payments", () => ({
  manuallyMatchTikkiePayment: vi.fn(),
}))

import { POST } from "@/app/api/dashboard/tikkie-event-links/route"
import { requireApiUser } from "@/lib/auth/server"
import { createEventTikkieLink } from "@/lib/domain/finance/tikkie-event-links"
import {
  enforceTikkieMonthlyCreationQuota,
  getTikkieMonthlyCreationQuotaStatus,
  TikkieMonthlyQuotaExceededError,
} from "@/lib/domain/finance/tikkie-quota"

describe("/api/dashboard/tikkie-event-links POST", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(enforceTikkieMonthlyCreationQuota).mockResolvedValue({
      limit: 5,
      used: 1,
      remaining: 4,
      monthStartIso: "2026-03-01T00:00:00.000Z",
      monthEndIso: "2026-04-01T00:00:00.000Z",
    })
    vi.mocked(getTikkieMonthlyCreationQuotaStatus).mockResolvedValue({
      limit: 5,
      used: 2,
      remaining: 3,
      monthStartIso: "2026-03-01T00:00:00.000Z",
      monthEndIso: "2026-04-01T00:00:00.000Z",
    })
  })

  it("accepts amountMinor=0 and creates an open-amount link", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
    vi.mocked(createEventTikkieLink).mockResolvedValue({
      created: true,
      link: {
        id: "link_1",
        eventId: "event_1",
        paymentRequestToken: "token_1",
        paymentRequestUrl: "https://pay.example/token_1",
        status: "OPEN",
        amountMinor: 0,
        description: "Event event_1",
        expiryDate: "2026-04-01",
        createdAt: "2026-03-26T00:00:00.000Z",
      },
    })

    const response = await POST(
      new Request("http://localhost/api/dashboard/tikkie-event-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: "event_1",
          providerEventId: "event_1",
          amountMinor: 0,
        }),
      })
    )

    const body = await response.json()

    expect(response.status).toBe(201)
    expect(createEventTikkieLink).toHaveBeenCalledWith({
      eventId: "event_1",
      providerEventId: "event_1",
      amountMinor: 0,
      description: undefined,
      expiryDate: undefined,
      expiryDays: undefined,
    })
    expect(body).toEqual({
      ok: true,
      created: true,
      link: {
        id: "link_1",
        eventId: "event_1",
        paymentRequestToken: "token_1",
        paymentRequestUrl: "https://pay.example/token_1",
        status: "OPEN",
        amountMinor: 0,
        description: "Event event_1",
        expiryDate: "2026-04-01",
        createdAt: "2026-03-26T00:00:00.000Z",
      },
      quota: {
        before: {
          limit: 5,
          used: 1,
          remaining: 4,
          monthStartIso: "2026-03-01T00:00:00.000Z",
          monthEndIso: "2026-04-01T00:00:00.000Z",
        },
        after: {
          limit: 5,
          used: 2,
          remaining: 3,
          monthStartIso: "2026-03-01T00:00:00.000Z",
          monthEndIso: "2026-04-01T00:00:00.000Z",
        },
      },
    })
  })

  it("returns 429 when monthly quota is exhausted", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
    vi.mocked(enforceTikkieMonthlyCreationQuota).mockRejectedValue(
      new TikkieMonthlyQuotaExceededError({
        limit: 5,
        used: 5,
        remaining: 0,
        monthStartIso: "2026-03-01T00:00:00.000Z",
        monthEndIso: "2026-04-01T00:00:00.000Z",
      })
    )

    const response = await POST(
      new Request("http://localhost/api/dashboard/tikkie-event-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: "event_1",
          providerEventId: "event_1",
          amountMinor: 0,
        }),
      })
    )

    const body = await response.json()

    expect(response.status).toBe(429)
    expect(body).toEqual({
      error: {
        code: "TIKKIE_QUOTA_EXCEEDED",
        message: "Monthly Tikkie quota reached",
      },
      quota: {
        limit: 5,
        used: 5,
        remaining: 0,
        monthStartIso: "2026-03-01T00:00:00.000Z",
        monthEndIso: "2026-04-01T00:00:00.000Z",
      },
    })
    expect(createEventTikkieLink).not.toHaveBeenCalled()
  })

  it("rejects invalid amountMinor values with BAD_REQUEST", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })

    const negativeResponse = await POST(
      new Request("http://localhost/api/dashboard/tikkie-event-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: "event_1",
          providerEventId: "event_1",
          amountMinor: -1,
        }),
      })
    )

    const negativeBody = await negativeResponse.json()

    expect(negativeResponse.status).toBe(400)
    expect(negativeBody).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "'amountMinor' must be a non-negative integer when provided",
      },
    })

    const stringResponse = await POST(
      new Request("http://localhost/api/dashboard/tikkie-event-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: "event_1",
          providerEventId: "event_1",
          amountMinor: "10.50",
        }),
      })
    )

    const stringBody = await stringResponse.json()

    expect(stringResponse.status).toBe(400)
    expect(stringBody).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "'amountMinor' must be a non-negative integer when provided",
      },
    })
    expect(createEventTikkieLink).not.toHaveBeenCalled()
  })

  it("keeps the shared unauthorized payload contract", async () => {
    vi.mocked(requireApiUser).mockResolvedValue(
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
      new Request("http://localhost/api/dashboard/tikkie-event-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: "event_1",
          providerEventId: "event_1",
          amountMinor: 0,
        }),
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
    expect(createEventTikkieLink).not.toHaveBeenCalled()
  })
})
