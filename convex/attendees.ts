import { query, mutation } from "./_generated/server"
import { v } from "convex/values"
import { paginationOptsValidator } from "convex/server"
import { requireIdentity } from "./auth"
import { api } from "./_generated/api"
import type { Id } from "./_generated/dataModel"

function filterAttendees(
  attendees: Array<{
    assignedRoomId?: string
    genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
    allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
  }>,
  args: {
    assignedRoomId?: string
    genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
    allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
  }
) {
  return attendees.filter((attendee) => {
    if (args.assignedRoomId !== undefined) {
      const assignedRoomId = attendee.assignedRoomId ?? undefined
      if (assignedRoomId !== args.assignedRoomId) {
        return false
      }
    }

    if (args.genderType && attendee.genderType !== args.genderType) {
      return false
    }

    if (
      args.allocationPriority &&
      attendee.allocationPriority !== args.allocationPriority
    ) {
      return false
    }

    return true
  })
}

export const getAttendees = query({
  args: {
    eventId: v.optional(v.string()),
    orderId: v.optional(v.id("orders")),
    assignedRoomId: v.optional(v.string()),
    genderType: v.optional(
      v.union(
        v.literal("MALE"),
        v.literal("FEMALE"),
        v.literal("MIXED"),
        v.literal("UNKNOWN")
      )
    ),
    allocationPriority: v.optional(
      v.union(
        v.literal("CRITICAL"),
        v.literal("HIGH"),
        v.literal("NORMAL"),
        v.literal("LOW")
      )
    ),
    paginationOpts: v.optional(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    if (args.orderId) {
      // Bounded: one order has a small number of attendees
      return await ctx.db
        .query("ticketTailorAttendees")
        .withIndex("orderId", (q) => q.eq("orderId", args.orderId!))
        .take(100)
    }

    if (args.eventId) {
      const base = ctx.db
        .query("ticketTailorAttendees")
        .withIndex("providerEventOrder", (q) =>
          q.eq("providerEventId", args.eventId!)
        )

      if (args.paginationOpts) {
        return await base.paginate(args.paginationOpts)
      }

      // Backward-compatible: bounded fallback when no pagination requested
      const attendees = await base.take(500)
      return filterAttendees(attendees, args)
    }

    const base = ctx.db.query("ticketTailorAttendees")

    if (args.paginationOpts) {
      return await base.paginate(args.paginationOpts)
    }

    // Backward-compatible: bounded fallback
    const attendees = await base.take(500)
    return filterAttendees(attendees, args)
  },
})

export const getAttendeesWithTickets = query({
  args: {
    eventId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    // Get orders (optionally filtered by eventId)
    const orders = args.eventId
      ? await ctx.db
          .query("orders")
          .withIndex("by_eventId", (q) =>
            q.eq("eventId", args.eventId as Id<"events">)
          )
          .collect()
      : await ctx.db.query("orders").collect()

    const orderMap = new Map(orders.map((o) => [o._id, o]))
    const orderIds = new Set(orders.map((o) => o._id))

    // Get all attendees for these orders
    const allAttendees = await ctx.db.query("orderAttendees").collect()
    const attendees = allAttendees.filter((a) => orderIds.has(a.orderId))

    // Get ticket selections for these orders (join by orderId)
    const allSelections = await Promise.all(
      orders.map((order) =>
        ctx.db
          .query("orderTicketSelections")
          .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
          .collect()
      )
    )
    const selections = allSelections.flat()

    // Get ticket types
    const ticketTypeIds = Array.from(
      new Set(selections.map((s) => String(s.ticketTypeId)))
    )
    const ticketTypes = await Promise.all(
      ticketTypeIds.map((id) => ctx.db.get(id as Id<"ticketTypes">))
    )
    const ticketTypeMap = new Map(
      ticketTypes.filter(Boolean).map((tt) => [tt!._id, tt!.label])
    )

    // Build attendeeId -> ticketTypeLabel map
    const ticketLabelByAttendeeId = new Map<string, string>()
    for (const sel of selections) {
      const label = ticketTypeMap.get(sel.ticketTypeId)
      if (label) {
        ticketLabelByAttendeeId.set(String(sel.attendeeId), label)
      }
    }

    // Return attendees with ticketTypeLabel AND order data
    return attendees.map((a) => {
      const order = orderMap.get(a.orderId)
      return {
        _id: a._id,
        orderId: a.orderId,
        name: a.name,
        email: a.email ?? null,
        gender: a.gender,
        location: a.location ?? null,
        assignedRoomId: a.assignedRoomId ?? null,
        allocationPriority: a.allocationPriority ?? null,
        priorityReason: a.priorityReason ?? null,
        ticketTypeLabel: ticketLabelByAttendeeId.get(String(a._id)) ?? null,
        // Order data embedded
        orderProviderOrderId: order?.providerOrderId ?? null,
        orderEventId: order?.eventId ?? null,
        orderStatus: order?.status ?? null,
        orderTotalAmountMinor: order?.totalAmountMinor ?? null,
        orderSubmittedAt: order?.submittedAt ?? null,
        orderOrderedAt: order?.orderedAt ?? null,
      }
    })
  },
})

export const getAttendeeById = query({
  args: { attendeeId: v.id("ticketTailorAttendees") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    return await ctx.db.get("ticketTailorAttendees", args.attendeeId)
  },
})

export const getAttendeeByEmail = query({
  args: { eventId: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    // Bounded: one email has very few attendees
    const attendees = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .take(10)
    return attendees.filter((a) => a.providerEventId === args.eventId)
  },
})

export const createAttendee = mutation({
  args: {
    providerAttendeeId: v.optional(v.string()),
    providerIssuedTicketId: v.optional(v.string()),
    providerTicketTypeId: v.optional(v.string()),
    providerEventId: v.string(),
    providerOrderId: v.string(),
    eventId: v.union(v.id("events"), v.string()),
    orderId: v.id("orders"),
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
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const id = await ctx.db.insert("ticketTailorAttendees", args)
    return id
  },
})

export const upsertAttendee = mutation({
  args: {
    providerAttendeeId: v.optional(v.string()),
    providerIssuedTicketId: v.optional(v.string()),
    providerTicketTypeId: v.optional(v.string()),
    providerEventId: v.string(),
    providerOrderId: v.string(),
    eventId: v.union(v.id("events"), v.string()),
    orderId: v.id("orders"),
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
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    if (args.providerAttendeeId) {
      const existing = await ctx.db
        .query("ticketTailorAttendees")
        .withIndex("providerAttendeeId", (q) =>
          q.eq("providerAttendeeId", args.providerAttendeeId!)
        )
        .first()
      if (existing) {
        await ctx.db.patch("ticketTailorAttendees", existing._id, args)
        return existing._id
      }
    }
    return await ctx.db.insert("ticketTailorAttendees", args)
  },
})

export const updateAttendee = mutation({
  args: {
    attendeeId: v.id("ticketTailorAttendees"),
    assignedRoomId: v.optional(v.string()),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    genderType: v.optional(
      v.union(
        v.literal("MALE"),
        v.literal("FEMALE"),
        v.literal("MIXED"),
        v.literal("UNKNOWN")
      )
    ),
    allocationPriority: v.optional(
      v.union(
        v.literal("CRITICAL"),
        v.literal("HIGH"),
        v.literal("NORMAL"),
        v.literal("LOW")
      )
    ),
    priorityReason: v.optional(v.string()),
    tikkieAmountOverrideMinor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const { attendeeId, ...updates } = args
    await ctx.db.patch("ticketTailorAttendees", attendeeId, updates)
    return attendeeId
  },
})

export const assignRoom = mutation({
  args: {
    attendeeId: v.id("ticketTailorAttendees"),
    roomId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await ctx.runMutation(api.accommodation.assignAttendeeToRoom, {
      attendeeId: args.attendeeId,
      roomId: args.roomId,
    })
    return args.attendeeId
  },
})

export const unassignRoom = mutation({
  args: {
    attendeeId: v.id("ticketTailorAttendees"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await ctx.runMutation(api.accommodation.unassignAttendeeFromRoom, {
      attendeeId: args.attendeeId,
    })
    return args.attendeeId
  },
})

export const checkInAttendee = mutation({
  args: {
    attendeeId: v.id("ticketTailorAttendees"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await ctx.db.patch("ticketTailorAttendees", args.attendeeId, {
      checkedInAt: Date.now(),
    })
    return args.attendeeId
  },
})

export const getAttendeeByStringId = query({
  args: { attendeeId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const attendeeId = ctx.db.normalizeId(
      "ticketTailorAttendees",
      args.attendeeId
    )

    if (!attendeeId) {
      return null
    }

    return await ctx.db.get("ticketTailorAttendees", attendeeId)
  },
})
