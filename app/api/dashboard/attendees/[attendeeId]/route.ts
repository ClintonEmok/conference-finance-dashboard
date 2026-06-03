import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { convexMutation } from "@/lib/convex/server"
import { getAttendeeDetail } from "@/lib/domain/finance/attendee-detail"

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

const GENDER_VALUES = new Set(["MALE", "FEMALE", "MIXED", "UNKNOWN"])

function parseOptionalString(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined
  }

  if (value === null || value === "") {
    return null
  }

  if (typeof value !== "string") {
    throw new Error(`Invalid '${fieldName}'. Expected a string.`)
  }

  const normalized = value.trim()
  return normalized || null
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
    console.error("Error loading attendee detail:", error)
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

    const updateData: {
      tikkieAmountOverrideMinor?: number
      genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
      ticketTypeId?: string
      location?: string | null
    } = {}

    if ("tikkieAmountOverrideMinor" in input) {
      const value = input.tikkieAmountOverrideMinor

      if (value === null || value === undefined || value === 0) {
        updateData.tikkieAmountOverrideMinor = undefined
      } else if (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value > 0
      ) {
        updateData.tikkieAmountOverrideMinor = value
      } else {
        return badRequest(
          "Invalid tikkieAmountOverrideMinor. Expected a positive integer or null to clear."
        )
      }
    }

    if ("genderType" in input) {
      const value = input.genderType

      if (value === null || value === undefined || value === "") {
        updateData.genderType = undefined
      } else if (typeof value === "string" && GENDER_VALUES.has(value)) {
        updateData.genderType = value as "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
      } else {
        return badRequest(
          "Invalid genderType. Expected one of: MALE, FEMALE, MIXED, UNKNOWN."
        )
      }
    }

    if ("ticketTypeId" in input) {
      const value = input.ticketTypeId

      if (value === null || value === undefined || value === "") {
        return badRequest("ticketTypeId cannot be cleared.")
      }

      if (typeof value === "string") {
        updateData.ticketTypeId = value
      } else {
        return badRequest("Invalid ticketTypeId. Expected a string.")
      }
    }

    if ("location" in input) {
      updateData.location = parseOptionalString(input.location, "location")
    }

    if (Object.keys(updateData).length === 0) {
      return badRequest(
        "No valid fields to update. Allowed fields: tikkieAmountOverrideMinor, genderType, ticketTypeId, location"
      )
    }

    const mutationArgs: {
      attendeeId: string
      tikkieAmountOverrideMinor?: number
      genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
      ticketTypeId?: string
      location?: string | null
    } = { attendeeId: normalizedAttendeeId }

    if (updateData.tikkieAmountOverrideMinor !== undefined) {
      mutationArgs.tikkieAmountOverrideMinor =
        updateData.tikkieAmountOverrideMinor
    }

    if (updateData.genderType !== undefined) {
      mutationArgs.genderType = updateData.genderType
    }

    if (updateData.ticketTypeId !== undefined) {
      mutationArgs.ticketTypeId = updateData.ticketTypeId
    }

    if (updateData.location !== undefined) {
      mutationArgs.location = updateData.location
    }

    await convexMutation(api.attendees.updateAttendee as any, mutationArgs)

    return NextResponse.json({
      attendee: {
        id: normalizedAttendeeId,
        tikkieAmountOverrideMinor: updateData.tikkieAmountOverrideMinor ?? null,
        genderType: updateData.genderType ?? null,
        ticketTypeId: updateData.ticketTypeId ?? null,
        location: updateData.location ?? null,
      },
    })
  } catch (error) {
    console.error("Error updating attendee detail:", error)
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
