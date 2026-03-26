import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { getRevenueOverview } from "@/lib/domain/finance/reporting"

function parseOptionalIsoDate(value: string | null, field: "from" | "to") {
  if (!value || !value.trim()) {
    return null
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid '${field}' date. Provide an ISO-8601 date string.`)
  }

  return parsed
}

function parseRevenueQuery(request: Request) {
  const searchParams = new URL(request.url).searchParams

  const eventIdParam = searchParams.get("eventId")
  const eventId = eventIdParam && eventIdParam.trim() ? eventIdParam.trim() : null
  const from = parseOptionalIsoDate(searchParams.get("from"), "from")
  const to = parseOptionalIsoDate(searchParams.get("to"), "to")

  if (from && to && from.getTime() > to.getTime()) {
    throw new Error("Invalid date range. 'from' must be less than or equal to 'to'.")
  }

  return {
    eventId,
    from,
    to,
  }
}

export async function GET(request: Request) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const filters = parseRevenueQuery(request)
    const overview = await getRevenueOverview(filters)

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      filters: overview.appliedFilters,
      availableEvents: overview.availableEvents,
      totals: overview.totals,
      statusCounts: overview.statusCounts,
      trend: overview.trend,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"

    if (message.startsWith("Invalid") || message.includes("must be")) {
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
          message: "Failed to load revenue overview",
        },
      },
      { status: 500 },
    )
  }
}
