import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { Id } from "@/convex/_generated/dataModel"
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

export async function POST(
  request: Request,
  context: { params: Promise<{ attendeeId: string }> }
) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const normalizedAttendeeId = await getNormalizedAttendeeId(context)

    const body = (await request.json()) as unknown

    if (!body || typeof body !== "object") {
      return badRequest("Request body must be a JSON object")
    }

    const input = body as Record<string, unknown>

    for (const key of Object.keys(input)) {
      if (key !== "targetOrderId") {
        return badRequest(
          `Unexpected field '${key}'. Allowed fields: targetOrderId.`
        )
      }
    }

    const targetOrderId =
      typeof input.targetOrderId === "string" ? input.targetOrderId.trim() : ""

    if (!targetOrderId) {
      return badRequest("targetOrderId is required")
    }

    const result = await convexMutation(
      api.attendees.moveAttendeeToOrder as any,
      {
        attendeeId: normalizedAttendeeId,
        targetOrderId: targetOrderId as Id<"orders">,
      }
    )

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    console.error("Error moving attendee:", error)
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

    if (
      message.startsWith("Invalid") ||
      message.startsWith("Source") ||
      message.startsWith("Target") ||
      message.startsWith("Orders") ||
      message.startsWith("Attendee")
    ) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to move attendee",
        },
      },
      { status: 500 }
    )
  }
}
