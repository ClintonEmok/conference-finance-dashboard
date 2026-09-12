import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { requireIdentity } from "./auth"
import {
  broadcastSelectionValidator,
  resolveBroadcastAudience,
  type BroadcastSelection,
} from "./emailBroadcasts"
import {
  loadMatchedPaymentTotalsByOrderId,
  loadOrderAmountDueBreakdowns,
} from "./finance"
import {
  classifyPaymentReminder,
  automaticPeriod,
} from "../lib/domain/payment-reminders"

const settingsArgs = { eventId: v.id("events") }
const settingsValidator = v.object({
  enabled: v.boolean(),
  automaticEnabled: v.boolean(),
  dueAt: v.number(),
  timezone: v.string(),
  cadenceMinutes: v.number(),
  repeatPolicy: v.union(v.literal("oncePerPeriod"), v.literal("onceEver")),
  updatedAt: v.number(),
})

type ActiveReminderOrder = {
  order: Doc<"orders">
  recipient: string
  bookingRef: string
}

const REMINDER_BATCH_SIZE = 25
const AUTOMATIC_SETTINGS_PAGE_SIZE = 25
const AUTOMATIC_ORDER_PAGE_SIZE = 25
const SENDING_LEASE_MS = 10 * 60 * 1000

export const getSettings = query({
  args: settingsArgs,
  returns: v.union(settingsValidator, v.null()),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    return await ctx.db
      .query("eventPaymentReminderSettings")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique()
  },
})

/** Returns only bookers who currently qualify for a payment reminder. */
export const previewPaymentReminderAudience = query({
  args: {
    eventId: v.id("events"),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const event = await ctx.db.get("events", args.eventId)
    if (!event || event.primarySourceKind !== "internal") {
      throw new Error(
        "Payment reminders are only available for internal events"
      )
    }

    let audience
    try {
      audience = await resolveBroadcastAudience(
        ctx,
        args.eventId,
        {
          mode: "allMatching",
          search: args.search,
        },
        { maxRecipients: null }
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "No bookers match the selected audience"
      ) {
        return { total: 0, skippedNoEmail: 0, skippedNoRef: 0, recipients: [] }
      }
      throw error
    }

    const settings = await ctx.db
      .query("eventPaymentReminderSettings")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique()
    const eligible = await eligibleDeliveries(
      ctx,
      args.eventId,
      audience.recipients.map((recipient) => recipient.orderId),
      settings?.dueAt
    )
    const recipientByOrderId = new Map(
      audience.recipients.map((recipient) => [
        String(recipient.orderId),
        recipient,
      ])
    )
    const recipients = eligible.flatMap(({ order }) => {
      const recipient = recipientByOrderId.get(String(order._id))
      return recipient ? [recipient] : []
    })
    const requestedLimit = args.limit ?? 200
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(0, Math.min(Math.floor(requestedLimit), 200))
      : 200

    return {
      total: recipients.length,
      skippedNoEmail: audience.skippedNoEmail,
      skippedNoRef: audience.skippedNoRef,
      recipients: recipients.slice(0, limit),
    }
  },
})

export const updateSettings = mutation({
  args: {
    eventId: v.id("events"),
    enabled: v.boolean(),
    automaticEnabled: v.boolean(),
    dueAt: v.number(),
    timezone: v.string(),
    cadenceMinutes: v.number(),
    repeatPolicy: v.union(v.literal("oncePerPeriod"), v.literal("onceEver")),
  },
  returns: settingsValidator,
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    if (
      !Number.isFinite(args.dueAt) ||
      !Number.isFinite(args.cadenceMinutes) ||
      args.cadenceMinutes <= 0
    )
      throw new Error(
        "Due date and cadence must be valid; cadence must be positive"
      )
    const event = await ctx.db.get("events", args.eventId)
    if (!event || event.primarySourceKind !== "internal")
      throw new Error(
        "Payment reminders are only available for internal events"
      )
    const existing = await ctx.db
      .query("eventPaymentReminderSettings")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique()
    const value = { ...args, updatedAt: Date.now() }
    if (existing)
      await ctx.db.patch("eventPaymentReminderSettings", existing._id, value)
    else await ctx.db.insert("eventPaymentReminderSettings", value)
    return { ...value }
  },
})

