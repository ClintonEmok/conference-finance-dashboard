import { normalizeTicketTailorStatus } from "@/lib/domain/finance/ticket-tailor-status"
import { api } from "@/lib/convex/api"
import {
  extractCustomAnswers,
  parseGenderFromAnswer,
  parseGenderFromTicketType,
  parseAgeGroupFromTicketType,
  parseTicketCategory,
  detectPriorityFromAnswers,
  type CustomAnswers,
} from "@/lib/domain/ticket-tailor/custom-answers"
import {
  fetchTicketTailorAttendeesForOrder,
  fetchTicketTailorEventsPaginated,
  fetchTicketTailorOrdersByEventPaginated,
  type TicketTailorAttendeePayload,
  type TicketTailorEventPayload,
  type TicketTailorOrderPayload,
} from "@/lib/integrations/ticket-tailor/client"
import { convexMutation, convexQuery } from "@/lib/convex/server"
import type { Id } from "@/convex/_generated/dataModel"

type JsonRecord = Record<string, unknown>

export type TicketTailorSyncOutcome =
  | "running"
  | "success"
  | "partial"
  | "failed"

export type TicketTailorSyncSummary = {
  runId: string
  status: TicketTailorSyncOutcome
  scope: {
    eventId: string | null
    from: string | null
    to: string | null
  }
  counts: {
    eventsScanned: number
    ordersFetched: number
    ordersUpserted: number
    ordersArchived: number
    ordersSkippedByScope: number
    attendeesFetched: number
    attendeesUpserted: number
    attendeesSkipped: number
    normalizedFallbackCount: number
    failedItems: number
  }
  diagnostics: {
    fallbackNotes: string[]
    errors: string[]
  }
}

function asRecord(value: unknown): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {}
  }

  return value as JsonRecord
}

function pickString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null
}

function parseDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsedFromUnix = new Date(value * 1000)
    return Number.isNaN(parsedFromUnix.getTime()) ? null : parsedFromUnix
  }

  if (typeof value !== "string" || !value.trim()) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function parseInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value)
  }

  if (typeof value === "string") {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return Math.round(numeric)
    }
  }

  return null
}

function toMinorAmount(value: unknown) {
  const parsed = parseInteger(value)
  if (parsed !== null) {
    return parsed
  }

  if (typeof value === "string") {
    const decimal = Number(value)
    if (Number.isFinite(decimal)) {
      return Math.round(decimal * 100)
    }
  }

  return null
}

function extractProviderEventId(event: TicketTailorEventPayload) {
  return (
    pickString(event.id) ?? pickString(event.event_id) ?? pickString(event.uuid)
  )
}

function extractProviderOrderId(order: TicketTailorOrderPayload) {
  return (
    pickString(order.id) ??
    pickString(order.order_id) ??
    pickString(order.reference)
  )
}

function extractEventName(event: TicketTailorEventPayload) {
  return pickString(event.name) ?? pickString(event.title)
}

function extractEventTimezone(event: TicketTailorEventPayload) {
  return pickString(event.timezone) ?? pickString(event.tz)
}

function extractEventCurrency(event: TicketTailorEventPayload) {
  return (
    pickString(event.currency) ??
    pickString(event.currency_code) ??
    pickString(asRecord(event.settings).currency)
  )
}

function extractProviderAttendeeId(attendee: TicketTailorAttendeePayload) {
  return (
    pickString(attendee.id) ??
    pickString(attendee.attendee_id) ??
    pickString(attendee.uuid)
  )
}

function extractProviderIssuedTicketId(attendee: TicketTailorAttendeePayload) {
  return pickString(attendee.issued_ticket_id) ?? pickString(attendee.barcode)
}

function extractAttendeeProviderEventId(attendee: TicketTailorAttendeePayload) {
  return pickString(attendee.event_id)
}

function extractAttendeeProviderOrderId(attendee: TicketTailorAttendeePayload) {
  return pickString(attendee.order_id)
}

function extractTicketTypeLabel(attendee: TicketTailorAttendeePayload) {
  return (
    pickString(attendee.ticket_type) ??
    pickString(attendee.ticket_type_name) ??
    "Unknown"
  )
}

function extractAttendeeName(attendee: TicketTailorAttendeePayload) {
  const first = pickString(attendee.first_name)
  const last = pickString(attendee.last_name)
  if (first && last) {
    return `${first} ${last}`
  }
  return first ?? last ?? pickString(attendee.name) ?? null
}

function extractAttendeeEmail(attendee: TicketTailorAttendeePayload) {
  return pickString(attendee.email) ?? pickString(attendee.attendee_email)
}

function extractTicketStatus(attendee: TicketTailorAttendeePayload) {
  return (
    pickString(attendee.status) ?? pickString(attendee.ticket_status) ?? null
  )
}

