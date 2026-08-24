/**
 * Booking-reference resolution module.
 *
 * Every public lookup of an order by booking reference must go through the
 * alias-first resolver so that old booking refs from merged source orders
 * continue to resolve to the merged target. The resolver is deterministic:
 * normalize → alias table → orders.by_bookingRef → merged target chain → null.
 */
import type { Doc, Id } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"

/**
 * Normalize a booking reference string: trim and uppercase. This matches the
 * normalization used by `publicTracking.normalizeBookingRef` and the signup
 * submission module.
 */
export function normalizeBookingRef(bookingRef: string): string {
  return bookingRef.trim().toUpperCase()
}

async function resolveMergedOrder(
  ctx: Pick<QueryCtx, "db">,
  initialOrder: Doc<"orders">
): Promise<Doc<"orders"> | null> {
  let order = initialOrder
  const visited = new Set<string>()

  while (order.mergedIntoOrderId) {
    const orderId = String(order._id)
    if (visited.has(orderId)) {
      return null
    }
    visited.add(orderId)

    const mergedOrder = await ctx.db.get(order.mergedIntoOrderId)
    if (!mergedOrder) {
      return null
    }
    order = mergedOrder
  }

  return order
}

/**
 * Resolve a booking reference to its canonical order.
 *
 * 1. Normalize the input.
 * 2. Check the `orderBookingRefAliases` table for a row matching the
 *    normalized ref. If found, return the *target* order.
 * 3. Otherwise fall back to `orders.by_bookingRef`.
 * 4. Follow core merge markers to the final target, rejecting cycles or
 *    dangling targets.
 * 5. Return `null` if no order matches.
 *
 * The caller should use the returned order for all data reads and writes.
 * The original normalized alias string should be retained for edit-token
 * and signature ownership verification.
 */
export async function loadOrderByBookingRef(
  ctx: Pick<QueryCtx, "db">,
  bookingRef: string
): Promise<Doc<"orders"> | null> {
  const normalized = normalizeBookingRef(bookingRef)

  // 1. Alias table — one indexed row per preserved source bookingRef.
  const alias = await ctx.db
    .query("orderBookingRefAliases")
    .withIndex("by_bookingRef", (q) => q.eq("bookingRef", normalized))
    .first()

  if (alias) {
    const targetOrder = await ctx.db.get("orders", alias.targetOrderId)
    if (targetOrder) return resolveMergedOrder(ctx, targetOrder)
    // An existing alias is authoritative. Falling through to a direct lookup
    // could resolve a stale alias to an unrelated order with the same ref.
    return null
  }

  // 2. Legacy direct lookup — the original orders.by_bookingRef index.
  const order = await ctx.db
    .query("orders")
    .withIndex("by_bookingRef", (q) => q.eq("bookingRef", normalized))
    .first()

  return order ? resolveMergedOrder(ctx, order) : null
}
