import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import { convexMutation } from "@/lib/convex/server"
import { enforceRateLimit } from "@/lib/rate-limit"
import {
  mintRemoveAttendeeSignature,
  normalizeBookingRefForEdit,
  normalizeBookerEmail,
} from "@/lib/domain/track-payment/edit-token"
import { parseTrackPaymentEditGuardError } from "@/lib/types/track-payment"

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status }
  )
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * POST /api/track-payment/[bookingRef]/remove
 *
 * The browser write path for buyer-facing attendee removal on the durable
 * manage-booking permalink. Applies the shared IP rate limiter and the
 * signup-style honeypot, rejects any unknown field, normalizes the ownership
 * and idempotency inputs, mints the short-lived request signature over the
 * exact normalized removal envelope, and calls the public Convex mutation
 * (which independently re-verifies the signature and ownership). Returns the
 * mutation's server-derived canonical result; ownership/validation/not-found
 * failures map to stable JSON responses that never reveal whether another
 * booking reference exists.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ bookingRef: string }> }
) {
  const rateLimited = enforceRateLimit(request, "track-payment-remove", {
    maxRequests: 20,
    windowMs: 60_000,
  })
  if (rateLimited) {
    return rateLimited
  }

  const { bookingRef: rawBookingRef } = await context.params
  const bookingRef = normalizeBookingRefForEdit(rawBookingRef)
  if (!bookingRef) {
    return jsonError("INVALID_EDIT", "Invalid booking reference.", 400)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError("INVALID_EDIT", "Invalid JSON payload.", 400)
  }

  const record = asRecord(body)
  if (!record) {
    return jsonError("INVALID_EDIT", "Invalid payload.", 400)
  }

  const website =
    typeof record.website === "string" ? record.website.trim() : ""
  if (website) {
    return jsonError("HONEYPOT_TRIGGERED", "Edit rejected.", 400)
  }

  const allowedKeys = new Set([
    "attendeeKey",
    "bookerEmail",
    "editToken",
    "idempotencyKey",
    "website",
  ])
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      return jsonError(
        "INVALID_EDIT",
        `Payload contains an unsupported field: ${key}.`,
        400
      )
    }
  }

  const attendeeKey =
    typeof record.attendeeKey === "string" ? record.attendeeKey.trim() : ""
  if (!attendeeKey) {
    return jsonError(
      "INVALID_EDIT",
      "An attendee key is required.",
      400
    )
  }

  const bookerEmail =
    typeof record.bookerEmail === "string" && record.bookerEmail.trim()
      ? normalizeBookerEmail(record.bookerEmail)
      : undefined
  const editToken =
    typeof record.editToken === "string" && record.editToken.trim()
      ? record.editToken.trim()
      : undefined
  const idempotencyFromHeader = request.headers
    .get("x-idempotency-key")
    ?.trim()
  const idempotencyKey =
    (typeof record.idempotencyKey === "string" &&
      record.idempotencyKey.trim()) ||
    idempotencyFromHeader ||
    undefined

  if (!idempotencyKey) {
    return jsonError(
      "INVALID_EDIT",
      "An idempotency key is required for this edit.",
      400
    )
  }

  if (!bookerEmail && !editToken) {
    return jsonError(
      "EDIT_OWNERSHIP",
      "Verify ownership of this booking to edit it.",
      403
    )
  }

  let requestSignature: string
  try {
    requestSignature = await mintRemoveAttendeeSignature({
      bookingRef,
      bookerEmail: bookerEmail ?? null,
      editToken: editToken ?? null,
      idempotencyKey,
      attendeeKey,
    })
  } catch {
    return jsonError(
      "EDIT_UNAVAILABLE",
      "Editing is temporarily unavailable. Please try again later.",
      503
    )
  }

  try {
    const result = await convexMutation(
      api.publicTracking.removeAttendeeFromBooking,
      {
        bookingRef,
        attendeeKey,
        bookerEmail,
        editToken,
        requestSignature,
        idempotencyKey,
      }
    )
    return NextResponse.json({ data: result }, { status: 200 })
  } catch (error) {
    const guardError = parseTrackPaymentEditGuardError(error)
    if (guardError) {
      const status =
        guardError.code === "EDIT_NOT_FOUND"
          ? 404
          : guardError.code === "EDIT_OWNERSHIP" ||
              guardError.code === "SIGNATURE_REQUIRED"
            ? 403
            : 409
      return NextResponse.json(
        { error: { code: guardError.code, message: guardError.message } },
        { status }
      )
    }

    const message = error instanceof Error ? error.message : ""
    if (/An order must retain at least one attendee/.test(message)) {
      return jsonError(
        "EDIT_INVALID",
        "This booking has only one attendee, so it cannot be removed.",
        409
      )
    }

    // Convex validator failures are caller payload problems, not server
    // failures.
    if (/validation|validat/i.test(message) || /unexpected field/i.test(message)) {
      return jsonError(
        "INVALID_EDIT",
        "The submitted removal request is invalid.",
        400
      )
    }

    return jsonError(
      "EDIT_FAILED",
      "The removal could not be completed. Please try again later.",
      500
    )
  }
}