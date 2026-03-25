import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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
    const orders = await prisma.ticketTailorOrder.findMany({
      where: search
        ? {
            OR: [
              { buyerName: { contains: search } },
              { providerOrderId: { contains: search } },
            ],
          }
        : {},
      select: {
        id: true,
        providerOrderId: true,
        buyerName: true,
        totalAmountMinor: true,
      },
      take: limit,
      orderBy: { orderedAt: "desc" },
    })

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
