import { query, mutation, internalMutation, type QueryCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { v } from "convex/values"
import { requireIdentity } from "./auth"
import {
  canonicalOrderStatusValidator,
  nullableStringValidator,
  orderLedgerRowValidator,
  orderSearchRowValidator,
} from "../lib/types/order"
import { deriveBalanceAmounts } from "../lib/domain/finance/amounts"
import { loadMatchedPaymentTotalsByOrderId, loadOrderAmountDueBreakdowns } from "./finance"
import {
  loadOrderAttendeesWithExtensions,
  loadOrderWithExtension,
  loadOrdersWithExtensions,
} from "./provider_boundary"

function isOrderRemoved(ttOrder: any) {
  return typeof ttOrder?.removedAt === "number"
}

function isOrderVisible(ttOrder: any) {
  return !isOrderRemoved(ttOrder)
}

// Helper to get order core data by providerOrderId
async function getOrderByProviderOrderId(
  ctx: QueryCtx,
  providerOrderId: string
): Promise<any | null> {
  return await ctx.db
    .query("orders")
    .withIndex("by_providerOrderId", (q) =>
      q.eq("providerOrderId", providerOrderId)
    )
    .first()
}

export const getOrders = query({
  args: {
    eventId: v.optional(v.union(v.id("events"), v.string())),
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
    await requireIdentity(ctx)
    // Query core orders table with index
    let orders: Doc<"orders">[] = []

    if (args.eventId) {
      // Bounded: indexed by event, capped at 500
      orders = await ctx.db
        .query("orders")
        .withIndex("by_eventId", (q) =>
          q.eq("eventId", args.eventId! as Id<"events">)
        )
        .take(500)
    } else {
      // Bounded: capped read for non-paginated query
      orders = await ctx.db.query("orders").order("desc").take(500)
    }

    // Join with extension data for visibility/status filtering
    const visibleOrders = (await loadOrdersWithExtensions(ctx, orders))
      .filter(({ extension }) => extension && isOrderVisible(extension))
    const eventSourceKindsById = await loadEventSourceKindsById(ctx)

    // Map back to order objects with merged extension data
    const result = visibleOrders
      .filter(({ order }) =>
        isInternalEvent(eventSourceKindsById, order.eventId)
      )
      .map(({ order, extension }) => ({
        ...order,
        ...extension,
        _id: order._id,
        _creationTime: order._creationTime,
      }))

    if (args.status) {
      return result.filter((o) => o.status === args.status)
    }
    return result
  },
})

export const getOrderById = query({
  args: { orderId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    try {
      const orderId = ctx.db.normalizeId("orders", args.orderId)
      if (!orderId) {
        return null
      }

      const combined = await loadOrderWithExtension(ctx, orderId)
      if (!combined || !isOrderVisible(combined.extension)) {
        return null
      }

      const eventSourceKindsById = await loadEventSourceKindsById(ctx)
      if (!isInternalEvent(eventSourceKindsById, combined.order.eventId)) {
        return null
      }

      return {
        ...combined.order,
        ...combined.extension,
        _id: combined.order._id,
        _creationTime: combined.order._creationTime,
      }
    } catch {
      return null
    }
  },
})

export const getOrderByProviderId = query({
  args: { providerOrderId: v.string() },
  handler: async (ctx, args) => {
    const order = await getOrderByProviderOrderId(ctx, args.providerOrderId)
    if (!order) return null

    const extension = (await loadOrderWithExtension(ctx, order._id))?.extension ?? null

    if (!extension || !isOrderVisible(extension)) {
      return null
    }

    const eventSourceKindsById = await loadEventSourceKindsById(ctx)
    if (!isInternalEvent(eventSourceKindsById, order.eventId)) {
      return null
    }

    return {
      ...order,
      ...extension,
      _id: order._id,
      _creationTime: order._creationTime,
    }
  },
})

export const getOrderLedger = query({
  args: { eventId: v.union(v.id("events"), v.string()) },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    // Bounded: indexed by event, capped at 500
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) =>
        q.eq("eventId", args.eventId as Id<"events">)
      )
      .take(500)

    // Join with extension data and filter visible
    const withExtensions = await loadOrdersWithExtensions(ctx, orders)

    const visibleOrders = withExtensions
      .filter(({ extension }) => extension && isOrderVisible(extension))
      .map(({ order, extension }) => ({
        ...order,
        ...extension,
        _id: order._id,
        _creationTime: order._creationTime,
      }))

    const ordersWithAttendees = await Promise.all(
      visibleOrders.map(async (order) => ({
        ...order,
        attendees: await loadOrderAttendeesWithExtensions(ctx, order._id),
      }))
    )

    return ordersWithAttendees
  },
})

