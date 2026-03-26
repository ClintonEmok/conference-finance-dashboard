import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"

const MATCHED_PAYMENT_STATUSES = new Set(["manual_assignment", "auto_matched"])

type PaymentMatchStatus =
  | "auto_matched"
  | "manual_assignment"
  | "ambiguous"
  | "unassigned"

type PaymentForReconciliation = {
  amountMinor: number
  orderId?: string | null
  status?: PaymentMatchStatus | null
}

export async function buildMatchedTotalsByProviderOrderId(
  orders: Array<{ providerOrderId: string }>
): Promise<Map<string, number>> {
  const payments = (await convexQuery(api.payments.getPayments, {})) as
    | PaymentForReconciliation[]
    | null
    | undefined

  const matchedTotalsByProviderOrderId = new Map<string, number>()
  const knownProviderOrderIds = new Set(
    orders.map((order) => order.providerOrderId).filter(Boolean)
  )
  const legacyLookupCache = new Map<string, string | null>()

  for (const payment of payments ?? []) {
    if (
      !payment ||
      !MATCHED_PAYMENT_STATUSES.has(payment.status ?? "unassigned") ||
      !Number.isFinite(payment.amountMinor) ||
      payment.amountMinor <= 0
    ) {
      continue
    }

    const rawOrderId =
      typeof payment.orderId === "string" ? payment.orderId : ""
    const normalizedOrderId = rawOrderId.trim()

    if (!normalizedOrderId) {
      continue
    }

    let providerOrderId: string | null = null

    if (knownProviderOrderIds.has(normalizedOrderId)) {
      providerOrderId = normalizedOrderId
    } else if (legacyLookupCache.has(normalizedOrderId)) {
      providerOrderId = legacyLookupCache.get(normalizedOrderId) ?? null
    } else {
      const legacyOrder = await convexQuery(api.orders.getOrderById, {
        orderId: normalizedOrderId,
      })
      const fallbackProviderOrderId =
        legacyOrder && typeof legacyOrder.providerOrderId === "string"
          ? legacyOrder.providerOrderId.trim()
          : ""

      providerOrderId = fallbackProviderOrderId || null
      legacyLookupCache.set(normalizedOrderId, providerOrderId)
    }

    if (!providerOrderId || !knownProviderOrderIds.has(providerOrderId)) {
      continue
    }

    matchedTotalsByProviderOrderId.set(
      providerOrderId,
      (matchedTotalsByProviderOrderId.get(providerOrderId) ?? 0) +
        payment.amountMinor
    )
  }

  return matchedTotalsByProviderOrderId
}