async function getActiveReminderOrder(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  orderId: Id<"orders">
): Promise<ActiveReminderOrder | null> {
  const order = await ctx.db.get("orders", orderId)
  const recipient = order?.bookerEmail?.trim().toLowerCase() ?? ""
  const bookingRef = order?.bookingRef?.trim() ?? ""
  if (
    !order ||
    order.eventId !== eventId ||
    order.status === "cancelled" ||
    order.status === "refunded" ||
    order.mergedIntoOrderId ||
    !recipient ||
    !bookingRef
  )
    return null

  // A removed Ticket Tailor extension is a lifecycle removal even when the
  // core order still looks active. Read a bounded set because a corrupt
  // duplicate must fail closed rather than accidentally re-enable delivery.
  const providerRows = await ctx.db
    .query("ticketTailorOrders")
    .withIndex("orderId", (q) => q.eq("orderId", orderId))
    .take(10)
  if (providerRows.some((row) => typeof row.removedAt === "number")) return null

  return { order, recipient, bookingRef }
}

async function eligibleDeliveries(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  orderIds: Id<"orders">[],
  dueAt?: number,
  now = Date.now()
) {
  const active = (
    await Promise.all(
      orderIds.map((orderId) => getActiveReminderOrder(ctx, eventId, orderId))
    )
  ).filter((value): value is ActiveReminderOrder => value !== null)
  const due = await loadOrderAmountDueBreakdowns(
    ctx,
    active.map(({ order }) => order)
  )
  const paid = await loadMatchedPaymentTotalsByOrderId(
    ctx,
    active.map(({ order }) => order)
  )
  return active.flatMap((activeOrder) => {
    const breakdown = due.get(String(activeOrder.order._id))
    if (!breakdown) return []
    const policy = classifyPaymentReminder({
      amountDueMinor: breakdown.amountDueMinor,
      paidAmountMinor: paid.get(String(activeOrder.order._id)) ?? 0,
      dueAt,
      now,
    })
    return policy ? [{ ...activeOrder, policy }] : []
  })
}

async function scheduleManual(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">
    selection: BroadcastSelection
    authorize: boolean
  }
) {
  const identity = await requireIdentity(ctx)
  if (!args.authorize)
    throw new Error("Payment reminder requires explicit authorization")
  const event = await ctx.db.get("events", args.eventId)
  if (!event || event.primarySourceKind !== "internal")
    throw new Error("Payment reminders are only available for internal events")
  const audience = await resolveBroadcastAudience(
    ctx,
    args.eventId,
    args.selection,
    { maxRecipients: null }
  )
  const settings = await ctx.db
    .query("eventPaymentReminderSettings")
    .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
    .unique()
  const eligible = await eligibleDeliveries(
    ctx,
    args.eventId,
    audience.recipients.map((r) => r.orderId),
    settings?.dueAt
  )
  if (!eligible.length)
    throw new Error("No selected bookers have an outstanding balance")
  if (eligible.length > 2000)
    throw new Error("Audience too large (more than 2000 eligible reminders)")
  const campaignId = crypto.randomUUID()
  const period = `manual:${campaignId}`
  await ctx.db.insert("paymentReminderCampaigns", {
    eventId: args.eventId,
    campaignId,
    mode: "manual",
    period,
    createdAt: Date.now(),
    createdBy: identity.email ?? identity.subject,
  })
  for (const { order, recipient, bookingRef, policy } of eligible)
    await ctx.db.insert("paymentReminderDeliveries", {
      eventId: args.eventId,
      orderId: order._id,
      campaignId,
      kind: policy.kind,
      period,
      recipient,
      bookerName: order.bookerName ?? "Guest",
      bookingRef,
      currency: event.currency,
      amountDueMinor: policy.amountDueMinor,
      paidAmountMinor: policy.paidAmountMinor,
      outstandingAmountMinor: policy.outstandingAmountMinor,
      status: "queued",
      attempts: 0,
      createdAt: Date.now(),
    })
  await ctx.scheduler.runAfter(
    0,
    internal.paymentReminderActions.processBatch,
    { campaignId }
  )
  return {
    campaignId,
    totalRecipients: eligible.length,
    skipped: audience.recipients.length - eligible.length,
  }
}