export const createOrder = mutation({
  args: {
    providerOrderId: v.string(),
    providerEventId: v.string(),
    eventId: v.union(v.id("events"), v.string()),
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
    await requireIdentity(ctx)

    // Insert into core orders table
    const orderId = await ctx.db.insert("orders", {
      eventId: args.eventId as Id<"events">,
      providerOrderId: args.providerOrderId,
      providerEventId: args.providerEventId,
      bookerEmail: args.buyerEmail,
      bookerName: args.buyerName,
      currency: args.currency,
      totalAmountMinor: args.totalAmountMinor,
      orderedAt: args.orderedAt,
      status: args.normalizedStatus,
      source: "integration",
    })

    // Insert into TT extension table
    const ttId = await ctx.db.insert("ticketTailorOrders", {
      orderId,
      providerOrderId: args.providerOrderId,
      providerEventId: args.providerEventId,
      providerStatus: args.providerStatus,
      normalizedStatus: args.normalizedStatus,
      rawPayload: args.rawPayload,
    })

    return orderId
  },
})

export const upsertOrder = mutation({
  args: {
    providerOrderId: v.string(),
    providerEventId: v.string(),
    eventId: v.union(v.id("events"), v.string()),
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
    await requireIdentity(ctx)

    // Check for existing order in core table
    const existingOrder = await ctx.db
      .query("orders")
      .withIndex("by_providerOrderId", (q) =>
        q.eq("providerOrderId", args.providerOrderId)
      )
      .first()

    const coreData = {
      eventId: args.eventId as Id<"events">,
      providerOrderId: args.providerOrderId,
      providerEventId: args.providerEventId,
      bookerEmail: args.buyerEmail,
      bookerName: args.buyerName,
      currency: args.currency,
      totalAmountMinor: args.totalAmountMinor,
      orderedAt: args.orderedAt,
      status: args.normalizedStatus,
    }

    const extensionData = {
      providerOrderId: args.providerOrderId,
      providerEventId: args.providerEventId,
      providerStatus: args.providerStatus,
      normalizedStatus: args.normalizedStatus,
      rawPayload: args.rawPayload,
    }

    if (existingOrder) {
      // Update core table
      await ctx.db.patch("orders", existingOrder._id, coreData)

      // Update extension table
      const existingExtension = await ctx.db
        .query("ticketTailorOrders")
        .withIndex("orderId", (q) => q.eq("orderId", existingOrder._id))
        .first()

      if (existingExtension) {
        await ctx.db.patch(
          "ticketTailorOrders",
          existingExtension._id,
          extensionData
        )
      } else {
        await ctx.db.insert("ticketTailorOrders", {
          orderId: existingOrder._id,
          ...extensionData,
        })
      }

      return existingOrder._id
    }

    // Insert new order into core table
    const orderId = await ctx.db.insert("orders", {
      ...coreData,
      source: "integration",
    })

    // Insert into TT extension table
    await ctx.db.insert("ticketTailorOrders", {
      orderId,
      ...extensionData,
    })

    return orderId
  },
})

export const updateOrderStatus = mutation({
  args: {
    orderId: v.id("orders"),
    normalizedStatus: v.union(
      v.literal("paid"),
      v.literal("refunded"),
      v.literal("cancelled"),
      v.literal("pending")
    ),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const extension = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("orderId", (q) => q.eq("orderId", args.orderId))
      .first()

    const statusPatch = buildCanonicalOrderStatusPatch({
      normalizedStatus: args.normalizedStatus,
      existingExtension: extension,
    })

    // Update core table status
    await ctx.db.patch("orders", args.orderId, statusPatch.orderPatch)

    // Update extension table timestamps
    if (extension) {
      await ctx.db.patch("ticketTailorOrders", extension._id, statusPatch.extensionPatch)
    }

    return args.orderId
  },
})

