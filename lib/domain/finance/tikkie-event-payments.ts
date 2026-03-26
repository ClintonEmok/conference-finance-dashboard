import { getPaymentRequestPayments } from "@/lib/integrations/tikkie/client"
import { api } from "@/lib/convex/api"
import { convexMutation, convexQuery } from "@/lib/convex/server"
import type { Id } from "@/convex/_generated/dataModel"

export type TikkieEventPaymentView = {
  id: string
  paymentLinkId: string
  paymentToken: string
  payerName: string
  payerAccountNumber: string | null
  amountMinor: number
  paidAt: string
  description: string | null
  orderId: string | null
  matchStatus: "unmatched" | "auto_matched" | "manual"
  matchedAt: string | null
}

export type FetchAndStoreResult = {
  fetched: number
  stored: number
  skipped: number
}

export type SyncAllResult = {
  linksScanned: number
  paymentsFetched: number
  paymentsNew: number
  autoMatched: number
}

export async function fetchAndStoreTikkiePayments(
  paymentLinkId: string,
  paymentRequestToken: string
): Promise<FetchAndStoreResult> {
  const response = await getPaymentRequestPayments(paymentRequestToken, 0, 100)

  let stored = 0
  let skipped = 0

  for (const raw of response.payments) {
    const p = raw as Record<string, unknown>
    const paymentToken = p.paymentToken as string
    if (!paymentToken) continue

    const result = await convexMutation(api.tikkie.upsertTikkiePayment, {
      paymentLinkId,
      paymentRequestToken,
      paymentToken,
      payerName: (p.payerName as string) ?? "Unknown",
      payerAccountNumber: (p.payerAccountNumber as string) ?? undefined,
      amountMinor: (p.amountInCents as number) ?? 0,
      paidAt: p.paymentDateTime
        ? new Date(p.paymentDateTime as string).getTime()
        : Date.now(),
      description: (p.description as string) ?? undefined,
      providerPayload: p,
    })

    if (result.inserted) {
      stored++
    } else {
      skipped++
    }
  }

  return { fetched: response.payments.length, stored, skipped }
}

export async function syncAllEventPaymentLinks(): Promise<SyncAllResult> {
  const allLinks = await convexQuery(api.tikkie.getPaymentLinks, {})

  const eventLinks = (allLinks as Array<Record<string, unknown>>).filter(
    (l) => l.linkType === "event" && l.eventId
  )

  let paymentsFetched = 0
  let paymentsNew = 0
  let autoMatched = 0

  for (const link of eventLinks) {
    const result = await fetchAndStoreTikkiePayments(
      link._id as string,
      link.paymentRequestToken as string
    )
    paymentsFetched += result.fetched
    paymentsNew += result.stored

    const matchResult = await convexMutation(
      api.tikkie.autoMatchTikkiePayments,
      {
        eventId: link.eventId as string,
      }
    )
    autoMatched += matchResult.matchedCount
  }

  return {
    linksScanned: eventLinks.length,
    paymentsFetched,
    paymentsNew,
    autoMatched,
  }
}

export async function manuallyMatchTikkiePayment(
  paymentId: string,
  orderId: string
) {
  return await convexMutation(api.tikkie.matchTikkiePayment, {
    paymentId: paymentId as Id<"tikkiePayments">,
    orderId,
  })
}