function extractCheckedInAt(attendee: TicketTailorAttendeePayload) {
  const value = attendee.checked_in_at ?? attendee.scanned_at
  const parsed = parseDate(value)
  return parsed ? parsed.getTime() : null
}

function extractTicketTypeId(attendee: TicketTailorAttendeePayload) {
  return (
    pickString(attendee.ticket_type_id) ?? pickString(attendee.ticket_type_id)
  )
}

function extractOrderDate(order: TicketTailorOrderPayload) {
  return (
    parseDate(order.created_at) ??
    parseDate(order.date) ??
    parseDate(order.order_date)
  )
}

function extractOrderProviderEventId(order: TicketTailorOrderPayload) {
  return pickString(order.event_id)
}

function extractOrderStatusSignals(
  order: TicketTailorOrderPayload
): [string | null, string | null, string | null] {
  return [
    pickString(order.status),
    pickString(order.payment_status),
    pickString(asRecord(order.payment).status),
  ]
}

function extractBuyerEmail(order: TicketTailorOrderPayload) {
  const buyer = asRecord(order.buyer)
  const buyerDetails = asRecord(order.buyer_details)

  return (
    pickString(order.buyer_email) ??
    pickString(buyer.email) ??
    pickString(buyerDetails.email)
  )
}

function extractBuyerName(order: TicketTailorOrderPayload) {
  const buyer = asRecord(order.buyer)
  const buyerDetails = asRecord(order.buyer_details)

  const first =
    pickString(order.buyer_first_name) ??
    pickString(buyer.first_name) ??
    pickString(buyerDetails.first_name)
  const last =
    pickString(order.buyer_last_name) ??
    pickString(buyer.last_name) ??
    pickString(buyerDetails.last_name)

  if (first && last) {
    return `${first} ${last}`
  }

  return (
    first ??
    last ??
    pickString(order.buyer_name) ??
    pickString(buyer.name) ??
    pickString(buyerDetails.name) ??
    null
  )
}

function extractOrderCurrency(order: TicketTailorOrderPayload) {
  return pickString(order.currency) ?? pickString(order.currency_code)
}

function extractOrderTotalMinor(order: TicketTailorOrderPayload) {
  return (
    toMinorAmount(order.total) ??
    toMinorAmount(order.amount) ??
    toMinorAmount(order.total_amount)
  )
}

function extractRefundedAt(order: TicketTailorOrderPayload) {
  const value = order.refunded_at
  const parsed = parseDate(value)
  return parsed ? parsed.getTime() : null
}

function extractCancelledAt(order: TicketTailorOrderPayload) {
  const value = order.cancelled_at
  const parsed = parseDate(value)
  return parsed ? parsed.getTime() : null
}

export type TicketTailorSyncScopeInput = {
  eventId?: string | null
  from?: string | Date | null
  to?: string | Date | null
}

type NormalizedScope = {
  eventId: string | null
  from: Date | null
  to: Date | null
}

function normalizeTicketTailorSyncScope(
  input?: TicketTailorSyncScopeInput
): NormalizedScope {
  return {
    eventId: input?.eventId ? input.eventId.trim() || null : null,
    from: input?.from ? new Date(input.from) : null,
    to: input?.to ? new Date(input.to) : null,
  }
}

function isOrderInScope(orderDate: Date | null, scope: NormalizedScope) {
  if (!orderDate) {
    return true
  }

  if (scope.from && orderDate.getTime() < scope.from.getTime()) {
    return false
  }

  if (scope.to && orderDate.getTime() > scope.to.getTime()) {
    return false
  }

  return true
}

async function linkAttendeesAsFamily(
  orderId: Id<"orders">,
  attendeeCount: number
): Promise<void> {
  const attendees = await convexQuery(
    api.sync.getTicketTailorAttendeesByOrderId,
    {
      orderId,
    }
  )

  if (attendees.length < 2) {
    return
  }

  const firstAttendee = attendees[0]

  const existingFamily = await convexQuery(
    api.sync.getAttendeeFamilyGroupByPrimaryId,
    {
      primaryAttendeeId: firstAttendee._id,
    }
  )

  if (existingFamily) {
    const members = await convexQuery(api.sync.getFamilyMembersByGroupId, {
      familyGroupId: existingFamily._id as Id<"attendeeFamilyGroups">,
    })

    const existingMemberIds = new Set(
      members.map((m: (typeof members)[number]) => m.attendeeId)
    )
    const newMembers = attendees.filter(
      (a: (typeof attendees)[number]) => !existingMemberIds.has(a._id)
    )

    for (const attendee of newMembers) {
      await convexMutation(api.sync.addAttendeeToFamilyGroup, {
        familyGroupId: existingFamily._id as Id<"attendeeFamilyGroups">,
        attendeeId: attendee._id,
      })
    }
  } else {
    const familyGroupId = await convexMutation(
      api.sync.createAttendeeFamilyGroup,
      {
        primaryAttendeeId: firstAttendee._id,
        label: `Family (${attendeeCount} members)`,
      }
    )

    for (const attendee of attendees) {
      await convexMutation(api.sync.addAttendeeToFamilyGroup, {
        familyGroupId: familyGroupId as Id<"attendeeFamilyGroups">,
        attendeeId: attendee._id,
      })
    }
  }
}

