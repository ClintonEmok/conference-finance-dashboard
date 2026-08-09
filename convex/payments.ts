import { query, mutation, internalMutation } from "./_generated/server"
import { v } from "convex/values"
import { paginationOptsValidator } from "convex/server"
import { requireIdentity } from "./auth"
import type { Id } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"
import {
  evaluateOrderPaymentMatch,
  type OrderPaymentMatchCandidate,
} from "../lib/domain/finance/payment-matching"
import {
  buildDonationClassification,
  deriveBalanceAmounts,
  isOrderAppliedPayment,
} from "../lib/domain/finance/amounts"
import {
  paymentSourceValidator,
  paymentStatusValidator,
  paymentDocValidator,
} from "../lib/types/payment"
import { loadOrderAmountDueBreakdowns } from "./finance"

// ---------------------------------------------------------------------------
// Shared cleanup helper for legacy Tikkie payment records.
// Both the public and internal cleanup mutations delegate to this function.
// ---------------------------------------------------------------------------
async function cleanupLegacyTikkiePaymentsHelper(
  ctx: MutationCtx
): Promise<{ scanned: number; patched: number }> {
  const payments = await ctx.db
    .query("payments")
    .withIndex("source_sourceId", (q) => q.eq("source", "tikkie"))
    .take(500)

  let scanned = 0
  let patched = 0

  for (const payment of payments) {
    scanned += 1

    const payload =
      typeof payment.providerPayload === "object" &&
      payment.providerPayload !== null &&
      !Array.isArray(payment.providerPayload)
        ? (payment.providerPayload as Record<string, unknown>)
        : null

    if (!payload) continue

    const sourceIdCandidate =
      typeof payload.paymentToken === "string" ? payload.paymentToken : null
    const payerNameCandidate =
      typeof payload.counterPartyName === "string"
        ? payload.counterPartyName.trim()
        : null
    const payerAccountCandidate =
      typeof payload.counterPartyAccountNumber === "string"
        ? payload.counterPartyAccountNumber
        : undefined
    const amountCandidate =
      typeof payload.amountInCents === "number" &&
      Number.isInteger(payload.amountInCents) &&
      payload.amountInCents >= 0
        ? payload.amountInCents
        : null
    const paidAtCandidateRaw =
      typeof payload.createdDateTime === "string"
        ? Date.parse(payload.createdDateTime)
        : Number.NaN
    const paidAtCandidate =
      Number.isFinite(paidAtCandidateRaw) && paidAtCandidateRaw > 0
        ? paidAtCandidateRaw
        : null

    const updates: {
      sourceId?: string
      payerName?: string
      payerAccountNumber?: string
      amountMinor?: number
      paidAt?: number
    } = {}

    if (!payment.sourceId && sourceIdCandidate) {
      updates.sourceId = sourceIdCandidate
    }
    if (
      payerNameCandidate &&
      payment.payerName !== payerNameCandidate &&
      payerNameCandidate.length > 0
    ) {
      updates.payerName = payerNameCandidate
    }
    if (
      payerAccountCandidate &&
      payment.payerAccountNumber !== payerAccountCandidate
    ) {
      updates.payerAccountNumber = payerAccountCandidate
    }
    if (amountCandidate !== null && payment.amountMinor !== amountCandidate) {
      updates.amountMinor = amountCandidate
    }
    if (paidAtCandidate !== null && payment.paidAt !== paidAtCandidate) {
      updates.paidAt = paidAtCandidate
    }

    if (Object.keys(updates).length === 0) continue

    await ctx.db.patch(payment._id, updates)
    patched += 1
  }

  return { scanned, patched }
}

async function resolveCanonicalOrderId(
  ctx: MutationCtx,
  orderId: string | undefined
): Promise<Id<"orders"> | undefined> {
  const normalized = orderId?.trim()
  if (!normalized) {
    return undefined
  }

  const byProviderOrder = await ctx.db
    .query("orders")
    .withIndex("by_providerOrderId", (q) => q.eq("providerOrderId", normalized))
    .first()

  if (byProviderOrder) {
    return byProviderOrder._id
  }

  const normalizedId = ctx.db.normalizeId("orders", normalized)
  if (!normalizedId) {
    throw new Error("Order not found")
  }

  const existingOrder = await ctx.db.get("orders", normalizedId)
  if (!existingOrder) {
    throw new Error("Order not found")
  }

  return existingOrder._id
}

