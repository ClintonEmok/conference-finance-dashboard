/**
 * The per-row delete-refusal description (Phase 61, plan 61-02 — bug A).
 *
 * The donations list renders one Delete button per row. A row can be
 * undeletable for exactly two reasons, and each reason is true only of the
 * rows that meet it:
 *
 *   1. The row is Tikkie-sourced — the payment sync would recreate it.
 *   2. The allocation count has not resolved yet, so the confirmation cannot
 *      name what a deletion would remove.
 *
 * This module is THE owner of both copy strings. The workspace imports the
 * builder ONLY, so a row can never announce a reason that is not true of it.
 * The shape this replaces rendered ONE document-level `sr-only` paragraph
 * concatenating BOTH reasons and referenced it from every gated row, so a cash
 * donation with a known count announced the Tikkie refusal too (D-03).
 *
 * Pure by contract: no imports, no reads, no money. The count is the tri-state
 * server value — `undefined` is unknown and is never coerced to 0.
 */

export const TIKKIE_DELETE_REFUSAL =
  "Tikkie-sourced donations cannot be deleted — the payment sync would recreate this donation."

export const ALLOCATION_COUNT_PENDING = "Preparing the allocation count…"

/**
 * The exact reasons true of ONE row, joined by one space in announcement order
 * (Tikkie first when both apply), or `null` when the row has nothing to refuse.
 */
export function buildDonationDeleteDescription(input: {
  source: "cash" | "bank_transfer" | "tikkie"
  allocationCount: number | undefined
}): string | null {
  const reasons: Array<string> = []

  if (input.source === "tikkie") {
    reasons.push(TIKKIE_DELETE_REFUSAL)
  }
  if (input.allocationCount === undefined) {
    reasons.push(ALLOCATION_COUNT_PENDING)
  }

  return reasons.length === 0 ? null : reasons.join(" ")
}
