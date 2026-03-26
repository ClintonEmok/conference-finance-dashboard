import {
  internalQuery,
  internalMutation,
  query,
  mutation,
} from "./_generated/server"
import { v } from "convex/values"

export const getEvents = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("ticketTailorEvents").collect()
  },
})

export const getEventById = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    try {
      return await ctx.db.get("ticketTailorEvents", args.eventId as any)
    } catch {
      return null
    }
  },
})

export const getEventByProviderId = query({
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

export const createEvent = mutation({
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
    const id = await ctx.db.insert("ticketTailorEvents", args)
    return id
  },
})

export const upsertEvent = mutation({
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

export const getEventsForLedger = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("ticketTailorEvents").collect()

    const sorted = events.sort((a, b) => {
      const aTime = a.startsAt ?? 0
      const bTime = b.startsAt ?? 0
      if (aTime !== bTime) return aTime - bTime
      return (a.name ?? "").localeCompare(b.name ?? "")
    })

    return sorted.map((e) => ({
      providerEventId: e.providerEventId,
      name: e.name,
    }))
  },
})
