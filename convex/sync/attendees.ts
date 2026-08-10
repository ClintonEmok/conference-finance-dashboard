import { query, internalQuery } from "../_generated/server"
import { v } from "convex/values"
import type { Id } from "../_generated/dataModel"

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
