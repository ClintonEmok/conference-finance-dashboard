import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { confirmBuyerAssignment } from "@/lib/domain/accommodation/assignments"

export const dynamic = "force-dynamic"

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

export async function POST(request: Request) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  let body: { assignmentId?: unknown; slotId?: unknown }

  try {
    body = (await request.json()) as {
      assignmentId?: unknown
      slotId?: unknown
    }
  } catch {
    return badRequest("Request body must be valid JSON")
  }

  const assignmentId =
    typeof body.assignmentId === "string" ? body.assignmentId : ""
  const slotId = typeof body.slotId === "string" ? body.slotId : undefined

  if (!assignmentId) {
    return badRequest("assignmentId is required")
  }

  try {
    const result = await confirmBuyerAssignment({ assignmentId, slotId })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (
      message.startsWith("Invalid") ||
      message.includes("not found") ||
      message.includes("not pending")
    ) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to confirm assignment",
        },
      },
      { status: 500 }
    )
  }
}
