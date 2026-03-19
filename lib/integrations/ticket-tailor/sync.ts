import type { Prisma } from "@prisma/client"

import { normalizeTicketTailorStatus } from "@/lib/domain/finance/ticket-tailor-status"
import {
  fetchTicketTailorAttendeesForOrder,
  fetchTicketTailorEventsPaginated,
  fetchTicketTailorOrdersByEventPaginated,
  type TicketTailorAttendeePayload,
  type TicketTailorEventPayload,
  type TicketTailorOrderPayload,
} from "@/lib/integrations/ticket-tailor/client"
import { prisma } from "@/lib/prisma"

type JsonRecord = Prisma.InputJsonObject

export type TicketTailorSyncOutcome = "running" | "success" | "partial" | "failed"

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
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
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
  return pickString(event.id) ?? pickString(event.event_id) ?? pickString(event.uuid)
}

function extractProviderOrderId(order: TicketTailorOrderPayload) {
  return pickString(order.id) ?? pickString(order.order_id) ?? pickString(order.reference)
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

function extractOrderStatusSignals(order: TicketTailorOrderPayload) {
  const payment = asRecord(order.payment)
  const financial = asRecord(order.financial)

  return [
    pickString(order.status),
    pickString(order.order_status),
    pickString(order.payment_status),
    pickString(payment.status),
    pickString(financial.status),
  ]
}

function extractOrderProviderEventId(order: TicketTailorOrderPayload) {
  const event = asRecord(order.event)
  const eventSummary = asRecord(order.event_summary)

  return (
    pickString(order.event_id) ??
    pickString(order.eventId) ??
    pickString(event.id) ??
    pickString(event.event_id) ??
    pickString(eventSummary.id) ??
    pickString(eventSummary.event_id)
  )
}

function extractOrderCurrency(order: TicketTailorOrderPayload) {
  return (
    pickString(order.currency) ??
    pickString(order.currency_code) ??
    pickString(asRecord(order.payment).currency)
  )
}

function extractBuyerEmail(order: TicketTailorOrderPayload) {
  const buyerDetails = asRecord(order.buyer_details)
  const customer = asRecord(order.customer)
  const buyer = asRecord(order.buyer)

  return (
    pickString(order.email) ??
    pickString(customer.email) ??
    pickString(buyer.email) ??
    pickString(buyerDetails.email)
  )
}

function extractBuyerName(order: TicketTailorOrderPayload) {
  const buyerDetails = asRecord(order.buyer_details)
  const customer = asRecord(order.customer)
  const buyer = asRecord(order.buyer)

  const firstName = pickString(customer.first_name) ?? pickString(buyer.first_name)
  const lastName = pickString(customer.last_name) ?? pickString(buyer.last_name)
  const fullName =
    pickString(order.name) ??
    pickString(customer.name) ??
    pickString(buyer.name) ??
    pickString(buyerDetails.name)

  if (fullName) {
    return fullName
  }

  if (firstName && lastName) {
    return `${firstName} ${lastName}`
  }

  return firstName ?? lastName
}

function extractOrderTotalMinor(order: TicketTailorOrderPayload) {
  return (
    toMinorAmount(order.total_amount_minor) ??
    toMinorAmount(order.total_amount) ??
    toMinorAmount(order.total_paid) ??
    toMinorAmount(order.total) ??
    toMinorAmount(asRecord(order.financial).total_amount_minor) ??
    toMinorAmount(asRecord(order.financial).total_amount)
  )
}

function extractProviderAttendeeId(attendee: TicketTailorAttendeePayload) {
  return pickString(attendee.attendee_id) ?? pickString(attendee.attendeeId)
}

function extractProviderIssuedTicketId(attendee: TicketTailorAttendeePayload) {
  return (
    pickString(attendee.issued_ticket_id) ??
    pickString(attendee.issuedTicketId) ??
    pickString(attendee.id) ??
    pickString(attendee.ticket_id)
  )
}

function extractAttendeeProviderEventId(attendee: TicketTailorAttendeePayload) {
  return pickString(attendee.event_id) ?? pickString(attendee.eventId)
}

function extractAttendeeProviderOrderId(attendee: TicketTailorAttendeePayload) {
  return pickString(attendee.order_id) ?? pickString(attendee.orderId)
}

function extractAttendeeName(attendee: TicketTailorAttendeePayload) {
  const fullName =
    pickString(attendee.full_name) ??
    pickString(attendee.name) ??
    pickString(attendee.display_name) ??
    pickString(attendee.attendee_name)

  if (fullName) {
    return fullName
  }

  const firstName = pickString(attendee.first_name) ?? pickString(attendee.firstName)
  const lastName = pickString(attendee.last_name) ?? pickString(attendee.lastName)

  if (firstName && lastName) {
    return `${firstName} ${lastName}`
  }

  return firstName ?? lastName
}

function extractAttendeeEmail(attendee: TicketTailorAttendeePayload) {
  return pickString(attendee.email) ?? pickString(attendee.attendee_email)
}

function extractTicketTypeLabel(attendee: TicketTailorAttendeePayload) {
  return (
    pickString(attendee.description) ??
    pickString(attendee.ticket_type_name) ??
    pickString(attendee.ticket_name) ??
    pickString(attendee.title)
  )
}

function extractTicketTypeId(attendee: TicketTailorAttendeePayload) {
  return (
    pickString(attendee.ticket_type_id) ??
    pickString(attendee.ticketTypeId) ??
    pickString(attendee.item_id)
  )
}

function extractTicketStatus(attendee: TicketTailorAttendeePayload) {
  return pickString(attendee.status) ?? pickString(attendee.ticket_status)
}

function extractCheckedInAt(attendee: TicketTailorAttendeePayload) {
  const checkedInAt =
    parseDate(attendee.checked_in_at) ??
    parseDate(attendee.checkedInAt) ??
    parseDate(attendee.checked_in_date)

  if (checkedInAt) {
    return checkedInAt
  }

  const checkedIn = attendee.checked_in

  if (checkedIn === true || checkedIn === "true" || checkedIn === "1") {
    return parseDate(attendee.updated_at) ?? parseDate(attendee.created_at)
  }

  return null
}

function extractOrderDate(order: TicketTailorOrderPayload) {
  return (
    parseDate(order.created_at) ??
    parseDate(order.ordered_at) ??
    parseDate(order.completed_at) ??
    parseDate(order.updated_at)
  )
}

function extractRefundedAt(order: TicketTailorOrderPayload) {
  return parseDate(order.refunded_at) ?? parseDate(asRecord(order.financial).refunded_at)
}

function extractCancelledAt(order: TicketTailorOrderPayload) {
  return parseDate(order.cancelled_at) ?? parseDate(order.canceled_at)
}

function finalizeRunStatus(failedItems: number, errors: string[]): TicketTailorSyncOutcome {
  if (errors.length > 0 && failedItems > 0) {
    return "failed"
  }

  if (failedItems > 0) {
    return "partial"
  }

  return "success"
}

export type TicketTailorSyncScopeInput = {
  eventId?: string | null
  from?: string | Date | null
  to?: string | Date | null
}

type NormalizedTicketTailorSyncScope = {
  eventId: string | null
  from: Date | null
  to: Date | null
}

function normalizeScopeDate(value: string | Date | null | undefined) {
  if (!value) {
    return null
  }

  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function normalizeTicketTailorSyncScope(
  scope?: TicketTailorSyncScopeInput,
): NormalizedTicketTailorSyncScope {
  const eventId = typeof scope?.eventId === "string" && scope.eventId.trim() ? scope.eventId.trim() : null
  const from = normalizeScopeDate(scope?.from)
  const to = normalizeScopeDate(scope?.to)

  if ((scope?.from && !from) || (scope?.to && !to)) {
    throw new Error("Invalid scope dates. Provide ISO-8601 compatible dates.")
  }

  if (from && to && from.getTime() > to.getTime()) {
    throw new Error("Invalid scope date range. 'from' must be less than or equal to 'to'.")
  }

  return { eventId, from, to }
}

function isOrderInScope(orderDate: Date | null, scope: NormalizedTicketTailorSyncScope) {
  if (!scope.from && !scope.to) {
    return true
  }

  if (!orderDate) {
    return false
  }

  if (scope.from && orderDate.getTime() < scope.from.getTime()) {
    return false
  }

  if (scope.to && orderDate.getTime() > scope.to.getTime()) {
    return false
  }

  return true
}

export async function runTicketTailorSync(
  scopeInput?: TicketTailorSyncScopeInput,
): Promise<TicketTailorSyncSummary> {
  const scope = normalizeTicketTailorSyncScope(scopeInput)

  const run = await prisma.ticketTailorSyncRun.create({
    data: {
      status: "running",
      diagnostics: {
        fallbackNotes: [],
        errors: [],
      },
    },
    select: { id: true },
  })

  const fallbackNotes: string[] = []
  const errors: string[] = []
  let eventsScanned = 0
  let ordersFetched = 0
  let ordersUpserted = 0
  let ordersSkippedByScope = 0
  let attendeesFetched = 0
  let attendeesUpserted = 0
  let attendeesSkipped = 0
  let normalizedFallbackCount = 0
  let failedItems = 0

  try {
    const eventsResult = await fetchTicketTailorEventsPaginated({ pageSize: 100, maxPages: 200 })
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

      const eventRecord = await prisma.ticketTailorEvent.upsert({
        where: {
          providerEventId,
        },
        create: {
          providerEventId,
          name: extractEventName(eventPayload),
          startsAt: parseDate(eventPayload.start_date) ?? parseDate(eventPayload.starts_at),
          endsAt: parseDate(eventPayload.end_date) ?? parseDate(eventPayload.ends_at),
          timezone: extractEventTimezone(eventPayload),
          currency: extractEventCurrency(eventPayload),
          rawPayload: eventPayload,
        },
        update: {
          name: extractEventName(eventPayload),
          startsAt: parseDate(eventPayload.start_date) ?? parseDate(eventPayload.starts_at),
          endsAt: parseDate(eventPayload.end_date) ?? parseDate(eventPayload.ends_at),
          timezone: extractEventTimezone(eventPayload),
          currency: extractEventCurrency(eventPayload),
          rawPayload: eventPayload,
        },
        select: {
          id: true,
        },
      })

      const ordersResult = await fetchTicketTailorOrdersByEventPaginated(providerEventId, {
        pageSize: 100,
        maxPages: 200,
      })

      for (const orderPayload of ordersResult.items) {
        const providerOrderId = extractProviderOrderId(orderPayload)

        if (!providerOrderId) {
          failedItems += 1
          errors.push(`Skipped order without provider id for event ${providerEventId}`)
          continue
        }

        ordersFetched += 1
        const orderedAt = extractOrderDate(orderPayload)

        if (!isOrderInScope(orderedAt, scope)) {
          ordersSkippedByScope += 1
          continue
        }

        const statusSignals = extractOrderStatusSignals(orderPayload)
        const normalization = normalizeTicketTailorStatus(...statusSignals)
        const orderProviderEventId = extractOrderProviderEventId(orderPayload) ?? providerEventId

        if (normalization.usedFallback) {
          normalizedFallbackCount += 1

          if (normalization.note) {
            fallbackNotes.push(`[${providerOrderId}] ${normalization.note}`)
          }
        }

        const orderRecord = await prisma.ticketTailorOrder.upsert({
          where: {
            providerOrderId,
          },
          create: {
            providerOrderId,
            providerEventId: orderProviderEventId,
            eventId: eventRecord.id,
            normalizedStatus: normalization.normalizedStatus,
            providerStatus: statusSignals.find((signal) => Boolean(signal)) ?? null,
            normalizationNote: normalization.note,
            buyerEmail: extractBuyerEmail(orderPayload),
            buyerName: extractBuyerName(orderPayload),
            currency: extractOrderCurrency(orderPayload),
            totalAmountMinor: extractOrderTotalMinor(orderPayload),
            orderedAt,
            refundedAt: extractRefundedAt(orderPayload),
            cancelledAt: extractCancelledAt(orderPayload),
            rawPayload: orderPayload,
          },
          update: {
            providerEventId: orderProviderEventId,
            eventId: eventRecord.id,
            normalizedStatus: normalization.normalizedStatus,
            providerStatus: statusSignals.find((signal) => Boolean(signal)) ?? null,
            normalizationNote: normalization.note,
            buyerEmail: extractBuyerEmail(orderPayload),
            buyerName: extractBuyerName(orderPayload),
            currency: extractOrderCurrency(orderPayload),
            totalAmountMinor: extractOrderTotalMinor(orderPayload),
            orderedAt,
            refundedAt: extractRefundedAt(orderPayload),
            cancelledAt: extractCancelledAt(orderPayload),
            rawPayload: orderPayload,
          },
          select: {
            id: true,
          },
        })

        ordersUpserted += 1

        const attendeeResult = await fetchTicketTailorAttendeesForOrder(orderPayload)
        attendeesFetched += attendeeResult.items.length

        if (attendeeResult.usedFallback) {
          fallbackNotes.push(
            `[${providerOrderId}] fetched attendee records from canonical order payload`,
          )
        }

        for (const attendeePayload of attendeeResult.items) {
          const providerAttendeeId = extractProviderAttendeeId(attendeePayload)
          const providerIssuedTicketId = extractProviderIssuedTicketId(attendeePayload)

          if (!providerAttendeeId && !providerIssuedTicketId) {
            attendeesSkipped += 1
            errors.push(`Skipped attendee without provider identifiers for order ${providerOrderId}`)
            continue
          }

          const attendeeProviderEventId =
            extractAttendeeProviderEventId(attendeePayload) ?? orderProviderEventId
          const attendeeProviderOrderId =
            extractAttendeeProviderOrderId(attendeePayload) ?? providerOrderId

          await prisma.ticketTailorAttendee.upsert({
            where: providerAttendeeId
              ? {
                  providerAttendeeId,
                }
              : {
                  providerIssuedTicketId: providerIssuedTicketId!,
                },
            create: {
              providerAttendeeId,
              providerIssuedTicketId,
              providerTicketTypeId: extractTicketTypeId(attendeePayload),
              providerEventId: attendeeProviderEventId,
              providerOrderId: attendeeProviderOrderId,
              eventId: eventRecord.id,
              orderId: orderRecord.id,
              name: extractAttendeeName(attendeePayload),
              email: extractAttendeeEmail(attendeePayload),
              ticketTypeLabel: extractTicketTypeLabel(attendeePayload),
              ticketStatus: extractTicketStatus(attendeePayload),
              checkedInAt: extractCheckedInAt(attendeePayload),
              rawPayload: attendeePayload,
            },
            update: {
              providerIssuedTicketId,
              providerTicketTypeId: extractTicketTypeId(attendeePayload),
              providerEventId: attendeeProviderEventId,
              providerOrderId: attendeeProviderOrderId,
              eventId: eventRecord.id,
              orderId: orderRecord.id,
              name: extractAttendeeName(attendeePayload),
              email: extractAttendeeEmail(attendeePayload),
              ticketTypeLabel: extractTicketTypeLabel(attendeePayload),
              ticketStatus: extractTicketStatus(attendeePayload),
              checkedInAt: extractCheckedInAt(attendeePayload),
              rawPayload: attendeePayload,
            },
          })

          attendeesUpserted += 1
        }
      }
    }

    const status = finalizeRunStatus(failedItems, errors)

    await prisma.ticketTailorSyncRun.update({
      where: { id: run.id },
      data: {
        status,
        finishedAt: new Date(),
        eventsScanned,
        ordersFetched,
        ordersUpserted,
        normalizedFallbackCount,
        failedItems,
        errorSummary: errors.length > 0 ? errors.slice(0, 5).join("; ") : null,
        diagnostics: {
          attendeesFetched,
          attendeesSkipped,
          attendeesUpserted,
          fallbackNotes,
          errors,
        },
      },
    })

    return {
      runId: run.id,
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
    const message = error instanceof Error ? error.message : "Unknown sync failure"
    errors.push(message)

    await prisma.ticketTailorSyncRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        eventsScanned,
        ordersFetched,
        ordersUpserted,
        normalizedFallbackCount,
        failedItems: failedItems + 1,
        errorSummary: message,
        diagnostics: {
          attendeesFetched,
          attendeesSkipped,
          attendeesUpserted,
          fallbackNotes,
          errors,
        },
      },
    })

    throw new Error(`Ticket Tailor sync failed: ${message}`)
  }
}
