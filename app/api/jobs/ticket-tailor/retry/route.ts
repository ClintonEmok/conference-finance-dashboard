import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { processTicketTailorRetryBatch } from "@/lib/integrations/ticket-tailor/webhook"

export async function POST(request: Request) {
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
      { status: 401 },
    )
  }

  const url = new URL(request.url)
  const limitParam = Number(url.searchParams.get("limit") ?? "20")
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20

  const result = await processTicketTailorRetryBatch(limit)

  return NextResponse.json({
    ok: true,
    ...result,
  })
}
