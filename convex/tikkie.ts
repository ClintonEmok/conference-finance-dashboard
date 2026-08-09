import { query, mutation, internalMutation } from "./_generated/server"
import { v } from "convex/values"
import { requireIdentity } from "./auth"
import type { Id } from "./_generated/dataModel"
import { formatPaymentReference } from "../lib/domain/finance/payment-reference"
import { loadOrderAmountDueBreakdowns } from "./finance"

// Constants for quota enforcement
const DEFAULT_MONTHLY_TIKKIE_CREATION_LIMIT = 5

function getMonthlyCreationQuotaLimit(): number {
  // Could be extended to read from env var if needed
  return DEFAULT_MONTHLY_TIKKIE_CREATION_LIMIT
}

function getCurrentUtcMonthBounds() {
  const now = new Date()
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
  )
  const nextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)
  )
  return {
    startMs: start.getTime(),
    nextMonthMs: nextMonth.getTime(),
  }
}

async function checkMonthlyQuota(
  ctx: Parameters<typeof requireIdentity>[0]
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limit = getMonthlyCreationQuotaLimit()
  const { startMs, nextMonthMs } = getCurrentUtcMonthBounds()

  // Bounded: quota check needs all links for current month, capped
  const allLinks = await ctx.db.query("tikkiePaymentLinks").take(500)
  const linksThisMonth = allLinks.filter((link) => {
    const ct = link._creationTime
    return typeof ct === "number" && ct >= startMs && ct < nextMonthMs
  })

  const used = linksThisMonth.length

  return {
    allowed: used < limit,
    used,
    limit,
  }
}

