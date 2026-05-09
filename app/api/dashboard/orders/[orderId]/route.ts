import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { Id } from "@/convex/_generated/dataModel"
import { convexMutation, convexQuery } from "@/lib/convex/server"

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
    const normalizedOrderId = orderId.trim()

    if (!normalizedOrderId) {
      throw new Error("Invalid orderId")
    }

    return normalizedOrderId
  })
}

function parseOptionalString(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined
  }

  if (value === null || value === "") {
    return null
  }

  if (typeof value !== "string") {
    throw new Error(`Invalid '${fieldName}'. Expected a string.`)
  }

  const normalized = value.trim()
  return normalized || null
}

function parseNormalizedStatus(value: unknown) {
  if (typeof value !== "string") {
    throw new Error(
      "Invalid normalizedStatus. Expected one of: paid, refunded, cancelled, pending."
    )
  }

  if (
    value !== "paid" &&
    value !== "refunded" &&
    value !== "cancelled" &&
    value !== "pending"
  ) {
    throw new Error(
      "Invalid normalizedStatus. Expected one of: paid, refunded, cancelled, pending."
    )
  }

  return value
}

function parseTotalAmountMinor(value: unknown) {
  if (value === undefined) {
    return undefined
  }

  if (value === null || value === "") {
    return null
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(
      "Invalid totalAmountMinor. Expected a non-negative integer or null to clear."
    )
  }

  return value
}

function parseOrderedAt(value: unknown) {
  if (value === undefined) {
    return undefined
  }

  if (value === null || value === "") {
    return null
  }

  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value
  }

  if (typeof value === "string") {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime()
    }
  }

  throw new Error(
    "Invalid orderedAt. Expected an ISO date string, Unix timestamp in milliseconds, or null to clear."
  )
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const orderId = await normalizeOrderId(context)
    const detail = await convexQuery(api.orders.getOrderWithAttendees, {
      orderId: orderId as Id<"orders">,
    })

    if (!detail) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Order not found",
          },
        },
        { status: 404 }
      )
    }

    return NextResponse.json(detail)
  } catch (error) {
    console.error("Error loading order detail:", error)
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message === "Invalid orderId") {
      return badRequest("Invalid orderId")
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load order detail",
        },
      },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const orderId = await normalizeOrderId(context)
    const body = (await request.json()) as unknown

    if (!body || typeof body !== "object") {
      return badRequest("Request body must be a JSON object")
    }

    const input = body as Record<string, unknown>
    const allowedKeys = new Set([
      "bookerName",
      "bookerEmail",
      "bookingRef",
      "normalizedStatus",
      "totalAmountMinor",
      "orderedAt",
    ])

    for (const key of Object.keys(input)) {
      if (!allowedKeys.has(key)) {
        return badRequest(
          `Unexpected field '${key}'. Allowed fields: bookerName, bookerEmail, bookingRef, normalizedStatus, totalAmountMinor, orderedAt.`
        )
      }
    }

    const updateData: {
      bookerName?: string | null
      bookerEmail?: string | null
      bookingRef?: string | null
      normalizedStatus?: "paid" | "refunded" | "cancelled" | "pending"
      totalAmountMinor?: number | null
      orderedAt?: number | null
    } = {}

    if ("bookerName" in input) {
      updateData.bookerName = parseOptionalString(input.bookerName, "bookerName")
    }

    if ("bookerEmail" in input) {
      updateData.bookerEmail = parseOptionalString(
        input.bookerEmail,
        "bookerEmail"
      )
    }

    if ("bookingRef" in input) {
      updateData.bookingRef = parseOptionalString(input.bookingRef, "bookingRef")
    }

    if ("normalizedStatus" in input) {
      updateData.normalizedStatus = parseNormalizedStatus(input.normalizedStatus)
    }

    if ("totalAmountMinor" in input) {
      updateData.totalAmountMinor = parseTotalAmountMinor(input.totalAmountMinor)
    }

    if ("orderedAt" in input) {
      updateData.orderedAt = parseOrderedAt(input.orderedAt)
    }

    if (Object.keys(updateData).length === 0) {
      return badRequest(
        "No valid fields to update. Allowed fields: bookerName, bookerEmail, bookingRef, normalizedStatus, totalAmountMinor, orderedAt"
      )
    }

    await convexMutation(api.orders.updateOrderDetails, {
      orderId: orderId as Id<"orders">,
      ...updateData,
    })

    const detail = await convexQuery(api.orders.getOrderWithAttendees, {
      orderId: orderId as Id<"orders">,
    })

    if (!detail) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Order not found",
          },
        },
        { status: 404 }
      )
    }

    return NextResponse.json(detail)
  } catch (error) {
    console.error("Error updating order detail:", error)
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message === "Invalid orderId") {
      return badRequest("Invalid orderId")
    }

    if (message.startsWith("Invalid")) {
      return badRequest(message)
    }

    if (message.includes("not found")) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Order not found",
          },
        },
        { status: 404 }
      )
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to update order",
        },
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { orderId } = await params

  const order = await convexQuery(api.orders.getOrderWithAttendees, {
    orderId: orderId as Id<"orders">,
  })

  if (!order) {
    return NextResponse.json(
      { error: { message: "Order not found." } },
      { status: 404 }
    )
  }

  if (!order.order.isArchived && order.order.normalizedStatus !== "cancelled") {
    return NextResponse.json(
      {
        error: {
          message:
            "Only archived or cancelled orders can be removed from local records.",
        },
      },
      { status: 400 }
    )
  }

  const assignedPayments = await convexQuery(api.payments.getPayments, {
    orderId: order.order.id,
  })

  if (assignedPayments.length > 0) {
    return NextResponse.json(
      {
        error: {
          message:
            "Orders with assigned payments cannot be removed from local records.",
        },
      },
      { status: 400 }
    )
  }

  await convexMutation(api.orders.removeOrderLocally, {
    orderId: order.order.id,
    reason: "removed_by_user",
  })

  return NextResponse.json({ ok: true })
}
