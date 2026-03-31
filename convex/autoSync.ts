import { internalAction } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import {
  ticketTailorFetch,
  ticketTailorFetchPaginated,
  extractAttendeeItems,
} from "../lib/integrations/ticket-tailor/client"

// ---------------------------------------------------------------------------
// Ticket Tailor auto-sync — calls external API directly and writes via
// internal mutations instead of fetching the app's own HTTP routes.
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null
}

function parseDate(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value * 1000)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof value !== "string" || !value.trim()) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.round(value)
  if (typeof value === "string") {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.round(n)
  }
  return null
}

function toMinorAmount(value: unknown): number | null {
  const parsed = parseInteger(value)
  if (parsed !== null) return parsed
  if (typeof value === "string") {
    const decimal = Number(value)
    if (Number.isFinite(decimal)) return Math.round(decimal * 100)
  }
  return null
}

function asRecord(value: unknown): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {}
  return value as JsonRecord
}

// --- Family linking (reuses existing queries via ctx.runQuery) ---

async function linkAttendeesAsFamily(
  ctx: { runQuery: Function; runMutation: Function },
  orderId: string,
  attendeeCount: number
): Promise<void> {
  // Get TT attendees for this order, which now include attendeeId (FK to orderAttendees)
  const ttAttendees = await ctx.runQuery(
    internal.sync.internalGetTicketTailorAttendeesByOrderId,
    { orderId }
  )
  if (ttAttendees.length < 2) return

  // Use the attendeeId (FK to orderAttendees) for family linking
  const attendeeIds = ttAttendees
    .map((a: { attendeeId?: string }) => a.attendeeId)
    .filter((id: string | undefined): id is string => Boolean(id))

  if (attendeeIds.length < 2) return

  const firstAttendeeId = attendeeIds[0]
  const existingFamily = await ctx.runQuery(
    internal.sync.internalGetAttendeeFamilyGroupByPrimaryId,
    {
      primaryAttendeeId: firstAttendeeId,
    }
  )

  if (existingFamily) {
    const members = await ctx.runQuery(
      internal.sync.internalGetFamilyMembersByGroupId,
      {
        familyGroupId: existingFamily._id,
      }
    )
    const existingMemberIds = new Set(
      members.map((m: { attendeeId: string }) => m.attendeeId)
    )
    for (const attendeeId of attendeeIds) {
      if (!existingMemberIds.has(attendeeId)) {
        await ctx.runMutation(internal.sync.internalAddAttendeeToFamilyGroup, {
          familyGroupId: existingFamily._id,
          attendeeId: attendeeId,
        })
      }
    }
  } else {
    const familyGroupId = await ctx.runMutation(
      internal.sync.internalCreateAttendeeFamilyGroup,
      {
        primaryAttendeeId: firstAttendeeId,
        label: `Family (${attendeeCount} members)`,
      }
    )
    for (const attendeeId of attendeeIds) {
      await ctx.runMutation(internal.sync.internalAddAttendeeToFamilyGroup, {
        familyGroupId,
        attendeeId: attendeeId,
      })
    }
  }
}

// --- Ticket Tailor sync handler ---

