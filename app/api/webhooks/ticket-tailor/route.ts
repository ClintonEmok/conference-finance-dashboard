import { NextResponse } from "next/server"

import {
  ingestTicketTailorWebhook,
  processTicketTailorWebhookEvent,
  verifyTicketTailorWebhook,
} from "@/lib/integrations/ticket-tailor/webhook"
import { enforceRateLimit } from "@/lib/rate-limit"

export async function POST(request: Request) {
  const rateLimited = enforceRateLimit(request, "webhook:ticket-tailor", {
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (rateLimited) return rateLimited

  const rawBody = await request.text()

  if (!verifyTicketTailorWebhook(request.headers, rawBody)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_SIGNATURE",
          message: "Webhook signature verification failed",
        },
      },
      { status: 401 }
    )
  }

  let payload: unknown

  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "BAD_PAYLOAD",
          message: "Webhook body must be valid JSON",
        },
      },
      { status: 400 }
    )
  }

  const ingestResult = await ingestTicketTailorWebhook(request.headers, payload)
  const processResult = await processTicketTailorWebhookEvent(
    ingestResult.eventId
  )

  return NextResponse.json({
    accepted: true,
    duplicate: ingestResult.duplicate,
    providerEventId: ingestResult.providerEventId,
    eventId: ingestResult.eventId,
    processing: processResult,
  })
}
