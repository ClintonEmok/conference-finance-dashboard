import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { v } from "convex/values"
import { requireIdentity } from "./auth"
import { internal } from "./_generated/api"

export const emailBroadcastStatuses = [
  "queued",
  "sending",
  "completed",
  "failed",
  "cancelled",
] as const
export type EmailBroadcastStatus = (typeof emailBroadcastStatuses)[number]

export const emailBroadcastRecipientStatuses = [
  "pending",
  "sent",
  "failed",
] as const
export type EmailBroadcastRecipientStatus =
  (typeof emailBroadcastRecipientStatuses)[number]

export const emailAudienceFiltersValidator = v.object({
  location: v.optional(v.string()),
  status: v.optional(
    v.union(
      v.literal("paid"),
      v.literal("refunded"),
      v.literal("cancelled"),
      v.literal("pending")
    )
  ),
  from: v.optional(v.number()),
  to: v.optional(v.number()),
  hasAccommodationSelection: v.optional(v.boolean()),
  ticketTypeId: v.optional(v.id("ticketTypes")),
})
export type EmailAudienceFilters = {
  location?: string
  status?: "paid" | "refunded" | "cancelled" | "pending"
  from?: number
  to?: number
  hasAccommodationSelection?: boolean
  ticketTypeId?: Id<"ticketTypes">
}

export const MAX_BROADCAST_RECIPIENTS = 2000

type AudienceRecipient = {
  orderId: Id<"orders">
  bookerName: string | null
  bookerEmail: string
  bookingRef: string | null
  status: string | null
  location: string | null
  hasAccommodationSelection: boolean
  ticketTypeLabels: string[]
  submittedAt: number | null
}

function normalizeEmail(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim().toLowerCase() : ""
  return trimmed || null
}

function normalizeLocationLabel(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : ""
  return trimmed || null
}

/** A core order is removed only when its Ticket Tailor extension says so. */
async function isOrderRemoved(ctx: QueryCtx, orderId: Id<"orders">) {
  const extension = await ctx.db
    .query("ticketTailorOrders")
    .withIndex("orderId", (q) => q.eq("orderId", orderId))
    .first()
  return typeof extension?.removedAt === "number"
}

/**
 * Computes the event's order-booker audience. Recipients are one per order
 * (deduplicated by normalized booker email, keeping the newest order), for
 * non-removed internal-event orders that have both a booker email and a
 * booking reference (required for the personalized manage link). All filters
 * are optional and AND-combined.
 */
