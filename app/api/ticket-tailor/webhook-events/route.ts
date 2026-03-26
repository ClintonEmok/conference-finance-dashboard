import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"

export async function GET() {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const events = await convexQuery(api.sync.getWebhookEvents, {})

  return NextResponse.json({
    count: events.length,
    events,
  })
}