export const getPaymentLinks = query({
  args: {
    orderId: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("created"), v.literal("paid"), v.literal("expired"))
    ),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    // Bounded: capped read for non-paginated query
    let links = await ctx.db.query("tikkiePaymentLinks").take(500)

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
    // Single result: indexed exact match
    return await ctx.db
      .query("tikkiePaymentLinks")
      .withIndex("paymentRequestToken", (q) =>
        q.eq("paymentRequestToken", args.paymentRequestToken)
      )
      .first()
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

    // Order Tikkie links are open, flexible payment requests: the payer may
    // pay any amount against them (installments). The stored amount must
    // therefore always be the flexible zero — a re-priced amount derived from
    // canonical amount-due must never be persisted.
    if (!Number.isInteger(args.amountMinor) || args.amountMinor !== 0) {
      throw new Error(
        "Invalid 'amountMinor'. Order Tikkie links use the flexible zero amount (0) for installment payments."
      )
    }

    // Atomic quota check - fail if quota exceeded
    const quota = await checkMonthlyQuota(ctx)
    if (!quota.allowed) {
      throw new Error(
        `Monthly Tikkie quota exceeded (${quota.used}/${quota.limit}). Try again next month.`
      )
    }

    const id = await ctx.db.insert("tikkiePaymentLinks", {
      ...args,
      // Order links must carry the discriminator so order-link projections
      // (publicTracking, dashboard) can select them; a link without it is
      // ignored by order-link reads and tracking falls back to an event link.
      linkType: "order",
      referenceId: formatPaymentReference(args.referenceId) ?? undefined,
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
    await requireIdentity(ctx)
    if (args.eventId) {
      // Bounded: indexed by event, small set
      return await ctx.db
        .query("tikkiePaymentTemplates")
        .withIndex("eventId", (q) => q.eq("eventId", args.eventId!))
        .take(100)
    }

    // Bounded: small config table
    return await ctx.db.query("tikkiePaymentTemplates").take(200)
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
    // Bounded: exact match on composite index
    const existing = await ctx.db
      .query("tikkiePaymentTemplates")
      .withIndex("eventId_ticketType", (q) =>
        q
          .eq("eventId", args.eventId)
          .eq("ticketTypeLabel", args.ticketTypeLabel)
      )
      .first()

    if (existing) {
      await ctx.db.patch("tikkiePaymentTemplates", existing._id, {
        amountMinor: args.amountMinor,
        descriptionTemplate: args.descriptionTemplate,
        expiryDays: args.expiryDays ?? 14,
        isActive: true,
      })
      return existing._id
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
    // Bounded: indexed exact match, find active template
    const templates = await ctx.db
      .query("tikkiePaymentTemplates")
      .withIndex("eventId_ticketType", (q) =>
        q
          .eq("eventId", args.eventId)
          .eq("ticketTypeLabel", args.ticketTypeLabel)
      )
      .take(10)
    return templates.find((t) => t.isActive) ?? null
  },
})

export const getPaymentLinksByOrderId = query({
  args: { orderId: v.string() },
  handler: async (ctx, args) => {
    // Bounded: one order has a limited number of payment links
    const links = await ctx.db.query("tikkiePaymentLinks").take(500)

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
          .take(20)

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
    // Bounded: indexed by event, small set of links per event
    const links = await ctx.db
      .query("tikkiePaymentLinks")
      .withIndex("eventId", (q) => q.eq("eventId", args.eventId))
      .take(50)

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

/**
 * Returns the latest event-level Tikkie link for the success page.
 * Typed eventId and clean return contract.
 */
export const getEventPaymentLinkForSuccess = query({
  args: { eventId: v.id("events") },
  returns: v.union(
    v.null(),
    v.object({
      paymentUrl: v.string(),
      amountMinor: v.optional(v.number()),
      description: v.optional(v.string()),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    // Bounded: indexed by event, small set of links per event
    const links = await ctx.db
      .query("tikkiePaymentLinks")
      .withIndex("eventId", (q) => q.eq("eventId", args.eventId))
      .take(50)

    const eventLinks = links
      .filter((l) => l.linkType === "event")
      .sort((a, b) => {
        const timeDiff = (b._creationTime ?? 0) - (a._creationTime ?? 0)
        if (timeDiff !== 0) return timeDiff
        return b._id.localeCompare(a._id)
      })

    const latest = eventLinks[0]
    if (!latest) {
      return null
    }

    return {
      paymentUrl: latest.paymentRequestUrl,
      amountMinor: latest.amountMinor ?? undefined,
      description: latest.description ?? undefined,
      createdAt: latest._creationTime ?? Date.now(),
    }
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

    // Atomic quota check - fail if quota exceeded
    const quota = await checkMonthlyQuota(ctx)
    if (!quota.allowed) {
      throw new Error(
        `Monthly Tikkie quota exceeded (${quota.used}/${quota.limit}). Try again next month.`
      )
    }

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
      referenceId: formatPaymentReference(args.referenceId) ?? undefined,
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
    // Bounded: one link has limited payments
    return await ctx.db
      .query("tikkiePayments")
      .withIndex("paymentLinkId", (q) =>
        q.eq("paymentLinkId", args.paymentLinkId)
      )
      .take(200)
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
    // Bounded: indexed status query, capped
    return await ctx.db
      .query("tikkiePayments")
      .withIndex("matchStatus", (q) => q.eq("matchStatus", args.matchStatus))
      .take(500)
  },
})

export const getTikkiePaymentByToken = query({
  args: { paymentToken: v.string() },
  handler: async (ctx, args) => {
    // Single result: indexed exact match
    return await ctx.db
      .query("tikkiePayments")
      .withIndex("paymentToken", (q) => q.eq("paymentToken", args.paymentToken))
      .first()
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
    // Single result: indexed exact match on paymentToken
    const existing = await ctx.db
      .query("tikkiePayments")
      .withIndex("paymentToken", (q) => q.eq("paymentToken", args.paymentToken))
      .first()

    if (existing) {
      return { id: existing._id, inserted: false }
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
  args: { eventId: v.union(v.id("events"), v.string()) },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    // Bounded: indexed by event, small set of links
    const links = await ctx.db
      .query("tikkiePaymentLinks")
      .withIndex("eventId", (q) =>
        q.eq("eventId", args.eventId as Id<"events">)
      )
      .take(50)

    const eventLinks = links.filter((l) => l.linkType === "event")
    if (eventLinks.length === 0) {
      return { matchedCount: 0, totalUnmatched: 0 }
    }

    const paymentGroups = await Promise.all(
      eventLinks.map((link) =>
        ctx.db
          .query("tikkiePayments")
          .withIndex("paymentLinkId", (q) => q.eq("paymentLinkId", link._id))
          .take(200)
      )
    )

    const payments = paymentGroups.flat()

    const unmatchedPayments = payments.filter(
      (p) => p.matchStatus === "unmatched"
    )

    // Query core orders table instead of ticketTailorOrders
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) =>
        q.eq("eventId", args.eventId as Id<"events">)
      )
      .take(500)

    // Join with extension data for visibility checking
    const ordersWithExtensions = await Promise.all(
      orders.map(async (order) => {
        const extension = await ctx.db
          .query("ticketTailorOrders")
          .withIndex("orderId", (q) => q.eq("orderId", order._id))
          .first()
        return { ...order, extension }
      })
    )

    // Filter visible orders (not removed)
    const visibleOrders = ordersWithExtensions.filter(
      (o) => !o.extension?.removedAt
    )

    // Canonical amount-due (tickets + accommodation) drives matching: an
    // attendee-name match must fit the canonical due, not the provider total.
    const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      ctx,
      visibleOrders
    )

    // Pre-fetch attendees from core orderAttendees table
    const orderAttendees = await ctx.db.query("orderAttendees").take(1000)

    // Group attendees by orderId
    const attendeesByOrder = new Map<Id<"orders">, string[]>()
    for (const att of orderAttendees) {
      if (!att.name) continue
      const existing = attendeesByOrder.get(att.orderId) ?? []
      existing.push(att.name.toLowerCase().trim())
      attendeesByOrder.set(att.orderId, existing)
    }

    let matchedCount = 0

    for (const payment of unmatchedPayments) {
      const normalizedPayer = payment.payerName.toLowerCase().trim()

      // First: try exact buyer name match
      const matchingOrders = visibleOrders.filter(
        (o) => o.bookerName?.toLowerCase().trim() === normalizedPayer
      )

      if (matchingOrders.length === 1) {
        await ctx.db.patch("tikkiePayments", payment._id, {
          orderId: matchingOrders[0]._id,
          matchStatus: "auto_matched",
          matchedAt: Date.now(),
        })
        matchedCount++
        continue
      }

      // Fallback: try attendee name match with exact amount
      for (const order of visibleOrders) {
        const orderAttendeeNames = attendeesByOrder.get(order._id) ?? []
        const attendeeMatch = orderAttendeeNames.some(
          (name) => name === normalizedPayer
        )
        const canonicalAmountDueMinor =
          amountDueBreakdownsByOrderId.get(String(order._id))?.amountDueMinor ??
          order.totalAmountMinor ??
          0
        if (attendeeMatch && canonicalAmountDueMinor === payment.amountMinor) {
          await ctx.db.patch("tikkiePayments", payment._id, {
            orderId: order._id,
            matchStatus: "auto_matched",
            matchedAt: Date.now(),
          })
          matchedCount++
          break
        }
      }
    }

    return { matchedCount, totalUnmatched: unmatchedPayments.length }
  },
})
