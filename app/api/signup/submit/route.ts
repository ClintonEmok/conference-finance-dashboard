import { NextResponse } from "next/server"
import {
  submitSignup,
  SignupSubmissionValidationError,
} from "@/lib/domain/signup/submission"
import { enforceRateLimit } from "@/lib/rate-limit"
import { signupSubmissionErrorCodeValues } from "@/lib/types/signup"

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

    const payloadFingerprint = hashString(JSON.stringify(body))
    const idempotencyHeader = request.headers.get("x-idempotency-key")?.trim()
    const idempotencyKey =
      idempotencyHeader || `derived-${payloadFingerprint.slice(0, 16)}`

    const result = await submitSignup(body, {
      idempotencyKey,
      payloadFingerprint,
      honeypotSeen: false,
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
