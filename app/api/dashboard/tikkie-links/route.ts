import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import {
  createTikkiePaymentLink,
  listTikkiePaymentLinksByOrder,
  normalizeProviderIdentifier,
  refreshTikkiePaymentLinkStatus,
  validateCreateTikkiePaymentLinkInput,
} from "@/lib/domain/finance/tikkie-links"
import {
  enforceTikkieMonthlyCreationQuota,
  getTikkieMonthlyCreationQuotaStatus,
  TikkieMonthlyQuotaExceededError,
} from "@/lib/domain/finance/tikkie-quota"
import { TikkieApiError } from "@/lib/integrations/tikkie/client"
import { enforceRateLimit } from "@/lib/rate-limit"

type CreateBody = {
  providerOrderId?: unknown
  providerEventId?: unknown
  amountMinor?: unknown
  description?: unknown
  expiryDate?: unknown
  referenceId?: unknown
}

function badRequest(message: string) {
  return NextResponse.json(
    {
      error: {
        code: "BAD_REQUEST",
        message,
      },
    },
    { status: 400 }
  )
}

function unauthorized() {
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

function parseRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw new Error(`Invalid '${fieldName}'. Expected a string.`)
  }

  const normalized = value.trim()

  if (!normalized) {
    throw new Error(`Invalid '${fieldName}'. Value is required.`)
  }

  return normalized
}

function parseOptionalString(value: unknown, fieldName: string) {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value !== "string") {
    throw new Error(`Invalid '${fieldName}'. Expected a string.`)
  }

  const normalized = value.trim()
  return normalized || null
}

function parseAmountMinor(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(
      "Invalid 'amountMinor'. Expected a positive integer in cents."
    )
  }

  return value
}

function parseCreateBody(body: CreateBody) {
  return validateCreateTikkiePaymentLinkInput({
    providerOrderId: parseRequiredString(
      body.providerOrderId,
      "providerOrderId"
    ),
    providerEventId: parseRequiredString(
      body.providerEventId,
      "providerEventId"
    ),
    description: parseRequiredString(body.description, "description"),
    expiryDate: parseRequiredString(body.expiryDate, "expiryDate"),
    referenceId: parseOptionalString(body.referenceId, "referenceId"),
    amountMinor: parseAmountMinor(body.amountMinor),
  })
}

export async function GET(request: Request) {
  const rateLimited = enforceRateLimit(request, "dashboard:tikkie-links:get")
  if (rateLimited) return rateLimited

  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const url = new URL(request.url)
  const providerOrderIdParam = url.searchParams.get("providerOrderId")

  if (!providerOrderIdParam) {
    return badRequest("Invalid 'providerOrderId'. Value is required.")
  }

  try {
    const providerOrderId = normalizeProviderIdentifier(
      providerOrderIdParam,
      "providerOrderId"
    )
    const shouldRefresh = ["1", "true", "yes"].includes(
      (url.searchParams.get("refresh") ?? "").toLowerCase()
    )

    if (shouldRefresh) {
      const linksForRefresh = await listTikkiePaymentLinksByOrder({
        providerOrderId,
      })

      for (const link of linksForRefresh.links) {
        if (link.status === "created") {
          await refreshTikkiePaymentLinkStatus({
            paymentRequestToken: link.paymentRequestToken,
            source: "poll",
            reason: "dashboard-row-refresh",
          })
        }
      }
    }

    const links = await listTikkiePaymentLinksByOrder({
      providerOrderId,
    })

    return NextResponse.json({
      ...links,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"
    return badRequest(message)
  }
}

export async function POST(request: Request) {
  const rateLimited = enforceRateLimit(request, "dashboard:tikkie-links:post")
  if (rateLimited) return rateLimited

  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  let payload: CreateBody

  try {
    payload = (await request.json()) as CreateBody
  } catch {
    return badRequest("Request body must be valid JSON")
  }

  try {
    const input = parseCreateBody(payload)
    const quotaBefore = await enforceTikkieMonthlyCreationQuota()
    const result = await createTikkiePaymentLink(input)
    const quotaAfter = result.created
      ? await getTikkieMonthlyCreationQuotaStatus()
      : quotaBefore

    return NextResponse.json(
      {
        ok: true,
        created: result.created,
        link: result.link,
        quota: {
          before: quotaBefore,
          after: quotaAfter,
        },
      },
      { status: result.created ? 201 : 200 }
    )
  } catch (error) {
    if (error instanceof TikkieMonthlyQuotaExceededError) {
      return NextResponse.json(
        {
          error: {
            code: "TIKKIE_QUOTA_EXCEEDED",
            message: error.message,
          },
          quota: error.quota,
        },
        { status: 429 }
      )
    }

    if (error instanceof TikkieApiError) {
      const code =
        error.kind === "BAD_REQUEST"
          ? "TIKKIE_BAD_REQUEST"
          : error.kind === "UNAUTHORIZED"
            ? "TIKKIE_UNAUTHORIZED"
            : error.kind === "FORBIDDEN"
              ? "TIKKIE_FORBIDDEN"
              : "TIKKIE_UPSTREAM_ERROR"

      return NextResponse.json(
        {
          error: {
            code,
            message: error.message,
          },
          diagnostics: {
            status: error.status,
            details: error.details,
          },
        },
        {
          status: error.status >= 500 ? 502 : error.status,
        }
      )
    }

    const message = error instanceof Error ? error.message : "Invalid request"

    if (
      message.startsWith("Invalid") ||
      message.includes("required") ||
      message.includes("not found")
    ) {
      return badRequest(message)
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create Tikkie payment link",
        },
      },
      { status: 500 }
    )
  }
}
