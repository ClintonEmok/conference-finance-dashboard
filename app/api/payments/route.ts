import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"
import { listPayments } from "@/lib/domain/finance/payments"
import type {
  PaymentMatchStatus,
  PaymentSource,
} from "@/lib/domain/finance/payments"

const allowedStatuses: PaymentMatchStatus[] = [
  "unassigned",
  "ambiguous",
  "manual_assignment",
  "auto_matched",
  "donation",
]

const allowedSources: PaymentSource[] = ["tikkie", "bank_transfer", "cash"]

type ResolvedOrder = {
  id: string
  providerOrderId: string | null
  buyerName: string | null
  totalAmountMinor: number | null
}

function parseFilters(request: Request) {
  const params = new URL(request.url).searchParams

  const statusParam = params.get("status")
  const sourceParam = params.get("source")
  const eventIdParam = params.get("eventId")
  const orderIdParam = params.get("orderId")
  const pageParam = params.get("page")
  const limitParam = params.get("limit")
  const fromParam = params.get("from")
  const toParam = params.get("to")

  const status =
    statusParam && allowedStatuses.includes(statusParam as PaymentMatchStatus)
      ? (statusParam as PaymentMatchStatus)
      : undefined

  const source =
    sourceParam && allowedSources.includes(sourceParam as PaymentSource)
      ? (sourceParam as PaymentSource)
      : undefined

  const eventId =
    eventIdParam && eventIdParam.trim()
      ? (eventIdParam.trim() as Id<"events">)
      : undefined

  const orderId =
    orderIdParam && orderIdParam.trim() ? orderIdParam.trim() : undefined

  const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1
  const limit = limitParam
    ? Math.min(100, Math.max(1, parseInt(limitParam, 10) || 20))
    : 20

  const from = fromParam ? new Date(fromParam) : null
  const to = toParam ? new Date(toParam) : null

  return { status, source, eventId, orderId, page, limit, from, to }
}

function mapResolvedOrder(order: {
  _id: string
  providerOrderId?: string | null
  buyerName?: string | null
  totalAmountMinor?: number | null
}): ResolvedOrder {
  return {
    id: order._id,
    providerOrderId: order.providerOrderId ?? null,
    buyerName: order.buyerName ?? null,
    totalAmountMinor: order.totalAmountMinor ?? null,
  }
}

async function resolvePaymentOrder(
  rawOrderId: string | null,
  byOrderIdCache: Map<string, ResolvedOrder | null>
): Promise<ResolvedOrder | null> {
  const orderId = rawOrderId?.trim()

  if (!orderId) {
    return null
  }

  if (byOrderIdCache.has(orderId)) {
    return byOrderIdCache.get(orderId) ?? null
  }

  const byOrderId = await convexQuery(api.orders.getOrderById, {
    orderId,
  })

  const mappedByOrderId = byOrderId ? mapResolvedOrder(byOrderId) : null
  byOrderIdCache.set(orderId, mappedByOrderId)

  return mappedByOrderId
}

export async function GET(request: Request) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const { status, source, eventId, orderId, page, limit, from, to } =
      parseFilters(request)

    const result = await listPayments({
      eventId: eventId as Id<"events"> | undefined,
      status,
      source,
      orderId,
    })

    let filteredPayments = result.payments
    if (from) {
      const fromMs = from.getTime()
      filteredPayments = filteredPayments.filter(
        (p) => new Date(p.paidAt).getTime() >= fromMs
      )
    }
    if (to) {
      const toMs = to.getTime() + 24 * 60 * 60 * 1000 // Include full day
      filteredPayments = filteredPayments.filter(
        (p) => new Date(p.paidAt).getTime() <= toMs
      )
    }

    const total = filteredPayments.length

    const paginatedPayments = filteredPayments.slice(
      (page - 1) * limit,
      page * limit
    )

    const byOrderIdCache = new Map<string, ResolvedOrder | null>()

    const payments = await Promise.all(
      paginatedPayments.map(async (p) => {
        const order = await resolvePaymentOrder(
          p.orderId,
          byOrderIdCache
        )

        return {
          id: p._id,
          source: p.source,
          sourceId: p.sourceId,
          payerName: p.payerName,
          payerAccountNumber: p.payerAccountNumber,
          amountMinor: p.amountMinor,
          paidAt: new Date(p.paidAt).toISOString(),
          eventId: p.eventId,
          orderId: p.orderId,
          status: p.status,
          matchedAt: p.matchedAt ? new Date(p.matchedAt).toISOString() : null,
          matchedBy: p.matchedBy,
          reference: p.reference,
          notes: p.notes,
          createdAt: p.paidAt
            ? new Date(p.paidAt).toISOString()
            : new Date().toISOString(),
          updatedAt: p.paidAt
            ? new Date(p.paidAt).toISOString()
            : new Date().toISOString(),
          order,
        }
      })
    )

    return NextResponse.json({
      payments,
      total,
      page,
      limit,
    })
  } catch (error) {
    console.error("Failed to load payments:", error)
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load payments",
        },
      },
      { status: 500 }
    )
  }
}
