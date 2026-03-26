import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"

function unauthorized() {
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

export async function GET(request: Request) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const url = new URL(request.url)
  const search = url.searchParams.get("search") || ""
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "20", 10),
    50
  )

  try {
    const orders = await convexQuery(api.orders.searchOrders, { search, limit })

    return NextResponse.json({ orders })
  } catch (error) {
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
