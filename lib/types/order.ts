import { v } from "convex/values"

/**
 * Canonical order status — normalized from Ticket Tailor provider statuses.
 */
export const canonicalOrderStatusValidator = v.union(
  v.literal("paid"),
  v.literal("refunded"),
  v.literal("cancelled"),
  v.literal("pending")
)

export type CanonicalOrderStatus = "paid" | "refunded" | "cancelled" | "pending"

/**
 * Nullable string validator — reused across order/payment DTOs.
 */
export const nullableStringValidator = v.union(v.string(), v.null())

/**
 * Order ledger row — the shape returned by order listing queries.
 * Used by getOrdersWithFilters and getOrdersForReconciliation.
 * Source-agnostic: uses canonical event fields (eventId, eventSlug, eventTitle).
 */
export const orderLedgerRowValidator = v.object({
  providerOrderId: v.string(),
  eventId: v.string(),
  eventSlug: v.string(),
  eventTitle: nullableStringValidator,
  normalizedStatus: canonicalOrderStatusValidator,
  isArchived: v.boolean(),
  archivedAt: nullableStringValidator,
  archiveReason: nullableStringValidator,
  totalAmountMinor: v.number(),
  currency: nullableStringValidator,
  orderedAt: nullableStringValidator,
  refundedAt: nullableStringValidator,
  buyerName: nullableStringValidator,
  buyerEmail: nullableStringValidator,
})

/**
 * Order search row — minimal shape for order picker dropdowns.
 */
export const orderSearchRowValidator = v.object({
  id: v.union(v.id("orders"), v.id("ticketTailorOrders")),
  providerOrderId: v.string(),
  buyerName: nullableStringValidator,
  totalAmountMinor: v.number(),
})
