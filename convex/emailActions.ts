"use node"

import { action, internalAction, type ActionCtx } from "./_generated/server"
import { v } from "convex/values"
import { requireIdentity } from "./auth"
import { Resend } from "@convex-dev/resend"
import { api, components, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { render } from "@react-email/render"
import SignupConfirmationEmail from "../lib/email/templates/signup-confirmation"
import AnnouncementEmail from "../lib/email/templates/announcement"

const resend = new Resend(components.resend, {
  testMode: false,
})

type SignupConfirmationEmailArgs = {
  to: string
  bookerName: string
  bookingRef: string
  eventName: string
  eventDate: string
  eventLocation: string
  tikkieUrl?: string
  tikkieAmountMinor?: number
  tikkieCurrency?: string
  attendeeCount: number
  roomAssignments: Array<{
    roomType: string
    hotelName: string
    bedCount: number
  }>
  trackPaymentUrl: string
  successPageUrl: string
}

const signupConfirmationArgs = {
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
}

const signupConfirmationReturns = v.object({
  success: v.boolean(),
  emailId: v.optional(v.string()),
  error: v.optional(v.string()),
})

const backfillSignupConfirmationArgs = {
  dryRun: v.optional(v.boolean()),
  limit: v.optional(v.number()),
}

const backfillSignupConfirmationReturns = v.object({
  dryRun: v.boolean(),
  scanned: v.number(),
  queued: v.number(),
  skipped: v.number(),
  candidates: v.array(v.string()),
})

async function sendSignupConfirmationEmail(
  ctx: ActionCtx,
  args: SignupConfirmationEmailArgs
) {
  try {
    const html = await render(
      SignupConfirmationEmail({
        bookerName: args.bookerName,
        bookingRef: args.bookingRef,
        eventName: args.eventName,
        eventDate: args.eventDate,
        eventLocation: args.eventLocation,
        tikkieUrl: args.tikkieUrl || null,
        tikkieAmountMinor: args.tikkieAmountMinor,
        tikkieCurrency: args.tikkieCurrency,
        attendeeCount: args.attendeeCount,
        trackPaymentUrl: args.trackPaymentUrl,
        successPageUrl: args.successPageUrl,
      })
    )

    const text = `Booking Confirmed!

Hi ${args.bookerName},

Your booking for ${args.eventName} is confirmed.

Booking Reference: ${args.bookingRef}
Date: ${args.eventDate}
Location: ${args.eventLocation}
Attendees: ${args.attendeeCount}

${args.tikkieUrl ? `Please complete your payment: ${args.tikkieUrl}` : ""}

Manage your booking: ${args.trackPaymentUrl}
Keep your booking reference handy: ${args.bookingRef}

View your booking: ${args.successPageUrl}

This email was sent by DCLM NL Conference.`.trim()

    const fromName = process.env.RESEND_FROM_NAME || "DCLM NL Conference"
    const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@example.com"

    const emailId = await resend.sendEmail(ctx, {
      from: `${fromName} <${fromEmail}>`,
      to: args.to,
      subject: `Booking Confirmed: ${args.eventName}`,
      html,
      text,
    })

    if (!emailId) {
      console.error("Failed to send email: no emailId returned")
      return { success: false, error: "Failed to send email" }
    }

    await ctx.runMutation(internal.emailMutations.logSentEmail, {
      recipient: args.to,
      bookingRef: args.bookingRef,
      emailId,
      emailType: "signup_confirmation",
    })

    return { success: true, emailId }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("Email action threw:", error)
    return { success: false, error: message }
  }
}

async function sendOrderConfirmationResendEmail(
  ctx: ActionCtx,
  orderId: Id<"orders">
) {
  const order = await ctx.runQuery(api.orders.getOrderWithAttendees, {
    orderId,
  })

  if (!order) {
    return { success: false, error: "Order not found" }
  }

  if (!order.order.eventId) {
    return { success: false, error: "Order is missing event data" }
  }

  if (!order.order.bookerEmail) {
    return { success: false, error: "Order is missing a buyer email" }
  }

  if (!order.order.bookingRef) {
    return { success: false, error: "Order is missing a booking reference" }
  }

  const event = await ctx.runQuery(api.events.getEventById, {
    eventId: String(order.order.eventId),
  })

  const tikkieLink = await ctx.runQuery(
    api.tikkie.getEventPaymentLinkForSuccess,
    { eventId: order.order.eventId }
  )

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

  // Booking-specific confirmation links prefill the reference and let the
  // buyer verify ownership with the booking email in the manage form.
  const trackPaymentUrl = `${appUrl.replace(/\/+$/, "")}/booking/${encodeURIComponent(
    order.order.bookingRef
  )}/manage`

  const result = await sendSignupConfirmationEmail(ctx, {
    to: order.order.bookerEmail,
    bookerName: order.order.bookerName ?? "Guest",
    bookingRef: order.order.bookingRef,
    eventName: event?.title ?? "Conference",
    eventDate: event?.startsAt
      ? new Date(event.startsAt).toLocaleDateString("en-GB")
      : new Date().toLocaleDateString("en-GB"),
    eventLocation: "",
    tikkieUrl: tikkieLink?.paymentUrl,
    tikkieAmountMinor: tikkieLink?.amountMinor,
    tikkieCurrency: event?.currency,
    attendeeCount: order.attendees.length,
    roomAssignments: [],
    trackPaymentUrl,
    successPageUrl: `${appUrl}/signup/success/${order.order.bookingRef}`,
  })

  if (result.success) {
    await ctx.runMutation(internal.emailMutations.logSentEmail, {
      recipient: order.order.bookerEmail,
      bookingRef: order.order.bookingRef,
      emailId: result.emailId,
      emailType: "order_confirmation_resend",
    })
  }

  return result
}

export const sendSignupConfirmation = internalAction({
  args: signupConfirmationArgs,
  returns: signupConfirmationReturns,
  handler: async (ctx, args) => sendSignupConfirmationEmail(ctx, args),
})

export const sendSignupConfirmationTest = action({
  args: signupConfirmationArgs,
  returns: signupConfirmationReturns,
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    return sendSignupConfirmationEmail(ctx, args)
  },
})

