import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type OrderPaymentStatus = "unassigned" | "partial" | "paid" | "overpaid"

export async function GET() {
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
    // Get all orders with positive totalAmountMinor
    const orders = await prisma.ticketTailorOrder.findMany({
      where: {
        totalAmountMinor: {
          gt: 0,
        },
      },
      select: {
        id: true,
        totalAmountMinor: true,
      },
    })

    // Get all payments grouped by orderId
    const payments = await prisma.payment.findMany({
      where: {
        orderId: {
          not: null,
        },
      },
      select: {
        orderId: true,
        amountMinor: true,
      },
    })

    // Group payments by orderId
    const paymentsByOrder: Record<string, number> = {}
    for (const payment of payments) {
      if (payment.orderId) {
        paymentsByOrder[payment.orderId] =
          (paymentsByOrder[payment.orderId] ?? 0) + payment.amountMinor
      }
    }

    // Calculate order-level payment status
    const statusCounts: Record<OrderPaymentStatus, number> = {
      unassigned: 0,
      partial: 0,
      paid: 0,
      overpaid: 0,
    }

    let totalPaidAmount = 0

    for (const order of orders) {
      const orderTotal = order.totalAmountMinor ?? 0
      const paidAmount = paymentsByOrder[order.id] ?? 0
      totalPaidAmount += paidAmount

      let status: OrderPaymentStatus
      if (paidAmount === 0) {
        status = "unassigned"
      } else if (paidAmount >= orderTotal) {
        status = paidAmount > orderTotal ? "overpaid" : "paid"
      } else {
        status = "partial"
      }

      statusCounts[status]++
    }

    // Get counts by payment source (for reference)
    const [tikkieCount, bankTransferCount, cashCount] = await Promise.all([
      prisma.payment.count({
        where: { source: "tikkie" },
      }),
      prisma.payment.count({
        where: { source: "bank_transfer" },
      }),
      prisma.payment.count({
        where: { source: "cash" },
      }),
    ])

    // Get legacy payment-level counts for backward compatibility
    const [
      unassignedPayments,
      ambiguousPayments,
      manualAssignment,
      autoMatched,
    ] = await Promise.all([
      prisma.payment.count({
        where: { status: "unassigned" },
      }),
      prisma.payment.count({
        where: { status: "ambiguous" },
      }),
      prisma.payment.count({
        where: { status: "manual_assignment" },
      }),
      prisma.payment.count({
        where: { status: "auto_matched" },
      }),
    ])

    return NextResponse.json({
      summary: {
        unassigned: statusCounts.unassigned,
        partial: statusCounts.partial,
        paid: statusCounts.paid,
        overpaid: statusCounts.overpaid,
        totalOrders: orders.length,
      },
      totalAmountMinor: totalPaidAmount,
      bySource: {
        tikkie: tikkieCount,
        bank_transfer: bankTransferCount,
        cash: cashCount,
      },
      // Keep legacy payment-level counts for reference
      legacyPaymentStatus: {
        unassigned: unassignedPayments,
        ambiguous: ambiguousPayments,
        manual_assignment: manualAssignment,
        auto_matched: autoMatched,
      },
    })
  } catch (error) {
    console.error("Failed to load reconciliation summary:", error)
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load reconciliation summary",
        },
      },
      { status: 500 }
    )
  }
}
