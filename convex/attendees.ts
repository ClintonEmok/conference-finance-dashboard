import { query, mutation } from "./_generated/server"
import { v } from "convex/values"
import { requireIdentity } from "./auth"
import { api } from "./_generated/api"

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
    orderId: v.optional(v.id("ticketTailorOrders")),
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
  },
  handler: async (ctx, args) => {
    if (args.orderId) {
      return await ctx.db
        .query("ticketTailorAttendees")
        .withIndex("orderId", (q) => q.eq("orderId", args.orderId!))
        .collect()
    }

    if (args.eventId) {
      const attendees = await ctx.db
        .query("ticketTailorAttendees")
        .withIndex("eventId", (q) => q.eq("eventId", args.eventId!))
        .collect()

      return filterAttendees(attendees, args)
    }

    const attendees = await ctx.db.query("ticketTailorAttendees").collect()
    return filterAttendees(attendees, args)
  },
})

export const getAttendeeById = query({
  args: { attendeeId: v.id("ticketTailorAttendees") },
  handler: async (ctx, args) => {
    return await ctx.db.get("ticketTailorAttendees", args.attendeeId)
  },
})

export const getAttendeeByEmail = query({
  args: { eventId: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const attendees = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("email", (q) => q.eq("email", args.email))
      .collect()
    return attendees.filter((a) => a.eventId === args.eventId)
  },
})

export const createAttendee = mutation({
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
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    if (args.providerAttendeeId) {
      const existing = await ctx.db
        .query("ticketTailorAttendees")
        .withIndex("providerAttendeeId", (q) =>
          q.eq("providerAttendeeId", args.providerAttendeeId!)
        )
        .collect()
      if (existing[0]) {
        await ctx.db.patch("ticketTailorAttendees", existing[0]._id, args)
        return existing[0]._id
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
