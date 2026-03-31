import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server"
import { v } from "convex/values"
import { requireIdentity } from "./auth"
import type { Id } from "./_generated/dataModel"

export const getSyncRuns = query({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db
      .query("ticketTailorSyncRuns")
      .order("desc")
      .take(50)
    return runs
  },
})

export const getSyncRunById = query({
  args: { runId: v.id("ticketTailorSyncRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get("ticketTailorSyncRuns", args.runId)
  },
})

export const getLatestSyncRun = query({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db
      .query("ticketTailorSyncRuns")
      .order("desc")
      .take(1)
    return runs[0] ?? null
  },
})

export const startSyncRun = mutation({
  args: {},
  returns: v.id("ticketTailorSyncRuns"),
  handler: async (ctx) => {
    console.log("server identity", await ctx.auth.getUserIdentity())
    await requireIdentity(ctx)
    const id = await ctx.db.insert("ticketTailorSyncRuns", {
      status: "running",
      startedAt: Date.now(),
      eventsScanned: 0,
      ordersFetched: 0,
      ordersUpserted: 0,
      ordersArchived: 0,
      normalizedFallbackCount: 0,
      failedItems: 0,
    })
    return id
  },
})

export const updateSyncRun = mutation({
  args: {
    runId: v.id("ticketTailorSyncRuns"),
    eventsScanned: v.optional(v.number()),
    ordersFetched: v.optional(v.number()),
    ordersUpserted: v.optional(v.number()),
    ordersArchived: v.optional(v.number()),
    normalizedFallbackCount: v.optional(v.number()),
    failedItems: v.optional(v.number()),
    errorSummary: v.optional(v.string()),
    diagnostics: v.optional(v.any()),
  },
  returns: v.id("ticketTailorSyncRuns"),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const { runId, ...updates } = args
    await ctx.db.patch("ticketTailorSyncRuns", runId, updates)
    return runId
  },
})

export const completeSyncRun = mutation({
  args: {
    runId: v.id("ticketTailorSyncRuns"),
    status: v.union(
      v.literal("success"),
      v.literal("partial"),
      v.literal("failed")
    ),
    errorSummary: v.optional(v.string()),
    diagnostics: v.optional(v.any()),
    eventsScanned: v.optional(v.number()),
    ordersFetched: v.optional(v.number()),
    ordersUpserted: v.optional(v.number()),
    ordersArchived: v.optional(v.number()),
    normalizedFallbackCount: v.optional(v.number()),
    failedItems: v.optional(v.number()),
  },
  returns: v.id("ticketTailorSyncRuns"),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await ctx.db.patch("ticketTailorSyncRuns", args.runId, {
      status: args.status,
      finishedAt: Date.now(),
      errorSummary: args.errorSummary,
      diagnostics: args.diagnostics,
      eventsScanned: args.eventsScanned,
      ordersFetched: args.ordersFetched,
      ordersUpserted: args.ordersUpserted,
      ordersArchived: args.ordersArchived,
      normalizedFallbackCount: args.normalizedFallbackCount,
      failedItems: args.failedItems,
    })
    return args.runId
  },
})

export const getWebhookEvents = query({
  args: {
    status: v.optional(
      v.union(v.literal("pending"), v.literal("processed"), v.literal("failed"))
    ),
  },
  handler: async (ctx, args) => {
    if (args.status) {
      const events = await ctx.db
        .query("ticketTailorWebhookEvents")
        .withIndex("status_nextRetry", (q) => q.eq("status", args.status!))
        .collect()
      return events
    }
    return await ctx.db.query("ticketTailorWebhookEvents").collect()
  },
})

export const processWebhookEvent = mutation({
  args: {
    eventId: v.id("ticketTailorWebhookEvents"),
    status: v.union(v.literal("processed"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await ctx.db.patch("ticketTailorWebhookEvents", args.eventId, {
      status: args.status,
      processedAt: Date.now(),
      lastError: args.error,
    })
    return args.eventId
  },
})

export const createWebhookEvent = mutation({
  args: {
    providerEventId: v.string(),
    eventType: v.string(),
    payload: v.any(),
  },
  returns: v.id("ticketTailorWebhookEvents"),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const existing = await ctx.db
      .query("ticketTailorWebhookEvents")
      .withIndex("providerEventId", (q) =>
        q.eq("providerEventId", args.providerEventId)
      )
      .collect()

    if (existing[0]) {
      await ctx.db.patch("ticketTailorWebhookEvents", existing[0]._id, {
        payload: args.payload,
        deliveryCount: (existing[0].deliveryCount ?? 0) + 1,
        lastReceivedAt: Date.now(),
      })
      return existing[0]._id
    }

    const id = await ctx.db.insert("ticketTailorWebhookEvents", {
      ...args,
      status: "pending",
      deliveryCount: 1,
      attempts: 0,
    })
    return id
  },
})

export const upsertTicketTailorEvent = mutation({
  args: {
    providerEventId: v.string(),
    name: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    timezone: v.optional(v.string()),
    currency: v.optional(v.string()),
    rawPayload: v.any(),
  },
  returns: v.id("ticketTailorEvents"),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const existing = await ctx.db
      .query("ticketTailorEvents")
      .withIndex("providerEventId", (q) =>
        q.eq("providerEventId", args.providerEventId)
      )
      .collect()

    if (existing[0]) {
      await ctx.db.patch("ticketTailorEvents", existing[0]._id, args)
      return existing[0]._id
    }

    const id = await ctx.db.insert("ticketTailorEvents", args)
    return id
  },
})

