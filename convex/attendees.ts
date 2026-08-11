import { query, mutation } from "./_generated/server"
import { v } from "convex/values"
import { paginationOptsValidator } from "convex/server"
import { requireIdentity } from "./auth"
import { api } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { loadOrderAmountDueBreakdowns } from "./finance"
import {
  loadPublicSignupAccommodationContext,
  resolvePublicSignupSelection,
  resolveTicketCategoryById,
  type PublicSignupSelectionResolved,
} from "./signupCatalog"

type AttendeeResolveCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">

type TicketFinancials = {
  ticketTypeId: Id<"ticketTypes"> | null
  ticketTypeLabel: string | null
  amountDueMinor: number
}

function normalizeLowerGenderToUpper(
  gender: "male" | "female" | "mixed" | "unknown"
): "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" {
  switch (gender) {
    case "male":
      return "MALE"
    case "female":
      return "FEMALE"
    case "mixed":
      return "MIXED"
    case "unknown":
    default:
      return "UNKNOWN"
  }
}

function normalizeUpperGenderToLower(
  gender: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
): "male" | "female" | "mixed" | "unknown" {
  switch (gender) {
    case "MALE":
      return "male"
    case "FEMALE":
      return "female"
    case "MIXED":
      return "mixed"
    case "UNKNOWN":
    default:
      return "unknown"
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function mergeCustomAnswers(input: {
  canonicalAttendee?: {
    location?: string | null
    dietaryRestrictions?: string | null
    roommatePreference?: string | null
    roommateAvoid?: string | null
  } | null
  ticketTailorAttendee?: { customAnswers?: unknown } | null
}) {
  const customAnswers = isPlainObject(input.ticketTailorAttendee?.customAnswers)
    ? { ...input.ticketTailorAttendee!.customAnswers }
    : {}

  if (input.canonicalAttendee?.location && !("location" in customAnswers)) {
    customAnswers.location = input.canonicalAttendee.location
  }

  if (
    input.canonicalAttendee?.dietaryRestrictions &&
    !("dietary" in customAnswers)
  ) {
    customAnswers.dietary = input.canonicalAttendee.dietaryRestrictions
  }

  if (
    input.canonicalAttendee?.roommatePreference &&
    !("roommatePreference" in customAnswers)
  ) {
    customAnswers.roommatePreference =
      input.canonicalAttendee.roommatePreference
  }

  if (
    input.canonicalAttendee?.roommateAvoid &&
    !("roommateAvoid" in customAnswers)
  ) {
    customAnswers.roommateAvoid = input.canonicalAttendee.roommateAvoid
  }

  return Object.keys(customAnswers).length > 0 ? customAnswers : null
}

async function getTicketFinancialsForAttendee(
  ctx: AttendeeResolveCtx,
  orderId: Id<"orders">,
  attendeeId: string
) : Promise<TicketFinancials> {
  const selections = await ctx.db
    .query("orderTicketSelections")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
    .take(100)

  const selection = selections.find(
    (entry: { attendeeId?: unknown }) => String(entry.attendeeId) === attendeeId
  )

  if (!selection) {
    return {
      ticketTypeId: null,
      ticketTypeLabel: null,
      amountDueMinor: 0,
    }
  }

  const ticketType = await ctx.db.get(
    selection.ticketTypeId as Id<"ticketTypes">
  )

  return {
    ticketTypeId: selection.ticketTypeId,
    ticketTypeLabel: ticketType?.label ?? null,
    amountDueMinor:
      ticketType && Number.isFinite(ticketType.priceMinor)
        ? ticketType.priceMinor * selection.quantity
        : 0,
  }
}

async function resolveAttendeeRecordByStringId(
  ctx: AttendeeResolveCtx,
  attendeeId: string
) {
  const canonicalAttendeeId = ctx.db.normalizeId("orderAttendees", attendeeId)

  if (canonicalAttendeeId) {
    const canonicalAttendee = await ctx.db.get(
      "orderAttendees",
      canonicalAttendeeId
    )

    if (!canonicalAttendee) {
      return null
    }

    const order = await ctx.db.get("orders", canonicalAttendee.orderId)

    if (!order) {
      return null
    }

    const ticketTailorAttendee = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("attendeeId", (q) => q.eq("attendeeId", canonicalAttendeeId))
      .first()

    const ticketFinancials = await getTicketFinancialsForAttendee(
      ctx,
      canonicalAttendee.orderId,
      String(canonicalAttendeeId)
    )

    return {
      canonicalAttendee,
      ticketTailorAttendee,
      order,
      ticketFinancials: {
        ...ticketFinancials,
        ticketTypeLabel:
          ticketTailorAttendee?.ticketTypeLabel ??
          ticketFinancials.ticketTypeLabel,
      },
    }
  }

  const ticketTailorAttendeeId = ctx.db.normalizeId(
    "ticketTailorAttendees",
    attendeeId
  )

  if (!ticketTailorAttendeeId) {
    return null
  }

  const ticketTailorAttendee = await ctx.db.get(
    "ticketTailorAttendees",
    ticketTailorAttendeeId
  )

  if (!ticketTailorAttendee) {
    return null
  }

  const canonicalAttendee = ticketTailorAttendee.attendeeId
    ? await ctx.db.get("orderAttendees", ticketTailorAttendee.attendeeId)
    : null
  const order = await ctx.db.get("orders", ticketTailorAttendee.orderId)

  if (!order) {
    return null
  }

  const ticketFinancials = canonicalAttendee
    ? await getTicketFinancialsForAttendee(
        ctx,
        ticketTailorAttendee.orderId,
        String(canonicalAttendee._id)
      )
    : { ticketTypeId: null, ticketTypeLabel: null, amountDueMinor: 0 }

  return {
    canonicalAttendee,
    ticketTailorAttendee,
    order,
    ticketFinancials: {
      ...ticketFinancials,
      ticketTypeLabel:
        ticketTailorAttendee.ticketTypeLabel ??
        ticketFinancials.ticketTypeLabel,
    },
  }
}

function filterAttendees(
  attendees: Array<{
    assignedRoomId?: string
    genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
    allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
  }>,
  args: {
    assignedRoomId?: string
    genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
    allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
  }
) {
  return attendees.filter((attendee) => {
    if (args.assignedRoomId !== undefined) {
      const assignedRoomId = attendee.assignedRoomId ?? undefined
      if (assignedRoomId !== args.assignedRoomId) {
        return false
      }
    }

    if (args.genderType && attendee.genderType !== args.genderType) {
      return false
    }

    if (
      args.allocationPriority &&
      attendee.allocationPriority !== args.allocationPriority
    ) {
      return false
    }

    return true
  })
}

export const getAttendees = query({
  args: {
    eventId: v.optional(v.string()),
    orderId: v.optional(v.id("orders")),
    assignedRoomId: v.optional(v.string()),
    genderType: v.optional(
      v.union(
        v.literal("MALE"),
        v.literal("FEMALE"),
        v.literal("MIXED"),
        v.literal("UNKNOWN")
      )
    ),
    allocationPriority: v.optional(
      v.union(
        v.literal("CRITICAL"),
        v.literal("HIGH"),
        v.literal("NORMAL"),
        v.literal("LOW")
      )
    ),
    paginationOpts: v.optional(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    if (args.orderId) {
      // Bounded: one order has a small number of attendees
      return await ctx.db
        .query("ticketTailorAttendees")
        .withIndex("orderId", (q) => q.eq("orderId", args.orderId!))
        .take(100)
    }

    if (args.eventId) {
      const base = ctx.db
        .query("ticketTailorAttendees")
        .withIndex("providerEventOrder", (q) =>
          q.eq("providerEventId", args.eventId!)
        )

      if (args.paginationOpts) {
        return await base.paginate(args.paginationOpts)
      }

      // Backward-compatible: bounded fallback when no pagination requested
      const attendees = await base.take(500)
      return filterAttendees(attendees, args)
    }

    const base = ctx.db.query("ticketTailorAttendees")

    if (args.paginationOpts) {
      return await base.paginate(args.paginationOpts)
    }

    // Backward-compatible: bounded fallback
    const attendees = await base.take(500)
    return filterAttendees(attendees, args)
  },
})

export const getAttendeesWithTickets = query({
  args: {
    eventId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    // Get orders (optionally filtered by eventId)
    const orders = args.eventId
      ? await ctx.db
          .query("orders")
          .withIndex("by_eventId", (q) =>
            q.eq("eventId", args.eventId as Id<"events">)
          )
          .collect()
      : await ctx.db.query("orders").collect()

    const orderMap = new Map(orders.map((o) => [o._id, o]))
    const orderIds = new Set(orders.map((o) => o._id))
    const amountDueByOrderId = await loadOrderAmountDueBreakdowns(ctx, orders)

    // Get all attendees for these orders
    const allAttendees = await ctx.db.query("orderAttendees").collect()
    const attendees = allAttendees.filter((a) => orderIds.has(a.orderId))

    // Get ticket selections for these orders (join by orderId)
    const allSelections = await Promise.all(
      orders.map((order) =>
        ctx.db
          .query("orderTicketSelections")
          .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
          .collect()
      )
    )
    const selections = allSelections.flat()

    // Get ticket types
    const ticketTypeIds = Array.from(
      new Set(selections.map((s) => String(s.ticketTypeId)))
    )
    const ticketTypes = await Promise.all(
      ticketTypeIds.map((id) => ctx.db.get(id as Id<"ticketTypes">))
    )
    const ticketTypeMap = new Map(
      ticketTypes.filter(Boolean).map((tt) => [tt!._id, tt!.label])
    )

    // Build attendeeId -> ticketTypeLabel map
    const ticketLabelByAttendeeId = new Map<string, string>()
    for (const sel of selections) {
      const label = ticketTypeMap.get(sel.ticketTypeId)
      if (label) {
        ticketLabelByAttendeeId.set(String(sel.attendeeId), label)
      }
    }

    // Return attendees with ticketTypeLabel AND order data
    return attendees.map((a) => {
      const order = orderMap.get(a.orderId)
      const amountBreakdown = amountDueByOrderId.get(String(a.orderId))
      const amountDueMinor =
        amountBreakdown?.amountDueByAttendeeId.get(String(a._id)) ?? 0
      return {
        _id: a._id,
        orderId: a.orderId,
        name: a.name,
        email: a.email ?? null,
        gender: a.gender,
        location: a.location ?? null,
        assignedRoomId: a.assignedRoomId ?? null,
        allocationPriority: a.allocationPriority ?? null,
        priorityReason: a.priorityReason ?? null,
        ticketTypeLabel: ticketLabelByAttendeeId.get(String(a._id)) ?? null,
        amountDueMinor,
        // Order data embedded
        orderProviderOrderId: order?.providerOrderId ?? null,
        orderEventId: order?.eventId ?? null,
        orderStatus: order?.status ?? null,
        orderTotalAmountMinor: order?.totalAmountMinor ?? null,
        orderAmountDueMinor: amountBreakdown?.amountDueMinor ?? null,
        orderSubmittedAt: order?.submittedAt ?? null,
        orderOrderedAt: order?.orderedAt ?? null,
        allocatedRoomTypeId: a.allocatedRoomTypeId ?? null,
      }
    })
  },
})

export const getAttendeeById = query({
  args: { attendeeId: v.id("ticketTailorAttendees") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    return await ctx.db.get("ticketTailorAttendees", args.attendeeId)
  },
})

export const getAttendeeByEmail = query({
  args: { eventId: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    // Bounded: one email has very few attendees
    const attendees = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .take(10)
    return attendees.filter((a) => a.providerEventId === args.eventId)
  },
})

export const createAttendee = mutation({
  args: {
    providerAttendeeId: v.optional(v.string()),
    providerIssuedTicketId: v.optional(v.string()),
    providerTicketTypeId: v.optional(v.string()),
    providerEventId: v.string(),
    providerOrderId: v.string(),
    eventId: v.union(v.id("events"), v.string()),
    orderId: v.id("orders"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    ticketTypeLabel: v.optional(v.string()),
    ticketStatus: v.optional(v.string()),
    rawPayload: v.any(),
    customAnswers: v.optional(v.any()),
    genderType: v.optional(
      v.union(
        v.literal("MALE"),
        v.literal("FEMALE"),
        v.literal("MIXED"),
        v.literal("UNKNOWN")
      )
    ),
    ageGroup: v.optional(v.string()),
    ticketCategory: v.optional(v.string()),
    allocationPriority: v.optional(
      v.union(
        v.literal("CRITICAL"),
        v.literal("HIGH"),
        v.literal("NORMAL"),
        v.literal("LOW")
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const id = await ctx.db.insert("ticketTailorAttendees", args)
    return id
  },
})

export const upsertAttendee = mutation({
  args: {
    providerAttendeeId: v.optional(v.string()),
    providerIssuedTicketId: v.optional(v.string()),
    providerTicketTypeId: v.optional(v.string()),
    providerEventId: v.string(),
    providerOrderId: v.string(),
    eventId: v.union(v.id("events"), v.string()),
    orderId: v.id("orders"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    ticketTypeLabel: v.optional(v.string()),
    ticketStatus: v.optional(v.string()),
    rawPayload: v.any(),
    customAnswers: v.optional(v.any()),
    genderType: v.optional(
      v.union(
        v.literal("MALE"),
        v.literal("FEMALE"),
        v.literal("MIXED"),
        v.literal("UNKNOWN")
      )
    ),
    ageGroup: v.optional(v.string()),
    ticketCategory: v.optional(v.string()),
    allocationPriority: v.optional(
      v.union(
        v.literal("CRITICAL"),
        v.literal("HIGH"),
        v.literal("NORMAL"),
        v.literal("LOW")
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    if (args.providerAttendeeId) {
      const existing = await ctx.db
        .query("ticketTailorAttendees")
        .withIndex("providerAttendeeId", (q) =>
          q.eq("providerAttendeeId", args.providerAttendeeId!)
        )
        .first()
      if (existing) {
        await ctx.db.patch("ticketTailorAttendees", existing._id, args)
        return existing._id
      }
    }
    return await ctx.db.insert("ticketTailorAttendees", args)
  },
})

export const updateAttendee = mutation({
  args: {
    attendeeId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    location: v.optional(v.union(v.string(), v.null())),
    genderType: v.optional(
      v.union(
        v.literal("MALE"),
        v.literal("FEMALE"),
        v.literal("MIXED"),
        v.literal("UNKNOWN")
      )
    ),
    allocationPriority: v.optional(
      v.union(
        v.literal("CRITICAL"),
        v.literal("HIGH"),
        v.literal("NORMAL"),
        v.literal("LOW")
      )
    ),
    priorityReason: v.optional(v.string()),
    tikkieAmountOverrideMinor: v.optional(v.number()),
    ticketTypeId: v.optional(v.id("ticketTypes")),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const resolved = await resolveAttendeeRecordByStringId(ctx, args.attendeeId)

    if (!resolved) {
      throw new Error("Attendee not found.")
    }

    const extensionUpdates: {
      name?: string
      email?: string
      location?: string
      genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
      allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
      priorityReason?: string
      tikkieAmountOverrideMinor?: number
      ticketTypeLabel?: string
    } = {}

    const coreUpdates: {
      name?: string
      email?: string
      location?: string
      gender?: "male" | "female" | "mixed" | "unknown"
      allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
      priorityReason?: string
    } = {}

    if (args.name !== undefined) {
      extensionUpdates.name = args.name
      coreUpdates.name = args.name
    }

    if (args.email !== undefined) {
      extensionUpdates.email = args.email
      coreUpdates.email = args.email
    }

    if (args.location !== undefined) {
      extensionUpdates.location = args.location ?? undefined
      coreUpdates.location = args.location ?? undefined
    }

    if (args.genderType !== undefined) {
      extensionUpdates.genderType = args.genderType
      coreUpdates.gender = normalizeUpperGenderToLower(args.genderType)
    }

    if (args.allocationPriority !== undefined) {
      extensionUpdates.allocationPriority = args.allocationPriority
      coreUpdates.allocationPriority = args.allocationPriority
    }

    if (args.priorityReason !== undefined) {
      extensionUpdates.priorityReason = args.priorityReason
      coreUpdates.priorityReason = args.priorityReason
    }

    if (args.tikkieAmountOverrideMinor !== undefined) {
      extensionUpdates.tikkieAmountOverrideMinor =
        args.tikkieAmountOverrideMinor
    }

    if (args.ticketTypeId !== undefined) {
      if (!resolved.canonicalAttendee) {
        throw new Error("Cannot change ticket type for attendee without an order attendee record.")
      }

      const selection = await ctx.db
        .query("orderTicketSelections")
        .withIndex("by_orderId", (q) => q.eq("orderId", resolved.canonicalAttendee!.orderId))
        .take(100)
        .then((selections) =>
          selections.find(
            (entry: { attendeeId?: unknown }) =>
              String(entry.attendeeId) === String(resolved.canonicalAttendee!._id)
          ) ?? null
        )

      if (!selection) {
        throw new Error("Ticket selection not found for attendee.")
      }

      const currentTicketTypeId = String(selection.ticketTypeId)
      const nextTicketTypeId = String(args.ticketTypeId)
      const nextTicketType = await ctx.db.get(args.ticketTypeId)

      if (!nextTicketType) {
        throw new Error("Ticket type not found.")
      }

      if (currentTicketTypeId !== nextTicketTypeId) {
        const currentTicketType = await ctx.db.get(selection.ticketTypeId)

        await ctx.db.patch("orderTicketSelections", selection._id, {
          ticketTypeId: args.ticketTypeId,
        })

        if (currentTicketType) {
          await ctx.db.patch(currentTicketType._id, {
            soldCount: Math.max(
              0,
              (currentTicketType.soldCount ?? 0) - selection.quantity
            ),
          })
        }

        await ctx.db.patch(nextTicketType._id, {
          soldCount: (nextTicketType.soldCount ?? 0) + selection.quantity,
        })
      }

      extensionUpdates.ticketTypeLabel = nextTicketType.label
    }

    if (resolved.canonicalAttendee && Object.keys(coreUpdates).length > 0) {
      await ctx.db.patch(
        "orderAttendees",
        resolved.canonicalAttendee._id,
        coreUpdates
      )
    }

    if (
      resolved.ticketTailorAttendee &&
      Object.keys(extensionUpdates).length > 0
    ) {
      await ctx.db.patch(
        "ticketTailorAttendees",
        resolved.ticketTailorAttendee._id,
        extensionUpdates
      )
    }

    return (
      resolved.canonicalAttendee?._id ??
      resolved.ticketTailorAttendee?._id ??
      args.attendeeId
    )
  },
})

export const assignRoom = mutation({
  args: {
    attendeeId: v.id("ticketTailorAttendees"),
    roomId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await ctx.runMutation(api.accommodation.assignAttendeeToRoom, {
      attendeeId: args.attendeeId,
      roomId: args.roomId,
    })
    return args.attendeeId
  },
})

export const unassignRoom = mutation({
  args: {
    attendeeId: v.id("ticketTailorAttendees"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await ctx.runMutation(api.accommodation.unassignAttendeeFromRoom, {
      attendeeId: args.attendeeId,
    })
    return args.attendeeId
  },
})

export const checkInAttendee = mutation({
  args: {
    attendeeId: v.id("ticketTailorAttendees"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await ctx.db.patch("ticketTailorAttendees", args.attendeeId, {
      checkedInAt: Date.now(),
    })
    return args.attendeeId
  },
})

export const getAttendeeByStringId = query({
  args: { attendeeId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const resolved = await resolveAttendeeRecordByStringId(ctx, args.attendeeId)

    if (!resolved) {
      return null
    }

    const canonicalAttendee = resolved.canonicalAttendee
    const ticketTailorAttendee = resolved.ticketTailorAttendee
    const order = resolved.order

    return {
      _id: canonicalAttendee?._id ?? ticketTailorAttendee?._id,
      name: ticketTailorAttendee?.name ?? canonicalAttendee?.name ?? null,
      email: ticketTailorAttendee?.email ?? canonicalAttendee?.email ?? null,
      ticketTypeId: resolved.ticketFinancials.ticketTypeId ?? null,
      ticketTypeLabel: resolved.ticketFinancials.ticketTypeLabel ?? null,
      amountDueMinor: resolved.ticketFinancials.amountDueMinor ?? 0,
      ticketStatus: ticketTailorAttendee?.ticketStatus ?? null,
      checkedInAt: ticketTailorAttendee?.checkedInAt ?? null,
      providerIssuedTicketId:
        ticketTailorAttendee?.providerIssuedTicketId ?? null,
      providerOrderId:
        ticketTailorAttendee?.providerOrderId ?? order.providerOrderId ?? null,
      providerEventId:
        ticketTailorAttendee?.providerEventId ?? order.providerEventId ?? null,
      eventId: order.eventId,
      orderId: canonicalAttendee?.orderId ?? ticketTailorAttendee?.orderId,
      assignedRoomId:
        ticketTailorAttendee?.assignedRoomId ??
        canonicalAttendee?.assignedRoomId ??
        null,
      customAnswers: mergeCustomAnswers({
        canonicalAttendee: canonicalAttendee
          ? {
              location: canonicalAttendee.location ?? null,
              dietaryRestrictions:
                canonicalAttendee.dietaryRestrictions ?? null,
              roommatePreference: canonicalAttendee.roommatePreference ?? null,
              roommateAvoid: canonicalAttendee.roommateAvoid ?? null,
            }
          : null,
        ticketTailorAttendee: ticketTailorAttendee
          ? { customAnswers: ticketTailorAttendee.customAnswers }
          : null,
      }),
      genderType:
        ticketTailorAttendee?.genderType ??
        (canonicalAttendee
          ? normalizeLowerGenderToUpper(canonicalAttendee.gender)
          : null),
      allocationPriority:
        ticketTailorAttendee?.allocationPriority ??
        canonicalAttendee?.allocationPriority ??
        null,
      priorityReason:
        ticketTailorAttendee?.priorityReason ??
        canonicalAttendee?.priorityReason ??
        null,
      ageGroup: ticketTailorAttendee?.ageGroup ?? null,
      ticketCategory: ticketTailorAttendee?.ticketCategory ?? null,
      tikkieAmountOverrideMinor:
        ticketTailorAttendee?.tikkieAmountOverrideMinor ?? null,
    }
  },
})

/**
 * Admin accommodation edit for one attendee (server-authoritative).
 *
 * The dashboard route accepts only the attendee/event scope plus the
 * simplified-contract choices: occupancy (`single`/`shared`), option
 * selections (optionKey + integer quantity + integer nights), and the
 * optional one-night night-before level/occupancy. The mutation never
 * accepts client money, category, room, or amount fields: the event-owned
 * context is loaded server-side and the choices are resolved through the
 * shared `resolvePublicSignupSelection` rule set (the same authority used
 * by quote, submission, edit, and confirmation). The one base
 * `orderAccommodationSelections` row is upserted and its option child rows
 * are replaced with the resolved server selection, so a repeat write is
 * logically idempotent and can never produce duplicate children. The
 * canonical amount due for the attendee's order is recomputed by
 * `loadOrderAmountDueBreakdowns` before returning.
 */
export const setAttendeeAccommodation = mutation({
  args: {
    attendeeId: v.string(),
    eventId: v.id("events"),
    occupancy: v.optional(
      v.union(v.literal("single"), v.literal("shared"))
    ),
    optionSelections: v.optional(
      v.array(
        v.object({
          optionKey: v.string(),
          quantity: v.number(),
          nights: v.number(),
        })
      )
    ),
    nightBeforeLevel: v.optional(
      v.union(v.literal("standard"), v.literal("superior"))
    ),
    nightBeforeOccupancy: v.optional(
      v.union(v.literal("single"), v.literal("shared"))
    ),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const resolved = await resolveAttendeeRecordByStringId(ctx, args.attendeeId)

    if (!resolved?.canonicalAttendee) {
      throw new Error("Attendee not found.")
    }

    const attendee = resolved.canonicalAttendee
    const order = await ctx.db.get("orders", attendee.orderId)

    if (!order) {
      throw new Error("Attendee order not found.")
    }

    if (String(order.eventId) !== String(args.eventId)) {
      throw new Error("Attendee does not belong to the supplied event.")
    }

    const ticketSelection = await ctx.db
      .query("orderTicketSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", attendee.orderId))
      .take(100)
      .then(
        (rows) =>
          rows.find(
            (row) => String(row.attendeeId) === String(attendee._id)
          ) ?? null
      )

    if (!ticketSelection) {
      throw new Error("Ticket selection not found for attendee.")
    }

    const ticketType = await ctx.db.get(
      "ticketTypes",
      ticketSelection.ticketTypeId
    )

    if (!ticketType) {
      throw new Error("Ticket type not found.")
    }

    // Ticket-derived occupancy constraint: a present but unresolvable
    // `ticketTypes.roomTypeId` fails closed, and a constrained occupancy can
    // never be overridden by the caller (CR-02 contract).
    const ticketCategoryById = await resolveTicketCategoryById(
      ctx,
      new Map([[String(ticketType._id), ticketType]])
    )
    const ticketEntitlement = ticketCategoryById.get(String(ticketType._id))

    if (ticketEntitlement === null) {
      throw new Error(
        "The selected ticket's room type is no longer available."
      )
    }

    const occupancy =
      ticketEntitlement?.occupancy ?? args.occupancy ?? null

    if (
      ticketEntitlement?.occupancy &&
      args.occupancy &&
      args.occupancy !== ticketEntitlement.occupancy
    ) {
      throw new Error("Occupancy is determined by the selected ticket.")
    }

    const context = await loadPublicSignupAccommodationContext(
      ctx,
      args.eventId
    )

    let resolvedSelection: PublicSignupSelectionResolved
    try {
      resolvedSelection = resolvePublicSignupSelection({
        context,
        selection: {
          occupancy,
          optionSelections: args.optionSelections ?? [],
          nightBeforeLevel: args.nightBeforeLevel ?? null,
          nightBeforeOccupancy: args.nightBeforeOccupancy ?? null,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      if (message.startsWith("QUOTE_INVALID:")) {
        throw new Error(
          `Invalid accommodation selection:${message.slice("QUOTE_INVALID:".length)}`
        )
      }
      throw error
    }

    // Upsert the one base selection row. An admin set is authoritative even
    // after the organizer confirms: `replace` drops the confirmation fields
    // (confirmedAt/configVersion/priceSnapshot), re-opening the selection for
    // live server repricing.
    const existingSelection = await ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId_and_attendeeId", (q) =>
        q.eq("orderId", attendee.orderId).eq("attendeeId", attendee._id)
      )
      .first()

    const baseRow = {
      orderId: attendee.orderId,
      attendeeId: attendee._id,
      categoryId: (resolvedSelection.categoryId ??
        undefined) as Id<"accommodationCategories"> | undefined,
      occupancy: resolvedSelection.occupancy ?? undefined,
      checkInAt: context.config?.baseCheckInAt,
      checkOutAt: context.config?.baseCheckOutAt,
      nightCount: resolvedSelection.nightCount ?? undefined,
      nightBeforeLevel: resolvedSelection.nightBeforeLevel ?? undefined,
      nightBeforeOccupancy:
        resolvedSelection.nightBeforeOccupancy ?? undefined,
    }

    let selectionId: Id<"orderAccommodationSelections">
    if (existingSelection) {
      selectionId = existingSelection._id
      await ctx.db.replace(
        "orderAccommodationSelections",
        existingSelection._id,
        baseRow
      )
    } else {
      selectionId = await ctx.db.insert(
        "orderAccommodationSelections",
        baseRow
      )
    }

    // Replace the option child rows with the resolved server selection so a
    // repeat write never duplicates children.
    const existingOptionRows = await ctx.db
      .query("orderAccommodationOptionSelections")
      .withIndex("by_selectionId", (q) => q.eq("selectionId", selectionId))
      .collect()

    for (const optionRow of existingOptionRows) {
      await ctx.db.delete("orderAccommodationOptionSelections", optionRow._id)
    }

    for (const [sortOrder, option] of resolvedSelection.options.entries()) {
      await ctx.db.insert("orderAccommodationOptionSelections", {
        orderId: attendee.orderId,
        attendeeId: attendee._id,
        selectionId,
        optionKey: option.optionKey,
        quantity: option.quantity,
        nights: option.nights,
        sortOrder,
      })
    }

    const breakdowns = await loadOrderAmountDueBreakdowns(ctx, [order])
    const breakdown = breakdowns.get(String(order._id))

    return {
      attendeeId: String(attendee._id),
      orderId: String(order._id),
      selection: {
        categoryId: resolvedSelection.categoryId ?? null,
        categoryCode: resolvedSelection.categoryCode ?? null,
        categoryLabel: resolvedSelection.categoryLabel ?? null,
        occupancy: resolvedSelection.occupancy ?? null,
        nightCount: resolvedSelection.nightCount ?? null,
        nightBeforeLevel: resolvedSelection.nightBeforeLevel ?? null,
        nightBeforeOccupancy: resolvedSelection.nightBeforeOccupancy ?? null,
        options: resolvedSelection.options.map((option) => ({
          optionKey: option.optionKey,
          label: option.label,
          pricePerUnitMinor: option.pricePerUnitMinor,
          quantity: option.quantity,
          nights: option.nights,
        })),
      },
      amountDueMinor: breakdown?.amountDueMinor ?? null,
    }
  },
})

/**
 * Admin attendee move between orders in the same event (server-authoritative).
 *
 * Re-links the attendee's canonical row, ticket selection, accommodation
 * selection and option child rows, any room assignment rows, and the
 * ticket-tailor extension rows by patching their `orderId` fields — never
 * duplicating rows, altering ticket inventory, or merging order-level
 * fields. Fails closed before any write when the attendee, ticket selection,
 * accommodation rows, or assignment rows are missing or inconsistent, or
 * when the target order is missing or belongs to another event. Both the
 * source and target orders are recomputed with the canonical
 * `loadOrderAmountDueBreakdowns` loader in the same transaction.
 */
export const moveAttendeeToOrder = mutation({
  args: {
    attendeeId: v.string(),
    targetOrderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const resolved = await resolveAttendeeRecordByStringId(ctx, args.attendeeId)

    if (!resolved?.canonicalAttendee) {
      throw new Error("Attendee not found.")
    }

    const attendee = resolved.canonicalAttendee
    const sourceOrderId = attendee.orderId

    if (sourceOrderId === args.targetOrderId) {
      throw new Error("Source and target orders must be different")
    }

    const sourceOrder = await ctx.db.get("orders", sourceOrderId)
    if (!sourceOrder) {
      throw new Error("Source order not found")
    }

    const targetOrder = await ctx.db.get("orders", args.targetOrderId)
    if (!targetOrder) {
      throw new Error("Target order not found")
    }

    if (String(sourceOrder.eventId ?? "") !== String(targetOrder.eventId ?? "")) {
      throw new Error("Orders must belong to the same event")
    }

    // Fail closed on inconsistent child rows before any write.
    const ticketSelections = await ctx.db
      .query("orderTicketSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", sourceOrderId))
      .take(100)
    const attendeeTicketSelections = ticketSelections.filter(
      (row) => String(row.attendeeId) === String(attendee._id)
    )

    if (attendeeTicketSelections.length !== 1) {
      throw new Error("Attendee ticket selection is missing or inconsistent.")
    }

    const accommodationSelections = await ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", sourceOrderId))
      .take(100)
    const attendeeAccommodationSelections = accommodationSelections.filter(
      (row) => String(row.attendeeId) === String(attendee._id)
    )

    if (attendeeAccommodationSelections.length > 1) {
      throw new Error("Attendee accommodation selection is inconsistent.")
    }

    let attendeeOptionChildren: Array<
      Doc<"orderAccommodationOptionSelections">
    > = []
    if (attendeeAccommodationSelections.length === 1) {
      const baseSelection = attendeeAccommodationSelections[0]
      const optionChildren = await ctx.db
        .query("orderAccommodationOptionSelections")
        .withIndex("by_selectionId", (q) =>
          q.eq("selectionId", baseSelection._id)
        )
        .collect()

      const inconsistent = optionChildren.some(
        (row) => String(row.attendeeId) !== String(attendee._id)
      )
      if (inconsistent) {
        throw new Error(
          "Attendee accommodation option rows are inconsistent."
        )
      }
      attendeeOptionChildren = optionChildren
    }

    const assignments = await ctx.db
      .query("orderAssignments")
      .withIndex("by_attendeeId", (q) => q.eq("attendeeId", attendee._id))
      .collect()

    const inconsistentAssignment = assignments.some(
      (row) => String(row.orderId) !== String(sourceOrderId)
    )
    if (inconsistentAssignment) {
      throw new Error("Attendee assignment rows are inconsistent.")
    }

    const extensionRows = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("attendeeId", (q) => q.eq("attendeeId", attendee._id))
      .collect()

    const inconsistentExtension = extensionRows.some(
      (row) => String(row.orderId) !== String(sourceOrderId)
    )
    if (inconsistentExtension) {
      throw new Error("Attendee extension rows are inconsistent.")
    }

    // Re-link every canonical child row to the target order.
    await ctx.db.patch("orderAttendees", attendee._id, {
      orderId: args.targetOrderId,
    })

    await ctx.db.patch(
      "orderTicketSelections",
      attendeeTicketSelections[0]._id,
      { orderId: args.targetOrderId }
    )

    for (const extensionRow of extensionRows) {
      await ctx.db.patch("ticketTailorAttendees", extensionRow._id, {
        orderId: args.targetOrderId,
      })
    }

    if (attendeeAccommodationSelections.length === 1) {
      const baseSelection = attendeeAccommodationSelections[0]
      await ctx.db.patch("orderAccommodationSelections", baseSelection._id, {
        orderId: args.targetOrderId,
      })

      for (const optionChild of attendeeOptionChildren) {
        await ctx.db.patch("orderAccommodationOptionSelections", optionChild._id, {
          orderId: args.targetOrderId,
        })
      }
    }

    for (const assignment of assignments) {
      await ctx.db.patch("orderAssignments", assignment._id, {
        orderId: args.targetOrderId,
      })
    }

    // Recompute both orders with the canonical loader in the same mutation.
    const breakdowns = await loadOrderAmountDueBreakdowns(ctx, [
      sourceOrder,
      targetOrder,
    ])

    return {
      orderId: String(args.targetOrderId),
      sourceAmountDueMinor:
        breakdowns.get(String(sourceOrderId))?.amountDueMinor ?? null,
      targetAmountDueMinor:
        breakdowns.get(String(args.targetOrderId))?.amountDueMinor ?? null,
    }
  },
})
