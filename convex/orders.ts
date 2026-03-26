import { query, mutation } from "./_generated/server"
import { v } from "convex/values"

export const getOrders = query({
  args: {
    eventId: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("paid"),
        v.literal("refunded"),
        v.literal("cancelled"),
        v.literal("pending")
      )
    ),
  },
  handler: async (ctx, args) => {
    if (args.eventId) {
      const orders = await ctx.db
        .query("ticketTailorOrders")
        .withIndex("eventId", (q) => q.eq("eventId", args.eventId!))
        .collect()

      if (args.status) {
        return orders.filter((o) => o.normalizedStatus === args.status)
      }
      return orders
    }

    const orders = await ctx.db.query("ticketTailorOrders").collect()

    if (args.status) {
      return orders.filter((o) => o.normalizedStatus === args.status)
    }
    return orders
  },
})

export const getOrderById = query({
  args: { orderId: v.string() },
  handler: async (ctx, args) => {
    try {
      return await ctx.db.get("ticketTailorOrders", args.orderId as any)
    } catch {
      return null
    }
  },
})

export const getOrderByProviderId = query({
  args: { providerOrderId: v.string() },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("providerOrderId", (q) =>
        q.eq("providerOrderId", args.providerOrderId)
      )
      .collect()
    return orders[0] ?? null
  },
})

export const getOrderLedger = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("eventId", (q) => q.eq("eventId", args.eventId))
      .collect()

    const ordersWithAttendees = await Promise.all(
      orders.map(async (order) => {
        const attendees = await ctx.db
          .query("ticketTailorAttendees")
          .withIndex("orderId", (q) => q.eq("orderId", order._id))
          .collect()
        return { ...order, attendees }
      })
    )

    return ordersWithAttendees
  },
})

export const createOrder = mutation({
  args: {
    providerOrderId: v.string(),
    providerEventId: v.string(),
    eventId: v.string(),
    normalizedStatus: v.optional(
      v.union(
        v.literal("paid"),
        v.literal("refunded"),
        v.literal("cancelled"),
        v.literal("pending")
      )
    ),
    providerStatus: v.optional(v.string()),
    buyerEmail: v.optional(v.string()),
    buyerName: v.optional(v.string()),
    currency: v.optional(v.string()),
    totalAmountMinor: v.optional(v.number()),
    orderedAt: v.optional(v.number()),
    rawPayload: v.any(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("ticketTailorOrders", args)
    return id
  },
})

export const upsertOrder = mutation({
  args: {
    providerOrderId: v.string(),
    providerEventId: v.string(),
    eventId: v.string(),
    normalizedStatus: v.optional(
      v.union(
        v.literal("paid"),
        v.literal("refunded"),
        v.literal("cancelled"),
        v.literal("pending")
      )
    ),
    providerStatus: v.optional(v.string()),
    buyerEmail: v.optional(v.string()),
    buyerName: v.optional(v.string()),
    currency: v.optional(v.string()),
    totalAmountMinor: v.optional(v.number()),
    orderedAt: v.optional(v.number()),
    rawPayload: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("providerOrderId", (q) =>
        q.eq("providerOrderId", args.providerOrderId)
      )
      .collect()

    if (existing[0]) {
      await ctx.db.patch("ticketTailorOrders", existing[0]._id, args)
      return existing[0]._id
    }

    return await ctx.db.insert("ticketTailorOrders", args)
  },
})

export const updateOrderStatus = mutation({
  args: {
    orderId: v.id("ticketTailorOrders"),
    normalizedStatus: v.union(
      v.literal("paid"),
      v.literal("refunded"),
      v.literal("cancelled"),
      v.literal("pending")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("ticketTailorOrders", args.orderId, {
      normalizedStatus: args.normalizedStatus,
      refundedAt: args.normalizedStatus === "refunded" ? Date.now() : undefined,
      cancelledAt:
        args.normalizedStatus === "cancelled" ? Date.now() : undefined,
    })
    return args.orderId
  },
})

export const getOrdersWithFilters = query({
  args: {
    eventId: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("paid"),
        v.literal("refunded"),
        v.literal("cancelled"),
        v.literal("pending")
      )
    ),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let orders = await ctx.db.query("ticketTailorOrders").collect()

    if (args.eventId) {
      orders = orders.filter((o) => o.eventId === args.eventId)
    }

    if (args.from !== undefined) {
      orders = orders.filter((o) => o.orderedAt && o.orderedAt >= args.from!)
    }

    if (args.to !== undefined) {
      orders = orders.filter((o) => o.orderedAt && o.orderedAt <= args.to!)
    }

    if (args.status) {
      orders = orders.filter((o) => o.normalizedStatus === args.status)
    }

    orders.sort((a, b) => {
      const aTime = a.orderedAt ?? a._creationTime
      const bTime = b.orderedAt ?? b._creationTime
      return bTime - aTime
    })

    const page = args.page ?? 1
    const pageSize = args.pageSize ?? 25
    const totalRows = orders.length
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
    const skip = (page - 1) * pageSize
    const paginatedOrders = orders.slice(skip, skip + pageSize)

    const ordersWithEvent = await Promise.all(
      paginatedOrders.map(async (order) => {
        let eventName: string | null = null
        try {
          const event = await ctx.db.get(
            "ticketTailorEvents",
            order.eventId as any
          )
          eventName = event?.name ?? null
        } catch {
          // Event not found
        }
        return {
          providerOrderId: order.providerOrderId,
          providerEventId: order.providerEventId,
          eventId: order.eventId,
          eventName,
          normalizedStatus: order.normalizedStatus,
          totalAmountMinor: order.totalAmountMinor ?? 0,
          currency: order.currency ?? null,
          orderedAt: order.orderedAt
            ? new Date(order.orderedAt).toISOString()
            : null,
          buyerName: order.buyerName ?? null,
          buyerEmail: order.buyerEmail ?? null,
        }
      })
    )

    return {
      totalRows,
      totalPages,
      orders: ordersWithEvent,
    }
  },
})

