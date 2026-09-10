import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convexMutation } from "@/lib/convex/server"

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

export async function DELETE(
  _request: Request,
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

  try {
    await convexMutation(api.payments.deletePayment, {
      paymentId: paymentId as Id<"payments">,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message.includes("not found")) {
      return notFound("Payment not found")
    }

    if (message.startsWith("Only")) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to delete payment",
        },
      },
      { status: 500 }
    )
  }
}