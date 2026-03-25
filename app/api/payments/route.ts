import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
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
]

const allowedSources: PaymentSource[] = ["tikkie", "bank_transfer", "cash"]

function parseFilters(request: Request) {
  const params = new URL(request.url).searchParams

  const statusParam = params.get("status")
  const sourceParam = params.get("source")
  const orderIdParam = params.get("orderId")
  const pageParam = params.get("page")
  const limitParam = params.get("limit")

  const status =
    statusParam && allowedStatuses.includes(statusParam as PaymentMatchStatus)
      ? (statusParam as PaymentMatchStatus)
      : undefined

  const source =
    sourceParam && allowedSources.includes(sourceParam as PaymentSource)
      ? (sourceParam as PaymentSource)
      : undefined

  const orderId =
    orderIdParam && orderIdParam.trim() ? orderIdParam.trim() : undefined

  const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1
  const limit = limitParam
    ? Math.min(100, Math.max(1, parseInt(limitParam, 10) || 20))
    : 20

  return { status, source, orderId, page, limit }
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      },
      { status: 401 }
    )
  }

  try {
    const { status, source, orderId, page, limit } = parseFilters(request)

    const result = await listPayments({ status, source, orderId })

    const paginatedPayments = result.payments.slice(
      (page - 1) * limit,
      page * limit
    )

    return NextResponse.json({
      payments: paginatedPayments.map((p) => ({
        id: p._id,
        source: p.source,
        sourceId: p.sourceId,
        payerName: p.payerName,
        payerAccountNumber: p.payerAccountNumber,
        amountMinor: p.amountMinor,
        paidAt: new Date(p.paidAt).toISOString(),
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
        order: null,
      })),
      total: result.total,
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
