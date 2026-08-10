import { internalAction } from "./_generated/server"
import { internal } from "./_generated/api"
import {
  evaluateOrderPaymentMatch,
  type OrderPaymentMatchCandidate,
} from "../lib/domain/finance/payment-matching"

// ---------------------------------------------------------------------------
// Tikkie payments auto-sync — calls Tikkie API directly and writes via
// internal mutations instead of fetching the app's own HTTP routes.
// ---------------------------------------------------------------------------

const TIKKIE_BASE_URL =
  process.env.TIKKIE_BASE_URL?.trim() || "https://api.tikkie.me"
const TIKKIE_API_KEY = process.env.TIKKIE_API_KEY?.trim() ?? ""
const TIKKIE_APP_TOKEN = process.env.TIKKIE_APP_TOKEN?.trim() ?? ""

async function tikkieFetch<T>(
  path: string,
  query?: Record<string, string | number | undefined>
): Promise<T> {
  const url = new URL(`${TIKKIE_BASE_URL}${path}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
  }
  const res = await fetch(url, {
    headers: {
      "API-Key": TIKKIE_API_KEY,
      "X-App-Token": TIKKIE_APP_TOKEN,
      Accept: "application/json",
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Tikkie request failed (${res.status}): ${text}`)
  }
  return (await res.json()) as T
}

async function autoMatchUnassignedPayments(ctx: {
  runQuery: Function
  runMutation: Function
}): Promise<number> {
  // Query unassigned payments, paid orders, and attendees for matching
  const unassignedPayments = await ctx.runQuery(
    internal.sync.internalGetUnassignedPayments,
    {}
  )
  const paidOrders = await ctx.runQuery(internal.sync.internalGetPaidOrders, {})
  const attendeesByOrder: Record<string, string[]> = await ctx.runQuery(
    internal.sync.internalGetAttendeesByOrder,
    {}
  )

  const orderMatchCandidates: OrderPaymentMatchCandidate[] = paidOrders.map(
    (order: {
      _id: string
      bookerName: string | null
      amountDueMinor?: number | null
      totalAmountMinor?: number | null
    }) => ({
      orderId: order._id,
      bookerName: order.bookerName,
      attendeeNames: attendeesByOrder[order._id] ?? [],
      amountDueMinor: order.amountDueMinor ?? order.totalAmountMinor ?? 0,
    })
  )

  let matched = 0
  for (const payment of unassignedPayments) {
    const match = evaluateOrderPaymentMatch(
      payment.payerName,
      payment.amountMinor,
      orderMatchCandidates
    )

    if (match?.status === "auto_matched") {
      await ctx.runMutation(internal.payments.internalAssignPaymentToOrder, {
        paymentId: payment._id,
        orderId: match.orderId,
        status: "auto_matched",
        matchedBy: "auto",
      })
      matched++
      continue
    }

    if (match?.status === "ambiguous") {
      continue
    }
  }
  return matched
}

async function runTikkieAutoSync(ctx: {
  runQuery: Function
  runMutation: Function
}) {
  if (!TIKKIE_API_KEY || !TIKKIE_APP_TOKEN) {
    console.warn(
      "Tikkie auto-sync skipped: TIKKIE_API_KEY or TIKKIE_APP_TOKEN not configured"
    )
    return
  }

  let linksScanned = 0
  let paymentsFetched = 0
  let newPayments = 0
  let updatedPayments = 0
  let skippedInvalid = 0
  let matched = 0
  const errors: string[] = []

  try {
    // 1. Cleanup legacy payment payloads
    await ctx.runMutation(
      internal.payments.internalCleanupLegacyTikkiePayments,
      {}
    )

    // 2. Fetch payment links from Convex
    const allLinks = await ctx.runQuery(
      internal.sync.internalGetTikkiePaymentLinks,
      {}
    )
    const now = Date.now()
    const paymentLinks = allLinks
      .filter(
        (l: {
          linkType?: string
          paymentRequestToken?: string
          status?: string
          expiryDate?: number
        }) =>
          l.linkType === "event" &&
          Boolean(l.paymentRequestToken?.trim()) &&
          (l.status === "created" || l.status === "paid") &&
          (!l.expiryDate || l.expiryDate > now)
      )
      .sort(
        (
          a: { statusUpdatedAt?: number; _creationTime?: number },
          b: { statusUpdatedAt?: number; _creationTime?: number }
        ) => {
          return (
            (b.statusUpdatedAt ?? b._creationTime ?? 0) -
            (a.statusUpdatedAt ?? a._creationTime ?? 0)
          )
        }
      )
      .slice(0, 50)

    linksScanned = paymentLinks.length

    // 3. For each link, fetch payments from Tikkie API and upsert
    for (const link of paymentLinks) {
      try {
        const response = await tikkieFetch<{ payments: unknown[] }>(
          `/paymentrequests/${encodeURIComponent(link.paymentRequestToken)}/payments`,
          { pageNumber: 0, pageSize: 50 }
        )

        const tikkiePayments = response.payments as Array<
          Record<string, unknown>
        >
        paymentsFetched += tikkiePayments.length

        for (const tPayment of tikkiePayments) {
          const sourceId =
            typeof tPayment.paymentToken === "string"
              ? tPayment.paymentToken.trim()
              : ""
          const payerName =
            typeof tPayment.counterPartyName === "string"
              ? tPayment.counterPartyName.trim()
              : ""
          const payerAccountNumber =
            typeof tPayment.counterPartyAccountNumber === "string"
              ? tPayment.counterPartyAccountNumber
              : undefined
          const amountMinor =
            typeof tPayment.amountInCents === "number" &&
            Number.isInteger(tPayment.amountInCents) &&
            tPayment.amountInCents >= 0
              ? tPayment.amountInCents
              : null
          const paidAtSource =
            typeof tPayment.createdDateTime === "string"
              ? Date.parse(tPayment.createdDateTime)
              : Number.NaN

          if (
            !sourceId ||
            !payerName ||
            amountMinor === null ||
            !Number.isFinite(paidAtSource)
          ) {
            skippedInvalid++
            errors.push(
              `Invalid payment payload for request ${link.paymentRequestToken}; token=${sourceId || "missing"}`
            )
            continue
          }

          const result = await ctx.runMutation(
            internal.payments.internalUpsertTikkiePayment,
            {
              sourceId,
              payerName,
              payerAccountNumber,
              amountMinor,
              paidAt: paidAtSource,
              providerPayload: {
                ...tPayment,
                paymentRequestToken: link.paymentRequestToken,
              },
            }
          )

          if (result.inserted) {
            newPayments++
          } else {
            if (result.updated) updatedPayments++
          }
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Sync failed")
      }
    }

    // 4. Auto-match unassigned payments
    matched = await autoMatchUnassignedPayments(ctx)

    console.log("Tikkie auto-sync completed", {
      status: errors.length > 0 ? "partial" : "success",
      linksScanned,
      paymentsFetched,
      newPayments,
      updatedPayments,
      matched,
      errors: errors.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error(`Tikkie auto-sync error: ${message}`)
  }
}

// ---------------------------------------------------------------------------
// Exported internal actions — cron targets
// ---------------------------------------------------------------------------

export const autoSyncTikkiePayments = internalAction({
  args: {},
  handler: async (ctx) => {
    await runTikkieAutoSync(ctx)
  },
})
