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

// Public: returns non-sensitive event metadata only, used by signup flow
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

// Public: returns non-sensitive event metadata
export const getEventById = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const eventId = ctx.db.normalizeId("events", args.eventId)
    return eventId ? await ctx.db.get("events", eventId) : null
  },
})

// Public: returns non-sensitive event metadata
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
    await requireIdentity(ctx)
    const events = await ctx.db.query("events").collect()

    const sorted = events.sort((a, b) => {
      const aTime = a.startsAt ?? 0
      const bTime = b.startsAt ?? 0
      if (aTime !== bTime) return aTime - bTime
      return (a.title ?? "").localeCompare(b.title ?? "")
    })

    return sorted
      .filter((e) => e.primarySourceKind === "internal")
      .map((e) => ({
        eventId: e._id,
        slug: e.slug,
        title: e.title ?? null,
        startsAt: e.startsAt ?? null,
        currency: e.currency ?? null,
      }))
  },
})

// Public: returns non-sensitive accommodation metadata
export const getEventsWithAccommodation = query({
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
    const events = await ctx.db.query("events").collect()
    return events
      .filter(
        (e) => e.accommodationEnabled && e.primarySourceKind === "internal"
      )
      .sort((a, b) => {
        const aTime = a.startsAt ?? 0
        const bTime = b.startsAt ?? 0
        if (aTime !== bTime) return aTime - bTime
        return (a.title ?? "").localeCompare(b.title ?? "")
      })
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

    // Check for duplicate slug
    const existing = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first()

    if (existing) {
      throw new Error(
        `An event with slug "${args.slug}" already exists. Please choose a different slug.`
      )
    }

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

    // Check for duplicate slug if slug is being changed
    if (updates.slug) {
      const existing = await ctx.db
        .query("events")
        .withIndex("by_slug", (q) => q.eq("slug", updates.slug!))
        .first()

      // Allow if it's the same event
      if (existing && existing._id !== eventId) {
        throw new Error(
          `An event with slug "${updates.slug}" already exists. Please choose a different slug.`
        )
      }
    }

    await ctx.db.patch("events", eventId, {
      ...updates,
      updatedAt: Date.now(),
    })
    return eventId
  },
})

export const deleteEvent = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    // Check if event has orders - if so, soft-delete instead
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first()

    if (orders) {
      // Soft delete - mark as deleted but preserve data
      await ctx.db.patch("events", args.eventId, {
        isPublished: false,
        isSignupOpen: false,
        updatedAt: Date.now(),
      })
      return { deleted: false, softDeleted: true, eventId: args.eventId }
    }

    // Hard delete only if no orders exist
    await ctx.db.delete("events", args.eventId)
    return { deleted: true, softDeleted: false, eventId: args.eventId }
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

// =============================================================================
// TICKET TYPES - Queries and mutations for event ticket management
// =============================================================================

export const getTicketTypesForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ticketTypes")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect()
  },
})

export const createTicketType = mutation({
  args: {
    eventId: v.id("events"),
    label: v.string(),
    priceMinor: v.number(),
    maxQuantity: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    visibility: v.optional(v.union(v.literal("public"), v.literal("hidden"))),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const now = Date.now()
    return await ctx.db.insert("ticketTypes", {
      eventId: args.eventId,
      label: args.label,
      priceMinor: args.priceMinor,
      maxQuantity: args.maxQuantity,
      soldCount: 0,
      isActive: args.isActive ?? true,
      visibility: args.visibility ?? "public",
      availabilityState: "selectable",
      updatedAt: now,
    })
  },
})

export const updateTicketType = mutation({
  args: {
    ticketTypeId: v.id("ticketTypes"),
    label: v.optional(v.string()),
    priceMinor: v.optional(v.number()),
    maxQuantity: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    visibility: v.optional(v.union(v.literal("public"), v.literal("hidden"))),
    availabilityState: v.optional(
      v.union(v.literal("selectable"), v.literal("unavailable"))
    ),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const { ticketTypeId, ...updates } = args
    await ctx.db.patch("ticketTypes", ticketTypeId, {
      ...updates,
      updatedAt: Date.now(),
    })
    return ticketTypeId
  },
})

