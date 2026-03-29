import { v } from "convex/values"

/**
 * Room availability status — derived from occupancy vs capacity.
 */
export type RoomAvailability = "empty" | "available" | "full"

/**
 * Tikkie payment link status — lifecycle state of a payment link.
 */
export const tikkieLinkStatusValidator = v.union(
  v.literal("created"),
  v.literal("paid"),
  v.literal("expired")
)

export type TikkieLinkStatus = "created" | "paid" | "expired"

/**
 * Tikkie payment match status — how a Tikkie payment was resolved.
 */
export const tikkieMatchStatusValidator = v.union(
  v.literal("unmatched"),
  v.literal("auto_matched"),
  v.literal("manual")
)

export type TikkieMatchStatus = "unmatched" | "auto_matched" | "manual"
