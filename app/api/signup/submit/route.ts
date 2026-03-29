import { NextResponse } from "next/server"
import {
  submitSignup,
  SignupSubmissionValidationError,
} from "@/lib/domain/signup/submission"

export async function POST(request: Request) {
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
    const result = await submitSignup(body)

    return NextResponse.json(
      {
        data: {
          submissionId: result.submissionId,
          bookingRef: result.bookingRef,
          submittedAt: result.submittedAt,
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
