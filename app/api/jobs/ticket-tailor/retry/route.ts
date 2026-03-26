import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { processTicketTailorRetryBatch } from "@/lib/integrations/ticket-tailor/webhook"

export async function POST(request: Request) {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
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
