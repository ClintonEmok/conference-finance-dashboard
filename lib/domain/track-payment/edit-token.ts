/**
 * Shared HMAC edit-token and route-to-Convex request-signature helpers for
 * the public track-payment accommodation edit surface (Phase 43).
 *
 * Ownership model (D-03/D-04):
 * - The **edit token** is an HMAC token bound to
 *   `track-payment:${bookingRef}:${normalizedBookerEmail}`, signed with the
 *   already-required `SIGNUP_SUBMISSION_SECRET`. No new secret is introduced
 *   and no raw bearer token is ever persisted. New confirmation/resend emails
 *   embed the token in a `/booking/{bookingRef}/manage?token=...` link;
 *   legacy links without a token remain editable through the normalized
 *   booker-email match.
 * - The **request signature** is a short-lived HMAC token minted by the
 *   Next.js route after its rate-limit + honeypot checks and bound to the
 *   normalized edit envelope (booking reference, ownership fields,
 *   idempotency key, honeypot marker and the complete options-only
 *   selections). The public Convex mutation recomputes the same digest from
 *   its own validated arguments and fails closed without a valid signature,
 *   so a caller cannot bypass the route's abuse controls by invoking the
 *   generated public mutation directly.
 *
 * The module is deliberately dependency-free (Web Crypto only) so both the
 * Next.js server runtime and the default Convex function runtime can share
 * it without a `"use node"` action — exactly like
 * `lib/domain/signup/submission-token.ts`.
 */

export const EDIT_REQUEST_SIGNATURE_TTL_MS = 5 * 60 * 1000

const SECRET_ENV_VAR = "SIGNUP_SUBMISSION_SECRET"

export function getTrackPaymentSecret(): string | undefined {
  return process.env[SECRET_ENV_VAR]
}

/**
 * Normalize a booking reference the same way the tracking queries do:
 * trimmed and upper-cased so `/booking/bk-20260411-abc123/manage` and
 * `BK-20260411-ABC123` resolve to the same order.
 */
export function normalizeBookingRefForEdit(bookingRef: string): string {
  return bookingRef.trim().toUpperCase()
}

/**
 * Normalize a booker email: trimmed and lower-cased for deterministic
 * comparison and HMAC binding.
 */
export function normalizeBookerEmail(email: string): string {
  return email.trim().toLowerCase()
}

export type EditAccommodationSelectionInput = {
  attendeeKey: string
  categoryId?: string | null
  occupancy?: "single" | "shared" | "family" | null
  /**
   * Independent one-night night-before level of the simplified contract.
   * Omitted/null means no night-before stay. Included in the signed envelope
   * and the before/after digest so a captured signature cannot be replayed
   * with a swapped level.
   */
  nightBeforeLevel?: "standard" | "superior" | null
  nightBeforeOccupancy?: "single" | "shared" | null
  optionSelections?: Array<{
    optionKey: string
    quantity: number
    nights: number
  }>
}

/**
 * The normalized edit envelope both sides sign. The route builds it from the
 * raw HTTP body/path; the mutation rebuilds it from its validated arguments
 * and recomputes the same digest, so a client-supplied fingerprint is never
 * trusted. Honeypot state is deliberately absent (WR-05): the server-side
 * `website` check lives in the Next.js route and any trigger aborts before a
 * signature is minted, so a client-claimed marker could only pollute the
 * audit evidence.
 */
export type TrackPaymentEditEnvelope = {
  bookingRef: string
  bookerEmail?: string | null
  editToken?: string | null
  idempotencyKey: string
  selections: EditAccommodationSelectionInput[]
}

function normalizeRequiredString(value: string, fieldName: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`Invalid '${fieldName}'. Value is required.`)
  }
  return normalized
}

