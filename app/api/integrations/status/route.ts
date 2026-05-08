import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { getIntegrationStatus } from "@/lib/integrations/status"

export async function GET() {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const payload = await getIntegrationStatus()

  return NextResponse.json(payload)
}
