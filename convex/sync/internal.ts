import { internalQuery } from "../_generated/server"
import { loadOrderAmountDueBreakdowns } from "../finance"

// Internal queries for autoSync.ts and other actions
// These run without auth since they're called from system-level actions

export const internalGetUnassignedPayments = internalQuery({
  args: {},
  handler: async (ctx) => {
    const payments = await ctx.db
      .query("payments")
      .withIndex("status", (q) => q.eq("status", "unassigned"))
      .collect()
    return payments.map((p) => ({
      _id: p._id,
      payerName: p.payerName,
      amountMinor: p.amountMinor,
    }))
  },
})

export const internalGetPaidOrders = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Signup orders start with an unset status, so treat every active order
    // as a match candidate and let payment matching decide whether it fits.
    const orders = await ctx.db.query("orders").order("desc").take(500)

    const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      ctx,
      orders
    )

    return orders
      .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
      .map((o) => ({
        _id: o._id,
        eventId: o.eventId,
        bookerName: o.bookerName ?? null,
        totalAmountMinor: o.totalAmountMinor ?? null,
        amountDueMinor:
          amountDueBreakdownsByOrderId.get(String(o._id))?.amountDueMinor ??
          o.totalAmountMinor ??
          null,
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
