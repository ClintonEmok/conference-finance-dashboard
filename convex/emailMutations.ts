import { internalMutation, mutation } from "./_generated/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"

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

/**
 * Public mutation that triggers the signup confirmation email action.
 * Fire-and-forget: the submit route calls this without awaiting.
 */
export const triggerSignupConfirmationEmail = mutation({
  args: {
    to: v.string(),
    bookerName: v.string(),
    bookingRef: v.string(),
    eventName: v.string(),
    eventDate: v.string(),
    eventLocation: v.string(),
    tikkieUrl: v.optional(v.string()),
    tikkieAmountMinor: v.optional(v.number()),
    tikkieCurrency: v.optional(v.string()),
    attendeeCount: v.number(),
    roomAssignments: v.array(
      v.object({
        roomType: v.string(),
        hotelName: v.string(),
        bedCount: v.number(),
      })
    ),
    trackPaymentUrl: v.string(),
    successPageUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Fire-and-forget: schedule the action, don't await
    ctx.scheduler.runAfter(
      0,
      internal.emailActions.sendSignupConfirmation,
      args
    )
    return null
  },
})
