import { v } from "convex/values"
import { mutation, type MutationCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import {
  signupGenderValidator,
  signupSourceValidator,
  type SignupSubmissionErrorCode,
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

const restorePayloadValidator = v.object({
  eventId: v.string(),
  source: signupSourceValidator,
  notes: v.optional(v.string()),
  booker: v.object({
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
  }),
  attendees: v.array(attendeeValidator),
  ticketSelections: v.array(
    v.object({
      attendeeKey: v.string(),
      ticketTypeId: v.string(),
      quantity: v.literal(1),
    })
  ),
  assignments: v.array(
    v.object({
      attendeeKey: v.string(),
      slotId: v.string(),
      assignmentIntent: v.union(v.literal("assign"), v.literal("skip")),
    })
  ),
})

function throwSubmissionError(
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

async function buildRestorePayload(
  ctx: MutationCtx,
  submissionId: Id<"submissions">
): Promise<{
  eventId: string
  source: "integration" | "internal"
  notes?: string
  booker: {
    name: string
    email: string
    phone?: string
  }
  attendees: Array<{
    attendeeKey: string
    name: string
    email?: string
    phone: string
    gender: "male" | "female" | "mixed" | "unknown"
    location: string
    dietaryRestrictions: string
    roommatePreference: string
    roommateAvoid: string
  }>
  ticketSelections: Array<{
    attendeeKey: string
    ticketTypeId: string
    quantity: 1
  }>
  assignments: Array<{
    attendeeKey: string
    slotId: string
    assignmentIntent: "assign" | "skip"
  }>
} | null> {
  const submission = await ctx.db.get(submissionId)
  if (!submission) {
    return null
  }

  const attendees = await ctx.db
    .query("submissionAttendees")
    .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
    .take(500)
  const attendeeById = new Map(
    attendees.map((attendee) => [String(attendee._id), attendee])
  )

  const selections = await ctx.db
    .query("submissionTicketSelections")
    .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
    .take(500)

  const assignments = await ctx.db
    .query("submissionAssignments")
    .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
    .take(500)

  return {
    eventId: String(submission.eventId),
    source: submission.source,
    notes: submission.notes,
    booker: {
      name: submission.bookerName,
      email: submission.bookerEmail,
      phone: submission.bookerPhone,
    },
    attendees: attendees.map((attendee) => ({
      attendeeKey: attendee.attendeeKey,
      name: attendee.name,
      email: attendee.email,
      phone: attendee.phone,
      gender: attendee.gender,
      location: attendee.location,
      dietaryRestrictions: attendee.dietaryRestrictions,
      roommatePreference: attendee.roommatePreference,
      roommateAvoid: attendee.roommateAvoid,
    })),
    ticketSelections: selections
      .map((selection) => {
        const attendee = attendeeById.get(String(selection.attendeeId))
        if (!attendee) {
          return null
        }

        return {
          attendeeKey: attendee.attendeeKey,
          ticketTypeId: String(selection.ticketTypeId),
          quantity: 1 as const,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null),
    assignments: assignments
      .map((assignment) => {
        const attendee = attendeeById.get(String(assignment.attendeeId))
        if (!attendee) {
          return null
        }

        return {
          attendeeKey: attendee.attendeeKey,
          slotId: String(assignment.slotId),
          assignmentIntent: assignment.assignmentIntent,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null),
  }
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
    restorePayload: restorePayloadValidator,
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

    const replayByFingerprint = await ctx.db
      .query("submissionIdempotency")
      .withIndex("by_eventId_and_fingerprint", (q) =>
        q.eq("eventId", args.eventId).eq("fingerprint", payloadFingerprint)
      )
      .first()

    if (replayByFingerprint && replayByFingerprint.expiresAt >= now) {
      const replaySubmission = await ctx.db.get(
        replayByFingerprint.submissionId
      )
      if (replaySubmission) {
        const restorePayload = await buildRestorePayload(
          ctx,
          replayByFingerprint.submissionId
        )
        if (restorePayload) {
          return {
            submissionId: replaySubmission._id,
            bookingRef: replaySubmission.bookingRef,
            submittedAt: new Date(replaySubmission.submittedAt).toISOString(),
            restorePayload,
          }
        }
      }
    }

    const idempotencyRecords = await ctx.db
      .query("submissionIdempotency")
      .withIndex("by_eventId_and_idempotencyKey", (q) =>
        q.eq("eventId", args.eventId).eq("idempotencyKey", idempotencyKey)
      )
      .take(20)

    const replayByKey = idempotencyRecords.find(
      (record) =>
        record.expiresAt >= now && record.fingerprint === payloadFingerprint
    )

    if (replayByKey) {
      const replaySubmission = await ctx.db.get(replayByKey.submissionId)
      if (replaySubmission) {
        const restorePayload = await buildRestorePayload(
          ctx,
          replayByKey.submissionId
        )
        if (restorePayload) {
          return {
            submissionId: replaySubmission._id,
            bookingRef: replaySubmission.bookingRef,
            submittedAt: new Date(replaySubmission.submittedAt).toISOString(),
            restorePayload,
          }
        }
      }
    }

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

      if (
        ticketType.availabilityState !== "selectable" ||
        !ticketType.isActive ||
        ticketType.visibility !== "public"
      ) {
        throwSubmissionError(
          "TICKET_UNAVAILABLE",
          "Selected ticket type is no longer selectable"
        )
      }
    }

    const eventSlots = await ctx.db
      .query("accommodationSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(1000)
    const slotById = new Map(eventSlots.map((slot) => [slot._id, slot]))

    const requestedAssignedSlotIds = new Set<string>()

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

      if (assignment.assignmentIntent === "assign") {
        if (!slot.isAssignable) {
          throwSubmissionError(
            "ASSIGNMENT_UNAVAILABLE",
            "Selected accommodation slot is no longer assignable"
          )
        }

        const slotKey = String(assignment.slotId)
        if (requestedAssignedSlotIds.has(slotKey)) {
          throwSubmissionError(
            "SUBMISSION_CONFLICT",
            "Submission contains duplicate assignment for the same slot"
          )
        }
        requestedAssignedSlotIds.add(slotKey)
      }
    }

    if (event.accommodationEnabled) {
      const assignableSlotCount = eventSlots.filter(
        (slot) => slot.isAssignable
      ).length
      const requestedTicketCount = args.ticketSelections.length

      if (assignableSlotCount > 0) {
        const eventSubmissions = await ctx.db
          .query("submissions")
          .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
          .take(500)

        let existingTicketCount = 0
        for (const submission of eventSubmissions) {
          const existingSelections = await ctx.db
            .query("submissionTicketSelections")
            .withIndex("by_submissionId", (q) =>
              q.eq("submissionId", submission._id)
            )
            .take(500)
          existingTicketCount += existingSelections.length
        }

        if (existingTicketCount + requestedTicketCount > assignableSlotCount) {
          throwSubmissionError(
            "CAPACITY_EXCEEDED",
            "Ticket capacity exceeded for this event"
          )
        }
      }
    }

    for (const assignment of args.assignments) {
      if (assignment.assignmentIntent !== "assign") {
        continue
      }

      const existingAssignments = await ctx.db
        .query("submissionAssignments")
        .withIndex("by_slotId", (q) => q.eq("slotId", assignment.slotId))
        .take(20)

      const alreadyAssigned = existingAssignments.some(
        (existingAssignment) => existingAssignment.assignmentIntent === "assign"
      )

      if (alreadyAssigned) {
        throwSubmissionError(
          "CAPACITY_EXCEEDED",
          "Selected room slot has already been claimed"
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

    const expiredRecordByKey = idempotencyRecords.find(
      (record) => record.expiresAt < now
    )

    if (expiredRecordByKey) {
      await ctx.db.patch(expiredRecordByKey._id, {
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
      restorePayload: {
        eventId: String(args.eventId),
        source: args.source,
        notes,
        booker: {
          name: bookerName,
          email: bookerEmail,
          phone: bookerPhone,
        },
        attendees: args.attendees.map((attendee) => ({
          attendeeKey: attendee.attendeeKey,
          name: attendee.name,
          email: attendee.email,
          phone: attendee.phone,
          gender: attendee.gender,
          location: attendee.location,
          dietaryRestrictions: attendee.dietaryRestrictions,
          roommatePreference: attendee.roommatePreference,
          roommateAvoid: attendee.roommateAvoid,
        })),
        ticketSelections: args.ticketSelections.map((selection) => ({
          attendeeKey: selection.attendeeKey,
          ticketTypeId: String(selection.ticketTypeId),
          quantity: 1 as const,
        })),
        assignments: args.assignments.map((assignment) => ({
          attendeeKey: assignment.attendeeKey,
          slotId: String(assignment.slotId),
          assignmentIntent: assignment.assignmentIntent,
        })),
      },
    }
  },
})
