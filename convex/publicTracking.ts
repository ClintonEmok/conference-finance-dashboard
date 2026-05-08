import { query } from "./_generated/server"
import { v } from "convex/values"

import { loadOrderAmountDueBreakdowns } from "./finance"

function normalizeBookingRef(bookingRef: string): string {
  return bookingRef.trim().toUpperCase()
}

function computeProgress(
  totalPaidMinor: number,
  totalDueMinor: number
): number {
  if (totalDueMinor <= 0) return 100
  return Math.min(100, Math.round((totalPaidMinor / totalDueMinor) * 100))
}

export const getByBookingRef = query({
  args: {
    bookingRef: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      bookingRef: v.string(),
      event: v.object({
        slug: v.string(),
        title: v.string(),
        startsAt: v.number(),
      }),
      order: v.object({
        buyerName: v.union(v.string(), v.null()),
        buyerEmail: v.union(v.string(), v.null()),
        buyerPhone: v.union(v.string(), v.null()),
        submittedAt: v.union(v.number(), v.null()),
        orderedAt: v.union(v.number(), v.null()),
        totalAmountMinor: v.union(v.number(), v.null()),
        amountDueMinor: v.union(v.number(), v.null()),
        status: v.union(v.string(), v.null()),
      }),
      payment: v.object({
        totalDueMinor: v.number(),
        totalPaidMinor: v.number(),
        remainingMinor: v.number(),
        progressPercent: v.number(),
        paymentCount: v.number(),
        paymentStatus: v.union(
          v.literal("unpaid"),
          v.literal("partial"),
          v.literal("paid"),
          v.literal("overpaid")
        ),
      }),
      tikkieUrl: v.union(v.string(), v.null()),
      tikkieAmountMinor: v.union(v.number(), v.null()),
      tikkieDescription: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const bookingRef = normalizeBookingRef(args.bookingRef)

    const order = await ctx.db
      .query("orders")
      .withIndex("by_bookingRef", (q) => q.eq("bookingRef", bookingRef))
      .first()

    if (!order || !order.eventId) {
      return null
    }

    const event = await ctx.db.get(order.eventId)
    if (!event) {
      return null
    }

    const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      ctx,
      [{ _id: order._id }]
    )
    const amountDueBreakdown = amountDueBreakdownsByOrderId.get(
      String(order._id)
    )

    const paymentRows = await ctx.db
      .query("payments")
      .withIndex("orderId", (q) => q.eq("orderId", String(order._id)))
      .take(100)

    const matchedPayments = paymentRows.filter(
      (payment) =>
        payment.status === "auto_matched" ||
        payment.status === "manual_assignment"
    )

    const totalPaidMinor = matchedPayments.reduce(
      (sum, payment) => sum + payment.amountMinor,
      0
    )

    const totalDueMinor =
      amountDueBreakdown?.amountDueMinor ?? order.totalAmountMinor ?? 0
    const remainingMinor = Math.max(0, totalDueMinor - totalPaidMinor)
    const paymentStatus: "unpaid" | "partial" | "paid" | "overpaid" =
      totalPaidMinor === 0
        ? "unpaid"
        : totalPaidMinor < totalDueMinor
          ? "partial"
          : totalPaidMinor === totalDueMinor
            ? "paid"
            : "overpaid"

    const orderLinks = await ctx.db
      .query("tikkiePaymentLinks")
      .withIndex("orderId", (q) => q.eq("orderId", String(order._id)))
      .take(20)

    const latestOrderLink = orderLinks
      .filter((link) => link.linkType === "order")
      .sort((a, b) => {
        const timeDiff = (b._creationTime ?? 0) - (a._creationTime ?? 0)
        if (timeDiff !== 0) return timeDiff
        return b._id.localeCompare(a._id)
      })[0]

    const eventLinks = await ctx.db
      .query("tikkiePaymentLinks")
      .withIndex("eventId", (q) => q.eq("eventId", String(order.eventId)))
      .take(20)

    const latestEventLink = eventLinks
      .filter((link) => link.linkType === "event")
      .sort((a, b) => {
        const timeDiff = (b._creationTime ?? 0) - (a._creationTime ?? 0)
        if (timeDiff !== 0) return timeDiff
        return b._id.localeCompare(a._id)
      })[0]

    const selectedLink = latestOrderLink ?? latestEventLink ?? null

    return {
      bookingRef,
      event: {
        slug: event.slug,
        title: event.title,
        startsAt: event.startsAt,
      },
      order: {
        buyerName: order.bookerName ?? null,
        buyerEmail: order.bookerEmail ?? null,
        buyerPhone: order.bookerPhone ?? null,
        submittedAt: order.submittedAt ?? null,
        orderedAt: order.orderedAt ?? null,
        totalAmountMinor: order.totalAmountMinor ?? null,
        amountDueMinor: totalDueMinor,
        status: order.status ?? null,
      },
      payment: {
        totalDueMinor,
        totalPaidMinor,
        remainingMinor,
        progressPercent: computeProgress(totalPaidMinor, totalDueMinor),
        paymentCount: matchedPayments.length,
        paymentStatus,
      },
      tikkieUrl: selectedLink?.paymentRequestUrl ?? null,
      tikkieAmountMinor: selectedLink?.amountMinor ?? null,
      tikkieDescription: selectedLink?.description ?? null,
    }
  },
})

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

