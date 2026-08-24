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
import {
  deriveBalanceAmounts,
  isOrderAppliedPayment,
} from "../lib/domain/finance/amounts"
import { loadMatchedPaymentTotalsByOrderId, loadOrderAmountDueBreakdowns } from "./finance"
import {
  loadOrderAttendeesWithExtensions,
  loadOrderWithExtension,
  loadOrdersWithExtensions,
} from "./provider_boundary"

function isOrderRemoved(ttOrder: any) {
  return typeof ttOrder?.removedAt === "number"
}

/** An order merged via the core merge markers is treated as removed. */
function isOrderMergedCore(order: Doc<"orders">) {
  return typeof order?.mergedIntoOrderId === "string"
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
      .filter(({ order, extension }) => extension && isOrderVisible(extension) && !isOrderMergedCore(order))
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
      if (!combined || !isOrderVisible(combined.extension) || isOrderMergedCore(combined.order)) {
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
      status: args.normalizedStatus ?? "pending",
      source: "integration",
    })

    // Insert into TT extension table
    const ttId = await ctx.db.insert("ticketTailorOrders", {
      orderId,
      providerOrderId: args.providerOrderId,
      providerEventId: args.providerEventId,
      providerStatus: args.providerStatus,
      normalizedStatus: args.normalizedStatus ?? "pending",
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
      status: args.normalizedStatus ?? "pending",
    }

    const extensionData = {
      providerOrderId: args.providerOrderId,
      providerEventId: args.providerEventId,
      providerStatus: args.providerStatus,
      normalizedStatus: args.normalizedStatus ?? "pending",
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
    const ordersToReconcile = activeOrders.filter(
      (order) => order.status !== "paid"
    )

    const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      ctx,
      ordersToReconcile
    )
    const matchedTotalsByOrderId = await loadMatchedPaymentTotalsByOrderId(
      ctx,
      ordersToReconcile
    )

    let updated = 0

    for (const order of ordersToReconcile) {
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

      if (currentPaidAmountMinor < currentAmountDueMinor) {
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

function normalizeLocationLabel(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : ""
  return trimmed || null
}

async function loadOrderLocationsByOrderId(
  ctx: QueryCtx,
  orders: CandidateOrder[]
): Promise<Map<string, string[]>> {
  const entries = await Promise.all(
    orders.map(async (order) => {
      const attendees = await loadOrderAttendeesWithExtensions(ctx, order._id)
      const locations = new Map<string, string>()

      for (const attendee of attendees) {
        const value = normalizeLocationLabel(attendee.location)
        if (!value) continue

        const key = value.toLowerCase()
        if (!locations.has(key)) {
          locations.set(key, value)
        }
      }

      return [String(order._id), Array.from(locations.values())] as const
    })
  )

  return new Map(entries)
}

function matchesLocationFilter(
  orderId: Id<"orders">,
  locationsByOrderId: Map<string, string[]>,
  location: string
) {
  const normalized = location.toLowerCase()
  const orderLocations = locationsByOrderId.get(String(orderId)) ?? []
  return orderLocations.some((value) => value.toLowerCase() === normalized)
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
    location?: string
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

  if (args.status) {
    const normalizedStatus = order.status ?? "pending"
    if (normalizedStatus !== args.status) {
      return false
    }
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
      .collect()
  } else if (args.status === "pending") {
    // Older rows can have an unset status but still represent pending orders.
    // Pending must therefore scan the full set rather than using the status index.
    orders = await ctx.db.query("orders").order("desc").collect()
  } else if (args.status) {
    orders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", args.status!))
      .order("desc")
      .collect()
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
    // Preserve core merge markers so visibility checks can exclude merged orders.
    mergedIntoOrderId: order.mergedIntoOrderId,
    mergedAt: order.mergedAt,
  }))
}

async function loadEventNamesById(
  ctx: QueryCtx,
  eventId?: string
): Promise<Map<string, string | null>> {
  const events = eventId
    ? [await ctx.db.get("events", eventId as Id<"events">)]
    : await ctx.db.query("events").take(500)
  return new Map(
    events.filter((event): event is NonNullable<typeof event> => Boolean(event)).map((event) => [String(event._id), event.title ?? null])
  )
}

async function loadEventSlugsById(ctx: QueryCtx, eventId?: string): Promise<Map<string, string>> {
  const events = eventId
    ? [await ctx.db.get("events", eventId as Id<"events">)]
    : await ctx.db.query("events").take(500)
  return new Map(
    events.filter((event): event is NonNullable<typeof event> => Boolean(event)).map((event) => [String(event._id), event.slug])
  )
}

async function loadEventSourceKindsById(
  ctx: QueryCtx,
  eventId?: string
): Promise<Map<string, "integration" | "internal">> {
  const events = eventId
    ? [await ctx.db.get("events", eventId as Id<"events">)]
    : await ctx.db.query("events").take(500)
  return new Map(
    events.filter((event): event is NonNullable<typeof event> => Boolean(event)).map((event) => [String(event._id), event.primarySourceKind])
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
    if (!isOrderAppliedPayment(payment)) {
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
    location: v.optional(v.string()),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  returns: v.object({
    totalRows: v.number(),
    totalPages: v.number(),
    totals: v.object({
      amountDueMinor: v.number(),
      matchedAmountMinor: v.number(),
      outstandingAmountMinor: v.number(),
    }),
    orders: v.array(orderLedgerRowValidator),
  }),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const candidates = await listCandidateOrders(ctx, args, 500)
    const eventSourceKindsById = await loadEventSourceKindsById(ctx)
    const location = normalizeLocationLabel(args.location)
    let orders = candidates
      .filter((order) => !isOrderRemoved(order))
      .filter((order) => !(order as any).mergedIntoOrderId)
      .filter((order) => isInternalEvent(eventSourceKindsById, order.eventId))
      .filter((order) => matchesOrderFilters(order, args))
      .sort(sortOrdersByNewest)

    if (location) {
      const locationsByOrderId = await loadOrderLocationsByOrderId(ctx, orders)
      orders = orders.filter((order) =>
        matchesLocationFilter(order._id, locationsByOrderId, location)
      )
    }

    // Filter out core-merged orders for totals and pagination
    const visibleOrders = orders.filter((o) => !(o as any).mergedIntoOrderId)

    const page = args.page ?? 1
    const pageSize = args.pageSize ?? 25
    const totalRows = visibleOrders.length
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
    const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      ctx,
      visibleOrders
    )
    const matchedPaymentTotalsByOrderId = await loadMatchedPaymentTotalsByOrderId(
      ctx,
      visibleOrders
    )

    const totals = visibleOrders.reduce(
      (acc, order) => {
        const amountDueMinor =
          amountDueBreakdownsByOrderId.get(String(order._id))?.amountDueMinor ??
          order.totalAmountMinor ??
          0
        const matchedAmountMinor =
          matchedPaymentTotalsByOrderId.get(String(order._id)) ?? 0
        const balance = deriveBalanceAmounts(amountDueMinor, matchedAmountMinor)

        acc.amountDueMinor += amountDueMinor
        acc.matchedAmountMinor += balance.appliedAmountMinor
        acc.outstandingAmountMinor += balance.outstandingAmountMinor
        return acc
      },
      {
        amountDueMinor: 0,
        matchedAmountMinor: 0,
        outstandingAmountMinor: 0,
      }
    )

    const skip = (page - 1) * pageSize
    const paginatedOrders = visibleOrders.slice(skip, skip + pageSize)

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
        matchedAmountMinor: matchedAmountMinor ?? 0,
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
      totals,
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
      .filter((o) => !(o as any).mergedIntoOrderId)
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
    limit: v.optional(v.number()),
  },
  returns: v.array(orderLedgerRowValidator),
  handler: async (ctx, args) => {
    const fromMs = args.from ?? 0
    const toMs = args.to ?? Date.now()
    const maxItems = Math.min(Math.max(Math.floor(args.limit ?? 500), 1), 500)

    // Query canonical orders table directly
    let orders: Doc<"orders">[]

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
      orders = await ctx.db.query("orders").order("desc").take(2000)
    }

    // Filter by date range in memory (orderedAt is not indexed)
    const filtered = orders.filter((order) => {
      if (isOrderRemoved(order)) return false
      // Exclude core-merged orders
      if (typeof order.mergedIntoOrderId === "string") return false

      const orderedAt = order.orderedAt ?? order.submittedAt ?? 0
      if (orderedAt < fromMs || orderedAt > toMs) return false

      if (args.status && order.status !== args.status) return false

      return true
    })

    const eventSourceKindsById = await loadEventSourceKindsById(ctx, args.eventId)
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

    const eventNamesById = await loadEventNamesById(ctx, args.eventId)
    const eventSlugsById = await loadEventSlugsById(ctx, args.eventId)

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

export const searchOrdersForMerge = query({
  args: {
    search: v.string(),
    eventId: v.union(v.id("events"), v.string()),
  },
  returns: v.array(
    v.object({
      orderId: v.id("orders"),
      bookerName: nullableStringValidator,
      bookerEmail: nullableStringValidator,
      bookingRef: nullableStringValidator,
      totalAmountMinor: v.union(v.number(), v.null()),
      orderedAt: nullableStringValidator,
    })
  ),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const needle = args.search.trim().toLowerCase()

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) =>
        q.eq("eventId", args.eventId as Id<"events">)
      )
      .order("desc")
      .take(200)

    const withExtensions = await loadOrdersWithExtensions(ctx, orders)
    const eventSourceKindsById = await loadEventSourceKindsById(ctx)

    const matches = withExtensions
      .filter(
        ({ order, extension }) =>
          !isOrderRemoved(extension) &&
          !isOrderMergedCore(order) &&
          isInternalEvent(eventSourceKindsById, order.eventId) &&
          (!needle ||
            (order.bookerName?.toLowerCase().includes(needle)) ||
            (order.bookerEmail?.toLowerCase().includes(needle)) ||
            (order.bookingRef?.toLowerCase().includes(needle)) ||
            (order.providerOrderId?.toLowerCase().includes(needle)))
      )
      .map(({ order }) => ({
        orderId: order._id,
        bookerName: order.bookerName ?? null,
        bookerEmail: order.bookerEmail ?? null,
        bookingRef: order.bookingRef ?? null,
        totalAmountMinor: order.totalAmountMinor ?? null,
        orderedAt: order.orderedAt
          ? new Date(order.orderedAt).toISOString()
          : order.submittedAt
            ? new Date(order.submittedAt).toISOString()
            : null,
      }))
      .slice(0, 10)

    return matches
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

    // Also treat core-merged orders as removed
    if (isOrderMergedCore(order)) return null

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

    const canonicalVisibleOrders = visibleOrders.filter(
      (o) =>
        isInternalEvent(eventSourceKindsById, o.eventId) &&
        !(o as any).mergedIntoOrderId
    )

    const payments = await ctx.db.query("payments").order("desc").take(1000)
    const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      ctx,
      canonicalVisibleOrders
    )
    const matchedPaymentTotalsByOrderId =
      await loadMatchedPaymentTotalsByOrderId(ctx, canonicalVisibleOrders)

    const statusCounts = {
      unassigned: 0,
      partial: 0,
      paid: 0,
      overpaid: 0,
    }

    let totalPaidAmount = 0

    for (const order of canonicalVisibleOrders) {
      const orderTotal =
        amountDueBreakdownsByOrderId.get(String(order._id))?.amountDueMinor ??
        order.totalAmountMinor ??
        0
      if (orderTotal <= 0) continue

      const matchedAmount = matchedPaymentTotalsByOrderId.get(String(order._id)) ?? 0
      const balance = deriveBalanceAmounts(orderTotal, matchedAmount)
      totalPaidAmount += balance.appliedAmountMinor

      if (matchedAmount === 0) {
        statusCounts.unassigned++
      } else if (matchedAmount >= orderTotal) {
        if (matchedAmount > orderTotal) {
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
  },
  returns: v.object({
    orderId: v.id("orders"),
    deletedAt: v.number(),
  }),
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

    const payments = await ctx.db
      .query("payments")
      .withIndex("orderId", (q) => q.eq("orderId", String(args.orderId)))
      .collect()

    const orderLinks = await ctx.db
      .query("tikkiePaymentLinks")
      .withIndex("orderId", (q) => q.eq("orderId", String(args.orderId)))
      .collect()

    const attendees = await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .collect()

    const attendeeIds = attendees.map((attendee) => attendee._id)

    const ticketSelections = await ctx.db
      .query("orderTicketSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .collect()

    const assignments = await ctx.db
      .query("orderAssignments")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .collect()

    const ttAttendees = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("orderId", (q) => q.eq("orderId", args.orderId))
      .collect()

    const familyMembers = attendeeIds.length
      ? await Promise.all(
          attendeeIds.map((attendeeId) =>
            ctx.db
              .query("attendeeFamilyMembers")
              .withIndex("attendeeId", (q) => q.eq("attendeeId", String(attendeeId)))
              .collect()
          )
        )
      : []

    const deletedAt = Date.now()

    if (extension) {
      await ctx.db.delete("ticketTailorOrders", extension._id)
    }

    for (const payment of payments) {
      await ctx.db.patch("payments", payment._id, {
        orderId: undefined,
        eventId: undefined,
        status: "unassigned",
        matchedAt: undefined,
        matchedBy: undefined,
      })
    }

    for (const link of orderLinks) {
      await ctx.db.delete("tikkiePaymentLinks", link._id)
    }

    for (const selection of ticketSelections) {
      await ctx.db.delete("orderTicketSelections", selection._id)
    }

    for (const assignment of assignments) {
      await ctx.db.delete("orderAssignments", assignment._id)
    }

    for (const ttAttendee of ttAttendees) {
      await ctx.db.delete("ticketTailorAttendees", ttAttendee._id)
    }

    for (const familyMemberGroup of familyMembers) {
      for (const familyMember of familyMemberGroup) {
        await ctx.db.delete("attendeeFamilyMembers", familyMember._id)
      }
    }

    for (const attendee of attendees) {
      await ctx.db.delete("orderAttendees", attendee._id)
    }

    await ctx.db.delete("orders", args.orderId)

    return {
      orderId: args.orderId,
      deletedAt,
    }
  },
})

export const mergeOrders = mutation({
  args: {
    sourceOrderIds: v.array(v.id("orders")),
    targetOrderId: v.id("orders"),
  },
  returns: v.object({
    targetOrderId: v.id("orders"),
    targetBookingRef: v.optional(v.string()),
    amountDueMinor: v.number(),
    movedAttendees: v.number(),
    movedPayments: v.number(),
    movedSources: v.number(),
    aliasCount: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const now = Date.now()

    // ── Input guardrails ──────────────────────────────────────────────
    if (args.sourceOrderIds.length === 0) {
      throw new Error("At least one source order is required")
    }

    const uniqueSourceIds = new Set(args.sourceOrderIds.map(String))
    if (uniqueSourceIds.size !== args.sourceOrderIds.length) {
      throw new Error("Duplicate source order IDs are not allowed")
    }

    if (uniqueSourceIds.has(String(args.targetOrderId))) {
      throw new Error("A source order cannot also be the target")
    }

    const target = await ctx.db.get("orders", args.targetOrderId)
    if (!target) throw new Error("Target order not found")

    if (typeof target.mergedIntoOrderId === "string") {
      throw new Error("Target order has already been merged")
    }

    const targetExt = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("orderId", (q) => q.eq("orderId", args.targetOrderId))
      .first()

    if (targetExt && isOrderRemoved(targetExt)) {
      throw new Error("Target order has been removed")
    }

    // ── Load and validate every source ─────────────────────────────────
    type SourceDoc = Doc<"orders">
    type SourceExt = Doc<"ticketTailorOrders"> | null

    const targetAttendees: Doc<"orderAttendees">[] = []
    for await (const attendee of ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.targetOrderId))) {
      targetAttendees.push(attendee)
    }

    const sources: Array<{
      order: SourceDoc
      extension: SourceExt
      attendees: Doc<"orderAttendees">[]
      ticketSelections: Doc<"orderTicketSelections">[]
      accommodationSelections: Doc<"orderAccommodationSelections">[]
      accommodationOptionSelections: Doc<"orderAccommodationOptionSelections">[]
      assignments: Doc<"orderAssignments">[]
      ticketTailorAttendees: Doc<"ticketTailorAttendees">[]
      payments: Doc<"payments">[]
      tikkiePayments: Doc<"tikkiePayments">[]
      tikkiePaymentLinks: Doc<"tikkiePaymentLinks">[]
    }> = []

    for (const sourceId of args.sourceOrderIds) {
      const source = await ctx.db.get("orders", sourceId)
      if (!source) throw new Error(`Source order ${sourceId} not found`)

      if (typeof source.mergedIntoOrderId === "string") {
        throw new Error(`Source order ${sourceId} has already been merged`)
      }

      if (String(source.eventId ?? "") !== String(target.eventId ?? "")) {
        throw new Error(
          `Source order ${sourceId} belongs to a different event`
        )
      }

      const extension = await ctx.db
        .query("ticketTailorOrders")
        .withIndex("orderId", (q) => q.eq("orderId", sourceId))
        .first()

      if (extension && isOrderRemoved(extension)) {
        throw new Error(`Source order ${sourceId} has been removed`)
      }

      // Load all canonical child rows for ownership preflight.
      const attendees: Doc<"orderAttendees">[] = []
      for await (const row of ctx.db
        .query("orderAttendees")
        .withIndex("by_orderId", (q) => q.eq("orderId", sourceId))) {
        attendees.push(row)
      }

      const ticketSelections: Doc<"orderTicketSelections">[] = []
      for await (const row of ctx.db
        .query("orderTicketSelections")
        .withIndex("by_orderId", (q) => q.eq("orderId", sourceId))) {
        ticketSelections.push(row)
      }

      const accommodationSelections: Doc<"orderAccommodationSelections">[] = []
      for await (const row of ctx.db
        .query("orderAccommodationSelections")
        .withIndex("by_orderId", (q) => q.eq("orderId", sourceId))) {
        accommodationSelections.push(row)
      }

      const accommodationOptionSelections: Doc<"orderAccommodationOptionSelections">[] = []
      for await (const row of ctx.db
        .query("orderAccommodationOptionSelections")
        .withIndex("by_orderId", (q) => q.eq("orderId", sourceId))) {
        accommodationOptionSelections.push(row)
      }

      const assignments: Doc<"orderAssignments">[] = []
      for await (const row of ctx.db
        .query("orderAssignments")
        .withIndex("by_orderId", (q) => q.eq("orderId", sourceId))) {
        assignments.push(row)
      }

      const ticketTailorAttendees: Doc<"ticketTailorAttendees">[] = []
      for await (const row of ctx.db
        .query("ticketTailorAttendees")
        .withIndex("orderId", (q) => q.eq("orderId", sourceId))) {
        ticketTailorAttendees.push(row)
      }

      // Legacy payment/link rows can be keyed by the canonical Convex order
      // ID or by either provider order ID. Normalize every matching row to the
      // target so historical provider-keyed money is not lost in the merge.
      const providerOrderKeys = new Set(
        [
          String(sourceId),
          source.providerOrderId,
          extension?.providerOrderId,
        ].filter((value): value is string => Boolean(value))
      )
      const paymentsById = new Map<string, Doc<"payments">>()
      const tikkiePaymentsById = new Map<string, Doc<"tikkiePayments">>()
      const tikkiePaymentLinksById = new Map<
        string,
        Doc<"tikkiePaymentLinks">
      >()
      for (const orderKey of providerOrderKeys) {
        for await (const row of ctx.db
          .query("payments")
          .withIndex("orderId", (q) => q.eq("orderId", orderKey))) {
          paymentsById.set(String(row._id), row)
        }
        for await (const row of ctx.db
          .query("tikkiePayments")
          .withIndex("orderId", (q) => q.eq("orderId", orderKey))) {
          tikkiePaymentsById.set(String(row._id), row)
        }
        for await (const row of ctx.db
          .query("tikkiePaymentLinks")
          .withIndex("orderId", (q) => q.eq("orderId", orderKey))) {
          tikkiePaymentLinksById.set(String(row._id), row)
        }
      }
      const payments = Array.from(paymentsById.values())
      const tikkiePayments = Array.from(tikkiePaymentsById.values())
      const tikkiePaymentLinks = Array.from(tikkiePaymentLinksById.values())

      // Preflight: attendee cardinality
      const attendeeIds = new Set(attendees.map((a) => String(a._id)))
      for (const sel of ticketSelections) {
        if (!attendeeIds.has(String(sel.attendeeId))) {
          throw new Error(
            `Source order ${sourceId}: ticket selection references non-existent attendee ${sel.attendeeId}`
          )
        }
      }
      // One ticket per attendee
      const ticketCountByAttendee = new Map<string, number>()
      for (const sel of ticketSelections) {
        const key = String(sel.attendeeId)
        ticketCountByAttendee.set(key, (ticketCountByAttendee.get(key) ?? 0) + 1)
      }
      for (const [attendeeId, count] of ticketCountByAttendee) {
        if (count > 1) {
          throw new Error(
            `Source order ${sourceId}: attendee ${attendeeId} has ${count} ticket selections (expected 1)`
          )
        }
      }

      // Preflight: accommodation option child ownership
      for (const optionRow of accommodationOptionSelections) {
        if (!attendeeIds.has(String(optionRow.attendeeId))) {
          throw new Error(
            `Source order ${sourceId}: accommodation option row references non-existent attendee ${optionRow.attendeeId}`
          )
        }
      }

      sources.push({
        order: source,
        extension,
        attendees,
        ticketSelections,
        accommodationSelections,
        accommodationOptionSelections,
        assignments,
        ticketTailorAttendees,
        payments,
        tikkiePayments,
        tikkiePaymentLinks,
      })
    }

    // Public accommodation edits key drafts by attendeeKey. Reject any
    // collision before writes so a merge can never make two attendees share a
    // mutable preference identity.
    const attendeeKeys = new Set<string>()
    for (const attendee of targetAttendees) {
      if (attendeeKeys.has(attendee.attendeeKey)) {
        throw new Error(
          `Target order has duplicate attendee key ${attendee.attendeeKey}`
        )
      }
      attendeeKeys.add(attendee.attendeeKey)
    }
    for (const source of sources) {
      for (const attendee of source.attendees) {
        if (attendeeKeys.has(attendee.attendeeKey)) {
          throw new Error(
            `Attendee key ${attendee.attendeeKey} would collide during merge`
          )
        }
        attendeeKeys.add(attendee.attendeeKey)
      }
    }

    // ── Booking-ref collision checks ───────────────────────────────────
    // The target's booking ref is canonical; source refs become aliases.
    const targetBookingRef = target.bookingRef

    for (const source of sources) {
      const sourceRef = source.order.bookingRef
      if (!sourceRef) continue
      const normalizedRef = sourceRef.trim().toUpperCase()

      // Collision with target's canonical ref
      if (targetBookingRef && normalizedRef === targetBookingRef.trim().toUpperCase()) {
        throw new Error(
          `Source order ${source.order._id} has the same booking reference as the target`
        )
      }

      // Collision with another source's ref
      for (const other of sources) {
        if (other.order._id === source.order._id) continue
        const otherRef = other.order.bookingRef
        if (!otherRef) continue
        if (normalizedRef === otherRef.trim().toUpperCase()) {
          throw new Error(
            `Source orders ${source.order._id} and ${other.order._id} have the same booking reference`
          )
        }
      }

      // Collision with an existing alias mapped elsewhere
      const existingAlias = await ctx.db
        .query("orderBookingRefAliases")
        .withIndex("by_bookingRef", (q) => q.eq("bookingRef", normalizedRef))
        .first()
      if (existingAlias && String(existingAlias.targetOrderId) !== String(args.targetOrderId)) {
        throw new Error(
          `Booking reference ${normalizedRef} is already mapped to another order`
        )
      }
    }

    // ── Execute writes ─────────────────────────────────────────────────
    let movedAttendees = 0
    let movedPayments = 0
    let aliasCount = 0

    for (const source of sources) {
      // Re-link every canonical child ownership row
      for (const row of source.attendees) {
        await ctx.db.patch("orderAttendees", row._id, {
          orderId: args.targetOrderId,
        })
        movedAttendees++
      }

      for (const row of source.ticketSelections) {
        await ctx.db.patch("orderTicketSelections", row._id, {
          orderId: args.targetOrderId,
        })
      }

      for (const row of source.accommodationSelections) {
        await ctx.db.patch("orderAccommodationSelections", row._id, {
          orderId: args.targetOrderId,
        })
      }

      for (const row of source.accommodationOptionSelections) {
        await ctx.db.patch("orderAccommodationOptionSelections", row._id, {
          orderId: args.targetOrderId,
        })
      }

      for (const row of source.assignments) {
        await ctx.db.patch("orderAssignments", row._id, {
          orderId: args.targetOrderId,
        })
      }

      for (const row of source.ticketTailorAttendees) {
        await ctx.db.patch("ticketTailorAttendees", row._id, {
          orderId: args.targetOrderId,
        })
      }

      // Move payment rows by patching the indexed order key
      for (const row of source.payments) {
        await ctx.db.patch("payments", row._id, {
          orderId: String(args.targetOrderId),
        })
        movedPayments++
      }

      for (const row of source.tikkiePayments) {
        await ctx.db.patch("tikkiePayments", row._id, {
          orderId: String(args.targetOrderId),
        })
      }

      // Move tikkie payment link rows
      for (const row of source.tikkiePaymentLinks) {
        await ctx.db.patch("tikkiePaymentLinks", row._id, {
          orderId: String(args.targetOrderId),
        })
      }

      // Create alias row for preserved source booking ref
      const sourceRef = source.order.bookingRef
      if (sourceRef) {
        const normalizedRef = sourceRef.trim().toUpperCase()
        // Idempotent: skip if alias already exists for this source
        const existingAlias = await ctx.db
          .query("orderBookingRefAliases")
          .withIndex("by_bookingRef", (q) => q.eq("bookingRef", normalizedRef))
          .first()
        if (!existingAlias) {
          await ctx.db.insert("orderBookingRefAliases", {
            bookingRef: normalizedRef,
            sourceOrderId: source.order._id,
            targetOrderId: args.targetOrderId,
            canonicalBookingRef: targetBookingRef ?? undefined,
            createdAt: now,
          })
          aliasCount++
        }
      }

      // Mark source order as merged (core merge markers)
      await ctx.db.patch(source.order._id, {
        mergedIntoOrderId: args.targetOrderId,
        mergedAt: now,
        mergeReason: `Merged into ${String(args.targetOrderId)}`,
      })

      // Mark Ticket Tailor extension removed when present
      if (source.extension) {
        await ctx.db.patch("ticketTailorOrders", source.extension._id, {
          removedAt: now,
          removedReason: `merged_into_${String(args.targetOrderId)}`,
        })
      }
    }

    // ── Recompute target canonical amount due ──────────────────────────
    const breakdowns = await loadOrderAmountDueBreakdowns(ctx, [target])
    const amountDueMinor =
      breakdowns.get(String(args.targetOrderId))?.amountDueMinor ?? 0

    return {
      targetOrderId: args.targetOrderId,
      targetBookingRef: targetBookingRef ?? undefined,
      amountDueMinor,
      movedAttendees,
      movedPayments,
      movedSources: sources.length,
      aliasCount,
    }
  },
})
