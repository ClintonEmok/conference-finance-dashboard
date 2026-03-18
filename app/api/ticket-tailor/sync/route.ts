import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { runTicketTailorSync } from "@/lib/integrations/ticket-tailor/sync"

export async function POST() {
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

  try {
    const summary = await runTicketTailorSync()

    return NextResponse.json({
      ok: true,
      runId: summary.runId,
      status: summary.status,
      counts: summary.counts,
      diagnostics: summary.diagnostics,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ticket Tailor sync failed"

    return NextResponse.json(
      {
        error: {
          code: "SYNC_FAILED",
          message: "Ticket Tailor sync failed",
        },
        diagnostics: {
          detail: message,
        },
      },
      { status: 500 },
    )
  }
}
