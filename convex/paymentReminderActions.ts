"use node"

import { internalAction, type ActionCtx } from "./_generated/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import { render } from "@react-email/render"
import { Resend } from "@convex-dev/resend"
import { components } from "./_generated/api"
import PaymentReminderEmail from "../lib/email/templates/payment-reminder"
import { buildTrackPaymentPermalink } from "../lib/domain/track-payment/edit-token"

const resend = new Resend(components.resend, { testMode: false })

export async function sendPaymentReminderEmail(ctx: ActionCtx, args: { to: string; kind: "unpaid" | "partial" | "overdue"; eventName: string; eventDate: string; bookerName: string; bookingRef: string; amountDueMinor: number; paidAmountMinor: number; outstandingAmountMinor: number; currency: string; managePaymentUrl: string }) {
  try {
    const html = await render(PaymentReminderEmail(args))
    const money = (minor: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: args.currency }).format(minor / 100)
    const text = `${args.kind} payment reminder\n\nHi ${args.bookerName},\n\n${args.eventName} (${args.eventDate})\nBooking reference: ${args.bookingRef}\nAmount due: ${money(args.amountDueMinor)}\nPaid: ${money(args.paidAmountMinor)}\nOutstanding: ${money(args.outstandingAmountMinor)}\n\nManage booking and payment: ${args.managePaymentUrl}`
    const emailId = await resend.sendEmail(ctx, { from: `${process.env.RESEND_FROM_NAME || "DCLM NL Conference"} <${process.env.RESEND_FROM_EMAIL || "noreply@example.com"}>`, to: args.to, subject: `${args.kind === "overdue" ? "Overdue: " : ""}Payment reminder for ${args.eventName}`, html, text })
    return emailId ? { success: true, emailId } : { success: false, error: "Provider returned no email id" }
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Unknown email error" } }
}

export const processBatch = internalAction({ args: { campaignId: v.string() }, handler: async (ctx, args) => {
  const rows = await ctx.runQuery(internal.paymentReminders.getPendingDeliveries, { campaignId: args.campaignId, limit: 25 })
  for (const row of rows) {
    await ctx.runMutation(internal.paymentReminders.markDeliverySending, { deliveryId: row._id })
    const current = await ctx.runQuery(internal.paymentReminders.getDeliveryContext, { deliveryId: row._id })
    if (!current?.order || !current.event || !current.policy) { await ctx.runMutation(internal.paymentReminders.recordDelivery, { deliveryId: row._id, status: "skipped", error: "Order is no longer eligible" }); continue }
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "")
    const managePaymentUrl = await buildTrackPaymentPermalink({ bookingRef: current.order.bookingRef!, bookerEmail: current.order.bookerEmail!, appUrl }) ?? `${appUrl}/booking/${encodeURIComponent(current.order.bookingRef!)}/manage`
    const result = await sendPaymentReminderEmail(ctx, { to: current.order.bookerEmail!, kind: row.kind, eventName: current.event.title, eventDate: new Date(current.event.startsAt).toLocaleDateString("en-GB"), bookerName: current.order.bookerName ?? "Guest", bookingRef: current.order.bookingRef!, amountDueMinor: current.policy.amountDueMinor, paidAmountMinor: current.policy.paidAmountMinor, outstandingAmountMinor: current.policy.outstandingAmountMinor, currency: current.event.currency, managePaymentUrl })
    if (result.success && result.emailId) { await ctx.runMutation(internal.paymentReminders.recordDelivery, { deliveryId: row._id, status: "sent", providerEmailId: result.emailId }); await ctx.runMutation(internal.emailMutations.logSentEmail, { recipient: current.order.bookerEmail!, bookingRef: current.order.bookingRef!, emailId: result.emailId, emailType: `payment_reminder_${row.kind}`, eventId: row.eventId }) }
    else await ctx.runMutation(internal.paymentReminders.recordDelivery, { deliveryId: row._id, status: "failed", error: result.error })
  }
  if (rows.length === 25) await ctx.scheduler.runAfter(0, internal.paymentReminderActions.processBatch, { campaignId: args.campaignId })
  return { processed: rows.length }
} })
