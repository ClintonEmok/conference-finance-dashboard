import { internalQuery } from "../_generated/server"
import { v } from "convex/values"
import { loadOrderAmountDueBreakdowns } from "../finance"

// Internal queries for autoSync.ts and other actions
// These run without auth since they're called from system-level actions

export const internalGetUnassignedPayments = internalQuery({
  args: { eventIds: v.array(v.id("events")) },
  handler: async (ctx, args) => {
    const pages = await Promise.all(args.eventIds.map((eventId) =>
      ctx.db
        .query("payments")
        .withIndex("by_eventId_and_status_and_source", (q) =>
          q.eq("eventId", eventId).eq("status", "unassigned").eq("source", "tikkie")
        )
        .take(500)
    ))
    const payments = pages.flat()
    return payments.map((p) => ({
      _id: p._id,
      eventId: p.eventId,
      payerName: p.payerName,
      payerAccountNumber: p.payerAccountNumber,
      amountMinor: p.amountMinor,
    }))
  },
})

export const internalGetPaidOrders = internalQuery({
  args: { eventIds: v.array(v.id("events")) },
  handler: async (ctx, args) => {
    const orders = (
      await Promise.all(args.eventIds.map((eventId) =>
        ctx.db.query("orders").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).take(500)
      ))
    ).flat()
    const activeOrders = orders.filter(
      (order) => order.status !== "cancelled" && order.status !== "refunded"
    )
    const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(ctx, activeOrders)
    const accountNumbersByOrder = new Map<string, string[]>()
    for (const order of activeOrders) {
      const payments = await ctx.db.query("payments")
        .withIndex("orderId", (q) => q.eq("orderId", String(order._id))).take(100)
      accountNumbersByOrder.set(String(order._id), payments
        .filter((payment) => payment.source === "tikkie" && payment.payerAccountNumber)
        .map((payment) => payment.payerAccountNumber as string))
    }
    return activeOrders.map((o) => ({
      _id: o._id,
      eventId: o.eventId,
      bookerName: o.bookerName ?? null,
      totalAmountMinor: o.totalAmountMinor ?? null,
      amountDueMinor: amountDueBreakdownsByOrderId.get(String(o._id))?.amountDueMinor ?? o.totalAmountMinor ?? null,
      payerAccountNumbers: accountNumbersByOrder.get(String(o._id)) ?? [],
    }))
  },
})

export const internalGetAttendeesByOrder = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Query orderAttendees table instead of ticketTailorAttendees
    const attendees = await ctx.db.query("orderAttendees").take(5000)
    const byOrder = new Map<string, string[]>()
    for (const att of attendees) {
      if (!att.name) continue
      const orderId = att.orderId
      const existing = byOrder.get(orderId) ?? []
      existing.push(att.name.toLowerCase().trim())
      byOrder.set(orderId, existing)
    }
    return Object.fromEntries(byOrder)
  },
})

export const internalGetTikkiePaymentLinks = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tikkiePaymentLinks").collect()
  },
})
