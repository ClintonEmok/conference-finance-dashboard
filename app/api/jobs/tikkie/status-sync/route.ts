import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
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
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
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
