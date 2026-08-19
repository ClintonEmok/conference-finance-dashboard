import { internalAction, type ActionCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { internal } from "./_generated/api"
import {
  evaluateOrderPaymentMatch,
  scoreAttendeeMatch,
  scoreNameMatch,
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
const TIKKIE_PAGE_SIZE = 50
const TIKKIE_POLL_OVERLAP_MS = 5 * 60 * 1000

type AutoSyncCtx = Pick<ActionCtx, "runQuery" | "runMutation">

type TikkiePaymentListResponse = {
  payments: unknown[]
  totalElementCount: number
}

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

export async function fetchTikkiePaymentsForLink(link: {
  paymentRequestToken: string
  providerLastCheckedAt?: number
}) {
  const pollStartedAt = Date.now()
  const fromDateTime =
    typeof link.providerLastCheckedAt === "number" &&
    Number.isFinite(link.providerLastCheckedAt) &&
    link.providerLastCheckedAt > 0
      ? new Date(
          Math.min(
            pollStartedAt,
            Math.max(0, link.providerLastCheckedAt - TIKKIE_POLL_OVERLAP_MS)
          )
        ).toISOString()
      : undefined
  const toDateTime = new Date(pollStartedAt).toISOString()
  const payments: unknown[] = []
  let pageNumber = 0
  let totalElementCount = 0

  do {
    const response = await tikkieFetch<TikkiePaymentListResponse>(
      `/paymentrequests/${encodeURIComponent(link.paymentRequestToken)}/payments`,
      {
        pageNumber,
        pageSize: TIKKIE_PAGE_SIZE,
        fromDateTime,
        toDateTime,
      }
    )

    if (
      !Number.isInteger(response.totalElementCount) ||
      response.totalElementCount < 0
    ) {
      throw new Error(
        `Tikkie response missing a valid totalElementCount for request ${link.paymentRequestToken}`
      )
    }

    payments.push(...response.payments)
    totalElementCount = response.totalElementCount
    pageNumber += 1
  } while (payments.length < totalElementCount)

  return {
    payments,
    // The requested window ends at pollStartedAt. Persisting a later time
    // could skip payments created while this action was fetching pages.
    checkedAt: pollStartedAt,
  }
}

async function autoMatchUnassignedPayments(
  ctx: AutoSyncCtx,
  eventIds: Id<"events">[]
): Promise<number> {
  const scopedEventIds = [...new Set(eventIds)].filter(Boolean)
  if (scopedEventIds.length === 0) return 0

  const payments = await ctx.runQuery(
    internal.sync.internalGetUnassignedPayments,
    {
      eventIds: scopedEventIds,
    }
  )
  if (payments.length === 0) return 0

  // Query paid orders and their attendees only when there is work to match.
  const paidOrders = await ctx.runQuery(internal.sync.internalGetPaidOrders, {
    eventIds: scopedEventIds,
    includeAmountDue: false,
  })
  const attendeesByOrder = await ctx.runQuery(
    internal.sync.internalGetAttendeesByOrder,
    {
      orderIds: paidOrders.map(
        (order: { _id: Id<"orders"> }) => order._id
      ),
    }
  )

  const ordersByEvent = new Map<string, typeof paidOrders>()
  for (const order of paidOrders) {
    const eventOrders = ordersByEvent.get(String(order.eventId)) ?? []
    eventOrders.push(order)
    ordersByEvent.set(String(order.eventId), eventOrders)
  }

  // Canonical amount-due loading is the expensive part of this path. Only
  // orders whose booker or attendee name can score against an incoming
  // payment can ever reach the matcher, so defer those reads until after the
  // cheap in-memory name prefilter.
  const amountDueOrderIds = new Set<typeof paidOrders[number]["_id"]>()
  for (const payment of payments) {
    const eventOrders = ordersByEvent.get(String(payment.eventId)) ?? []
    for (const order of eventOrders) {
      const attendeeNames = attendeesByOrder[order._id] ?? []
      if (
        scoreNameMatch(payment.payerName, order.bookerName) > 0 ||
        scoreAttendeeMatch(payment.payerName, attendeeNames) > 0
      ) {
        amountDueOrderIds.add(order._id)
      }
    }
  }

  const amountDueRows: Array<{
    _id: Id<"orders">
    amountDueMinor: number | null
  }> =
    amountDueOrderIds.size > 0
      ? await ctx.runQuery(internal.sync.internalGetAmountDueByOrderIds, {
          orderIds: [...amountDueOrderIds],
        })
      : []
  const amountDueByOrderId = new Map(
    amountDueRows.map((row) => [String(row._id), row.amountDueMinor])
  )

  const candidatesByEvent = new Map<string, OrderPaymentMatchCandidate[]>()
  const orderMatchCandidates: OrderPaymentMatchCandidate[] = paidOrders.map(
    (order: {
      _id: string
      eventId?: string
      bookerName: string | null
      amountDueMinor?: number | null
      totalAmountMinor?: number | null
      payerAccountNumbers?: string[]
    }) => ({
      orderId: order._id,
      bookerName: order.bookerName,
      attendeeNames: attendeesByOrder[order._id] ?? [],
      amountDueMinor:
        amountDueByOrderId.get(order._id) ?? order.totalAmountMinor ?? 0,
      payerAccountNumbers: order.payerAccountNumbers ?? [],
    })
  )
  for (const [index, order] of paidOrders.entries()) {
    const eventCandidates = candidatesByEvent.get(String(order.eventId)) ?? []
    eventCandidates.push(orderMatchCandidates[index])
    candidatesByEvent.set(String(order.eventId), eventCandidates)
  }

  let matched = 0
  for (const payment of payments) {
    const match = evaluateOrderPaymentMatch(
      payment.payerName,
      payment.amountMinor,
      candidatesByEvent.get(String(payment.eventId)) ?? [],
      payment.payerAccountNumber
    )

    if (match?.status === "auto_matched") {
      await ctx.runMutation(internal.payments.internalAssignPaymentToOrder, {
        paymentId: payment._id,
        orderId: match.orderId as Id<"orders">,
        status: "auto_matched",
        matchedBy: "auto",
      })
      matched++
    }
  }

  return matched
}

async function runTikkieAutoSync(ctx: AutoSyncCtx) {
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
    // 1. Fetch active event payment links from Convex
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

    // 2. For each link, fetch payments from Tikkie API and upsert
    for (const link of paymentLinks) {
      try {
        const response = await fetchTikkiePaymentsForLink(link)
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
              eventId: link.eventId,
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

        await ctx.runMutation(
          internal.sync.internalMarkTikkiePaymentLinkChecked,
          {
            linkId: link._id,
            checkedAt: response.checkedAt,
          }
        )
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Sync failed")
      }
    }

    // 3. Auto-match unassigned payments
    matched = await autoMatchUnassignedPayments(
      ctx,
      paymentLinks
        .map((link: { eventId?: string }) => link.eventId)
          .filter(
            (eventId: Id<"events"> | undefined): eventId is Id<"events"> =>
            Boolean(eventId)
          )
    )

    console.log("Tikkie auto-sync completed", {
      status: errors.length > 0 ? "partial" : "success",
      linksScanned,
      paymentsFetched,
      newPayments,
      updatedPayments,
      matched,
      skippedInvalid,
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
