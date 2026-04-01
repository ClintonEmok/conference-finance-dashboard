import { query, mutation, internalMutation } from "../_generated/server"
import { v } from "convex/values"
import { requireIdentity } from "../auth"
import type { Id } from "../_generated/dataModel"

// Helper functions

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined
}

function parseDate(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value * 1000
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? undefined : d.getTime()
  }
  return undefined
}

function toMinorAmount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value)
  }
  if (typeof value === "string") {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.round(n * 100)
  }
  return undefined
}

export function resolveBackfillTotalAmountMinor(input: {
  currentTotalAmountMinor?: number
  rawPayload?: unknown
}): number | null {
  if (typeof input.currentTotalAmountMinor === "number") {
    return null
  }

  const raw =
    typeof input.rawPayload === "object" &&
    input.rawPayload !== null &&
    !Array.isArray(input.rawPayload)
      ? (input.rawPayload as Record<string, unknown>)
      : null

  if (!raw) {
    return null
  }

  const resolved =
    toMinorAmount(raw.total) ??
    toMinorAmount(raw.amount) ??
    toMinorAmount(raw.total_amount)

  return typeof resolved === "number" ? resolved : null
}

// Public mutations (require authentication)

export const upsertTicketTailorOrder = mutation({
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
    normalizationNote: v.optional(v.string()),
    buyerEmail: v.optional(v.string()),
    buyerName: v.optional(v.string()),
    currency: v.optional(v.string()),
    totalAmountMinor: v.optional(v.number()),
    orderedAt: v.optional(v.number()),
    refundedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    rawPayload: v.any(),
  },
  returns: v.id("ticketTailorOrders"),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    // Upsert the canonical orders record first
    const existingOrder = await ctx.db
      .query("orders")
      .withIndex("by_providerOrderId", (q) =>
        q.eq("providerOrderId", args.providerOrderId)
      )
      .first()

    let orderId: Id<"orders">

    const orderPatchFields = {
      providerEventId: args.providerEventId,
      status: args.normalizedStatus,
      bookerEmail: args.buyerEmail,
      bookerName: args.buyerName,
      currency: args.currency,
      totalAmountMinor: args.totalAmountMinor,
      orderedAt: args.orderedAt,
    }

    if (existingOrder) {
      orderId = existingOrder._id
      await ctx.db.patch("orders", existingOrder._id, orderPatchFields)
    } else {
      const resolvedEventId =
        typeof args.eventId === "string" && !args.eventId.startsWith("id_")
          ? undefined
          : (args.eventId as Id<"events">)

      orderId = await ctx.db.insert("orders", {
        source: "integration",
        providerOrderId: args.providerOrderId,
        eventId: resolvedEventId,
        ...orderPatchFields,
      })
    }

    // Upsert ticketTailorOrders extension
    const existingTT = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("providerOrderId", (q) =>
        q.eq("providerOrderId", args.providerOrderId)
      )
      .first()

    const ttFields = {
      orderId,
      providerEventId: args.providerEventId,
      providerStatus: args.providerStatus,
      normalizedStatus: args.normalizedStatus,
      normalizationNote: args.normalizationNote,
      refundedAt: args.refundedAt,
      cancelledAt: args.cancelledAt,
      rawPayload: args.rawPayload,
    }

    if (existingTT) {
      await ctx.db.patch("ticketTailorOrders", existingTT._id, {
        ...ttFields,
        isArchived: false,
        archiveReason: undefined,
      })
      return existingTT._id
    }

    const id = await ctx.db.insert("ticketTailorOrders", {
      providerOrderId: args.providerOrderId,
      ...ttFields,
      isArchived: false,
    })
    return id
  },
})

