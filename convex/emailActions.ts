"use node"

import { action, internalAction, type ActionCtx } from "./_generated/server"
import { v } from "convex/values"
import { Resend } from "@convex-dev/resend"
import { components } from "./_generated/api"
import { render } from "@react-email/render"
import SignupConfirmationEmail from "../lib/email/templates/signup-confirmation"

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
  successPageUrl: v.string(),
}

const signupConfirmationReturns = v.object({
  success: v.boolean(),
  emailId: v.optional(v.string()),
  error: v.optional(v.string()),
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
        roomAssignments: args.roomAssignments,
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

View your booking: ${args.successPageUrl}

This email was sent by Conference Finance.`.trim()

    const fromName = process.env.RESEND_FROM_NAME || "Conference Finance"
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

    return { success: true, emailId }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("Email action threw:", error)
    return { success: false, error: message }
  }
}

export const sendSignupConfirmation = internalAction({
  args: signupConfirmationArgs,
  returns: signupConfirmationReturns,
  handler: async (ctx, args) => sendSignupConfirmationEmail(ctx, args),
})

export const sendSignupConfirmationTest = action({
  args: signupConfirmationArgs,
  returns: signupConfirmationReturns,
  handler: async (ctx, args) => sendSignupConfirmationEmail(ctx, args),
})