function normalizeNullableTextInput(
  value: string | null | undefined
): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  const normalized = value.trim()
  return normalized || undefined
}

export const updateOrderDetails = mutation({
  args: {
    orderId: v.id("orders"),
    bookerName: v.optional(nullableStringValidator),
    bookerEmail: v.optional(nullableStringValidator),
    bookingRef: v.optional(nullableStringValidator),
    normalizedStatus: v.optional(canonicalOrderStatusValidator),
    totalAmountMinor: v.optional(v.union(v.number(), v.null())),
    orderedAt: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.id("orders"),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const order = await ctx.db.get("orders", args.orderId)
    if (!order) {
      throw new Error("Order not found")
    }

    const extension = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("orderId", (q) => q.eq("orderId", args.orderId))
      .first()

    const orderPatch: {
      bookerName?: string
      bookerEmail?: string
      bookingRef?: string
      status?: "paid" | "refunded" | "cancelled" | "pending"
      totalAmountMinor?: number
      orderedAt?: number
    } = {}

    if (args.bookerName !== undefined) {
      orderPatch.bookerName = normalizeNullableTextInput(args.bookerName)
    }

    if (args.bookerEmail !== undefined) {
      orderPatch.bookerEmail = normalizeNullableTextInput(args.bookerEmail)
    }

    if (args.bookingRef !== undefined) {
      orderPatch.bookingRef = normalizeNullableTextInput(args.bookingRef)
    }

    if (args.totalAmountMinor !== undefined) {
      if (
        args.totalAmountMinor !== null &&
        (!Number.isInteger(args.totalAmountMinor) || args.totalAmountMinor < 0)
      ) {
        throw new Error(
          "Invalid 'totalAmountMinor'. Expected a non-negative integer or null to clear."
        )
      }

      if (args.totalAmountMinor !== null) {
        orderPatch.totalAmountMinor = args.totalAmountMinor
      }
    }

    if (args.orderedAt !== undefined) {
      if (
        args.orderedAt !== null &&
        (!Number.isFinite(args.orderedAt) || args.orderedAt < 0)
      ) {
        throw new Error(
          "Invalid 'orderedAt'. Expected a Unix timestamp in milliseconds or null to clear."
        )
      }

      if (args.orderedAt !== null) {
        orderPatch.orderedAt = args.orderedAt
      }
    }

    if (args.normalizedStatus !== undefined) {
      const statusPatch = buildCanonicalOrderStatusPatch({
        normalizedStatus: args.normalizedStatus,
        existingExtension: extension,
      })

      orderPatch.status = statusPatch.orderPatch.status

      if (extension) {
        await ctx.db.patch("ticketTailorOrders", extension._id, {
          ...statusPatch.extensionPatch,
        })
      }
    }

    if (Object.keys(orderPatch).length > 0) {
      await ctx.db.patch("orders", args.orderId, orderPatch)
    }

    return args.orderId
  },
})

export const syncFullyPaidOrders = internalMutation({
  args: {},
  returns: v.object({
    scanned: v.number(),
    updated: v.number(),
  }),
  handler: async (ctx) => {
    const orders = await ctx.db.query("orders").order("desc").take(1000)
    const activeOrders = orders.filter(
      (order) => order.status !== "refunded" && order.status !== "cancelled"
    )

    const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      ctx,
      activeOrders
    )
    const matchedTotalsByOrderId = await loadMatchedPaymentTotalsByOrderId(
      ctx,
      activeOrders
    )

    let updated = 0

    for (const order of activeOrders) {
      const extension = await ctx.db
        .query("ticketTailorOrders")
        .withIndex("orderId", (q) => q.eq("orderId", order._id))
        .first()

      if (extension?.isArchived || extension?.removedAt) {
        continue
      }

      // Re-verify matched amounts against current state to avoid race condition
      const currentAmountDueMinor =
        amountDueBreakdownsByOrderId.get(String(order._id))?.amountDueMinor ??
        order.totalAmountMinor ??
        0
      const currentPaidAmountMinor = matchedTotalsByOrderId.get(String(order._id)) ?? 0

      if (currentPaidAmountMinor < currentAmountDueMinor || order.status === "paid") {
        continue
      }

      const statusPatch = buildCanonicalOrderStatusPatch({
        normalizedStatus: "paid",
        existingExtension: extension,
      })

      await ctx.db.patch("orders", order._id, statusPatch.orderPatch)

      if (extension) {
        await ctx.db.patch("ticketTailorOrders", extension._id, statusPatch.extensionPatch)
      }

      updated += 1
    }

    return {
      scanned: activeOrders.length,
      updated,
    }
  },
})