export const getPayments = query({
  args: {
    eventId: v.optional(v.id("events")),
    orderId: v.optional(v.string()),
    source: v.optional(paymentSourceValidator),
    sourceId: v.optional(v.string()),
    status: v.optional(paymentStatusValidator),
    paginationOpts: v.optional(paginationOptsValidator),
  },
  returns: v.array(paymentDocValidator),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    // Bounded lookups: indexed queries with natural limits
    if (args.source && args.sourceId) {
      // Single payment by source+sourceId
      const payment = await ctx.db
        .query("payments")
        .withIndex("source_sourceId", (q) =>
          q.eq("source", args.source!).eq("sourceId", args.sourceId!)
        )
        .first()
      return payment ? [payment] : []
    }

    if (args.eventId) {
      const paymentsById = new Map<string, any>()

      const directPayments = await ctx.db
        .query("payments")
        .withIndex("eventId", (q) => q.eq("eventId", args.eventId!))
        .take(500)
      for (const payment of directPayments) {
        paymentsById.set(String(payment._id), payment)
      }

      const eventOrders = await ctx.db
        .query("orders")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId!))
        .take(500)

      for (const order of eventOrders) {
        const orderPayments = await ctx.db
          .query("payments")
          .withIndex("orderId", (q) => q.eq("orderId", String(order._id)))
          .take(100)

        for (const payment of orderPayments) {
          paymentsById.set(String(payment._id), payment)
        }
      }

      return Array.from(paymentsById.values()).filter((payment) => {
        if (args.status && payment.status !== args.status) return false
        if (args.source && payment.source !== args.source) return false
        if (args.orderId && payment.orderId !== args.orderId) return false
        return true
      })
    }

    if (args.orderId) {
      // Bounded: one order has limited payments
      return await ctx.db
        .query("payments")
        .withIndex("orderId", (q) => q.eq("orderId", args.orderId!))
        .take(100)
    }

    if (args.status) {
      // Bounded: indexed status query, capped
      return await ctx.db
        .query("payments")
        .withIndex("status", (q) => q.eq("status", args.status!))
        .take(500)
    }

    // Growing result set: paginated
    const base = ctx.db.query("payments")
    if (args.paginationOpts) {
      // Note: paginate returns {page, isDone, continueCursor} not an array
      // so callers requesting pagination must handle the shape
      return (await base.paginate(args.paginationOpts)) as any
    }

    // Backward-compatible: bounded fallback
    return await base.take(1000)
  },
})

export const getPaymentById = query({
  args: { paymentId: v.id("payments") },
  returns: v.union(paymentDocValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get("payments", args.paymentId)
  },
})

export const getUnassignedPayments = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    // Bounded: indexed status query, capped
    return await ctx.db
      .query("payments")
      .withIndex("status", (q) => q.eq("status", "unassigned"))
      .take(500)
  },
})

export const createPayment = mutation({
  args: {
    source: paymentSourceValidator,
    sourceId: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
    orderId: v.optional(v.string()),
    payerName: v.string(),
    payerAccountNumber: v.optional(v.string()),
    amountMinor: v.number(),
    paidAt: v.number(),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(paymentStatusValidator),
    matchedBy: v.optional(v.string()),
    providerPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const canonicalOrderId = await resolveCanonicalOrderId(ctx, args.orderId)
    const canonicalEventId =
      args.eventId ??
      (canonicalOrderId
        ? (await ctx.db.get("orders", canonicalOrderId))?.eventId
        : undefined)
    const id = await ctx.db.insert("payments", {
      ...args,
      eventId: canonicalEventId,
      orderId: canonicalOrderId,
      status:
        args.status ?? (canonicalOrderId ? "manual_assignment" : "unassigned"),
      matchedAt: canonicalOrderId ? Date.now() : undefined,
    })
    return id
  },
})

