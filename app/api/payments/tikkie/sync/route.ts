import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { runTikkieSync } from "@/lib/domain/finance/tikkie-sync"

export async function POST() {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const result = await runTikkieSync()
  return NextResponse.json(result)
}
