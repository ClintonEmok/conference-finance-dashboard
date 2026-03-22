import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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

  const order = await prisma.ticketTailorOrder.findFirst({
    where: {
      OR: [{ providerOrderId: orderId }, { id: orderId }],
      providerEventId: eventId,
    },
    select: {
      id: true,
      providerOrderId: true,
      normalizedStatus: true,
      totalAmountMinor: true,
      orderedAt: true,
      attendees: {
        select: {
          id: true,
          name: true,
          ticketTypeLabel: true,
          ticketStatus: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!order) {
    return NextResponse.json(
      { error: { message: "Order not found." } },
      { status: 404 }
    )
  }

  return NextResponse.json({
    order: {
      id: order.id,
      providerOrderId: order.providerOrderId,
      normalizedStatus: order.normalizedStatus,
      totalAmountMinor: order.totalAmountMinor,
      orderedAt: order.orderedAt?.toISOString() ?? null,
    },
    attendees: order.attendees.map((a) => ({
      id: a.id,
      name: a.name ?? "Unnamed attendee",
      ticketTypeLabel: a.ticketTypeLabel ?? "-",
      normalizedStatus: a.ticketStatus ?? "pending",
    })),
  })
}
