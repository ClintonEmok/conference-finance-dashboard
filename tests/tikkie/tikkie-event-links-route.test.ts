import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CONVEX_URL = "http://convex.test"

  return {
    requireApiUser: vi.fn(),
    createEventTikkieLink: vi.fn(),
    getTikkieMonthlyCreationQuotaStatus: vi.fn(),
    enforceTikkieMonthlyCreationQuota: vi.fn(),
    convexQuery: vi.fn(),
    convexMutation: vi.fn(),
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

vi.mock("@/lib/convex/server", () => ({
  convexQuery: mocks.convexQuery,
  convexMutation: mocks.convexMutation,
}))

import { GET, POST } from "@/app/api/dashboard/tikkie-event-links/route"
import { requireApiUser } from "@/lib/auth/server"
import { createEventTikkieLink } from "@/lib/domain/finance/tikkie-event-links"
import {
  enforceTikkieMonthlyCreationQuota,
  getTikkieMonthlyCreationQuotaStatus,
  TikkieMonthlyQuotaExceededError,
} from "@/lib/domain/finance/tikkie-quota"

const quotaBefore = {
  limit: 5,
  used: 1,
  remaining: 4,
  monthStartIso: "2026-03-01T00:00:00.000Z",
  monthEndIso: "2026-04-01T00:00:00.000Z",
}

const quotaAfter = {
  limit: 5,
  used: 2,
  remaining: 3,
  monthStartIso: "2026-03-01T00:00:00.000Z",
  monthEndIso: "2026-04-01T00:00:00.000Z",
}

function postRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/dashboard/tikkie-event-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function getRequest(eventId = "event_1") {
  return new Request(
    `http://localhost/api/dashboard/tikkie-event-links?eventId=${encodeURIComponent(eventId)}`
  )
}

describe("/api/dashboard/tikkie-event-links POST", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(enforceTikkieMonthlyCreationQuota).mockResolvedValue(quotaBefore)
    vi.mocked(getTikkieMonthlyCreationQuotaStatus).mockResolvedValue(quotaAfter)
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
        purpose: "payment",
      },
    })

    const response = await POST(
      postRequest({
        eventId: "event_1",
        providerEventId: "event_1",
        amountMinor: 0,
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
      purpose: "payment",
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
        purpose: "payment",
      },
      quota: {
        before: quotaBefore,
        after: quotaAfter,
      },
    })
  })

  it("forwards an explicit donation purpose", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
    vi.mocked(createEventTikkieLink).mockResolvedValue({
      created: true,
      link: {
        id: "link_donation",
        eventId: "event_1",
        paymentRequestToken: "token_donation",
        paymentRequestUrl: "https://pay.example/donation",
        status: "OPEN",
        amountMinor: 0,
        description: "Donation event_1",
        expiryDate: "2026-04-01",
        createdAt: "2026-03-26T00:00:00.000Z",
        purpose: "donation",
      },
    })

    const response = await POST(
      postRequest({
        eventId: "event_1",
        providerEventId: "event_1",
        amountMinor: 0,
        purpose: "donation",
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
      purpose: "donation",
    })
    expect(body.link.purpose).toBe("donation")
  })

  it("rejects an unknown purpose value with BAD_REQUEST", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })

    const response = await POST(
      postRequest({
        eventId: "event_1",
        providerEventId: "event_1",
        amountMinor: 0,
        purpose: "donations",
      })
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "'purpose' must be 'payment' or 'donation' when provided",
      },
    })
    expect(createEventTikkieLink).not.toHaveBeenCalled()
  })

  it("shares one monthly quota between payment and donation links", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
    vi.mocked(enforceTikkieMonthlyCreationQuota)
      .mockResolvedValueOnce({
        ...quotaBefore,
        used: 4,
        remaining: 1,
      })
      .mockRejectedValueOnce(
        new TikkieMonthlyQuotaExceededError({
          ...quotaBefore,
          used: 5,
          remaining: 0,
        })
      )
    vi.mocked(getTikkieMonthlyCreationQuotaStatus).mockResolvedValueOnce({
      ...quotaBefore,
      used: 5,
      remaining: 0,
    })
    vi.mocked(createEventTikkieLink).mockResolvedValue({
      created: true,
      link: {
        id: "link_donation",
        eventId: "event_1",
        paymentRequestToken: "token_donation",
        paymentRequestUrl: "https://pay.example/donation",
        status: "OPEN",
        amountMinor: 0,
        description: "Donation event_1",
        expiryDate: "2026-04-01",
        createdAt: "2026-03-26T00:00:00.000Z",
        purpose: "donation",
      },
    })

    const firstResponse = await POST(
      postRequest({
        eventId: "event_1",
        providerEventId: "event_1",
        amountMinor: 0,
        purpose: "donation",
      })
    )
    const firstBody = await firstResponse.json()

    expect(firstResponse.status).toBe(201)
    expect(firstBody.quota.after).toEqual({
      ...quotaBefore,
      used: 5,
      remaining: 0,
    })

    const secondResponse = await POST(
      postRequest({
        eventId: "event_1",
        providerEventId: "event_1",
        amountMinor: 0,
        purpose: "donation",
      })
    )
    const secondBody = await secondResponse.json()

    expect(secondResponse.status).toBe(429)
    expect(secondBody.error.code).toBe("TIKKIE_QUOTA_EXCEEDED")
    expect(createEventTikkieLink).toHaveBeenCalledTimes(1)
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
      postRequest({
        eventId: "event_1",
        providerEventId: "event_1",
        amountMinor: 0,
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
      postRequest({
        eventId: "event_1",
        providerEventId: "event_1",
        amountMinor: -1,
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
      postRequest({
        eventId: "event_1",
        providerEventId: "event_1",
        amountMinor: "10.50",
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
      postRequest({
        eventId: "event_1",
        providerEventId: "event_1",
        amountMinor: 0,
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

describe("/api/dashboard/tikkie-event-links GET", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.convexQuery.mockReset()
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
    vi.mocked(getTikkieMonthlyCreationQuotaStatus).mockResolvedValue(quotaAfter)
  })

  it("splits payment links from donation links and keeps the purpose-less legacy link on the payment side", async () => {
    const legacyLink = {
      _id: "link_legacy",
      linkType: "event",
      eventId: "event_1",
      paymentRequestToken: "token_legacy",
      paymentRequestUrl: "https://pay.example/legacy",
      amountMinor: 2500,
      description: "Legacy event link",
      _creationTime: 1_000,
    }
    const paymentLink = {
      ...legacyLink,
      _id: "link_payment",
      paymentRequestToken: "token_payment",
      paymentRequestUrl: "https://pay.example/payment",
      description: "Payment event link",
      purpose: "payment",
      _creationTime: 2_000,
    }
    const donationLink = {
      ...legacyLink,
      _id: "link_donation",
      paymentRequestToken: "token_donation",
      paymentRequestUrl: "https://pay.example/donation",
      amountMinor: 0,
      description: "Donation event_1",
      purpose: "donation",
      _creationTime: 3_000,
    }
    const paymentOnPaymentLink = {
      _id: "payment_1",
      source: "tikkie",
      sourceId: "source_1",
      payerName: "Alice",
      amountMinor: 1500,
      paidAt: 1_700_000_000_000,
      status: "auto_matched",
      providerPayload: { paymentRequestToken: "token_payment" },
    }
    const paymentOnDonationLink = {
      _id: "payment_2",
      source: "tikkie",
      sourceId: "source_2",
      payerName: "Bob",
      amountMinor: 750,
      paidAt: 1_700_000_100_000,
      status: "donation",
      providerPayload: { paymentRequestToken: "token_donation" },
    }

    mocks.convexQuery
      .mockResolvedValueOnce([legacyLink, paymentLink, donationLink])
      .mockResolvedValueOnce([paymentOnPaymentLink, paymentOnDonationLink])

    const response = await GET(getRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.links.map((link: { _id: string }) => link._id)).toEqual([
      "link_payment",
      "link_legacy",
    ])
    expect(body.link._id).toBe("link_payment")
    expect(body.donationLinks.map((link: { _id: string }) => link._id)).toEqual([
      "link_donation",
    ])
    expect(body.donationLink._id).toBe("link_donation")
    expect(body.payments.map((payment: { _id: string }) => payment._id)).toEqual(
      ["payment_1"]
    )
    expect(
      body.donationPayments.map((payment: { _id: string }) => payment._id)
    ).toEqual(["payment_2"])
    expect(body.stats).toEqual({
      totalPayments: 1,
      matchedPayments: 1,
      unmatchedPayments: 0,
      totalAmountMinor: 1500,
    })
    expect(body.donationStats).toEqual({
      totalPayments: 1,
      totalAmountMinor: 750,
    })
    const paymentIds = new Set(
      body.payments.map((payment: { _id: string }) => payment._id)
    )
    expect(
      body.donationPayments.some((payment: { _id: string }) =>
        paymentIds.has(payment._id)
      )
    ).toBe(false)
    expect(body.quota).toEqual(quotaAfter)
  })

  it("returns the full empty shape when the event has no links", async () => {
    mocks.convexQuery.mockResolvedValueOnce([])

    const response = await GET(getRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      link: null,
      links: [],
      donationLink: null,
      donationLinks: [],
      payments: [],
      donationPayments: [],
      quota: quotaAfter,
      stats: {
        totalPayments: 0,
        matchedPayments: 0,
        unmatchedPayments: 0,
        totalAmountMinor: 0,
      },
      donationStats: {
        totalPayments: 0,
        totalAmountMinor: 0,
      },
    })
    expect(mocks.convexQuery).toHaveBeenCalledTimes(1)
  })
})
