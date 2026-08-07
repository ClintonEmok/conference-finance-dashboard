import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { createHotel, listAccommodationInventory } from "@/lib/domain/accommodation/inventory"

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
    hotels: inventory.hotels,
  })
}

export async function POST(request: Request) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  let body: { name?: unknown; city?: unknown; address?: unknown; notes?: unknown }

  try {
    body = (await request.json()) as {
      name?: unknown
      city?: unknown
      address?: unknown
      notes?: unknown
    }
  } catch {
    return badRequest("Request body must be valid JSON")
  }

  try {
    const hotel = await createHotel({
      name: typeof body.name === "string" ? body.name : "",
      city: typeof body.city === "string" ? body.city : null,
      address: typeof body.address === "string" ? body.address : null,
      notes: typeof body.notes === "string" ? body.notes : null,
    })

    return NextResponse.json({ ok: true, hotel }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message.startsWith("Invalid") || message.includes("not found")) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create hotel",
        },
      },
      { status: 500 },
    )
  }
}
