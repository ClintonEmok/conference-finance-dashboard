import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { convexMutation } from "@/lib/convex/server"

function badRequest(message: string) {
  return NextResponse.json(
    { error: { code: "BAD_REQUEST", message } },
    { status: 400 }
  )
}

export async function POST(request: Request) {
  const authResult = await requireApiUser()
  if (authResult instanceof NextResponse) return authResult

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return badRequest("Request body must be valid JSON")
  }

  const eventId = typeof body.eventId === "string" ? body.eventId : undefined
  if (!eventId) {
    return badRequest("'eventId' is required")
  }

  try {
    const result = await convexMutation(api.tikkie.autoMatchTikkiePayments, {
      eventId,
    })
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to auto-match payments"
    return badRequest(message)
  }
}
