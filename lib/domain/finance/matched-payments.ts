import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"
import { isOrderAppliedPayment } from "@/lib/domain/finance/amounts"

type PaymentMatchStatus =
  | "auto_matched"
  | "manual_assignment"
  | "ambiguous"
  | "unassigned"
  | "donation"

type PaymentForReconciliation = {
  amountMinor: number
  orderId?: string | null
  status?: PaymentMatchStatus | null
  donationKind?: "overpayment" | "standalone" | null
}

async function resolveCanonicalOrderIdForLegacyPayment(
  orderId: string,
  legacyLookupCache: Map<string, string | null>
): Promise<string | null> {
  if (legacyLookupCache.has(orderId)) {
    return legacyLookupCache.get(orderId) ?? null
  }

  const byOrderId = await convexQuery(api.orders.getOrderById, {
    orderId,
  })

  if (byOrderId?._id) {
    const canonicalOrderId = byOrderId._id as string
    legacyLookupCache.set(orderId, canonicalOrderId)
    return canonicalOrderId
  }

  const byProviderOrder = await convexQuery(api.orders.getOrderByProviderId, {
    providerOrderId: orderId,
  })

  const canonicalOrderId = byProviderOrder?._id ?? null
  legacyLookupCache.set(orderId, canonicalOrderId)
  return canonicalOrderId
}

export async function buildMatchedTotalsByOrderId(
  orders: Array<{
    orderId?: string | null
    providerOrderId?: string | null
  }>
): Promise<Map<string, number>> {
  const payments = (await convexQuery(api.payments.getPayments, {})) as
    | PaymentForReconciliation[]
    | null
    | undefined

  const matchedTotalsByOrderId = new Map<string, number>()
  const knownOrderIds = new Set(
    orders
      .map((order) => order.orderId ?? null)
      .filter((value): value is string => Boolean(value))
  )
  const legacyLookupCache = new Map<string, string | null>()

  for (const payment of payments ?? []) {
    if (
      !payment ||
      !isOrderAppliedPayment(payment) ||
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

    let canonicalOrderId: string | null = null

    if (knownOrderIds.has(normalizedOrderId)) {
      canonicalOrderId = normalizedOrderId
    } else {
      canonicalOrderId =
        (await resolveCanonicalOrderIdForLegacyPayment(
          normalizedOrderId,
          legacyLookupCache
        )) ?? null
    }

    if (!canonicalOrderId || !knownOrderIds.has(canonicalOrderId)) {
      continue
    }

    matchedTotalsByOrderId.set(
      canonicalOrderId,
      (matchedTotalsByOrderId.get(canonicalOrderId) ?? 0) +
        payment.amountMinor
    )
  }

  return matchedTotalsByOrderId
}

export const buildMatchedTotalsByProviderOrderId = buildMatchedTotalsByOrderId