export function buildCanonicalOrderStatusPatch(params: {
  normalizedStatus: "paid" | "refunded" | "cancelled" | "pending"
  existingExtension?: {
    refundedAt?: number | null
    cancelledAt?: number | null
  } | null
  refundedAt?: number | null
  cancelledAt?: number | null
}) {
  const orderPatch = {
    status: params.normalizedStatus,
  }

  const extensionPatch: {
    normalizedStatus: "paid" | "refunded" | "cancelled" | "pending"
    refundedAt?: number
    cancelledAt?: number
  } = {
    normalizedStatus: params.normalizedStatus,
  }

  if (params.normalizedStatus === "refunded") {
    extensionPatch.refundedAt =
      params.refundedAt ?? params.existingExtension?.refundedAt ?? Date.now()
  }

  if (params.normalizedStatus === "cancelled") {
    extensionPatch.cancelledAt =
      params.cancelledAt ?? params.existingExtension?.cancelledAt ?? Date.now()
  }

  return {
    orderPatch,
    extensionPatch,
  }
}

type CandidateOrder = {
  _id: Id<"orders">
  _creationTime: number
  providerOrderId?: string
  providerEventId?: string
  eventId?: Id<"events">
  status?: "paid" | "refunded" | "cancelled" | "pending"
  totalAmountMinor?: number
  currency?: string
  orderedAt?: number
  bookerName?: string
  bookerEmail?: string
  submittedAt?: number
  // Extension fields
  isArchived?: boolean
  archivedAt?: number
  archiveReason?: string
  removedAt?: number
  refundedAt?: number
}

function sortOrdersByNewest<
  T extends { orderedAt?: number; submittedAt?: number; _creationTime: number },
>(a: T, b: T) {
  const aTime = a.orderedAt ?? a.submittedAt ?? a._creationTime
  const bTime = b.orderedAt ?? b.submittedAt ?? b._creationTime
  return bTime - aTime
}

function matchesOrderFilters(
  order: {
    eventId?: string
    orderedAt?: number
    submittedAt?: number
    status?: "paid" | "refunded" | "cancelled" | "pending"
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

  const orderTime = order.orderedAt ?? order.submittedAt

  if (args.from !== undefined && (orderTime ?? -Infinity) < args.from) {
    return false
  }

  if (args.to !== undefined && (orderTime ?? Infinity) > args.to) {
    return false
  }

  if (args.status && order.status !== args.status) {
    return false
  }

  return true
}

function resolveEventSlug(
  eventSlugsById: Map<string, string>,
  eventId?: Id<"events">
): string {
  if (!eventId) {
    return ""
  }
  return eventSlugsById.get(String(eventId)) ?? ""
}

async function listCandidateOrders(
  ctx: QueryCtx,
  args: {
    eventId?: Id<"events"> | string
    from?: number
    to?: number
    status?: "paid" | "refunded" | "cancelled" | "pending"
  },
  maxItems: number
): Promise<CandidateOrder[]> {
  // Query core orders table with appropriate index
  let orders: any[] = []

  if (args.eventId) {
    orders = await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) =>
        q.eq("eventId", args.eventId! as Id<"events">)
      )
      .order("desc")
      .take(maxItems)
  } else if (args.status) {
    orders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", args.status!))
      .order("desc")
      .take(maxItems)
  } else {
    // For date range queries without event/status, use bounded scan
    // Note: orderedAt is not indexed, so we filter in memory
    orders = await ctx.db.query("orders").order("desc").take(maxItems)
  }

  // Join with extension data
  const withExtensions = await loadOrdersWithExtensions(ctx, orders)

  return withExtensions.map(({ order, extension }) => ({
    ...order,
    ...extension,
    _id: order._id,
    _creationTime: order._creationTime,
  }))
}