async function computeAudience(
  ctx: QueryCtx,
  eventId: Id<"events">,
  filters: EmailAudienceFilters
): Promise<{
  recipients: AudienceRecipient[]
  skippedNoEmail: number
  skippedNoRef: number
}> {
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .order("desc")
    .collect()

  const candidateOrders: Array<Doc<"orders">> = []
  for (const order of orders) {
    if (order.status === "cancelled") {
      continue
    }
    if (await isOrderRemoved(ctx, order._id)) {
      continue
    }
    candidateOrders.push(order)
  }

  const ticketTypes = await ctx.db
    .query("ticketTypes")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .collect()
  const ticketLabelById = new Map(
    ticketTypes.map((ticketType) => [String(ticketType._id), ticketType.label])
  )

  let skippedNoEmail = 0
  let skippedNoRef = 0
  const byEmail = new Map<string, AudienceRecipient>()

  for (const order of candidateOrders) {
    const email = normalizeEmail(order.bookerEmail)
    if (!email) {
      skippedNoEmail++
      continue
    }
    if (!order.bookingRef) {
      skippedNoRef++
      continue
    }
    if (byEmail.has(email)) {
      continue
    }

    const orderTime = order.orderedAt ?? order.submittedAt
    if (filters.status && (order.status ?? "pending") !== filters.status) {
      continue
    }
    if (filters.from !== undefined && (orderTime ?? -Infinity) < filters.from) {
      continue
    }
    if (filters.to !== undefined && (orderTime ?? Infinity) > filters.to) {
      continue
    }

    const attendees = await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .take(100)
    const orderLocations = new Set<string>()
    for (const attendee of attendees) {
      const location = normalizeLocationLabel(attendee.location)
      if (location) {
        orderLocations.add(location.toLowerCase())
      }
    }
    if (
      filters.location &&
      !orderLocations.has(filters.location.toLowerCase())
    ) {
      continue
    }

    let hasAccommodationSelection = false
    if (filters.hasAccommodationSelection) {
      const selection = await ctx.db
        .query("orderAccommodationSelections")
        .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
        .first()
      if (!selection) {
        continue
      }
      hasAccommodationSelection = true
    }

    const ticketSelections = await ctx.db
      .query("orderTicketSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .collect()
    if (
      filters.ticketTypeId &&
      !ticketSelections.some(
        (selection) =>
          String(selection.ticketTypeId) === String(filters.ticketTypeId)
      )
    ) {
      continue
    }
    const ticketTypeLabels = Array.from(
      new Set(
        ticketSelections
          .map((selection) =>
            ticketLabelById.get(String(selection.ticketTypeId))
          )
          .filter((label): label is string => Boolean(label))
      )
    )

    byEmail.set(email, {
      orderId: order._id,
      bookerName: order.bookerName ?? null,
      bookerEmail: email,
      bookingRef: order.bookingRef ?? null,
      status: order.status ?? "pending",
      location: Array.from(orderLocations)[0] ?? null,
      hasAccommodationSelection,
      ticketTypeLabels,
      submittedAt: orderTime ?? null,
    })
  }

  return {
    recipients: Array.from(byEmail.values()),
    skippedNoEmail,
    skippedNoRef,
  }
}

function assertInternalEvent(event: Doc<"events">) {
  if (event.primarySourceKind !== "internal") {
    throw new Error("Broadcasts are only available for internal events")
  }
}

export const previewAudience = query({
  args: {
    eventId: v.id("events"),
    ...emailAudienceFiltersValidator.fields,
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const event = await ctx.db.get("events", args.eventId)
    if (!event) {
      return { total: 0, skippedNoEmail: 0, skippedNoRef: 0, recipients: [] }
    }
    const { eventId, limit, search, ...filters } = args
    const { recipients, skippedNoEmail, skippedNoRef } = await computeAudience(
      ctx,
      eventId,
      filters
    )
    const query = (search ?? "").trim().toLowerCase()
    const matched = query
      ? recipients.filter(
          (recipient) =>
            (recipient.bookerName ?? "").toLowerCase().includes(query) ||
            recipient.bookerEmail.toLowerCase().includes(query) ||
            (recipient.bookingRef ?? "").toLowerCase().includes(query)
        )
      : recipients
    const previewLimit = Math.min(limit ?? 200, 200)
    return {
      total: matched.length,
      skippedNoEmail,
      skippedNoRef,
      recipients: matched.slice(0, previewLimit),
    }
  },
})

export const getBroadcastHistory = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const broadcasts = await ctx.db
      .query("emailBroadcasts")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .take(50)
    return broadcasts.map((broadcast) => ({
      _id: broadcast._id,
      status: broadcast.status,
      title: broadcast.title,
      createdAt: broadcast.createdAt,
      totalRecipients: broadcast.totalRecipients,
      sentCount: broadcast.sentCount,
      failedCount: broadcast.failedCount,
      pendingCount: broadcast.pendingCount,
      error: broadcast.error ?? null,
      completedAt: broadcast.completedAt ?? null,
      cancelledAt: broadcast.cancelledAt ?? null,
    }))
  },
})

export const getBroadcastById = query({
  args: { broadcastId: v.id("emailBroadcasts") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const broadcast = await ctx.db.get("emailBroadcasts", args.broadcastId)
    if (!broadcast) {
      return null
    }
    return {
      ...broadcast,
      filters: broadcast.filters as EmailAudienceFilters,
    }
  },
})

