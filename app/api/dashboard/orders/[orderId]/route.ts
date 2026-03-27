import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { convexMutation, convexQuery } from "@/lib/convex/server"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { orderId } = await params
  const params$ = new URL(request.url).searchParams
  const eventId = params$.get("eventId")

  if (!eventId) {
    return NextResponse.json(
      { error: { message: "Missing required 'eventId' query parameter." } },
      { status: 400 }
    )
  }

  const result = await convexQuery(
    api.orders.getOrderWithAttendeesByProviderId,
    {
      providerOrderId: orderId,
      providerEventId: eventId,
    }
  )

  if (!result) {
    return NextResponse.json(
      { error: { message: "Order not found." } },
      { status: 404 }
    )
  }

  return NextResponse.json(result)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { orderId } = await params
  const params$ = new URL(request.url).searchParams
  const eventId = params$.get("eventId")

  if (!eventId) {
    return NextResponse.json(
      { error: { message: "Missing required 'eventId' query parameter." } },
      { status: 400 }
    )
  }

  const order = await convexQuery(
    api.orders.getOrderWithAttendeesByProviderId,
    {
      providerOrderId: orderId,
      providerEventId: eventId,
    }
  )

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
