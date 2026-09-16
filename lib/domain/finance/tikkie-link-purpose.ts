import { v } from "convex/values"

export type TikkieLinkPurpose = "payment" | "donation"

export const tikkieLinkPurposeValidator = v.union(
  v.literal("payment"),
  v.literal("donation")
)

/**
 * Undefined, null or any unrecognised value means "payment" everywhere for
 * backward compatibility: links stored before the discriminator existed carry
 * no `purpose` and are never backfilled, so only the exact "donation" value is
 * ever treated as a donation.
 */
export function resolveTikkieLinkPurpose(
  value: string | null | undefined
): TikkieLinkPurpose {
  return value === "donation" ? "donation" : "payment"
}

export function isDonationLink(link: { purpose?: string | null }): boolean {
  return link.purpose === "donation"
}
