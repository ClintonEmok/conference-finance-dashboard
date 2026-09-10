import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  convexMutation: vi.fn(),
  enforceRateLimit: vi.fn(),
}))

vi.mock("@/lib/convex/server", () => ({
  convexMutation: mocks.convexMutation,
}))

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}))

import { POST } from "@/app/api/track-payment/[bookingRef]/remove/route"
import { api } from "@/convex/_generated/api"
import { enforceRateLimit } from "@/lib/rate-limit"
import { getFunctionName } from "convex/server"

const TEST_SECRET = "test-remove-secret"
const BOOKING_REF = "BK-20260806-REMOVE01"

function removeRequest(input: {
  bookingRef?: string
  body?: Record<string, unknown>
  headers?: Record<string, string>
}) {
  const { bookingRef = BOOKING_REF, body = {}, headers = {} } = input
  return new Request(
    `http://localhost/api/track-payment/${bookingRef}/remove`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }
  )
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    attendeeKey: "a-1",
    bookerEmail: "Booker@Example.com",
    idempotencyKey: "idem-remove-1",
    website: "",
    ...overrides,
  }
}

const serverResult = {
  bookingRef: BOOKING_REF,
  attendeeKey: "a-1",
  remainingAttendees: 1,
  amountDueMinor: 11000,
}

describe("POST /api/track-payment/[bookingRef]/remove", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(enforceRateLimit).mockReturnValue(null)
    process.env.SIGNUP_SUBMISSION_SECRET = TEST_SECRET
    vi.mocked(mocks.convexMutation).mockResolvedValue(serverResult)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.SIGNUP_SUBMISSION_SECRET
  })

  it("applies rate limiting before parsing the body", async () => {
    const rateLimited = new Response(
      JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many requests." } }),
      { status: 429 }
    )
    vi.mocked(enforceRateLimit).mockReturnValueOnce(rateLimited)

    const response = await POST(removeRequest({ body: validBody() }), {
      params: Promise.resolve({ bookingRef: BOOKING_REF }),
    })

    expect(response.status).toBe(429)
    expect(mocks.convexMutation).not.toHaveBeenCalled()
  })

  it("forwards a normalized removal envelope and returns the server result", async () => {
    const response = await POST(
      removeRequest({
        bookingRef: "  bk-20260806-remove01  ",
        body: validBody(),
      }),
      { params: Promise.resolve({ bookingRef: "  bk-20260806-remove01  " }) }
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.data).toEqual(serverResult)

    expect(mocks.convexMutation).toHaveBeenCalledTimes(1)
    expect(
      getFunctionName(mocks.convexMutation.mock.calls[0][0])
    ).toBe("publicTracking:removeAttendeeFromBooking")
    const args = mocks.convexMutation.mock.calls[0][1] as Record<
      string,
      unknown
    >
    expect(args.bookingRef).toBe(BOOKING_REF)
    expect(args.attendeeKey).toBe("a-1")
    expect(args.bookerEmail).toBe("booker@example.com")
    expect(args.idempotencyKey).toBe("idem-remove-1")
    expect(args.editToken).toBeUndefined()
    expect(typeof args.requestSignature).toBe("string")
    expect(args.requestSignature).toContain(".")
  })

  it("rejects payloads with unsupported fields", async () => {
    const response = await POST(
      removeRequest({ body: validBody({ amountMinor: 5000 }) }),
      { params: Promise.resolve({ bookingRef: BOOKING_REF }) }
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe("INVALID_EDIT")
    expect(mocks.convexMutation).not.toHaveBeenCalled()
  })

  it("requires ownership (email or edit token)", async () => {
    const response = await POST(
      removeRequest({ body: validBody({ bookerEmail: undefined }) }),
      { params: Promise.resolve({ bookingRef: BOOKING_REF }) }
    )

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error.code).toBe("EDIT_OWNERSHIP")
    expect(mocks.convexMutation).not.toHaveBeenCalled()
  })

  it("maps ownership/signature/not-found guard failures to stable responses", async () => {
    vi.mocked(mocks.convexMutation).mockRejectedValueOnce(
      new Error("EDIT_NOT_FOUND: Booking not found.")
    )
    const notFound = await POST(removeRequest({ body: validBody() }), {
      params: Promise.resolve({ bookingRef: BOOKING_REF }),
    })
    expect(notFound.status).toBe(404)
    expect((await notFound.json()).error.code).toBe("EDIT_NOT_FOUND")

    vi.mocked(mocks.convexMutation).mockRejectedValueOnce(
      new Error("EDIT_OWNERSHIP: Ownership of this booking could not be verified.")
    )
    const ownership = await POST(removeRequest({ body: validBody() }), {
      params: Promise.resolve({ bookingRef: BOOKING_REF }),
    })
    expect(ownership.status).toBe(403)
    expect((await ownership.json()).error.code).toBe("EDIT_OWNERSHIP")

    vi.mocked(mocks.convexMutation).mockRejectedValueOnce(
      new Error("An order must retain at least one attendee.")
    )
    const single = await POST(removeRequest({ body: validBody() }), {
      params: Promise.resolve({ bookingRef: BOOKING_REF }),
    })
    expect(single.status).toBe(409)
    expect((await single.json()).error.code).toBe("EDIT_INVALID")
  })
})