import { query } from "./_generated/server"
import { v } from "convex/values"

export const getEmailStatus = query({
  args: {
    bookingRef: v.string(),
  },
  handler: async (ctx, args) => {
    const email = await ctx.db
      .query("sentEmails")
      .withIndex("by_bookingRef", (q) => q.eq("bookingRef", args.bookingRef))
      .first()

    return email || null
  },
})
