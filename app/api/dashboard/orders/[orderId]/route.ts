import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { Id } from "@/convex/_generated/dataModel"
import { convexMutation, convexQuery } from "@/lib/convex/server"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { orderId } = await params

  const result = await convexQuery(api.orders.getOrderWithAttendees, {
    orderId: orderId as Id<"orders">,
  })

  if (!result) {
    return NextResponse.json(
      { error: { message: "Order not found." } },
      { status: 404 }
    )
  }

  return NextResponse.json(result)
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

  await convexMutation(api.orders.removeOrderLocally, {
    orderId: order.order.id,
    reason: "removed_by_user",
  })

  return NextResponse.json({ ok: true })
}
