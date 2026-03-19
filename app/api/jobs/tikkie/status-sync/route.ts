import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { syncPendingTikkiePaymentLinks } from "@/lib/domain/finance/tikkie-links"

function unauthorized() {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    },
    { status: 401 },
  )
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return unauthorized()
  }

  const url = new URL(request.url)
  const limitParam = Number(url.searchParams.get("limit") ?? "25")
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 100) : 25

  const result = await syncPendingTikkiePaymentLinks({ limit })

  return NextResponse.json({
    ok: true,
    ...result,
  })
}
