import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "../_generated/server"
import { v } from "convex/values"
import { requireIdentity } from "../auth"
import type { Id } from "../_generated/dataModel"

// Public mutation (requires authentication)

export const upsertTicketTailorAttendee = mutation({
  args: {
    providerAttendeeId: v.optional(v.string()),
    providerIssuedTicketId: v.optional(v.string()),
    providerTicketTypeId: v.optional(v.string()),
    providerEventId: v.string(),
    providerOrderId: v.string(),
    eventId: v.union(v.id("events"), v.string()),
    orderId: v.id("orders"),
    attendeeId: v.optional(v.id("orderAttendees")),
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

// Public query

export const getTicketTailorAttendeesByOrderId = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const attendees = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("orderId", (q) => q.eq("orderId", args.orderId))
      .collect()
    return attendees
  },
})

// Internal mutations (no auth - for cron/action use)

export const internalUpsertTicketTailorAttendee = internalMutation({
  args: {
    providerAttendeeId: v.optional(v.string()),
    providerIssuedTicketId: v.optional(v.string()),
    providerTicketTypeId: v.optional(v.string()),
    providerEventId: v.string(),
    providerOrderId: v.string(),
    orderId: v.id("orders"),
    attendeeId: v.id("orderAttendees"),
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
        orderId: args.orderId,
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
        orderId: args.orderId,
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

// Internal query (no auth - for cron/action use)

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
