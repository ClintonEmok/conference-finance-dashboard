import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"

export type CanonicalOrderStatus = "paid" | "refunded" | "cancelled" | "pending"

export type OrderLedgerFilters = {
  eventId?: string | null
  from?: Date | string | null
  to?: Date | string | null
  status?: CanonicalOrderStatus | null
  page?: number
  pageSize?: number
}

export type OrderLedgerRow = {
  providerOrderId: string
  eventId: string
  eventSlug: string
  eventTitle: string | null
  normalizedStatus: CanonicalOrderStatus
  isArchived: boolean
  archivedAt: string | null
  archiveReason: string | null
  totalAmountMinor: number
  currency: string | null
  orderedAt: string | null
  buyerName: string | null
  buyerEmail: string | null
}

export type OrderLedgerResult = {
  generatedAt: string
  filters: {
    eventId: string | null
    from: string
    to: string
    status: CanonicalOrderStatus | null
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
  rows: OrderLedgerRow[]
}

const DAY_MS = 24 * 60 * 60 * 1000
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
  const now = new Date()
  const to = parseDate(filters.to, "to") ?? now
  const from =
    parseDate(filters.from, "from") ?? new Date(to.getTime() - 29 * DAY_MS)

  if (from.getTime() > to.getTime()) {
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
  const { from, to } = normalizeRange(filters)
  const { page, pageSize } = normalizePagination(filters.page, filters.pageSize)

  const fromMs = from.getTime()
  const toMs = to.getTime()

  const [ordersResult, availableEvents] = await Promise.all([
    convexQuery(api.orders.getOrdersWithFilters, {
      eventId: eventId ?? undefined,
      from: fromMs,
      to: toMs,
      status: status ?? undefined,
      page,
      pageSize,
    }),
    convexQuery(api.events.getEventsForLedger, {}),
  ])

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      eventId,
      from: from.toISOString(),
      to: to.toISOString(),
      status,
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
    rows: ordersResult.orders,
  }
}

export function buildOrderLedgerCsv(rows: OrderLedgerRow[]) {
  const headers = [
    "providerOrderId",
    "eventId",
    "eventSlug",
    "eventTitle",
    "normalizedStatus",
    "isArchived",
    "archivedAt",
    "archiveReason",
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
        row.providerOrderId,
        row.eventId,
        row.eventSlug,
        row.eventTitle,
        row.normalizedStatus,
        row.isArchived,
        row.archivedAt,
        row.archiveReason,
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
