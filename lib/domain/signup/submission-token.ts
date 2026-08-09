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
 *    exact `eventId` + canonical payload digest + `idempotencyKey` about to
 *    be submitted.
 * 2. The mutation refuses to do any work unless the token verifies
 *    (HMAC-SHA256 signature, expiry, and event/digest/key binding).
 *
 * CR-09: the token is bound to a SHA-256 digest that the mutation recomputes
 * from the actual submission arguments (never from a caller-supplied
 * fingerprint), and the idempotency key is part of the signed message. A
 * captured token therefore cannot be replayed with a different booker,
 * attendee, ticket/accommodation payload, or a new idempotency key — every
 * such change makes the recomputed digest or signed key differ and fails
 * closed before any database read or write.
 *
 * An attacker calling the generated Convex mutation directly cannot mint a
 * token — the signing secret (`SIGNUP_SUBMISSION_SECRET`) exists only in the
 * Next server env and the Convex backend env — so every public submission is
 * effectively gated by the same CAPTCHA and rate-limit controls as the API
 * route. The token is single-submission-scoped (bound to the payload digest
 * and idempotency key) and short-lived (5 minutes), so a leaked token cannot
 * be replayed against a different envelope.
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

/**
 * True when a non-empty signing secret is provisioned on THIS runtime. Used
 * to select the gate mode: enforced (token required) when both the Next
 * server and the Convex backend have the secret, degraded no-token mode when
 * both are absent (production predates the gate). A half-provisioned
 * deployment is deliberately not treated as enforced here — the Convex
 * boundary either fails closed (Next absent / Convex present) or logs a
 * degraded-mode warning (Next present / Convex absent). Provisioning must
 * set the secret on BOTH runtimes.
 */
export function isSignupSubmissionSecretConfigured(): boolean {
  return Boolean(getSignupSubmissionSecret())
}

export type SignupEnvelopeCanonicalInput = {
  eventId: string
  source: "integration" | "internal"
  notes?: string
  booker: {
    name: string
    email: string
    phone?: string
  }
  attendees: Array<{
    attendeeKey: string
    name: string
    email?: string
    phone?: string
    gender: "male" | "female" | "mixed" | "unknown"
    location?: string
    dietaryRestrictions?: string
    roommatePreference?: string
    roommateAvoid?: string
  }>
  ticketSelections: Array<{
    attendeeKey: string
    ticketTypeId: string
    quantity: number
  }>
  assignments: Array<{
    attendeeKey: string
    slotId: string
    assignmentIntent: "assign" | "skip"
  }>
  accommodationSelections: Array<{
    attendeeKey: string
    categoryId?: string | null
    occupancy: "single" | "shared" | "family"
    optionSelections: Array<{
      optionKey: string
      quantity: number
      nights: number
    }>
    /** Independent one-night night-before level; omitted canonicalizes as null. */
    nightBeforeLevel?: "standard" | "superior" | null
    nightBeforeOccupancy?: "single" | "shared" | null
    /** Legacy buyer-chosen total stay nights; omitted canonicalizes as null. */
    nights?: number
  }>
}

