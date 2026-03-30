import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const mocks = vi.hoisted(() => ({
  submitSignup: vi.fn(),
  enforceRateLimit: vi.fn(),
  SignupSubmissionValidationError: class SignupSubmissionValidationError extends Error {
    code = "INVALID_SUBMISSION"
  },
}))

vi.mock("@/lib/domain/signup/submission", () => ({
  submitSignup: mocks.submitSignup,
  SignupSubmissionValidationError: mocks.SignupSubmissionValidationError,
}))

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}))

import { POST } from "@/app/api/signup/submit/route"
import { submitSignup } from "@/lib/domain/signup/submission"
import { enforceRateLimit } from "@/lib/rate-limit"

describe("POST /api/signup/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(enforceRateLimit).mockReturnValue(null)
  })

  it("returns 201 with stable submission reference fields", async () => {
    vi.mocked(submitSignup).mockResolvedValueOnce({
      submissionId: "j57d20f4n13n3m6v3kz5z2n6sh7mf3j8",
      bookingRef: "BK-20260329-ABC12345",
      submittedAt: "2026-03-29T20:00:00.000Z",
      restorePayload: {
        eventId: "j57a0f4n13n3m6v3kz5z2n6sh7mew4p2",
        source: "internal",
        booker: {
          name: "Booker",
          email: "booker@example.com",
          phone: "+31612345678",
        },
        attendees: [
          {
            attendeeKey: "a-1",
            name: "Jane Doe",
            email: "jane@example.com",
            gender: "female",
            location: "Amsterdam",
            dietaryRestrictions: "none",
            roommatePreference: "Sarah Johnson",
            roommateAvoid: "snoring",
            phone: "+31600000001",
          },
        ],
        ticketSelections: [
          {
            attendeeKey: "a-1",
            ticketTypeId: "j57a2pb9ym78g2s5m8z91x6qf97mex0r",
            quantity: 1,
          },
        ],
        assignments: [
          {
            attendeeKey: "a-1",
            slotId: "j57b2pb9ym78g2s5m8z91x6qf97mex0r",
            assignmentIntent: "assign",
          },
        ],
      },
    })

    const response = await POST(
      new Request("http://localhost/api/signup/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: "j57a0f4n13n3m6v3kz5z2n6sh7mew4p2",
          source: "internal",
          booker: {
            name: "Booker",
            email: "booker@example.com",
            phone: "+31612345678",
          },
          attendees: [
            {
              attendeeKey: "a-1",
              name: "Jane Doe",
              email: "jane@example.com",
              gender: "female",
              location: "Amsterdam",
              dietaryRestrictions: "none",
              roommatePreference: "Sarah Johnson",
              roommateAvoid: "snoring",
              phone: "+31600000001",
            },
          ],
          ticketSelections: [
            {
              attendeeKey: "a-1",
              ticketTypeId: "j57a2pb9ym78g2s5m8z91x6qf97mex0r",
              quantity: 1,
            },
          ],
          assignments: [
            {
              attendeeKey: "a-1",
              slotId: "j57b2pb9ym78g2s5m8z91x6qf97mex0r",
              assignmentIntent: "assign",
            },
          ],
        }),
      })
    )

    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toEqual({
      data: {
        submissionId: "j57d20f4n13n3m6v3kz5z2n6sh7mf3j8",
        bookingRef: "BK-20260329-ABC12345",
        submittedAt: "2026-03-29T20:00:00.000Z",
        restorePayload: {
          eventId: "j57a0f4n13n3m6v3kz5z2n6sh7mew4p2",
          source: "internal",
          booker: {
            name: "Booker",
            email: "booker@example.com",
            phone: "+31612345678",
          },
          attendees: [
            {
              attendeeKey: "a-1",
              name: "Jane Doe",
              email: "jane@example.com",
              gender: "female",
              location: "Amsterdam",
              dietaryRestrictions: "none",
              roommatePreference: "Sarah Johnson",
              roommateAvoid: "snoring",
              phone: "+31600000001",
            },
          ],
          ticketSelections: [
            {
              attendeeKey: "a-1",
              ticketTypeId: "j57a2pb9ym78g2s5m8z91x6qf97mex0r",
              quantity: 1,
            },
          ],
          assignments: [
            {
              attendeeKey: "a-1",
              slotId: "j57b2pb9ym78g2s5m8z91x6qf97mex0r",
              assignmentIntent: "assign",
            },
          ],
        },
      },
    })
    expect(submitSignup).toHaveBeenCalledTimes(1)
    expect(submitSignup).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^derived-/),
        payloadFingerprint: expect.any(String),
        honeypotSeen: false,
      })
    )
  })

  it("returns 400 with INVALID_SUBMISSION when validation fails", async () => {
    vi.mocked(submitSignup).mockRejectedValueOnce(
      new mocks.SignupSubmissionValidationError(
        "Invalid 'attendees'. At least one attendee is required."
      )
    )

    const response = await POST(
      new Request("http://localhost/api/signup/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: "event_1",
          source: "internal",
          booker: { name: "Booker", email: "booker@example.com" },
          attendees: [],
          ticketSelections: [],
        }),
      })
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: {
        code: "INVALID_SUBMISSION",
        message: "Invalid 'attendees'. At least one attendee is required.",
      },
    })
  })

  it("maps uniqueness conflicts to 409 SUBMISSION_CONFLICT", async () => {
    vi.mocked(submitSignup).mockRejectedValueOnce(
      new Error("SUBMISSION_CONFLICT: Duplicate attendee key 'a-1'")
    )

    const response = await POST(
      new Request("http://localhost/api/signup/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: "j57a0f4n13n3m6v3kz5z2n6sh7mew4p2",
          source: "internal",
          booker: { name: "Booker", email: "booker@example.com" },
          attendees: [
            {
              attendeeKey: "a-1",
              name: "Jane Doe",
              email: "jane@example.com",
              gender: "female",
              location: "Amsterdam",
              dietaryRestrictions: "none",
              roommatePreference: "Sarah Johnson",
              roommateAvoid: "snoring",
              phone: "+31600000001",
            },
          ],
          ticketSelections: [
            {
              attendeeKey: "a-1",
              ticketTypeId: "j57a2pb9ym78g2s5m8z91x6qf97mex0r",
              quantity: 1,
            },
          ],
          assignments: [],
        }),
      })
    )

    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({
      error: {
        code: "SUBMISSION_CONFLICT",
        message: "Duplicate attendee key 'a-1'",
      },
    })
  })

  it("returns 429 when rate limiter blocks the request", async () => {
    vi.mocked(enforceRateLimit).mockReturnValueOnce(
      NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Please try again later.",
          },
        },
        { status: 429 }
      )
    )

    const response = await POST(
      new Request("http://localhost/api/signup/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hello: "world" }),
      })
    )
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(body).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
      },
    })
    expect(submitSignup).not.toHaveBeenCalled()
  })

  it("rejects honeypot submissions with HONEYPOT_TRIGGERED", async () => {
    const response = await POST(
      new Request("http://localhost/api/signup/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website: "https://spam.example" }),
      })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: {
        code: "HONEYPOT_TRIGGERED",
        message: "Submission rejected.",
      },
    })
    expect(submitSignup).not.toHaveBeenCalled()
  })

  it("returns same reference and restore payload on idempotent retry", async () => {
    const byKey = new Map<string, Awaited<ReturnType<typeof submitSignup>>>()

    vi.mocked(submitSignup).mockImplementation(async (_payload, options) => {
      const key =
        options && typeof options === "object" && "idempotencyKey" in options
          ? String((options as Record<string, unknown>).idempotencyKey)
          : "missing"

      const existing = byKey.get(key)
      if (existing) {
        return existing
      }

      const created: Awaited<ReturnType<typeof submitSignup>> = {
        submissionId: "j57d20f4n13n3m6v3kz5z2n6sh7mf3j8",
        bookingRef: "BK-20260329-ABC12345",
        submittedAt: "2026-03-29T20:00:00.000Z",
        restorePayload: {
          eventId: "j57a0f4n13n3m6v3kz5z2n6sh7mew4p2",
          source: "internal",
          booker: {
            name: "Booker",
            email: "booker@example.com",
            phone: undefined,
          },
          attendees: [],
          ticketSelections: [],
          assignments: [],
        },
      }
      byKey.set(key, created)
      return created
    })

    const payload = {
      eventId: "j57a0f4n13n3m6v3kz5z2n6sh7mew4p2",
      source: "internal",
      booker: { name: "Booker", email: "booker@example.com" },
      attendees: [
        {
          attendeeKey: "a-1",
          name: "Jane Doe",
          email: "jane@example.com",
          gender: "female",
          location: "Amsterdam",
          dietaryRestrictions: "none",
          roommatePreference: "Sarah Johnson",
          roommateAvoid: "snoring",
          phone: "+31600000001",
        },
      ],
      ticketSelections: [
        {
          attendeeKey: "a-1",
          ticketTypeId: "j57a2pb9ym78g2s5m8z91x6qf97mex0r",
          quantity: 1,
        },
      ],
      assignments: [
        {
          attendeeKey: "a-1",
          slotId: "j57b2pb9ym78g2s5m8z91x6qf97mex0r",
          assignmentIntent: "assign",
        },
      ],
    }

    const first = await POST(
      new Request("http://localhost/api/signup/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": "same-key",
        },
        body: JSON.stringify(payload),
      })
    )
    const second = await POST(
      new Request("http://localhost/api/signup/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": "same-key",
        },
        body: JSON.stringify(payload),
      })
    )

    const firstBody = await first.json()
    const secondBody = await second.json()

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(secondBody).toEqual(firstBody)
    expect((secondBody as { data: Record<string, unknown> }).data.reused).toBe(
      undefined
    )
  })

  it("forwards explicit x-idempotency-key header unchanged", async () => {
    vi.mocked(submitSignup).mockResolvedValueOnce({
      submissionId: "j57d20f4n13n3m6v3kz5z2n6sh7mf3j8",
      bookingRef: "BK-20260329-ABC12345",
      submittedAt: "2026-03-29T20:00:00.000Z",
      restorePayload: {
        eventId: "j57a0f4n13n3m6v3kz5z2n6sh7mew4p2",
        source: "internal",
        booker: {
          name: "Booker",
          email: "booker@example.com",
        },
        attendees: [],
        ticketSelections: [],
        assignments: [],
      },
    })

    await POST(
      new Request("http://localhost/api/signup/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": "client-provided-key",
        },
        body: JSON.stringify({
          eventId: "j57a0f4n13n3m6v3kz5z2n6sh7mew4p2",
          source: "internal",
          booker: { name: "Booker", email: "booker@example.com" },
          attendees: [
            {
              attendeeKey: "a-1",
              name: "Jane Doe",
              email: "jane@example.com",
              gender: "female",
              location: "Amsterdam",
              dietaryRestrictions: "none",
              roommatePreference: "Sarah Johnson",
              roommateAvoid: "snoring",
              phone: "+31600000001",
            },
          ],
          ticketSelections: [
            {
              attendeeKey: "a-1",
              ticketTypeId: "j57a2pb9ym78g2s5m8z91x6qf97mex0r",
              quantity: 1,
            },
          ],
          assignments: [],
        }),
      })
    )

    expect(submitSignup).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        idempotencyKey: "client-provided-key",
      })
    )
  })
})
