import { v } from "convex/values"

/**
 * Payment source types — where a payment originated.
 * Shared across Convex mutations, queries, and app-layer type contracts.
 */
export const paymentSourceValidator = v.union(
  v.literal("tikkie"),
  v.literal("bank_transfer"),
  v.literal("cash")
)

export type PaymentSource = "tikkie" | "bank_transfer" | "cash"

/**
 * Payment matching status — how a payment was linked to an order.
 */
export const paymentStatusValidator = v.union(
  v.literal("auto_matched"),
  v.literal("manual_assignment"),
  v.literal("ambiguous"),
  v.literal("unassigned")
)

export type PaymentStatus =
  | "auto_matched"
  | "manual_assignment"
  | "ambiguous"
  | "unassigned"

/**
 * Full payment document validator — mirrors the `payments` table schema.
 */
export const paymentDocValidator = v.object({
  _id: v.id("payments"),
  _creationTime: v.number(),
  source: paymentSourceValidator,
  sourceId: v.optional(v.string()),
  payerName: v.string(),
  payerAccountNumber: v.optional(v.string()),
  amountMinor: v.number(),
  paidAt: v.number(),
  orderId: v.optional(v.string()),
  status: v.optional(paymentStatusValidator),
  matchedAt: v.optional(v.number()),
  matchedBy: v.optional(v.string()),
  reference: v.optional(v.string()),
  notes: v.optional(v.string()),
  providerPayload: v.optional(v.any()),
})