export const getOrderCount = query({
  args: {
    eventId: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("paid"),
        v.literal("refunded"),
        v.literal("cancelled"),
        v.literal("pending")
      )
    ),
  },
  handler: async (ctx, args) => {
    let orders = await ctx.db.query("ticketTailorOrders").collect()

    if (args.eventId) {
      orders = orders.filter((o) => o.eventId === args.eventId)
    }

    if (args.from !== undefined) {
      orders = orders.filter((o) => o.orderedAt && o.orderedAt >= args.from!)
    }

    if (args.to !== undefined) {
      orders = orders.filter((o) => o.orderedAt && o.orderedAt <= args.to!)
    }

    if (args.status) {
      orders = orders.filter((o) => o.normalizedStatus === args.status)
    }

    return orders.length
  },
})

export const getOrdersForReconciliation = query({
  args: {
    eventId: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("paid"),
        v.literal("refunded"),
        v.literal("cancelled"),
        v.literal("pending")
      )
    ),
  },
  handler: async (ctx, args) => {
    let orders = await ctx.db.query("ticketTailorOrders").collect()

    if (args.eventId) {
      orders = orders.filter((o) => o.eventId === args.eventId)
    }

    if (args.from !== undefined) {
      orders = orders.filter((o) => o.orderedAt && o.orderedAt >= args.from!)
    }

    if (args.to !== undefined) {
      orders = orders.filter((o) => o.orderedAt && o.orderedAt <= args.to!)
    }

    if (args.status) {
      orders = orders.filter((o) => o.normalizedStatus === args.status)
    }

    orders.sort((a, b) => {
      const aTime = a.orderedAt ?? a._creationTime
      const bTime = b.orderedAt ?? b._creationTime
      return bTime - aTime
    })

    const ordersWithEvent = await Promise.all(
      orders.map(async (order) => {
        let eventName: string | null = null
        try {
          const event = await ctx.db.get(
            "ticketTailorEvents",
            order.eventId as any
          )
          eventName = event?.name ?? null
        } catch {
          // Event not found
        }
        return {
          providerOrderId: order.providerOrderId,
          providerEventId: order.providerEventId,
          eventId: order.eventId,
          eventName,
          normalizedStatus: order.normalizedStatus,
          totalAmountMinor: order.totalAmountMinor ?? 0,
          currency: order.currency ?? null,
          orderedAt: order.orderedAt
            ? new Date(order.orderedAt).toISOString()
            : null,
          refundedAt: order.refundedAt
            ? new Date(order.refundedAt).toISOString()
            : null,
          buyerName: order.buyerName ?? null,
          buyerEmail: order.buyerEmail ?? null,
        }
      })
    )

    return ordersWithEvent
  },
})

