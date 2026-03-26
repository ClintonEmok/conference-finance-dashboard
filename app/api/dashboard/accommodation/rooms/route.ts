import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { createRoom, listAccommodationInventory } from "@/lib/domain/accommodation/inventory"

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

export async function GET() {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const inventory = await listAccommodationInventory()

  return NextResponse.json({
    rooms: inventory.rooms,
  })
}

export async function POST(request: Request) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  let body: { hotelId?: unknown; roomTypeId?: unknown; quantity?: unknown; labels?: unknown; notes?: unknown }

  try {
    body = (await request.json()) as {
      hotelId?: unknown
      roomTypeId?: unknown
      quantity?: unknown
      labels?: unknown
      notes?: unknown
    }
  } catch {
    return badRequest("Request body must be valid JSON")
  }

  try {
    const room = await createRoom({
      hotelId: typeof body.hotelId === "string" ? body.hotelId : "",
      roomTypeId: typeof body.roomTypeId === "string" ? body.roomTypeId : "",
      quantity: typeof body.quantity === "number" ? body.quantity : Number.NaN,
      labels: Array.isArray(body.labels) ? body.labels.filter((label): label is string => typeof label === "string") : undefined,
      notes: typeof body.notes === "string" ? body.notes : null,
    })

    return NextResponse.json({ ok: true, rooms: room }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message.startsWith("Invalid") || message.includes("not found")) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create room block",
        },
      },
      { status: 500 },
    )
  }
}
