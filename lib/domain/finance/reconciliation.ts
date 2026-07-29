import type { CanonicalOrderStatus } from "@/lib/domain/finance/order-ledger"
import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"
import { buildMatchedTotalsByOrderId } from "@/lib/domain/finance/matched-payments"
import { deriveBalanceAmounts } from "@/lib/domain/finance/amounts"
import type { Id } from "@/convex/_generated/dataModel"

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
    standaloneDonationMinor: number
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
  const balance = deriveBalanceAmounts(order.amountDueMinor, order.matchedAmountMinor)
  const reasons: ReconciliationReason[] = []
  let outstandingMinor = 0

  if (order.amountDueMinor === null) {
    reasons.push("missing-amount")
  }

  if (order.normalizedStatus === "pending") {
    reasons.push("pending-payment")
    outstandingMinor = balance.outstandingAmountMinor
  }

  if (order.normalizedStatus === "cancelled" && balance.amountDueMinor > 0) {
    reasons.push("cancelled-with-amount")
    outstandingMinor = Math.max(outstandingMinor, balance.outstandingAmountMinor)
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

  const [orders, availableEvents, standaloneDonations] = await Promise.all([
    convexQuery(api.orders.getOrdersForReconciliation, {
      eventId: eventId ?? undefined,
      from: fromMs,
      to: toMs,
      status: status ?? undefined,
    }),
    convexQuery(api.events.getEventsForLedger, {}),
    convexQuery(api.payments.getStandaloneDonations, {
      eventId: eventId ? (eventId as Id<"events">) : undefined,
    }),
  ])

  const matchedTotalsByOrderId = await buildMatchedTotalsByOrderId(orders)

  // Calculate total standalone donations for this event
  const totalStandaloneDonations = standaloneDonations.reduce(
    (sum: number, d: { amountMinor: number }) => sum + d.amountMinor,
    0
  )

  const rows: ReconciliationRow[] = []
  let outstandingMinor = 0

  for (const order of orders) {
    const typedOrder = order as typeof order & {
      amountDueMinor?: number | null
    }

    const orderLookupKey = typedOrder.orderId ?? null

    const refundedAtDate = typedOrder.refundedAt
      ? new Date(typedOrder.refundedAt)
      : null

      const reconciliation = deriveReconciliation({
        normalizedStatus: typedOrder.normalizedStatus,
        amountDueMinor: typedOrder.amountDueMinor ?? null,
        totalAmountMinor: typedOrder.totalAmountMinor,
        refundedAt: refundedAtDate,
        matchedAmountMinor:
          (orderLookupKey
            ? matchedTotalsByOrderId.get(orderLookupKey)
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
        amountDueMinor: typedOrder.amountDueMinor ?? null,
        totalAmountMinor: typedOrder.totalAmountMinor,
        currency: typedOrder.currency,
        orderedAt: typedOrder.orderedAt,
      refundedAt: typedOrder.refundedAt,
      outstandingMinor: reconciliation.outstandingMinor,
      reasons: reconciliation.reasons,
    })
  }

  // Standalone donations reduce the overall outstanding for the event
  const adjustedOutstandingMinor = Math.max(
    0,
    outstandingMinor - totalStandaloneDonations
  )

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
      outstandingMinor: adjustedOutstandingMinor,
      standaloneDonationMinor: totalStandaloneDonations,
    },
    rows,
  }
}
