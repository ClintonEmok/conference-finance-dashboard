import { query, mutation } from "./_generated/server"
import { v } from "convex/values"
import { requireIdentity } from "./auth"

export const getPaymentLinks = query({
  args: {
    orderId: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("created"), v.literal("paid"), v.literal("expired"))
    ),
  },
  handler: async (ctx, args) => {
    let links = await ctx.db.query("tikkiePaymentLinks").collect()

    if (args.orderId) {
      links = links.filter((l) => l.orderId === args.orderId)
    }
    if (args.status) {
      links = links.filter((l) => l.status === args.status)
    }

    return links
  },
})

export const getPaymentLinkByToken = query({
  args: { paymentRequestToken: v.string() },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("tikkiePaymentLinks")
      .withIndex("paymentRequestToken", (q) =>
        q.eq("paymentRequestToken", args.paymentRequestToken)
      )
      .collect()
    return links[0] ?? null
  },
})

export const getPaymentLinkById = query({
  args: { linkId: v.id("tikkiePaymentLinks") },
  handler: async (ctx, args) => {
    return await ctx.db.get("tikkiePaymentLinks", args.linkId)
  },
})

export const createPaymentLink = mutation({
  args: {
    providerOrderId: v.string(),
    providerEventId: v.string(),
    orderId: v.string(),
    paymentRequestToken: v.string(),
    paymentRequestUrl: v.string(),
    providerStatus: v.string(),
    amountMinor: v.number(),
    description: v.string(),
    expiryDate: v.number(),
    referenceId: v.optional(v.string()),
    providerPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const id = await ctx.db.insert("tikkiePaymentLinks", {
      ...args,
      status: "created",
      statusSource: "create",
      statusUpdatedAt: Date.now(),
    })
    return id
  },
})

export const updatePaymentLinkStatus = mutation({
  args: {
    linkId: v.id("tikkiePaymentLinks"),
    status: v.union(
      v.literal("created"),
      v.literal("paid"),
      v.literal("expired")
    ),
    providerStatus: v.string(),
    source: v.union(
      v.literal("create"),
      v.literal("webhook"),
      v.literal("poll")
    ),
    reason: v.optional(v.string()),
    providerNotificationKey: v.optional(v.string()),
    providerPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const link = await ctx.db.get("tikkiePaymentLinks", args.linkId)
    if (!link) throw new Error("Payment link not found")

    const transitionId = await ctx.db.insert("tikkiePaymentLinkTransitions", {
      paymentLinkId: args.linkId,
      fromStatus: link.status ?? "created",
      toStatus: args.status,
      source: args.source,
      providerNotificationKey: args.providerNotificationKey,
      providerStatus: args.providerStatus,
      reason: args.reason,
      providerPayload: args.providerPayload,
    })

    await ctx.db.patch("tikkiePaymentLinks", args.linkId, {
      status: args.status,
      providerStatus: args.providerStatus,
      statusSource: args.source,
      providerPayload: args.providerPayload,
      statusUpdatedAt: Date.now(),
    })

    return { linkId: args.linkId, transitionId }
  },
})

export const getPaymentTemplates = query({
  args: { eventId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.eventId) {
      return await ctx.db
        .query("tikkiePaymentTemplates")
        .withIndex("eventId", (q) => q.eq("eventId", args.eventId!))
        .collect()
    }

    return await ctx.db.query("tikkiePaymentTemplates").collect()
  },
})

export const createPaymentTemplate = mutation({
  args: {
    eventId: v.string(),
    ticketTypeLabel: v.string(),
    amountMinor: v.number(),
    descriptionTemplate: v.string(),
    expiryDays: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const existing = await ctx.db
      .query("tikkiePaymentTemplates")
      .withIndex("eventId_ticketType", (q) =>
        q
          .eq("eventId", args.eventId)
          .eq("ticketTypeLabel", args.ticketTypeLabel)
      )
      .collect()

    if (existing.length > 0) {
      const existingTemplate = existing[0]
      await ctx.db.patch("tikkiePaymentTemplates", existingTemplate._id, {
        amountMinor: args.amountMinor,
        descriptionTemplate: args.descriptionTemplate,
        expiryDays: args.expiryDays ?? 14,
        isActive: true,
      })
      return existingTemplate._id
    }

    const id = await ctx.db.insert("tikkiePaymentTemplates", {
      ...args,
      expiryDays: args.expiryDays ?? 14,
      isActive: args.isActive ?? true,
    })
    return id
  },
})

