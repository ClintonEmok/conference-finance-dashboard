import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { getAttendeeDetail } from "@/lib/domain/finance/attendee-detail"

export async function GET(
  _request: Request,
  context: { params: Promise<{ attendeeId: string }> },
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      },
      { status: 401 },
    )
  }

  try {
    const { attendeeId } = await context.params
    const detail = await getAttendeeDetail(attendeeId)

    return NextResponse.json(detail)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message.startsWith("Invalid")) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message,
          },
        },
        { status: 400 },
      )
    }

    if (message.includes("not found")) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message,
          },
        },
        { status: 404 },
      )
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load attendee detail",
        },
      },
      { status: 500 },
    )
  }
}
