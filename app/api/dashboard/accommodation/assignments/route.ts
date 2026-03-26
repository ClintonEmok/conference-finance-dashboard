import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import {
  assignAttendeeToRoom,
  getRoomAllocationBoard,
} from "@/lib/domain/accommodation/assignments"

export const dynamic = "force-dynamic"

function parseAvailability(value: string | null) {
  if (!value) {
    return undefined
  }

  if (
    value === "all" ||
    value === "empty" ||
    value === "available" ||
    value === "full"
  ) {
    return value
  }

  throw new Error(
    "Invalid 'availability'. Expected one of: all, empty, available, full."
  )
}

function parseGenderType(value: string | null) {
  if (!value) {
    return undefined
  }

  if (
    value === "MALE" ||
    value === "FEMALE" ||
    value === "MIXED" ||
    value === "UNKNOWN"
  ) {
    return value
  }

  return undefined
}

function parseAllocationPriority(value: string | null) {
  if (!value) {
    return undefined
  }

  if (
    value === "CRITICAL" ||
    value === "HIGH" ||
    value === "NORMAL" ||
    value === "LOW"
  ) {
    return value
  }

  return undefined
}

function parseBoolean(value: string | null) {
  if (!value) {
    return undefined
  }

  if (value === "true") {
    return true
  }

  if (value === "false") {
    return false
  }

  return undefined
}

function unauthorized() {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    },
    { status: 401 }
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
    { status: 400 }
  )
}

export async function GET(request: Request) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const params = new URL(request.url).searchParams
    const board = await getRoomAllocationBoard({
      eventId: params.get("eventId"),
      search: params.get("search"),
      hotelId: params.get("hotelId"),
      roomTypeId: params.get("roomTypeId"),
      availability: parseAvailability(params.get("availability")),
      // Signal-aware filters
      genderType: parseGenderType(params.get("genderType")),
      familyGroupId: params.get("familyGroupId"),
      location: params.get("location"),
      allocationPriority: parseAllocationPriority(
        params.get("allocationPriority")
      ),
      hasPriority: parseBoolean(params.get("hasPriority")),
    })

    return NextResponse.json(board)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message.startsWith("Invalid")) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load room allocation board",
        },
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  let body: { attendeeId?: unknown; roomId?: unknown }

  try {
    body = (await request.json()) as { attendeeId?: unknown; roomId?: unknown }
  } catch {
    return badRequest("Request body must be valid JSON")
  }

  try {
    const attendee = await assignAttendeeToRoom({
      attendeeId: typeof body.attendeeId === "string" ? body.attendeeId : "",
      roomId: typeof body.roomId === "string" ? body.roomId : "",
    })

    return NextResponse.json({ ok: true, attendee })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (
      message.startsWith("Invalid") ||
      message.includes("not found") ||
      message.includes("already")
    ) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to assign attendee to room",
        },
      },
      { status: 500 }
    )
  }
}
