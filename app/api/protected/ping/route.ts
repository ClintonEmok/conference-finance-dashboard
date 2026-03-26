import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"

export async function GET() {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  return NextResponse.json({
    ok: true,
    userId: authResult.userId,
  })
}