export const getBroadcastRecipients = query({
  args: {
    broadcastId: v.id("emailBroadcasts"),
    status: v.optional(
      v.union(v.literal("pending"), v.literal("sent"), v.literal("failed"))
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const limit = Math.min(args.limit ?? 500, 500)
    const base = ctx.db.query("emailBroadcastRecipients")
    if (args.status) {
      return await base
        .withIndex("by_broadcastId_and_status", (q) =>
          q
            .eq("broadcastId", args.broadcastId)
            .eq("status", args.status as "pending")
        )
        .take(limit)
    }
    return await base
      .withIndex("by_broadcastId", (q) => q.eq("broadcastId", args.broadcastId))
      .take(limit)
  },
})

export const scheduleEmailBroadcast = mutation({
  args: {
    eventId: v.id("events"),
    title: v.string(),
    message: v.string(),
    eventName: v.string(),
    eventDate: v.string(),
    eventLocation: v.string(),
    paymentUrl: v.optional(v.string()),
    nightBeforeNote: v.optional(v.string()),
    filters: emailAudienceFiltersValidator,
    authorize: v.boolean(),
  },
  returns: v.object({
    broadcastId: v.id("emailBroadcasts"),
    totalRecipients: v.number(),
    skippedNoEmail: v.number(),
    skippedNoRef: v.number(),
  }),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const event = await ctx.db.get("events", args.eventId)
    if (!event) {
      throw new Error("Event not found")
    }
    assertInternalEvent(event)

    if (!args.authorize) {
      throw new Error("Broadcast requires explicit authorization")
    }
    const title = args.title.trim()
    const message = args.message.trim()
    if (!title || !message) {
      throw new Error("Title and message are required")
    }

    const { recipients, skippedNoEmail, skippedNoRef } = await computeAudience(
      ctx,
      args.eventId,
      args.filters
    )
    if (recipients.length === 0) {
      throw new Error("No bookers match the selected audience filters")
    }
    if (recipients.length > MAX_BROADCAST_RECIPIENTS) {
      throw new Error(
        `Audience too large (${recipients.length}). Maximum is ${MAX_BROADCAST_RECIPIENTS}.`
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const baseUrl = appUrl.replace(/\/+$/, "")
    const signupUrl = `${baseUrl}/signup/${encodeURIComponent(event.slug)}`

    const broadcastId = await ctx.db.insert("emailBroadcasts", {
      eventId: args.eventId,
      status: "queued",
      title,
      message,
      eventName: args.eventName,
      eventDate: args.eventDate,
      eventLocation: args.eventLocation,
      paymentUrl: args.paymentUrl,
      nightBeforeNote: args.nightBeforeNote,
      signupUrl,
      filters: args.filters,
      totalRecipients: recipients.length,
      sentCount: 0,
      failedCount: 0,
      pendingCount: recipients.length,
      createdBy: identity.email ?? identity.subject,
      createdAt: Date.now(),
    })

    for (const recipient of recipients) {
      await ctx.db.insert("emailBroadcastRecipients", {
        broadcastId,
        orderId: recipient.orderId,
        to: recipient.bookerEmail,
        bookerName: recipient.bookerName ?? undefined,
        bookingRef: recipient.bookingRef ?? undefined,
        manageBookingUrl: recipient.bookingRef
          ? `${baseUrl}/booking/${encodeURIComponent(recipient.bookingRef)}/manage`
          : undefined,
        status: "pending",
        attempts: 0,
      })
    }

    await ctx.scheduler.runAfter(
      0,
      internal.emailBroadcastActions.processBatch,
      { broadcastId }
    )

    return {
      broadcastId,
      totalRecipients: recipients.length,
      skippedNoEmail,
      skippedNoRef,
    }
  },
})

export const cancelEmailBroadcast = mutation({
  args: { broadcastId: v.id("emailBroadcasts") },
  returns: v.object({ cancelled: v.boolean() }),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const broadcast = await ctx.db.get("emailBroadcasts", args.broadcastId)
    if (!broadcast) {
      throw new Error("Broadcast not found")
    }
    if (broadcast.status !== "queued" && broadcast.status !== "sending") {
      return { cancelled: false }
    }
    await ctx.db.patch("emailBroadcasts", args.broadcastId, {
      status: "cancelled",
      cancelledAt: Date.now(),
    })
    return { cancelled: true }
  },
})

export const retryFailedEmailBroadcast = mutation({
  args: { broadcastId: v.id("emailBroadcasts") },
  returns: v.object({ requeued: v.number() }),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const broadcast = await ctx.db.get("emailBroadcasts", args.broadcastId)
    if (!broadcast) {
      throw new Error("Broadcast not found")
    }
    if (
      broadcast.status !== "completed" &&
      broadcast.status !== "failed" &&
      broadcast.status !== "cancelled"
    ) {
      throw new Error("Broadcast is not in a retryable state")
    }
    if (broadcast.failedCount === 0) {
      return { requeued: 0 }
    }

    const failedRecipients = await ctx.db
      .query("emailBroadcastRecipients")
      .withIndex("by_broadcastId_and_status", (q) =>
        q.eq("broadcastId", args.broadcastId).eq("status", "failed")
      )
      .collect()

    for (const recipient of failedRecipients) {
      await ctx.db.patch("emailBroadcastRecipients", recipient._id, {
        status: "pending",
        error: undefined,
        emailId: undefined,
        sentAt: undefined,
      })
    }

    await ctx.db.patch("emailBroadcasts", args.broadcastId, {
      status: "queued",
      failedCount: 0,
      pendingCount: failedRecipients.length,
      error: undefined,
      completedAt: undefined,
      cancelledAt: undefined,
    })

    if (failedRecipients.length > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.emailBroadcastActions.processBatch,
        { broadcastId: args.broadcastId }
      )
    }

    return { requeued: failedRecipients.length }
  },
})

