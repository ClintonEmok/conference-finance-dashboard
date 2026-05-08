import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { deleteHotel } from "@/lib/domain/accommodation/inventory"

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

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ hotelId: string }> }
) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const { hotelId } = await context.params
    await deleteHotel({ hotelId })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (
      message.startsWith("Invalid") ||
      message.includes("not found") ||
      message.startsWith("Cannot delete")
    ) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to delete hotel",
        },
      },
      { status: 500 }
    )
  }
}
