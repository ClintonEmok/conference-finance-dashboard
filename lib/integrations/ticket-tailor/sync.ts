import type { Prisma } from "@prisma/client"

import { normalizeTicketTailorStatus } from "@/lib/domain/finance/ticket-tailor-status"
import {
  fetchTicketTailorEventsPaginated,
  fetchTicketTailorOrdersByEventPaginated,
  type TicketTailorEventPayload,
  type TicketTailorOrderPayload,
} from "@/lib/integrations/ticket-tailor/client"
import { prisma } from "@/lib/prisma"

type JsonRecord = Prisma.InputJsonObject

export type TicketTailorSyncOutcome = "running" | "success" | "partial" | "failed"

export type TicketTailorSyncSummary = {
  runId: string
  status: TicketTailorSyncOutcome
  counts: {
    eventsScanned: number
    ordersFetched: number
    ordersUpserted: number
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

export async function runTicketTailorSync(): Promise<TicketTailorSyncSummary> {
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
  let normalizedFallbackCount = 0
  let failedItems = 0

  try {
    const eventsResult = await fetchTicketTailorEventsPaginated({ pageSize: 100, maxPages: 200 })

    for (const eventPayload of eventsResult.items) {
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

        const statusSignals = extractOrderStatusSignals(orderPayload)
        const normalization = normalizeTicketTailorStatus(...statusSignals)
        const orderProviderEventId = extractOrderProviderEventId(orderPayload) ?? providerEventId

        if (normalization.usedFallback) {
          normalizedFallbackCount += 1

          if (normalization.note) {
            fallbackNotes.push(`[${providerOrderId}] ${normalization.note}`)
          }
        }

        await prisma.ticketTailorOrder.upsert({
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
            orderedAt: extractOrderDate(orderPayload),
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
            orderedAt: extractOrderDate(orderPayload),
            refundedAt: extractRefundedAt(orderPayload),
            cancelledAt: extractCancelledAt(orderPayload),
            rawPayload: orderPayload,
          },
        })

        ordersUpserted += 1
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
          fallbackNotes,
          errors,
        },
      },
    })

    return {
      runId: run.id,
      status,
      counts: {
        eventsScanned,
        ordersFetched,
        ordersUpserted,
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
          fallbackNotes,
          errors,
        },
      },
    })

    throw new Error(`Ticket Tailor sync failed: ${message}`)
  }
}
