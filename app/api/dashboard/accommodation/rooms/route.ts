import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
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
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return unauthorized()
  }

  const inventory = await listAccommodationInventory()

  return NextResponse.json({
    rooms: inventory.rooms,
  })
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return unauthorized()
  }

  let body: { hotelId?: unknown; roomTypeId?: unknown; label?: unknown; capacity?: unknown; notes?: unknown }

  try {
    body = (await request.json()) as {
      hotelId?: unknown
      roomTypeId?: unknown
      label?: unknown
      capacity?: unknown
      notes?: unknown
    }
  } catch {
    return badRequest("Request body must be valid JSON")
  }

  try {
    const room = await createRoom({
      hotelId: typeof body.hotelId === "string" ? body.hotelId : "",
      roomTypeId: typeof body.roomTypeId === "string" ? body.roomTypeId : "",
      label: typeof body.label === "string" ? body.label : "",
      capacity: typeof body.capacity === "number" ? body.capacity : Number.NaN,
      notes: typeof body.notes === "string" ? body.notes : null,
    })

    return NextResponse.json({ ok: true, room }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message.startsWith("Invalid") || message.includes("not found")) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create room",
        },
      },
      { status: 500 },
    )
  }
}
