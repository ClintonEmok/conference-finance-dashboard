"use node"

import { internalAction } from "./_generated/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import { buildTrackPaymentPermalink } from "../lib/domain/track-payment/edit-token"
import { sendPaymentReminderEmail } from "./emailActions"

const BATCH_SIZE = 25
const SENDING_LEASE_MS = 10 * 60 * 1000

export const processBatch = internalAction({
  args: { campaignId: v.string() },
  handler: async (ctx, args) => {
    // Claiming is a single transaction. This prevents overlapping scheduled
    // actions from sending the same queued delivery twice.
    const rows = await ctx.runMutation(
      internal.paymentReminders.claimPendingDeliveries,
      { campaignId: args.campaignId, limit: BATCH_SIZE }
    )

    let needsRecovery = false
    for (const row of rows) {
      try {
        const current = await ctx.runQuery(
          internal.paymentReminders.getDeliveryContext,
          { deliveryId: row._id }
        )
        if (
          !current?.order ||
          !current.event ||
          !current.policy ||
          !current.recipient ||
          !current.bookingRef
        ) {
          await ctx.runMutation(internal.paymentReminders.recordDelivery, {
            deliveryId: row._id,
            status: "skipped",
            error: "Order is no longer eligible",
          })
          continue
        }

        const appUrl = (
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
        ).replace(/\/+$/, "")
        const managePaymentUrl =
          (await buildTrackPaymentPermalink({
            bookingRef: current.bookingRef,
            bookerEmail: current.recipient,
            appUrl,
          })) ??
          `${appUrl}/booking/${encodeURIComponent(current.bookingRef)}/manage`
        const kind = current.policy.kind
        const result = await sendPaymentReminderEmail(ctx, {
          to: current.recipient,
          kind,
          eventName: current.event.title,
          eventDate: new Date(current.event.startsAt).toLocaleDateString(
            "en-GB",
            {
              timeZone: current.event.timezone,
            }
          ),
          bookerName: current.order.bookerName ?? "Guest",
          bookingRef: current.bookingRef,
          amountDueMinor: current.policy.amountDueMinor,
          paidAmountMinor: current.policy.paidAmountMinor,
          outstandingAmountMinor: current.policy.outstandingAmountMinor,
          currency: current.event.currency,
          managePaymentUrl,
        })

        if (result.success && result.emailId) {
          await ctx.runMutation(internal.paymentReminders.recordDelivery, {
            deliveryId: row._id,
            status: "sent",
            providerEmailId: result.emailId,
          })
          await ctx.runMutation(internal.emailMutations.logSentEmail, {
            recipient: current.recipient,
            bookingRef: current.bookingRef,
            emailId: result.emailId,
            emailType: `payment_reminder_${kind}`,
            eventId: row.eventId,
          })
        } else {
          await ctx.runMutation(internal.paymentReminders.recordDelivery, {
            deliveryId: row._id,
            status: "failed",
            error: result.error,
          })
        }
      } catch (error) {
        needsRecovery = true
        await ctx.runMutation(internal.paymentReminders.recordDelivery, {
          deliveryId: row._id,
          status: "failed",
          error: error instanceof Error ? error.message : "Delivery failed",
        })
      }
    }

    if (rows.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.paymentReminderActions.processBatch,
        { campaignId: args.campaignId }
      )
    }
    if (needsRecovery) {
      await ctx.scheduler.runAfter(
        SENDING_LEASE_MS,
        internal.paymentReminderActions.processBatch,
        { campaignId: args.campaignId }
      )
    }
    return { processed: rows.length }
  },
})