export const upsertTikkiePayment = mutation({
  args: {
    sourceId: v.string(),
    payerName: v.string(),
    payerAccountNumber: v.optional(v.string()),
    amountMinor: v.number(),
    paidAt: v.number(),
    providerPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const existing = await ctx.db
      .query("payments")
      .withIndex("source_sourceId", (q) =>
        q.eq("source", "tikkie").eq("sourceId", args.sourceId)
      )
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, {
        payerName: args.payerName,
        payerAccountNumber: args.payerAccountNumber,
        amountMinor: args.amountMinor,
        paidAt: args.paidAt,
        providerPayload: args.providerPayload,
      })

      return { id: existing._id, inserted: false, updated: true }
    }

    const id = await ctx.db.insert("payments", {
      source: "tikkie",
      sourceId: args.sourceId,
      payerName: args.payerName,
      payerAccountNumber: args.payerAccountNumber,
      amountMinor: args.amountMinor,
      paidAt: args.paidAt,
      providerPayload: args.providerPayload,
      status: "unassigned",
    })

    return { id, inserted: true, updated: false }
  },
})

export const cleanupLegacyTikkiePayments = mutation({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    return await cleanupLegacyTikkiePaymentsHelper(ctx)
  },
})

export const assignPaymentToOrder = mutation({
  args: {
    paymentId: v.id("payments"),
    orderId: v.id("orders"),
    status: v.optional(
      v.union(v.literal("auto_matched"), v.literal("manual_assignment"))
    ),
    matchedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const canonicalOrderId = await resolveCanonicalOrderId(ctx, args.orderId)
    if (!canonicalOrderId) {
      throw new Error("Order not found")
    }
    const order = await ctx.db.get("orders", canonicalOrderId)
    await ctx.db.patch("payments", args.paymentId, {
      orderId: canonicalOrderId,
      eventId: order?.eventId,
      donationKind: undefined,
      status: args.status ?? "manual_assignment",
      matchedAt: Date.now(),
      matchedBy: args.matchedBy,
    })
    return args.paymentId
  },
})