export const getTicketTailorEventByProviderId = query({
  args: { providerEventId: v.string() },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("ticketTailorEvents")
      .withIndex("providerEventId", (q) =>
        q.eq("providerEventId", args.providerEventId)
      )
      .collect()
    return events[0] ?? null
  },
})

export const upsertTicketTailorOrder = mutation({
  args: {
    providerOrderId: v.string(),
    providerEventId: v.string(),
    eventId: v.union(v.id("events"), v.string()),
    normalizedStatus: v.optional(
      v.union(
        v.literal("paid"),
        v.literal("refunded"),
        v.literal("cancelled"),
        v.literal("pending")
      )
    ),
    providerStatus: v.optional(v.string()),
    normalizationNote: v.optional(v.string()),
    buyerEmail: v.optional(v.string()),
    buyerName: v.optional(v.string()),
    currency: v.optional(v.string()),
    totalAmountMinor: v.optional(v.number()),
    orderedAt: v.optional(v.number()),
    refundedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    rawPayload: v.any(),
  },
  returns: v.id("ticketTailorOrders"),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const existing = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("providerOrderId", (q) =>
        q.eq("providerOrderId", args.providerOrderId)
      )
      .collect()

    const insertArgs = {
      ...args,
      eventId: args.eventId as Id<"events">,
      isArchived: false,
      archiveReason: undefined,
    }

    if (existing[0]) {
      await ctx.db.patch("ticketTailorOrders", existing[0]._id, insertArgs)
      return existing[0]._id
    }

    const id = await ctx.db.insert("ticketTailorOrders", insertArgs)
    return id
  },
})

export const archiveMissingOrdersForEvent = mutation({
  args: {
    providerEventId: v.string(),
    seenProviderOrderIds: v.array(v.string()),
    reason: v.optional(v.string()),
  },
  returns: v.object({
    scanned: v.number(),
    archived: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const orders = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("providerEventId", (q) =>
        q.eq("providerEventId", args.providerEventId)
      )
      .collect()

    const seen = new Set(args.seenProviderOrderIds)
    const now = Date.now()
    const reason = args.reason?.trim() || "missing_from_provider_sync"
    let archived = 0

    for (const order of orders) {
      if (order.removedAt) {
        continue
      }

      if (seen.has(order.providerOrderId)) {
        continue
      }

      await ctx.db.patch("ticketTailorOrders", order._id, {
        isArchived: true,
        archivedAt: order.archivedAt ?? now,
        archiveReason: reason,
        normalizedStatus: "cancelled",
        cancelledAt: order.cancelledAt ?? now,
        normalizationNote:
          "Order missing from latest Ticket Tailor sync; archived locally.",
      })
      archived += 1
    }

    return {
      scanned: orders.length,
      archived,
    }
  },
})

export const getTicketTailorOrderByProviderId = query({
  args: { providerOrderId: v.string() },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("providerOrderId", (q) =>
        q.eq("providerOrderId", args.providerOrderId)
      )
      .collect()
    return orders[0] ?? null
  },
})

