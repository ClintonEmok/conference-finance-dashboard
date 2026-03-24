import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { generateAllocationProposal } from "@/lib/domain/accommodation/assignments"

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
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return unauthorized()
  }

  let body: { eventId?: unknown }

  try {
    body = (await request.json()) as { eventId?: unknown }
  } catch {
    return badRequest("Request body must be valid JSON")
  }

  const eventId = typeof body.eventId === "string" ? body.eventId : null

  try {
    const proposal = await generateAllocationProposal({ eventId })

    return NextResponse.json(proposal)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate proposal"

    if (message.startsWith("Invalid") || message.includes("not found")) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to generate allocation proposal",
        },
      },
      { status: 500 }
    )
  }
}
