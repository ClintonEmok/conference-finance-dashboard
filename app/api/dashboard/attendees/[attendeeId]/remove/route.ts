import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { convexMutation } from "@/lib/convex/server"

export const dynamic = "force-dynamic"

function badRequest(message: string) {
  return NextResponse.json(
    { error: { code: "BAD_REQUEST", message } },
    { status: 400 }
  )
}

async function getNormalizedAttendeeId(context: {
  params: Promise<{ attendeeId: string }>
}) {
  const { attendeeId } = await context.params
  const normalizedAttendeeId = attendeeId.trim()
  if (!normalizedAttendeeId) throw new Error("Invalid attendeeId")
  return normalizedAttendeeId
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ attendeeId: string }> }
) {
  const authResult = await requireApiUser()
  if (authResult instanceof NextResponse) return authResult

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest("Request body must be valid JSON")
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return badRequest("Request body must be a JSON object")
  }

  const input = body as Record<string, unknown>
  for (const key of Object.keys(input)) {
    if (key !== "eventId") {
      return badRequest("Unexpected field. Allowed fields: eventId.")
    }
  }

  const eventId = typeof input.eventId === "string" ? input.eventId.trim() : ""
  if (!eventId) return badRequest("eventId is required")

  try {
    const attendeeId = await getNormalizedAttendeeId(context)
    const result = await convexMutation(
      api.attendees.removeAttendeeFromOrder as any,
      { attendeeId, eventId } as any
    )

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("Error removing attendee:", error)
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message === "Invalid attendeeId") {
      return badRequest("Invalid attendeeId")
    }
    if (
      message === "Attendee not found." ||
      message === "Attendee order not found." ||
      message === "Event not found."
    ) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: message === "Event not found." ? "Event not found" : "Attendee not found",
          },
        },
        { status: 404 }
      )
    }
    if (
      message === "Event not found." ||
      message.includes("does not belong") ||
      message.startsWith("An order") ||
      message.startsWith("Attendee ") ||
      message.startsWith("Only") ||
      message.includes("ArgumentValidationError") ||
      message.includes("Invalid ID")
    ) {
      return badRequest(message)
    }

    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to remove attendee" } },
      { status: 500 }
    )
  }
}
