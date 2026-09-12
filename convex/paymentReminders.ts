import { mutation } from "./_generated/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import { requireIdentity } from "./auth"
import { broadcastSelectionValidator, MAX_BROADCAST_RECIPIENTS, resolveBroadcastAudience } from "./emailBroadcasts"
import { loadMatchedPaymentTotalsByOrderId, loadOrderAmountDueBreakdowns } from "./finance"
import { classifyPaymentReminder } from "../lib/domain/finance/payment-reminder-policy"
import { PAYMENT_REMINDER_MESSAGE, PAYMENT_REMINDER_NOTE, PAYMENT_REMINDER_TITLE } from "../lib/email/payment-reminder-copy"

export const schedulePaymentReminder = mutation({
  args: { eventId: v.id("events"), selection: broadcastSelectionValidator, authorize: v.boolean() },
  returns: v.object({ broadcastId: v.id("emailBroadcasts"), totalRecipients: v.number() }),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    if (!args.authorize) throw new Error("Payment reminder requires explicit authorization")
    const event = await ctx.db.get("events", args.eventId)
    if (!event) throw new Error("Event not found")
    if (event.primarySourceKind !== "internal") throw new Error("Broadcasts are only available for internal events")
    const audience = await resolveBroadcastAudience(ctx, args.eventId, args.selection)
    const orders = await Promise.all(audience.recipients.map((r) => ctx.db.get("orders", r.orderId)))
    const validOrders = orders.filter((o): o is NonNullable<typeof o> => Boolean(o))
    const due = await loadOrderAmountDueBreakdowns(ctx, validOrders)
    const paid = await loadMatchedPaymentTotalsByOrderId(ctx, validOrders)
    const eligible = audience.recipients.flatMap((recipient) => {
      const order = orders.find((candidate) => candidate?._id === recipient.orderId)
      if (!order) return []
      const policy = classifyPaymentReminder(due.get(String(order._id))?.amountDueMinor ?? 0, paid.get(String(order._id)) ?? 0)
      return policy ? [{ recipient, policy }] : []
    })
    if (eligible.length === 0) throw new Error("No selected bookers have an outstanding balance")
    if (eligible.length > MAX_BROADCAST_RECIPIENTS) throw new Error("Audience exceeds the maximum recipient limit")
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "")
    const signupUrl = `${appUrl}/signup/${encodeURIComponent(event.slug)}`
    const broadcastId = await ctx.db.insert("emailBroadcasts", {
      eventId: args.eventId, status: "queued", title: PAYMENT_REMINDER_TITLE, message: PAYMENT_REMINDER_MESSAGE,
      eventName: event.title, eventDate: event.startsAt ? new Date(event.startsAt).toLocaleDateString("en-GB") : "",
      eventLocation: "", nightBeforeNote: PAYMENT_REMINDER_NOTE, signupUrl, campaignType: "paymentReminder",
      reminderKind: eligible[0].policy.kind, amountOutstandingMinor: eligible[0].policy.outstandingAmountMinor,
      filters: { selection: args.selection }, totalRecipients: eligible.length, sentCount: 0, failedCount: 0,
      pendingCount: eligible.length, createdBy: identity.email ?? identity.subject, createdAt: Date.now(),
    })
    for (const { recipient } of eligible) {
      await ctx.db.insert("emailBroadcastRecipients", { broadcastId, orderId: recipient.orderId, to: recipient.bookerEmail,
        bookerName: recipient.bookerName ?? undefined, bookingRef: recipient.bookingRef ?? undefined, status: "pending", attempts: 0 })
    }
    await ctx.scheduler.runAfter(0, internal.emailBroadcastActions.processBatch, { broadcastId })
    return { broadcastId, totalRecipients: eligible.length }
  },
})
