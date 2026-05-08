import { NextResponse } from "next/server"

import {
  processTikkieWebhookNotification,
  verifyTikkieWebhook,
} from "@/lib/integrations/tikkie/webhook"
import { fetchAndStoreTikkiePayments } from "@/lib/domain/finance/tikkie-event-payments"
import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"
import { enforceRateLimit } from "@/lib/rate-limit"

function badPayload(message: string) {
  return NextResponse.json(
    {
      error: {
        code: "BAD_PAYLOAD",
        message,
      },
    },
    { status: 400 }
  )
}

function invalidSignature() {
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

export async function POST(request: Request) {
  const rateLimited = enforceRateLimit(request, "webhook:tikkie", {
    maxRequests: 120,
    windowMs: 60_000,
  })
  if (rateLimited) return rateLimited

  const rawBody = await request.text()

  if (!verifyTikkieWebhook(request.headers, rawBody)) {
    return invalidSignature()
  }

  let payload: unknown

  try {
    payload = JSON.parse(rawBody)
  } catch {
    return badPayload("Webhook body must be valid JSON")
  }

  try {
    const result = await processTikkieWebhookNotification(payload)

    // For event-level links, also fetch individual payments
    if (!result.missing && result.changed) {
      const link = await convexQuery(api.tikkie.getPaymentLinkByToken, {
        paymentRequestToken: result.paymentRequestToken,
      })
      if (link && (link as Record<string, unknown>).linkType === "event") {
        await fetchAndStoreTikkiePayments(
          (link as Record<string, unknown>)._id as string,
          result.paymentRequestToken
        )
      }
    }

    return NextResponse.json(
      {
        ...result,
      },
      { status: 200 }
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid webhook payload"

    if (message.startsWith("Invalid webhook payload")) {
      return badPayload(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to process Tikkie webhook",
        },
      },
      { status: 500 }
    )
  }
}
