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
      upgradeSelected: true,
      cotSelected: false,
      ageBandCode: "18_plus",
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
  it("forwards valid boolean option flags without coercion", async () => {
    mocks.convexMutation.mockResolvedValueOnce(submissionResult)

    const result = await submitSignup(validEnvelope)

    expect(result.bookingRef).toBe("BK-20260806-ABC12345")
    expect(mocks.convexMutation).toHaveBeenCalledTimes(1)
    const args = mocks.convexMutation.mock.calls[0][1]
    expect(args.accommodationSelections[0]).toMatchObject({
      upgradeSelected: true,
      cotSelected: false,
    })
    // CR-07: every server-side submission carries a minted token bound to the
    // event + payload fingerprint so the public mutation can verify it.
    expect(typeof args.submissionToken).toBe("string")
    expect(args.submissionToken.length).toBeGreaterThan(0)
  })

  it("rejects a non-boolean upgradeSelected instead of coercing it (WR-06)", async () => {
    await expect(
      submitSignup({
        ...validEnvelope,
        accommodationSelections: [
          {
            ...validEnvelope.accommodationSelections[0],
            upgradeSelected: "false",
          },
        ],
      })
    ).rejects.toMatchObject({
      code: "INVALID_SUBMISSION",
      message: "Invalid 'accommodationSelections[0].upgradeSelected'. Expected a boolean.",
    })
    expect(mocks.convexMutation).not.toHaveBeenCalled()
  })

  it("rejects a non-boolean cotSelected instead of coercing it (WR-06)", async () => {
    await expect(
      submitSignup({
        ...validEnvelope,
        accommodationSelections: [
          {
            ...validEnvelope.accommodationSelections[0],
            cotSelected: 1,
          },
        ],
      })
    ).rejects.toMatchObject({
      code: "INVALID_SUBMISSION",
      message: "Invalid 'accommodationSelections[0].cotSelected'. Expected a boolean.",
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