function finalizeRunStatus(
  failedItems: number,
  errors: string[]
): "success" | "partial" | "failed" {
  if (failedItems === 0 && errors.length === 0) {
    return "success"
  }

  if (failedItems > 0) {
    return "partial"
  }

  return "success"
}

export async function runTicketTailorSync(
  scopeInput?: TicketTailorSyncScopeInput
): Promise<TicketTailorSyncSummary> {
  const scope = normalizeTicketTailorSyncScope(scopeInput)

  const runId = await convexMutation(api.sync.startSyncRun, {})

  const fallbackNotes: string[] = []
  const errors: string[] = []
  let eventsScanned = 0
  let ordersFetched = 0
  let ordersUpserted = 0
  let ordersArchived = 0
  let ordersSkippedByScope = 0
  let attendeesFetched = 0
  let attendeesUpserted = 0
  let attendeesSkipped = 0
  let normalizedFallbackCount = 0
  let failedItems = 0

  try {
    const eventsResult = await fetchTicketTailorEventsPaginated({
      pageSize: 100,
      maxPages: 200,
    })
    const scopedEvents = eventsResult.items.filter((eventPayload) => {
      if (!scope.eventId) {
        return true
      }

      const providerEventId = extractProviderEventId(eventPayload)
      return providerEventId === scope.eventId
    })

    for (const eventPayload of scopedEvents) {
      const providerEventId = extractProviderEventId(eventPayload)

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

      const eventId = await convexMutation(api.sync.upsertTicketTailorEvent, {
        providerEventId,
        name: extractEventName(eventPayload) ?? undefined,
        startsAt: startDateTime ? startDateTime.getTime() : undefined,
        endsAt: endDateTime ? endDateTime.getTime() : undefined,
        timezone: extractEventTimezone(eventPayload) ?? undefined,
        currency: extractEventCurrency(eventPayload) ?? undefined,
        rawPayload: eventPayload,
      })

      const ordersResult = await fetchTicketTailorOrdersByEventPaginated(
        providerEventId,
        {
          pageSize: 100,
          maxPages: 200,
        }
      )
      const seenProviderOrderIds = new Set<string>()

      for (const orderPayload of ordersResult.items) {
        const providerOrderId = extractProviderOrderId(orderPayload)

        if (!providerOrderId) {
          failedItems += 1
          errors.push(
            `Skipped order without provider id for event ${providerEventId}`
          )
          continue
        }

        seenProviderOrderIds.add(providerOrderId)
        ordersFetched += 1
        const orderedAt = extractOrderDate(orderPayload)

        if (!isOrderInScope(orderedAt, scope)) {
          ordersSkippedByScope += 1
          continue
        }

        const statusSignals = extractOrderStatusSignals(orderPayload)
        const normalization = normalizeTicketTailorStatus(...statusSignals)
        const orderProviderEventId =
          extractOrderProviderEventId(orderPayload) ?? providerEventId

        if (normalization.usedFallback) {
          normalizedFallbackCount += 1

          if (normalization.note) {
            fallbackNotes.push(`[${providerOrderId}] ${normalization.note}`)
          }
        }

        const orderId = await convexMutation(api.sync.upsertTicketTailorOrder, {
          providerOrderId,
          providerEventId: orderProviderEventId,
          eventId,
          normalizedStatus: normalization.normalizedStatus,
          providerStatus:
            statusSignals.find((signal) => Boolean(signal)) ?? undefined,
          normalizationNote: normalization.note ?? undefined,
          buyerEmail: extractBuyerEmail(orderPayload) ?? undefined,
          buyerName: extractBuyerName(orderPayload) ?? undefined,
          currency: extractOrderCurrency(orderPayload) ?? undefined,
          totalAmountMinor: extractOrderTotalMinor(orderPayload) ?? undefined,
          orderedAt: orderedAt ? orderedAt.getTime() : undefined,
          refundedAt: extractRefundedAt(orderPayload) ?? undefined,
          cancelledAt: extractCancelledAt(orderPayload) ?? undefined,
          rawPayload: orderPayload,
        })

        ordersUpserted += 1

        // Fetch the ticketTailorOrder to get the canonical orderId
        const ttOrder = await convexQuery(
          api.sync.getTicketTailorOrderByProviderId,
          {
            providerOrderId: providerOrderId,
          }
        )
        const canonicalOrderId = ttOrder?.orderId

        const attendeeResult =
          await fetchTicketTailorAttendeesForOrder(orderPayload)
        attendeesFetched += attendeeResult.items.length

        if (attendeeResult.usedFallback) {
          fallbackNotes.push(
            `[${providerOrderId}] fetched attendee records from canonical order payload`
          )
        }

        for (const attendeePayload of attendeeResult.items) {
          const providerAttendeeId = extractProviderAttendeeId(attendeePayload)
          const providerIssuedTicketId =
            extractProviderIssuedTicketId(attendeePayload)

          if (!providerAttendeeId && !providerIssuedTicketId) {
            attendeesSkipped += 1
            errors.push(
              `Skipped attendee without provider identifiers for order ${providerOrderId}`
            )
            continue
          }

          const attendeeProviderEventId =
            extractAttendeeProviderEventId(attendeePayload) ??
            orderProviderEventId
          const attendeeProviderOrderId =
            extractAttendeeProviderOrderId(attendeePayload) ?? providerOrderId

          const ticketTypeLabel = extractTicketTypeLabel(attendeePayload)
          const customQuestions = (attendeePayload as Record<string, unknown>)
            .custom_questions as
            | Array<{
                question: string
                answer: string | null
              }>
            | undefined
          const customAnswers = extractCustomAnswers(customQuestions ?? [])
          const genderTypeFromAnswer = parseGenderFromAnswer(
            customAnswers.gender
          )
          const genderType =
            genderTypeFromAnswer !== "UNKNOWN"
              ? genderTypeFromAnswer
              : parseGenderFromTicketType(ticketTypeLabel)
          const ageGroup =
            parseAgeGroupFromTicketType(ticketTypeLabel) ?? undefined
          const ticketCategory =
            parseTicketCategory(ticketTypeLabel) ?? undefined
          const { priority, reason } = detectPriorityFromAnswers(customAnswers)

          await convexMutation(api.sync.upsertTicketTailorAttendee, {
            providerAttendeeId: providerAttendeeId ?? undefined,
            providerIssuedTicketId: providerIssuedTicketId ?? undefined,
            providerTicketTypeId:
              extractTicketTypeId(attendeePayload) ?? undefined,
            providerEventId: attendeeProviderEventId,
            providerOrderId: attendeeProviderOrderId,
            eventId,
            orderId: canonicalOrderId,
            name: extractAttendeeName(attendeePayload) ?? undefined,
            email: extractAttendeeEmail(attendeePayload) ?? undefined,
            ticketTypeLabel,
            ticketStatus: extractTicketStatus(attendeePayload) ?? undefined,
            rawPayload: attendeePayload,
            customAnswers,
            genderType,
            ageGroup,
            ticketCategory,
            allocationPriority: priority,
            priorityReason: reason ?? undefined,
          })

          attendeesUpserted += 1
        }

        if (attendeeResult.items.length > 1 && canonicalOrderId) {
          await linkAttendeesAsFamily(
            canonicalOrderId,
            attendeeResult.items.length
          )
        }
      }

      const archiveResult = await convexMutation(
        api.sync.archiveMissingOrdersForEvent,
        {
          providerEventId,
          seenProviderOrderIds: Array.from(seenProviderOrderIds),
          reason: "missing_from_provider_sync",
        }
      )
      ordersArchived += archiveResult.archived
    }

    const status = finalizeRunStatus(failedItems, errors)

    await convexMutation(api.sync.completeSyncRun, {
      runId: runId as Id<"ticketTailorSyncRuns">,
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
      normalizedFallbackCount,
      failedItems,
    })

    return {
      runId,
      status,
      scope: {
        eventId: scope.eventId,
        from: scope.from ? scope.from.toISOString() : null,
        to: scope.to ? scope.to.toISOString() : null,
      },
      counts: {
        eventsScanned,
        ordersFetched,
        ordersUpserted,
        ordersArchived,
        ordersSkippedByScope,
        attendeesFetched,
        attendeesUpserted,
        attendeesSkipped,
        normalizedFallbackCount,
        failedItems,
      },
      diagnostics: {
        fallbackNotes,
        errors,
      },
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown sync failure"
    errors.push(message)

    await convexMutation(api.sync.completeSyncRun, {
      runId: runId as Id<"ticketTailorSyncRuns">,
      status: "failed",
      errorSummary: message,
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
      normalizedFallbackCount,
      failedItems: failedItems + 1,
    })

    throw new Error(`Ticket Tailor sync failed: ${message}`)
  }
}
