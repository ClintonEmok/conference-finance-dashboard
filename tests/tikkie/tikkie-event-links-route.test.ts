import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CONVEX_URL = "http://convex.test"

  return {
    requireApiUser: vi.fn(),
    createEventTikkieLink: vi.fn(),
  }
})

vi.mock("@/lib/auth/server", () => ({
  requireApiUser: mocks.requireApiUser,
}))

vi.mock("@/lib/domain/finance/tikkie-event-links", () => ({
  createEventTikkieLink: mocks.createEventTikkieLink,
}))

vi.mock("@/lib/domain/finance/tikkie-event-payments", () => ({
  manuallyMatchTikkiePayment: vi.fn(),
}))

import { POST } from "@/app/api/dashboard/tikkie-event-links/route"
import { requireApiUser } from "@/lib/auth/server"
import { createEventTikkieLink } from "@/lib/domain/finance/tikkie-event-links"

describe("/api/dashboard/tikkie-event-links POST", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    })
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