export const upsertTicketTailorAttendee = mutation({
  args: {
    providerAttendeeId: v.optional(v.string()),
    providerIssuedTicketId: v.optional(v.string()),
    providerTicketTypeId: v.optional(v.string()),
    providerEventId: v.string(),
    providerOrderId: v.string(),
    eventId: v.union(v.id("events"), v.string()),
    orderId: v.id("ticketTailorOrders"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    ticketTypeLabel: v.optional(v.string()),
    ticketStatus: v.optional(v.string()),
    rawPayload: v.any(),
    customAnswers: v.optional(v.any()),
    genderType: v.optional(
      v.union(
        v.literal("MALE"),
        v.literal("FEMALE"),
        v.literal("MIXED"),
        v.literal("UNKNOWN")
      )
    ),
    ageGroup: v.optional(v.string()),
    ticketCategory: v.optional(v.string()),
    allocationPriority: v.optional(
      v.union(
        v.literal("CRITICAL"),
        v.literal("HIGH"),
        v.literal("NORMAL"),
        v.literal("LOW")
      )
    ),
    priorityReason: v.optional(v.string()),
  },
  returns: v.id("ticketTailorAttendees"),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const existing = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("providerEventOrder", (q) =>
        q
          .eq("providerEventId", args.providerEventId)
          .eq("providerOrderId", args.providerOrderId)
      )
      .collect()

    const existingById = existing.filter(
      (a) => a.providerAttendeeId === args.providerAttendeeId
    )

    if (existingById[0]) {
      await ctx.db.patch("ticketTailorAttendees", existingById[0]._id, args)
      return existingById[0]._id
    }

    const id = await ctx.db.insert("ticketTailorAttendees", args)
    return id
  },
})

export const getTicketTailorAttendeesByOrderId = query({
  args: { orderId: v.union(v.id("ticketTailorOrders"), v.string()) },
  handler: async (ctx, args) => {
    const attendees = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("orderId", (q) =>
        q.eq("orderId", args.orderId as Id<"ticketTailorOrders">)
      )
      .collect()
    return attendees
  },
})

export const createAttendeeFamilyGroup = mutation({
  args: {
    label: v.optional(v.string()),
    primaryAttendeeId: v.string(),
  },
  returns: v.id("attendeeFamilyGroups"),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const id = await ctx.db.insert("attendeeFamilyGroups", args)
    return id
  },
})

export const getAttendeeFamilyGroupByPrimaryId = query({
  args: { primaryAttendeeId: v.string() },
  handler: async (ctx, args) => {
    const groups = await ctx.db
      .query("attendeeFamilyGroups")
      .withIndex("primaryAttendeeId", (q) =>
        q.eq("primaryAttendeeId", args.primaryAttendeeId)
      )
      .collect()
    return groups[0] ?? null
  },
})

export const addAttendeeToFamilyGroup = mutation({
  args: {
    familyGroupId: v.id("attendeeFamilyGroups"),
    attendeeId: v.string(),
    relationship: v.optional(v.string()),
  },
  returns: v.id("attendeeFamilyMembers"),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const id = await ctx.db.insert("attendeeFamilyMembers", args)
    return id
  },
})

export const getFamilyMembersByGroupId = query({
  args: { familyGroupId: v.id("attendeeFamilyGroups") },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("attendeeFamilyMembers")
      .withIndex("familyGroupId", (q) =>
        q.eq("familyGroupId", args.familyGroupId)
      )
      .collect()
    return members
  },
})

export const getWebhookEventByProviderId = query({
  args: { providerEventId: v.string() },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("ticketTailorWebhookEvents")
      .withIndex("providerEventId", (q) =>
        q.eq("providerEventId", args.providerEventId)
      )
      .collect()
    return events[0] ?? null
  },
})

export const getWebhookEventById = query({
  args: { eventId: v.id("ticketTailorWebhookEvents") },
  handler: async (ctx, args) => {
    return await ctx.db.get("ticketTailorWebhookEvents", args.eventId)
  },
})

export const updateWebhookEvent = mutation({
  args: {
    eventId: v.id("ticketTailorWebhookEvents"),
    status: v.optional(
      v.union(v.literal("pending"), v.literal("processed"), v.literal("failed"))
    ),
    attempts: v.optional(v.number()),
    lastError: v.optional(v.string()),
    nextRetryAt: v.optional(v.number()),
    canonicalPayload: v.optional(v.any()),
    canonicalFetchedAt: v.optional(v.number()),
    processedAt: v.optional(v.number()),
    deliveryCount: v.optional(v.number()),
    lastReceivedAt: v.optional(v.number()),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const { eventId, ...updates } = args
    await ctx.db.patch("ticketTailorWebhookEvents", eventId, updates)
    return eventId
  },
})

export const getPendingWebhookEvents = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now()
    const limit = args.limit ?? 20

    const pending = await ctx.db
      .query("ticketTailorWebhookEvents")
      .withIndex("status_nextRetry", (q) => q.eq("status", "pending"))
      .collect()

    const failed = await ctx.db
      .query("ticketTailorWebhookEvents")
      .withIndex("status_nextRetry", (q) => q.eq("status", "failed"))
      .collect()

    const ready = [...pending, ...failed].filter(
      (event) =>
        event.status === "pending" ||
        (event.nextRetryAt && event.nextRetryAt <= now)
    )

    ready.sort((a, b) => {
      const aTime = a.receivedAt ?? a._creationTime
      const bTime = b.receivedAt ?? b._creationTime
      return aTime - bTime
    })

    return ready.slice(0, limit).map((event) => ({
      id: event._id,
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      status: event.status,
      attempts: event.attempts ?? 0,
      nextRetryAt: event.nextRetryAt,
      lastError: event.lastError,
    }))
  },
})

