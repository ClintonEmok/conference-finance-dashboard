import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"

type ReconciliationResult = {
  summary: {
    unassigned: number
    partial: number
    paid: number
    overpaid: number
    totalOrders: number
  }
  totalAmountMinor: number
  bySource: {
    tikkie: number
    bank_transfer: number
    cash: number
  }
  legacyPaymentStatus: {
    unassigned: number
    ambiguous: number
    manual_assignment: number
    auto_matched: number
  }
}

export async function GET() {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const result = (await convexQuery(
      api.orders.getOrderPaymentStatus,
      {}
    )) as ReconciliationResult

    return NextResponse.json(result)
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