async function loadTrackingByOrder(
  ctx: any,
  order: any
): Promise<any | null> {
  if (!order || !order.eventId) {
    return null
  }

  const event = await ctx.db.get(order.eventId)
  if (!event) {
    return null
  }

  const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(ctx, [
    { _id: order._id },
  ])
  const amountDueBreakdown = amountDueBreakdownsByOrderId.get(String(order._id))

  const paymentRows = await ctx.db
    .query("payments")
    .withIndex("orderId", (q: any) => q.eq("orderId", String(order._id)))
    .take(100)

  const matchedPayments = paymentRows.filter(
    (payment: any) =>
      payment.status === "auto_matched" || payment.status === "manual_assignment"
  )

  const totalPaidMinor = matchedPayments.reduce(
    (sum: number, payment: any) => sum + payment.amountMinor,
    0
  )

  const totalDueMinor =
    amountDueBreakdown?.amountDueMinor ?? order.totalAmountMinor ?? 0
  const remainingMinor = Math.max(0, totalDueMinor - totalPaidMinor)
  const paymentStatus: "unpaid" | "partial" | "paid" | "overpaid" =
    totalPaidMinor === 0
      ? "unpaid"
      : totalPaidMinor < totalDueMinor
        ? "partial"
        : totalPaidMinor === totalDueMinor
          ? "paid"
          : "overpaid"

  const orderLinks = await ctx.db
    .query("tikkiePaymentLinks")
    .withIndex("orderId", (q: any) => q.eq("orderId", String(order._id)))
    .take(20)

  const latestOrderLink = orderLinks
    .filter((link: any) => link.linkType === "order")
    .sort((a: any, b: any) => {
      const timeDiff = (b._creationTime ?? 0) - (a._creationTime ?? 0)
      if (timeDiff !== 0) return timeDiff
      return b._id.localeCompare(a._id)
    })[0]

  const eventLinks = await ctx.db
    .query("tikkiePaymentLinks")
    .withIndex("eventId", (q: any) => q.eq("eventId", String(order.eventId)))
    .take(20)

  const latestEventLink = eventLinks
    .filter((link: any) => link.linkType === "event")
    .sort((a: any, b: any) => {
      const timeDiff = (b._creationTime ?? 0) - (a._creationTime ?? 0)
      if (timeDiff !== 0) return timeDiff
      return b._id.localeCompare(a._id)
    })[0]

  const selectedLink = latestOrderLink ?? latestEventLink ?? null

  return {
    bookingRef: order.bookingRef ?? "",
    event: {
      slug: event.slug,
      title: event.title,
      startsAt: event.startsAt,
    },
    order: {
      buyerName: order.bookerName ?? null,
      buyerEmail: order.bookerEmail ?? null,
      buyerPhone: order.bookerPhone ?? null,
      submittedAt: order.submittedAt ?? null,
      orderedAt: order.orderedAt ?? null,
      totalAmountMinor: order.totalAmountMinor ?? null,
      amountDueMinor: totalDueMinor,
      status: order.status ?? null,
    },
    payment: {
      totalDueMinor,
      totalPaidMinor,
      remainingMinor,
      progressPercent: computeProgress(totalPaidMinor, totalDueMinor),
      paymentCount: matchedPayments.length,
      paymentStatus,
    },
    tikkieUrl: selectedLink?.paymentRequestUrl ?? null,
    tikkieAmountMinor: selectedLink?.amountMinor ?? null,
    tikkieDescription: selectedLink?.description ?? null,
  }
}

export const getByEmailOrBookingRef = query({
  args: {
    emailOrBookingRef: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      bookingRef: v.string(),
      event: v.object({
        slug: v.string(),
        title: v.string(),
        startsAt: v.number(),
      }),
      order: v.object({
        buyerName: v.union(v.string(), v.null()),
        buyerEmail: v.union(v.string(), v.null()),
        buyerPhone: v.union(v.string(), v.null()),
        submittedAt: v.union(v.number(), v.null()),
        orderedAt: v.union(v.number(), v.null()),
        totalAmountMinor: v.union(v.number(), v.null()),
        amountDueMinor: v.union(v.number(), v.null()),
        status: v.union(v.string(), v.null()),
      }),
      payment: v.object({
        totalDueMinor: v.number(),
        totalPaidMinor: v.number(),
        remainingMinor: v.number(),
        progressPercent: v.number(),
        paymentCount: v.number(),
        paymentStatus: v.union(
          v.literal("unpaid"),
          v.literal("partial"),
          v.literal("paid"),
          v.literal("overpaid")
        ),
      }),
      tikkieUrl: v.union(v.string(), v.null()),
      tikkieAmountMinor: v.union(v.number(), v.null()),
      tikkieDescription: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const input = args.emailOrBookingRef.trim()

    // First try booking ref
    const bookingRef = normalizeBookingRef(input)
    const orderByRef = await ctx.db
      .query("orders")
      .withIndex("by_bookingRef", (q) => q.eq("bookingRef", bookingRef))
      .first()

    if (orderByRef) {
      return await loadTrackingByOrder(ctx, orderByRef)
    }

    // Try email lookup
    const normalizedEmail = normalizeEmail(input)
    const ordersByEmail = await ctx.db
      .query("orders")
      .withIndex("by_email", (q) => q.eq("bookerEmail", normalizedEmail))
      .take(20)

    // If multiple orders found, prefer the most recent one by submittedAt
    if (ordersByEmail.length > 0) {
      const sorted = ordersByEmail.sort((a, b) => {
        const aTime = a.submittedAt ?? a._creationTime ?? 0
        const bTime = b.submittedAt ?? b._creationTime ?? 0
        return bTime - aTime
      })
      return await loadTrackingByOrder(ctx, sorted[0])
    }

    return null
  },
})
