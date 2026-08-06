/**
 * Server-issued, HMAC-signed submission token for the public Convex signup
 * mutation.
 *
 * CR-07: `submitSignupEnvelope` is a public Internet mutation — anyone with
 * the deployment URL can invoke it directly, bypassing the Next.js route's
 * Turnstile verification and IP rate limiting. This module closes that gap
 * with an unforgeable post-CAPTCHA token:
 *
 * 1. The Next.js route performs rate limiting, the honeypot check and
 *    Turnstile verification, then mints a short-lived token bound to the
 *    exact `eventId` + `payloadFingerprint` about to be submitted.
 * 2. The mutation refuses to do any work unless the token verifies
 *    (HMAC-SHA256 signature, expiry, and event/payload binding).
 *
 * An attacker calling the generated Convex mutation directly cannot mint a
 * token — the signing secret (`SIGNUP_SUBMISSION_SECRET`) exists only in the
 * Next server env and the Convex backend env — so every public submission is
 * effectively gated by the same CAPTCHA and rate-limit controls as the API
 * route. The token is single-submission-scoped (bound to the payload
 * fingerprint) and short-lived (5 minutes), so a leaked token cannot be
 * replayed against a different envelope.
 *
 * The module is deliberately dependency-free (Web Crypto only) so both the
 * Next.js server runtime and the default Convex function runtime can share
 * it without a `"use node"` action.
 */

export const SIGNUP_SUBMISSION_TOKEN_TTL_MS = 5 * 60 * 1000

const SECRET_ENV_VAR = "SIGNUP_SUBMISSION_SECRET"

export function getSignupSubmissionSecret(): string | undefined {
  return process.env[SECRET_ENV_VAR]
}

function signupSubmissionTokenMessage(input: {
  eventId: string
  payloadFingerprint: string
  expiresAt: number
}): string {
  return `${input.eventId}:${input.payloadFingerprint}:${input.expiresAt}`
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message)
  )
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Compare two hex strings in constant time (no early exit on mismatch).
 */
function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false
  }
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return diff === 0
}

/**
 * Mint a signed token for one specific submission envelope. Callers must
 * already have passed the CAPTCHA + rate-limit gate (the Next.js route).
 * Throws when the signing secret is not configured so the server fails
 * closed instead of minting forgeable tokens.
 */
export async function mintSignupSubmissionToken(input: {
  eventId: string
  payloadFingerprint: string
  secret?: string
  now?: number
  ttlMs?: number
}): Promise<string> {
  const secret = input.secret ?? getSignupSubmissionSecret()
  if (!secret) {
    throw new Error(`${SECRET_ENV_VAR} is not configured`)
  }

  const now = input.now ?? Date.now()
  const expiresAt = now + (input.ttlMs ?? SIGNUP_SUBMISSION_TOKEN_TTL_MS)
  const signature = await hmacSha256Hex(
    secret,
    signupSubmissionTokenMessage({
      eventId: input.eventId,
      payloadFingerprint: input.payloadFingerprint,
      expiresAt,
    })
  )
  return `${signature}.${expiresAt}`
}

/**
 * Verify a signed token against the exact event/payload pair it was issued
 * for. Returns false (never throws) for missing, expired, tampered, or
 * wrong-binding tokens and when the signing secret is not configured.
 */
export async function verifySignupSubmissionToken(
  token: string | null | undefined,
  input: {
    eventId: string
    payloadFingerprint: string
    secret?: string
    now?: number
  }
): Promise<boolean> {
  if (!token) {
    return false
  }

  const secret = input.secret ?? getSignupSubmissionSecret()
  if (!secret) {
    return false
  }

  const dotIndex = token.lastIndexOf(".")
  if (dotIndex <= 0) {
    return false
  }
  const signature = token.slice(0, dotIndex)
  const expiresAt = Number(token.slice(dotIndex + 1))
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    return false
  }
  if ((input.now ?? Date.now()) > expiresAt) {
    return false
  }

  const expected = await hmacSha256Hex(
    secret,
    signupSubmissionTokenMessage({
      eventId: input.eventId,
      payloadFingerprint: input.payloadFingerprint,
      expiresAt,
    })
  )
  return timingSafeEqualHex(signature, expected)
}
