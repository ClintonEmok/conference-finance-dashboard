import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { convexQuery } from "@/lib/convex/server"

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
      { status: 401 }
    )
  }

  const events = await convexQuery<
    {},
    Array<{
      _id: string
      providerEventId: string
      eventType: string
      status?: "pending" | "processed" | "failed"
      deliveryCount?: number
      attempts?: number
      lastError?: string
      nextRetryAt?: number
      canonicalFetchedAt?: number
      processedAt?: number
      receivedAt?: number
      lastReceivedAt?: number
    }>
  >("sync:getWebhookEvents", {})

  return NextResponse.json({
    count: events.length,
    events,
  })
}
