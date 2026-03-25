import { query, mutation, action } from "./_generated/server"
import { v } from "convex/values"

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
    providerPayload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db.get("tikkiePaymentLinks", args.linkId)
    if (!link) throw new Error("Payment link not found")

    const transitionId = await ctx.db.insert("tikkiePaymentLinkTransitions", {
      paymentLinkId: args.linkId,
      fromStatus: link.status ?? "created",
      toStatus: args.status,
      source: args.source,
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
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const templates = await ctx.db
      .query("tikkiePaymentTemplates")
      .withIndex("eventId", (q) => q.eq("eventId", args.eventId))
      .collect()
    return templates
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
