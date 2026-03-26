import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { convexQuery } from "@/lib/convex/server"

export async function GET() {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
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
