import { internalMutation } from "./_generated/server"
import { v } from "convex/values"

export const logSentEmail = internalMutation({
  args: {
    recipient: v.string(),
    bookingRef: v.string(),
    emailId: v.optional(v.string()),
    emailType: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("sentEmails", {
      ...args,
      sentAt: Date.now(),
    })
  },
})
