import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import {
  buildOrderLedgerCsv,
  getOrderLedger,
  type CanonicalOrderStatus,
} from "@/lib/domain/finance/order-ledger"

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

function parseOptionalString(value: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function slugifyForFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

function parseFilters(request: Request) {
  const params = new URL(request.url).searchParams
  const eventIdParam = params.get("eventId")
  const statusParam = params.get("status")
  const locationParam = params.get("location")

  const eventId = eventIdParam && eventIdParam.trim() ? eventIdParam.trim() : null
  const from = parseOptionalDate(params.get("from"), "from")
  const to = parseOptionalDate(params.get("to"), "to")
  const status = statusParam && statusParam.trim() ? statusParam.trim().toLowerCase() : null
  const location = parseOptionalString(locationParam)

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
    location,
  }
}

function buildFilename(filters: { eventId: string | null; status: CanonicalOrderStatus | null; location: string | null }) {
  const datePart = new Date().toISOString().slice(0, 10)
  const eventPart = filters.eventId ? `event-${filters.eventId}` : "all-events"
  const statusPart = filters.status ? `status-${filters.status}` : "all-statuses"
  const locationPart = filters.location
    ? `location-${slugifyForFilename(filters.location) || "custom"}`
    : "all-locations"

  return `orders-${eventPart}-${statusPart}-${locationPart}-${datePart}.csv`
}

export async function GET(request: Request) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const filters = parseFilters(request)
    const ledger = await getOrderLedger({
      ...filters,
      page: 1,
      pageSize: 200,
    })

    const csv = buildOrderLedgerCsv(ledger.rows)
    const filename = buildFilename({ eventId: filters.eventId, status: filters.status, location: filters.location })

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Applied-Filters": JSON.stringify(ledger.filters),
      },
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
          message: "Failed to export orders CSV",
        },
      },
      { status: 500 },
    )
  }
}
