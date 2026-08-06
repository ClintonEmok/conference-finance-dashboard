import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convexMutation } from "@/lib/convex/server"
import { enforceRateLimit } from "@/lib/rate-limit"
import {
  mintEditRequestSignature,
  normalizeBookingRefForEdit,
  normalizeBookerEmail,
} from "@/lib/domain/track-payment/edit-token"
import { parseTrackPaymentEditGuardError } from "@/lib/types/track-payment"

type EditAgeBandCode = "under_3" | "3_11" | "12_17" | "18_plus"
type EditOccupancy = "single" | "shared" | "family"

/**
 * One parsed options-only preference. Only these fields are ever forwarded
 * to Convex — any client amount, stay date/night, room/slot, or snapshot
 * field is rejected before this shape is built.
 */
type ParsedEditSelection = {
  attendeeKey: string
  categoryId?: Id<"accommodationCategories">
  occupancy?: EditOccupancy
  upgradeSelected: boolean
  cotSelected: boolean
  ageBandCode?: EditAgeBandCode
}

const editAgeBandCodes: ReadonlyArray<EditAgeBandCode> = [
  "under_3",
  "3_11",
  "12_17",
  "18_plus",
]
const editOccupancies: ReadonlyArray<EditOccupancy> = [
  "single",
  "shared",
  "family",
]

/**
 * Fields the server must resolve. A client that supplies any of these is
 * trying to influence money, stay dates/nights, physical rooms/slots, or the
 * confirmation/snapshot contract — rejected before anything reaches Convex.
 */
const CLIENT_AUTHORITY_FIELDS = [
  "amountMinor",
  "totalAmountMinor",
  "amountDueMinor",
  "priceMinor",
  "price",
  "total",
  "checkInAt",
  "checkOutAt",
  "date",
  "dates",
  "nightCount",
  "nights",
  "roomId",
  "roomTypeId",
  "slotId",
  "assignedRoomId",
  "snapshot",
  "priceSnapshot",
  "configVersion",
  "confirmedAt",
] as const

function rejectClientAuthorityFields(
  record: Record<string, unknown>
): string | null {
  for (const field of CLIENT_AUTHORITY_FIELDS) {
    if (field in record) {
      return field
    }
  }
  return null
}

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
 * POST /api/track-payment/[bookingRef]
 *
 * The only browser write path for the durable permalink accommodation edit.
 * Applies the shared IP rate limiter and the signup route's `website`
 * honeypot, rejects any client-supplied money/stay/room/slot/snapshot
 * authority field, normalizes the ownership/idempotency inputs, mints the
 * short-lived request signature over the exact normalized envelope, and calls
 * the Phase 43 public Convex mutation (which independently re-verifies the
 * signature and ownership). Returns the mutation's server-derived canonical
 * result; ownership/validation/confirmed/rate-limit failures map to stable
 * JSON responses that never reveal whether another booking reference exists.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ bookingRef: string }> }
) {
  const rateLimited = enforceRateLimit(request, "track-payment-edit", {
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

  // Honeypot: a non-empty `website` field is rejected with the same generic
  // public rejection style as the signup route. The result is purely
  // server-derived — a request that reaches this point was never marked as
  // honeypot-seen, and no client-claimed marker is forwarded to the mutation
  // or signature (WR-05).
  const website =
    typeof record.website === "string" ? record.website.trim() : ""
  if (website) {
    return jsonError("HONEYPOT_TRIGGERED", "Edit rejected.", 400)
  }

  // Reject client authority fields before any normalization or signing.
  const topLevelAuthorityField = rejectClientAuthorityFields(record)
  if (topLevelAuthorityField) {
    return jsonError(
      "INVALID_EDIT",
      "Payload contains a field the server must resolve.",
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

  if (!Array.isArray(record.selections) || record.selections.length === 0) {
    return jsonError(
      "INVALID_EDIT",
      "A complete accommodation preference replacement is required.",
      400
    )
  }

  const selections: ParsedEditSelection[] = []
  for (const selection of record.selections) {
    const selectionRecord = asRecord(selection)
    if (!selectionRecord) {
      return jsonError("INVALID_EDIT", "Invalid accommodation preference.", 400)
    }
    const authorityField = rejectClientAuthorityFields(selectionRecord)
    if (authorityField) {
      return jsonError(
        "INVALID_EDIT",
        "A preference contains a field the server must resolve.",
        400
      )
    }
    if (
      typeof selectionRecord.attendeeKey !== "string" ||
      !selectionRecord.attendeeKey.trim()
    ) {
      return jsonError("INVALID_EDIT", "Each preference needs an attendee key.", 400)
    }
    if (
      typeof selectionRecord.upgradeSelected !== "boolean" ||
      typeof selectionRecord.cotSelected !== "boolean"
    ) {
      return jsonError("INVALID_EDIT", "Each preference needs its option flags.", 400)
    }

    const occupancy = editOccupancies.includes(
      selectionRecord.occupancy as EditOccupancy
    )
      ? (selectionRecord.occupancy as EditOccupancy)
      : undefined
    const ageBandCode = editAgeBandCodes.includes(
      selectionRecord.ageBandCode as EditAgeBandCode
    )
      ? (selectionRecord.ageBandCode as EditAgeBandCode)
      : undefined
    const categoryIdValue = selectionRecord.categoryId
    const categoryId =
      typeof categoryIdValue === "string" && categoryIdValue.trim()
        ? (categoryIdValue as unknown as Id<"accommodationCategories">)
        : undefined

    selections.push({
      attendeeKey: selectionRecord.attendeeKey.trim(),
      categoryId,
      occupancy,
      upgradeSelected: selectionRecord.upgradeSelected === true,
      cotSelected: selectionRecord.cotSelected === true,
      ageBandCode,
    })
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
    requestSignature = await mintEditRequestSignature({
      bookingRef,
      bookerEmail: bookerEmail ?? null,
      editToken: editToken ?? null,
      idempotencyKey,
      selections,
    })
  } catch {
    return jsonError(
      "EDIT_UNAVAILABLE",
      "Editing is temporarily unavailable. Please try again later.",
      503
    )
  }

  try {
    const result = await convexMutation(api.publicTracking.updateAccommodation, {
      bookingRef,
      bookerEmail,
      editToken,
      requestSignature,
      idempotencyKey,
      selections,
    })
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
            : guardError.code === "EDIT_CONFIRMED" ||
                guardError.code === "EDIT_INVALID" ||
                guardError.code === "EDIT_CONFLICT" ||
                guardError.code === "EDIT_IDEMPOTENCY_CONFLICT"
              ? 409
              : 500
      return NextResponse.json(
        { error: { code: guardError.code, message: guardError.message } },
        { status }
      )
    }

    // Convex validator failures (invalid id shape, unexpected field) are
    // caller payload problems, not server failures.
    const message = error instanceof Error ? error.message : ""
    if (/validation|validat/i.test(message) || /unexpected field/i.test(message)) {
      return jsonError(
        "INVALID_EDIT",
        "The submitted preferences are invalid.",
        400
      )
    }

    return jsonError(
      "EDIT_FAILED",
      "The edit could not be completed. Please try again later.",
      500
    )
  }
}
