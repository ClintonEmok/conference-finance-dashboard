import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import {
  syncTikkiePayments,
  autoMatchPayments,
} from "@/lib/domain/finance/payments"
import { prisma } from "@/lib/prisma"

function unauthorized() {
  return NextResponse.json(
    { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
    { status: 401 }
  )
}

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return unauthorized()

  const result = {
    synced: 0,
    matched: 0,
    ambiguous: 0,
    errors: [] as string[],
  }

  // Find all paid Tikkie payment requests (open payments)
  const paymentLinks = await prisma.tikkiePaymentLink.findMany({
    where: { status: "paid" },
    select: { paymentRequestToken: true },
  })

  // Sync payments from each payment request
  for (const link of paymentLinks) {
    try {
      const syncResult = await syncTikkiePayments(link.paymentRequestToken)
      result.synced += syncResult.newPayments
      result.errors.push(...syncResult.errors)
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : "Sync failed")
    }
  }

  // Run auto-matching on all unassigned payments
  const matchResult = await autoMatchPayments()
  result.matched = matchResult.autoMatched
  result.ambiguous = matchResult.ambiguous

  return NextResponse.json(result)
}
