import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildSubmissionBodyFromDraft,
  submitSignupDraft,
} from "@/components/signup/submission-client"
import type { SignupDraft } from "@/components/signup/state"

const draftFixture: SignupDraft = {
  eventId: "event_1",
  source: "internal",
  step: "review",
  ticketSelections: [
    {
      ticketTypeId: "ticket_1",
      label: "Main ticket",
      priceMinor: 12000,
      quantity: 1,
      selectable: true,
      reason: null,
    },
  ],
  attendees: [
    {
      attendeeKey: "ticket_1-1",
      ticketTypeId: "ticket_1",
      ticketLabel: "Main ticket",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+31612345678",
      gender: "female",
      location: "Amsterdam",
      dietaryRestrictions: "none",
      roommatePreference: "Sarah",
      roommateAvoid: "snoring",
    },
  ],
  assignments: {
    "ticket_1-1": "slot_1",
  },
  acknowledgeRandomFill: false,
  notes: "Near entrance please",
  booker: {
    name: "Booker",
    email: "booker@example.com",
    phone: "+31699999999",
  },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("signup-flow submission client", () => {
  it("returns successful submit references", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            submissionId: "sub_1",
            bookingRef: "BK-REF-1",
            submittedAt: "2026-03-30T00:00:00.000Z",
          },
        }),
        { status: 201 }
      )
    )

    const result = await submitSignupDraft(draftFixture, {
      idempotencyKey: "idem-1",
    })

    expect(result).toEqual({
      ok: true,
      data: {
        submissionId: "sub_1",
        bookingRef: "BK-REF-1",
        submittedAt: "2026-03-30T00:00:00.000Z",
      },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/signup/submit",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-idempotency-key": "idem-1",
        }),
      })
    )
  })

  it("surfaces restore payload metadata when present", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            submissionId: "sub_2",
            bookingRef: "BK-REF-2",
            submittedAt: "2026-03-30T00:01:00.000Z",
            restorePayload: {
              eventId: "event_1",
              source: "internal",
              booker: {
                name: "Booker",
                email: "booker@example.com",
              },
              attendees: [],
              ticketSelections: [],
              assignments: [],
            },
          },
        }),
        { status: 201 }
      )
    )

    const result = await submitSignupDraft(draftFixture, {
      idempotencyKey: "idem-2",
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.restorePayload).toBeDefined()
      expect(result.data.restorePayload?.eventId).toBe("event_1")
    }
  })

  it.each([
    "CAPACITY_EXCEEDED",
    "TICKET_UNAVAILABLE",
    "ASSIGNMENT_UNAVAILABLE",
    "SUBMISSION_CONFLICT",
  ])("maps %s conflicts into deterministic client errors", async (code) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code,
            message: `${code} happened`,
          },
        }),
        { status: 409 }
      )
    )

    const result = await submitSignupDraft(draftFixture, {
      idempotencyKey: `idem-${code}`,
    })

    expect(result).toEqual({
      ok: false,
      error: {
        code,
        message: `${code} happened`,
      },
    })
  })

  it.each(["INVALID_SUBMISSION", "RATE_LIMITED", "HONEYPOT_TRIGGERED"])(
    "maps %s validation and abuse errors",
    async (code) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code,
              message: `${code} happened`,
            },
          }),
          { status: 400 }
        )
      )

      const result = await submitSignupDraft(draftFixture, {
        idempotencyKey: `idem-${code}`,
      })

      expect(result).toEqual({
        ok: false,
        error: {
          code,
          message: `${code} happened`,
        },
      })
    }
  )

  it("falls back to SUBMISSION_FAILED on unknown error payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "SOMETHING_NEW",
            message: "Unexpected",
          },
        }),
        { status: 500 }
      )
    )

    const result = await submitSignupDraft(draftFixture, {
      idempotencyKey: "idem-unknown",
    })

    expect(result).toEqual({
      ok: false,
      error: {
        code: "SUBMISSION_FAILED",
        message: "Unexpected",
      },
    })
  })

  it("builds submission payload with attendee-level ticket rows", () => {
    const payload = buildSubmissionBodyFromDraft(draftFixture)

    expect(payload.ticketSelections).toEqual([
      {
        attendeeKey: "ticket_1-1",
        ticketTypeId: "ticket_1",
        quantity: 1,
      },
    ])
  })
})
