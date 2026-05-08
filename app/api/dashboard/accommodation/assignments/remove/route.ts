import { removeBuyerAssignment } from "@/lib/domain/accommodation/assignments"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { assignmentId, reason } = body

    if (!assignmentId || typeof assignmentId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid assignmentId" },
        { status: 400 }
      )
    }

    const result = await removeBuyerAssignment({
      assignmentId,
      reason: reason ?? null,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error removing buyer assignment:", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to remove buyer assignment",
      },
      { status: 500 }
    )
  }
}
