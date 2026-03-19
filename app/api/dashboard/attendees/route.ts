import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { getAttendeeLedger } from "@/lib/domain/finance/attendees"

export const dynamic = "force-dynamic"

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

function parsePositiveInteger(value: string | null, field: "page" | "pageSize") {
  if (!value || !value.trim()) {
    return null
  }

  const numeric = Number(value)

  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`Invalid '${field}'. Provide a positive integer.`)
  }

  return numeric
}

function parseAttendeeFilters(request: Request) {
  const params = new URL(request.url).searchParams
  const eventIdParam = params.get("eventId")
  const searchParam = params.get("search")

  const eventId = eventIdParam && eventIdParam.trim() ? eventIdParam.trim() : null
  const search = searchParam && searchParam.trim() ? searchParam.trim() : null
  const from = parseOptionalDate(params.get("from"), "from")
  const to = parseOptionalDate(params.get("to"), "to")
  const page = parsePositiveInteger(params.get("page"), "page")
  const pageSize = parsePositiveInteger(params.get("pageSize"), "pageSize")

  if (from && to && from.getTime() > to.getTime()) {
    throw new Error("Invalid date range. 'from' must be less than or equal to 'to'.")
  }

  return {
    eventId,
    from,
    to,
    search,
    page: page ?? undefined,
    pageSize: pageSize ?? undefined,
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
    const filters = parseAttendeeFilters(request)
    const ledger = await getAttendeeLedger(filters)

    return NextResponse.json({
      generatedAt: ledger.generatedAt,
      filters: ledger.filters,
      page: ledger.page,
      rows: ledger.rows,
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
          message: "Failed to load attendees",
        },
      },
      { status: 500 },
    )
  }
}