export const scheduleManualPaymentReminders = mutation({
  args: {
    eventId: v.id("events"),
    selection: broadcastSelectionValidator,
    authorize: v.boolean(),
  },
  returns: v.object({
    campaignId: v.string(),
    totalRecipients: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    return scheduleManual(ctx, { ...args, selection: args.selection })
  },
})

// Compatibility name used by the first checkbox slice.
export const schedulePaymentReminder = mutation({
  args: {
    eventId: v.id("events"),
    selection: broadcastSelectionValidator,
    authorize: v.boolean(),
  },
  returns: v.object({
    campaignId: v.string(),
    totalRecipients: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const result = await scheduleManual(ctx, {
      ...args,
      selection: args.selection,
    })
    return {
      campaignId: result.campaignId,
      totalRecipients: result.totalRecipients,
    }
  },
})

export const getReminderHistory = query({
  args: settingsArgs,
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    return ctx.db
      .query("paymentReminderCampaigns")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .take(50)
  },
})

/** Authenticated per-delivery history for the event-scoped reminder card. */
export const getReminderDeliveryHistory = query({
  args: { eventId: v.id("events"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const requested = args.limit ?? 100
    const limit = Number.isFinite(requested)
      ? Math.max(1, Math.min(Math.floor(requested), 200))
      : 100
    return ctx.db
      .query("paymentReminderDeliveries")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .take(limit)
  },
})

export const getDeliveryContext = internalQuery({
  args: { deliveryId: v.id("paymentReminderDeliveries") },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(
      "paymentReminderDeliveries",
      args.deliveryId
    )
    if (!delivery) return null
    const event = await ctx.db.get("events", delivery.eventId)
    const active =
      event?.primarySourceKind === "internal"
        ? await getActiveReminderOrder(ctx, delivery.eventId, delivery.orderId)
        : null
    if (!event || !active) return { delivery, order: null, event: null }
    const due = await loadOrderAmountDueBreakdowns(ctx, [active.order])
    const paid = await loadMatchedPaymentTotalsByOrderId(ctx, [active.order])
    const breakdown = due.get(String(active.order._id))
    const settings = await ctx.db
      .query("eventPaymentReminderSettings")
      .withIndex("by_eventId", (q) => q.eq("eventId", delivery.eventId))
      .unique()
    const policy = breakdown
      ? classifyPaymentReminder({
          amountDueMinor: breakdown.amountDueMinor,
          paidAmountMinor: paid.get(String(active.order._id)) ?? 0,
          dueAt: settings?.dueAt,
          now: Date.now(),
        })
      : null
    return {
      delivery,
      order: active.order,
      recipient: active.recipient,
      bookingRef: active.bookingRef,
      event,
      policy,
    }
  },
})

export const getPendingDeliveries = internalQuery({
  args: { campaignId: v.string(), limit: v.number() },
  handler: async (ctx, args) =>
    ctx.db
      .query("paymentReminderDeliveries")
      .withIndex("by_campaignId_and_status", (q) =>
        q.eq("campaignId", args.campaignId).eq("status", "queued")
      )
      .take(Math.min(Math.max(args.limit, 1), REMINDER_BATCH_SIZE)),
})
export const claimPendingDeliveries = internalMutation({
  args: { campaignId: v.string(), limit: v.number() },
  handler: async (ctx, args) => {
    const batchSize = Math.min(Math.max(args.limit, 1), REMINDER_BATCH_SIZE)
    const staleBefore = Date.now() - SENDING_LEASE_MS
    const staleRows = await ctx.db
      .query("paymentReminderDeliveries")
      .withIndex("by_campaignId_and_status_and_sendingAt", (q) =>
        q
          .eq("campaignId", args.campaignId)
          .eq("status", "sending")
          .lt("sendingAt", staleBefore)
      )
      .take(batchSize)
    for (const row of staleRows) {
      await ctx.db.patch("paymentReminderDeliveries", row._id, {
        status: "queued",
        sendingAt: undefined,
      })
    }

    const rows = await ctx.db
      .query("paymentReminderDeliveries")
      .withIndex("by_campaignId_and_status", (q) =>
        q.eq("campaignId", args.campaignId).eq("status", "queued")
      )
      .take(batchSize)
    const sendingAt = Date.now()
    for (const row of rows) {
      await ctx.db.patch("paymentReminderDeliveries", row._id, {
        status: "sending",
        attempts: row.attempts + 1,
        sendingAt,
      })
    }
    return rows
  },
})
export const recordDelivery = internalMutation({
  args: {
    deliveryId: v.id("paymentReminderDeliveries"),
    status: v.union(
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    error: v.optional(v.string()),
    providerEmailId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(
      "paymentReminderDeliveries",
      args.deliveryId
    )
    if (!existing || existing.status !== "sending") return
    await ctx.db.patch("paymentReminderDeliveries", args.deliveryId, {
      status: args.status,
      error: args.error,
      providerEmailId: args.providerEmailId,
      sendingAt: undefined,
      sentAt: args.status === "sent" ? Date.now() : undefined,
    })
  },
})

export const automaticTick = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("eventPaymentReminderSettings")
      .withIndex("by_automaticEnabled", (q) => q.eq("automaticEnabled", true))
      .order("asc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.max(
          1,
          Math.min(args.paginationOpts.numItems, AUTOMATIC_SETTINGS_PAGE_SIZE)
        ),
      })
    const now = Date.now()
    for (const setting of settings.page) {
      if (!setting.enabled) continue
      const period = automaticPeriod(
        now,
        setting.cadenceMinutes,
        setting.repeatPolicy
      )
      if (!period) continue
      const event = await ctx.db.get("events", setting.eventId)
      if (!event || event.primarySourceKind !== "internal") continue
      await ctx.scheduler.runAfter(
        0,
        internal.paymentReminders.processAutomaticEvent,
        {
          eventId: setting.eventId,
          dueAt: setting.dueAt,
          period,
          paginationOpts: {
            numItems: AUTOMATIC_ORDER_PAGE_SIZE,
            cursor: null,
          },
        }
      )
    }
    if (!settings.isDone) {
      await ctx.scheduler.runAfter(0, internal.paymentReminders.automaticTick, {
        paginationOpts: {
          numItems: Math.max(
            1,
            Math.min(args.paginationOpts.numItems, AUTOMATIC_SETTINGS_PAGE_SIZE)
          ),
          cursor: settings.continueCursor,
        },
      })
    }
    return { processed: settings.page.length, isDone: settings.isDone }
  },
})

