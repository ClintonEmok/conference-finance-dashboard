import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  submitSignup: vi.fn(),
  SignupSubmissionValidationError: class SignupSubmissionValidationError extends Error {
    code = "INVALID_SUBMISSION"
  },
}))

vi.mock("@/lib/domain/signup/submission", () => ({
  submitSignup: mocks.submitSignup,
  SignupSubmissionValidationError: mocks.SignupSubmissionValidationError,
}))

import { POST } from "@/app/api/signup/submit/route"
import { submitSignup } from "@/lib/domain/signup/submission"

describe("POST /api/signup/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 201 with stable submission reference fields", async () => {
    vi.mocked(submitSignup).mockResolvedValueOnce({
      submissionId: "j57d20f4n13n3m6v3kz5z2n6sh7mf3j8",
      bookingRef: "BK-20260329-ABC12345",
      submittedAt: "2026-03-29T20:00:00.000Z",
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
              roommatePreference: "near window",
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
      },
    })
    expect(submitSignup).toHaveBeenCalledTimes(1)
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
})