// ---------------------------------------------------------------------------
// Internal (auth-free) mutation wrappers for cron-triggered auto-sync.
// These mirror the public mutations above but skip requireIdentity so they
// can be called from Convex internal actions via ctx.runMutation.
// ---------------------------------------------------------------------------

export const internalStartSyncRun = internalMutation({
  args: {},
  returns: v.id("ticketTailorSyncRuns"),
  handler: async (ctx) => {
    const id = await ctx.db.insert("ticketTailorSyncRuns", {
      status: "running",
      startedAt: Date.now(),
      eventsScanned: 0,
      ordersFetched: 0,
      ordersUpserted: 0,
      ordersArchived: 0,
      normalizedFallbackCount: 0,
      failedItems: 0,
    })
    return id
  },
})

export const internalCompleteSyncRun = internalMutation({
  args: {
    runId: v.id("ticketTailorSyncRuns"),
    status: v.union(
      v.literal("success"),
      v.literal("partial"),
      v.literal("failed")
    ),
    errorSummary: v.optional(v.string()),
    diagnostics: v.optional(v.any()),
    eventsScanned: v.optional(v.number()),
    ordersFetched: v.optional(v.number()),
    ordersUpserted: v.optional(v.number()),
    ordersArchived: v.optional(v.number()),
    normalizedFallbackCount: v.optional(v.number()),
    failedItems: v.optional(v.number()),
  },
  returns: v.id("ticketTailorSyncRuns"),
  handler: async (ctx, args) => {
    await ctx.db.patch("ticketTailorSyncRuns", args.runId, {
      status: args.status,
      finishedAt: Date.now(),
      errorSummary: args.errorSummary,
      diagnostics: args.diagnostics,
      eventsScanned: args.eventsScanned,
      ordersFetched: args.ordersFetched,
      ordersUpserted: args.ordersUpserted,
      ordersArchived: args.ordersArchived,
      normalizedFallbackCount: args.normalizedFallbackCount,
      failedItems: args.failedItems,
    })
    return args.runId
  },
})

function generateEventSlug(
  name: string | null | undefined,
  providerEventId: string
): string {
  const base = name
    ? name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    : "event"
  return `${base}-${providerEventId.slice(0, 8)}`
}

export const internalUpsertTicketTailorEvent = internalMutation({
  args: {
    providerEventId: v.string(),
    name: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    timezone: v.optional(v.string()),
    currency: v.optional(v.string()),
    rawPayload: v.any(),
  },
  returns: v.object({
    ticketTailorEventId: v.id("ticketTailorEvents"),
    canonicalEventId: v.id("events"),
  }),
  handler: async (ctx, args) => {
    const now = Date.now()

    const existingTTEvent = await ctx.db
      .query("ticketTailorEvents")
      .withIndex("providerEventId", (q) =>
        q.eq("providerEventId", args.providerEventId)
      )
      .collect()

    let ticketTailorEventId: Id<"ticketTailorEvents">
    if (existingTTEvent[0]) {
      await ctx.db.patch("ticketTailorEvents", existingTTEvent[0]._id, args)
      ticketTailorEventId = existingTTEvent[0]._id
    } else {
      ticketTailorEventId = await ctx.db.insert("ticketTailorEvents", args)
    }

    const slug = generateEventSlug(args.name, args.providerEventId)
    const title = args.name ?? `TicketTailor Event ${args.providerEventId}`

    const existingCanonical = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()

    let canonicalEventId: Id<"events">
    if (existingCanonical) {
      await ctx.db.patch("events", existingCanonical._id, {
        title,
        startsAt: args.startsAt ?? existingCanonical.startsAt,
        endsAt: args.endsAt ?? existingCanonical.endsAt,
        timezone: args.timezone ?? existingCanonical.timezone,
        currency: args.currency ?? existingCanonical.currency,
        updatedAt: now,
      })
      canonicalEventId = existingCanonical._id
    } else {
      canonicalEventId = await ctx.db.insert("events", {
        slug,
        title,
        startsAt: args.startsAt ?? now,
        endsAt: args.endsAt,
        timezone: args.timezone ?? "UTC",
        currency: args.currency ?? "EUR",
        isPublished: true,
        isSignupOpen: true,
        accommodationEnabled: false,
        primarySourceKind: "integration",
        primarySourceProvider: "ticket_tailor",
        updatedAt: now,
      })
    }

    const existingEventSource = await ctx.db
      .query("eventSources")
      .withIndex("by_provider_and_externalEventId", (q) =>
        q
          .eq("provider", "ticket_tailor")
          .eq("externalEventId", args.providerEventId)
      )
      .first()

    if (existingEventSource) {
      if (existingEventSource.eventId !== canonicalEventId) {
        await ctx.db.patch("eventSources", existingEventSource._id, {
          eventId: canonicalEventId,
          syncStatus: "active",
          lastSyncedAt: now,
          updatedAt: now,
        })
      } else {
        await ctx.db.patch("eventSources", existingEventSource._id, {
          lastSyncedAt: now,
          updatedAt: now,
        })
      }
    } else {
      await ctx.db.insert("eventSources", {
        eventId: canonicalEventId,
        provider: "ticket_tailor",
        externalEventId: args.providerEventId,
        syncStatus: "active",
        lastSyncedAt: now,
        providerSnapshotRef: args.providerEventId,
        updatedAt: now,
      })
    }

    return { ticketTailorEventId, canonicalEventId }
  },
})

