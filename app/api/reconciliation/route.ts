import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
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
    const result = await convexQuery<{}, ReconciliationResult>(
      "orders:getOrderPaymentStatus",
      {}
    )

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
