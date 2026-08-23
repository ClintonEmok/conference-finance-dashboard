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

function normalizeOrderId(value: string | undefined): string {
  const normalized = (value ?? "").trim()
  if (!normalized) throw new Error("Invalid orderId")
  return normalized
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
    const routeOrderId = normalizeOrderId(
      (await context.params).orderId
    )
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

    // Array-based whole-order merge: when sourceOrderIds is supplied, use it
    // directly; when omitted, fall back to the URL orderId as a single-source
    // backward-compatible default.
    let sourceOrderIds: string[]
    if (Array.isArray(input.sourceOrderIds)) {
      sourceOrderIds = (input.sourceOrderIds as unknown[])
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim())
    } else {
      sourceOrderIds = [routeOrderId]
    }

    if (sourceOrderIds.length === 0) {
      return badRequest("sourceOrderIds must contain at least one non-empty string")
    }

    // Normalize every ID
    const normalizedSourceIds = sourceOrderIds.map((id) => {
      if (!id) throw new Error("Invalid source order ID")
      return id
    })

    const result = await convexMutation(api.orders.mergeOrders, {
      sourceOrderIds: normalizedSourceIds as Id<"orders">[],
      targetOrderId: targetOrderId as Id<"orders">,
    })

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    console.error("Error merging order:", error)
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message === "Invalid orderId" || message === "Invalid source order ID") {
      return badRequest(message)
    }

    if (
      message.startsWith("Source") ||
      message.startsWith("Target") ||
      message.startsWith("Orders") ||
      message.startsWith("At least") ||
      message.startsWith("Duplicate") ||
      message.startsWith("A source") ||
      message.startsWith("Booking reference")
    ) {
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
