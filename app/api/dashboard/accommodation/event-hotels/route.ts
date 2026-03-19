import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { attachHotelToEvent, detachHotelFromEvent } from "@/lib/domain/accommodation/inventory"

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

async function requireSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return null
  }

  return session
}

export async function POST(request: Request) {
  const session = await requireSession()

  if (!session) {
    return unauthorized()
  }

  let body: { eventId?: unknown; hotelId?: unknown }

  try {
    body = (await request.json()) as { eventId?: unknown; hotelId?: unknown }
  } catch {
    return badRequest("Request body must be valid JSON")
  }

  try {
    const link = await attachHotelToEvent({
      eventId: typeof body.eventId === "string" ? body.eventId : "",
      hotelId: typeof body.hotelId === "string" ? body.hotelId : "",
    })

    return NextResponse.json({ ok: true, link }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message.startsWith("Invalid")) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to attach hotel to event",
        },
      },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession()

  if (!session) {
    return unauthorized()
  }

  let body: { eventId?: unknown; hotelId?: unknown }

  try {
    body = (await request.json()) as { eventId?: unknown; hotelId?: unknown }
  } catch {
    return badRequest("Request body must be valid JSON")
  }

  try {
    await detachHotelFromEvent({
      eventId: typeof body.eventId === "string" ? body.eventId : "",
      hotelId: typeof body.hotelId === "string" ? body.hotelId : "",
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message.startsWith("Invalid")) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to detach hotel from event",
        },
      },
      { status: 500 },
    )
  }
}
