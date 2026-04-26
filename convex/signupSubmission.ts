import { v } from "convex/values"
import { mutation, query, type MutationCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { api, internal } from "./_generated/api"
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
  phone: v.optional(v.string()),
  gender: signupGenderValidator,
  location: v.optional(v.string()),
  dietaryRestrictions: v.optional(v.string()),
  roommatePreference: v.optional(v.string()),
  roommateAvoid: v.optional(v.string()),
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
  source: v.optional(signupSourceValidator),
  notes: v.optional(v.string()),
  booker: v.object({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
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

function buildSignupConfirmationRoomAssignments(
  assignments: Array<{
    attendeeKey: string
    slotId: Id<"accommodationSlots">
    assignmentIntent: "assign" | "skip"
  }>
) {
  const uniqueSlotIds = new Set<string>()
  const roomAssignments: Array<{
    roomType: string
    hotelName: string
    bedCount: number
  }> = []

  for (const assignment of assignments) {
    if (assignment.assignmentIntent !== "assign") {
      continue
    }

    const slotId = String(assignment.slotId)
    if (uniqueSlotIds.has(slotId)) {
      continue
    }

    uniqueSlotIds.add(slotId)
    roomAssignments.push({
      roomType: "Room",
      hotelName: "Assigned",
      bedCount: 1,
    })
  }

  return roomAssignments
}

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
  submissionId: Id<"orders">
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
    phone?: string
    gender: "male" | "female" | "mixed" | "unknown"
    location?: string
    dietaryRestrictions?: string
    roommatePreference?: string
    roommateAvoid?: string
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
    .query("orderAttendees")
    .withIndex("by_orderId", (q) => q.eq("orderId", submissionId))
    .take(500)
  const attendeeById = new Map(
    attendees.map((attendee) => [String(attendee._id), attendee])
  )

  const selections = await ctx.db
    .query("orderTicketSelections")
    .withIndex("by_orderId", (q) => q.eq("orderId", submissionId))
    .take(500)

  const assignments = await ctx.db
    .query("orderAssignments")
    .withIndex("by_orderId", (q) => q.eq("orderId", submissionId))
    .take(500)

  return {
    eventId: String(submission.eventId),
    source: submission.source ?? "internal",
    notes: submission.notes,
    booker: {
      name: submission.bookerName ?? "",
      email: submission.bookerEmail ?? "",
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
    submissionId: v.id("orders"),
    bookingRef: v.optional(v.string()),
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
      .query("orderIdempotency")
      .withIndex("by_eventId_and_fingerprint", (q) =>
        q.eq("eventId", args.eventId).eq("fingerprint", payloadFingerprint)
      )
      .first()

    if (replayByFingerprint && replayByFingerprint.expiresAt >= now) {
      const replaySubmission = await ctx.db.get(replayByFingerprint.orderId)
      if (replaySubmission) {
        const restorePayload = await buildRestorePayload(
          ctx,
          replayByFingerprint.orderId
        )
        if (restorePayload) {
          return {
            submissionId: replaySubmission._id,
            bookingRef: replaySubmission.bookingRef,
            submittedAt: new Date(
              replaySubmission.submittedAt ?? Date.now()
            ).toISOString(),
            restorePayload,
          }
        }
      }
    }

    const idempotencyRecords = await ctx.db
      .query("orderIdempotency")
      .withIndex("by_eventId_and_idempotencyKey", (q) =>
        q.eq("eventId", args.eventId).eq("idempotencyKey", idempotencyKey)
      )
      .take(20)

    const replayByKey = idempotencyRecords.find(
      (record) =>
        record.expiresAt >= now && record.fingerprint === payloadFingerprint
    )

    if (replayByKey) {
      const replaySubmission = await ctx.db.get(replayByKey.orderId)
      if (replaySubmission) {
        const restorePayload = await buildRestorePayload(
          ctx,
          replayByKey.orderId
        )
        if (restorePayload) {
          return {
            submissionId: replaySubmission._id,
            bookingRef: replaySubmission.bookingRef,
            submittedAt: new Date(
              replaySubmission.submittedAt ?? Date.now()
            ).toISOString(),
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
    }

    const eventTicketTypes = await ctx.db
      .query("ticketTypes")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500)
    const ticketTypeById = new Map(
      eventTicketTypes.map((ticketType) => [ticketType._id, ticketType])
    )
    const soldCountIncrements = new Map<Id<"ticketTypes">, number>()
    const attendeeKeyToTicketTypeId = new Map<string, Id<"ticketTypes">>()

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
          .query("orders")
          .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
          .take(500)

        let existingTicketCount = 0
        for (const submission of eventSubmissions) {
          const existingSelections = await ctx.db
            .query("orderTicketSelections")
            .withIndex("by_orderId", (q) => q.eq("orderId", submission._id))
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
        .query("orderAssignments")
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

    const submissionId = await ctx.db.insert("orders", {
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

    const attendeeIdsByKey = new Map<string, Id<"orderAttendees">>()

    for (const [sortOrder, attendee] of args.attendees.entries()) {
      const attendeeId = await ctx.db.insert("orderAttendees", {
        orderId: submissionId,
        attendeeKey: attendee.attendeeKey,
        name: attendee.name,
        email: normalizeOptionalString(attendee.email),
        phone: attendee.phone,
        gender: attendee.gender ?? "unknown",
        location: normalizeOptionalString(attendee.location),
        dietaryRestrictions: normalizeOptionalString(
          attendee.dietaryRestrictions
        ),
        roommatePreference: normalizeOptionalString(
          attendee.roommatePreference
        ),
        roommateAvoid: normalizeOptionalString(attendee.roommateAvoid),
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

      await ctx.db.insert("orderTicketSelections", {
        orderId: submissionId,
        attendeeId,
        ticketTypeId: selection.ticketTypeId,
        quantity: 1,
        sortOrder,
      })

      soldCountIncrements.set(
        selection.ticketTypeId,
        (soldCountIncrements.get(selection.ticketTypeId) ?? 0) + 1
      )
      attendeeKeyToTicketTypeId.set(
        selection.attendeeKey,
        selection.ticketTypeId
      )
    }

    for (const [attendeeKey, attendeeId] of attendeeIdsByKey.entries()) {
      const ticketTypeId = attendeeKeyToTicketTypeId.get(attendeeKey)
      if (!ticketTypeId) continue

      const ticketType = ticketTypeById.get(ticketTypeId)
      const effectiveRoomTypeId =
        ticketType?.roomTypeId ?? (event as any).defaultRoomTypeId
      if (effectiveRoomTypeId) {
        await ctx.db.patch(attendeeId, {
          allocatedRoomTypeId: effectiveRoomTypeId,
        })
      }
    }

    for (const [ticketTypeId, increment] of soldCountIncrements) {
      const ticketType = ticketTypeById.get(ticketTypeId)
      if (!ticketType) {
        continue
      }

      await ctx.db.patch(ticketTypeId, {
        soldCount: (ticketType.soldCount ?? 0) + increment,
        updatedAt: now,
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

      await ctx.db.insert("orderAssignments", {
        orderId: submissionId,
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
        orderId: submissionId,
        expiresAt: now + IDEMPOTENCY_WINDOW_MS,
      })
    } else {
      await ctx.db.insert("orderIdempotency", {
        eventId: args.eventId,
        idempotencyKey,
        fingerprint: payloadFingerprint,
        orderId: submissionId,
        expiresAt: now + IDEMPOTENCY_WINDOW_MS,
      })
    }

    try {
      const event = await ctx
        .runQuery(api.events.getEventById, {
          eventId: String(args.eventId),
        })
        .catch(() => null)

      const tikkieLink = await ctx
        .runQuery(api.tikkie.getEventPaymentLinkForSuccess, {
          eventId: args.eventId,
        })
        .catch(() => null)

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      const roomAssignments = buildSignupConfirmationRoomAssignments(
        args.assignments
      )

      await ctx.scheduler.runAfter(
        0,
        internal.emailActions.sendSignupConfirmation,
        {
          to: bookerEmail,
          bookerName,
          bookingRef,
          eventName: event?.title ?? "Conference",
          eventDate: event?.startsAt
            ? new Date(event.startsAt).toLocaleDateString("en-GB")
            : new Date().toLocaleDateString("en-GB"),
          eventLocation: "",
          tikkieUrl: tikkieLink?.paymentUrl,
          tikkieAmountMinor: tikkieLink?.amountMinor,
          tikkieCurrency: event?.currency,
          attendeeCount: args.attendees.length,
          roomAssignments,
          trackPaymentUrl: `${appUrl}/track-payment`,
          successPageUrl: `${appUrl}/signup/success/${bookingRef}`,
        }
      )
    } catch (error) {
      console.error("Failed to queue signup confirmation email:", error)
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

export const getByBookingRef = query({
  args: {
    bookingRef: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      submissionId: v.id("orders"),
      bookingRef: v.optional(v.string()),
      bookerName: v.optional(v.string()),
      bookerEmail: v.optional(v.string()),
      bookerPhone: v.optional(v.string()),
      eventId: v.optional(v.id("events")),
      eventSlug: v.optional(v.string()),
      submittedAt: v.optional(v.number()),
      attendees: v.array(
        v.object({
          name: v.string(),
          email: v.optional(v.string()),
          ticketType: v.string(),
          assignedRoom: v.optional(v.string()),
        })
      ),
      roomAssignments: v.array(
        v.object({
          roomType: v.string(),
          hotelName: v.string(),
          bedCount: v.number(),
        })
      ),
      totalAmountMinor: v.optional(v.number()),
      ticketSelections: v.array(
        v.object({
          id: v.string(),
          ticketTypeId: v.string(),
          ticketTypeName: v.string(),
          quantity: v.number(),
          pricePerTicketMinor: v.number(),
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    const submission = await ctx.db
      .query("orders")
      .withIndex("by_bookingRef", (q) => q.eq("bookingRef", args.bookingRef))
      .first()

    if (!submission || !submission.eventId) {
      return null
    }

    // Fetch event details to get slug
    const event = await ctx.db.get(submission.eventId)
    const eventSlug =
      (event as { slug?: string } | null)?.slug ?? String(submission.eventId)

    // Fetch attendees
    const attendeeRows = await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) => q.eq("orderId", submission._id))
      .collect()

    // Fetch ticket selections with ticket type details
    const ticketSelectionRows = await ctx.db
      .query("orderTicketSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", submission._id))
      .collect()

    // Get ticket type details
    const ticketTypesData = await ctx.db
      .query("ticketTypes")
      .withIndex("by_eventId", (q) => q.eq("eventId", submission.eventId!))
      .take(100)
    const ticketTypeById = new Map(
      ticketTypesData.map((tt) => [String(tt._id), tt])
    )

    // Build ticket selections with names and prices
    const ticketSelections = ticketSelectionRows.map((ts) => {
      const ticketType = ticketTypeById.get(String(ts.ticketTypeId))
      return {
        id: String(ts._id),
        ticketTypeId: String(ts.ticketTypeId),
        ticketTypeName: ticketType?.label ?? "Unknown Ticket",
        quantity: ts.quantity,
        pricePerTicketMinor: ticketType?.priceMinor ?? 0,
      }
    })

    // Calculate total amount
    const totalAmountMinor = ticketSelections.reduce(
      (sum, ts) => sum + ts.pricePerTicketMinor * ts.quantity,
      0
    )

    // Build attendee list with ticket info
    const attendees = attendeeRows.map((attendee) => {
      // Find ticket type for this attendee
      const attendeeTicket = ticketSelectionRows.find(
        (ts) => String(ts.attendeeId) === String(attendee._id)
      )
      const ticketType = attendeeTicket
        ? ticketTypeById.get(String(attendeeTicket.ticketTypeId))
        : null

      return {
        name: attendee.name,
        email: attendee.email,
        ticketType: ticketType?.label ?? "Unknown Ticket",
        assignedRoom: undefined as string | undefined,
      }
    })

    // Fetch assignments to build room assignments
    const assignmentRows = await ctx.db
      .query("orderAssignments")
      .withIndex("by_orderId", (q) => q.eq("orderId", submission._id))
      .collect()

    // Get slot details for assigned rooms
    const assignedSlots = await ctx.db
      .query("accommodationSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", submission.eventId!))
      .take(500)
    const slotById = new Map(assignedSlots.map((s) => [String(s._id), s]))

    // Get rooms
    const roomsData = await ctx.db.query("accommodationRooms").take(500)
    const roomById = new Map(roomsData.map((r) => [String(r._id), r]))

    // Get hotels
    const hotelsData = await ctx.db.query("accommodationHotels").take(100)
    const hotelById = new Map(hotelsData.map((h) => [String(h._id), h]))

    // Get room types
    const roomTypesData = await ctx.db.query("accommodationRoomTypes").take(100)
    const roomTypeById = new Map(
      roomTypesData.map((rt) => [String(rt._id), rt])
    )

    // Build room assignments
    const roomAssignmentsMap = new Map<
      string,
      { roomType: string; hotelName: string; bedCount: number }
    >()

    for (const assignment of assignmentRows) {
      if (assignment.assignmentIntent !== "assign") continue

      const slot = slotById.get(String(assignment.slotId))
      if (!slot) continue

      const room = roomById.get(String(slot.roomId))
      if (!room) continue

      const hotel = hotelById.get(String(room.hotelId))
      const roomType = roomTypeById.get(String(room.roomTypeId))

      const key = String(slot.roomId)
      if (!roomAssignmentsMap.has(key)) {
        roomAssignmentsMap.set(key, {
          roomType: roomType?.label ?? room.label,
          hotelName: hotel?.name ?? "Unknown Hotel",
          bedCount: 1,
        })
      } else {
        const existing = roomAssignmentsMap.get(key)!
        existing.bedCount += 1
      }
    }

    const roomAssignments = Array.from(roomAssignmentsMap.values())

    // Update attendees with room info
    const attendeeIdsWithRooms = new Map<string, string>()
    for (const assignment of assignmentRows) {
      if (assignment.assignmentIntent === "assign") {
        const slot = slotById.get(String(assignment.slotId))
        if (slot) {
          const room = roomById.get(String(slot.roomId))
          if (room) {
            const roomType = roomTypeById.get(String(room.roomTypeId))
            attendeeIdsWithRooms.set(
              String(assignment.attendeeId),
              roomType?.label ?? room.label
            )
          }
        }
      }
    }

    const attendeesWithRooms = attendees.map((attendee, index) => ({
      ...attendee,
      assignedRoom: attendeeIdsWithRooms.get(String(attendeeRows[index]?._id)),
    }))

    return {
      submissionId: submission._id,
      bookingRef: submission.bookingRef,
      bookerName: submission.bookerName,
      bookerEmail: submission.bookerEmail,
      bookerPhone: submission.bookerPhone,
      eventId: submission.eventId,
      eventSlug,
      submittedAt: submission.submittedAt,
      attendees: attendeesWithRooms,
      roomAssignments,
      totalAmountMinor,
      ticketSelections,
    }
  },
})