function normalizeOptionalString(value: string | undefined | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeSelection(
  selection: EditAccommodationSelectionInput
): {
  attendeeKey: string
  categoryId: string | null
  occupancy: "single" | "shared" | "family" | null
  nightBeforeLevel: "standard" | "superior" | null
  nightBeforeOccupancy: "single" | "shared" | null
  optionSelections: Array<{
    optionKey: string
    quantity: number
    nights: number
  }>
} {
  const optionSelections = (Array.isArray(selection.optionSelections)
    ? selection.optionSelections
    : []
  )
    .slice()
    .sort((a, b) => a.optionKey.localeCompare(b.optionKey))
    .map((option) => ({
      optionKey: normalizeRequiredString(option.optionKey, "optionKey"),
      quantity: Number(option.quantity),
      nights: Number(option.nights),
    }))
  return {
    attendeeKey: normalizeRequiredString(selection.attendeeKey, "attendeeKey"),
    categoryId: selection.categoryId
      ? String(selection.categoryId).trim()
      : null,
    occupancy: selection.occupancy ?? null,
    nightBeforeLevel: selection.nightBeforeLevel ?? null,
    nightBeforeOccupancy: selection.nightBeforeOccupancy ?? null,
    optionSelections,
  }
}

/**
 * Build the canonical, deterministic JSON representation of a track-payment
 * edit envelope. String fields are normalized the same way on the Next.js
 * route and in the Convex mutation so the two sides always agree, and the
 * object shape is fixed so `JSON.stringify` output is stable across runtimes.
 */
export function canonicalizeEditEnvelope(
  input: TrackPaymentEditEnvelope
): string {
  const canonical = {
    bookingRef: normalizeBookingRefForEdit(input.bookingRef),
    bookerEmail: input.bookerEmail
      ? normalizeBookerEmail(input.bookerEmail)
      : null,
    editToken: normalizeOptionalString(input.editToken),
    idempotencyKey: normalizeRequiredString(
      input.idempotencyKey,
      "idempotencyKey"
    ),
    selections: input.selections.map(normalizeSelection),
  }
  return JSON.stringify(canonical)
}

/**
 * Deterministic canonical digest of a resolved accommodation selection set,
 * used for before/after comparison and audit rows. The set is sorted by
 * attendee key so row insertion order can never change the digest.
 */
export async function digestAccommodationSelections(
  selections: Array<{
    attendeeKey: string
    categoryId?: string | null
    occupancy?: "single" | "shared" | "family" | null
    nightBeforeLevel?: "standard" | "superior" | null
    nightBeforeOccupancy?: "single" | "shared" | null
    optionSelections?: Array<{
      optionKey: string
      quantity: number
      nights: number
    }>
  }>
): Promise<string> {
  const canonical = selections
    .map(normalizeSelection)
    .sort((a, b) => a.attendeeKey.localeCompare(b.attendeeKey))
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(JSON.stringify(canonical))
  )
  return bytesToHex(new Uint8Array(digest))
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
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

// ---------------------------------------------------------------------------
// Edit token (ownership proof embedded in confirmation email links)
// ---------------------------------------------------------------------------

function editTokenMessage(input: {
  bookingRef: string
  bookerEmail: string
}): string {
  return `track-payment:${normalizeBookingRefForEdit(
    input.bookingRef
  )}:${normalizeBookerEmail(input.bookerEmail)}`
}

/**
 * Mint an HMAC edit token bound to the booking reference and normalized
 * booker email. Long-lived by design: it travels in confirmation/resend
 * email links so a buyer can open the permalink and prove ownership without
 * re-entering the email. Throws when the signing secret is not configured so
 * the caller fails closed instead of emitting a forgeable token.
 */
export async function mintTrackPaymentEditToken(input: {
  bookingRef: string
  bookerEmail: string
  secret?: string
}): Promise<string> {
  const secret = input.secret ?? getTrackPaymentSecret()
  if (!secret) {
    throw new Error(`${SECRET_ENV_VAR} is not configured`)
  }
  return hmacSha256Hex(
    secret,
    editTokenMessage({
      bookingRef: input.bookingRef,
      bookerEmail: input.bookerEmail,
    })
  )
}

/**
 * Verify an edit token against the exact booking-reference/email binding it
 * was issued for. Returns false (never throws) for missing, tampered or
 * wrong-binding tokens and when the signing secret is not configured.
 */
export async function verifyTrackPaymentEditToken(
  token: string | null | undefined,
  input: {
    bookingRef: string
    bookerEmail: string
    secret?: string
  }
): Promise<boolean> {
  if (!token) {
    return false
  }
  const secret = input.secret ?? getTrackPaymentSecret()
  if (!secret) {
    return false
  }
  const expected = await hmacSha256Hex(
    secret,
    editTokenMessage({
      bookingRef: input.bookingRef,
      bookerEmail: input.bookerEmail,
    })
  )
  return timingSafeEqualHex(token, expected)
}

// ---------------------------------------------------------------------------
// Route-issued request signature (short-lived route → Convex gate)
// ---------------------------------------------------------------------------

/**
 * SHA-256 hex digest of the canonicalized edit envelope. The Convex mutation
 * recomputes this from its own (validated) arguments so a client-supplied
 * fingerprint is never trusted; the request signature only verifies when the
 * digest matches what the route signed.
 */
export async function digestEditEnvelope(
  input: TrackPaymentEditEnvelope
): Promise<string> {
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(canonicalizeEditEnvelope(input))
  )
  return bytesToHex(new Uint8Array(digest))
}