export const updatePaymentTemplate = mutation({
  args: {
    templateId: v.id("tikkiePaymentTemplates"),
    amountMinor: v.number(),
    descriptionTemplate: v.string(),
    expiryDays: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const template = await ctx.db.get("tikkiePaymentTemplates", args.templateId)
    if (!template) throw new Error("Template not found")

    await ctx.db.patch("tikkiePaymentTemplates", args.templateId, {
      amountMinor: args.amountMinor,
      descriptionTemplate: args.descriptionTemplate,
      expiryDays: args.expiryDays ?? template.expiryDays,
      isActive: args.isActive ?? template.isActive,
    })
    return args.templateId
  },
})

export const deletePaymentTemplate = mutation({
  args: { templateId: v.id("tikkiePaymentTemplates") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const template = await ctx.db.get("tikkiePaymentTemplates", args.templateId)
    if (!template) throw new Error("Template not found")

    await ctx.db.patch("tikkiePaymentTemplates", args.templateId, {
      isActive: false,
    })
    return args.templateId
  },
})

export const getTemplateByEventAndTicketType = query({
  args: {
    eventId: v.string(),
    ticketTypeLabel: v.string(),
  },
  handler: async (ctx, args) => {
    const templates = await ctx.db
      .query("tikkiePaymentTemplates")
      .withIndex("eventId_ticketType", (q) =>
        q
          .eq("eventId", args.eventId)
          .eq("ticketTypeLabel", args.ticketTypeLabel)
      )
      .collect()
    return templates.find((t) => t.isActive) ?? null
  },
})

export const getPaymentLinksByOrderId = query({
  args: { orderId: v.string() },
  handler: async (ctx, args) => {
    const links = await ctx.db.query("tikkiePaymentLinks").collect()

    const orderLinks = links
      .filter((l) => l.orderId === args.orderId)
      .sort((a, b) => {
        const aTime = a._creationTime ?? 0
        const bTime = b._creationTime ?? 0
        if (aTime !== bTime) return bTime - aTime
        return b._id.localeCompare(a._id)
      })

    const linksWithTransitions = await Promise.all(
      orderLinks.map(async (link) => {
        const transitions = await ctx.db
          .query("tikkiePaymentLinkTransitions")
          .withIndex("paymentLinkId", (q) => q.eq("paymentLinkId", link._id))
          .collect()

        const sortedTransitions = transitions.sort((a, b) => {
          const aTime = a._creationTime ?? 0
          const bTime = b._creationTime ?? 0
          return bTime - aTime
        })

        return { ...link, transitionEvents: sortedTransitions }
      })
    )

    return linksWithTransitions
  },
})

// --- Event-level Tikkie links ---

export const getEventPaymentLink = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("tikkiePaymentLinks")
      .withIndex("eventId", (q) => q.eq("eventId", args.eventId))
      .collect()

    const eventLinks = links
      .filter((l) => l.linkType === "event")
      .sort((a, b) => {
        const timeDiff = (b._creationTime ?? 0) - (a._creationTime ?? 0)
        if (timeDiff !== 0) return timeDiff
        return b._id.localeCompare(a._id)
      })

    return eventLinks[0] ?? null
  },
})

export const createEventPaymentLink = mutation({
  args: {
    eventId: v.string(),
    providerEventId: v.string(),
    paymentRequestToken: v.string(),
    paymentRequestUrl: v.string(),
    providerStatus: v.string(),
    amountMinor: v.number(),
    description: v.string(),
    expiryDate: v.number(),
    referenceId: v.optional(v.string()),
    providerPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const id = await ctx.db.insert("tikkiePaymentLinks", {
      providerOrderId: "",
      providerEventId: args.providerEventId,
      orderId: undefined,
      eventId: args.eventId,
      linkType: "event",
      paymentRequestToken: args.paymentRequestToken,
      paymentRequestUrl: args.paymentRequestUrl,
      status: "created",
      statusSource: "create",
      providerStatus: args.providerStatus,
      amountMinor: args.amountMinor,
      description: args.description,
      expiryDate: args.expiryDate,
      referenceId: args.referenceId,
      providerPayload: args.providerPayload,
      statusUpdatedAt: Date.now(),
    })
    return id
  },
})

