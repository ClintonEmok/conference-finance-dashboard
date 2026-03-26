import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { updateRoomLabel } from "@/lib/domain/accommodation/inventory"

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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  let body: { label?: unknown }

  try {
    body = (await request.json()) as { label?: unknown }
  } catch {
    return badRequest("Request body must be valid JSON")
  }

  try {
    const { roomId } = await context.params
    const room = await updateRoomLabel({
      roomId,
      label: typeof body.label === "string" ? body.label : "",
    })

    return NextResponse.json({ ok: true, room })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message.startsWith("Invalid") || message.includes("not found")) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to update room label",
        },
      },
      { status: 500 },
    )
  }
}
