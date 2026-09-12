import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { requireIdentity } from "./auth"
import { broadcastSelectionValidator, MAX_BROADCAST_RECIPIENTS, resolveBroadcastAudience } from "./emailBroadcasts"
import { loadMatchedPaymentTotalsByOrderId, loadOrderAmountDueBreakdowns } from "./finance"
import { classifyPaymentReminder, automaticPeriod } from "../lib/domain/payment-reminders"

const settingsArgs = { eventId: v.id("events") }
const settingsValidator = v.object({ enabled: v.boolean(), automaticEnabled: v.boolean(), dueAt: v.number(), timezone: v.string(), cadenceMinutes: v.number(), repeatPolicy: v.union(v.literal("oncePerPeriod"), v.literal("onceEver")), updatedAt: v.number() })

export const getSettings = query({ args: settingsArgs, returns: v.union(settingsValidator, v.null()), handler: async (ctx, args) => {
  await requireIdentity(ctx)
  return await ctx.db.query("eventPaymentReminderSettings").withIndex("by_eventId", q => q.eq("eventId", args.eventId)).unique()
} })

export const updateSettings = mutation({ args: { eventId: v.id("events"), enabled: v.boolean(), automaticEnabled: v.boolean(), dueAt: v.number(), timezone: v.string(), cadenceMinutes: v.number(), repeatPolicy: v.union(v.literal("oncePerPeriod"), v.literal("onceEver")) }, returns: settingsValidator, handler: async (ctx, args) => {
  await requireIdentity(ctx)
  if (!Number.isFinite(args.dueAt) || !Number.isFinite(args.cadenceMinutes) || args.cadenceMinutes <= 0) throw new Error("Due date and cadence must be valid; cadence must be positive")
  const event = await ctx.db.get("events", args.eventId)
  if (!event || event.primarySourceKind !== "internal") throw new Error("Payment reminders are only available for internal events")
  const existing = await ctx.db.query("eventPaymentReminderSettings").withIndex("by_eventId", q => q.eq("eventId", args.eventId)).unique()
  const value = { ...args, updatedAt: Date.now() }
  if (existing) await ctx.db.patch("eventPaymentReminderSettings", existing._id, value)
  else await ctx.db.insert("eventPaymentReminderSettings", value)
  return { ...value }
} })

async function eligibleDeliveries(ctx: QueryCtx | MutationCtx, eventId: Id<"events">, orderIds: Id<"orders">[], dueAt?: number, now = Date.now()) {
  const orders = (await Promise.all(orderIds.map(id => ctx.db.get("orders", id)))).filter((o): o is NonNullable<typeof o> => Boolean(o && o.eventId === eventId && o.status !== "cancelled" && !o.mergedIntoOrderId && o.bookerEmail?.trim() && o.bookingRef?.trim()))
  const removed = await Promise.all(orders.map(async order => { const row = await ctx.db.query("ticketTailorOrders").withIndex("orderId", q => q.eq("orderId", order._id)).first(); return [order, typeof row?.removedAt === "number"] as const }))
  const active = removed.filter(([, isRemoved]) => !isRemoved).map(([order]) => order)
  const due = await loadOrderAmountDueBreakdowns(ctx, active)
  const paid = await loadMatchedPaymentTotalsByOrderId(ctx, active)
  return active.flatMap(order => { const breakdown = due.get(String(order._id)); if (!breakdown) return []; const policy = classifyPaymentReminder({ amountDueMinor: breakdown.amountDueMinor, paidAmountMinor: paid.get(String(order._id)) ?? 0, dueAt, now }); return policy ? [{ order, policy }] : [] })
}

async function scheduleManual(ctx: MutationCtx, args: { eventId: Id<"events">; selection: { mode: "explicit"; orderIds: Id<"orders">[] }; authorize: boolean }) {
  const identity = await requireIdentity(ctx)
  if (!args.authorize) throw new Error("Payment reminder requires explicit authorization")
  if (args.selection.mode !== "explicit") throw new Error("Manual reminders require explicit order selection")
  if (args.selection.orderIds.length > MAX_BROADCAST_RECIPIENTS) throw new Error("Audience exceeds the maximum recipient limit")
  const event = await ctx.db.get("events", args.eventId)
  if (!event || event.primarySourceKind !== "internal") throw new Error("Payment reminders are only available for internal events")
  const audience = await resolveBroadcastAudience(ctx, args.eventId, args.selection)
  const settings = await ctx.db.query("eventPaymentReminderSettings").withIndex("by_eventId", q => q.eq("eventId", args.eventId)).unique()
  const eligible = await eligibleDeliveries(ctx, args.eventId, audience.recipients.map(r => r.orderId), settings?.dueAt)
  if (!eligible.length) throw new Error("No selected bookers have an outstanding balance")
  const campaignId = crypto.randomUUID()
  const period = `manual:${campaignId}`
  await ctx.db.insert("paymentReminderCampaigns", { eventId: args.eventId, campaignId, mode: "manual", period, createdAt: Date.now(), createdBy: identity.email ?? identity.subject })
  for (const { order, policy } of eligible) await ctx.db.insert("paymentReminderDeliveries", { eventId: args.eventId, orderId: order._id, campaignId, kind: policy.kind, period, recipient: order.bookerEmail!.trim().toLowerCase(), bookerName: order.bookerName ?? "Guest", bookingRef: order.bookingRef!.trim(), currency: event.currency, amountDueMinor: policy.amountDueMinor, paidAmountMinor: policy.paidAmountMinor, outstandingAmountMinor: policy.outstandingAmountMinor, status: "queued", attempts: 0, createdAt: Date.now() })
  await ctx.scheduler.runAfter(0, internal.paymentReminderActions.processBatch, { campaignId })
  return { campaignId, totalRecipients: eligible.length, skipped: audience.recipients.length - eligible.length }
}