export const internalUpsertTicketTailorOrder = internalMutation({
  args: {
    providerOrderId: v.string(),
    providerEventId: v.string(),
    normalizedStatus: v.optional(
      v.union(
        v.literal("paid"),
        v.literal("refunded"),
        v.literal("cancelled"),
        v.literal("pending")
      )
    ),
    providerStatus: v.optional(v.string()),
    normalizationNote: v.optional(v.string()),
    rawPayload: v.any(),
    isArchived: v.optional(v.boolean()),
  },
  returns: v.object({
    orderId: v.id("orders"),
    ticketTailorOrderId: v.id("ticketTailorOrders"),
  }),
  handler: async (ctx, args) => {
    // Helper to extract string from rawPayload
    const pickString = (value: unknown): string | undefined => {
      return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : undefined
    }

    // Helper to parse date
    const parseDate = (value: unknown): number | undefined => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value * 1000
      }
      if (typeof value === "string" && value.trim()) {
        const d = new Date(value)
        return Number.isNaN(d.getTime()) ? undefined : d.getTime()
      }
      return undefined
    }

    // Helper to convert to minor amount
    const toMinorAmount = (value: unknown): number | undefined => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return Math.round(value)
      }
      if (typeof value === "string") {
        const n = Number(value)
        if (Number.isFinite(n)) return Math.round(n * 100)
      }
      return undefined
    }

    // Extract buyer info from rawPayload
    const raw = args.rawPayload as Record<string, unknown>
    const buyer =
      pickString(raw.buyer_email) ??
      pickString((raw.buyer as Record<string, unknown>)?.email) ??
      pickString((raw.buyer_details as Record<string, unknown>)?.email)

    const buyerFirst =
      pickString(raw.buyer_first_name) ??
      pickString((raw.buyer as Record<string, unknown>)?.first_name) ??
      pickString((raw.buyer_details as Record<string, unknown>)?.first_name)
    const buyerLast =
      pickString(raw.buyer_last_name) ??
      pickString((raw.buyer as Record<string, unknown>)?.last_name) ??
      pickString((raw.buyer_details as Record<string, unknown>)?.last_name)
    const buyerName =
      (buyerFirst && buyerLast ? `${buyerFirst} ${buyerLast}` : undefined) ??
      buyerFirst ??
      buyerLast ??
      pickString(raw.buyer_name) ??
      pickString((raw.buyer as Record<string, unknown>)?.name)

    const currency = pickString(raw.currency) ?? pickString(raw.currency_code)
    const totalAmountMinor =
      toMinorAmount(raw.total) ??
      toMinorAmount(raw.amount) ??
      toMinorAmount(raw.total_amount)
    const orderedAt =
      parseDate(raw.created_at) ??
      parseDate(raw.date) ??
      parseDate(raw.order_date)
    const refundedAt = parseDate(raw.refunded_at)
    const cancelledAt = parseDate(raw.cancelled_at)

    // Look up existing ticketTailorOrders by providerOrderId index
    const existingTT = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("providerOrderId", (q) =>
        q.eq("providerOrderId", args.providerOrderId)
      )
      .first()

    // Look up or create the canonical orders record
    const existingOrder = await ctx.db
      .query("orders")
      .withIndex("by_providerOrderId", (q) =>
        q.eq("providerOrderId", args.providerOrderId)
      )
      .first()

    let orderId: Id<"orders">

    if (existingOrder) {
      orderId = existingOrder._id
      await ctx.db.patch("orders", existingOrder._id, {
        providerEventId: args.providerEventId,
        status: args.normalizedStatus,
        providerStatus: args.providerStatus,
        normalizationNote: args.normalizationNote,
        rawPayload: args.rawPayload,
        bookerEmail: buyer,
        bookerName: buyerName,
        currency: currency,
        totalAmountMinor: totalAmountMinor,
        orderedAt: orderedAt,
        refundedAt: refundedAt,
        cancelledAt: cancelledAt,
      })
    } else {
      orderId = await ctx.db.insert("orders", {
        source: "integration",
        providerOrderId: args.providerOrderId,
        providerEventId: args.providerEventId,
        status: args.normalizedStatus,
        providerStatus: args.providerStatus,
        normalizationNote: args.normalizationNote,
        rawPayload: args.rawPayload,
        bookerEmail: buyer,
        bookerName: buyerName,
        currency: currency,
        totalAmountMinor: totalAmountMinor,
        orderedAt: orderedAt,
        refundedAt: refundedAt,
        cancelledAt: cancelledAt,
      })
    }

    // Upsert ticketTailorOrders (extension) with slimmed fields
    let ticketTailorOrderId: Id<"ticketTailorOrders">

    if (existingTT) {
      ticketTailorOrderId = existingTT._id
      await ctx.db.patch("ticketTailorOrders", existingTT._id, {
        orderId,
        providerEventId: args.providerEventId,
        providerStatus: args.providerStatus,
        normalizedStatus: args.normalizedStatus,
        normalizationNote: args.normalizationNote,
        isArchived: args.isArchived ?? false,
        archiveReason: undefined,
        refundedAt: refundedAt,
        cancelledAt: cancelledAt,
        rawPayload: args.rawPayload,
      })
    } else {
      ticketTailorOrderId = await ctx.db.insert("ticketTailorOrders", {
        providerOrderId: args.providerOrderId,
        providerEventId: args.providerEventId,
        orderId,
        providerStatus: args.providerStatus,
        normalizedStatus: args.normalizedStatus,
        normalizationNote: args.normalizationNote,
        isArchived: args.isArchived ?? false,
        refundedAt: refundedAt,
        cancelledAt: cancelledAt,
        rawPayload: args.rawPayload,
      })
    }

    return { orderId, ticketTailorOrderId }
  },
})

