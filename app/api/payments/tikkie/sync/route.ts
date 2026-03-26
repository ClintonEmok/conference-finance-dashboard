import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"
import {
  syncTikkiePayments,
  autoMatchPayments,
} from "@/lib/domain/finance/payments"

export async function POST() {
  const authResult = await requireApiUser()

  if (authResult instanceof NextResponse) {
    return authResult
  }

  const result = {
    synced: 0,
    matched: 0,
    ambiguous: 0,
    errors: [] as string[],
  }

  const paymentLinks = (await convexQuery(api.tikkie.getPaymentLinks, {
    status: "paid",
  })) as Array<{ paymentRequestToken: string }>

  for (const link of paymentLinks) {
    try {
      const syncResult = await syncTikkiePayments(link.paymentRequestToken)
      result.synced += syncResult.newPayments
      result.errors.push(...syncResult.errors)
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : "Sync failed")
    }
  }

  const matchResult = await autoMatchPayments()
  result.matched = matchResult.autoMatched
  result.ambiguous = matchResult.ambiguous

  return NextResponse.json(result)
}