async function runTicketTailorAutoSync(ctx: {
  runQuery: Function
  runMutation: Function
}) {
  if (!process.env.TICKET_TAILOR_API_KEY?.trim()) {
    console.warn(
      "Ticket Tailor auto-sync skipped: TICKET_TAILOR_API_KEY not configured"
    )
    return
  }

  const runId: Id<"ticketTailorSyncRuns"> = await ctx.runMutation(
    internal.sync.internalStartSyncRun,
    {}
  )

  const fallbackNotes: string[] = []
  const errors: string[] = []
  let eventsScanned = 0
  let ordersFetched = 0
  let ordersUpserted = 0
  let ordersArchived = 0
  let attendeesFetched = 0
  let attendeesUpserted = 0
  let attendeesSkipped = 0
  let failedItems = 0

  try {
    const { items: eventPayloads } = await ticketTailorFetchPaginated(
      "/events",
      {
        pageSize: 100,
        maxPages: 200,
      }
    )

    for (const eventPayload of eventPayloads) {
      const providerEventId =
        pickString(eventPayload.id) ??
        pickString(eventPayload.event_id) ??
        pickString(eventPayload.uuid)

      if (!providerEventId) {
        failedItems += 1
        errors.push("Skipped event without provider id")
        continue
      }

      eventsScanned += 1
      const startDateTime =
        parseDate(eventPayload.start_date) ?? parseDate(eventPayload.starts_at)
      const endDateTime =
        parseDate(eventPayload.end_date) ?? parseDate(eventPayload.ends_at)

      const { ticketTailorEventId, canonicalEventId } = await ctx.runMutation(
        internal.sync.internalUpsertTicketTailorEvent,
        {
          providerEventId,
          name:
            pickString(eventPayload.name) ??
            pickString(eventPayload.title) ??
            undefined,
          startsAt: startDateTime ? startDateTime.getTime() : undefined,
          endsAt: endDateTime ? endDateTime.getTime() : undefined,
          timezone:
            pickString(eventPayload.timezone) ??
            pickString(eventPayload.tz) ??
            undefined,
          currency:
            pickString(eventPayload.currency) ??
            pickString(eventPayload.currency_code) ??
            pickString(asRecord(eventPayload.settings).currency) ??
            undefined,
          rawPayload: eventPayload,
        }
      )

      // Fetch orders for this event
      const { items: orderPayloads } = await ticketTailorFetchPaginated(
        `/events/${encodeURIComponent(providerEventId)}/orders`,
        { pageSize: 100, maxPages: 200 }
      )

      const seenProviderOrderIds = new Set<string>()

      for (const orderPayload of orderPayloads) {
        const providerOrderId =
          pickString(orderPayload.id) ??
          pickString(orderPayload.order_id) ??
          pickString(orderPayload.reference)

        if (!providerOrderId) {
          failedItems += 1
          errors.push(
            `Skipped order without provider id for event ${providerEventId}`
          )
          continue
        }

        seenProviderOrderIds.add(providerOrderId)
        ordersFetched += 1

        const orderProviderEventId =
          pickString(orderPayload.event_id) ?? providerEventId
        const buyer =
          pickString(orderPayload.buyer_email) ??
          pickString(asRecord(orderPayload.buyer).email) ??
          pickString(asRecord(orderPayload.buyer_details).email) ??
          undefined

        const buyerFirst =
          pickString(orderPayload.buyer_first_name) ??
          pickString(asRecord(orderPayload.buyer).first_name) ??
          pickString(asRecord(orderPayload.buyer_details).first_name)
        const buyerLast =
          pickString(orderPayload.buyer_last_name) ??
          pickString(asRecord(orderPayload.buyer).last_name) ??
          pickString(asRecord(orderPayload.buyer_details).last_name)
        const buyerName =
          (buyerFirst && buyerLast ? `${buyerFirst} ${buyerLast}` : null) ??
          buyerFirst ??
          buyerLast ??
          pickString(orderPayload.buyer_name) ??
          pickString(asRecord(orderPayload.buyer).name) ??
          undefined

        const { orderId, ticketTailorOrderId } = await ctx.runMutation(
          internal.sync.internalUpsertTicketTailorOrder,
          {
            providerOrderId,
            providerEventId: orderProviderEventId,
            rawPayload: orderPayload,
          }
        )
        ordersUpserted += 1

        // Fetch attendees
        let attendeePayloads: JsonRecord[]
        const embeddedAttendees = extractAttendeeItems(orderPayload)
        if (embeddedAttendees.length > 0) {
          attendeePayloads = embeddedAttendees
        } else {
          try {
            const canonical = await ticketTailorFetch<unknown>(
              `/orders/${providerOrderId}`
            )
            attendeePayloads = extractAttendeeItems(canonical)
            if (attendeePayloads.length > 0) {
              fallbackNotes.push(
                `[${providerOrderId}] fetched attendee records from canonical order payload`
              )
            }
          } catch {
            attendeePayloads = []
          }
        }

        attendeesFetched += attendeePayloads.length

        for (const ap of attendeePayloads) {
          const providerAttendeeId =
            pickString(ap.id) ??
            pickString(ap.attendee_id) ??
            pickString(ap.uuid)
          const providerIssuedTicketId =
            pickString(ap.issued_ticket_id) ?? pickString(ap.barcode)

          if (!providerAttendeeId && !providerIssuedTicketId) {
            attendeesSkipped += 1
            continue
          }

          const attendeeProviderEventId =
            pickString(ap.event_id) ?? orderProviderEventId
          const attendeeProviderOrderId =
            pickString(ap.order_id) ?? providerOrderId
          const ticketTypeLabel =
            pickString(ap.ticket_type) ??
            pickString(ap.ticket_type_name) ??
            "Unknown"

          const attFirst = pickString(ap.first_name)
          const attLast = pickString(ap.last_name)
          const name =
            attFirst && attLast
              ? `${attFirst} ${attLast}`
              : (attFirst ?? attLast ?? pickString(ap.name) ?? undefined)
          const email =
            pickString(ap.email) ?? pickString(ap.attendee_email) ?? undefined
          const ticketStatus =
            pickString(ap.status) ?? pickString(ap.ticket_status) ?? undefined

          await ctx.runMutation(
            internal.sync.internalUpsertTicketTailorAttendee,
            {
              providerAttendeeId: providerAttendeeId ?? undefined,
              providerIssuedTicketId: providerIssuedTicketId ?? undefined,
              providerTicketTypeId: pickString(ap.ticket_type_id) ?? undefined,
              providerEventId: attendeeProviderEventId,
              providerOrderId: attendeeProviderOrderId,
              orderId,
              ticketTypeLabel,
              ticketStatus,
              rawPayload: ap,
            }
          )
          attendeesUpserted += 1
        }

        if (attendeePayloads.length > 1) {
          await linkAttendeesAsFamily(ctx, orderId, attendeePayloads.length)
        }
      }

      // Archive missing orders
      const archiveResult = await ctx.runMutation(
        internal.sync.internalArchiveMissingOrdersForEvent,
        {
          providerEventId,
          seenProviderOrderIds: Array.from(seenProviderOrderIds),
          reason: "missing_from_provider_sync",
        }
      )
      ordersArchived += archiveResult.archived
    }

    const status =
      failedItems === 0 && errors.length === 0
        ? "success"
        : failedItems > 0
          ? "partial"
          : "success"

    await ctx.runMutation(internal.sync.internalCompleteSyncRun, {
      runId,
      status,
      errorSummary:
        errors.length > 0 ? errors.slice(0, 5).join("; ") : undefined,
      diagnostics: {
        attendeesFetched,
        attendeesSkipped,
        attendeesUpserted,
        fallbackNotes,
        errors,
      },
      eventsScanned,
      ordersFetched,
      ordersUpserted,
      ordersArchived,
      failedItems,
    })

    console.log("Ticket Tailor auto-sync completed", {
      runId,
      status,
      eventsScanned,
      ordersUpserted,
      attendeesUpserted,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown sync failure"
    console.error(`Ticket Tailor auto-sync error: ${message}`)

    try {
      await ctx.runMutation(internal.sync.internalCompleteSyncRun, {
        runId,
        status: "failed",
        errorSummary: message,
        diagnostics: {
          attendeesFetched,
          attendeesSkipped,
          attendeesUpserted,
          fallbackNotes,
          errors: [message],
        },
        eventsScanned,
        ordersFetched,
        ordersUpserted,
        ordersArchived,
        failedItems: failedItems + 1,
      })
    } catch {
      // Best-effort completion logging
    }
  }
}

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

  let matched = 0
  for (const payment of unassignedPayments) {
    const normalizedPayer = payment.payerName.toLowerCase().trim()

    // First: try exact booker name match
    const matches = paidOrders.filter(
      (o: { bookerName: string | null }) =>
        o.bookerName?.toLowerCase().trim() === normalizedPayer
    )
    if (matches.length === 1) {
      await ctx.runMutation(internal.payments.internalAssignPaymentToOrder, {
        paymentId: payment._id,
        orderId: matches[0]._id,
        status: "auto_matched",
        matchedBy: "auto",
      })
      matched++
      continue
    }

    // Fallback: try attendee name match with exact amount
    for (const order of paidOrders) {
      const orderAttendees = attendeesByOrder[order._id] ?? []
      const attendeeMatch = orderAttendees.some(
        (name: string) => name === normalizedPayer
      )
      if (
        attendeeMatch &&
        order.totalAmountMinor != null &&
        order.totalAmountMinor === payment.amountMinor
      ) {
        await ctx.runMutation(internal.payments.internalAssignPaymentToOrder, {
          paymentId: payment._id,
          orderId: order._id,
          status: "auto_matched",
          matchedBy: "auto",
        })
        matched++
        break
      }
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

export const autoSyncTicketTailor = internalAction({
  args: {},
  handler: async (ctx) => {
    await runTicketTailorAutoSync(ctx)
  },
})

export const autoSyncTikkiePayments = internalAction({
  args: {},
  handler: async (ctx) => {
    await runTikkieAutoSync(ctx)
  },
})
