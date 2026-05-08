import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"

export async function GET(request: Request) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const url = new URL(request.url)
  const searchParam = url.searchParams.get("search")
  const qParam = url.searchParams.get("q")
  const search = (searchParam ?? qParam ?? "").trim()

  const parsedLimit = Number.parseInt(url.searchParams.get("limit") || "20", 10)
  const limit = Math.min(Number.isNaN(parsedLimit) ? 20 : parsedLimit, 50)

  try {
    const orders = await convexQuery(api.orders.searchOrders, { search, limit })

    return NextResponse.json({ orders })
  } catch (error) {
    console.error("Error searching orders:", error)
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to search orders",
        },
      },
      { status: 500 }
    )
  }
}
