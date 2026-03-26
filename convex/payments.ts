import { query, mutation, action } from "./_generated/server"
import { v } from "convex/values"

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
    const id = await ctx.db.insert("payments", {
      ...args,
      status:
        args.status ?? (args.orderId ? "manual_assignment" : "unassigned"),
      matchedAt: args.orderId ? Date.now() : undefined,
    })
    return id
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
    const orders = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("eventId", (q) => q.eq("eventId", args.eventId))
      .collect()

    const payments = await ctx.db.query("payments").collect()

    const unassignedPayments = payments.filter((p) => p.status === "unassigned")
    const matched: string[] = []

    for (const payment of unassignedPayments) {
      const matchingOrder = orders.find(
        (o) => o.buyerName?.toLowerCase() === payment.payerName.toLowerCase()
      )

      if (matchingOrder) {
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
