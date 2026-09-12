"use node"

import { internalAction } from "./_generated/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import { buildTrackPaymentPermalink } from "../lib/domain/track-payment/edit-token"
import { sendPaymentReminderEmail } from "./emailActions"

export const processBatch = internalAction({ args: { campaignId: v.string() }, handler: async (ctx, args) => {
  const rows = await ctx.runQuery(internal.paymentReminders.getPendingDeliveries, { campaignId: args.campaignId, limit: 25 })
  for (const row of rows) {
    await ctx.runMutation(internal.paymentReminders.markDeliverySending, { deliveryId: row._id })
    const current = await ctx.runQuery(internal.paymentReminders.getDeliveryContext, { deliveryId: row._id })
    if (!current?.order || !current.event || !current.policy || !current.recipient || !current.bookingRef) { await ctx.runMutation(internal.paymentReminders.recordDelivery, { deliveryId: row._id, status: "skipped", error: "Order is no longer eligible" }); continue }
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "")
    const managePaymentUrl = await buildTrackPaymentPermalink({ bookingRef: current.bookingRef, bookerEmail: current.recipient, appUrl }) ?? `${appUrl}/booking/${encodeURIComponent(current.bookingRef)}/manage`
    const result = await sendPaymentReminderEmail(ctx, { to: current.recipient, kind: row.kind, eventName: current.event.title, eventDate: new Date(current.event.startsAt).toLocaleDateString("en-GB"), bookerName: current.order.bookerName ?? "Guest", bookingRef: current.bookingRef, amountDueMinor: current.policy.amountDueMinor, paidAmountMinor: current.policy.paidAmountMinor, outstandingAmountMinor: current.policy.outstandingAmountMinor, currency: current.event.currency, managePaymentUrl })
    if (result.success && result.emailId) { await ctx.runMutation(internal.paymentReminders.recordDelivery, { deliveryId: row._id, status: "sent", providerEmailId: result.emailId }); await ctx.runMutation(internal.emailMutations.logSentEmail, { recipient: current.recipient, bookingRef: current.bookingRef, emailId: result.emailId, emailType: `payment_reminder_${row.kind}`, eventId: row.eventId }) }
    else await ctx.runMutation(internal.paymentReminders.recordDelivery, { deliveryId: row._id, status: "failed", error: result.error })
  }
  if (rows.length === 25) await ctx.scheduler.runAfter(0, internal.paymentReminderActions.processBatch, { campaignId: args.campaignId })
  return { processed: rows.length }
} })