export const internalUpsertTicketTailorAttendee = internalMutation({
  args: {
    providerAttendeeId: v.optional(v.string()),
    providerIssuedTicketId: v.optional(v.string()),
    providerTicketTypeId: v.optional(v.string()),
    providerEventId: v.string(),
    providerOrderId: v.string(),
    orderId: v.id("orders"),
    ticketTypeLabel: v.optional(v.string()),
    ticketStatus: v.optional(v.string()),
    checkedInAt: v.optional(v.number()),
    rawPayload: v.any(),
    customAnswers: v.optional(v.any()),
    genderType: v.optional(
      v.union(
        v.literal("MALE"),
        v.literal("FEMALE"),
        v.literal("MIXED"),
        v.literal("UNKNOWN")
      )
    ),
    ageGroup: v.optional(v.string()),
    ticketCategory: v.optional(v.string()),
    tikkieAmountOverrideMinor: v.optional(v.number()),
  },
  returns: v.object({
    attendeeId: v.id("orderAttendees"),
    ticketTailorAttendeeId: v.id("ticketTailorAttendees"),
  }),
  handler: async (ctx, args) => {
    // Helper to extract string from rawPayload
    const pickString = (value: unknown): string | undefined => {
      return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : undefined
    }

    // Extract attendee info from rawPayload
    const raw = args.rawPayload as Record<string, unknown>
    const attFirst = pickString(raw.first_name)
    const attLast = pickString(raw.last_name)
    const name =
      attFirst && attLast
        ? `${attFirst} ${attLast}`
        : (attFirst ?? attLast ?? pickString(raw.name))
    const email = pickString(raw.email) ?? pickString(raw.attendee_email)

    // Look up existing ticketTailorAttendees by providerEventOrder index
    const existingTTAttendees = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("providerEventOrder", (q) =>
        q
          .eq("providerEventId", args.providerEventId)
          .eq("providerOrderId", args.providerOrderId)
      )
      .collect()

    const existingTT = existingTTAttendees.find(
      (a) => a.providerAttendeeId === args.providerAttendeeId
    )

    // Look up or create the canonical orderAttendees record
    // Use attendeeKey = providerAttendeeId or providerIssuedTicketId
    const attendeeKey =
      args.providerAttendeeId ?? args.providerIssuedTicketId ?? "auto"

    // Query orderAttendees by orderId and attendeeKey
    const existingOrderAttendees = await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .collect()

    const existingOrderAttendee = existingOrderAttendees.find(
      (a) => a.attendeeKey === attendeeKey
    )

    let attendeeId: Id<"orderAttendees">

    // Normalize gender from TT uppercase to core lowercase
    const normalizedGender = args.genderType
      ? args.genderType.toLowerCase()
      : "unknown"

    if (existingOrderAttendee) {
      attendeeId = existingOrderAttendee._id
      await ctx.db.patch("orderAttendees", existingOrderAttendee._id, {
        name: name ?? existingOrderAttendee.name,
        email: email ?? existingOrderAttendee.email,
        // TT attendees don't have all core fields - keep existing or use defaults
        phone: existingOrderAttendee.phone,
        gender: normalizedGender as "male" | "female" | "mixed" | "unknown",
        location: existingOrderAttendee.location,
        dietaryRestrictions: existingOrderAttendee.dietaryRestrictions,
        roommatePreference: existingOrderAttendee.roommatePreference,
        roommateAvoid: existingOrderAttendee.roommateAvoid,
        sortOrder: existingOrderAttendee.sortOrder,
      })
    } else {
      attendeeId = await ctx.db.insert("orderAttendees", {
        orderId: args.orderId,
        attendeeKey,
        name: name ?? "Unknown",
        email: email,
        phone: undefined,
        gender: normalizedGender as "male" | "female" | "mixed" | "unknown",
        location: "",
        dietaryRestrictions: "",
        roommatePreference: "",
        roommateAvoid: "",
        sortOrder: 0,
      })
    }

    // Upsert ticketTailorAttendees (extension) with attendeeId FK
    let ticketTailorAttendeeId: Id<"ticketTailorAttendees">

    if (existingTT) {
      ticketTailorAttendeeId = existingTT._id
      await ctx.db.patch("ticketTailorAttendees", existingTT._id, {
        attendeeId,
        providerAttendeeId: args.providerAttendeeId,
        providerIssuedTicketId: args.providerIssuedTicketId,
        providerTicketTypeId: args.providerTicketTypeId,
        providerEventId: args.providerEventId,
        providerOrderId: args.providerOrderId,
        ticketTypeLabel: args.ticketTypeLabel,
        ticketStatus: args.ticketStatus,
        checkedInAt: args.checkedInAt,
        customAnswers: args.customAnswers,
        genderType: args.genderType,
        ageGroup: args.ageGroup,
        ticketCategory: args.ticketCategory,
        tikkieAmountOverrideMinor: args.tikkieAmountOverrideMinor,
        rawPayload: args.rawPayload,
      })
    } else {
      ticketTailorAttendeeId = await ctx.db.insert("ticketTailorAttendees", {
        attendeeId,
        providerAttendeeId: args.providerAttendeeId,
        providerIssuedTicketId: args.providerIssuedTicketId,
        providerTicketTypeId: args.providerTicketTypeId,
        providerEventId: args.providerEventId,
        providerOrderId: args.providerOrderId,
        ticketTypeLabel: args.ticketTypeLabel,
        ticketStatus: args.ticketStatus,
        checkedInAt: args.checkedInAt,
        customAnswers: args.customAnswers,
        genderType: args.genderType,
        ageGroup: args.ageGroup,
        ticketCategory: args.ticketCategory,
        tikkieAmountOverrideMinor: args.tikkieAmountOverrideMinor,
        rawPayload: args.rawPayload,
      })
    }

    return { attendeeId, ticketTailorAttendeeId }
  },
})

