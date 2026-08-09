import { v } from "convex/values"
import { internalMutation } from "./_generated/server"
import { deriveNightCount } from "./accommodation"

/**
 * One-off migration for the Divine Conference event:
 *
 * The event ticket already includes accommodation for the event nights. This
 * moves the event's base stay window onto the event dates (so `nightCount`
 * derives to the event night count) and marks every ticket on the event as
 * `accommodationIncluded`, so the base stay is covered by the ticket and the
 * signup quote charges €0 for the base accommodation (add-ons like the cot are
 * still charged). The optional night-before stay is a separate extended-stay
 * purchase that is not yet surfaced in the buyer flow.
 *
 * The mutation is idempotent and only touches the named event's config row and
 * ticket rows. No other event, order, selection, or payment data is modified.
 */
export default internalMutation({
  args: {
    eventId: v.id("events"),
    baseCheckInAt: v.number(),
    baseCheckOutAt: v.number(),
    markTicketsIncluded: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event) {
      throw new Error("Event not found")
    }

    const configRow = await ctx.db
      .query("eventAccommodationConfig")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique()

    let configUpdated = 0
    if (configRow) {
      const nightCount = deriveNightCount(
        args.baseCheckInAt,
        args.baseCheckOutAt
      )
      await ctx.db.patch("eventAccommodationConfig", configRow._id, {
        baseCheckInAt: args.baseCheckInAt,
        baseCheckOutAt: args.baseCheckOutAt,
        nightCount,
      })
      configUpdated = 1
    }

    let ticketsUpdated = 0
    if (args.markTicketsIncluded === true) {
      const tickets = await ctx.db
        .query("ticketTypes")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(100)
      for (const ticket of tickets) {
        await ctx.db.patch("ticketTypes", ticket._id, {
          accommodationIncluded: true,
        })
        ticketsUpdated += 1
      }
    }

    return {
      configUpdated,
      ticketsUpdated,
      nightCount: configRow ? deriveNightCount(args.baseCheckInAt, args.baseCheckOutAt) : null,
    }
  },
})