export const unassignPayment = mutation({
  args: {
    paymentId: v.id("payments"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await ctx.db.patch("payments", args.paymentId, {
      orderId: undefined,
      eventId: undefined,
      donationKind: undefined,
      status: "unassigned",
      matchedAt: undefined,
      matchedBy: undefined,
    })
    return args.paymentId
  },
})

export const markPaymentAsDonation = mutation({
  args: {
    paymentId: v.id("payments"),
    eventId: v.optional(v.id("events")),
    matchedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const payment = await ctx.db.get("payments", args.paymentId)
    if (!payment) {
      throw new Error("Payment not found")
    }

    if (payment.status === "donation") {
      return args.paymentId
    }

    const order = payment.orderId
      ? await ctx.db.get("orders", payment.orderId as Id<"orders">)
      : null

    const eventId = args.eventId ?? order?.eventId ?? payment.eventId
    if (!eventId) {
      throw new Error("Event not found for donation classification")
    }

    const donationClassification = buildDonationClassification({
      orderId: payment.orderId,
      eventId,
    })

    await ctx.db.patch("payments", args.paymentId, {
      ...donationClassification,
      matchedAt: Date.now(),
      matchedBy: args.matchedBy,
    })

    return args.paymentId
  },
})

export const createStandaloneDonation = mutation({
  args: {
    eventId: v.id("events"),
    payerName: v.string(),
    amountMinor: v.number(),
    paidAt: v.number(),
    source: v.union(v.literal("cash"), v.literal("bank_transfer")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const event = await ctx.db.get("events", args.eventId)
    if (!event) {
      throw new Error("Event not found")
    }

    const payerName = args.payerName.trim()
    if (!payerName) {
      throw new Error("Payer name is required")
    }

    if (
      !Number.isFinite(args.amountMinor) ||
      !Number.isInteger(args.amountMinor) ||
      args.amountMinor <= 0
    ) {
      throw new Error("Amount must be a positive integer")
    }

    if (
      !Number.isFinite(args.paidAt) ||
      !Number.isInteger(args.paidAt) ||
      args.paidAt <= 0
    ) {
      throw new Error("Paid date must be a valid timestamp")
    }

    const id = await ctx.db.insert("payments", {
      source: args.source,
      payerName,
      amountMinor: args.amountMinor,
      paidAt: args.paidAt,
      eventId: args.eventId,
      donationKind: "standalone",
      status: "donation",
      notes: args.notes?.trim() || undefined,
    })

    return id
  },
})

export const getStandaloneDonations = query({
  args: {
    eventId: v.optional(v.id("events")),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    if (args.eventId) {
      if (args.from !== undefined && args.to !== undefined) {
        return await ctx.db
          .query("payments")
          .withIndex("by_donationKind_and_eventId_and_paidAt", (q) =>
            q
              .eq("donationKind", "standalone")
              .eq("eventId", args.eventId!)
              .gte("paidAt", args.from!)
              .lte("paidAt", args.to!)
          )
          .order("desc")
          .paginate(args.paginationOpts)
      }

      if (args.from !== undefined) {
        return await ctx.db
          .query("payments")
          .withIndex("by_donationKind_and_eventId_and_paidAt", (q) =>
            q
              .eq("donationKind", "standalone")
              .eq("eventId", args.eventId!)
              .gte("paidAt", args.from!)
          )
          .order("desc")
          .paginate(args.paginationOpts)
      }

      if (args.to !== undefined) {
        return await ctx.db
          .query("payments")
          .withIndex("by_donationKind_and_eventId_and_paidAt", (q) =>
            q
              .eq("donationKind", "standalone")
              .eq("eventId", args.eventId!)
              .lte("paidAt", args.to!)
          )
          .order("desc")
          .paginate(args.paginationOpts)
      }

      return await ctx.db
        .query("payments")
        .withIndex("by_donationKind_and_eventId_and_paidAt", (q) =>
          q.eq("donationKind", "standalone").eq("eventId", args.eventId!)
        )
        .order("desc")
        .paginate(args.paginationOpts)
    }

    if (args.from !== undefined && args.to !== undefined) {
      return await ctx.db
        .query("payments")
        .withIndex("by_donationKind_and_paidAt", (q) =>
          q
            .eq("donationKind", "standalone")
            .gte("paidAt", args.from!)
            .lte("paidAt", args.to!)
        )
        .order("desc")
        .paginate(args.paginationOpts)
    }

    if (args.from !== undefined) {
      return await ctx.db
        .query("payments")
        .withIndex("by_donationKind_and_paidAt", (q) =>
          q.eq("donationKind", "standalone").gte("paidAt", args.from!)
        )
        .order("desc")
        .paginate(args.paginationOpts)
    }

    if (args.to !== undefined) {
      return await ctx.db
        .query("payments")
        .withIndex("by_donationKind_and_paidAt", (q) =>
          q.eq("donationKind", "standalone").lte("paidAt", args.to!)
        )
        .order("desc")
        .paginate(args.paginationOpts)
    }

    return await ctx.db
      .query("payments")
      .withIndex("by_donationKind_and_paidAt", (q) =>
        q.eq("donationKind", "standalone")
      )
      .order("desc")
      .paginate(args.paginationOpts)
  },
})

export const autoMatchPayments = mutation({
  args: { eventId: v.union(v.id("events"), v.string()) },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    // Bounded: indexed by event, capped batch
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) =>
        q.eq("eventId", args.eventId as Id<"events">)
      )
      .take(500)

    const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      ctx,
      orders
    )

    // Bounded: capped batch for auto-match
    const payments = await ctx.db.query("payments").take(1000)

    const unassignedPayments = payments.filter((p) => p.status === "unassigned")
    const matched: string[] = []

    const orderIds = orders.map((o) => o._id)
    const attendeesByOrder = new Map<string, string[]>()

    for (const orderId of orderIds.slice(0, 500)) {
      const attendees = await ctx.db
        .query("orderAttendees")
        .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
        .take(100)

      for (const att of attendees) {
        if (!att.name) continue
        const existing = attendeesByOrder.get(orderId) ?? []
        existing.push(att.name.toLowerCase().trim())
        attendeesByOrder.set(orderId, existing)
      }
    }

    const orderMatchCandidates: OrderPaymentMatchCandidate[] = orders.map(
      (order) => ({
        orderId: String(order._id),
        bookerName: order.bookerName ?? null,
        attendeeNames: attendeesByOrder.get(String(order._id)) ?? [],
        amountDueMinor:
          amountDueBreakdownsByOrderId.get(String(order._id))?.amountDueMinor ??
          order.totalAmountMinor ??
          0,
      })
    )

    for (const payment of unassignedPayments) {
      const match = evaluateOrderPaymentMatch(
        payment.payerName,
        payment.amountMinor,
        orderMatchCandidates
      )

      if (match?.status === "auto_matched") {
        await ctx.db.patch("payments", payment._id, {
          orderId: match.orderId as Id<"orders">,
          status: "auto_matched",
          eventId: (await ctx.db.get("orders", match.orderId as Id<"orders">))?.eventId,
          matchedAt: Date.now(),
          matchedBy: "auto",
        })
        matched.push(payment._id)
        continue
      }

      if (match?.status === "ambiguous") {
        await ctx.db.patch("payments", payment._id, {
          orderId: undefined,
          status: "ambiguous",
          matchedAt: undefined,
          matchedBy: undefined,
        })
      }
    }

    return { matchedCount: matched.length }
  },
})