const announcementTestArgs = {
  to: v.string(),
  title: v.string(),
  message: v.string(),
  eventName: v.string(),
  eventDate: v.string(),
  eventLocation: v.string(),
  manageBookingUrl: v.string(),
  signupUrl: v.string(),
  paymentUrl: v.optional(v.string()),
  nightBeforeNote: v.optional(v.string()),
}

const announcementTestReturns = v.object({
  success: v.boolean(),
  emailId: v.optional(v.string()),
  error: v.optional(v.string()),
})

/**
 * RUN-02 announcement email test-send. Renders `AnnouncementEmail` and sends
 * to exactly ONE supplied controlled recipient through the shared Resend
 * component, then logs the send as `announcement_test`. This is the ONLY
 * announcement path: there is no recipient list, scheduler, queue, or
 * broadcast action — an announcement broadcast is a later runbook step
 * requiring explicit operator authorization.
 */
export const sendAnnouncementTest = action({
  args: announcementTestArgs,
  returns: announcementTestReturns,
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    try {
      const html = await render(
        AnnouncementEmail({
          title: args.title,
          message: args.message,
          eventName: args.eventName,
          eventDate: args.eventDate,
          eventLocation: args.eventLocation,
          manageBookingUrl: args.manageBookingUrl,
          signupUrl: args.signupUrl,
          paymentUrl: args.paymentUrl || null,
          nightBeforeNote: args.nightBeforeNote || null,
        })
      )

      const text = `${args.title}

${args.message}

${args.eventName} | ${args.eventDate} | ${args.eventLocation}

${args.nightBeforeNote ? `Night before: ${args.nightBeforeNote}\n\n` : ""}${
        args.paymentUrl
          ? `Payments are handled via Tikkie: ${args.paymentUrl}\n\n`
          : ""
      }Manage your booking: ${args.manageBookingUrl}
Sign up: ${args.signupUrl}

This email was sent by DCLM NL Conference.`.trim()

      const fromName = process.env.RESEND_FROM_NAME || "DCLM NL Conference"
      const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@example.com"

      const emailId = await resend.sendEmail(ctx, {
        from: `${fromName} <${fromEmail}>`,
        to: args.to,
        subject: args.title,
        html,
        text,
      })

      if (!emailId) {
        console.error("Failed to send announcement test: no emailId returned")
        return { success: false, error: "Failed to send email" }
      }

      await ctx.runMutation(internal.emailMutations.logSentEmail, {
        recipient: args.to,
        bookingRef: "ANNOUNCEMENT_TEST",
        emailId,
        emailType: "announcement_test",
      })

      return { success: true, emailId }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error"
      console.error("Announcement test action threw:", error)
      return { success: false, error: message }
    }
  },
})

export const resendOrderConfirmation = action({
  args: { orderId: v.id("orders") },
  returns: signupConfirmationReturns,
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    return sendOrderConfirmationResendEmail(ctx, args.orderId)
  },
})
