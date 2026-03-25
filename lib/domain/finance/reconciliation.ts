const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!

async function convexQuery<Args extends Record<string, unknown>, Response>(
  path: string,
  args: Args
): Promise<Response> {
  const response = await fetch(`${CONVEX_URL}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ args }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Convex query failed: ${error}`)
  }

  return response.json()
}

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
  availableEvents: Array<{
    providerEventId: string
    name: string | null
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
    convexQuery<
      {
        eventId?: string
        from?: number
        to?: number
        status?: CanonicalOrderStatus
      },
      Array<{
        providerOrderId: string
        providerEventId: string
        eventName: string | null
        normalizedStatus: CanonicalOrderStatus
        totalAmountMinor: number
        currency: string | null
        orderedAt: string | null
        refundedAt: string | null
        buyerName: string | null
        buyerEmail: string | null
      }>
    >("orders/getOrdersForReconciliation", {
      eventId: eventId ?? undefined,
      from: fromMs,
      to: toMs,
      status: status ?? undefined,
    }),
    convexQuery<{}, Array<{ providerEventId: string; name: string | null }>>(
      "events/getEventsForLedger",
      {}
    ),
  ])

  const rows: ReconciliationRow[] = []
  let outstandingMinor = 0

  for (const order of orders) {
    const refundedAtDate = order.refundedAt ? new Date(order.refundedAt) : null

    const reconciliation = deriveReconciliation({
      normalizedStatus: order.normalizedStatus,
      totalAmountMinor: order.totalAmountMinor,
      refundedAt: refundedAtDate,
    })

    if (reconciliation.reasons.length === 0) {
      continue
    }

    outstandingMinor += reconciliation.outstandingMinor

    rows.push({
      providerOrderId: order.providerOrderId,
      providerEventId: order.providerEventId,
      eventName: order.eventName,
      normalizedStatus: order.normalizedStatus,
      totalAmountMinor: order.totalAmountMinor,
      currency: order.currency,
      orderedAt: order.orderedAt,
      refundedAt: order.refundedAt,
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
