import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import {
  syncTikkiePayments,
  autoMatchPayments,
} from "@/lib/domain/finance/payments"

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!

async function convexQuery<Args extends Record<string, unknown>, Response>(
  path: string,
  args: Args
): Promise<Response> {
  const response = await fetch(`${CONVEX_URL}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ args }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Convex query failed: ${error}`)
  }

  return response.json()
}

function unauthorized() {
  return NextResponse.json(
    { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
    { status: 401 }
  )
}

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

  const paymentLinks = await convexQuery<
    { status: "paid" },
    Array<{ paymentRequestToken: string }>
  >("tikkie/getPaymentLinks", { status: "paid" })

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