async function loadEventNamesById(
  ctx: QueryCtx
): Promise<Map<string, string | null>> {
  // Bounded: small number of events - using canonical events table
  const events = await ctx.db.query("events").collect()
  return new Map(
    events.map((event) => [String(event._id), event.title ?? null])
  )
}

async function loadEventSlugsById(ctx: QueryCtx): Promise<Map<string, string>> {
  // Bounded: small number of events - using canonical events table
  const events = await ctx.db.query("events").collect()
  return new Map(events.map((event) => [String(event._id), event.slug]))
}

async function loadEventSourceKindsById(
  ctx: QueryCtx
): Promise<Map<string, "integration" | "internal">> {
  const events = await ctx.db.query("events").collect()
  return new Map(
    events.map((event) => [String(event._id), event.primarySourceKind])
  )
}

function isInternalEvent(
  eventSourceKindsById: Map<string, "integration" | "internal">,
  eventId?: Id<"events"> | string | null
) {
  if (!eventId) {
    return false
  }

  return eventSourceKindsById.get(String(eventId)) === "internal"
}

async function loadPaymentTotalsByOrderKey(ctx: QueryCtx) {
  const payments = await ctx.db.query("payments").take(1000)
  const totalsByOrderKey = new Map<string, number>()

  for (const payment of payments) {
    if (
      payment.status !== "manual_assignment" &&
      payment.status !== "auto_matched"
    ) {
      continue
    }

    const rawOrderId =
      typeof payment.orderId === "string" ? payment.orderId.trim() : ""
    if (!rawOrderId) {
      continue
    }

    totalsByOrderKey.set(
      rawOrderId,
      (totalsByOrderKey.get(rawOrderId) ?? 0) + payment.amountMinor
    )
  }

  return totalsByOrderKey
}

