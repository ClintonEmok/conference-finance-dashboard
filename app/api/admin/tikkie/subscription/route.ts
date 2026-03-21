import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { getTikkieConfig } from "@/lib/integrations/tikkie/config"
import { subscribePaymentRequestNotifications } from "@/lib/integrations/tikkie/client"

export async function POST(_request: Request) {
  // Authenticate request
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

  // Check if subscription setup is enabled
  const config = getTikkieConfig()

  if (!config.values.subscriptionSetupEnabled) {
    return NextResponse.json(
      {
        error: {
          code: "SUBSCRIPTION_SETUP_DISABLED",
          message:
            "Subscription setup is not enabled. Set TIKKIE_SUBSCRIPTION_SETUP_ENABLED=true to activate.",
        },
      },
      { status: 403 }
    )
  }

  // Validate callback URL is configured
  const callbackUrl = config.values.webhookCallbackUrl
  if (!callbackUrl) {
    return NextResponse.json(
      {
        error: {
          code: "MISSING_CALLBACK_URL",
          message:
            "Webhook callback URL is not configured. Set TIKKIE_WEBHOOK_CALLBACK_URL to your public callback endpoint.",
        },
      },
      { status: 400 }
    )
  }

  // Validate config is valid (API credentials present)
  if (!config.configured) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_CONFIGURATION",
          message: `Tikkie configuration is invalid: ${config.errors.join(", ")}`,
        },
      },
      { status: 500 }
    )
  }

  try {
    // Call Tikkie API to create subscription
    const subscription = await subscribePaymentRequestNotifications({
      url: callbackUrl,
    })

    return NextResponse.json(
      {
        success: true,
        subscriptionId: subscription.subscriptionId,
        callbackUrl: callbackUrl,
        message:
          "Payment request notification subscription created successfully",
      },
      { status: 201 }
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create subscription"

    // Map specific error types
    if (message.includes("401") || message.includes("UNAUTHORIZED")) {
      return NextResponse.json(
        {
          error: {
            code: "TIKKIE_UNAUTHORIZED",
            message:
              "Tikkie API authentication failed. Verify TIKKIE_API_KEY and TIKKIE_APP_TOKEN.",
          },
        },
        { status: 502 }
      )
    }

    if (message.includes("403") || message.includes("FORBIDDEN")) {
      return NextResponse.json(
        {
          error: {
            code: "TIKKIE_FORBIDDEN",
            message:
              "Tikkie API access denied. Verify the app token has payment request permission.",
          },
        },
        { status: 502 }
      )
    }

    return NextResponse.json(
      {
        error: {
          code: "SUBSCRIPTION_FAILED",
          message: `Failed to create subscription: ${message}`,
        },
      },
      { status: 502 }
    )
  }
}
