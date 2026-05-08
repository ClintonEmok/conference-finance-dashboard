import { query, mutation, internalMutation } from "../_generated/server"
import { v } from "convex/values"
import { requireIdentity } from "../auth"
import type { Id } from "../_generated/dataModel"

// Helper function to generate event slug
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

// Public mutation (requires authentication)

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

// Public query

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

// Internal mutation (no auth - for cron/action use)

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