function normalizeRequiredString(value: string): string {
  return value.trim()
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Build the canonical, deterministic JSON representation of a signup envelope
 * that both the Next.js route (via `submitSignup`) and the Convex mutation
 * use as the digest input. String fields are normalized (required fields
 * trimmed, optional fields trimmed-or-undefined) so the two sides agree even
 * when a caller sends stray whitespace, and the object shape is fixed so
 * `JSON.stringify` output is stable across runtimes.
 */
export function canonicalizeSignupEnvelope(
  input: SignupEnvelopeCanonicalInput
): string {
  const canonical = {
    eventId: normalizeRequiredString(input.eventId),
    source: input.source,
    notes: normalizeOptionalString(input.notes),
    booker: {
      name: normalizeRequiredString(input.booker.name),
      email: normalizeRequiredString(input.booker.email),
      phone: normalizeOptionalString(input.booker.phone),
    },
    attendees: input.attendees.map((attendee) => ({
      attendeeKey: normalizeRequiredString(attendee.attendeeKey),
      name: normalizeRequiredString(attendee.name),
      email: normalizeOptionalString(attendee.email),
      phone: normalizeOptionalString(attendee.phone),
      gender: attendee.gender,
      location: normalizeOptionalString(attendee.location),
      dietaryRestrictions: normalizeOptionalString(
        attendee.dietaryRestrictions
      ),
      roommatePreference: normalizeOptionalString(attendee.roommatePreference),
      roommateAvoid: normalizeOptionalString(attendee.roommateAvoid),
    })),
    ticketSelections: input.ticketSelections.map((selection) => ({
      attendeeKey: normalizeRequiredString(selection.attendeeKey),
      ticketTypeId: normalizeRequiredString(String(selection.ticketTypeId)),
      quantity: Number(selection.quantity),
    })),
    assignments: input.assignments.map((assignment) => ({
      attendeeKey: normalizeRequiredString(assignment.attendeeKey),
      slotId: normalizeRequiredString(String(assignment.slotId)),
      assignmentIntent: assignment.assignmentIntent,
    })),
    accommodationSelections: input.accommodationSelections.map(
      (preference) => ({
        attendeeKey: normalizeRequiredString(preference.attendeeKey),
        // CR-09: the simplified contract never trusts a client category; an
        // absent category canonicalizes as null (deterministic) and a
        // supplied one is still covered by the digest so it cannot be
        // swapped between quote and submission.
        categoryId: preference.categoryId
          ? normalizeRequiredString(String(preference.categoryId))
          : null,
        occupancy: preference.occupancy,
        // CR-09: the independent night-before level is part of the signed
        // envelope, so a captured token can never have the level swapped
        // without invalidating the digest.
        nightBeforeLevel: preference.nightBeforeLevel ?? null,
        nightBeforeOccupancy: preference.nightBeforeOccupancy ?? null,
        // CR-09: the buyer's night choice is part of the signed envelope, so
        // a captured token can never have nights swapped without invalidating
        // the digest. Omitted nights canonicalize as null (deterministic).
        nights:
          preference.nights === undefined ? null : Number(preference.nights),
        optionSelections: preference.optionSelections.map((option) => ({
          optionKey: normalizeRequiredString(option.optionKey),
          quantity: Number(option.quantity),
          nights: Number(option.nights),
        })),
      })
    ),
  }
  return JSON.stringify(canonical)
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * SHA-256 hex digest of the canonicalized envelope. The mutation recomputes
 * this from its own (validated) arguments and the token only verifies when
 * the digest matches what the route signed — a client-supplied fingerprint
 * is never trusted (CR-09).
 */
export async function digestSubmissionEnvelope(
  input: SignupEnvelopeCanonicalInput
): Promise<string> {
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(canonicalizeSignupEnvelope(input))
  )
  return bytesToHex(new Uint8Array(digest))
}

function signupSubmissionTokenMessage(input: {
  eventId: string
  payloadDigest: string
  idempotencyKey: string
  expiresAt: number
}): string {
  return `${input.eventId}:${input.payloadDigest}:${input.idempotencyKey}:${input.expiresAt}`
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
  return bytesToHex(new Uint8Array(signature))
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
  payloadDigest: string
  idempotencyKey: string
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
      payloadDigest: input.payloadDigest,
      idempotencyKey: input.idempotencyKey,
      expiresAt,
    })
  )
  return `${signature}.${expiresAt}`
}

/**
 * Verify a signed token against the exact event/payload-digest/idempotency
 * triple it was issued for. Returns false (never throws) for missing,
 * expired, tampered, or wrong-binding tokens and when the signing secret is
 * not configured.
 */
export async function verifySignupSubmissionToken(
  token: string | null | undefined,
  input: {
    eventId: string
    payloadDigest: string
    idempotencyKey: string
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
      payloadDigest: input.payloadDigest,
      idempotencyKey: input.idempotencyKey,
      expiresAt,
    })
  )
  return timingSafeEqualHex(signature, expected)
}
