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

import { POST } from "@/app/api/track-payment/[bookingRef]/route"
import { api } from "@/convex/_generated/api"
import { enforceRateLimit } from "@/lib/rate-limit"
import { verifyEditRequestSignature } from "@/lib/domain/track-payment/edit-token"
import { getFunctionName } from "convex/server"

const TEST_SECRET = "test-route-secret"
const BOOKING_REF = "BK-20260806-TEST01"

function editRequest(input: {
  bookingRef?: string
  body?: Record<string, unknown>
  headers?: Record<string, string>
}) {
  const { bookingRef = BOOKING_REF, body = {}, headers = {} } = input
  return new Request(`http://localhost/api/track-payment/${bookingRef}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    bookerEmail: "Booker@Example.com",
    idempotencyKey: "idem-route-1",
    website: "",
    selections: [
      {
        attendeeKey: "a-1",
        categoryId: "j57b2pb9ym78g2s5m8z91x6qf97mex0r",
        occupancy: "shared",
        optionSelections: [{ optionKey: "cot", quantity: 1, nights: 2 }],
      },
      {
        attendeeKey: "a-2",
        categoryId: "j57b2pb9ym78g2s5m8z91x6qf97mex0r",
        occupancy: "shared",
        optionSelections: [],
      },
    ],
    ...overrides,
  }
}

const serverResult = {
  bookingRef: BOOKING_REF,
  status: "applied" as const,
  amountDueMinor: 22500,
  totalPaidMinor: 10000,
  remainingMinor: 12500,
  progressPercent: 44,
  overpaymentDeltaMinor: 0,
}

describe("POST /api/track-payment/[bookingRef]", () => {
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

  it("applies rate limiting before parsing the body and preserves its 429 contract", async () => {
    const rateLimited = new Response(
      JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many requests." } }),
      { status: 429, headers: { "Retry-After": "30" } }
    )
    vi.mocked(enforceRateLimit).mockReturnValueOnce(rateLimited)

    const response = await POST(editRequest({ body: validBody() }), {
      params: Promise.resolve({ bookingRef: BOOKING_REF }),
    })

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBe("30")
    expect(mocks.convexMutation).not.toHaveBeenCalled()
  })

  it("forwards a complete replacement with normalized ownership/idempotency inputs and returns the server result", async () => {
    const response = await POST(
      editRequest({
        bookingRef: "  bk-20260806-test01  ",
        body: validBody(),
      }),
      { params: Promise.resolve({ bookingRef: "  bk-20260806-test01  " }) }
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.data).toEqual(serverResult)

    expect(mocks.convexMutation).toHaveBeenCalledTimes(1)
    expect(
      getFunctionName(mocks.convexMutation.mock.calls[0][0])
    ).toBe("publicTracking:updateAccommodation")
    const args = mocks.convexMutation.mock.calls[0][1] as Record<
      string,
      unknown
    >
    expect(args.bookingRef).toBe(BOOKING_REF)
    expect(args.bookerEmail).toBe("booker@example.com")
    expect(args.idempotencyKey).toBe("idem-route-1")
    expect(args.requestSignature).toMatch(/\.[0-9]+$/)
    expect(Array.isArray(args.selections)).toBe(true)
    // The honeypot result is server-derived and never forwarded: a client
    // field is not part of the route-to-Convex contract (WR-05).
    expect("honeypotSeen" in args).toBe(false)
    // The mutation receives only options-only preference fields — never a
    // client amount, total, price, date, night, room, slot, or snapshot.
    const allowedSelectionKeys = new Set([
      "attendeeKey",
      "categoryId",
      "occupancy",
      "nightBeforeLevel",
      "optionSelections",
    ])
    for (const selection of args.selections as Array<Record<string, unknown>>) {
      expect(Object.keys(selection).every((key) => allowedSelectionKeys.has(key)))
        .toBe(true)
    }
  })

  it("repeated retries preserve the same envelope inputs and re-sign a fresh request", async () => {
    const body = validBody({ idempotencyKey: "idem-retry" })
    await POST(
      editRequest({ body, headers: { "x-idempotency-key": "idem-retry" } }),
      { params: Promise.resolve({ bookingRef: BOOKING_REF }) }
    )
    await POST(
      editRequest({ body, headers: { "x-idempotency-key": "idem-retry" } }),
      { params: Promise.resolve({ bookingRef: BOOKING_REF }) }
    )

    expect(mocks.convexMutation).toHaveBeenCalledTimes(2)
    const first = mocks.convexMutation.mock.calls[0][1] as {
      bookingRef: string
      idempotencyKey: string
      requestSignature: string
    }
    const second = mocks.convexMutation.mock.calls[1][1] as {
      bookingRef: string
      idempotencyKey: string
      requestSignature: string
    }
    expect(first.bookingRef).toBe(BOOKING_REF)
    expect(first.idempotencyKey).toBe("idem-retry")
    expect(second.bookingRef).toBe(BOOKING_REF)
    expect(second.idempotencyKey).toBe("idem-retry")
    // Each retry carries a fresh short-lived signature that still verifies
    // against the exact same normalized envelope (signature inputs stable).
    expect(first.requestSignature).toMatch(/\.[0-9]+$/)
    expect(second.requestSignature).toMatch(/\.[0-9]+$/)
    expect(
      await verifyEditRequestSignature(first.requestSignature, {
        bookingRef: BOOKING_REF,
        bookerEmail: "booker@example.com",
        editToken: null,
        idempotencyKey: "idem-retry",
        selections: (body.selections ?? []) as never,
        secret: TEST_SECRET,
      })
    ).toBe(true)
    expect(
      await verifyEditRequestSignature(second.requestSignature, {
        bookingRef: BOOKING_REF,
        bookerEmail: "booker@example.com",
        editToken: null,
        idempotencyKey: "idem-retry",
        selections: (body.selections ?? []) as never,
        secret: TEST_SECRET,
      })
    ).toBe(true)
  })

  it("ignores a client-supplied honeypotSeen marker and forwards a clean envelope", async () => {
    const response = await POST(
      editRequest({ body: validBody({ honeypotSeen: true }) }),
      { params: Promise.resolve({ bookingRef: BOOKING_REF }) }
    )
    expect(response.status).toBe(200)
    expect(mocks.convexMutation).toHaveBeenCalledTimes(1)
    const args = mocks.convexMutation.mock.calls[0][1] as Record<
      string,
      unknown
    >
    // The marker never reaches the mutation or the signed envelope; the
    // honeypot state is derived solely from the server-side website check.
    expect("honeypotSeen" in args).toBe(false)
  })

  it("never trusts a client-supplied requestSignature and always mints its own", async () => {
    const forgedSignature = "client-forged-signature.payload"
    const response = await POST(
      editRequest({ body: validBody({ requestSignature: forgedSignature }) }),
      { params: Promise.resolve({ bookingRef: BOOKING_REF }) }
    )
    expect(response.status).toBe(200)
    expect(mocks.convexMutation).toHaveBeenCalledTimes(1)
    const args = mocks.convexMutation.mock.calls[0][1] as Record<
      string,
      unknown
    >
    // The client's signature is never forwarded: the route re-signs the
    // normalized envelope server-side, so a caller cannot bypass signing or
    // inject their own authority.
    expect(args.requestSignature).toBeTypeOf("string")
    expect(args.requestSignature).not.toBe(forgedSignature)
    expect(args.requestSignature).toMatch(/\.[0-9]+$/)
  })

  it("rejects a non-empty honeypot before touching Convex", async () => {
    const response = await POST(
      editRequest({ body: validBody({ website: "spam-site" }) }),
      { params: Promise.resolve({ bookingRef: BOOKING_REF }) }
    )
    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.error.code).toBe("HONEYPOT_TRIGGERED")
    expect(mocks.convexMutation).not.toHaveBeenCalled()
  })

  it("rejects malformed JSON without calling Convex", async () => {
    const response = await POST(
      new Request(`http://localhost/api/track-payment/${BOOKING_REF}`, {
        method: "POST",
        body: "{not-json",
      }),
      { params: Promise.resolve({ bookingRef: BOOKING_REF }) }
    )
    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.error.code).toBe("INVALID_EDIT")
    expect(mocks.convexMutation).not.toHaveBeenCalled()
  })

  it("rejects client authority fields at the top level and inside selections", async () => {
    const topLevel = await POST(
      editRequest({ body: validBody({ totalAmountMinor: 1 }) }),
      { params: Promise.resolve({ bookingRef: BOOKING_REF }) }
    )
    expect(topLevel.status).toBe(400)
    expect((await topLevel.json()).error.code).toBe("INVALID_EDIT")

    const nested = await POST(
      editRequest({
        body: validBody({
          selections: [
            {
              attendeeKey: "a-1",
              categoryId: "j57b2pb9ym78g2s5m8z91x6qf97mex0r",
              occupancy: "shared",
              optionSelections: [],
              priceMinor: 1,
            },
            {
              attendeeKey: "a-2",
              categoryId: "j57b2pb9ym78g2s5m8z91x6qf97mex0r",
              occupancy: "shared",
              optionSelections: [],
            },
          ],
        }),
      }),
      { params: Promise.resolve({ bookingRef: BOOKING_REF }) }
    )
    expect(nested.status).toBe(400)
    expect((await nested.json()).error.code).toBe("INVALID_EDIT")
    expect(mocks.convexMutation).not.toHaveBeenCalled()
  })

  it("rejects missing ownership before calling Convex", async () => {
    const response = await POST(
      editRequest({
        body: validBody({ bookerEmail: "", editToken: "" }),
      }),
      { params: Promise.resolve({ bookingRef: BOOKING_REF }) }
    )
    expect(response.status).toBe(403)
    const payload = await response.json()
    expect(payload.error.code).toBe("EDIT_OWNERSHIP")
    expect(mocks.convexMutation).not.toHaveBeenCalled()
  })

  it("maps confirmed-lock and stale-option failures to stable 409 codes", async () => {
    vi.mocked(mocks.convexMutation).mockRejectedValueOnce(
      new Error(
        "EDIT_CONFIRMED: Accommodation preferences are locked because the organizer has confirmed this configuration."
      )
    )
    const confirmed = await POST(editRequest({ body: validBody() }), {
      params: Promise.resolve({ bookingRef: BOOKING_REF }),
    })
    expect(confirmed.status).toBe(409)
    expect((await confirmed.json()).error.code).toBe("EDIT_CONFIRMED")

    vi.mocked(mocks.convexMutation).mockRejectedValueOnce(
      new Error(
        "EDIT_INVALID: The selected accommodation category is not offered for this event."
      )
    )
    const stale = await POST(editRequest({ body: validBody() }), {
      params: Promise.resolve({ bookingRef: BOOKING_REF }),
    })
    expect(stale.status).toBe(409)
    expect((await stale.json()).error.code).toBe("EDIT_INVALID")
  })

  it("maps ownership and not-found failures without revealing other bookings", async () => {
    vi.mocked(mocks.convexMutation).mockRejectedValueOnce(
      new Error("EDIT_OWNERSHIP: Ownership of this booking could not be verified.")
    )
    const ownership = await POST(editRequest({ body: validBody() }), {
      params: Promise.resolve({ bookingRef: BOOKING_REF }),
    })
    expect(ownership.status).toBe(403)
    expect((await ownership.json()).error.code).toBe("EDIT_OWNERSHIP")

    vi.mocked(mocks.convexMutation).mockRejectedValueOnce(
      new Error("EDIT_NOT_FOUND: Booking not found.")
    )
    const notFound = await POST(editRequest({ body: validBody() }), {
      params: Promise.resolve({ bookingRef: BOOKING_REF }),
    })
    expect(notFound.status).toBe(404)
    expect((await notFound.json()).error.code).toBe("EDIT_NOT_FOUND")
  })

  it("maps generic Convex failures to a 500 without leaking internals", async () => {
    vi.mocked(mocks.convexMutation).mockRejectedValueOnce(
      new Error("Convex mutation failed: something internal broke")
    )
    const response = await POST(editRequest({ body: validBody() }), {
      params: Promise.resolve({ bookingRef: BOOKING_REF }),
    })
    expect(response.status).toBe(500)
    const payload = await response.json()
    expect(payload.error.code).toBe("EDIT_FAILED")
    expect(payload.error.message).not.toContain("internal")
  })

  it("maps Convex validation errors to a 400 INVALID_EDIT", async () => {
    vi.mocked(mocks.convexMutation).mockRejectedValueOnce(
      new Error("Convex mutation failed: ValidationError: unexpected field")
    )
    const response = await POST(editRequest({ body: validBody() }), {
      params: Promise.resolve({ bookingRef: BOOKING_REF }),
    })
    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe("INVALID_EDIT")
  })

  it("fails closed with a 503 when the signing secret is unavailable", async () => {
    delete process.env.SIGNUP_SUBMISSION_SECRET
    const response = await POST(editRequest({ body: validBody() }), {
      params: Promise.resolve({ bookingRef: BOOKING_REF }),
    })
    expect(response.status).toBe(503)
    expect((await response.json()).error.code).toBe("EDIT_UNAVAILABLE")
    expect(mocks.convexMutation).not.toHaveBeenCalled()
  })
})
