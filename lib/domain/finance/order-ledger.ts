import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"

export type CanonicalOrderStatus = "paid" | "refunded" | "cancelled" | "pending"

export type OrderLedgerFilters = {
  eventId?: string | null
  from?: Date | string | null
  to?: Date | string | null
  status?: CanonicalOrderStatus | null
  location?: string | null
  page?: number
  pageSize?: number
}

export type OrderLedgerRow = {
  orderId: string
  providerOrderId: string | null
  eventId: string
  eventSlug: string
  eventTitle: string | null
  normalizedStatus: CanonicalOrderStatus
  isArchived: boolean
  archivedAt: string | null
  archiveReason: string | null
  amountDueMinor: number | null
  totalAmountMinor: number | null
  currency: string | null
  orderedAt: string | null
  buyerName: string | null
  buyerEmail: string | null
}

export type OrderLedgerResult = {
  generatedAt: string
  filters: {
    eventId: string | null
    from: string | null
    to: string | null
    status: CanonicalOrderStatus | null
    location: string | null
    page: number
    pageSize: number
  }
  availableEvents: Array<{
    eventId: string
    slug: string
    title: string | null
    startsAt: string | null
    currency: string | null
  }>
  page: {
    number: number
    size: number
    totalRows: number
    totalPages: number
  }
  totals: {
    amountDueMinor: number
    matchedAmountMinor: number
    outstandingAmountMinor: number
  }
  rows: OrderLedgerRow[]
}

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 200

function parseDate(
  value: Date | string | null | undefined,
  field: "from" | "to"
) {
  if (!value) {
    return null
  }

  const parsed = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid '${field}' date. Provide an ISO-8601 date string.`)
  }

  return parsed
}

function normalizeRange(filters: OrderLedgerFilters) {
  const to = parseDate(filters.to, "to")
  const from = parseDate(filters.from, "from")

  if (!from && !to) {
    return { from: null, to: null }
  }

  const rangeFrom = from ?? new Date(0)
  const rangeTo = to ?? new Date()

  if (rangeFrom.getTime() > rangeTo.getTime()) {
    throw new Error(
      "Invalid date range. 'from' must be less than or equal to 'to'."
    )
  }

  return { from, to }
}

function normalizePagination(page?: number, pageSize?: number) {
  const safePage = Number.isFinite(page)
    ? Math.max(DEFAULT_PAGE, Math.floor(page as number))
    : DEFAULT_PAGE
  const safePageSize = Number.isFinite(pageSize)
    ? Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(pageSize as number)))
    : DEFAULT_PAGE_SIZE

  return {
    page: safePage,
    pageSize: safePageSize,
  }
}

function escapeCsvCell(value: string | number | boolean | null) {
  if (value === null || value === undefined) {
    return ""
  }

  const raw = String(value)

  if (raw.includes(",") || raw.includes("\n") || raw.includes('"')) {
    return `"${raw.replace(/"/g, '""')}"`
  }

  return raw
}

export async function getOrderLedger(
  filters: OrderLedgerFilters = {}
): Promise<OrderLedgerResult> {
  const eventId =
    typeof filters.eventId === "string" && filters.eventId.trim()
      ? filters.eventId.trim()
      : null
  const status = filters.status ?? null
  const location =
    typeof filters.location === "string" && filters.location.trim()
      ? filters.location.trim()
      : null
  const { from, to } = normalizeRange(filters)
  const { page, pageSize } = normalizePagination(filters.page, filters.pageSize)

  const fromMs = from?.getTime()
  const toMs = to?.getTime()

  const [ordersResult, availableEvents] = await Promise.all([
    convexQuery(api.orders.getOrdersWithFilters, {
      eventId: eventId ?? undefined,
      from: fromMs,
      to: toMs,
      status: status ?? undefined,
      location: location ?? undefined,
      page,
      pageSize,
    }),
    convexQuery(api.events.getEventsForLedger, {}),
  ])

  const typedOrdersResult = ordersResult as typeof ordersResult & {
    totals: {
      amountDueMinor: number
      matchedAmountMinor: number
      outstandingAmountMinor: number
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      eventId,
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      status,
      location,
      page,
      pageSize,
    },
    availableEvents: availableEvents.map((e) => ({
      eventId: e.eventId,
      slug: e.slug,
      title: e.title ?? null,
      startsAt: e.startsAt ? new Date(e.startsAt).toISOString() : null,
      currency: e.currency ?? null,
    })),
    page: {
      number: page,
      size: pageSize,
      totalRows: ordersResult.totalRows,
      totalPages: ordersResult.totalPages,
    },
    totals: typedOrdersResult.totals,
    rows: ordersResult.orders.map((row) => {
      const typedRow = row as typeof row & {
        amountDueMinor?: number | null
      }

      return {
        ...typedRow,
        orderId: typedRow.orderId ?? "",
        amountDueMinor: typedRow.amountDueMinor ?? null,
      }
    }),
  }
}

export function buildOrderLedgerCsv(rows: OrderLedgerRow[]) {
  const headers = [
    "orderId",
    "eventId",
    "eventSlug",
    "eventTitle",
    "normalizedStatus",
    "isArchived",
    "archivedAt",
    "archiveReason",
    "amountDueMinor",
    "totalAmountMinor",
    "currency",
    "orderedAt",
    "buyerName",
    "buyerEmail",
  ]

  const lines = [headers.join(",")]

  for (const row of rows) {
    lines.push(
      [
        row.orderId,
        row.eventId,
        row.eventSlug,
        row.eventTitle,
        row.normalizedStatus,
        row.isArchived,
        row.archivedAt,
        row.archiveReason,
        row.amountDueMinor,
        row.totalAmountMinor,
        row.currency,
        row.orderedAt,
        row.buyerName,
        row.buyerEmail,
      ]
        .map((cell) => escapeCsvCell(cell))
        .join(",")
    )
  }

  return `${lines.join("\n")}\n`
}
