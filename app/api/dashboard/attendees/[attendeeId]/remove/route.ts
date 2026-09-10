import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { convexMutation } from "@/lib/convex/server"

export const dynamic = "force-dynamic"

function badRequest(message: string) {
  return NextResponse.json(
    {
      error: {
        code: "BAD_REQUEST",
        message,
      },
    },
    { status: 400 }
  )
}

async function getNormalizedAttendeeId(context: {
  params: Promise<{ attendeeId: string }>
}) {
  const { attendeeId } = await context.params
  const normalizedAttendeeId = attendeeId.trim()

  if (!normalizedAttendeeId) {
    throw new Error("Invalid attendeeId")
  }

  return normalizedAttendeeId
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ attendeeId: string }> }
) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const normalizedAttendeeId = await getNormalizedAttendeeId(context)

    const result = await convexMutation(
      api.attendees.removeAttendeeFromOrder as any,
      {
        attendeeId: normalizedAttendeeId,
      }
    )

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    console.error("Error removing attendee:", error)
    const message = error instanceof Error ? error.message : "Invalid request"

    if (
      message === "Invalid attendeeId" ||
      message.startsWith("Invalid 'attendeeId'")
    ) {
      return badRequest("Invalid attendeeId")
    }

    if (message.includes("not found")) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Attendee not found",
          },
        },
        { status: 404 }
      )
    }

    if (message.startsWith("An order")) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to remove attendee",
        },
      },
      { status: 500 }
    )
  }
}