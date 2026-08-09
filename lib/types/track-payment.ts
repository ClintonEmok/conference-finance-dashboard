/**
 * Structured error codes for the public track-payment accommodation edit
 * surface (Phase 43). The Convex mutation throws `CODE: message` errors;
 * the Next.js API route parses the same codes into stable JSON responses so
 * the browser never needs to infer failure causes from HTTP status alone.
 */

export const trackPaymentEditErrorCodeValues = [
  "EDIT_NOT_FOUND",
  "EDIT_OWNERSHIP",
  "EDIT_CONFIRMED",
  "EDIT_INVALID",
  "EDIT_CONFLICT",
  "EDIT_IDEMPOTENCY_CONFLICT",
  "SIGNATURE_REQUIRED",
  "EDIT_REJECTED",
] as const

export type TrackPaymentEditErrorCode =
  (typeof trackPaymentEditErrorCodeValues)[number]

/**
 * Parse a `CODE: message` marker out of an error message, returning the code
 * and the trimmed message body. Returns null when no known code is present so
 * callers can fall back to a generic failure mapping.
 */
export function parseTrackPaymentEditGuardError(
  error: unknown
): { code: TrackPaymentEditErrorCode; message: string } | null {
  if (!(error instanceof Error)) {
    return null
  }
  for (const code of trackPaymentEditErrorCodeValues) {
    const marker = `${code}:`
    const index = error.message.indexOf(marker)
    if (index >= 0) {
      return {
        code,
        message: error.message.slice(index + marker.length).trim(),
      }
    }
  }
  return null
}
