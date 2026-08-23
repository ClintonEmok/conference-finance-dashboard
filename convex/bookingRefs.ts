/**
 * Booking-reference resolution module.
 *
 * Every public lookup of an order by booking reference must go through the
 * alias-first resolver so that old booking refs from merged source orders
 * continue to resolve to the merged target. The resolver is deterministic:
 * normalize → alias table → orders.by_bookingRef → null.
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

/**
 * Resolve a booking reference to its canonical order.
 *
 * 1. Normalize the input.
 * 2. Check the `orderBookingRefAliases` table for a row matching the
 *    normalized ref. If found, return the *target* order.
 * 3. Otherwise fall back to `orders.by_bookingRef`.
 * 4. Return `null` if no order matches.
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
    if (targetOrder) return targetOrder
  }

  // 2. Legacy direct lookup — the original orders.by_bookingRef index.
  const order = await ctx.db
    .query("orders")
    .withIndex("by_bookingRef", (q) => q.eq("bookingRef", normalized))
    .first()

  return order ?? null
}
