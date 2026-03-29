import { v } from "convex/values"

/**
 * Gender classification for accommodation allocation.
 */
export const genderTypeValidator = v.union(
  v.literal("MALE"),
  v.literal("FEMALE"),
  v.literal("MIXED"),
  v.literal("UNKNOWN")
)

export type GenderType = "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"

/**
 * Allocation priority — used for room assignment ordering.
 */
export const allocationPriorityValidator = v.union(
  v.literal("CRITICAL"),
  v.literal("HIGH"),
  v.literal("NORMAL"),
  v.literal("LOW")
)

export type AllocationPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