function getMatchedPaymentTotalForOrder(
  order: {
    _id: Id<"orders">
    providerOrderId?: string | null
  },
  totalsByOrderKey: Map<string, number>
) {
  const keys = new Set<string>([String(order._id)])
  if (order.providerOrderId) {
    keys.add(order.providerOrderId)
  }

  let total = 0
  for (const key of keys) {
    total += totalsByOrderKey.get(key) ?? 0
  }

  return total
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
    await requireIdentity(ctx)
    const candidates = await listCandidateOrders(ctx, args, 500)
    const eventSourceKindsById = await loadEventSourceKindsById(ctx)
    const orders = candidates
      .filter((order) => !isOrderRemoved(order))
      .filter((order) => isInternalEvent(eventSourceKindsById, order.eventId))
      .filter((order) => matchesOrderFilters(order, args))
      .sort(sortOrdersByNewest)

    const page = args.page ?? 1
    const pageSize = args.pageSize ?? 25
    const totalRows = orders.length
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
    const skip = (page - 1) * pageSize
    const paginatedOrders = orders.slice(skip, skip + pageSize)
    const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      ctx,
      paginatedOrders
    )
    const matchedPaymentTotalsByOrderId = await loadMatchedPaymentTotalsByOrderId(
      ctx,
      paginatedOrders
    )

    const eventNamesById = await loadEventNamesById(ctx)
    const eventSlugsById = await loadEventSlugsById(ctx)
    const ordersWithEvent = paginatedOrders.map((order) => {
      const amountDueMinor =
        amountDueBreakdownsByOrderId.get(String(order._id))?.amountDueMinor ??
        order.totalAmountMinor ??
        null
      const matchedAmountMinor = matchedPaymentTotalsByOrderId.get(String(order._id))
      const balance = deriveBalanceAmounts(amountDueMinor, matchedAmountMinor)

      return {
        orderId: order._id,
        providerOrderId: order.providerOrderId ?? null,
        eventId: order.eventId ? String(order.eventId) : "",
        eventSlug: resolveEventSlug(eventSlugsById, order.eventId),
        eventTitle:
          eventNamesById.get(order.eventId ? String(order.eventId) : "") ?? null,
        normalizedStatus: order.status ?? "pending",
        isArchived: order.isArchived === true,
        archivedAt: order.archivedAt
          ? new Date(order.archivedAt).toISOString()
          : null,
        archiveReason: order.archiveReason ?? null,
        amountDueMinor,
        matchedAmountMinor: matchedAmountMinor ?? null,
        outstandingAmountMinor: balance.outstandingAmountMinor,
        totalAmountMinor: order.totalAmountMinor ?? null,
        currency: order.currency ?? null,
        orderedAt: order.orderedAt
          ? new Date(order.orderedAt).toISOString()
          : order.submittedAt
            ? new Date(order.submittedAt).toISOString()
            : null,
        refundedAt: order.refundedAt
          ? new Date(order.refundedAt).toISOString()
          : null,
        buyerName: order.bookerName ?? null,
        buyerEmail: order.bookerEmail ?? null,
      }
    })

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
    // Bounded: capped read for count aggregation
    const orders = await ctx.db.query("orders").order("desc").take(500)

    // Join with extension data for visibility filtering
    const withExtensions = await loadOrdersWithExtensions(ctx, orders)
    const mergedOrders = withExtensions.map(({ order, extension }) => ({
      ...order,
      ...extension,
      _id: order._id,
      _creationTime: order._creationTime,
    }))

    const eventSourceKindsById = await loadEventSourceKindsById(ctx)

    let filtered = mergedOrders
      .filter((o) => !isOrderRemoved(o))
      .filter((o) => isInternalEvent(eventSourceKindsById, o.eventId))

    if (args.eventId) {
      filtered = filtered.filter((o) => o.eventId === args.eventId)
    }

    if (args.from !== undefined) {
      filtered = filtered.filter(
        (o) => (o.orderedAt ?? o.submittedAt ?? 0) >= args.from!
      )
    }

    if (args.to !== undefined) {
      filtered = filtered.filter(
        (o) => (o.orderedAt ?? o.submittedAt ?? Infinity) <= args.to!
      )
    }

    if (args.status) {
      filtered = filtered.filter((o) => o.status === args.status)
    }

    return filtered.length
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
    const fromMs = args.from ?? 0
    const toMs = args.to ?? Date.now()

    // Query canonical orders table directly
    let orders: Doc<"orders">[]

    if (args.eventId) {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_eventId", (q) =>
          q.eq("eventId", args.eventId! as Id<"events">)
        )
        .order("desc")
        .collect()
    } else if (args.status) {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect()
    } else {
      orders = await ctx.db.query("orders").order("desc").take(2000)
    }

    // Filter by date range in memory (orderedAt is not indexed)
    const filtered = orders.filter((order) => {
      if (isOrderRemoved(order)) return false

      const orderedAt = order.orderedAt ?? order.submittedAt ?? 0
      if (orderedAt < fromMs || orderedAt > toMs) return false

      if (args.status && order.status !== args.status) return false

      return true
    })

    const eventSourceKindsById = await loadEventSourceKindsById(ctx)
    const visibleOrders = filtered.filter((order) =>
      isInternalEvent(eventSourceKindsById, order.eventId)
    )
    const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      ctx,
      visibleOrders
    )
    const matchedTotalsByOrderId = await loadMatchedPaymentTotalsByOrderId(
      ctx,
      visibleOrders
    )

    // Join with extension data for additional fields, preserving canonical order._id
    const withExtensions = await loadOrdersWithExtensions(ctx, visibleOrders)

    const eventNamesById = await loadEventNamesById(ctx)
    const eventSlugsById = await loadEventSlugsById(ctx)

    return withExtensions
      .sort((a, b) => sortOrdersByNewest(a.order, b.order))
      .map(({ order, extension }) => {
        const amountDueMinor =
          amountDueBreakdownsByOrderId.get(String(order._id))?.amountDueMinor ??
          order.totalAmountMinor ??
          null
        const matchedAmountMinor =
          matchedTotalsByOrderId.get(String(order._id)) ?? 0
        const outstandingAmountMinor = deriveBalanceAmounts(
          amountDueMinor,
          matchedAmountMinor
        ).outstandingAmountMinor

        return {
          orderId: order._id,
          providerOrderId:
            order.providerOrderId ?? extension?.providerOrderId ?? null,
          eventId: order.eventId ? String(order.eventId) : "",
          eventSlug: resolveEventSlug(eventSlugsById, order.eventId),
          eventTitle:
            eventNamesById.get(order.eventId ? String(order.eventId) : "") ??
            null,
          normalizedStatus: order.status ?? "pending",
          isArchived: extension?.isArchived === true,
          archivedAt: extension?.archivedAt
            ? new Date(extension.archivedAt).toISOString()
            : null,
          archiveReason: extension?.archiveReason ?? null,
          amountDueMinor,
          totalAmountMinor: order.totalAmountMinor ?? null,
          matchedAmountMinor,
          outstandingAmountMinor,
          currency: order.currency ?? null,
          orderedAt: order.orderedAt
            ? new Date(order.orderedAt).toISOString()
            : order.submittedAt
              ? new Date(order.submittedAt).toISOString()
              : null,
          refundedAt: extension?.refundedAt
            ? new Date(extension.refundedAt).toISOString()
            : null,
          buyerName: order.bookerName ?? null,
          buyerEmail: order.bookerEmail ?? null,
        }
      })
  },
})

