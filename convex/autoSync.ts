import { internalAction } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"

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

// --- Ticket Tailor HTTP client (minimal, action-safe) ---

const TT_BASE_URL =
  process.env.TICKET_TAILOR_BASE_URL?.trim() ||
  "https://api.tickettailor.com/v1"
const TT_API_KEY = process.env.TICKET_TAILOR_API_KEY?.trim() ?? ""
const TT_TIMEOUT = Number(process.env.TICKET_TAILOR_FETCH_TIMEOUT_MS ?? 15_000)
const TT_MAX_RETRIES = Number(process.env.TICKET_TAILOR_MAX_RETRIES ?? 2)

function ttHeaders() {
  const encoded = Buffer.from(TT_API_KEY).toString("base64")
  return {
    Authorization: `Basic ${encoded}`,
    Accept: "application/json",
    "User-Agent": "conference-finance-dashboard/1.0",
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

async function ttFetch<T>(
  path: string,
  query?: Record<string, string | number | undefined>
): Promise<T> {
  const url = new URL(`${TT_BASE_URL}${path}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v))
    }
  }

  const maxAttempts = TT_MAX_RETRIES + 1
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TT_TIMEOUT)
    try {
      const res = await fetch(url, {
        headers: ttHeaders(),
        cache: "no-store",
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (!res.ok) {
        if (
          (res.status >= 500 || res.status === 429) &&
          attempt < maxAttempts
        ) {
          await sleep(500 * attempt)
          continue
        }
        const text = await res.text()
        throw new Error(`Ticket Tailor request failed (${res.status}): ${text}`)
      }
      return (await res.json()) as T
    } catch (error) {
      clearTimeout(timer)
      lastError = error
      if (
        error instanceof Error &&
        error.message.startsWith("Ticket Tailor request failed")
      ) {
        throw error
      }
      const retryable =
        (error instanceof DOMException && error.name === "AbortError") ||
        error instanceof TypeError
      if (retryable && attempt < maxAttempts) {
        await sleep(500 * attempt)
        continue
      }
      throw error
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Ticket Tailor request failed after retries")
}

function extractItems(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload))
    return payload.filter(
      (i): i is JsonRecord => typeof i === "object" && i !== null
    )
  const rec = asRecord(payload)
  for (const key of ["data", "results", "items", "orders", "events"]) {
    const arr = rec[key]
    if (Array.isArray(arr) && arr.length > 0)
      return arr.filter(
        (i): i is JsonRecord => typeof i === "object" && i !== null
      )
  }
  return []
}

function extractAttendeeItems(payload: unknown): JsonRecord[] {
  const root = asRecord(payload)
  const nestedData = asRecord(root.data)
  for (const key of ["issued_tickets", "attendees", "tickets"]) {
    const arr = root[key] ?? nestedData[key]
    if (Array.isArray(arr) && arr.length > 0)
      return arr.filter(
        (i): i is JsonRecord => typeof i === "object" && i !== null
      )
  }
  return []
}

async function ttFetchPaginated(
  path: string,
  pageSize = 100,
  maxPages = 200
): Promise<JsonRecord[]> {
  const all: JsonRecord[] = []
  let cursorQuery: Record<string, string | number | undefined> = {
    limit: pageSize,
  }
  for (let page = 1; page <= maxPages; page++) {
    const payload = await ttFetch<unknown>(path, cursorQuery)
    const items = extractItems(payload)
    if (items.length === 0) break
    all.push(...items)

    // Check for cursor-based next page
    const root = asRecord(payload)
    const links = asRecord(root.links)
    const next = typeof links.next === "string" ? links.next : null
    if (next) {
      try {
        const nextUrl = new URL(next, "https://api.tickettailor.com")
        const startingAfter = nextUrl.searchParams.get("starting_after")
        const limit = nextUrl.searchParams.get("limit")
        cursorQuery = {
          starting_after: startingAfter ?? undefined,
          limit: limit ?? undefined,
        }
        continue
      } catch {
        /* fall through */
      }
    }

    // Check pagination metadata
    const pagination = asRecord(root.pagination)
    const metaPagination = asRecord(asRecord(root.meta).pagination)
    const nextPage =
      typeof pagination.next_page === "number"
        ? pagination.next_page
        : typeof metaPagination.next_page === "number"
          ? metaPagination.next_page
          : undefined
    if (typeof nextPage === "number" && nextPage >= 1) {
      cursorQuery = { page: nextPage, per_page: pageSize }
      continue
    }

    const totalPages =
      typeof pagination.total_pages === "number"
        ? pagination.total_pages
        : typeof metaPagination.total_pages === "number"
          ? metaPagination.total_pages
          : undefined
    if (typeof totalPages === "number" && page < totalPages) {
      cursorQuery = { page: page + 1, per_page: pageSize }
      continue
    }

    if (items.length < pageSize) break
    cursorQuery = { page: page + 1, per_page: pageSize }
  }
  return all
}

// --- Family linking (reuses existing queries via ctx.runQuery) ---

async function linkAttendeesAsFamily(
  ctx: { runQuery: Function; runMutation: Function },
  orderId: string,
  attendeeCount: number
): Promise<void> {
  const attendees = await ctx.runQuery(
    internal.sync.internalGetTicketTailorAttendeesByOrderId,
    { orderId }
  )
  if (attendees.length < 2) return

  const firstAttendee = attendees[0]
  const existingFamily = await ctx.runQuery(
    internal.sync.internalGetAttendeeFamilyGroupByPrimaryId,
    {
      primaryAttendeeId: firstAttendee._id,
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
    for (const attendee of attendees) {
      if (!existingMemberIds.has(attendee._id)) {
        await ctx.runMutation(internal.sync.internalAddAttendeeToFamilyGroup, {
          familyGroupId: existingFamily._id,
          attendeeId: attendee._id,
        })
      }
    }
  } else {
    const familyGroupId = await ctx.runMutation(
      internal.sync.internalCreateAttendeeFamilyGroup,
      {
        primaryAttendeeId: firstAttendee._id,
        label: `Family (${attendeeCount} members)`,
      }
    )
    for (const attendee of attendees) {
      await ctx.runMutation(internal.sync.internalAddAttendeeToFamilyGroup, {
        familyGroupId,
        attendeeId: attendee._id,
      })
    }
  }
}

// --- Ticket Tailor sync handler ---

async function runTicketTailorAutoSync(ctx: {
  runQuery: Function
  runMutation: Function
}) {
  if (!TT_API_KEY) {
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
    const eventPayloads = await ttFetchPaginated("/events", 100, 200)

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
      let orderPayloads: JsonRecord[]
      try {
        orderPayloads = await ttFetchPaginated(
          `/events/${encodeURIComponent(providerEventId)}/orders`,
          100,
          200
        )
      } catch (error) {
        const msg = error instanceof Error ? error.message : ""
        if (/\(404\)|PAGE_NOT_FOUND|Not Found/i.test(msg)) {
          // Fallback: fetch all orders and filter
          const allOrders = await ttFetchPaginated("/orders", 100, 200)
          orderPayloads = allOrders.filter((o) => {
            const eid =
              pickString(o.event_id) ??
              pickString(o.eventId) ??
              pickString(asRecord(o.event).id)
            return eid === providerEventId
          })
        } else {
          throw error
        }
      }

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

        const orderId: Id<"ticketTailorOrders"> = await ctx.runMutation(
          internal.sync.internalUpsertTicketTailorOrder,
          {
            providerOrderId,
            providerEventId: orderProviderEventId,
            eventId: canonicalEventId,
            buyerEmail: buyer,
            buyerName,
            currency:
              pickString(orderPayload.currency) ??
              pickString(orderPayload.currency_code) ??
              undefined,
            totalAmountMinor:
              toMinorAmount(orderPayload.total) ??
              toMinorAmount(orderPayload.amount) ??
              toMinorAmount(orderPayload.total_amount) ??
              undefined,
            orderedAt: (
              parseDate(orderPayload.created_at) ??
              parseDate(orderPayload.date) ??
              parseDate(orderPayload.order_date)
            )?.getTime(),
            refundedAt:
              parseDate(orderPayload.refunded_at)?.getTime() ?? undefined,
            cancelledAt:
              parseDate(orderPayload.cancelled_at)?.getTime() ?? undefined,
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
            const canonical = await ttFetch<unknown>(
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
              eventId: canonicalEventId,
              orderId,
              name,
              email,
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
  // Query unassigned payments and paid orders, match by payer name
  const unassignedPayments = await ctx.runQuery(
    internal.sync.internalGetUnassignedPayments,
    {}
  )
  const paidOrders = await ctx.runQuery(internal.sync.internalGetPaidOrders, {})

  let matched = 0
  for (const payment of unassignedPayments) {
    const matches = paidOrders.filter(
      (o: { buyerName: string | null }) =>
        o.buyerName?.toLowerCase() === payment.payerName.toLowerCase()
    )
    if (matches.length === 1) {
      await ctx.runMutation(internal.payments.internalAssignPaymentToOrder, {
        paymentId: payment._id,
        orderId: matches[0]._id,
        status: "auto_matched",
        matchedBy: "auto",
      })
      matched++
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
