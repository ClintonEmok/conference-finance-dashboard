import { describe, expect, it } from "vitest"
import {
  SIGNUP_SUBMISSION_TOKEN_TTL_MS,
  mintSignupSubmissionToken,
  verifySignupSubmissionToken,
} from "@/lib/domain/signup/submission-token"

const SECRET = "unit-test-submission-secret"

describe("signup submission token (CR-07)", () => {
  it("round-trips a valid token for the exact event/payload pair", async () => {
    const now = Date.now()
    const token = await mintSignupSubmissionToken({
      eventId: "event_1",
      payloadFingerprint: "fp_abc",
      secret: SECRET,
      now,
    })
    await expect(
      verifySignupSubmissionToken(token, {
        eventId: "event_1",
        payloadFingerprint: "fp_abc",
        secret: SECRET,
        now,
      })
    ).resolves.toBe(true)
  })

  it("rejects a missing or empty token", async () => {
    await expect(
      verifySignupSubmissionToken(undefined, {
        eventId: "event_1",
        payloadFingerprint: "fp_abc",
        secret: SECRET,
      })
    ).resolves.toBe(false)
    await expect(
      verifySignupSubmissionToken("", {
        eventId: "event_1",
        payloadFingerprint: "fp_abc",
        secret: SECRET,
      })
    ).resolves.toBe(false)
  })

  it("rejects a tampered signature", async () => {
    const now = Date.now()
    const token = await mintSignupSubmissionToken({
      eventId: "event_1",
      payloadFingerprint: "fp_abc",
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
        payloadFingerprint: "fp_abc",
        secret: SECRET,
        now,
      })
    ).resolves.toBe(false)
  })

  it("rejects an expired token", async () => {
    const now = Date.now()
    const token = await mintSignupSubmissionToken({
      eventId: "event_1",
      payloadFingerprint: "fp_abc",
      secret: SECRET,
      now: now - SIGNUP_SUBMISSION_TOKEN_TTL_MS - 1,
    })
    await expect(
      verifySignupSubmissionToken(token, {
        eventId: "event_1",
        payloadFingerprint: "fp_abc",
        secret: SECRET,
        now,
      })
    ).resolves.toBe(false)
  })

  it("rejects a token minted for a different event or payload", async () => {
    const now = Date.now()
    const token = await mintSignupSubmissionToken({
      eventId: "event_1",
      payloadFingerprint: "fp_abc",
      secret: SECRET,
      now,
    })
    await expect(
      verifySignupSubmissionToken(token, {
        eventId: "event_2",
        payloadFingerprint: "fp_abc",
        secret: SECRET,
        now,
      })
    ).resolves.toBe(false)
    await expect(
      verifySignupSubmissionToken(token, {
        eventId: "event_1",
        payloadFingerprint: "fp_other",
        secret: SECRET,
        now,
      })
    ).resolves.toBe(false)
  })

  it("rejects tokens when the signing secret differs (wrong key)", async () => {
    const now = Date.now()
    const token = await mintSignupSubmissionToken({
      eventId: "event_1",
      payloadFingerprint: "fp_abc",
      secret: "other-secret",
      now,
    })
    await expect(
      verifySignupSubmissionToken(token, {
        eventId: "event_1",
        payloadFingerprint: "fp_abc",
        secret: SECRET,
        now,
      })
    ).resolves.toBe(false)
  })

  it("fails closed when the secret is not configured", async () => {
    await expect(
      verifySignupSubmissionToken("sig.0", {
        eventId: "event_1",
        payloadFingerprint: "fp_abc",
      })
    ).resolves.toBe(false)
    await expect(
      mintSignupSubmissionToken({
        eventId: "event_1",
        payloadFingerprint: "fp_abc",
      })
    ).rejects.toThrow("SIGNUP_SUBMISSION_SECRET is not configured")
  })
})