// --- Tikkie individual payments ---

export const getTikkiePaymentsByLink = query({
  args: { paymentLinkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tikkiePayments")
      .withIndex("paymentLinkId", (q) =>
        q.eq("paymentLinkId", args.paymentLinkId)
      )
      .collect()
  },
})

export const getTikkiePaymentsByStatus = query({
  args: {
    matchStatus: v.union(
      v.literal("unmatched"),
      v.literal("auto_matched"),
      v.literal("manual")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tikkiePayments")
      .withIndex("matchStatus", (q) => q.eq("matchStatus", args.matchStatus))
      .collect()
  },
})

export const getTikkiePaymentByToken = query({
  args: { paymentToken: v.string() },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("tikkiePayments")
      .withIndex("paymentToken", (q) => q.eq("paymentToken", args.paymentToken))
      .collect()
    return results[0] ?? null
  },
})

export const upsertTikkiePayment = mutation({
  args: {
    paymentLinkId: v.string(),
    paymentRequestToken: v.string(),
    paymentToken: v.string(),
    payerName: v.string(),
    payerAccountNumber: v.optional(v.string()),
    amountMinor: v.number(),
    paidAt: v.number(),
    description: v.optional(v.string()),
    providerPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const existing = await ctx.db
      .query("tikkiePayments")
      .withIndex("paymentToken", (q) => q.eq("paymentToken", args.paymentToken))
      .collect()

    if (existing.length > 0) {
      return { id: existing[0]._id, inserted: false }
    }

    const id = await ctx.db.insert("tikkiePayments", {
      paymentLinkId: args.paymentLinkId,
      paymentRequestToken: args.paymentRequestToken,
      paymentToken: args.paymentToken,
      payerName: args.payerName,
      payerAccountNumber: args.payerAccountNumber,
      amountMinor: args.amountMinor,
      paidAt: args.paidAt,
      description: args.description,
      matchStatus: "unmatched",
      providerPayload: args.providerPayload,
    })

    return { id, inserted: true }
  },
})

export const matchTikkiePayment = mutation({
  args: {
    paymentId: v.id("tikkiePayments"),
    orderId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const payment = await ctx.db.get("tikkiePayments", args.paymentId)
    if (!payment) throw new Error("Tikkie payment not found")

    await ctx.db.patch("tikkiePayments", args.paymentId, {
      orderId: args.orderId,
      matchStatus: "manual",
      matchedAt: Date.now(),
    })

    return { id: args.paymentId, orderId: args.orderId }
  },
})

export const autoMatchTikkiePayments = mutation({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const links = await ctx.db
      .query("tikkiePaymentLinks")
      .withIndex("eventId", (q) => q.eq("eventId", args.eventId))
      .collect()

    const eventLinks = links.filter((l) => l.linkType === "event")
    if (eventLinks.length === 0) {
      return { matchedCount: 0, totalUnmatched: 0 }
    }

    const paymentGroups = await Promise.all(
      eventLinks.map((link) =>
        ctx.db
          .query("tikkiePayments")
          .withIndex("paymentLinkId", (q) => q.eq("paymentLinkId", link._id))
          .collect()
      )
    )

    const payments = paymentGroups.flat()

    const unmatchedPayments = payments.filter(
      (p) => p.matchStatus === "unmatched"
    )

    const orders = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("eventId", (q) => q.eq("eventId", args.eventId))
      .collect()

    let matchedCount = 0

    for (const payment of unmatchedPayments) {
      const matchingOrders = orders.filter(
        (o) => o.buyerName?.toLowerCase() === payment.payerName.toLowerCase()
      )

      if (matchingOrders.length === 1) {
        await ctx.db.patch("tikkiePayments", payment._id, {
          orderId: matchingOrders[0]._id,
          matchStatus: "auto_matched",
          matchedAt: Date.now(),
        })
        matchedCount++
      }
    }

    return { matchedCount, totalUnmatched: unmatchedPayments.length }
  },
})
