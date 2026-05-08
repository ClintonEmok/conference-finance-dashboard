import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { createRoomType, listAccommodationInventory } from "@/lib/domain/accommodation/inventory"

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
    roomTypes: inventory.roomTypes,
  })
}

export async function POST(request: Request) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  let body: { label?: unknown; defaultCapacity?: unknown; notes?: unknown }

  try {
    body = (await request.json()) as { label?: unknown; defaultCapacity?: unknown; notes?: unknown }
  } catch {
    return badRequest("Request body must be valid JSON")
  }

  try {
    const roomType = await createRoomType({
      label: typeof body.label === "string" ? body.label : "",
      defaultCapacity: typeof body.defaultCapacity === "number" ? body.defaultCapacity : Number.NaN,
      notes: typeof body.notes === "string" ? body.notes : null,
    })

    return NextResponse.json({ ok: true, roomType }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message.startsWith("Invalid") || message.includes("not found")) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create room type",
        },
      },
      { status: 500 },
    )
  }
}
