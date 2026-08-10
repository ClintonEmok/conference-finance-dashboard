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

const OCCUPANCY_VALUES = new Set(["single", "shared"])
const NIGHT_BEFORE_LEVEL_VALUES = new Set(["standard", "superior"])
const NIGHT_BEFORE_OCCUPANCY_VALUES = new Set(["single", "shared"])
const ALLOWED_FIELDS = [
  "eventId",
  "occupancy",
  "optionSelections",
  "nightBeforeLevel",
  "nightBeforeOccupancy",
]

function validateOptionSelections(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Invalid optionSelections. Expected an array.")
  }

  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(
        `Invalid optionSelections entry at index ${index}. Expected an object.`
      )
    }

    const entry = raw as Record<string, unknown>
    const label = `optionSelections[${index}]`

    if (typeof entry.optionKey !== "string" || !entry.optionKey.trim()) {
      throw new Error(`Invalid ${label}.optionKey. Expected a string.`)
    }

    if (!Number.isInteger(entry.quantity) || (entry.quantity as number) < 0) {
      throw new Error(
        `Invalid ${label}.quantity. Expected a non-negative integer.`
      )
    }

    if (!Number.isInteger(entry.nights) || (entry.nights as number) < 0) {
      throw new Error(
        `Invalid ${label}.nights. Expected a non-negative integer.`
      )
    }

    return {
      optionKey: entry.optionKey.trim(),
      quantity: entry.quantity as number,
      nights: entry.nights as number,
    }
  })
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

    for (const key of Object.keys(input)) {
      if (!ALLOWED_FIELDS.includes(key)) {
        return badRequest(
          `Unexpected field '${key}'. Allowed fields: ${ALLOWED_FIELDS.join(", ")}.`
        )
      }
    }

    const eventId = input.eventId
    if (typeof eventId !== "string" || !eventId.trim()) {
      return badRequest("Invalid eventId. Expected a string.")
    }

    let occupancy: "single" | "shared" | undefined
    if (input.occupancy !== undefined) {
      if (input.occupancy === null) {
        return badRequest("Invalid occupancy. Expected one of: single, shared.")
      }
      if (
        typeof input.occupancy !== "string" ||
        !OCCUPANCY_VALUES.has(input.occupancy)
      ) {
        return badRequest("Invalid occupancy. Expected one of: single, shared.")
      }
      occupancy = input.occupancy as "single" | "shared"
    }

    let optionSelections: Array<{
      optionKey: string
      quantity: number
      nights: number
    }> = []
    if (input.optionSelections !== undefined) {
      optionSelections = validateOptionSelections(input.optionSelections)
    }

    let nightBeforeLevel: "standard" | "superior" | undefined
    if (input.nightBeforeLevel !== undefined) {
      if (
        typeof input.nightBeforeLevel !== "string" ||
        !NIGHT_BEFORE_LEVEL_VALUES.has(input.nightBeforeLevel)
      ) {
        return badRequest(
          "Invalid nightBeforeLevel. Expected one of: standard, superior."
        )
      }
      nightBeforeLevel = input.nightBeforeLevel as "standard" | "superior"
    }

    let nightBeforeOccupancy: "single" | "shared" | undefined
    if (input.nightBeforeOccupancy !== undefined) {
      if (
        typeof input.nightBeforeOccupancy !== "string" ||
        !NIGHT_BEFORE_OCCUPANCY_VALUES.has(input.nightBeforeOccupancy)
      ) {
        return badRequest(
          "Invalid nightBeforeOccupancy. Expected one of: single, shared."
        )
      }
      nightBeforeOccupancy = input
        .nightBeforeOccupancy as "single" | "shared"
    }

    if (nightBeforeOccupancy !== undefined && nightBeforeLevel === undefined) {
      return badRequest(
        "nightBeforeOccupancy requires a nightBeforeLevel."
      )
    }

    const mutationArgs: {
      attendeeId: string
      eventId: string
      occupancy?: "single" | "shared"
      optionSelections?: Array<{
        optionKey: string
        quantity: number
        nights: number
      }>
      nightBeforeLevel?: "standard" | "superior"
      nightBeforeOccupancy?: "single" | "shared"
    } = {
      attendeeId: normalizedAttendeeId,
      eventId,
    }

    if (occupancy !== undefined) mutationArgs.occupancy = occupancy
    if (optionSelections.length > 0) {
      mutationArgs.optionSelections = optionSelections
    }
    if (nightBeforeLevel !== undefined) {
      mutationArgs.nightBeforeLevel = nightBeforeLevel
    }
    if (nightBeforeOccupancy !== undefined) {
      mutationArgs.nightBeforeOccupancy = nightBeforeOccupancy
    }

    const result = await convexMutation(
      api.attendees.setAttendeeAccommodation as any,
      mutationArgs
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error updating attendee accommodation:", error)
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

    if (message.startsWith("Invalid")) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to update attendee accommodation",
        },
      },
      { status: 500 }
    )
  }
}
