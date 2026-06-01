import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { Id } from "@/convex/_generated/dataModel"
import { convexMutation } from "@/lib/convex/server"

export const dynamic = "force-dynamic"

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

function normalizeOrderId(context: { params: Promise<{ orderId: string }> }) {
  return context.params.then(({ orderId }) => {
    const normalized = orderId.trim()
    if (!normalized) throw new Error("Invalid orderId")
    return normalized
  })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const sourceOrderId = await normalizeOrderId(context)
    const body = (await request.json()) as unknown

    if (!body || typeof body !== "object") {
      return badRequest("Request body must be a JSON object")
    }

    const input = body as Record<string, unknown>
    const targetOrderId =
      typeof input.targetOrderId === "string"
        ? input.targetOrderId.trim()
        : ""

    if (!targetOrderId) {
      return badRequest("targetOrderId is required")
    }

    const result = await convexMutation(api.orders.mergeOrders, {
      sourceOrderId: sourceOrderId as Id<"orders">,
      targetOrderId: targetOrderId as Id<"orders">,
    })

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    console.error("Error merging order:", error)
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message === "Invalid orderId") {
      return badRequest("Invalid orderId")
    }

    if (message.startsWith("Source") || message.startsWith("Target") || message.startsWith("Orders")) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to merge orders",
        },
      },
      { status: 500 }
    )
  }
}