export const scheduleManualPaymentReminders = mutation({ args: { eventId: v.id("events"), selection: broadcastSelectionValidator, authorize: v.boolean() }, returns: v.object({ campaignId: v.string(), totalRecipients: v.number(), skipped: v.number() }), handler: async (ctx, args) => {
  if (args.selection.mode !== "explicit") throw new Error("Manual reminders require explicit order selection")
  return scheduleManual(ctx, { ...args, selection: args.selection })
} })

// Compatibility name used by the first checkbox slice.
export const schedulePaymentReminder = mutation({ args: { eventId: v.id("events"), selection: broadcastSelectionValidator, authorize: v.boolean() }, handler: async (ctx, args) => {
  await requireIdentity(ctx)
  if (args.selection.mode !== "explicit") throw new Error("Manual reminders require explicit order selection")
  const result = await scheduleManual(ctx, { ...args, selection: args.selection })
  return { broadcastId: result.campaignId as Id<"emailBroadcasts">, totalRecipients: result.totalRecipients }
} })

export const getReminderHistory = query({ args: settingsArgs, handler: async (ctx, args) => { await requireIdentity(ctx); return ctx.db.query("paymentReminderCampaigns").withIndex("by_eventId", q => q.eq("eventId", args.eventId)).order("desc").take(50) } })

export const getDeliveryContext = internalQuery({ args: { deliveryId: v.id("paymentReminderDeliveries") }, handler: async (ctx, args) => {
  const delivery = await ctx.db.get("paymentReminderDeliveries", args.deliveryId); if (!delivery) return null
  const order = await ctx.db.get("orders", delivery.orderId); const event = await ctx.db.get("events", delivery.eventId); if (!order || !event || !order.bookerEmail || !order.bookingRef || order.status === "cancelled" || order.mergedIntoOrderId) return { delivery, order: null, event: null }
  const due = await loadOrderAmountDueBreakdowns(ctx, [order]); const paid = await loadMatchedPaymentTotalsByOrderId(ctx, [order]); const breakdown = due.get(String(order._id)); const settings = await ctx.db.query("eventPaymentReminderSettings").withIndex("by_eventId", q => q.eq("eventId", delivery.eventId)).unique(); const policy = breakdown ? classifyPaymentReminder({ amountDueMinor: breakdown.amountDueMinor, paidAmountMinor: paid.get(String(order._id)) ?? 0, dueAt: settings?.dueAt, now: Date.now() }) : null
  return { delivery, order, event, policy }
} })

export const getPendingDeliveries = internalQuery({ args: { campaignId: v.string(), limit: v.number() }, handler: async (ctx, args) => ctx.db.query("paymentReminderDeliveries").withIndex("by_campaignId", q => q.eq("campaignId", args.campaignId)).take(Math.min(args.limit, 25)).then(rows => rows.filter(row => row.status === "queued")) })
export const markDeliverySending = internalMutation({ args: { deliveryId: v.id("paymentReminderDeliveries") }, handler: async (ctx, args) => { const row = await ctx.db.get("paymentReminderDeliveries", args.deliveryId); await ctx.db.patch("paymentReminderDeliveries", args.deliveryId, { status: "sending", attempts: (row?.attempts ?? 0) + 1 }) } })
export const recordDelivery = internalMutation({ args: { deliveryId: v.id("paymentReminderDeliveries"), status: v.union(v.literal("sent"), v.literal("failed"), v.literal("skipped")), error: v.optional(v.string()), providerEmailId: v.optional(v.string()) }, handler: async (ctx, args) => { await ctx.db.patch("paymentReminderDeliveries", args.deliveryId, { status: args.status, error: args.error, providerEmailId: args.providerEmailId, sentAt: args.status === "sent" ? Date.now() : undefined }) } })

export const automaticTick = internalMutation({ args: {}, handler: async ctx => {
  const settings = await ctx.db.query("eventPaymentReminderSettings").withIndex("by_automaticEnabled", q => q.eq("automaticEnabled", true)).take(100)
  for (const setting of settings) { if (!setting.enabled) continue; const period = automaticPeriod(Date.now(), setting.cadenceMinutes, setting.repeatPolicy); if (!period) continue; const orders = await ctx.db.query("orders").withIndex("by_eventId", q => q.eq("eventId", setting.eventId)).take(100); const eligible = await eligibleDeliveries(ctx, setting.eventId, orders.map(o => o._id), setting.dueAt); for (const { order, policy } of eligible) { const kind = policy.kind; const existing = await ctx.db.query("paymentReminderDeliveries").withIndex("by_idempotency", q => q.eq("eventId", setting.eventId).eq("orderId", order._id).eq("kind", kind).eq("period", period)).unique(); if (existing) continue; const campaignId = `automatic:${setting.eventId}:${period}`; await ctx.db.insert("paymentReminderDeliveries", { eventId: setting.eventId, orderId: order._id, campaignId, kind, period, recipient: order.bookerEmail!.trim().toLowerCase(), bookerName: order.bookerName ?? "Guest", bookingRef: order.bookingRef!.trim(), currency: (await ctx.db.get("events", setting.eventId))!.currency, amountDueMinor: policy.amountDueMinor, paidAmountMinor: policy.paidAmountMinor, outstandingAmountMinor: policy.outstandingAmountMinor, status: "queued", attempts: 0, createdAt: Date.now() }); await ctx.scheduler.runAfter(0, internal.paymentReminderActions.processBatch, { campaignId }) } }
  return null
} })
