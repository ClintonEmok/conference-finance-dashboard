import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"

export type RevenueTrendGranularity = "day"

export type RevenueOverviewFilters = {
  eventId?: string | null
  from?: Date | string | null
  to?: Date | string | null
  trendGranularity?: RevenueTrendGranularity
}

type CanonicalStatus = "paid" | "refunded" | "cancelled" | "pending"

export type RevenueOverview = {
  generatedAt: string
  appliedFilters: {
    eventId: string | null
    from: string
    to: string
    trendGranularity: RevenueTrendGranularity
  }
  availableEvents: Array<{
    eventId: string
    slug: string
    title: string | null
    startsAt: number | null
    currency: string | null
  }>
  totals: {
    orderValueMinor: number
    paidMinor: number
    refundedMinor: number
    netMinor: number
  }
  statusCounts: Record<CanonicalStatus, number>
  trend: Array<{
    bucket: string
    eventLabel: string
    orderValueMinor: number
    paidMinor: number
    refundedMinor: number
    netMinor: number
    orderCount: number
  }>
}

const DAY_MS = 24 * 60 * 60 * 1000

function parseDateInput(
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

function toUtcDayBucket(value: Date) {
  const yyyy = value.getUTCFullYear()
  const mm = String(value.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(value.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function normalizeRange(filters: RevenueOverviewFilters) {
  const now = new Date()
  const requestedFrom = parseDateInput(filters.from, "from")
  const requestedTo = parseDateInput(filters.to, "to")

  const to = requestedTo ?? now
  const from = requestedFrom ?? new Date(to.getTime() - 29 * DAY_MS)

  if (from.getTime() > to.getTime()) {
    throw new Error(
      "Invalid date range. 'from' must be less than or equal to 'to'."
    )
  }

  return { from, to }
}

export async function getRevenueOverview(
  filters: RevenueOverviewFilters = {}
): Promise<RevenueOverview> {
  type RevenueOrderProjection = {
    providerOrderId: string
    eventId: string
    eventSlug: string
    eventTitle: string | null
    normalizedStatus: CanonicalStatus
    amountDueMinor: number | null
    totalAmountMinor: number | null
    currency: string | null
    orderedAt: string | null
    refundedAt: string | null
    buyerName: string | null
    buyerEmail: string | null
  }

  const eventId =
    typeof filters.eventId === "string" && filters.eventId.trim()
      ? filters.eventId.trim()
      : null
  const trendGranularity = filters.trendGranularity ?? "day"
  const { from, to } = normalizeRange(filters)

  const fromMs = from.getTime()
  const toMs = to.getTime()

  const [orders, availableEvents] = (await Promise.all([
    convexQuery(api.orders.getOrdersForReconciliation, {
      eventId: eventId ?? undefined,
      from: fromMs,
      to: toMs,
    }),
    convexQuery(api.events.getEventsForLedger, {}),
  ])) as [
    RevenueOrderProjection[],
    Array<{
      eventId: string
      slug: string
      title: string | null
      startsAt: number | null
      currency: string | null
    }>,
  ]

  const statusCounts: Record<CanonicalStatus, number> = {
    paid: 0,
    refunded: 0,
    cancelled: 0,
    pending: 0,
  }

  for (const order of orders) {
    const key = order.normalizedStatus
    statusCounts[key] = (statusCounts[key] || 0) + 1
  }

  const trendMap = new Map<
    string,
    {
      orderValueMinor: number
      paidMinor: number
      refundedMinor: number
      netMinor: number
      orderCount: number
      eventLabel: string
    }
  >()

  let orderValueMinor = 0
  let paidMinor = 0
  let refundedMinor = 0

  for (const order of orders) {
    if (!order.orderedAt) {
      continue
    }

    const amountMinor = order.amountDueMinor ?? 0
    const bucket =
      trendGranularity === "day"
        ? toUtcDayBucket(new Date(order.orderedAt))
        : toUtcDayBucket(new Date(order.orderedAt))

    const current = trendMap.get(bucket) ?? {
      eventLabel: order.eventTitle?.trim() || order.eventSlug,
      orderValueMinor: 0,
      paidMinor: 0,
      refundedMinor: 0,
      netMinor: 0,
      orderCount: 0,
    }

    current.orderValueMinor += amountMinor
    current.orderCount += 1

    const nextEventLabel = order.eventTitle?.trim() || order.eventSlug
    if (current.eventLabel !== nextEventLabel) {
      current.eventLabel = "Multiple events"
    }

    if (order.normalizedStatus === "paid") {
      current.paidMinor += amountMinor
      paidMinor += amountMinor
    }

    if (order.normalizedStatus === "refunded") {
      current.refundedMinor += amountMinor
      refundedMinor += amountMinor
    }

    current.netMinor = current.paidMinor - current.refundedMinor

    orderValueMinor += amountMinor
    trendMap.set(bucket, current)
  }

  const trend = Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, values]) => ({
      bucket,
      ...values,
    }))

  const netMinor = paidMinor - refundedMinor

  return {
    generatedAt: new Date().toISOString(),
    appliedFilters: {
      eventId,
      from: from.toISOString(),
      to: to.toISOString(),
      trendGranularity,
    },
    availableEvents,
    totals: {
      orderValueMinor,
      paidMinor,
      refundedMinor,
      netMinor,
    },
    statusCounts,
    trend,
  }
}