export const deleteTicketType = mutation({
  args: { ticketTypeId: v.id("ticketTypes") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await ctx.db.delete("ticketTypes", args.ticketTypeId)
    return args.ticketTypeId
  },
})

// =============================================================================
// MANUAL ATTENDEE CREATION - For admin dashboard
// =============================================================================

function generateBookingRef(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `MAN-${timestamp.toString(36).toUpperCase()}-${random}`
}

export const createManualAttendee = mutation({
  args: {
    eventId: v.id("events"),
    attendeeName: v.string(),
    attendeeEmail: v.optional(v.string()),
    attendeePhone: v.optional(v.string()),
    gender: v.optional(
      v.union(
        v.literal("male"),
        v.literal("female"),
        v.literal("mixed"),
        v.literal("unknown")
      )
    ),
    location: v.optional(v.string()),
    dietaryRestrictions: v.optional(v.string()),
    roommatePreference: v.optional(v.string()),
    ticketTypeId: v.id("ticketTypes"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const now = Date.now()
    const bookingRef = generateBookingRef()

    // Get ticket type info for pricing
    const ticketType = await ctx.db.get("ticketTypes", args.ticketTypeId)
    if (!ticketType) {
      throw new Error("Ticket type not found")
    }

    // Create the order
    const orderId = await ctx.db.insert("orders", {
      eventId: args.eventId,
      source: "internal",
      bookingRef,
      notes: args.notes,
      bookerName: args.attendeeName,
      bookerEmail: args.attendeeEmail,
      bookerPhone: args.attendeePhone,
      submittedAt: now,
      currency: "EUR", // Default currency, could be fetched from event
      totalAmountMinor: ticketType.priceMinor,
      status: "pending",
      orderedAt: now,
    })

    // Create the attendee
    const attendeeId = await ctx.db.insert("orderAttendees", {
      orderId,
      attendeeKey: "attendee-1",
      name: args.attendeeName,
      email: args.attendeeEmail,
      phone: args.attendeePhone,
      gender: args.gender ?? "unknown",
      location: args.location ?? "",
      dietaryRestrictions: args.dietaryRestrictions ?? "",
      roommatePreference: args.roommatePreference ?? "",
      roommateAvoid: "",
      sortOrder: 0,
    })

    // Create ticket selection
    await ctx.db.insert("orderTicketSelections", {
      orderId,
      attendeeId,
      ticketTypeId: args.ticketTypeId,
      quantity: 1,
      sortOrder: 0,
    })

    // Update ticket type sold count
    await ctx.db.patch("ticketTypes", args.ticketTypeId, {
      soldCount: (ticketType.soldCount || 0) + 1,
      updatedAt: now,
    })

    return {
      orderId,
      bookingRef,
      attendeeId,
    }
  },
})

export const getAttendeesForEvent = query({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    // Get all orders for this event
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect()

    const orderIds = orders.map((o) => o._id)

    // Get all attendees for these orders
    const attendees = await Promise.all(
      orderIds.map(async (orderId) => {
        const orderAttendees = await ctx.db
          .query("orderAttendees")
          .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
          .collect()

        const order = orders.find((o) => o._id === orderId)

        return Promise.all(
          orderAttendees.map(async (attendee) => {
            // Get ticket selections for this attendee
            const ticketSelections = await ctx.db
              .query("orderTicketSelections")
              .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
              .collect()

            const attendeeTicketSelections = ticketSelections.filter(
              (ts) => ts.attendeeId === attendee._id
            )

            // Get ticket type details
            const ticketTypes = await Promise.all(
              attendeeTicketSelections.map(async (ts) => {
                const ticketType = await ctx.db.get(
                  "ticketTypes",
                  ts.ticketTypeId
                )
                return {
                  ...ts,
                  ticketType,
                }
              })
            )

            return {
              ...attendee,
              orderId,
              bookingRef: order?.bookingRef,
              orderStatus: order?.status,
              submittedAt: order?.submittedAt,
              ticketSelections: ticketTypes,
            }
          })
        )
      })
    )

    // Flatten the array
    return attendees.flat()
  },
})
