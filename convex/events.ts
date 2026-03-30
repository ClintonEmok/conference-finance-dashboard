import {
  internalQuery,
  internalMutation,
  query,
  mutation,
} from "./_generated/server"
import { v } from "convex/values"
import { requireIdentity } from "./auth"

// =============================================================================
// CANONICAL EVENTS - Source-agnostic queries using the canonical events table
// =============================================================================

export const getEvents = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("events"),
      _creationTime: v.number(),
      slug: v.string(),
      title: v.string(),
      startsAt: v.number(),
      endsAt: v.optional(v.number()),
      timezone: v.string(),
      currency: v.string(),
      isPublished: v.boolean(),
      isSignupOpen: v.boolean(),
      accommodationEnabled: v.boolean(),
      primarySourceKind: v.union(
        v.literal("integration"),
        v.literal("internal")
      ),
      primarySourceProvider: v.optional(v.string()),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    return await ctx.db.query("events").collect()
  },
})

export const getEventById = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const eventId = ctx.db.normalizeId("events", args.eventId)
    return eventId ? await ctx.db.get("events", eventId) : null
  },
})

export const getEventBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique()
    return event
  },
})

export const getEventsForLedger = query({
  args: {},
  returns: v.array(
    v.object({
      eventId: v.string(),
      slug: v.string(),
      title: v.union(v.string(), v.null()),
      startsAt: v.union(v.number(), v.null()),
      currency: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx) => {
    const events = await ctx.db.query("events").collect()

    const sorted = events.sort((a, b) => {
      const aTime = a.startsAt ?? 0
      const bTime = b.startsAt ?? 0
      if (aTime !== bTime) return aTime - bTime
      return (a.title ?? "").localeCompare(b.title ?? "")
    })

    return sorted.map((e) => ({
      eventId: e._id,
      slug: e.slug,
      title: e.title ?? null,
      startsAt: e.startsAt ?? null,
      currency: e.currency ?? null,
    }))
  },
})

export const createEvent = mutation({
  args: {
    slug: v.string(),
    title: v.string(),
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    timezone: v.string(),
    currency: v.string(),
    isPublished: v.optional(v.boolean()),
    isSignupOpen: v.optional(v.boolean()),
    accommodationEnabled: v.optional(v.boolean()),
    primarySourceKind: v.optional(
      v.union(v.literal("integration"), v.literal("internal"))
    ),
    primarySourceProvider: v.optional(v.string()),
  },
  returns: v.id("events"),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const now = Date.now()
    return await ctx.db.insert("events", {
      slug: args.slug,
      title: args.title,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      timezone: args.timezone,
      currency: args.currency,
      isPublished: args.isPublished ?? false,
      isSignupOpen: args.isSignupOpen ?? false,
      accommodationEnabled: args.accommodationEnabled ?? false,
      primarySourceKind: args.primarySourceKind ?? "internal",
      primarySourceProvider: args.primarySourceProvider,
      updatedAt: now,
    })
  },
})

export const updateEvent = mutation({
  args: {
    eventId: v.id("events"),
    slug: v.optional(v.string()),
    title: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    timezone: v.optional(v.string()),
    currency: v.optional(v.string()),
    isPublished: v.optional(v.boolean()),
    isSignupOpen: v.optional(v.boolean()),
    accommodationEnabled: v.optional(v.boolean()),
    primarySourceKind: v.optional(
      v.union(v.literal("integration"), v.literal("internal"))
    ),
    primarySourceProvider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const { eventId, ...updates } = args
    await ctx.db.patch("events", eventId, {
      ...updates,
      updatedAt: Date.now(),
    })
    return eventId
  },
})

// =============================================================================
// EVENT SOURCES - Queries for event source integrations
// =============================================================================

export const getEventSourcesForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("eventSources")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect()
  },
})

export const getEventSourceByProvider = query({
  args: {
    provider: v.string(),
    externalEventId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("eventSources")
      .withIndex("by_provider_and_externalEventId", (q) =>
        q
          .eq("provider", args.provider)
          .eq("externalEventId", args.externalEventId)
      )
      .first()
  },
})

// =============================================================================
// INTEGRATION-LEGACY: TicketTailor Events (for backward compatibility)
// =============================================================================

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

    return await ctx.db.insert("ticketTailorEvents", args)
  },
})