export const getPaymentSummary = query({
  args: { orderId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    // Bounded: indexed by orderId instead of full table scan
    const orderPayments = await ctx.db
      .query("payments")
      .withIndex("orderId", (q) => q.eq("orderId", args.orderId))
      .take(100)

    const totalPaid = orderPayments
      .filter((p) => isOrderAppliedPayment(p))
      .reduce((sum, p) => sum + p.amountMinor, 0)

    const orderId = ctx.db.normalizeId("orders", args.orderId)
    const order = orderId ? await ctx.db.get("orders", orderId) : null
    const amountDueBreakdownByOrderId = order
      ? await loadOrderAmountDueBreakdowns(ctx, [order])
      : new Map()
    const orderTotal =
      amountDueBreakdownByOrderId.get(String(order?._id ?? ""))
        ?.amountDueMinor ??
      order?.totalAmountMinor ??
      0
    const balance = deriveBalanceAmounts(orderTotal, totalPaid)

    return {
      totalPaid,
      orderTotal,
      remaining: balance.outstandingAmountMinor,
      paymentCount: orderPayments.length,
    }
  },
})

// ---------------------------------------------------------------------------
// Internal (auth-free) mutation wrappers for cron-triggered Tikkie auto-sync.
// ---------------------------------------------------------------------------

export const internalUpsertTikkiePayment = internalMutation({
  args: {
    sourceId: v.string(),
    payerName: v.string(),
    payerAccountNumber: v.optional(v.string()),
    amountMinor: v.number(),
    paidAt: v.number(),
    providerPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("payments")
      .withIndex("source_sourceId", (q) =>
        q.eq("source", "tikkie").eq("sourceId", args.sourceId)
      )
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, {
        payerName: args.payerName,
        payerAccountNumber: args.payerAccountNumber,
        amountMinor: args.amountMinor,
        paidAt: args.paidAt,
        providerPayload: args.providerPayload,
      })
      return { id: existing._id, inserted: false, updated: true }
    }

    const id = await ctx.db.insert("payments", {
      source: "tikkie",
      sourceId: args.sourceId,
      payerName: args.payerName,
      payerAccountNumber: args.payerAccountNumber,
      amountMinor: args.amountMinor,
      paidAt: args.paidAt,
      providerPayload: args.providerPayload,
      status: "unassigned",
    })
    return { id, inserted: true, updated: false }
  },
})

export const internalCleanupLegacyTikkiePayments = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await cleanupLegacyTikkiePaymentsHelper(ctx)
  },
})

export const internalAssignPaymentToOrder = internalMutation({
  args: {
    paymentId: v.id("payments"),
    orderId: v.id("orders"),
    status: v.optional(
      v.union(v.literal("auto_matched"), v.literal("manual_assignment"))
    ),
    matchedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const canonicalOrderId = await resolveCanonicalOrderId(ctx, args.orderId)
    if (!canonicalOrderId) {
      throw new Error("Order not found")
    }

    const payment = await ctx.db.get("payments", args.paymentId)
    if (!payment) {
      throw new Error("Payment not found")
    }

    if (payment.status !== "unassigned") {
      return args.paymentId
    }

    const order = await ctx.db.get("orders", canonicalOrderId)
    await ctx.db.patch("payments", args.paymentId, {
      orderId: canonicalOrderId,
      eventId: order?.eventId,
      status: args.status ?? "manual_assignment",
      matchedAt: Date.now(),
      matchedBy: args.matchedBy,
    })
    return args.paymentId
  },
})
