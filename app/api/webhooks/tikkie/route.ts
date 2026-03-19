import { NextResponse } from "next/server"

import {
  processTikkieWebhookNotification,
  verifyTikkieWebhook,
} from "@/lib/integrations/tikkie/webhook"

function badPayload(message: string) {
  return NextResponse.json(
    {
      error: {
        code: "BAD_PAYLOAD",
        message,
      },
    },
    { status: 400 },
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
    { status: 401 },
  )
}

export async function POST(request: Request) {
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

    return NextResponse.json(
      {
        ...result,
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook payload"

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
      { status: 500 },
    )
  }
}