export const searchOrders = query({
  args: {
    search: v.string(),
    eventId: v.optional(v.union(v.id("events"), v.string())),
    limit: v.optional(v.number()),
  },
  returns: v.array(orderSearchRowValidator),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const limit = Math.min(args.limit ?? 20, 50)
    const search = args.search.trim().toLowerCase()

    // Query core orders table
    const candidates = args.eventId
      ? await ctx.db
          .query("orders")
          .withIndex("by_eventId", (q) =>
            q.eq("eventId", args.eventId! as Id<"events">)
          )
          .order("desc")
          .take(250)
      : await ctx.db.query("orders").order("desc").take(500)

    // Join with extension data for visibility filtering
    const withExtensions = await loadOrdersWithExtensions(ctx, candidates)
    const normalizedCandidates = withExtensions.map(({ order, extension }) => ({
      ...order,
      ...extension,
      _id: order._id,
      _creationTime: order._creationTime,
    }))

    const eventSourceKindsById = await loadEventSourceKindsById(ctx)

    const filtered = normalizedCandidates.filter(
      (o) =>
        !isOrderRemoved(o) &&
        isInternalEvent(eventSourceKindsById, o.eventId) &&
        (!search ||
          (o.bookerName && o.bookerName.toLowerCase().includes(search)) ||
          (o.providerOrderId &&
            o.providerOrderId.toLowerCase().includes(search)))
    )

    const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      ctx,
      filtered
    )

    return filtered
      .sort(sortOrdersByNewest)
      .slice(0, limit)
      .map((order) => ({
        id: order._id,
        providerOrderId: order.providerOrderId ?? null,
        buyerName: order.bookerName ?? null,
        amountDueMinor:
          amountDueBreakdownsByOrderId.get(String(order._id))?.amountDueMinor ??
          order.totalAmountMinor ??
          null,
      }))
  },
})

