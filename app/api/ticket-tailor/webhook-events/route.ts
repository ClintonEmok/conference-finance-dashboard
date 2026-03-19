import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      },
      { status: 401 },
    )
  }

  const events = await prisma.ticketTailorWebhookEvent.findMany({
    orderBy: {
      receivedAt: "desc",
    },
    take: 25,
    select: {
      id: true,
      providerEventId: true,
      eventType: true,
      status: true,
      deliveryCount: true,
      attempts: true,
      lastError: true,
      nextRetryAt: true,
      canonicalFetchedAt: true,
      processedAt: true,
      receivedAt: true,
      lastReceivedAt: true,
    },
  })

  return NextResponse.json({
    count: events.length,
    events,
  })
}
