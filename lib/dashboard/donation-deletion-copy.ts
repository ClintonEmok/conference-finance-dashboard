/**
 * The DDEL-01 deletion-dialog contract (Phase 58).
 *
 * This module is PURE and owns every string the delete confirmation renders plus
 * the idempotency-key policy. Two properties are load-bearing:
 *
 *   1. The confirmation NAMES the donation's amount and its allocation count
 *      before the action can be submitted (DDEL-01). The amount is formatted
 *      HERE, inside `buildDonationDeletionConfirmation`, so the dialog never
 *      computes a money figure of its own — the count is passed through
 *      verbatim, never counted from rows in the UI.
 *   2. The idempotency key is minted ONCE per donation and REUSED for every
 *      retry (a refusal, a transient error, a timeout, a double-click). The
 *      server replays a same-key submission from its frozen ledger row with
 *      ZERO writes; a fresh key per attempt would instead surface
 *      `DONATION_DELETE_ALREADY_DELETED` for work that already succeeded. This
 *      is the single place in the phase's deletion path that calls
 *      `crypto.randomUUID()`.
 *
 * `DONATION_DELETE_INVALID_KEY` is deliberately NOT in the refusal map: the
 * dialog always mints a non-empty key, so that refusal is unreachable from this
 * surface and must fall through to the generic copy rather than acquire UI copy
 * that claims a reachable state.
 */

import { formatMoney } from "@/lib/format"

/**
 * The confirmation body (UI-SPEC §6). The amount is formatted from a
 * server-provided `amountMinor`; the count is a server-provided figure
 * (`getEventDonationIncome.donations[].allocationCount`) and inflects:
 * `1 allocation` / `N allocations`, with a dedicated zero sentence because
 * `0 allocations` would misdescribe a clean zero-allocation deletion.
 */
export function buildDonationDeletionConfirmation(input: {
  amountMinor: number
  payerName: string
  allocationCount: number
  currency?: string
}): string {
  const lead = `Delete the ${formatMoney(input.amountMinor, input.currency)} donation from ${input.payerName}?`

  if (input.allocationCount === 0) {
    return `${lead} This removes no allocations. This cannot be undone.`
  }

  const noun = input.allocationCount === 1 ? "allocation" : "allocations"
  return `${lead} This removes ${input.allocationCount} ${noun} and restores the affected attendee balances. This cannot be undone.`
}

/**
 * The success band the hosting page renders in a `role="status"` element after
 * `onDeleted` — the dialog itself closes on success (UI-SPEC §6). Mirrors the
 * confirmation's zero case so the two never disagree about what happened.
 */
export function buildDonationDeletionSuccess(input: {
  allocationCount: number
}): string {
  if (input.allocationCount === 0) {
    return "Donation deleted. No allocations were reversed."
  }

  const noun = input.allocationCount === 1 ? "allocation" : "allocations"
  return `Donation deleted. ${input.allocationCount} ${noun} reversed and attendee balances restored.`
}

/**
 * The LOCKED code -> copy pairs (UI-SPEC §6). The server throws
 * `"<CODE>: <detail>"`, so the mapper is a pure PREFIX match — never
 * `includes` (a code mentioned inside another string must not match), never a
 * number parsed out of the detail.
 */
export const DONATION_DELETION_REFUSAL_COPY = {
  DONATION_DELETE_NOT_STANDALONE:
    "Only standalone donations can be deleted. This donation is linked to an order.",
  DONATION_DELETE_CROSS_EVENT: "This donation belongs to a different event.",
  DONATION_DELETE_TIKKIE_SOURCED:
    "Tikkie-sourced donations cannot be deleted — the payment sync would recreate this donation.",
  DONATION_DELETE_PAYMENT_GUARD:
    "This payment cannot be deleted under the existing payment rules.",
  DONATION_DELETE_NOT_FOUND:
    "This donation no longer exists. Refresh the list.",
  DONATION_DELETE_ALREADY_DELETED:
    "This donation was already deleted. Refresh the list.",
  DONATION_DELETE_IDEMPOTENCY_CONFLICT:
    "This confirmation was already used for a different request. Close and reopen the dialog.",
} as const

export const DONATION_DELETION_REFUSAL_GENERIC =
  "The donation could not be deleted. Try again."

/**
 * Maps a thrown deletion error message to its operator copy. A known code
 * matches when the message STARTS WITH it (bare code or `"<CODE>: …"`); every
 * other message — a network failure, a session error, a code merely mentioned
 * inside another string — falls through to the generic copy.
 */
export function donationDeletionRefusalCopy(message: string): string {
  const codes = Object.keys(DONATION_DELETION_REFUSAL_COPY) as Array<
    keyof typeof DONATION_DELETION_REFUSAL_COPY
  >

  for (const code of codes) {
    if (message.startsWith(code)) {
      return DONATION_DELETION_REFUSAL_COPY[code]
    }
  }

  return DONATION_DELETION_REFUSAL_GENERIC
}

/**
 * The dialog's minted-key state. A key belongs to ONE donation; it is an opaque
 * string (never a typed table id), which is why `donationId` stays `string`
 * even though the dialog's own prop is `Id<"payments">`.
 */
export type DonationDeletionKeyState = {
  donationId: string
  key: string
}

/** Mints the one key shape the dialog ever submits: `<donationId>:delete:<uuid>`. */
export function mintDonationDeletionKey(donationId: string): string {
  return `${donationId}:delete:${crypto.randomUUID()}`
}

/**
 * The retry-stable key policy — the whole reason the server has a replay
 * ledger. `current` is returned UNCHANGED (same object identity, so a React
 * state update is a no-op) when it already belongs to this donation; it is
 * regenerated only when there is no key yet, when the donation changed, or
 * after a SUCCESSFUL deletion. The catch path in the dialog must never call
 * this with `succeeded`, so a retry after a refusal replays the same key.
 */
export function nextDonationDeletionKey(
  current: DonationDeletionKeyState | null,
  donationId: string,
  options?: { succeeded?: boolean }
): DonationDeletionKeyState {
  if (
    current === null ||
    current.donationId !== donationId ||
    options?.succeeded === true
  ) {
    return { donationId, key: mintDonationDeletionKey(donationId) }
  }

  return current
}
