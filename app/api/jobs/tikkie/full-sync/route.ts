import { NextResponse } from "next/server"

import { runTikkieSync } from "@/lib/domain/finance/tikkie-sync"
import { enforceRateLimit } from "@/lib/rate-limit"

function unauthorized() {
  return NextResponse.json(
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid cron secret",
      },
    },
    { status: 401 }
  )
}

export async function POST(request: Request) {
  const rateLimited = enforceRateLimit(request, "jobs:tikkie-full-sync", {
    maxRequests: 10,
    windowMs: 60_000,
  })
  if (rateLimited) return rateLimited

  const expectedSecret = process.env.TIKKIE_SYNC_CRON_SECRET?.trim()

  if (!expectedSecret) {
    return NextResponse.json(
      {
        error: {
          code: "CRON_SECRET_NOT_CONFIGURED",
          message: "TIKKIE_SYNC_CRON_SECRET is not configured",
        },
      },
      { status: 503 }
    )
  }

  const providedSecret = request.headers.get("x-cron-secret")?.trim()

  if (!providedSecret || providedSecret !== expectedSecret) {
    return unauthorized()
  }

  const result = await runTikkieSync()

  return NextResponse.json({
    ok: true,
    ...result,
  })
}
