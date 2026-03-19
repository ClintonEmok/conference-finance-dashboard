import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"

import type { CanonicalOrderStatus } from "@/lib/domain/finance/order-ledger"

export type ReconciliationFilters = {
  eventId?: string | null
  from?: Date | string | null
  to?: Date | string | null
  status?: CanonicalOrderStatus | null
}

export type ReconciliationReason =
  | "pending-payment"
  | "cancelled-with-amount"
  | "missing-amount"
  | "refund-without-refunded-at"

export type ReconciliationRow = {
  providerOrderId: string
  providerEventId: string
  eventName: string | null
  normalizedStatus: CanonicalOrderStatus
  totalAmountMinor: number
  currency: string | null
  orderedAt: string | null
  refundedAt: string | null
  outstandingMinor: number
  reasons: ReconciliationReason[]
}

export type ReconciliationResult = {
  generatedAt: string
  filters: {
    eventId: string | null
    from: string
    to: string
    status: CanonicalOrderStatus | null
  }
  totals: {
    rows: number
    outstandingMinor: number
  }
  rows: ReconciliationRow[]
}

const DAY_MS = 24 * 60 * 60 * 1000

function parseDate(value: Date | string | null | undefined, field: "from" | "to") {
  if (!value) {
    return null
  }

  const parsed = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid '${field}' date. Provide an ISO-8601 date string.`)
  }

  return parsed
}

function normalizeRange(filters: ReconciliationFilters) {
  const now = new Date()
  const to = parseDate(filters.to, "to") ?? now
  const from = parseDate(filters.from, "from") ?? new Date(to.getTime() - 29 * DAY_MS)

  if (from.getTime() > to.getTime()) {
    throw new Error("Invalid date range. 'from' must be less than or equal to 'to'.")
  }

  return { from, to }
}

function deriveReconciliation(order: {
  normalizedStatus: CanonicalOrderStatus
  totalAmountMinor: number | null
  refundedAt: Date | null
}) {
  const amount = order.totalAmountMinor ?? 0
  const reasons: ReconciliationReason[] = []
  let outstandingMinor = 0

  if (order.totalAmountMinor === null) {
    reasons.push("missing-amount")
  }

  if (order.normalizedStatus === "pending") {
    reasons.push("pending-payment")
    outstandingMinor = Math.max(0, amount)
  }

  if (order.normalizedStatus === "cancelled" && amount > 0) {
    reasons.push("cancelled-with-amount")
    outstandingMinor = Math.max(outstandingMinor, amount)
  }

  if (order.normalizedStatus === "refunded" && !order.refundedAt) {
    reasons.push("refund-without-refunded-at")
  }

  return {
    reasons,
    outstandingMinor,
  }
}

export async function getReconciliationRows(
  filters: ReconciliationFilters = {},
): Promise<ReconciliationResult> {
  const eventId = typeof filters.eventId === "string" && filters.eventId.trim() ? filters.eventId.trim() : null
  const status = filters.status ?? null
  const { from, to } = normalizeRange(filters)

  const whereClause: Prisma.TicketTailorOrderWhereInput = {
    orderedAt: {
      gte: from,
      lte: to,
    },
    ...(eventId ? { providerEventId: eventId } : {}),
    ...(status ? { normalizedStatus: status } : {}),
  }

  const orders = await prisma.ticketTailorOrder.findMany({
    where: whereClause,
    include: {
      event: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [{ orderedAt: "desc" }, { createdAt: "desc" }],
  })

  const rows: ReconciliationRow[] = []
  let outstandingMinor = 0

  for (const order of orders) {
    const reconciliation = deriveReconciliation({
      normalizedStatus: order.normalizedStatus as CanonicalOrderStatus,
      totalAmountMinor: order.totalAmountMinor,
      refundedAt: order.refundedAt,
    })

    if (reconciliation.reasons.length === 0) {
      continue
    }

    outstandingMinor += reconciliation.outstandingMinor

    rows.push({
      providerOrderId: order.providerOrderId,
      providerEventId: order.providerEventId,
      eventName: order.event?.name ?? null,
      normalizedStatus: order.normalizedStatus as CanonicalOrderStatus,
      totalAmountMinor: order.totalAmountMinor ?? 0,
      currency: order.currency ?? null,
      orderedAt: order.orderedAt ? order.orderedAt.toISOString() : null,
      refundedAt: order.refundedAt ? order.refundedAt.toISOString() : null,
      outstandingMinor: reconciliation.outstandingMinor,
      reasons: reconciliation.reasons,
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      eventId,
      from: from.toISOString(),
      to: to.toISOString(),
      status,
    },
    totals: {
      rows: rows.length,
      outstandingMinor,
    },
    rows,
  }
}
