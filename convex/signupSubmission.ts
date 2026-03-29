import { v } from "convex/values"
import { mutation } from "./_generated/server"

const IDEMPOTENCY_WINDOW_MS = 2 * 60 * 60 * 1000

const attendeeValidator = v.object({
  attendeeKey: v.string(),
  fullName: v.string(),
  email: v.string(),
  gender: v.union(
    v.literal("male"),
    v.literal("female"),
    v.literal("mixed"),
    v.literal("unknown")
  ),
  location: v.string(),
  dietaryRestrictions: v.string(),
  roommatePreference: v.string(),
  roommateAvoid: v.string(),
  phone: v.string(),
})

const ticketSelectionValidator = v.object({
  ticketTypeId: v.string(),
  quantity: v.number(),
  attendeeKey: v.optional(v.string()),
})

const assignmentValidator = v.object({
  attendeeKey: v.string(),
  slotId: v.string(),
})

type SignupSubmissionErrorCode =
  | "CAPACITY_EXCEEDED"
  | "TICKET_UNAVAILABLE"
  | "ASSIGNMENT_UNAVAILABLE"
  | "SUBMISSION_CONFLICT"

function throwSignupError(
  code: SignupSubmissionErrorCode,
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
  signupEventId: string
  idempotencyKey: string
}) {
  const date = new Date(input.submittedAt)
  const datePart = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("")

  const uniquePart = hashString(
    `${input.signupEventId}:${input.idempotencyKey}:${input.submittedAt}`
  )
    .toUpperCase()
    .slice(0, 8)

  return `BK-${datePart}-${uniquePart}`
}

