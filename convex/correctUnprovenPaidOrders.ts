import { v } from "convex/values"
import { internalMutation, internalQuery } from "./_generated/server"
import { assertProductionDeployment } from "../lib/domain/legacy/production-deployment-guard"
import { loadOrderAmountDueBreakdowns } from "./finance"

const DEFAULT_SLUG = "divine-redesign"

const PROOF_STATUSES = new Set(["auto_matched", "manual_assignment"])
const ORDER_LIMIT = 2000
const PAYMENT_PROOF_LIMIT = 200

/**
 * Operator-gated correction for event-scoped orders whose canonical status is
 * `paid` but whose ledger has no applied-payment proof. The orders-row
 * `status: "paid"` is the authoritative paid signal (it is what the Ticket
 * Tailor sync wrote); proof is present only when a `payments` row carries the
 * exact canonical order ID with status `auto_matched` or `manual_assignment`;
 * unassigned, ambiguous, and standalone-donation rows never prove an order.
 *
 * The mutation only flips `orders.status` from `paid` to `pending` for
 * zero-proof orders and never creates, patches, or deletes payment rows. It
 * scans every event order; orders already in a non-paid state are counted as
 * already pending.
 *
 * Run (operator-gated, production): see docs/production-deployment-runbook.md.
 */

export const correctUnprovenPaidOrders = internalMutation({
  args: {
    slug: v.optional(v.string()),
    authorize: v.boolean(),
    allowedDeploymentUrl: v.optional(v.string()),
  },
  returns: v.object({
    ordersScanned: v.number(),
    flipped: v.number(),
    alreadyPending: v.number(),
    skippedWithProof: v.number(),
  }),
  handler: async (ctx, args) => {
    assertProductionDeployment({
      authorize: args.authorize,
      allowedDeploymentUrl: args.allowedDeploymentUrl,
      operation: "zero-proof paid-order correction",
    })

    const slug = args.slug?.trim() || DEFAULT_SLUG

    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()

    if (!event) {
      throw new Error(`Event with slug '${slug}' not found`)
    }

    let ordersScanned = 0
    let flipped = 0
    let alreadyPending = 0
    let skippedWithProof = 0

    for await (const order of ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))) {
      ordersScanned += 1

      if (order.status !== "paid") {
        alreadyPending += 1
        continue
      }

      const payments = await ctx.db
        .query("payments")
        .withIndex("orderId", (q) => q.eq("orderId", String(order._id)))
        .take(PAYMENT_PROOF_LIMIT)
      const hasProof = payments.some(
        (payment) =>
          payment.status !== null &&
          payment.status !== undefined &&
          PROOF_STATUSES.has(payment.status)
      )

      if (hasProof) {
        skippedWithProof += 1
        continue
      }

      await ctx.db.patch("orders", order._id, { status: "pending" })
      flipped += 1
    }

    return {
      ordersScanned,
      flipped,
      alreadyPending,
      skippedWithProof,
    }
  },
})

/**
 * Read-only, event-scoped reconciliation report for the zero-proof paid-order
 * correction. Exposes per-canonical-status counts for the event's orders and
 * the pre-correction order IDs, buyer names, and canonical amount due for the
 * orders that would flip (TT-paid, currently paid, zero applied-payment
 * proof). Never mutates data and returns an empty report when the slug has no
 * event.
 */

export const reconcileUnprovenPaidOrdersReport = internalQuery({
  args: {
    slug: v.optional(v.string()),
  },
  returns: v.object({
    eventId: v.optional(v.string()),
    slug: v.string(),
    ordersScanned: v.number(),
    byCanonicalStatus: v.object({
      paid: v.number(),
      pending: v.number(),
      refunded: v.number(),
      cancelled: v.number(),
    }),
    ordersToFlip: v.array(
      v.object({
        orderId: v.string(),
        buyerName: v.union(v.string(), v.null()),
        amountDueMinor: v.union(v.number(), v.null()),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const slug = args.slug?.trim() || DEFAULT_SLUG

    const empty = {
      eventId: undefined,
      slug,
      ordersScanned: 0,
      byCanonicalStatus: { paid: 0, pending: 0, refunded: 0, cancelled: 0 },
      ordersToFlip: [],
    }

    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()

    if (!event) {
      return empty
    }

    const orders = []
    for await (const order of ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))) {
      orders.push(order)
      if (orders.length >= ORDER_LIMIT) {
        break
      }
    }

    const byCanonicalStatus = {
      paid: 0,
      pending: 0,
      refunded: 0,
      cancelled: 0,
    }
    for (const order of orders) {
      const status = order.status ?? "pending"
      if (status === "paid") byCanonicalStatus.paid += 1
      else if (status === "refunded") byCanonicalStatus.refunded += 1
      else if (status === "cancelled") byCanonicalStatus.cancelled += 1
      else byCanonicalStatus.pending += 1
    }

    const amountDueByOrderId = await loadOrderAmountDueBreakdowns(ctx, orders)

    const ordersToFlip: Array<{
      orderId: string
      buyerName: string | null
      amountDueMinor: number | null
    }> = []

    for (const order of orders) {
      if (order.status !== "paid") {
        continue
      }

      let hasProof = false
      const payments = await ctx.db
        .query("payments")
        .withIndex("orderId", (q) => q.eq("orderId", String(order._id)))
        .take(PAYMENT_PROOF_LIMIT)
      hasProof = payments.some(
        (payment) =>
          payment.status !== null &&
          payment.status !== undefined &&
          PROOF_STATUSES.has(payment.status)
      )

      if (hasProof) {
        continue
      }

      ordersToFlip.push({
        orderId: String(order._id),
        buyerName: order.bookerName ?? null,
        amountDueMinor:
          amountDueByOrderId.get(String(order._id))?.amountDueMinor ??
          order.totalAmountMinor ??
          null,
      })
    }

    return {
      eventId: String(event._id),
      slug,
      ordersScanned: orders.length,
      byCanonicalStatus,
      ordersToFlip,
    }
  },
})
