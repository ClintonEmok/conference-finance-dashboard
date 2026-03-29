import { query, mutation, internalMutation } from "./_generated/server"
import { v } from "convex/values"
import { requireIdentity } from "./auth"

const paymentSourceValidator = v.union(
  v.literal("tikkie"),
  v.literal("bank_transfer"),
  v.literal("cash")
)

const paymentStatusValidator = v.union(
  v.literal("auto_matched"),
  v.literal("manual_assignment"),
  v.literal("ambiguous"),
  v.literal("unassigned")
)

const paymentDocValidator = v.object({
  _id: v.id("payments"),
  _creationTime: v.number(),
  source: paymentSourceValidator,
  sourceId: v.optional(v.string()),
  payerName: v.string(),
  payerAccountNumber: v.optional(v.string()),
  amountMinor: v.number(),
  paidAt: v.number(),
  orderId: v.optional(v.string()),
  status: v.optional(paymentStatusValidator),
  matchedAt: v.optional(v.number()),
  matchedBy: v.optional(v.string()),
  reference: v.optional(v.string()),
  notes: v.optional(v.string()),
  providerPayload: v.optional(v.any()),
})

export const getPayments = query({
  args: {
    orderId: v.optional(v.string()),
    source: v.optional(paymentSourceValidator),
    sourceId: v.optional(v.string()),
    status: v.optional(paymentStatusValidator),
  },
  returns: v.array(paymentDocValidator),
  handler: async (ctx, args) => {
    let payments =
      args.source && args.sourceId
        ? await ctx.db
            .query("payments")
            .withIndex("source_sourceId", (q) =>
              q.eq("source", args.source!).eq("sourceId", args.sourceId!)
            )
            .collect()
        : args.orderId
          ? await ctx.db
              .query("payments")
              .withIndex("orderId", (q) => q.eq("orderId", args.orderId!))
              .collect()
          : args.status
            ? await ctx.db
                .query("payments")
                .withIndex("status", (q) => q.eq("status", args.status!))
                .collect()
            : await ctx.db.query("payments").collect()

    if (args.orderId) {
      payments = payments.filter((p) => p.orderId === args.orderId)
    }
    if (args.source) {
      payments = payments.filter((p) => p.source === args.source)
    }
    if (args.sourceId) {
      payments = payments.filter((p) => p.sourceId === args.sourceId)
    }
    if (args.status) {
      payments = payments.filter((p) => p.status === args.status)
    }

    return payments
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
    const payments = await ctx.db.query("payments").collect()
    return payments.filter((p) => p.status === "unassigned")
  },
})

export const createPayment = mutation({
  args: {
    source: paymentSourceValidator,
    sourceId: v.optional(v.string()),
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
    const id = await ctx.db.insert("payments", {
      ...args,
      status:
        args.status ?? (args.orderId ? "manual_assignment" : "unassigned"),
      matchedAt: args.orderId ? Date.now() : undefined,
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
      .collect()

    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, {
        payerName: args.payerName,
        payerAccountNumber: args.payerAccountNumber,
        amountMinor: args.amountMinor,
        paidAt: args.paidAt,
        providerPayload: args.providerPayload,
      })

      return { id: existing[0]._id, inserted: false, updated: true }
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
    const payments = await ctx.db
      .query("payments")
      .withIndex("source_sourceId", (q) => q.eq("source", "tikkie"))
      .collect()

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

      if (!payload) {
        continue
      }

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

      if (Object.keys(updates).length === 0) {
        continue
      }

      await ctx.db.patch(payment._id, updates)
      patched += 1
    }

    return { scanned, patched }
  },
})

export const assignPaymentToOrder = mutation({
  args: {
    paymentId: v.id("payments"),
    orderId: v.string(),
    status: v.optional(
      v.union(v.literal("auto_matched"), v.literal("manual_assignment"))
    ),
    matchedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await ctx.db.patch("payments", args.paymentId, {
      orderId: args.orderId,
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
      status: "unassigned",
      matchedAt: undefined,
      matchedBy: undefined,
    })
    return args.paymentId
  },
})

export const autoMatchPayments = mutation({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const orders = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("eventId", (q) => q.eq("eventId", args.eventId))
      .collect()

    const payments = await ctx.db.query("payments").collect()

    const unassignedPayments = payments.filter((p) => p.status === "unassigned")
    const matched: string[] = []

    // Normalize buyer names once upfront
    const orderLookup = new Map<string, (typeof orders)[0]>()
    for (const order of orders) {
      const normalizedBuyerName = order.buyerName?.toLowerCase().trim() ?? ""
      if (!normalizedBuyerName) continue

      // Store orders by normalized buyer name for exact-match lookup
      // Exact amount will be checked per-payment
      const key = normalizedBuyerName
      if (!orderLookup.has(key)) {
        orderLookup.set(key, order)
      }
    }

    for (const payment of unassignedPayments) {
      const normalizedPayerName = payment.payerName.toLowerCase().trim()
      const paymentAmount = payment.amountMinor

      // Match on normalized buyer name PLUS exact amount
      const matchingOrder = orderLookup.get(normalizedPayerName)

      if (matchingOrder && matchingOrder.totalAmountMinor === paymentAmount) {
        await ctx.db.patch("payments", payment._id, {
          orderId: matchingOrder._id,
          status: "auto_matched",
          matchedAt: Date.now(),
          matchedBy: "auto",
        })
        matched.push(payment._id)
      }
    }

    return { matchedCount: matched.length }
  },
})

export const getPaymentSummary = query({
  args: { orderId: v.string() },
  handler: async (ctx, args) => {
    const payments = await ctx.db.query("payments").collect()

    const orderPayments = payments.filter((p) => p.orderId === args.orderId)

    const totalPaid = orderPayments
      .filter(
        (p) => p.status === "auto_matched" || p.status === "manual_assignment"
      )
      .reduce((sum, p) => sum + p.amountMinor, 0)

    const orderId = ctx.db.normalizeId("ticketTailorOrders", args.orderId)
    const order = orderId
      ? await ctx.db.get("ticketTailorOrders", orderId)
      : null
    const orderTotal = order?.totalAmountMinor ?? 0

    return {
      totalPaid,
      orderTotal,
      remaining: orderTotal - totalPaid,
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
      .collect()

    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, {
        payerName: args.payerName,
        payerAccountNumber: args.payerAccountNumber,
        amountMinor: args.amountMinor,
        paidAt: args.paidAt,
        providerPayload: args.providerPayload,
      })
      return { id: existing[0]._id, inserted: false, updated: true }
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
    const payments = await ctx.db
      .query("payments")
      .withIndex("source_sourceId", (q) => q.eq("source", "tikkie"))
      .collect()

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
  },
})

export const internalAssignPaymentToOrder = internalMutation({
  args: {
    paymentId: v.id("payments"),
    orderId: v.string(),
    status: v.optional(
      v.union(v.literal("auto_matched"), v.literal("manual_assignment"))
    ),
    matchedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("payments", args.paymentId, {
      orderId: args.orderId,
      status: args.status ?? "manual_assignment",
      matchedAt: Date.now(),
      matchedBy: args.matchedBy,
    })
    return args.paymentId
  },
})
