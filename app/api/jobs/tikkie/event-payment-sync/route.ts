import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/auth/server"
import { syncAllEventPaymentLinks } from "@/lib/domain/finance/tikkie-event-payments"

export async function POST() {
  const authResult = await requireApiUser()
  if (authResult instanceof NextResponse) return authResult

  try {
    const result = await syncAllEventPaymentLinks()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Payment sync failed"
    return NextResponse.json(
      { error: { code: "SYNC_FAILED", message } },
      { status: 500 }
    )
  }
}
