import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { assignPaymentToOrder } from "@/lib/domain/finance/payments"

type AssignBody = {
  orderId?: unknown
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

function notFound(message: string) {
  return NextResponse.json(
    {
      error: {
        code: "NOT_FOUND",
        message,
      },
    },
    { status: 404 }
  )
}

function parseRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw new Error(`Invalid '${fieldName}'. Expected a string.`)
  }

  const normalized = value.trim()

  if (!normalized) {
    throw new Error(`Invalid '${fieldName}'. Value is required.`)
  }

  return normalized
}

function parseAssignBody(body: AssignBody) {
  return {
    orderId: parseRequiredString(body.orderId, "orderId"),
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { id: paymentId } = await params

  if (!paymentId) {
    return badRequest("Invalid 'id'. Payment ID is required.")
  }

  let payload: AssignBody

  try {
    payload = (await request.json()) as AssignBody
  } catch {
    return badRequest("Request body must be valid JSON")
  }

  try {
    const input = parseAssignBody(payload)
    const payment = await assignPaymentToOrder(
      paymentId,
      input,
      authResult.userId
    )

    return NextResponse.json({
      ok: true,
      payment,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message.includes("not found")) {
      return notFound(message)
    }

    if (message.startsWith("Invalid") || message.includes("required")) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to assign payment to order",
        },
      },
      { status: 500 }
    )
  }
}
