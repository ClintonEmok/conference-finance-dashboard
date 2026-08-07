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
      roomTypeCategoryId: "cat_1",
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
    },
    {
      attendeeKey: "ticket_1-2",
      ticketTypeId: "ticket_1",
      ticketLabel: "Main ticket",
      name: "John Doe",
      email: "",
      phone: "",
      gender: "male",
      location: "",
      dietaryRestrictions: "",
      roommatePreference: "",
    },
  ],
  accommodationSelections: {
    "ticket_1-1": {
      occupancy: "shared",
      optionSelections: [{ optionKey: "cot", quantity: 1, nights: 2 }],
      // Independent one-night night-before level (no client money).
      nightBeforeLevel: "standard",
    },
    "ticket_1-2": {
      occupancy: "shared",
      optionSelections: [],
    },
  },
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
      captchaToken: "turnstile-token",
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
        body: JSON.stringify({
          eventId: "event_1",
          source: "internal",
          notes: "Near entrance please",
          booker: {
            name: "Booker",
            email: "booker@example.com",
            phone: "+31699999999",
          },
          attendees: [
            {
              attendeeKey: "ticket_1-1",
              name: "Jane Doe",
              email: "jane@example.com",
              phone: "+31612345678",
              gender: "female",
              location: "Amsterdam",
              dietaryRestrictions: "none",
              roommatePreference: "Sarah",
            },
            {
              attendeeKey: "ticket_1-2",
              name: "John Doe",
              phone: "",
              gender: "male",
              location: "",
              dietaryRestrictions: "",
              roommatePreference: "",
            },
          ],
          ticketSelections: [
            {
              attendeeKey: "ticket_1-1",
              ticketTypeId: "ticket_1",
              quantity: 1,
            },
            {
              attendeeKey: "ticket_1-2",
              ticketTypeId: "ticket_1",
              quantity: 1,
            },
          ],
          assignments: [],
          accommodationSelections: [
            {
              attendeeKey: "ticket_1-1",
              occupancy: "shared",
              nightBeforeLevel: "standard",
              optionSelections: [
                { optionKey: "cot", quantity: 1, nights: 2 },
              ],
            },
            {
              attendeeKey: "ticket_1-2",
              occupancy: "shared",
              optionSelections: [],
            },
          ],
          captchaToken: "turnstile-token",
        }),
      })
    )
  })

  it("builds an options-only payload with preferences and an empty assignment list", () => {
    const payload = buildSubmissionBodyFromDraft(draftFixture)

    expect(payload.assignments).toEqual([])
    expect(payload.accommodationSelections).toEqual([
      {
        attendeeKey: "ticket_1-1",
        occupancy: "shared",
        nightBeforeLevel: "standard",
        optionSelections: [{ optionKey: "cot", quantity: 1, nights: 2 }],
      },
      {
        attendeeKey: "ticket_1-2",
        occupancy: "shared",
        optionSelections: [],
      },
    ])

    // The independent night-before level survives serialization for the
    // attendee that set it, and stays absent for the attendee that did not
    // (the server then resolves the derived total stay).
    const serialized = JSON.stringify(payload)
    expect(serialized).toContain('"nightBeforeLevel":"standard"')

    // Negative assertions: no client amount, category, room, slot, date, or
    // top-level stay field may leak into the accommodation preferences —
    // money, the included-stay category, and stay dates stay
    // server-authoritative. (Option rows legitimately carry a per-option
    // `nights` span, which the structural toEqual above pins exactly.)
    expect(serialized).not.toMatch(/categoryId/)
    expect(serialized).not.toMatch(/priceMinor/)
    expect(serialized).not.toMatch(/totalMinor|totalDue/)
    expect(serialized).not.toMatch(/slotId|roomId|roomType/)
    expect(serialized).not.toMatch(/checkInAt|checkOutAt|nightCount/)
    expect(serialized).not.toMatch(/confirmedAt|configVersion|priceSnapshot/)
  })

  it("omits incomplete accommodation preferences from the payload", () => {
    const payload = buildSubmissionBodyFromDraft({
      ...draftFixture,
      accommodationSelections: {
        "ticket_1-1": {
          occupancy: "shared",
          optionSelections: [],
          nightBeforeLevel: "standard",
        },
        // ticket_1-2 has no selection at all.
      },
    })

    expect(payload.accommodationSelections).toEqual([
      {
        attendeeKey: "ticket_1-1",
        occupancy: "shared",
        nightBeforeLevel: "standard",
        optionSelections: [],
      },
    ])
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
              accommodationSelections: [],
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
})
