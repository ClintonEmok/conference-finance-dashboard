import { v } from "convex/values"
import { mutation, query, type MutationCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { api, internal } from "./_generated/api"
import { loadOrderAmountDueBreakdowns } from "./finance"
import {
  isTicketCapacityExceeded,
  loadPublicSignupAccommodationContext,
  resolvePublicSignupSelection,
  resolveTicketCategoryById,
} from "./signupCatalog"
import {
  signupGenderValidator,
  signupSourceValidator,
  signupAccommodationSelectionValidator,
  signupAccommodationOccupancyValidator,
  type SignupSubmissionErrorCode,
} from "../lib/types/signup"
import {
  digestSubmissionEnvelope,
  verifySignupSubmissionToken,
} from "../lib/domain/signup/submission-token"
import { buildTrackPaymentPermalink } from "../lib/domain/track-payment/edit-token"

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
  accommodationSelections: v.array(
    v.object({
      attendeeKey: v.string(),
      categoryId: v.string(),
      occupancy: signupAccommodationOccupancyValidator,
      optionSelections: v.array(
        v.object({
          optionKey: v.string(),
          quantity: v.number(),
          nights: v.number(),
        })
      ),
      nights: v.optional(v.number()),
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
  accommodationSelections: Array<{
    attendeeKey: string
    categoryId: string
    occupancy: "single" | "shared" | "family"
    optionSelections: Array<{
      optionKey: string
      quantity: number
      nights: number
    }>
    /** Resolved selected total stay nights persisted on the order row. */
    nights?: number
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

  const accommodationSelectionRows = await ctx.db
    .query("orderAccommodationSelections")
    .withIndex("by_orderId", (q) => q.eq("orderId", submissionId))
    .take(500)

  const optionSelectionRows = await ctx.db
    .query("orderAccommodationOptionSelections")
    .withIndex("by_orderId", (q) => q.eq("orderId", submissionId))
    .take(500)
  const optionSelectionsBySelectionId = new Map<string, typeof optionSelectionRows>()
  for (const row of optionSelectionRows) {
    const selectionId = String(row.selectionId)
    const existing = optionSelectionsBySelectionId.get(selectionId) ?? []
    existing.push(row)
    optionSelectionsBySelectionId.set(selectionId, existing)
  }

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
    accommodationSelections: accommodationSelectionRows
      .map((row) => {
        const attendee = attendeeById.get(String(row.attendeeId))
        if (!attendee || !row.categoryId || !row.occupancy) {
          return null
        }

        return {
          attendeeKey: attendee.attendeeKey,
          categoryId: String(row.categoryId),
          occupancy: row.occupancy,
          nights: row.nightCount,
          optionSelections: (optionSelectionsBySelectionId.get(String(row._id)) ?? [])
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map((optionRow) => ({
              optionKey: optionRow.optionKey,
              quantity: optionRow.quantity,
              nights: optionRow.nights,
            })),
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
    // CR-07: server-issued post-CAPTCHA token. Required and verified below —
    // this public mutation must never be directly callable with only a
    // client-supplied envelope.
    submissionToken: v.string(),
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
    accommodationSelections: v.array(signupAccommodationSelectionValidator),
  },
  returns: v.object({
    submissionId: v.id("orders"),
    bookingRef: v.optional(v.string()),
    submittedAt: v.string(),
    restorePayload: restorePayloadValidator,
  }),
  handler: async (ctx, args) => {
    // CR-07: this function is a public Internet mutation. The Next.js route
    // (app/api/signup/submit/route.ts) is the only CAPTCHA + rate-limit
    // gate, but an attacker can call the generated Convex endpoint directly,
    // so the mutation itself must refuse to persist anything without a
    // server-issued token minted only after the route's checks pass.
    //
    // CR-09: the token is verified against a SHA-256 digest recomputed here
    // from the actual mutation arguments (never from a caller-supplied
    // fingerprint) plus the normalized idempotency key. Changing any booker,
    // attendee, ticket, accommodation, or assignment field — or replaying a
    // captured token under a new idempotency key — changes the recomputed
    // digest or signed key and fails closed before any database read or
    // write.
    const idempotencyKey = normalizeRequiredString(
      args.idempotencyKey,
      "idempotencyKey"
    )

    const payloadDigest = await digestSubmissionEnvelope({
      eventId: String(args.eventId),
      source: args.source,
      notes: args.notes,
      booker: args.booker,
      attendees: args.attendees,
      ticketSelections: args.ticketSelections.map((selection) => ({
        attendeeKey: selection.attendeeKey,
        ticketTypeId: String(selection.ticketTypeId),
        quantity: selection.quantity,
      })),
      assignments: args.assignments,
      accommodationSelections: args.accommodationSelections.map(
        (preference) => ({
          attendeeKey: preference.attendeeKey,
          categoryId: String(preference.categoryId),
          occupancy: preference.occupancy,
          optionSelections: preference.optionSelections,
          nights: preference.nights,
        })
      ),
    })

    const tokenValid = await verifySignupSubmissionToken(
      args.submissionToken,
      {
        eventId: String(args.eventId),
        payloadDigest,
        idempotencyKey,
      }
    )
    if (!tokenValid) {
      throwSubmissionError(
        "CAPTCHA_REQUIRED",
        "A valid server-issued verification token is required before submitting a signup."
      )
    }

    const now = Date.now()

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
        q.eq("eventId", args.eventId).eq("fingerprint", payloadDigest)
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
        record.expiresAt >= now && record.fingerprint === payloadDigest
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
    const seenTicketSelectionKeys = new Set<string>()

    for (const selection of args.ticketSelections) {
      if (!attendeeKeySet.has(selection.attendeeKey)) {
        throwSubmissionError(
          "SUBMISSION_CONFLICT",
          `Ticket selection references unknown attendee '${selection.attendeeKey}'.`
        )
      }

      // Cardinality (CR-04): each attendee has exactly one ticket row.
      // Duplicate rows previously overwrote the map while every row was still
      // inserted and counted toward soldCount.
      if (seenTicketSelectionKeys.has(selection.attendeeKey)) {
        throwSubmissionError(
          "SUBMISSION_CONFLICT",
          `Duplicate ticket selection for attendee '${selection.attendeeKey}'.`
        )
      }
      seenTicketSelectionKeys.add(selection.attendeeKey)

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

      // CR-08/CR-10: enforce the configured capacity before any write using
      // the exact same aggregate rule as the public quote. The increment for
      // this ticket is accumulated across the whole selection list (each row
      // is quantity = 1), so repeated ticketTypeId values count their full
      // quantity against maxQuantity and a single envelope can never oversell
      // a `maxQuantity` ticket even if its state was not separately flipped
      // to unavailable. The check runs inside the mutation's transaction
      // before any insert, so concurrent submissions are also serialized
      // against it — `soldCount` can never exceed `maxQuantity`.
      const incrementForTicket =
        soldCountIncrements.get(selection.ticketTypeId) ?? 0
      const requestedCountForTicket = incrementForTicket + 1
      if (
        isTicketCapacityExceeded({
          ticket: ticketType,
          requestedCount: requestedCountForTicket,
        })
      ) {
        throwSubmissionError(
          "TICKET_UNAVAILABLE",
          "Selected ticket type has reached its maximum quantity"
        )
      }
      soldCountIncrements.set(
        selection.ticketTypeId,
        requestedCountForTicket
      )

      attendeeKeyToTicketTypeId.set(
        selection.attendeeKey,
        selection.ticketTypeId
      )
    }

    // Every attendee must be ticketed exactly once (CR-04); otherwise a
    // ticketless attendee row could be persisted without any ticket charge.
    if (attendeeKeyToTicketTypeId.size !== attendeeKeySet.size) {
      throwSubmissionError(
        "SUBMISSION_CONFLICT",
        "Every attendee must have exactly one ticket selection."
      )
    }

    // Options-only contract (D-03): a new public submission never creates a
    // room-slot placement. Any non-empty assignment list is rejected before a
    // slot claim or assignment write can occur; historical assignment rows
    // remain readable through restore payloads.
    if (args.assignments.length > 0) {
      throwSubmissionError(
        "SUBMISSION_CONFLICT",
        "Room-slot assignments are no longer accepted for public signup; accommodation is captured as options-only preferences."
      )
    }

    // Validate every accommodation preference against the event and its
    // attendee ticket using the exact same rule set as the public quote, so
    // a stale or client-forged preference can never reach persistence.
    const accommodationContext =
      await loadPublicSignupAccommodationContext(ctx, args.eventId)

    const selectionTicketById = new Map<string, Doc<"ticketTypes">>()
    for (const ticketType of eventTicketTypes) {
      selectionTicketById.set(String(ticketType._id), ticketType)
    }
    const selectionTicketCategoryById = await resolveTicketCategoryById(
      ctx,
      selectionTicketById
    )

    const resolvedAccommodationSelections = new Map<string, {
      categoryId: Id<"accommodationCategories">
      occupancy: "single" | "shared" | "family"
      nightCount: number | null
      optionSelections: Array<{
        optionKey: string
        quantity: number
        nights: number
      }>
    }>()
    for (const preference of args.accommodationSelections) {
      if (!attendeeKeySet.has(preference.attendeeKey)) {
        throwSubmissionError(
          "SUBMISSION_CONFLICT",
          `Accommodation preference references unknown attendee '${preference.attendeeKey}'.`
        )
      }
      if (resolvedAccommodationSelections.has(preference.attendeeKey)) {
        throwSubmissionError(
          "SUBMISSION_CONFLICT",
          `Duplicate accommodation preference for attendee '${preference.attendeeKey}'.`
        )
      }

      const ticketTypeId = attendeeKeyToTicketTypeId.get(
        preference.attendeeKey
      )
      if (!ticketTypeId) {
        throwSubmissionError(
          "SUBMISSION_CONFLICT",
          `Accommodation preference attendee '${preference.attendeeKey}' has no ticket selection.`
        )
      }

      // A present but unresolvable ticketTypes.roomTypeId fails closed
      // (CR-02): the ticket must never be treated as unconstrained.
      const ticketEntitlement = selectionTicketCategoryById.get(
        String(ticketTypeId)
      )
      if (ticketEntitlement === null) {
        throwSubmissionError(
          "SUBMISSION_CONFLICT",
          "The selected ticket's room type is no longer available."
        )
      }
      const ticketCategoryId = ticketEntitlement?.categoryId ?? null

      let resolved: ReturnType<typeof resolvePublicSignupSelection>
      try {
        resolved = resolvePublicSignupSelection({
          context: accommodationContext,
          selection: {
            categoryId: String(preference.categoryId),
            occupancy: preference.occupancy,
            optionSelections: preference.optionSelections,
            nights: preference.nights,
          },
          ticketCategoryId,
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid accommodation selection"
        throwSubmissionError(
          "SUBMISSION_CONFLICT",
          message.replace(/^QUOTE_INVALID:\s*/, "")
        )
      }

      if (!resolved.categoryId || !resolved.occupancy) {
        throwSubmissionError(
          "SUBMISSION_CONFLICT",
          "Accommodation preferences require a category and occupancy when the event offers configured accommodation."
        )
      }

      resolvedAccommodationSelections.set(preference.attendeeKey, {
        categoryId: resolved.categoryId as Id<"accommodationCategories">,
        occupancy: resolved.occupancy,
        nightCount: resolved.nightCount ?? null,
        optionSelections: resolved.options,
      })
    }

    // Cardinality contract (CR-03): a configured event needs exactly one
    // validated preference per ticketed attendee (the preference-key set must
    // equal the ticketed attendee-key set), and an unconfigured event accepts
    // no preferences at all. This prevents a direct mutation call or a stale
    // HTTP payload from persisting an order without its accommodation rows.
    const ticketedAttendeeKeys = new Set(attendeeKeyToTicketTypeId.keys())
    if (accommodationContext.hasConfiguredAccommodation) {
      for (const attendeeKey of ticketedAttendeeKeys) {
        if (!resolvedAccommodationSelections.has(attendeeKey)) {
          throwSubmissionError(
            "SUBMISSION_CONFLICT",
            `Attendee '${attendeeKey}' has a ticket but no accommodation preference.`
          )
        }
      }
      for (const attendeeKey of resolvedAccommodationSelections.keys()) {
        if (!ticketedAttendeeKeys.has(attendeeKey)) {
          throwSubmissionError(
            "SUBMISSION_CONFLICT",
            `Accommodation preference attendee '${attendeeKey}' has no ticket selection.`
          )
        }
      }
    } else if (args.accommodationSelections.length > 0) {
      throwSubmissionError(
        "SUBMISSION_CONFLICT",
        "This event does not offer configured accommodation; no accommodation preferences may be submitted."
      )
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

      // soldCountIncrements was fully precomputed during the CR-08 capacity
      // validation pass above — it must not be mutated again here, or the
      // capacity check and the persisted increments could disagree.
      attendeeKeyToTicketTypeId.set(
        selection.attendeeKey,
        selection.ticketTypeId
      )
    }

    for (const [attendeeKey, attendeeId] of attendeeIdsByKey.entries()) {
      const ticketTypeId = attendeeKeyToTicketTypeId.get(attendeeKey)
      if (!ticketTypeId) continue

      const ticketType = ticketTypeById.get(ticketTypeId)
      // Legacy entitlement metadata only for explicitly constrained tickets:
      // `ticketTypes.roomTypeId` is the authoritative room entitlement. An
      // unconstrained ticket has no physical-room entitlement — the validated
      // category preference (orderAccommodationSelections.categoryId) carries
      // that for allocation. Writing event.defaultRoomTypeId here made the
      // dashboard suggest the event default for a buyer who picked a
      // superior/family category (WR-05), so the event default must never be
      // stored as if it were a placement hint.
      const ticketEntitlement = ticketType
        ? selectionTicketCategoryById.get(String(ticketType._id))
        : undefined
      if (ticketType?.roomTypeId && ticketEntitlement) {
        await ctx.db.patch(attendeeId, {
          allocatedRoomTypeId: ticketType.roomTypeId,
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

    // Persist one unconfirmed accommodation-selection row per supplied
    // attendee preference. Stay timestamps are server-resolved from the event
    // configuration and nightCount is the validated buyer-chosen total nights
    // (defaulted to the base stay); confirmedAt/configVersion/priceSnapshot
    // stay absent so the Phase 40 canonical loader prices the rows live and
    // Phase 41/44 owns confirmation. No orderAssignments row is ever created
    // for an options-only request.
    const eventConfig = accommodationContext.config
    for (const preference of args.accommodationSelections) {
      const attendeeId = attendeeIdsByKey.get(preference.attendeeKey)
      if (!attendeeId) {
        throwSubmissionError(
          "SUBMISSION_CONFLICT",
          `Accommodation preference attendee '${preference.attendeeKey}' could not be resolved`
        )
      }

      const resolved = resolvedAccommodationSelections.get(
        preference.attendeeKey
      )
      if (!resolved) {
        throwSubmissionError(
          "SUBMISSION_CONFLICT",
          `Accommodation preference for '${preference.attendeeKey}' failed validation`
        )
      }

      const selectionId = await ctx.db.insert("orderAccommodationSelections", {
        orderId: submissionId,
        attendeeId,
        categoryId: resolved.categoryId,
        occupancy: resolved.occupancy,
        checkInAt: eventConfig?.baseCheckInAt,
        checkOutAt: eventConfig?.baseCheckOutAt,
        // The validated buyer-chosen total nights (defaulted to the base stay)
        // are persisted so the canonical finance loader prices the charged
        // nights beyond any ticket-covered base nights exactly as quoted.
        nightCount: resolved.nightCount ?? undefined,
      })

      // Persist one child row per selected option (optionKey + quantity +
      // nights). The base selection row stores category/occupancy only.
      for (const [sortOrder, optionSelection] of resolved.optionSelections.entries()) {
        await ctx.db.insert("orderAccommodationOptionSelections", {
          orderId: submissionId,
          attendeeId,
          selectionId,
          optionKey: optionSelection.optionKey,
          quantity: optionSelection.quantity,
          nights: optionSelection.nights,
          sortOrder,
        })
      }
    }

    const expiredRecordByKey = idempotencyRecords.find(
      (record) => record.expiresAt < now
    )

    if (expiredRecordByKey) {
      await ctx.db.patch(expiredRecordByKey._id, {
        fingerprint: payloadDigest,
        orderId: submissionId,
        expiresAt: now + IDEMPOTENCY_WINDOW_MS,
      })
    } else {
      await ctx.db.insert("orderIdempotency", {
        eventId: args.eventId,
        idempotencyKey,
        fingerprint: payloadDigest,
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

      // Phase 43: prefer the durable booking-reference permalink with an
      // HMAC edit token when the shared secret is available; fall back to the
      // plain manage surface (email ownership) when it is not so an email is
      // never emitted with a forgeable token. `/manage` is the canonical
      // buyer-facing route; the legacy `/track-payment` pages redirect here.
      const trackPaymentUrl =
        (await buildTrackPaymentPermalink({
          bookingRef,
          bookerEmail,
          appUrl,
        })) ?? `${appUrl}/manage`

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
          trackPaymentUrl,
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
        accommodationSelections: args.accommodationSelections.map(
          (preference) => ({
            attendeeKey: preference.attendeeKey,
            categoryId: String(preference.categoryId),
            occupancy: preference.occupancy,
            // Restore the RESOLVED night count that was persisted (not the
            // raw client value), so a replayed restore payload round-trips
            // exactly what the order row holds.
            nights:
              resolvedAccommodationSelections.get(preference.attendeeKey)
                ?.nightCount ?? undefined,
            optionSelections: preference.optionSelections,
          })
        ),
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
      accommodationLines: v.array(
        v.object({
          kind: v.union(v.literal("accommodation"), v.literal("option")),
          optionKey: v.optional(v.string()),
          label: v.string(),
          nights: v.number(),
          quantity: v.optional(v.number()),
          ratePerNightMinor: v.number(),
          chargeMinor: v.number(),
        })
      ),
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
    // Normalize the reference the same way the public tracking queries do, so
    // a lower/mixed-case permalink resolves to the canonical order (CR-07).
    const bookingRef = args.bookingRef.trim().toUpperCase()
    const submission = await ctx.db
      .query("orders")
      .withIndex("by_bookingRef", (q) => q.eq("bookingRef", bookingRef))
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

    // Canonical amount-due (tickets + accommodation) from the shared loader.
    // The booking reference response must never recompute its own total.
    const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      ctx,
      [{ _id: submission._id }]
    )
    const amountDueBreakdown = amountDueBreakdownsByOrderId.get(
      String(submission._id)
    )
    const totalAmountMinor = amountDueBreakdown?.amountDueMinor ?? 0
    const accommodationLines = amountDueBreakdown?.accommodationLines ?? []

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
      bookerPhone: submission.bookerPhone,
      eventId: submission.eventId,
      eventSlug,
      submittedAt: submission.submittedAt,
      attendees: attendeesWithRooms,
      roomAssignments,
      totalAmountMinor,
      accommodationLines,
      ticketSelections,
    }
  },
})