export const processAutomaticEvent = internalMutation({
  args: {
    eventId: v.id("events"),
    dueAt: v.number(),
    period: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId)
    if (!event || event.primarySourceKind !== "internal") return null

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .order("asc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.max(
          1,
          Math.min(args.paginationOpts.numItems, AUTOMATIC_ORDER_PAGE_SIZE)
        ),
      })
    const eligible = await eligibleDeliveries(
      ctx,
      args.eventId,
      orders.page.map((order) => order._id),
      args.dueAt
    )
    const campaignId = `automatic:${String(args.eventId)}:${args.period}`
    for (const { order, recipient, bookingRef, policy } of eligible) {
      const existing = await ctx.db
        .query("paymentReminderDeliveries")
        .withIndex("by_idempotency_period", (q) =>
          q
            .eq("eventId", args.eventId)
            .eq("orderId", order._id)
            .eq("period", args.period)
        )
        .first()
      if (existing) continue
      await ctx.db.insert("paymentReminderDeliveries", {
        eventId: args.eventId,
        orderId: order._id,
        campaignId,
        kind: policy.kind,
        period: args.period,
        recipient,
        bookerName: order.bookerName ?? "Guest",
        bookingRef,
        currency: event.currency,
        amountDueMinor: policy.amountDueMinor,
        paidAmountMinor: policy.paidAmountMinor,
        outstandingAmountMinor: policy.outstandingAmountMinor,
        status: "queued",
        attempts: 0,
        createdAt: Date.now(),
      })
    }

    if (!orders.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.paymentReminders.processAutomaticEvent,
        {
          eventId: args.eventId,
          dueAt: args.dueAt,
          period: args.period,
          paginationOpts: {
            numItems: Math.max(
              1,
              Math.min(args.paginationOpts.numItems, AUTOMATIC_ORDER_PAGE_SIZE)
            ),
            cursor: orders.continueCursor,
          },
        }
      )
    } else {
      // The atomic claim mutation makes this safe even if two cron runs overlap.
      await ctx.scheduler.runAfter(
        0,
        internal.paymentReminderActions.processBatch,
        { campaignId }
      )
    }
    return { processed: orders.page.length, isDone: orders.isDone }
  },
})
