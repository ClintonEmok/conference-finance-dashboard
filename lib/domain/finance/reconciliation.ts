import type { CanonicalOrderStatus } from "@/lib/domain/finance/order-ledger"
import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"
import { buildMatchedTotalsByProviderOrderId } from "@/lib/domain/finance/matched-payments"

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
  orderId: string | null
  providerOrderId: string | null
  eventId: string
  eventSlug: string
  eventTitle: string | null
  normalizedStatus: CanonicalOrderStatus
  amountDueMinor: number | null
  totalAmountMinor: number | null
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
  availableEvents: Array<{
    eventId: string
    slug: string
    title: string | null
    startsAt: number | null
    currency: string | null
  }>
  totals: {
    rows: number
    outstandingMinor: number
  }
  rows: ReconciliationRow[]
}

const DAY_MS = 24 * 60 * 60 * 1000

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

function normalizeRange(filters: ReconciliationFilters) {
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

function deriveReconciliation(order: {
  normalizedStatus: CanonicalOrderStatus
  amountDueMinor: number | null
  totalAmountMinor: number | null
  refundedAt: Date | null
  matchedAmountMinor: number
}) {
  const amount = order.amountDueMinor ?? 0
  const remainingAmount = Math.max(0, amount - order.matchedAmountMinor)
  const reasons: ReconciliationReason[] = []
  let outstandingMinor = 0

  if (order.amountDueMinor === null) {
    reasons.push("missing-amount")
  }

  if (order.normalizedStatus === "pending") {
    reasons.push("pending-payment")
    outstandingMinor = remainingAmount
  }

  if (order.normalizedStatus === "cancelled" && amount > 0) {
    reasons.push("cancelled-with-amount")
    outstandingMinor = Math.max(outstandingMinor, remainingAmount)
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
  filters: ReconciliationFilters = {}
): Promise<ReconciliationResult> {
  const eventId =
    typeof filters.eventId === "string" && filters.eventId.trim()
      ? filters.eventId.trim()
      : null
  const status = filters.status ?? null
  const { from, to } = normalizeRange(filters)

  const fromMs = from.getTime()
  const toMs = to.getTime()

  const [orders, availableEvents] = await Promise.all([
    convexQuery(api.orders.getOrdersForReconciliation, {
      eventId: eventId ?? undefined,
      from: fromMs,
      to: toMs,
      status: status ?? undefined,
    }),
    convexQuery(api.events.getEventsForLedger, {}),
  ])

  const matchedTotalsByProviderOrderId =
    await buildMatchedTotalsByProviderOrderId(orders)

  const rows: ReconciliationRow[] = []
  let outstandingMinor = 0

  for (const order of orders) {
    const typedOrder = order as typeof order & {
      amountDueMinor?: number | null
    }

    const providerOrderLookupKey =
      typedOrder.providerOrderId ?? typedOrder.orderId ?? null

    const refundedAtDate = typedOrder.refundedAt
      ? new Date(typedOrder.refundedAt)
      : null

    const reconciliation = deriveReconciliation({
      normalizedStatus: typedOrder.normalizedStatus,
      amountDueMinor:
        typedOrder.amountDueMinor ?? typedOrder.totalAmountMinor ?? null,
      totalAmountMinor: typedOrder.totalAmountMinor,
      refundedAt: refundedAtDate,
      matchedAmountMinor:
        (providerOrderLookupKey
          ? matchedTotalsByProviderOrderId.get(providerOrderLookupKey)
          : undefined) ?? 0,
    })

    if (reconciliation.reasons.length === 0) {
      continue
    }

    outstandingMinor += reconciliation.outstandingMinor

    rows.push({
      orderId: typedOrder.orderId ?? null,
      providerOrderId: typedOrder.providerOrderId ?? null,
      eventId: typedOrder.eventId,
      eventSlug: typedOrder.eventSlug,
      eventTitle: typedOrder.eventTitle,
      normalizedStatus: typedOrder.normalizedStatus,
      amountDueMinor:
        typedOrder.amountDueMinor ?? typedOrder.totalAmountMinor ?? null,
      totalAmountMinor: typedOrder.totalAmountMinor,
      currency: typedOrder.currency,
      orderedAt: typedOrder.orderedAt,
      refundedAt: typedOrder.refundedAt,
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
    availableEvents,
    totals: {
      rows: rows.length,
      outstandingMinor,
    },
    rows,
  }
}