// ---------------------------------------------------------------------------
// Internal surface for the async batch loop (emailBroadcastActions.ts).
// The action has no database access, so all reads/writes go through these.
// ---------------------------------------------------------------------------

export const getJob = internalQuery({
  args: { broadcastId: v.id("emailBroadcasts") },
  handler: async (ctx, args) => {
    return await ctx.db.get("emailBroadcasts", args.broadcastId)
  },
})

export const getPendingRecipients = internalQuery({
  args: {
    broadcastId: v.id("emailBroadcasts"),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emailBroadcastRecipients")
      .withIndex("by_broadcastId_and_status", (q) =>
        q
          .eq("broadcastId", args.broadcastId)
          .eq("status", "pending" as const)
      )
      .take(args.limit)
  },
})

export const markSending = internalMutation({
  args: {
    broadcastId: v.id("emailBroadcasts"),
    startedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("emailBroadcasts", args.broadcastId, {
      status: "sending",
      startedAt: args.startedAt,
    })
  },
})

export const recordRecipientSuccess = internalMutation({
  args: {
    broadcastId: v.id("emailBroadcasts"),
    recipientId: v.id("emailBroadcastRecipients"),
    emailId: v.string(),
    sentAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("emailBroadcastRecipients", args.recipientId, {
      status: "sent",
      emailId: args.emailId,
      sentAt: args.sentAt,
      error: undefined,
    })
    const broadcast = await ctx.db.get("emailBroadcasts", args.broadcastId)
    if (!broadcast) {
      return
    }
    await ctx.db.patch("emailBroadcasts", args.broadcastId, {
      sentCount: broadcast.sentCount + 1,
      pendingCount: Math.max(0, broadcast.pendingCount - 1),
    })
  },
})

export const recordRecipientFailure = internalMutation({
  args: {
    broadcastId: v.id("emailBroadcasts"),
    recipientId: v.id("emailBroadcastRecipients"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const recipient = await ctx.db.get(
      "emailBroadcastRecipients",
      args.recipientId
    )
    if (recipient) {
      await ctx.db.patch("emailBroadcastRecipients", args.recipientId, {
        status: "failed",
        error: args.error,
        attempts: recipient.attempts + 1,
      })
    }
    const broadcast = await ctx.db.get("emailBroadcasts", args.broadcastId)
    if (!broadcast) {
      return
    }
    await ctx.db.patch("emailBroadcasts", args.broadcastId, {
      failedCount: broadcast.failedCount + 1,
      pendingCount: Math.max(0, broadcast.pendingCount - 1),
    })
  },
})

export const finalizeBroadcast = internalMutation({
  args: { broadcastId: v.id("emailBroadcasts") },
  handler: async (ctx, args) => {
    const broadcast = await ctx.db.get("emailBroadcasts", args.broadcastId)
    if (!broadcast) {
      return
    }
    if (broadcast.pendingCount !== 0) {
      return
    }
    const status =
      broadcast.sentCount === 0 && broadcast.failedCount > 0
        ? "failed"
        : "completed"
    await ctx.db.patch("emailBroadcasts", args.broadcastId, {
      status,
      completedAt: Date.now(),
    })
  },
})