export const internalArchiveMissingOrdersForEvent = internalMutation({
  args: {
    providerEventId: v.string(),
    seenProviderOrderIds: v.array(v.string()),
    reason: v.optional(v.string()),
  },
  returns: v.object({
    scanned: v.number(),
    archived: v.number(),
  }),
  handler: async (ctx, args) => {
    // Query ticketTailorOrders by providerEventId index
    const ttOrders = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("providerEventId", (q) =>
        q.eq("providerEventId", args.providerEventId)
      )
      .collect()

    const seen = new Set(args.seenProviderOrderIds)
    const now = Date.now()
    const reason = args.reason?.trim() || "missing_from_provider_sync"
    let archived = 0

    for (const ttOrder of ttOrders) {
      if (ttOrder.removedAt) {
        continue
      }

      if (seen.has(ttOrder.providerOrderId)) {
        continue
      }

      // Patch ticketTailorOrders (extension)
      await ctx.db.patch("ticketTailorOrders", ttOrder._id, {
        isArchived: true,
        archivedAt: ttOrder.archivedAt ?? now,
        archiveReason: reason,
        normalizedStatus: "cancelled",
        cancelledAt: ttOrder.cancelledAt ?? now,
        normalizationNote:
          "Order missing from latest Ticket Tailor sync; archived locally.",
      })

      // Also patch the linked orders record (core) if it exists
      if (ttOrder.orderId) {
        const order = await ctx.db.get("orders", ttOrder.orderId)
        if (order) {
          await ctx.db.patch("orders", order._id, {
            status: "cancelled",
          })
        }
      }

      archived += 1
    }

    // Also query orders table to find any orders without corresponding TT records
    // and mark them as cancelled (orphaned integration orders)
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_providerEventId", (q) =>
        q.eq("providerEventId", args.providerEventId)
      )
      .collect()

    for (const order of orders) {
      if (order.providerOrderId && !seen.has(order.providerOrderId)) {
        // Check if there's a corresponding TT order
        const ttOrder = await ctx.db
          .query("ticketTailorOrders")
          .withIndex("providerOrderId", (q) =>
            q.eq("providerOrderId", order.providerOrderId!)
          )
          .first()

        if (!ttOrder || ttOrder.isArchived) {
          await ctx.db.patch("orders", order._id, {
            status: "cancelled",
          })
        }
      }
    }

    return {
      scanned: ttOrders.length,
      archived,
    }
  },
})

