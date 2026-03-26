import { query, mutation } from "./_generated/server"
import { v } from "convex/values"

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
    const id = await ctx.db.insert("ticketTailorSyncRuns", {
      status: "running",
      startedAt: Date.now(),
      eventsScanned: 0,
      ordersFetched: 0,
      ordersUpserted: 0,
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
    normalizedFallbackCount: v.optional(v.number()),
    failedItems: v.optional(v.number()),
    errorSummary: v.optional(v.string()),
    diagnostics: v.optional(v.any()),
  },
  returns: v.id("ticketTailorSyncRuns"),
  handler: async (ctx, args) => {
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
    eventId: v.string(),
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
    const existing = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("providerOrderId", (q) =>
        q.eq("providerOrderId", args.providerOrderId)
      )
      .collect()

    if (existing[0]) {
      await ctx.db.patch("ticketTailorOrders", existing[0]._id, args)
      return existing[0]._id
    }

    const id = await ctx.db.insert("ticketTailorOrders", args)
    return id
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
    eventId: v.string(),
    orderId: v.string(),
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
  args: { orderId: v.string() },
  handler: async (ctx, args) => {
    const attendees = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("orderId", (q) => q.eq("orderId", args.orderId))
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
