import { afterEach, describe, expect, it } from "vitest"
import {
  SIGNUP_SUBMISSION_TOKEN_TTL_MS,
  canonicalizeSignupEnvelope,
  digestSubmissionEnvelope,
  isSignupSubmissionSecretConfigured,
  mintSignupSubmissionToken,
  verifySignupSubmissionToken,
} from "@/lib/domain/signup/submission-token"

const SECRET = "unit-test-submission-secret"
const SECRET_ENV_VAR = "SIGNUP_SUBMISSION_SECRET"

const previousSecret = process.env[SECRET_ENV_VAR]
afterEach(() => {
  if (previousSecret === undefined) {
    delete process.env[SECRET_ENV_VAR]
  } else {
    process.env[SECRET_ENV_VAR] = previousSecret
  }
})

const canonicalInput = {
  eventId: "event_1",
  source: "internal" as const,
  notes: undefined,
  booker: { name: "Booker", email: "booker@example.com", phone: undefined },
  attendees: [
    {
      attendeeKey: "a-1",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: undefined,
      gender: "female" as const,
      location: undefined,
      dietaryRestrictions: undefined,
      roommatePreference: undefined,
      roommateAvoid: undefined,
    },
  ],
  ticketSelections: [
    { attendeeKey: "a-1", ticketTypeId: "ticket_1", quantity: 1 },
  ],
  assignments: [],
  accommodationSelections: [],
}

describe("signup submission token (CR-07)", () => {
  it("round-trips a valid token for the exact event/digest/key triple", async () => {
    const now = Date.now()
    const token = await mintSignupSubmissionToken({
      eventId: "event_1",
      payloadDigest: "digest_abc",
      idempotencyKey: "key_1",
      secret: SECRET,
      now,
    })
    await expect(
      verifySignupSubmissionToken(token, {
        eventId: "event_1",
        payloadDigest: "digest_abc",
        idempotencyKey: "key_1",
        secret: SECRET,
        now,
      })
    ).resolves.toBe(true)
  })

  it("rejects a missing or empty token", async () => {
    await expect(
      verifySignupSubmissionToken(undefined, {
        eventId: "event_1",
        payloadDigest: "digest_abc",
        idempotencyKey: "key_1",
        secret: SECRET,
      })
    ).resolves.toBe(false)
    await expect(
      verifySignupSubmissionToken("", {
        eventId: "event_1",
        payloadDigest: "digest_abc",
        idempotencyKey: "key_1",
        secret: SECRET,
      })
    ).resolves.toBe(false)
  })

  it("OWN-01: reports the signing secret as configured only for a non-empty value", () => {
    delete process.env[SECRET_ENV_VAR]
    expect(isSignupSubmissionSecretConfigured()).toBe(false)

    process.env[SECRET_ENV_VAR] = ""
    expect(isSignupSubmissionSecretConfigured()).toBe(false)

    process.env[SECRET_ENV_VAR] = SECRET
    expect(isSignupSubmissionSecretConfigured()).toBe(true)
  })

  it("rejects a tampered signature", async () => {
    const now = Date.now()
    const token = await mintSignupSubmissionToken({
      eventId: "event_1",
      payloadDigest: "digest_abc",
      idempotencyKey: "key_1",
      secret: SECRET,
      now,
    })
    const dotIndex = token.lastIndexOf(".")
    const flipped =
      (token[0] === "0" ? "1" : "0") + token.slice(1, dotIndex)
    const tampered = `${flipped}${token.slice(dotIndex)}`
    await expect(
      verifySignupSubmissionToken(tampered, {
        eventId: "event_1",
        payloadDigest: "digest_abc",
        idempotencyKey: "key_1",
        secret: SECRET,
        now,
      })
    ).resolves.toBe(false)
  })

  it("rejects an expired token", async () => {
    const now = Date.now()
    const token = await mintSignupSubmissionToken({
      eventId: "event_1",
      payloadDigest: "digest_abc",
      idempotencyKey: "key_1",
      secret: SECRET,
      now: now - SIGNUP_SUBMISSION_TOKEN_TTL_MS - 1,
    })
    await expect(
      verifySignupSubmissionToken(token, {
        eventId: "event_1",
        payloadDigest: "digest_abc",
        idempotencyKey: "key_1",
        secret: SECRET,
        now,
      })
    ).resolves.toBe(false)
  })

  it("rejects a token minted for a different event, payload digest, or idempotency key", async () => {
    const now = Date.now()
    const token = await mintSignupSubmissionToken({
      eventId: "event_1",
      payloadDigest: "digest_abc",
      idempotencyKey: "key_1",
      secret: SECRET,
      now,
    })
    await expect(
      verifySignupSubmissionToken(token, {
        eventId: "event_2",
        payloadDigest: "digest_abc",
        idempotencyKey: "key_1",
        secret: SECRET,
        now,
      })
    ).resolves.toBe(false)
    await expect(
      verifySignupSubmissionToken(token, {
        eventId: "event_1",
        payloadDigest: "digest_other",
        idempotencyKey: "key_1",
        secret: SECRET,
        now,
      })
    ).resolves.toBe(false)
    // CR-09: a captured token cannot be replayed under a new idempotency key.
    await expect(
      verifySignupSubmissionToken(token, {
        eventId: "event_1",
        payloadDigest: "digest_abc",
        idempotencyKey: "key_2",
        secret: SECRET,
        now,
      })
    ).resolves.toBe(false)
  })

  it("rejects tokens when the signing secret differs (wrong key)", async () => {
    const now = Date.now()
    const token = await mintSignupSubmissionToken({
      eventId: "event_1",
      payloadDigest: "digest_abc",
      idempotencyKey: "key_1",
      secret: "other-secret",
      now,
    })
    await expect(
      verifySignupSubmissionToken(token, {
        eventId: "event_1",
        payloadDigest: "digest_abc",
        idempotencyKey: "key_1",
        secret: SECRET,
        now,
      })
    ).resolves.toBe(false)
  })

  it("fails closed when the secret is not configured", async () => {
    await expect(
      verifySignupSubmissionToken("sig.0", {
        eventId: "event_1",
        payloadDigest: "digest_abc",
        idempotencyKey: "key_1",
      })
    ).resolves.toBe(false)
    await expect(
      mintSignupSubmissionToken({
        eventId: "event_1",
        payloadDigest: "digest_abc",
        idempotencyKey: "key_1",
      })
    ).rejects.toThrow("SIGNUP_SUBMISSION_SECRET is not configured")
  })
})

