import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { convexQuery } from "@/lib/convex/server"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return NextResponse.json(
      { error: { message: "Unauthorized" } },
      { status: 401 }
    )
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

  const result = await convexQuery<
    { providerOrderId: string; providerEventId: string },
    {
      order: {
        id: string
        providerOrderId: string
        normalizedStatus: string | undefined
        totalAmountMinor: number | undefined
        orderedAt: string | null
      }
      attendees: Array<{
        id: string
        name: string
        ticketTypeLabel: string
        normalizedStatus: string
      }>
    } | null
  >("orders:getOrderWithAttendeesByProviderId", {
    providerOrderId: orderId,
    providerEventId: eventId,
  })

  if (!result) {
    return NextResponse.json(
      { error: { message: "Order not found." } },
      { status: 404 }
    )
  }

  return NextResponse.json(result)
}
