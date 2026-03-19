import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"

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
  totals: {
    grossMinor: number
    paidMinor: number
    refundedMinor: number
    netMinor: number
  }
  statusCounts: Record<CanonicalStatus, number>
  trend: Array<{
    bucket: string
    grossMinor: number
    paidMinor: number
    refundedMinor: number
    netMinor: number
    orderCount: number
  }>
}

const DAY_MS = 24 * 60 * 60 * 1000

function parseDateInput(value: Date | string | null | undefined, field: "from" | "to") {
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
    throw new Error("Invalid date range. 'from' must be less than or equal to 'to'.")
  }

  return { from, to }
}

export async function getRevenueOverview(filters: RevenueOverviewFilters = {}): Promise<RevenueOverview> {
  const eventId = typeof filters.eventId === "string" && filters.eventId.trim() ? filters.eventId.trim() : null
  const trendGranularity = filters.trendGranularity ?? "day"
  const { from, to } = normalizeRange(filters)

  const whereClause: Prisma.TicketTailorOrderWhereInput = {
    orderedAt: {
      gte: from,
      lte: to,
    },
    ...(eventId ? { providerEventId: eventId } : {}),
  }

  const [orders, groupedStatuses] = await Promise.all([
    prisma.ticketTailorOrder.findMany({
      where: whereClause,
      select: {
        orderedAt: true,
        normalizedStatus: true,
        totalAmountMinor: true,
      },
    }),
    prisma.ticketTailorOrder.groupBy({
      by: ["normalizedStatus"],
      where: whereClause,
      _count: {
        _all: true,
      },
    }),
  ])

  const statusCounts: Record<CanonicalStatus, number> = {
    paid: 0,
    refunded: 0,
    cancelled: 0,
    pending: 0,
  }

  for (const groupedStatus of groupedStatuses) {
    const key = groupedStatus.normalizedStatus as CanonicalStatus
    statusCounts[key] = groupedStatus._count._all
  }

  const trendMap = new Map<
    string,
    {
      grossMinor: number
      paidMinor: number
      refundedMinor: number
      netMinor: number
      orderCount: number
    }
  >()

  let grossMinor = 0
  let paidMinor = 0
  let refundedMinor = 0

  for (const order of orders) {
    if (!order.orderedAt) {
      continue
    }

    const amountMinor = order.totalAmountMinor ?? 0
    const bucket = trendGranularity === "day" ? toUtcDayBucket(order.orderedAt) : toUtcDayBucket(order.orderedAt)

    const current = trendMap.get(bucket) ?? {
      grossMinor: 0,
      paidMinor: 0,
      refundedMinor: 0,
      netMinor: 0,
      orderCount: 0,
    }

    current.grossMinor += amountMinor
    current.orderCount += 1

    if (order.normalizedStatus === "paid") {
      current.paidMinor += amountMinor
      paidMinor += amountMinor
    }

    if (order.normalizedStatus === "refunded") {
      current.refundedMinor += amountMinor
      refundedMinor += amountMinor
    }

    current.netMinor = current.paidMinor - current.refundedMinor

    grossMinor += amountMinor
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
    totals: {
      grossMinor,
      paidMinor,
      refundedMinor,
      netMinor,
    },
    statusCounts,
    trend,
  }
}
