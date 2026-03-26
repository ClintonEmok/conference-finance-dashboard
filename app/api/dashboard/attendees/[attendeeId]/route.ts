import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { convexMutation } from "@/lib/convex/server"
import { getAttendeeDetail } from "@/lib/domain/finance/attendee-detail"
import type { Id } from "@/convex/_generated/dataModel"

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

export async function GET(
  _request: Request,
  context: { params: Promise<{ attendeeId: string }> }
) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const normalizedAttendeeId = await getNormalizedAttendeeId(context)
    const detail = await getAttendeeDetail(normalizedAttendeeId)

    return NextResponse.json(detail)
  } catch (error) {
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

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load attendee detail",
        },
      },
      { status: 500 }
    )
  }
}

export async function PATCH(
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

    // Only allow updating specific fields
    const allowedFields: string[] = ["tikkieAmountOverrideMinor"]

    const updateData: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (field in input) {
        const value = input[field]
        if (value === null || value === undefined) {
          updateData[field] = undefined
        } else if (
          typeof value === "number" &&
          Number.isInteger(value) &&
          value >= 0
        ) {
          updateData[field] = value
        } else if (typeof value === "number" && value === 0) {
          // Allow 0 to clear the override
          updateData[field] = undefined
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return badRequest(
        "No valid fields to update. Allowed fields: tikkieAmountOverrideMinor"
      )
    }

    const attendee = await convexMutation(api.attendees.updateAttendee, {
      attendeeId: normalizedAttendeeId as Id<"ticketTailorAttendees">,
      tikkieAmountOverrideMinor: updateData.tikkieAmountOverrideMinor as
        | number
        | undefined,
    })

    return NextResponse.json({
      attendee: {
        id: attendee.id,
        tikkieAmountOverrideMinor: attendee.tikkieAmountOverrideMinor,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

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

    if (message.startsWith("Invalid")) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to update attendee",
        },
      },
      { status: 500 }
    )
  }
}
