import { NextResponse } from "next/server"

import { requireApiUser } from "@/lib/auth/server"
import { api } from "@/lib/convex/api"
import { convexMutation, convexQuery } from "@/lib/convex/server"
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
    migration: {
      scanned: 0,
      patched: 0,
    },
    linksScanned: 0,
    paymentsFetched: 0,
    newPayments: 0,
    existingPayments: 0,
    updatedPayments: 0,
    skippedInvalid: 0,
    matched: 0,
    ambiguous: 0,
    errors: [] as string[],
    status: "success" as "success" | "partial",
  }

  const migrationResult = await convexMutation(
    api.payments.cleanupLegacyTikkiePayments,
    {}
  )
  result.migration.scanned = migrationResult.scanned
  result.migration.patched = migrationResult.patched

  const allLinks = (await convexQuery(
    api.tikkie.getPaymentLinks,
    {}
  )) as Array<{
    _creationTime: number
    paymentRequestToken: string
    status?: "created" | "paid" | "expired"
    expiryDate?: number
    linkType?: "event" | "order"
    statusUpdatedAt?: number
  }>

  const now = Date.now()
  const paymentLinks = allLinks
    .filter((link) => link.linkType === "event")
    .filter((link) => Boolean(link.paymentRequestToken?.trim()))
    .filter((link) => link.status === "created" || link.status === "paid")
    .filter((link) => !link.expiryDate || link.expiryDate > now)
    .sort((a, b) => {
      const aTime = a.statusUpdatedAt ?? a._creationTime ?? 0
      const bTime = b.statusUpdatedAt ?? b._creationTime ?? 0
      return bTime - aTime
    })
    .slice(0, 50)

  result.linksScanned = paymentLinks.length

  for (const link of paymentLinks) {
    try {
      const syncResult = await syncTikkiePayments(link.paymentRequestToken)
      result.paymentsFetched += syncResult.paymentsFetched
      result.newPayments += syncResult.newPayments
      result.existingPayments += syncResult.existingPayments
      result.updatedPayments += syncResult.updatedPayments
      result.skippedInvalid += syncResult.skippedInvalid
      result.errors.push(...syncResult.errors)
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : "Sync failed")
    }
  }

  const matchResult = await autoMatchPayments()
  result.matched = matchResult.autoMatched
  result.ambiguous = matchResult.ambiguous

  if (result.errors.length > 0) {
    result.status = "partial"
  }

  return NextResponse.json(result)
}
