import { internalMutation, internalQuery } from "../_generated/server"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { loadOrderAmountDueBreakdowns } from "../finance"

// Internal queries for autoSync.ts and other actions
// These run without auth since they're called from system-level actions

export const internalGetUnassignedPayments = internalQuery({
  args: {
    eventIds: v.optional(v.array(v.id("events"))),
    paginationOpts: v.optional(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    if (!args.eventIds) {
      const query = ctx.db
        .query("payments")
        .withIndex("status", (q) => q.eq("status", "unassigned"))
      if (args.paginationOpts) {
        const result = await query.paginate(args.paginationOpts)
        return {
          ...result,
          page: result.page.map((p) => ({
            _id: p._id,
            payerName: p.payerName,
            amountMinor: p.amountMinor,
          })),
        }
      }
      return (await query.take(500)).map((p) => ({
        _id: p._id,
        payerName: p.payerName,
        amountMinor: p.amountMinor,
      }))
    }
    const pages = await Promise.all(
      args.eventIds.map((eventId) =>
        ctx.db
          .query("payments")
          .withIndex("by_eventId_and_status_and_source", (q) =>
            q
              .eq("eventId", eventId)
              .eq("status", "unassigned")
              .eq("source", "tikkie")
          )
          .take(500)
      )
    )
    return pages.flat().map((p) => ({
      _id: p._id,
      eventId: p.eventId,
      payerName: p.payerName,
      payerAccountNumber: p.payerAccountNumber,
      amountMinor: p.amountMinor,
    }))
  },
})

export const internalGetPaidOrders = internalQuery({
  args: {
    eventIds: v.optional(v.array(v.id("events"))),
    includeAmountDue: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Signup orders start with an unset status, so treat every active order
    // as a match candidate and let payment matching decide whether it fits.
    const orders = args.eventIds
      ? (
          await Promise.all(
            args.eventIds.map((eventId) =>
              ctx.db
                .query("orders")
                .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
                .take(500)
            )
          )
        ).flat()
      : await ctx.db.query("orders").order("desc").take(500)
    const activeOrders = orders.filter(
      (order) => order.status !== "cancelled" && order.status !== "refunded"
    )

    const amountDueBreakdownsByOrderId =
      args.includeAmountDue === false
        ? null
        : await loadOrderAmountDueBreakdowns(ctx, activeOrders)

    const accountNumbersByOrder = new Map<string, string[]>()
    for (const order of activeOrders) {
      const payments = await ctx.db
        .query("payments")
        .withIndex("orderId", (q) => q.eq("orderId", String(order._id)))
        .take(100)
      accountNumbersByOrder.set(
        String(order._id),
        payments
          .filter(
            (payment) =>
              payment.source === "tikkie" && payment.payerAccountNumber
          )
          .map((payment) => payment.payerAccountNumber as string)
      )
    }

    return activeOrders.map((o) => ({
      _id: o._id,
      eventId: o.eventId,
      bookerName: o.bookerName ?? null,
      totalAmountMinor: o.totalAmountMinor ?? null,
      amountDueMinor:
        amountDueBreakdownsByOrderId?.get(String(o._id))?.amountDueMinor ??
        (args.includeAmountDue === false ? null : o.totalAmountMinor ?? null),
      payerAccountNumbers: accountNumbersByOrder.get(String(o._id)) ?? [],
    }))
  },
})

export const internalGetAmountDueByOrderIds = internalQuery({
  args: {
    orderIds: v.array(v.id("orders")),
  },
  handler: async (ctx, args) => {
    const uniqueOrderIds = [...new Set(args.orderIds)]
    const orders = (
      await Promise.all(uniqueOrderIds.map((orderId) => ctx.db.get("orders", orderId)))
    ).filter((order): order is NonNullable<typeof order> => order !== null)

    const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      ctx,
      orders
    )

    return orders.map((order) => ({
      _id: order._id,
      amountDueMinor:
        amountDueBreakdownsByOrderId.get(String(order._id))?.amountDueMinor ??
        order.totalAmountMinor ??
        null,
    }))
  },
})

export const internalGetAttendeesByOrder = internalQuery({
  args: { orderIds: v.array(v.id("orders")) },
  handler: async (ctx, args) => {
    // Only load attendees belonging to the order candidates used by this run.
    // The previous table scan reread unrelated orders on every cron execution.
    const entries = await Promise.all(
      args.orderIds.map(async (orderId) => {
        const names: string[] = []
        for await (const attendee of ctx.db
          .query("orderAttendees")
          .withIndex("by_orderId", (q) => q.eq("orderId", orderId))) {
          const name = attendee.name.trim()
          if (name) names.push(name.toLowerCase())
        }
        return [String(orderId), names] as const
      })
    )

    return Object.fromEntries(entries)
  },
})

export const internalGetTikkiePaymentLinks = internalQuery({
  args: {},
  handler: async (ctx) => {
    const candidates = await Promise.all(
      (["created", "paid"] as const).map((status) =>
        ctx.db
          .query("tikkiePaymentLinks")
          .withIndex("by_linkType_and_status_and_statusUpdatedAt", (q) =>
            q.eq("linkType", "event").eq("status", status)
          )
          .order("desc")
          .take(100)
      )
    )

    const now = Date.now()
    return candidates
      .flat()
      .filter((link) => !link.expiryDate || link.expiryDate > now)
      .sort(
        (a, b) =>
          (b.statusUpdatedAt ?? b._creationTime ?? 0) -
          (a.statusUpdatedAt ?? a._creationTime ?? 0)
      )
      .slice(0, 50)
  },
})

export const internalMarkTikkiePaymentLinkChecked = internalMutation({
  args: {
    linkId: v.id("tikkiePaymentLinks"),
    checkedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db.get("tikkiePaymentLinks", args.linkId)
    if (!link) return null

    if ((link.providerLastCheckedAt ?? 0) >= args.checkedAt) {
      return link._id
    }

    await ctx.db.patch("tikkiePaymentLinks", link._id, {
      providerLastCheckedAt: args.checkedAt,
    })
    return link._id
  },
})