export const searchOrders = query({
  args: {
    search: v.string(),
    eventId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 50)
    const search = args.search.trim().toLowerCase()

    let orders = await ctx.db.query("ticketTailorOrders").collect()

    if (args.eventId) {
      orders = orders.filter((o) => o.providerEventId === args.eventId)
    }

    if (search) {
      orders = orders.filter(
        (o) =>
          (o.buyerName && o.buyerName.toLowerCase().includes(search)) ||
          (o.providerOrderId &&
            o.providerOrderId.toLowerCase().includes(search))
      )
    }

    orders.sort((a, b) => {
      const aTime = a.orderedAt ?? a._creationTime
      const bTime = b.orderedAt ?? b._creationTime
      return bTime - aTime
    })

    return orders.slice(0, limit).map((order) => ({
      id: order._id,
      providerOrderId: order.providerOrderId,
      buyerName: order.buyerName ?? null,
      totalAmountMinor: order.totalAmountMinor ?? 0,
    }))
  },
})

export const getOrderWithAttendeesByProviderId = query({
  args: {
    providerOrderId: v.string(),
    providerEventId: v.string(),
  },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("providerOrderId", (q) =>
        q.eq("providerOrderId", args.providerOrderId)
      )
      .collect()

    const order = orders.find((o) => o.providerEventId === args.providerEventId)
    if (!order) return null

    const attendees = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("orderId", (q) => q.eq("orderId", order._id))
      .collect()

    return {
      order: {
        id: order._id,
        providerOrderId: order.providerOrderId,
        normalizedStatus: order.normalizedStatus,
        totalAmountMinor: order.totalAmountMinor,
        orderedAt: order.orderedAt
          ? new Date(order.orderedAt).toISOString()
          : null,
      },
      attendees: attendees.map((a) => ({
        id: a._id,
        name: a.name ?? "Unnamed attendee",
        ticketTypeLabel: a.ticketTypeLabel ?? "-",
        normalizedStatus: a.ticketStatus ?? "pending",
      })),
    }
  },
})

export const getOrderPaymentStatus = query({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db.query("ticketTailorOrders").collect()
    const payments = await ctx.db.query("payments").collect()

    const paymentsByOrder: Record<string, number> = {}
    for (const payment of payments) {
      if (payment.orderId) {
        paymentsByOrder[payment.orderId] =
          (paymentsByOrder[payment.orderId] ?? 0) + payment.amountMinor
      }
    }

    const statusCounts = {
      unassigned: 0,
      partial: 0,
      paid: 0,
      overpaid: 0,
    }

    let totalPaidAmount = 0

    for (const order of orders) {
      const orderTotal = order.totalAmountMinor ?? 0
      if (orderTotal <= 0) continue

      const paidAmount = paymentsByOrder[order._id] ?? 0
      totalPaidAmount += paidAmount

      if (paidAmount === 0) {
        statusCounts.unassigned++
      } else if (paidAmount >= orderTotal) {
        if (paidAmount > orderTotal) {
          statusCounts.overpaid++
        } else {
          statusCounts.paid++
        }
      } else {
        statusCounts.partial++
      }
    }

    const tikkieCount = payments.filter((p) => p.source === "tikkie").length
    const bankTransferCount = payments.filter(
      (p) => p.source === "bank_transfer"
    ).length
    const cashCount = payments.filter((p) => p.source === "cash").length

    const unassignedPayments = payments.filter(
      (p) => p.status === "unassigned"
    ).length
    const ambiguousPayments = payments.filter(
      (p) => p.status === "ambiguous"
    ).length
    const manualAssignment = payments.filter(
      (p) => p.status === "manual_assignment"
    ).length
    const autoMatched = payments.filter(
      (p) => p.status === "auto_matched"
    ).length

    return {
      summary: {
        ...statusCounts,
        totalOrders: orders.filter((o) => (o.totalAmountMinor ?? 0) > 0).length,
      },
      totalAmountMinor: totalPaidAmount,
      bySource: {
        tikkie: tikkieCount,
        bank_transfer: bankTransferCount,
        cash: cashCount,
      },
      legacyPaymentStatus: {
        unassigned: unassignedPayments,
        ambiguous: ambiguousPayments,
        manual_assignment: manualAssignment,
        auto_matched: autoMatched,
      },
    }
  },
})
