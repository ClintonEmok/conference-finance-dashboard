import { v } from "convex/values"
import { mutation } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import {
  signupGenderValidator,
  signupSourceValidator,
} from "../lib/types/signup"

const IDEMPOTENCY_WINDOW_MS = 2 * 60 * 60 * 1000

const attendeeValidator = v.object({
  attendeeKey: v.string(),
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.string(),
  gender: signupGenderValidator,
  location: v.string(),
  dietaryRestrictions: v.string(),
  roommatePreference: v.string(),
  roommateAvoid: v.string(),
})

const ticketSelectionValidator = v.object({
  attendeeKey: v.string(),
  ticketTypeId: v.id("ticketTypes"),
  quantity: v.number(),
})

const assignmentValidator = v.object({
  attendeeKey: v.string(),
  slotId: v.id("accommodationSlots"),
  assignmentIntent: v.union(v.literal("assign"), v.literal("skip")),
})

function throwSubmissionError(
  code: "SUBMISSION_CONFLICT" | "TICKET_UNAVAILABLE" | "ASSIGNMENT_UNAVAILABLE",
  message: string
): never {
  throw new Error(`${code}: ${message}`)
}

function normalizeRequiredString(value: string, fieldName: string) {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`Invalid '${fieldName}'. Value is required.`)
  }
  return normalized
}

function normalizeOptionalString(value: string | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function hashString(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }

  return Math.abs(hash).toString(36)
}

function buildBookingRef(input: {
  submittedAt: number
  eventId: string
  idempotencyKey: string
}) {
  const date = new Date(input.submittedAt)
  const datePart = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("")

  const uniquePart = hashString(
    `${input.eventId}:${input.idempotencyKey}:${input.submittedAt}`
  )
    .toUpperCase()
    .slice(0, 8)

  return `BK-${datePart}-${uniquePart}`
}

