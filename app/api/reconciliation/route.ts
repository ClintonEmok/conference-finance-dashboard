import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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
    // Get counts by status
    const [
      unassigned,
      ambiguous,
      manualAssignment,
      autoMatched,
      total,
      totalAmountResult,
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
      prisma.payment.count(),
      prisma.payment.aggregate({
        _sum: {
          amountMinor: true,
        },
      }),
    ])

    // Get counts by source
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

    return NextResponse.json({
      summary: {
        unassigned,
        ambiguous,
        manual_assignment: manualAssignment,
        auto_matched: autoMatched,
        total,
      },
      totalAmountMinor: totalAmountResult._sum.amountMinor ?? 0,
      bySource: {
        tikkie: tikkieCount,
        bank_transfer: bankTransferCount,
        cash: cashCount,
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