export const archiveMissingOrdersForEvent = mutation({
  args: {
    providerEventId: v.string(),
    seenProviderOrderIds: v.array(v.string()),
    reason: v.optional(v.string()),
  },
  returns: v.object({
    scanned: v.number(),
    archived: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const orders = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("providerEventId", (q) =>
        q.eq("providerEventId", args.providerEventId)
      )
      .collect()

    const seen = new Set(args.seenProviderOrderIds)
    const now = Date.now()
    const reason = args.reason?.trim() || "missing_from_provider_sync"
    let archived = 0

    for (const order of orders) {
      if (order.removedAt) {
        continue
      }

      if (seen.has(order.providerOrderId)) {
        continue
      }

      await ctx.db.patch("ticketTailorOrders", order._id, {
        isArchived: true,
        archivedAt: order.archivedAt ?? now,
        archiveReason: reason,
        normalizedStatus: "cancelled",
        cancelledAt: order.cancelledAt ?? now,
        normalizationNote:
          "Order missing from latest Ticket Tailor sync; archived locally.",
      })
      archived += 1
    }

    return {
      scanned: orders.length,
      archived,
    }
  },
})

// Public query

export const getTicketTailorOrderByProviderId = query({
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

// Internal mutations (no auth - for cron/action use)

export const internalUpsertTicketTailorOrder = internalMutation({
  args: {
    providerOrderId: v.string(),
    providerEventId: v.string(),
    normalizedStatus: v.optional(
      v.union(
        v.literal("paid"),
        v.literal("refunded"),
        v.literal("cancelled"),
        v.literal("pending")
      )
    ),
    providerStatus: v.optional(v.string()),
    normalizationNote: v.optional(v.string()),
    rawPayload: v.any(),
    isArchived: v.optional(v.boolean()),
  },
  returns: v.object({
    orderId: v.id("orders"),
    ticketTailorOrderId: v.id("ticketTailorOrders"),
  }),
  handler: async (ctx, args) => {
    // Extract buyer info from rawPayload
    const raw = args.rawPayload as Record<string, unknown>
    const buyer =
      pickString(raw.buyer_email) ??
      pickString((raw.buyer as Record<string, unknown>)?.email) ??
      pickString((raw.buyer_details as Record<string, unknown>)?.email)

    const buyerFirst =
      pickString(raw.buyer_first_name) ??
      pickString((raw.buyer as Record<string, unknown>)?.first_name) ??
      pickString((raw.buyer_details as Record<string, unknown>)?.first_name)
    const buyerLast =
      pickString(raw.buyer_last_name) ??
      pickString((raw.buyer as Record<string, unknown>)?.last_name) ??
      pickString((raw.buyer_details as Record<string, unknown>)?.last_name)
    const buyerName =
      (buyerFirst && buyerLast ? `${buyerFirst} ${buyerLast}` : undefined) ??
      buyerFirst ??
      buyerLast ??
      pickString(raw.buyer_name) ??
      pickString((raw.buyer as Record<string, unknown>)?.name)

    const currency = pickString(raw.currency) ?? pickString(raw.currency_code)
    const totalAmountMinor =
      toMinorAmount(raw.total) ??
      toMinorAmount(raw.amount) ??
      toMinorAmount(raw.total_amount)
    const orderedAt =
      parseDate(raw.created_at) ??
      parseDate(raw.date) ??
      parseDate(raw.order_date)
    const refundedAt = parseDate(raw.refunded_at)
    const cancelledAt = parseDate(raw.cancelled_at)

    // Look up existing ticketTailorOrders by providerOrderId index
    const existingTT = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("providerOrderId", (q) =>
        q.eq("providerOrderId", args.providerOrderId)
      )
      .first()

    // Look up or create the canonical orders record
    const existingOrder = await ctx.db
      .query("orders")
      .withIndex("by_providerOrderId", (q) =>
        q.eq("providerOrderId", args.providerOrderId)
      )
      .first()

    let orderId: Id<"orders">

    if (existingOrder) {
      orderId = existingOrder._id
      await ctx.db.patch("orders", existingOrder._id, {
        providerEventId: args.providerEventId,
        status: args.normalizedStatus,
        bookerEmail: buyer,
        bookerName: buyerName,
        currency: currency,
        totalAmountMinor: totalAmountMinor,
        orderedAt: orderedAt,
      })
    } else {
      orderId = await ctx.db.insert("orders", {
        source: "integration",
        providerOrderId: args.providerOrderId,
        providerEventId: args.providerEventId,
        status: args.normalizedStatus,
        bookerEmail: buyer,
        bookerName: buyerName,
        currency: currency,
        totalAmountMinor: totalAmountMinor,
        orderedAt: orderedAt,
      })
    }

    // Upsert ticketTailorOrders (extension) with slimmed fields
    let ticketTailorOrderId: Id<"ticketTailorOrders">

    if (existingTT) {
      ticketTailorOrderId = existingTT._id
      await ctx.db.patch("ticketTailorOrders", existingTT._id, {
        orderId,
        providerEventId: args.providerEventId,
        providerStatus: args.providerStatus,
        normalizedStatus: args.normalizedStatus,
        normalizationNote: args.normalizationNote,
        isArchived: args.isArchived ?? false,
        archiveReason: undefined,
        refundedAt: refundedAt,
        cancelledAt: cancelledAt,
        rawPayload: args.rawPayload,
      })
    } else {
      ticketTailorOrderId = await ctx.db.insert("ticketTailorOrders", {
        providerOrderId: args.providerOrderId,
        providerEventId: args.providerEventId,
        orderId,
        providerStatus: args.providerStatus,
        normalizedStatus: args.normalizedStatus,
        normalizationNote: args.normalizationNote,
        isArchived: args.isArchived ?? false,
        refundedAt: refundedAt,
        cancelledAt: cancelledAt,
        rawPayload: args.rawPayload,
      })
    }

    return { orderId, ticketTailorOrderId }
  },
})

export const internalArchiveMissingOrdersForEvent = internalMutation({
  args: {
    providerEventId: v.string(),
    seenProviderOrderIds: v.array(v.string()),
    reason: v.optional(v.string()),
  },
  returns: v.object({
    scanned: v.number(),
    archived: v.number(),
  }),
  handler: async (ctx, args) => {
    // Query ticketTailorOrders by providerEventId index
    const ttOrders = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("providerEventId", (q) =>
        q.eq("providerEventId", args.providerEventId)
      )
      .collect()

    const seen = new Set(args.seenProviderOrderIds)
    const now = Date.now()
    const reason = args.reason?.trim() || "missing_from_provider_sync"
    let archived = 0

    for (const ttOrder of ttOrders) {
      if (ttOrder.removedAt) {
        continue
      }

      if (seen.has(ttOrder.providerOrderId)) {
        continue
      }

      // Patch ticketTailorOrders (extension)
      await ctx.db.patch("ticketTailorOrders", ttOrder._id, {
        isArchived: true,
        archivedAt: ttOrder.archivedAt ?? now,
        archiveReason: reason,
        normalizedStatus: "cancelled",
        cancelledAt: ttOrder.cancelledAt ?? now,
        normalizationNote:
          "Order missing from latest Ticket Tailor sync; archived locally.",
      })

      // Also patch the linked orders record (core) if it exists
      if (ttOrder.orderId) {
        const order = await ctx.db.get("orders", ttOrder.orderId)
        if (order) {
          await ctx.db.patch("orders", order._id, {
            status: "cancelled",
          })
        }
      }

      archived += 1
    }

    // Also query orders table to find any orders without corresponding TT records
    // and mark them as cancelled (orphaned integration orders)
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_providerEventId", (q) =>
        q.eq("providerEventId", args.providerEventId)
      )
      .collect()

    for (const order of orders) {
      if (order.providerOrderId && !seen.has(order.providerOrderId)) {
        // Check if there's a corresponding TT order
        const ttOrder = await ctx.db
          .query("ticketTailorOrders")
          .withIndex("providerOrderId", (q) =>
            q.eq("providerOrderId", order.providerOrderId!)
          )
          .first()

        if (!ttOrder || ttOrder.isArchived) {
          await ctx.db.patch("orders", order._id, {
            status: "cancelled",
          })
        }
      }
    }

    return {
      scanned: ttOrders.length,
      archived,
    }
  },
})

export const internalBackfillMissingOrderTotals = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    scanned: v.number(),
    patched: v.number(),
    unchanged: v.number(),
  }),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 250)))
    const orders = await ctx.db.query("orders").order("desc").take(limit)

    let patched = 0
    let unchanged = 0

    for (const order of orders) {
      if (order.source !== "integration") {
        unchanged += 1
        continue
      }

      if (typeof order.totalAmountMinor === "number") {
        unchanged += 1
        continue
      }

      const extension = await ctx.db
        .query("ticketTailorOrders")
        .withIndex("orderId", (q) => q.eq("orderId", order._id))
        .first()

      const backfilledTotal = resolveBackfillTotalAmountMinor({
        currentTotalAmountMinor: order.totalAmountMinor,
        rawPayload: extension?.rawPayload,
      })

      if (typeof backfilledTotal !== "number") {
        unchanged += 1
        continue
      }

      await ctx.db.patch("orders", order._id, {
        totalAmountMinor: backfilledTotal,
      })
      patched += 1
    }

    return {
      scanned: orders.length,
      patched,
      unchanged,
    }
  },
})
