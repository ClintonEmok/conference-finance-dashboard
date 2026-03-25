import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
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
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return unauthorized()
  }

  const url = new URL(request.url)
  const search = url.searchParams.get("search") || ""
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "20", 10),
    50
  )

  try {
    const orders = await convexQuery<
      { search: string; limit: number },
      Array<{
        id: string
        providerOrderId: string
        buyerName: string | null
        totalAmountMinor: number
      }>
    >("orders:searchOrders", { search, limit })

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
