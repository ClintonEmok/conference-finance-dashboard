import { NextResponse } from "next/server"
import {
  submitSignup,
  SignupSubmissionValidationError,
} from "@/lib/domain/signup/submission"
import { enforceRateLimit } from "@/lib/rate-limit"
import { signupSubmissionErrorCodeValues } from "@/lib/types/signup"
import { api } from "@/lib/convex/api"
import { convexMutation, convexQuery } from "@/lib/convex/server"
import type { Id } from "@/convex/_generated/dataModel"

function hashString(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }

  return Math.abs(hash).toString(36)
}

function parseSubmissionGuardError(error: unknown) {
  if (!(error instanceof Error)) {
    return null
  }

  for (const code of signupSubmissionErrorCodeValues) {
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

type TurnstileVerificationResponse = {
  success: boolean
  "error-codes"?: string[]
}

async function verifyTurnstileToken(
  token: string,
  remoteip?: string
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    throw new Error("TURNSTILE_SECRET_KEY is not configured")
  }

  const verificationPayload: Record<string, string> = {
    secret,
    response: token,
  }

  if (remoteip) {
    verificationPayload.remoteip = remoteip
  }

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(verificationPayload),
    }
  )

  const payload = (await response
    .json()
    .catch(() => null)) as TurnstileVerificationResponse | null

  return Boolean(response.ok && payload?.success)
}

export async function POST(request: Request) {
  const rateLimited = enforceRateLimit(request, "signup-submit", {
    maxRequests: 20,
    windowMs: 60_000,
  })
  if (rateLimited) {
    return rateLimited
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_SUBMISSION",
          message: "Invalid JSON payload",
        },
      },
      { status: 400 }
    )
  }

  try {
    const bodyRecord =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null

    const website =
      bodyRecord && typeof bodyRecord.website === "string"
        ? bodyRecord.website.trim()
        : ""

    if (website) {
      return NextResponse.json(
        {
          error: {
            code: "HONEYPOT_TRIGGERED",
            message: "Submission rejected.",
          },
        },
        { status: 400 }
      )
    }

    const captchaToken =
      bodyRecord && typeof bodyRecord.captchaToken === "string"
        ? bodyRecord.captchaToken.trim()
        : ""

    const remoteip =
      request.headers.get("cf-connecting-ip")?.trim() ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      undefined

    if (!captchaToken) {
      return NextResponse.json(
        {
          error: {
            code: "CAPTCHA_REQUIRED",
            message: "Complete the verification challenge and try again.",
          },
        },
        { status: 400 }
      )
    }

    const captchaValid = await verifyTurnstileToken(captchaToken, remoteip)
    if (!captchaValid) {
      return NextResponse.json(
        {
          error: {
            code: "CAPTCHA_FAILED",
            message: "Verification failed. Please try again.",
          },
        },
        { status: 403 }
      )
    }

    const fingerprintBody =
      bodyRecord && typeof bodyRecord === "object"
        ? { ...bodyRecord }
        : bodyRecord
    if (fingerprintBody && typeof fingerprintBody === "object") {
      delete fingerprintBody.captchaToken
      delete fingerprintBody.website
    }

    const payloadFingerprint = hashString(JSON.stringify(fingerprintBody))
    const idempotencyHeader = request.headers.get("x-idempotency-key")?.trim()
    const idempotencyKey =
      idempotencyHeader || `derived-${payloadFingerprint.slice(0, 16)}`

    const result = await submitSignup(body, {
      idempotencyKey,
      payloadFingerprint,
      honeypotSeen: false,
    })

    // Fire-and-forget: trigger confirmation email
    triggerConfirmationEmail(body, result.bookingRef).catch((err) => {
      console.error("Failed to queue confirmation email:", err)
    })

    return NextResponse.json(
      {
        data: {
          submissionId: result.submissionId,
          bookingRef: result.bookingRef,
          submittedAt: result.submittedAt,
          ...(result.restorePayload
            ? { restorePayload: result.restorePayload }
            : {}),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof SignupSubmissionValidationError) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_SUBMISSION",
            message: error.message,
          },
        },
        { status: 400 }
      )
    }

    const guardError = parseSubmissionGuardError(error)
    if (guardError) {
      return NextResponse.json(
        {
          error: {
            code: guardError.code,
            message: guardError.message,
          },
        },
        { status: 409 }
      )
    }

    const message =
      error instanceof Error ? error.message : "Failed to submit signup"

    return NextResponse.json(
      {
        error: {
          code: "SUBMISSION_FAILED",
          message,
        },
      },
      { status: 500 }
    )
  }
}

/**
 * Fires confirmation email asynchronously after successful signup.
 * Best-effort: errors are logged but don't block the response.
 */
async function triggerConfirmationEmail(
  body: unknown,
  bookingRef: string
): Promise<void> {
  const bodyRecord =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null

  if (!bodyRecord) return

  const eventId =
    typeof bodyRecord.eventId === "string" ? bodyRecord.eventId : null
  if (!eventId) return

  const booker = bodyRecord.booker as Record<string, unknown> | undefined
  const bookerEmail = typeof booker?.email === "string" ? booker.email : null
  const bookerName = typeof booker?.name === "string" ? booker.name : "Guest"

  if (!bookerEmail) return

  const attendees = Array.isArray(bodyRecord.attendees)
    ? bodyRecord.attendees
    : []
  const assignments = Array.isArray(bodyRecord.assignments)
    ? bodyRecord.assignments
    : []

  // Fetch event details by ID
  const event = await convexQuery(api.events.getEventById, { eventId }).catch(
    () => null
  )

  // Try fetching Tikkie link
  const tikkieLink = await convexQuery(
    api.tikkie.getEventPaymentLinkForSuccess,
    { eventId: eventId as Id<"events"> }
  ).catch(() => null)

  // Build room assignments from submission data
  const uniqueSlotIds = new Set<string>()
  const roomAssignments: Array<{
    roomType: string
    hotelName: string
    bedCount: number
  }> = []
  for (const assignment of assignments) {
    if (
      typeof assignment === "object" &&
      assignment !== null &&
      "slotId" in assignment &&
      "assignmentIntent" in assignment &&
      assignment.assignmentIntent === "assign"
    ) {
      const slotId = String((assignment as Record<string, unknown>).slotId)
      if (!uniqueSlotIds.has(slotId)) {
        uniqueSlotIds.add(slotId)
        // Slot details are not available here; use placeholder
        roomAssignments.push({
          roomType: "Room",
          hotelName: "Assigned",
          bedCount: 1,
        })
      }
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const eventName = event?.title ?? "Conference"
  const eventDate = event?.startsAt
    ? new Date(event.startsAt).toLocaleDateString("en-GB")
    : new Date().toLocaleDateString("en-GB")

  await convexMutation(api.emailMutations.triggerSignupConfirmationEmail, {
    to: bookerEmail,
    bookerName,
    bookingRef,
    eventName,
    eventDate,
    eventLocation: "",
    tikkieUrl: tikkieLink?.paymentUrl,
    tikkieAmountMinor: tikkieLink?.amountMinor,
    tikkieCurrency: event?.currency,
    attendeeCount: attendees.length,
    roomAssignments,
    trackPaymentUrl: `${appUrl}/track-payment`,
    successPageUrl: `${appUrl}/signup/success/${bookingRef}`,
  })
}
