/**
 * The D-06 per-allocation removal contract (Phase 61, plan 61-07).
 *
 * This module is PURE and owns every string the removal confirmation renders
 * plus the idempotency-key policy. It is deliberately SEPARATE from — and
 * LIGHTER than — the DDEL-01 donation-deletion contract: the donation survives
 * a removal, the action is trivially repeatable, and the confirmation names ONE
 * allocation (its target attendee and its RECORDED amount) instead of a whole
 * donation and its allocation count.
 *
 * WHAT THE WIRED MUTATION DOES (`api.donations.removeDonationAllocation`):
 *
 *   - A HARD delete of the `(donationId, attendeeId)` allocation row plus ONE
 *     append-only `donationAllocationRemovals` audit row, in one transaction. A
 *     soft tombstone would keep occupying the slot and break D-02's
 *     at-most-one-row invariant, so re-allocation to the same attendee must
 *     stay possible.
 *   - NOTHING is clamped, re-spent or redistributed: the freed amount simply
 *     returns to the donation's DERIVED remainder. The confirmation says so,
 *     because the operator must understand the money does not vanish and is
 *     not re-targeted.
 *   - It never writes to `payments` (DACC-03).
 *
 * REPLAY RESOLVES BEFORE THE GUARDS. The server's key ledger is scoped
 * `(donationId, idempotencyKey)` — NOT per operation — so a retry with the SAME
 * key replays the frozen result even though the row no longer exists, while a
 * REGENERATED key falls through to the not-found guard. The key must therefore
 * be stable across retries (a refusal, a transient error, a double-click), and
 * the minted form must be `remove`-namespaced: reusing an `allocate` key here
 * is an intentional digest conflict (`DONATION_ALLOCATION_IDEMPOTENCY_CONFLICT`).
 *
 * This module is the ONE `crypto.randomUUID()` site on the removal path; the
 * dialog mints its key only through `nextAllocationRemovalKey`.
 *
 * `DONATION_ALLOCATION_INVALID_KEY` is deliberately NOT in the refusal map: the
 * dialog always mints a non-empty key, so that refusal is unreachable from this
 * surface and must fall through to the generic copy rather than acquire UI copy
 * that claims a reachable state (the deletion module's recorded rationale,
 * mirrored).
 */

import { formatMoney } from "@/lib/format"

/**
 * The LIGHT confirmation body. It names the target attendee and the row's
 * RECORDED amount, and states that the amount returns to the donation's
 * unallocated remainder. The amount is formatted HERE so the dialog computes no
 * money figure of its own. The RECORDED amount is deliberate: a row's applied
 * figure may be lower when a ceiling dropped, but removal frees what was
 * recorded.
 */
export function buildAllocationRemovalConfirmation(input: {
  amountMinor: number
  attendeeName: string
  currency?: string
}): string {
  return `Remove the ${formatMoney(input.amountMinor, input.currency)} allocation to ${input.attendeeName}? The amount returns to this donation's unallocated remainder.`
}

/**
 * The freed-amount band the detail host renders in a `role="status"` element
 * after `onRemoved` — the dialog itself closes on success. It reports the
 * amount the removal returned to the donation's unallocated remainder.
 */
export function buildAllocationRemovalSuccess(input: {
  amountMinor: number
  currency?: string
}): string {
  return `Allocation removed. ${formatMoney(input.amountMinor, input.currency)} returns to this donation's unallocated remainder.`
}

/**
 * The LOCKED code -> copy pairs. The server throws `"<CODE>: <detail>"`, so the
 * mapper is a pure PREFIX match — never `includes` (a code mentioned inside
 * another string must not match), never a number parsed out of the detail.
 */
export const DONATION_ALLOCATION_REMOVAL_REFUSAL_COPY = {
  DONATION_ALLOCATION_NOT_FOUND:
    "This allocation no longer exists. Refresh the record to see the current allocations.",
  DONATION_NOT_STANDALONE:
    "Only standalone donations can be changed. This donation is linked to an order.",
  DONATION_ALLOCATION_CROSS_EVENT: "This donation belongs to a different event.",
  DONATION_ALLOCATION_IDEMPOTENCY_CONFLICT:
    "This removal was already used for a different request. Close and reopen the dialog.",
} as const

export const DONATION_ALLOCATION_REMOVAL_REFUSAL_GENERIC =
  "The allocation could not be removed. Try again."

/**
 * Maps a thrown removal error message to its operator copy. A known code
 * matches when the message STARTS WITH it (bare code or `"<CODE>: …"`); every
 * other message — a network failure, a session error, a code merely mentioned
 * inside another string — falls through to the generic copy.
 */
export function allocationRemovalRefusalCopy(message: string): string {
  const codes = Object.keys(DONATION_ALLOCATION_REMOVAL_REFUSAL_COPY) as Array<
    keyof typeof DONATION_ALLOCATION_REMOVAL_REFUSAL_COPY
  >

  for (const code of codes) {
    if (message.startsWith(code)) {
      return DONATION_ALLOCATION_REMOVAL_REFUSAL_COPY[code]
    }
  }

  return DONATION_ALLOCATION_REMOVAL_REFUSAL_GENERIC
}

/**
 * The dialog's minted-key state. A key belongs to ONE donation; it is an opaque
 * string (never a typed table id), which is why `donationId` stays `string`
 * even though the dialog's own prop is `Id<"payments">`.
 */
export type AllocationRemovalKeyState = {
  donationId: string
  key: string
}

/**
 * Mints the one key shape the dialog ever submits:
 * `<donationId>:remove:<uuid>`.
 */
export function mintAllocationRemovalKey(donationId: string): string {
  return `${donationId}:remove:${crypto.randomUUID()}`
}

/**
 * The retry-stable key policy — the whole reason the server's replay ledger is
 * reachable. `current` is returned UNCHANGED (same object identity, so a React
 * state update is a no-op) when it already belongs to this donation; it is
 * regenerated only when there is no key yet, when the donation changed, or
 * after a SUCCESSFUL removal. The dialog's catch path must never call this with
 * `succeeded`, so a retry after a refusal replays the same key — a regenerated
 * key would instead surface `DONATION_ALLOCATION_NOT_FOUND` for work that
 * already succeeded.
 */
export function nextAllocationRemovalKey(
  current: AllocationRemovalKeyState | null,
  donationId: string,
  options?: { succeeded?: boolean }
): AllocationRemovalKeyState {
  if (
    current === null ||
    current.donationId !== donationId ||
    options?.succeeded === true
  ) {
    return { donationId, key: mintAllocationRemovalKey(donationId) }
  }

  return current
}
