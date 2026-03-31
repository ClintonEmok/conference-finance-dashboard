import { query, mutation } from "../_generated/server"
import { v } from "convex/values"
import { requireIdentity } from "../auth"

// Public queries

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

// Public mutations (require authentication)

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
