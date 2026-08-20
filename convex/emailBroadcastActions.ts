"use node"

import { internalAction } from "./_generated/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { sendAnnouncementEmail } from "./emailActions"

const BATCH_SIZE = 25

/**
 * Scheduler-driven batch loop for an email broadcast. Reads a bounded batch of
 * pending recipients, sends each through the shared Resend path, records the
 * outcome (job counters + per-recipient status + sentEmails audit row), and
 * re-schedules itself until the job is drained or cancelled. Never sends
 * inline from a request: the only entry point is `scheduleEmailBroadcast`.
 */
export const processBatch = internalAction({
  args: { broadcastId: v.id("emailBroadcasts") },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.emailBroadcasts.getJob, {
      broadcastId: args.broadcastId,
    })
    if (!job) {
      return { done: true }
    }
    if (
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled"
    ) {
      return { done: true }
    }

    if (job.status === "queued") {
      await ctx.runMutation(internal.emailBroadcasts.markSending, {
        broadcastId: args.broadcastId,
        startedAt: Date.now(),
      })
    }

    const recipients = await ctx.runQuery(
      internal.emailBroadcasts.getPendingRecipients,
      {
        broadcastId: args.broadcastId,
        limit: BATCH_SIZE,
      }
    )

    if (recipients.length === 0) {
      await ctx.runMutation(internal.emailBroadcasts.finalizeBroadcast, {
        broadcastId: args.broadcastId,
      })
      return { done: true }
    }

    for (const recipient of recipients) {
      const result = await sendAnnouncementEmail(ctx, {
        to: recipient.to,
        title: job.title,
        message: job.message,
        eventName: job.eventName,
        eventDate: job.eventDate,
        bookingRef: recipient.bookingRef,
        manageBookingUrl: recipient.manageBookingUrl ?? job.signupUrl,
        signupUrl: job.signupUrl,
        paymentUrl: job.paymentUrl,
        nightBeforeNote: job.nightBeforeNote,
      })

      if (result.success && result.emailId) {
        await ctx.runMutation(
          internal.emailBroadcasts.recordRecipientSuccess,
          {
            broadcastId: args.broadcastId,
            recipientId: recipient._id,
            emailId: result.emailId,
            sentAt: Date.now(),
          }
        )
        await ctx.runMutation(internal.emailMutations.logSentEmail, {
          recipient: recipient.to,
          bookingRef: recipient.bookingRef ?? "BROADCAST",
          emailId: result.emailId,
          emailType: "announcement_broadcast",
          eventId: job.eventId,
          broadcastId: args.broadcastId,
        })
      } else {
        await ctx.runMutation(
          internal.emailBroadcasts.recordRecipientFailure,
          {
            broadcastId: args.broadcastId,
            recipientId: recipient._id,
            error: result.error ?? "Unknown send error",
          }
        )
      }
    }

    await ctx.scheduler.runAfter(
      0,
      internal.emailBroadcastActions.processBatch,
      { broadcastId: args.broadcastId }
    )

    return { done: false }
  },
})