export const internalCreateAttendeeFamilyGroup = internalMutation({
  args: {
    label: v.optional(v.string()),
    primaryAttendeeId: v.string(),
  },
  returns: v.id("attendeeFamilyGroups"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("attendeeFamilyGroups", args)
  },
})

export const internalAddAttendeeToFamilyGroup = internalMutation({
  args: {
    familyGroupId: v.id("attendeeFamilyGroups"),
    attendeeId: v.string(),
    relationship: v.optional(v.string()),
  },
  returns: v.id("attendeeFamilyMembers"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("attendeeFamilyMembers", args)
  },
})

// ---------------------------------------------------------------------------
// Internal (auth-free) query wrappers for cron-triggered auto-sync.
// ---------------------------------------------------------------------------

export const internalGetTicketTailorAttendeesByOrderId = internalQuery({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    // Query orderAttendees by orderId, then get linked TT attendees
    const orderAttendees = await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .collect()

    // Get the linked ticketTailorAttendees via attendeeId FK
    const ttAttendees = []
    for (const oa of orderAttendees) {
      const ttAtt = await ctx.db
        .query("ticketTailorAttendees")
        .withIndex("attendeeId", (q) => q.eq("attendeeId", oa._id))
        .first()
      if (ttAtt) {
        ttAttendees.push(ttAtt)
      }
    }
    return ttAttendees
  },
})

export const internalGetAttendeeFamilyGroupByPrimaryId = internalQuery({
  args: { primaryAttendeeId: v.string() },
  handler: async (ctx, args) => {
    const groups = await ctx.db
      .query("attendeeFamilyGroups")
      .withIndex("primaryAttendeeId", (q) =>
        q.eq("primaryAttendeeId", args.primaryAttendeeId)
      )
      .collect()
    return groups[0] ?? null
  },
})

export const internalGetFamilyMembersByGroupId = internalQuery({
  args: { familyGroupId: v.id("attendeeFamilyGroups") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("attendeeFamilyMembers")
      .withIndex("familyGroupId", (q) =>
        q.eq("familyGroupId", args.familyGroupId)
      )
      .collect()
  },
})

export const internalGetUnassignedPayments = internalQuery({
  args: {},
  handler: async (ctx) => {
    const payments = await ctx.db
      .query("payments")
      .withIndex("status", (q) => q.eq("status", "unassigned"))
      .collect()
    return payments.map((p) => ({
      _id: p._id,
      payerName: p.payerName,
      amountMinor: p.amountMinor,
    }))
  },
})

export const internalGetPaidOrders = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Query orders table by status index instead of ticketTailorOrders
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "paid"))
      .collect()
    return orders.map((o) => ({
      _id: o._id,
      bookerName: o.bookerName ?? null,
      totalAmountMinor: o.totalAmountMinor ?? null,
    }))
  },
})

export const internalGetAttendeesByOrder = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Query orderAttendees table instead of ticketTailorAttendees
    const attendees = await ctx.db.query("orderAttendees").take(5000)
    const byOrder = new Map<string, string[]>()
    for (const att of attendees) {
      if (!att.name) continue
      const orderId = att.orderId
      const existing = byOrder.get(orderId) ?? []
      existing.push(att.name.toLowerCase().trim())
      byOrder.set(orderId, existing)
    }
    return Object.fromEntries(byOrder)
  },
})

export const internalGetTikkiePaymentLinks = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tikkiePaymentLinks").collect()
  },
})
