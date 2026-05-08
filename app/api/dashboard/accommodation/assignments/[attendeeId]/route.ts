import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { unassignAttendeeFromRoom } from "@/lib/domain/accommodation/assignments"

function unauthorized() {
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

function badRequest(message: string) {
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

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ attendeeId: string }> },
) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const { attendeeId } = await context.params
    const attendee = await unassignAttendeeFromRoom(attendeeId)

    return NextResponse.json({ ok: true, attendee })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message.startsWith("Invalid") || message.includes("not found") || message.includes("already")) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to unassign attendee from room",
        },
      },
      { status: 500 },
    )
  }
}
