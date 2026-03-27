import { query, mutation, type QueryCtx } from "./_generated/server"
import { v } from "convex/values"

function isOrderRemoved(order: any) {
  return typeof order?.removedAt === "number"
}

function isOrderVisible(order: any) {
  return !isOrderRemoved(order)
}

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
      const visibleOrders = orders.filter(isOrderVisible)

      if (args.status) {
        return visibleOrders.filter((o) => o.normalizedStatus === args.status)
      }
      return visibleOrders
    }

    const orders = (await ctx.db.query("ticketTailorOrders").collect()).filter(
      isOrderVisible
    )

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
      const orderId = ctx.db.normalizeId("ticketTailorOrders", args.orderId)
      if (!orderId) {
        return null
      }

      const order = await ctx.db.get("ticketTailorOrders", orderId)
      return order && isOrderVisible(order) ? order : null
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
    return orders.find(isOrderVisible) ?? null
  },
})

export const getOrderLedger = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("eventId", (q) => q.eq("eventId", args.eventId))
      .collect()
    const visibleOrders = orders.filter(isOrderVisible)

    const ordersWithAttendees = await Promise.all(
      visibleOrders.map(async (order) => {
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

const canonicalOrderStatusValidator = v.union(
  v.literal("paid"),
  v.literal("refunded"),
  v.literal("cancelled"),
  v.literal("pending")
)

const nullableStringValidator = v.union(v.string(), v.null())

const orderLedgerRowValidator = v.object({
  providerOrderId: v.string(),
  providerEventId: v.string(),
  eventId: v.string(),
  eventName: nullableStringValidator,
  normalizedStatus: canonicalOrderStatusValidator,
  isArchived: v.boolean(),
  archivedAt: nullableStringValidator,
  archiveReason: nullableStringValidator,
  totalAmountMinor: v.number(),
  currency: nullableStringValidator,
  orderedAt: nullableStringValidator,
  refundedAt: nullableStringValidator,
  buyerName: nullableStringValidator,
  buyerEmail: nullableStringValidator,
})

const orderSearchRowValidator = v.object({
  id: v.id("ticketTailorOrders"),
  providerOrderId: v.string(),
  buyerName: nullableStringValidator,
  totalAmountMinor: v.number(),
})

type CandidateOrder = {
  _id: string
  _creationTime: number
  providerOrderId: string
  providerEventId: string
  eventId: string
  isArchived?: boolean
  archivedAt?: number
  archiveReason?: string
  removedAt?: number
  normalizedStatus?: "paid" | "refunded" | "cancelled" | "pending"
  totalAmountMinor?: number
  currency?: string
  orderedAt?: number
  refundedAt?: number
  buyerName?: string
  buyerEmail?: string
}

function sortOrdersByNewest<
  T extends { orderedAt?: number; _creationTime: number },
>(a: T, b: T) {
  const aTime = a.orderedAt ?? a._creationTime
  const bTime = b.orderedAt ?? b._creationTime
  return bTime - aTime
}

function matchesOrderFilters(
  order: {
    eventId: string
    orderedAt?: number
    normalizedStatus?: "paid" | "refunded" | "cancelled" | "pending"
  },
  args: {
    eventId?: string
    from?: number
    to?: number
    status?: "paid" | "refunded" | "cancelled" | "pending"
  }
) {
  if (args.eventId && order.eventId !== args.eventId) {
    return false
  }

  if (args.from !== undefined && (order.orderedAt ?? -Infinity) < args.from) {
    return false
  }

  if (args.to !== undefined && (order.orderedAt ?? Infinity) > args.to) {
    return false
  }

  if (args.status && order.normalizedStatus !== args.status) {
    return false
  }

  return true
}

async function listCandidateOrders(
  ctx: QueryCtx,
  args: {
    eventId?: string
    from?: number
    to?: number
    status?: "paid" | "refunded" | "cancelled" | "pending"
  },
  maxItems: number
): Promise<CandidateOrder[]> {
  if (args.eventId) {
    return await ctx.db
      .query("ticketTailorOrders")
      .withIndex("eventId", (q) => q.eq("eventId", args.eventId!))
      .order("desc")
      .take(maxItems)
  }

  if (args.from !== undefined || args.to !== undefined) {
    if (args.from !== undefined && args.to !== undefined) {
      return await ctx.db
        .query("ticketTailorOrders")
        .withIndex("orderedAt", (q) =>
          q.gte("orderedAt", args.from!).lte("orderedAt", args.to!)
        )
        .order("desc")
        .take(maxItems)
    }

    if (args.from !== undefined) {
      return await ctx.db
        .query("ticketTailorOrders")
        .withIndex("orderedAt", (q) => q.gte("orderedAt", args.from!))
        .order("desc")
        .take(maxItems)
    }

    return await ctx.db
      .query("ticketTailorOrders")
      .withIndex("orderedAt", (q) => q.lte("orderedAt", args.to!))
      .order("desc")
      .take(maxItems)
  }

  if (args.status) {
    return await ctx.db
      .query("ticketTailorOrders")
      .withIndex("normalizedStatus", (q) =>
        q.eq("normalizedStatus", args.status!)
      )
      .order("desc")
      .take(maxItems)
  }

  return await ctx.db.query("ticketTailorOrders").order("desc").take(maxItems)
}

async function loadEventNamesById(
  ctx: QueryCtx
): Promise<Map<string, string | null>> {
  const events = await ctx.db.query("ticketTailorEvents").collect()
  return new Map(events.map((event) => [String(event._id), event.name ?? null]))
}

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
  returns: v.object({
    totalRows: v.number(),
    totalPages: v.number(),
    orders: v.array(orderLedgerRowValidator),
  }),
  handler: async (ctx, args) => {
    const candidates = await listCandidateOrders(ctx, args, 500)
    const orders = candidates
      .filter(isOrderVisible)
      .filter((order) => matchesOrderFilters(order, args))
      .sort(sortOrdersByNewest)

    const page = args.page ?? 1
    const pageSize = args.pageSize ?? 25
    const totalRows = orders.length
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
    const skip = (page - 1) * pageSize
    const paginatedOrders = orders.slice(skip, skip + pageSize)

    const eventNamesById = await loadEventNamesById(ctx)
    const ordersWithEvent = paginatedOrders.map((order) => ({
      providerOrderId: order.providerOrderId,
      providerEventId: order.providerEventId,
      eventId: order.eventId,
      eventName: eventNamesById.get(order.eventId) ?? null,
      normalizedStatus: order.normalizedStatus ?? "pending",
      isArchived: order.isArchived === true,
      archivedAt: order.archivedAt
        ? new Date(order.archivedAt).toISOString()
        : null,
      archiveReason: order.archiveReason ?? null,
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
    }))

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
    let orders = (await ctx.db.query("ticketTailorOrders").collect()).filter(
      isOrderVisible
    )

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
    status: v.optional(canonicalOrderStatusValidator),
  },
  returns: v.array(orderLedgerRowValidator),
  handler: async (ctx, args) => {
    const candidates = await listCandidateOrders(ctx, args, 500)
    const eventNamesById = await loadEventNamesById(ctx)

    return candidates
      .filter(isOrderVisible)
      .filter((order) => matchesOrderFilters(order, args))
      .sort(sortOrdersByNewest)
      .map((order) => ({
        providerOrderId: order.providerOrderId,
        providerEventId: order.providerEventId,
        eventId: order.eventId,
        eventName: eventNamesById.get(order.eventId) ?? null,
        normalizedStatus: order.normalizedStatus ?? "pending",
        isArchived: order.isArchived === true,
        archivedAt: order.archivedAt
          ? new Date(order.archivedAt).toISOString()
          : null,
        archiveReason: order.archiveReason ?? null,
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
      }))
  },
})

export const searchOrders = query({
  args: {
    search: v.string(),
    eventId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(orderSearchRowValidator),
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 50)
    const search = args.search.trim().toLowerCase()

    const candidates = args.eventId
      ? await ctx.db
          .query("ticketTailorOrders")
          .withIndex("eventId", (q) => q.eq("eventId", args.eventId!))
          .order("desc")
          .take(250)
      : await ctx.db.query("ticketTailorOrders").order("desc").take(500)

    const filtered = candidates.filter(
      (o) =>
        !isOrderRemoved(o) &&
        (!args.eventId || o.providerEventId === args.eventId) &&
        (!search ||
          (o.buyerName && o.buyerName.toLowerCase().includes(search)) ||
          (o.providerOrderId &&
            o.providerOrderId.toLowerCase().includes(search)))
    )

    return filtered
      .sort(sortOrdersByNewest)
      .slice(0, limit)
      .map((order) => ({
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
  returns: v.union(
    v.object({
      order: v.object({
        id: v.id("ticketTailorOrders"),
        providerOrderId: v.string(),
        normalizedStatus: v.optional(canonicalOrderStatusValidator),
        isArchived: v.optional(v.boolean()),
        archivedAt: nullableStringValidator,
        archiveReason: nullableStringValidator,
        totalAmountMinor: v.optional(v.number()),
        orderedAt: nullableStringValidator,
      }),
      attendees: v.array(
        v.object({
          id: v.id("ticketTailorAttendees"),
          name: v.string(),
          ticketTypeLabel: v.string(),
          normalizedStatus: v.string(),
        })
      ),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("providerOrderId", (q) =>
        q.eq("providerOrderId", args.providerOrderId)
      )
      .collect()

    const order = orders.find((o) => o.providerEventId === args.providerEventId)
    if (!order || isOrderRemoved(order)) return null

    const attendees = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("orderId", (q) => q.eq("orderId", order._id))
      .collect()

    return {
      order: {
        id: order._id,
        providerOrderId: order.providerOrderId,
        normalizedStatus: order.normalizedStatus,
        isArchived: order.isArchived,
        archivedAt: order.archivedAt
          ? new Date(order.archivedAt).toISOString()
          : null,
        archiveReason: order.archiveReason ?? null,
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
  returns: v.object({
    summary: v.object({
      unassigned: v.number(),
      partial: v.number(),
      paid: v.number(),
      overpaid: v.number(),
      totalOrders: v.number(),
    }),
    totalAmountMinor: v.number(),
    bySource: v.object({
      tikkie: v.number(),
      bank_transfer: v.number(),
      cash: v.number(),
    }),
    legacyPaymentStatus: v.object({
      unassigned: v.number(),
      ambiguous: v.number(),
      manual_assignment: v.number(),
      auto_matched: v.number(),
    }),
  }),
  handler: async (ctx) => {
    const [orders, payments] = await Promise.all([
      ctx.db.query("ticketTailorOrders").order("desc").take(500),
      ctx.db.query("payments").order("desc").take(1000),
    ])
    const visibleOrders = orders.filter(isOrderVisible)

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

    for (const order of visibleOrders) {
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
        totalOrders: visibleOrders.filter((o) => (o.totalAmountMinor ?? 0) > 0)
          .length,
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

export const removeOrderLocally = mutation({
  args: {
    orderId: v.id("ticketTailorOrders"),
    reason: v.optional(v.string()),
  },
  returns: v.object({
    orderId: v.id("ticketTailorOrders"),
    removedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const order = await ctx.db.get("ticketTailorOrders", args.orderId)
    if (!order) {
      throw new Error("Order not found")
    }

    const removedAt = Date.now()
    await ctx.db.patch("ticketTailorOrders", args.orderId, {
      removedAt,
      removedReason: args.reason?.trim() || "removed_by_user",
    })

    return {
      orderId: args.orderId,
      removedAt,
    }
  },
})