export const getOrderWithAttendees = query({
  args: {
    orderId: v.id("orders"),
  },
  returns: v.union(
    v.object({
      order: v.object({
        id: v.id("orders"),
        providerOrderId: nullableStringValidator,
        bookerName: nullableStringValidator,
        bookerEmail: nullableStringValidator,
        bookingRef: nullableStringValidator,
        eventId: v.union(v.id("events"), v.null()),
        amountDueMinor: v.union(v.number(), v.null()),
        normalizedStatus: v.optional(canonicalOrderStatusValidator),
        isArchived: v.optional(v.boolean()),
        archivedAt: nullableStringValidator,
        archiveReason: nullableStringValidator,
        totalAmountMinor: v.optional(v.number()),
        orderedAt: nullableStringValidator,
      }),
      attendees: v.array(
        v.object({
          id: v.id("orderAttendees"),
          name: v.string(),
          email: nullableStringValidator,
          roommatePreference: nullableStringValidator,
          roommateAvoid: nullableStringValidator,
          ticketTypeLabel: v.string(),
          normalizedStatus: v.string(),
          amountDueMinor: v.number(),
        })
      ),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const order = await ctx.db.get("orders", args.orderId)
    if (!order) return null

    const amountDueBreakdownByOrderId = await loadOrderAmountDueBreakdowns(
      ctx,
      [{ _id: order._id }]
    )
    const amountDueBreakdown = amountDueBreakdownByOrderId.get(
      String(order._id)
    )

    const extension = (await loadOrderWithExtension(ctx, order._id))?.extension ?? null

    if (extension && isOrderRemoved(extension)) return null

    const eventSourceKindsById = await loadEventSourceKindsById(ctx)
    if (!isInternalEvent(eventSourceKindsById, order.eventId)) {
      return null
    }

    const attendees = await loadOrderAttendeesWithExtensions(ctx, order._id)

    return {
      order: {
        id: order._id,
        providerOrderId: order.providerOrderId ?? null,
        bookerName: order.bookerName ?? null,
        bookerEmail: order.bookerEmail ?? null,
        bookingRef: order.bookingRef ?? null,
        eventId: order.eventId ?? null,
        amountDueMinor:
          amountDueBreakdown?.amountDueMinor ?? order.totalAmountMinor ?? null,
        normalizedStatus: order.status ?? undefined,
        isArchived: extension?.isArchived,
        archivedAt: extension?.archivedAt
          ? new Date(extension.archivedAt).toISOString()
          : null,
        archiveReason: extension?.archiveReason ?? null,
        totalAmountMinor: order.totalAmountMinor ?? undefined,
        orderedAt: order.orderedAt
          ? new Date(order.orderedAt).toISOString()
          : order.submittedAt
            ? new Date(order.submittedAt).toISOString()
            : null,
      },
      attendees: attendees.map((a) => ({
        id: a._id,
        name: a.name ?? "Unnamed attendee",
        email: a.email ?? null,
        roommatePreference: a.roommatePreference ?? null,
        roommateAvoid: a.roommateAvoid ?? null,
        ticketTypeLabel: "-",
        normalizedStatus: "pending",
        amountDueMinor:
          amountDueBreakdown?.amountDueByAttendeeId.get(String(a._id)) ?? 0,
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
    await requireIdentity(ctx)
    // Query core orders table
    const orders = await ctx.db.query("orders").order("desc").take(500)

    // Join with extensions for visibility filtering
    const withExtensions = await loadOrdersWithExtensions(ctx, orders)
    const visibleOrders = withExtensions
      .filter(({ extension }) => extension && !isOrderRemoved(extension))
      .map(({ order, extension }) => ({
        ...order,
        ...extension,
        _id: order._id,
        _creationTime: order._creationTime,
      }))

    const eventSourceKindsById = await loadEventSourceKindsById(ctx)

    const canonicalVisibleOrders = visibleOrders.filter((o) =>
      isInternalEvent(eventSourceKindsById, o.eventId)
    )

    const payments = await ctx.db.query("payments").order("desc").take(1000)

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

    for (const order of canonicalVisibleOrders) {
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
        totalOrders: canonicalVisibleOrders.filter(
          (o) => (o.totalAmountMinor ?? 0) > 0
        ).length,
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
    orderId: v.id("orders"),
    reason: v.optional(v.string()),
  },
  returns: v.object({
    orderId: v.id("orders"),
    removedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    // Verify order exists
    const order = await ctx.db.get("orders", args.orderId)
    if (!order) {
      throw new Error("Order not found")
    }

    // Update extension table with removed status
    const extension = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("orderId", (q) => q.eq("orderId", args.orderId))
      .first()

    const removedAt = Date.now()

    if (extension) {
      await ctx.db.patch("ticketTailorOrders", extension._id, {
        removedAt,
        removedReason: args.reason?.trim() || "removed_by_user",
      })
    }

    return {
      orderId: args.orderId,
      removedAt,
    }
  },
})