function editRequestSignatureMessage(input: {
  bookingRef: string
  envelopeDigest: string
  expiresAt: number
}): string {
  return `track-payment-edit:${normalizeRequiredString(
    input.bookingRef,
    "bookingRef"
  )}:${input.envelopeDigest}:${input.expiresAt}`
}

/**
 * Mint a short-lived request signature over the normalized edit envelope.
 * Callers must already have passed the rate-limit + honeypot gate (the
 * Next.js route). The Convex mutation recomputes the same envelope digest
 * from its own arguments and refuses to do any work without a valid
 * signature, so a captured signature cannot be replayed against a different
 * booking, ownership credential, idempotency key, honeypot result or
 * preference set. Throws when the signing secret is not configured.
 */
export async function mintEditRequestSignature(input: {
  bookingRef: string
  bookerEmail?: string | null
  editToken?: string | null
  idempotencyKey: string
  selections: EditAccommodationSelectionInput[]
  secret?: string
  now?: number
  ttlMs?: number
}): Promise<string> {
  const secret = input.secret ?? getTrackPaymentSecret()
  if (!secret) {
    throw new Error(`${SECRET_ENV_VAR} is not configured`)
  }
  const now = input.now ?? Date.now()
  const expiresAt = now + (input.ttlMs ?? EDIT_REQUEST_SIGNATURE_TTL_MS)
  const envelopeDigest = await digestEditEnvelope({
    bookingRef: input.bookingRef,
    bookerEmail: input.bookerEmail ?? null,
    editToken: input.editToken ?? null,
    idempotencyKey: input.idempotencyKey,
    selections: input.selections,
  })
  const signature = await hmacSha256Hex(
    secret,
    editRequestSignatureMessage({
      bookingRef: input.bookingRef,
      envelopeDigest,
      expiresAt,
    })
  )
  return `${signature}.${expiresAt}`
}

/**
 * Verify a request signature against the exact normalized envelope it was
 * issued for. Returns false (never throws) for missing, expired, tampered or
 * wrong-binding signatures and when the signing secret is not configured.
 */
export async function verifyEditRequestSignature(
  token: string | null | undefined,
  input: {
    bookingRef: string
    bookerEmail?: string | null
    editToken?: string | null
    idempotencyKey: string
    selections: EditAccommodationSelectionInput[]
    secret?: string
    now?: number
  }
): Promise<boolean> {
  if (!token) {
    return false
  }
  const secret = input.secret ?? getTrackPaymentSecret()
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

  const envelopeDigest = await digestEditEnvelope({
    bookingRef: input.bookingRef,
    bookerEmail: input.bookerEmail ?? null,
    editToken: input.editToken ?? null,
    idempotencyKey: input.idempotencyKey,
    selections: input.selections,
  })
  const expected = await hmacSha256Hex(
    secret,
    editRequestSignatureMessage({
      bookingRef: input.bookingRef,
      envelopeDigest,
      expiresAt,
    })
  )
  return timingSafeEqualHex(signature, expected)
}

/**
 * Build the canonical buyer-facing permalink for a booking reference,
 * embedding a fresh edit token as a query parameter when the shared secret is
 * available. Returns null when the secret is missing so the caller keeps the
 * plain root search surface (`/booking`, email-match) link and never emits a
 * forgeable token. Used by signup confirmation and confirmation resend email
 * construction.
 */
export async function buildTrackPaymentPermalink(input: {
  bookingRef: string
  bookerEmail: string
  appUrl?: string
  secret?: string
}): Promise<string | null> {
  const secret = input.secret ?? getTrackPaymentSecret()
  if (!secret) {
    return null
  }
  const bookingRef = normalizeBookingRefForEdit(input.bookingRef)
  const token = await mintTrackPaymentEditToken({
    bookingRef,
    bookerEmail: input.bookerEmail,
    secret,
  })
  const appUrl = (
    input.appUrl ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "")
  return `${appUrl}/booking/${encodeURIComponent(
    bookingRef
  )}/manage?token=${encodeURIComponent(token)}`
}