export const submitSignupEnvelope = mutation({
  args: {
    eventId: v.id("events"),
    source: signupSourceValidator,
    idempotencyKey: v.string(),
    payloadFingerprint: v.string(),
    honeypotSeen: v.boolean(),
    notes: v.optional(v.string()),
    booker: v.object({
      name: v.string(),
      email: v.string(),
      phone: v.optional(v.string()),
    }),
    attendees: v.array(attendeeValidator),
    ticketSelections: v.array(ticketSelectionValidator),
    assignments: v.array(assignmentValidator),
  },
  returns: v.object({
    submissionId: v.id("submissions"),
    bookingRef: v.string(),
    submittedAt: v.string(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const idempotencyKey = normalizeRequiredString(
      args.idempotencyKey,
      "idempotencyKey"
    )
    const payloadFingerprint = normalizeRequiredString(
      args.payloadFingerprint,
      "payloadFingerprint"
    )

    const bookerName = normalizeRequiredString(args.booker.name, "booker.name")
    const bookerEmail = normalizeRequiredString(
      args.booker.email,
      "booker.email"
    )
    const bookerPhone = normalizeOptionalString(args.booker.phone)
    const notes = normalizeOptionalString(args.notes)

    const event = await ctx.db.get(args.eventId)
    if (!event) {
      throwSubmissionError("SUBMISSION_CONFLICT", "Event not found")
    }

    if (!event.isPublished || !event.isSignupOpen) {
      throwSubmissionError(
        "SUBMISSION_CONFLICT",
        "Signup is currently closed for this event"
      )
    }

    if (args.attendees.length === 0) {
      throwSubmissionError(
        "SUBMISSION_CONFLICT",
        "Invalid 'attendees'. At least one attendee is required."
      )
    }

    if (args.ticketSelections.length === 0) {
      throwSubmissionError(
        "SUBMISSION_CONFLICT",
        "Invalid 'ticketSelections'. At least one ticket selection is required."
      )
    }

    const existingIdempotency = await ctx.db
      .query("submissionIdempotency")
      .withIndex("by_eventId_and_idempotencyKey", (q) =>
        q.eq("eventId", args.eventId).eq("idempotencyKey", idempotencyKey)
      )
      .first()

    if (existingIdempotency && existingIdempotency.expiresAt >= now) {
      throwSubmissionError(
        "SUBMISSION_CONFLICT",
        "Duplicate idempotency key in active retry window"
      )
    }

    const attendeeKeySet = new Set<string>()
    for (const attendee of args.attendees) {
      const attendeeKey = normalizeRequiredString(
        attendee.attendeeKey,
        "attendees.attendeeKey"
      )
      if (attendeeKeySet.has(attendeeKey)) {
        throwSubmissionError(
          "SUBMISSION_CONFLICT",
          `Duplicate attendee key '${attendeeKey}' in submission envelope`
        )
      }

      attendeeKeySet.add(attendeeKey)
      normalizeRequiredString(attendee.name, "attendees.name")
      if (attendee.email) {
        normalizeRequiredString(attendee.email, "attendees.email")
      }
      normalizeRequiredString(attendee.phone, "attendees.phone")
      normalizeRequiredString(attendee.location, "attendees.location")
      normalizeRequiredString(
        attendee.dietaryRestrictions,
        "attendees.dietaryRestrictions"
      )
      normalizeRequiredString(
        attendee.roommatePreference,
        "attendees.roommatePreference"
      )
      normalizeRequiredString(attendee.roommateAvoid, "attendees.roommateAvoid")
    }

    const eventTicketTypes = await ctx.db
      .query("ticketTypes")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500)
    const ticketTypeById = new Map(
      eventTicketTypes.map((ticketType) => [ticketType._id, ticketType])
    )

    for (const selection of args.ticketSelections) {
      if (!attendeeKeySet.has(selection.attendeeKey)) {
        throwSubmissionError(
          "SUBMISSION_CONFLICT",
          `Ticket selection references unknown attendee '${selection.attendeeKey}'.`
        )
      }

      if (selection.quantity !== 1) {
        throwSubmissionError(
          "SUBMISSION_CONFLICT",
          "Ticket selections must be persisted as per-attendee rows (quantity = 1)."
        )
      }

      const ticketType = ticketTypeById.get(selection.ticketTypeId)
      if (!ticketType) {
        throwSubmissionError(
          "TICKET_UNAVAILABLE",
          "Selected ticket type does not belong to this event"
        )
      }
    }

    const eventSlots = await ctx.db
      .query("accommodationSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(1000)
    const slotById = new Map(eventSlots.map((slot) => [slot._id, slot]))

    for (const assignment of args.assignments) {
      if (!attendeeKeySet.has(assignment.attendeeKey)) {
        throwSubmissionError(
          "SUBMISSION_CONFLICT",
          `Assignment references unknown attendee '${assignment.attendeeKey}'.`
        )
      }

      const slot = slotById.get(assignment.slotId)
      if (!slot) {
        throwSubmissionError(
          "ASSIGNMENT_UNAVAILABLE",
          "Assignment references an unknown accommodation slot"
        )
      }
    }

    const bookingRef = buildBookingRef({
      submittedAt: now,
      eventId: String(args.eventId),
      idempotencyKey,
    })

    const submissionId = await ctx.db.insert("submissions", {
      eventId: args.eventId,
      source: args.source,
      idempotencyKey,
      bookingRef,
      honeypotSeen: args.honeypotSeen,
      notes,
      bookerName,
      bookerEmail,
      bookerPhone,
      submittedAt: now,
    })

    const attendeeIdsByKey = new Map<string, Id<"submissionAttendees">>()

    for (const [sortOrder, attendee] of args.attendees.entries()) {
      const attendeeId = await ctx.db.insert("submissionAttendees", {
        submissionId,
        attendeeKey: attendee.attendeeKey,
        name: attendee.name,
        email: normalizeOptionalString(attendee.email),
        phone: attendee.phone,
        gender: attendee.gender,
        location: attendee.location,
        dietaryRestrictions: attendee.dietaryRestrictions,
        roommatePreference: attendee.roommatePreference,
        roommateAvoid: attendee.roommateAvoid,
        sortOrder,
      })

      attendeeIdsByKey.set(attendee.attendeeKey, attendeeId)
    }

    for (const [sortOrder, selection] of args.ticketSelections.entries()) {
      const attendeeId = attendeeIdsByKey.get(selection.attendeeKey)
      if (!attendeeId) {
        throwSubmissionError(
          "SUBMISSION_CONFLICT",
          `Ticket selection attendee '${selection.attendeeKey}' could not be resolved`
        )
      }

      await ctx.db.insert("submissionTicketSelections", {
        submissionId,
        attendeeId,
        ticketTypeId: selection.ticketTypeId,
        quantity: 1,
        sortOrder,
      })
    }

    for (const [sortOrder, assignment] of args.assignments.entries()) {
      const attendeeId = attendeeIdsByKey.get(assignment.attendeeKey)
      if (!attendeeId) {
        throwSubmissionError(
          "SUBMISSION_CONFLICT",
          `Assignment attendee '${assignment.attendeeKey}' could not be resolved`
        )
      }

      await ctx.db.insert("submissionAssignments", {
        submissionId,
        attendeeId,
        slotId: assignment.slotId,
        assignmentIntent: assignment.assignmentIntent,
        sortOrder,
      })
    }

    if (existingIdempotency) {
      await ctx.db.patch(existingIdempotency._id, {
        fingerprint: payloadFingerprint,
        submissionId,
        expiresAt: now + IDEMPOTENCY_WINDOW_MS,
      })
    } else {
      await ctx.db.insert("submissionIdempotency", {
        eventId: args.eventId,
        idempotencyKey,
        fingerprint: payloadFingerprint,
        submissionId,
        expiresAt: now + IDEMPOTENCY_WINDOW_MS,
      })
    }

    return {
      submissionId,
      bookingRef,
      submittedAt: new Date(now).toISOString(),
    }
  },
})