export const submitSignupEnvelope = mutation({
  args: {
    signupEventId: v.string(),
    source: v.union(v.literal("integration"), v.literal("internal")),
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
    submissionId: v.string(),
    bookingRef: v.string(),
    submittedAt: v.string(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const signupEventId = normalizeRequiredString(
      args.signupEventId,
      "signupEventId"
    )
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

    if (args.attendees.length === 0) {
      throwSignupError(
        "SUBMISSION_CONFLICT",
        "Invalid 'attendees'. At least one attendee is required."
      )
    }

    if (args.ticketSelections.length === 0) {
      throwSignupError(
        "SUBMISSION_CONFLICT",
        "Invalid 'ticketSelections'. At least one ticket selection is required."
      )
    }

    const normalizedSignupEventId = ctx.db.normalizeId(
      "signupEvents",
      signupEventId
    )
    const signupEvent = normalizedSignupEventId
      ? await ctx.db.get("signupEvents", normalizedSignupEventId)
      : null

    if (!signupEvent) {
      throwSignupError("SUBMISSION_CONFLICT", "Signup event not found")
    }

    if (!signupEvent.isPublished || !signupEvent.isSignupOpen) {
      throwSignupError(
        "SUBMISSION_CONFLICT",
        "Signup is currently closed for this event"
      )
    }

    const idempotencyRecord = await ctx.db
      .query("signupSubmissionIdempotency")
      .withIndex("by_signupEventId_and_idempotencyKey", (q) =>
        q
          .eq("signupEventId", signupEventId)
          .eq("idempotencyKey", idempotencyKey)
      )
      .unique()

    if (idempotencyRecord && idempotencyRecord.expiresAt >= now) {
      if (idempotencyRecord.payloadFingerprint !== payloadFingerprint) {
        throwSignupError(
          "SUBMISSION_CONFLICT",
          "Idempotency key already used with a different payload"
        )
      }

      const normalizedSubmissionId = ctx.db.normalizeId(
        "signupSubmissions",
        idempotencyRecord.submissionId
      )
      const existingSubmission = normalizedSubmissionId
        ? await ctx.db.get("signupSubmissions", normalizedSubmissionId)
        : null

      if (existingSubmission) {
        return {
          submissionId: existingSubmission._id,
          bookingRef: existingSubmission.bookingRef,
          submittedAt: new Date(existingSubmission.submittedAt).toISOString(),
        }
      }
    }

    const attendeeKeys = new Set<string>()
    for (const attendee of args.attendees) {
      const attendeeKey = normalizeRequiredString(
        attendee.attendeeKey,
        "attendees.attendeeKey"
      )

      if (attendeeKeys.has(attendeeKey)) {
        throwSignupError(
          "SUBMISSION_CONFLICT",
          `Duplicate attendee key '${attendeeKey}' in envelope.`
        )
      }

      attendeeKeys.add(attendeeKey)

      normalizeRequiredString(attendee.fullName, "attendees.fullName")
      normalizeRequiredString(attendee.email, "attendees.email")
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
      normalizeRequiredString(attendee.phone, "attendees.phone")
    }

    const availableTicketTypes = await ctx.db
      .query("signupTicketTypes")
      .withIndex("by_signupEventId", (q) =>
        q.eq("signupEventId", signupEventId)
      )
      .take(200)
    const ticketById = new Map(
      availableTicketTypes.map((ticket) => [String(ticket._id), ticket])
    )

    const requestedTicketCount = args.ticketSelections.reduce(
      (sum, selection) => sum + selection.quantity,
      0
    )

    if (signupEvent.accommodationEnabled) {
      const assignableSlots = await ctx.db
        .query("signupAccommodationSlots")
        .withIndex("by_signupEventId_and_isAssignable", (q) =>
          q.eq("signupEventId", signupEventId).eq("isAssignable", true)
        )
        .take(500)

      const capacityLimit = assignableSlots.length
      if (capacityLimit > 0) {
        const eventSubmissionIds = (
          await ctx.db
            .query("signupSubmissions")
            .withIndex("by_signupEventId", (q) =>
              q.eq("signupEventId", signupEventId)
            )
            .take(500)
        ).map((submission) => submission._id)

        let existingReservedTickets = 0
        for (const submissionId of eventSubmissionIds) {
          const selections = await ctx.db
            .query("signupSubmissionTicketSelections")
            .withIndex("by_submissionId", (q) =>
              q.eq("submissionId", String(submissionId))
            )
            .take(500)
          existingReservedTickets += selections.reduce(
            (sum, selection) => sum + selection.quantity,
            0
          )
        }

        if (existingReservedTickets + requestedTicketCount > capacityLimit) {
          throwSignupError(
            "CAPACITY_EXCEEDED",
            "Ticket capacity exceeded for this event"
          )
        }
      }
    }

    for (const selection of args.ticketSelections) {
      const ticketTypeId = normalizeRequiredString(
        selection.ticketTypeId,
        "ticketSelections.ticketTypeId"
      )
      const quantity = selection.quantity

      const ticket = ticketById.get(ticketTypeId)
      if (!ticket) {
        throwSignupError(
          "TICKET_UNAVAILABLE",
          "Selected ticket type does not belong to this signup event"
        )
      }

      if (
        ticket.availabilityState !== "selectable" ||
        !ticket.isActive ||
        ticket.visibility !== "visible"
      ) {
        throwSignupError(
          "TICKET_UNAVAILABLE",
          "Selected ticket type is no longer selectable"
        )
      }

      if (!Number.isInteger(quantity) || quantity <= 0) {
        throwSignupError(
          "SUBMISSION_CONFLICT",
          "Invalid 'ticketSelections.quantity'. Expected a positive integer."
        )
      }

      if (selection.attendeeKey && !attendeeKeys.has(selection.attendeeKey)) {
        throwSignupError(
          "SUBMISSION_CONFLICT",
          `Ticket selection references unknown attendee '${selection.attendeeKey}'.`
        )
      }
    }

    const availableSlots = await ctx.db
      .query("signupAccommodationSlots")
      .withIndex("by_signupEventId", (q) =>
        q.eq("signupEventId", signupEventId)
      )
      .take(500)
    const slotById = new Map(
      availableSlots.map((slot) => [String(slot._id), slot])
    )

    for (const assignment of args.assignments) {
      const attendeeKey = normalizeRequiredString(
        assignment.attendeeKey,
        "assignments.attendeeKey"
      )
      const slotId = normalizeRequiredString(
        assignment.slotId,
        "assignments.slotId"
      )

      if (!attendeeKeys.has(attendeeKey)) {
        throwSignupError(
          "SUBMISSION_CONFLICT",
          `Assignment references unknown attendee key '${attendeeKey}'.`
        )
      }

      const slot = slotById.get(slotId)
      if (!slot) {
        throwSignupError(
          "ASSIGNMENT_UNAVAILABLE",
          `Assignment references unknown slot '${slotId}'.`
        )
      }

      if (!slot.isAssignable) {
        throwSignupError(
          "ASSIGNMENT_UNAVAILABLE",
          "Selected room slot is no longer assignable"
        )
      }

      const existingAssignment = await ctx.db
        .query("signupSubmissionAssignments")
        .withIndex("by_slotId", (q) => q.eq("slotId", slotId))
        .first()

      if (existingAssignment) {
        throwSignupError(
          "CAPACITY_EXCEEDED",
          "Selected room slot has already been claimed"
        )
      }
    }

    const bookingRef = buildBookingRef({
      submittedAt: now,
      signupEventId,
      idempotencyKey,
    })

    const submissionId = await ctx.db.insert("signupSubmissions", {
      signupEventId,
      source: args.source,
      idempotencyKey,
      payloadFingerprint,
      bookingRef,
      honeypotSeen: args.honeypotSeen,
      notes,
      bookerName,
      bookerEmail,
      bookerPhone,
      submittedAt: now,
    })

    for (const [index, attendee] of args.attendees.entries()) {
      await ctx.db.insert("signupSubmissionAttendees", {
        submissionId,
        attendeeKey: attendee.attendeeKey,
        fullName: attendee.fullName,
        email: attendee.email,
        gender: attendee.gender,
        location: attendee.location,
        dietaryRestrictions: attendee.dietaryRestrictions,
        roommatePreference: attendee.roommatePreference,
        roommateAvoid: attendee.roommateAvoid,
        phone: attendee.phone,
        sortOrder: index,
      })
    }

    for (const [index, selection] of args.ticketSelections.entries()) {
      await ctx.db.insert("signupSubmissionTicketSelections", {
        submissionId,
        attendeeKey: selection.attendeeKey,
        ticketTypeId: selection.ticketTypeId,
        quantity: selection.quantity,
        sortOrder: index,
      })
    }

    for (const [index, assignment] of args.assignments.entries()) {
      await ctx.db.insert("signupSubmissionAssignments", {
        submissionId,
        attendeeKey: assignment.attendeeKey,
        slotId: assignment.slotId,
        sortOrder: index,
      })
    }

    if (idempotencyRecord) {
      await ctx.db.patch(idempotencyRecord._id, {
        payloadFingerprint,
        submissionId,
        expiresAt: now + IDEMPOTENCY_WINDOW_MS,
      })
    } else {
      await ctx.db.insert("signupSubmissionIdempotency", {
        signupEventId,
        idempotencyKey,
        payloadFingerprint,
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
