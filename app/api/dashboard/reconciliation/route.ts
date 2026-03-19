import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { getReconciliationRows } from "@/lib/domain/finance/reconciliation"
import type { CanonicalOrderStatus } from "@/lib/domain/finance/order-ledger"

const allowedStatuses = new Set<CanonicalOrderStatus>(["paid", "refunded", "cancelled", "pending"])

function parseOptionalDate(value: string | null, field: "from" | "to") {
  if (!value || !value.trim()) {
    return null
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid '${field}' date. Provide an ISO-8601 date string.`)
  }

  return parsed
}

function parseFilters(request: Request) {
  const params = new URL(request.url).searchParams
  const eventIdParam = params.get("eventId")
  const statusParam = params.get("status")

  const eventId = eventIdParam && eventIdParam.trim() ? eventIdParam.trim() : null
  const from = parseOptionalDate(params.get("from"), "from")
  const to = parseOptionalDate(params.get("to"), "to")
  const status = statusParam && statusParam.trim() ? statusParam.trim().toLowerCase() : null

  if (status && !allowedStatuses.has(status as CanonicalOrderStatus)) {
    throw new Error("Invalid 'status'. Expected one of: paid, refunded, cancelled, pending.")
  }

  if (from && to && from.getTime() > to.getTime()) {
    throw new Error("Invalid date range. 'from' must be less than or equal to 'to'.")
  }

  return {
    eventId,
    from,
    to,
    status: (status as CanonicalOrderStatus | null) ?? null,
  }
}

export async function GET(request: Request) {
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

  try {
    const filters = parseFilters(request)
    const payload = await getReconciliationRows(filters)

    return NextResponse.json({
      generatedAt: payload.generatedAt,
      filters: payload.filters,
      totals: payload.totals,
      rows: payload.rows,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message.startsWith("Invalid") || message.includes("Expected one of") || message.includes("must be")) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message,
          },
        },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load reconciliation data",
        },
      },
      { status: 500 },
    )
  }
}
