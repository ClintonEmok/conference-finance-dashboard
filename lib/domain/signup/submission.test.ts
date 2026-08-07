import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  convexMutation: vi.fn(),
}))

vi.mock("@/lib/convex/server", () => ({
  convexMutation: mocks.convexMutation,
  convexQuery: vi.fn(),
  convexServer: { url: "http://localhost:3210" },
}))

import { submitSignup } from "@/lib/domain/signup/submission"
import {
  digestSubmissionEnvelope,
  verifySignupSubmissionToken,
} from "@/lib/domain/signup/submission-token"

// CR-07: submitSignup mints the server-issued submission token before calling
// the public Convex mutation; the mint requires the shared signing secret.
process.env.SIGNUP_SUBMISSION_SECRET = "test-submission-secret"

const validEnvelope = {
  eventId: "j57a0f4n13n3m6v3kz5z2n6sh7mew4p2",
  source: "internal",
  booker: { name: "Booker", email: "booker@example.com" },
  attendees: [
    {
      attendeeKey: "ticket_1-1",
      name: "Jane Doe",
      email: "jane@example.com",
      gender: "female",
    },
  ],
  ticketSelections: [
    { attendeeKey: "ticket_1-1", ticketTypeId: "ticket_1", quantity: 1 },
  ],
  assignments: [],
  accommodationSelections: [
    {
      attendeeKey: "ticket_1-1",
      categoryId: "cat_1",
      occupancy: "shared",
      optionSelections: [{ optionKey: "cot", quantity: 1, nights: 2 }],
    },
  ],
}

const submissionResult = {
  submissionId: "j57d20f4n13n3m6v3kz5z2n6sh7mf3j8",
  bookingRef: "BK-20260806-ABC12345",
  submittedAt: "2026-08-06T00:00:00.000Z",
  restorePayload: {
    eventId: validEnvelope.eventId,
    source: "internal",
    booker: { name: "Booker", email: "booker@example.com" },
    attendees: validEnvelope.attendees,
    ticketSelections: validEnvelope.ticketSelections,
    assignments: [],
    accommodationSelections: validEnvelope.accommodationSelections,
  },
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("submitSignup envelope normalization", () => {
  it("forwards valid option selections without coercion", async () => {
    mocks.convexMutation.mockResolvedValueOnce(submissionResult)

    const result = await submitSignup(validEnvelope)

    expect(result.bookingRef).toBe("BK-20260806-ABC12345")
    expect(mocks.convexMutation).toHaveBeenCalledTimes(1)
    const args = mocks.convexMutation.mock.calls[0][1]
    expect(args.accommodationSelections[0]).toMatchObject({
      optionSelections: [{ optionKey: "cot", quantity: 1, nights: 2 }],
    })
    // CR-07: every server-side submission carries a minted token bound to the
    // event + payload digest + idempotency key.
    expect(typeof args.submissionToken).toBe("string")
    expect(args.submissionToken.length).toBeGreaterThan(0)
    // CR-09: no caller-controlled fingerprint is forwarded to the mutation —
    // it recomputes the digest from its own arguments.
    expect(args.payloadFingerprint).toBeUndefined()
  })

  it("accepts the simplified no-category submission and preserves night-before level", async () => {
    mocks.convexMutation.mockResolvedValueOnce(submissionResult)

    const { categoryId: _categoryId, ...selectionWithoutCategory } =
      validEnvelope.accommodationSelections[0]

    await submitSignup({
      ...validEnvelope,
      accommodationSelections: [
        {
          ...selectionWithoutCategory,
          nightBeforeLevel: "superior",
        },
      ],
    })

    expect(
      mocks.convexMutation.mock.calls[0][1].accommodationSelections[0]
    ).toEqual(
      expect.objectContaining({
        occupancy: "shared",
        nightBeforeLevel: "superior",
      })
    )
    expect(
      mocks.convexMutation.mock.calls[0][1].accommodationSelections[0]
        .categoryId
    ).toBeUndefined()
  })

  it("mints a token that verifies only against the exact forwarded payload and idempotency key (CR-09)", async () => {
    mocks.convexMutation.mockResolvedValueOnce(submissionResult)

    await submitSignup(validEnvelope)

    const args = mocks.convexMutation.mock.calls[0][1]
    const payloadDigest = await digestSubmissionEnvelope({
      eventId: args.eventId,
      source: args.source,
      notes: args.notes,
      booker: args.booker,
      attendees: args.attendees,
      ticketSelections: args.ticketSelections,
      assignments: args.assignments,
      accommodationSelections: args.accommodationSelections,
    })

    // The token verifies for the exact envelope + idempotency key it was
    // minted for (secret comes from the env set below the imports)...
    await expect(
      verifySignupSubmissionToken(args.submissionToken, {
        eventId: args.eventId,
        payloadDigest,
        idempotencyKey: args.idempotencyKey,
      })
    ).resolves.toBe(true)

    // ...and fails for a different payload digest or a different key.
    await expect(
      verifySignupSubmissionToken(args.submissionToken, {
        eventId: args.eventId,
        payloadDigest: "0".repeat(64),
        idempotencyKey: args.idempotencyKey,
      })
    ).resolves.toBe(false)
    await expect(
      verifySignupSubmissionToken(args.submissionToken, {
        eventId: args.eventId,
        payloadDigest,
        idempotencyKey: "other-key",
      })
    ).resolves.toBe(false)
  })

  it("rejects a non-positive quantity in an option selection instead of coercing it", async () => {
    await expect(
      submitSignup({
        ...validEnvelope,
        accommodationSelections: [
          {
            ...validEnvelope.accommodationSelections[0],
            optionSelections: [{ optionKey: "cot", quantity: 0, nights: 2 }],
          },
        ],
      })
    ).rejects.toMatchObject({
      code: "INVALID_SUBMISSION",
      message:
        "Invalid 'accommodationSelections[0].optionSelections[0].quantity'. Expected a positive number.",
    })
    expect(mocks.convexMutation).not.toHaveBeenCalled()
  })

  it("rejects a duplicate option selection for the same attendee", async () => {
    await expect(
      submitSignup({
        ...validEnvelope,
        accommodationSelections: [
          {
            ...validEnvelope.accommodationSelections[0],
            optionSelections: [
              { optionKey: "cot", quantity: 1, nights: 2 },
              { optionKey: "cot", quantity: 1, nights: 1 },
            ],
          },
        ],
      })
    ).rejects.toMatchObject({
      code: "INVALID_SUBMISSION",
      message:
        "Invalid 'accommodationSelections[0].optionSelections[1].optionKey'. Duplicate option 'cot'.",
    })
    expect(mocks.convexMutation).not.toHaveBeenCalled()
  })

  it("rejects a missing accommodationSelections field instead of defaulting it (CR-03)", async () => {
    const { accommodationSelections: _omitted, ...withoutSelections } =
      validEnvelope
    void _omitted

    await expect(submitSignup(withoutSelections)).rejects.toMatchObject({
      code: "INVALID_SUBMISSION",
      message: "Invalid 'accommodationSelections'. Expected an array.",
    })
    expect(mocks.convexMutation).not.toHaveBeenCalled()
  })

  it("rejects a non-array accommodationSelections field (CR-03)", async () => {
    await expect(
      submitSignup({
        ...validEnvelope,
        accommodationSelections: null,
      })
    ).rejects.toMatchObject({
      code: "INVALID_SUBMISSION",
      message: "Invalid 'accommodationSelections'. Expected an array.",
    })
    expect(mocks.convexMutation).not.toHaveBeenCalled()
  })
})
