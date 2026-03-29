import { v } from "convex/values"

/**
 * Tikkie payment link lifecycle status.
 */
export const tikkieLinkStatusValidator = v.union(
  v.literal("created"),
  v.literal("paid"),
  v.literal("expired")
)

export type TikkieLinkStatus = "created" | "paid" | "expired"

/**
 * Tikkie payment match status — how an individual payment was resolved.
 */
export const tikkieMatchStatusValidator = v.union(
  v.literal("unmatched"),
  v.literal("auto_matched"),
  v.literal("manual")
)

export type TikkieMatchStatus = "unmatched" | "auto_matched" | "manual"

/**
 * Tikkie link type — order-level vs event-level payment link.
 */
export const tikkieLinkTypeValidator = v.union(
  v.literal("event"),
  v.literal("order")
)

export type TikkieLinkType = "event" | "order"

/**
 * Tikkie status source — how the link status was determined.
 */
export const tikkieStatusSourceValidator = v.union(
  v.literal("create"),
  v.literal("webhook"),
  v.literal("poll")
)

export type TikkieStatusSource = "create" | "webhook" | "poll"