describe("signup submission envelope digest (CR-09)", () => {
  it("is deterministic for the same canonical input", async () => {
    const first = await digestSubmissionEnvelope(canonicalInput)
    const second = await digestSubmissionEnvelope(canonicalInput)
    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
  })

  it("changes when any payload field changes", async () => {
    const baseline = await digestSubmissionEnvelope(canonicalInput)
    const changedBooker = await digestSubmissionEnvelope({
      ...canonicalInput,
      booker: { ...canonicalInput.booker, name: "Other Booker" },
    })
    const changedAttendee = await digestSubmissionEnvelope({
      ...canonicalInput,
      attendees: [
        {
          ...canonicalInput.attendees[0],
          name: "Jane R. Doe",
        },
      ],
    })
    const changedTicket = await digestSubmissionEnvelope({
      ...canonicalInput,
      ticketSelections: [
        { ...canonicalInput.ticketSelections[0], ticketTypeId: "ticket_2" },
      ],
    })
    const changedSelection = await digestSubmissionEnvelope({
      ...canonicalInput,
      accommodationSelections: [
        {
          attendeeKey: "a-1",
          categoryId: "cat_1",
          occupancy: "shared" as const,
          optionSelections: [{ optionKey: "cot", quantity: 2, nights: 2 }],
        },
      ],
    })
    expect(changedBooker).not.toBe(baseline)
    expect(changedAttendee).not.toBe(baseline)
    expect(changedTicket).not.toBe(baseline)
    expect(changedSelection).not.toBe(baseline)
  })

  it("changes when the buyer-chosen accommodation nights change", async () => {
    const selectionWithoutNights = {
      ...canonicalInput,
      accommodationSelections: [
        {
          attendeeKey: "a-1",
          categoryId: "cat_1",
          occupancy: "shared" as const,
          optionSelections: [{ optionKey: "cot", quantity: 1, nights: 2 }],
        },
      ],
    }
    const baseline = await digestSubmissionEnvelope(selectionWithoutNights)
    const withNights = await digestSubmissionEnvelope({
      ...selectionWithoutNights,
      accommodationSelections: [
        {
          ...selectionWithoutNights.accommodationSelections[0],
          nights: 3,
        },
      ],
    })
    const withDifferentNights = await digestSubmissionEnvelope({
      ...selectionWithoutNights,
      accommodationSelections: [
        {
          ...selectionWithoutNights.accommodationSelections[0],
          nights: 4,
        },
      ],
    })

    // CR-09: a captured token must never be replayable with a swapped night
    // count, so the digest covers the nights field.
    expect(withNights).not.toBe(baseline)
    expect(withDifferentNights).not.toBe(baseline)
    expect(withNights).not.toBe(withDifferentNights)
  })

  it("normalizes optional and required strings before hashing", async () => {
    const trimmed = await digestSubmissionEnvelope({
      ...canonicalInput,
      attendees: [
        {
          ...canonicalInput.attendees[0],
          name: " Jane Doe ",
          email: " jane@example.com ",
        },
      ],
    })
    expect(trimmed).toBe(await digestSubmissionEnvelope(canonicalInput))

    const withBlankOptional = await digestSubmissionEnvelope({
      ...canonicalInput,
      booker: {
        ...canonicalInput.booker,
        phone: "   ",
      },
      attendees: [
        {
          ...canonicalInput.attendees[0],
          location: "",
          dietaryRestrictions: " ",
        },
      ],
    })
    expect(withBlankOptional).toBe(await digestSubmissionEnvelope(canonicalInput))
  })

  it("sorts nothing and keeps array order significant (exact-envelope binding)", async () => {
    const baseline = await digestSubmissionEnvelope(canonicalInput)
    const reordered = await digestSubmissionEnvelope({
      ...canonicalInput,
      attendees: [canonicalInput.attendees[0]],
      ticketSelections: [
        { ...canonicalInput.ticketSelections[0] },
        { ...canonicalInput.ticketSelections[0] },
      ],
    })
    expect(reordered).not.toBe(baseline)
  })

  it("canonicalize output is stable JSON", () => {
    const json = canonicalizeSignupEnvelope(canonicalInput)
    expect(() => JSON.parse(json)).not.toThrow()
    expect(canonicalizeSignupEnvelope(canonicalInput)).toBe(json)
  })
})
