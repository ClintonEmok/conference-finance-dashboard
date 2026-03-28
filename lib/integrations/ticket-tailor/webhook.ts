import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"

import { api } from "@/lib/convex/api"
import { convexMutation, convexQuery } from "@/lib/convex/server"
import type { Id } from "@/convex/_generated/dataModel"
import { fetchTicketTailorCanonicalPayload } from "@/lib/integrations/ticket-tailor/client"

type IncomingHeaders = Headers

type JsonRecord = Record<string, unknown>

export type TicketTailorWebhookIngestResult = {
  eventId: string
  providerEventId: string
  duplicate: boolean
}

type ProcessResult = {
  status: "processed" | "failed"
  attempts: number
  nextRetryAt: string | null
  lastError: string | null
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null
}

function getHeader(headers: IncomingHeaders, key: string) {
  return pickString(headers.get(key))
}

function inferProviderEventId(headers: IncomingHeaders, payload: JsonRecord) {
  const fromHeader =
    getHeader(headers, "x-ticket-tailor-event-id") ??
    getHeader(headers, "x-event-id") ??
    getHeader(headers, "x-webhook-id")

  if (fromHeader) {
    return fromHeader
  }

  return (
    pickString(payload.id) ??
    pickString(payload.event_id) ??
    pickString(payload.webhook_id) ??
    randomUUID()
  )
}

function inferEventType(payload: JsonRecord) {
  return pickString(payload.event) ?? pickString(payload.type) ?? "unknown"
}

function computeBackoffSeconds(attempts: number) {
  return Math.min(30 * 2 ** Math.max(0, attempts - 1), 60 * 60)
}

function asRecord(value: unknown): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {}
  }

  return value as JsonRecord
}

export function verifyTicketTailorWebhook(
  headers: IncomingHeaders,
  rawBody: string
) {
  const expected = process.env.TICKET_TAILOR_WEBHOOK_SECRET?.trim()

  if (!expected) {
    return false
  }

  const provided =
    getHeader(headers, "x-ticket-tailor-signature") ??
    getHeader(headers, "x-webhook-signature")

  if (!provided) {
    return false
  }

  const digest = createHmac("sha256", expected)
    .update(rawBody, "utf8")
    .digest("hex")
  const providedBuffer = Buffer.from(provided, "utf8")
  const digestBuffer = Buffer.from(digest, "utf8")

  if (providedBuffer.length !== digestBuffer.length) {
    return false
  }

  return timingSafeEqual(providedBuffer, digestBuffer)
}

export async function ingestTicketTailorWebhook(
  headers: IncomingHeaders,
  payloadInput: unknown
): Promise<TicketTailorWebhookIngestResult> {
  const payload = asRecord(payloadInput)
  const providerEventId = inferProviderEventId(headers, payload)
  const eventType = inferEventType(payload)

  const existing = await convexQuery(api.sync.getWebhookEventByProviderId, {
    providerEventId,
  })

  if (existing) {
    await convexMutation(api.sync.updateWebhookEvent, {
      eventId: existing._id as Id<"ticketTailorWebhookEvents">,
      deliveryCount: (existing.deliveryCount ?? 0) + 1,
      lastReceivedAt: Date.now(),
      payload,
    })

    return {
      eventId: existing._id,
      providerEventId,
      duplicate: true,
    }
  }

  const eventId = await convexMutation(api.sync.createWebhookEvent, {
    providerEventId,
    eventType,
    payload,
  })

  return {
    eventId,
    providerEventId,
    duplicate: false,
  }
}

export async function processTicketTailorWebhookEvent(
  eventId: string
): Promise<ProcessResult> {
  const event = await convexQuery(api.sync.getWebhookEventById, {
    eventId: eventId as Id<"ticketTailorWebhookEvents">,
  })

  if (!event) {
    throw new Error(`Webhook event not found: ${eventId}`)
  }

  const attempts = (event.attempts ?? 0) + 1

  try {
    const canonicalPayload = await fetchTicketTailorCanonicalPayload(
      asRecord(event.payload)
    )

    await convexMutation(api.sync.updateWebhookEvent, {
      eventId: event._id,
      attempts,
      status: "processed",
      lastError: undefined,
      nextRetryAt: undefined,
      canonicalPayload,
      canonicalFetchedAt: Date.now(),
      processedAt: Date.now(),
    })

    return {
      status: "processed",
      attempts,
      nextRetryAt: null,
      lastError: null,
    }
  } catch (error) {
    const seconds = computeBackoffSeconds(attempts)
    const nextRetry = new Date(Date.now() + seconds * 1000)
    const lastError =
      error instanceof Error ? error.message : "Unknown processing error"

    await convexMutation(api.sync.updateWebhookEvent, {
      eventId: event._id,
      attempts,
      status: "failed",
      lastError,
      nextRetryAt: nextRetry.getTime(),
    })

    return {
      status: "failed",
      attempts,
      nextRetryAt: nextRetry.toISOString(),
      lastError,
    }
  }
}

export async function processTicketTailorRetryBatch(limit = 20) {
  const queued = await convexQuery(api.sync.getPendingWebhookEvents, { limit })

  let processed = 0
  let failed = 0

  for (const item of queued) {
    const result = await processTicketTailorWebhookEvent(item.id)
    if (result.status === "processed") {
      processed += 1
    } else {
      failed += 1
    }
  }

  return { processed, failed, total: queued.length }
}
