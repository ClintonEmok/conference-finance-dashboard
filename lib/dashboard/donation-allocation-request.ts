/**
 * Pure editor contract for the donation-allocation dialog (Phase 58, plan 58-03).
 *
 * Three things are load-bearing for the dialog and all three are pure:
 *
 *   1. The submitted request must be the server's
 *      `allocationRequestValidator` shape BRANCH FOR BRANCH, so the dialog can
 *      pass it as `request` without a cast (`buildAllocationRequest`).
 *   2. A refusal must report the bound the SERVER named, never a bound the
 *      client re-derived or a number parsed out of the message
 *      (`allocationRefusalCopy`).
 *   3. A retried submit must REUSE its idempotency key, because the server's
 *      replay ledger keys on it (`nextAllocationKey`). The key is minted here
 *      and nowhere else.
 *
 * This module is dependency-free by contract: the only imports are the shared
 * typed-amount parser and the generated `Id` type (typing only). It reads
 * nothing, writes nothing and performs no arithmetic over server figures — the
 * `min(...)` that produces a writable figure stays server-side.
 */

import type { Id } from "@/convex/_generated/dataModel"
import { parseMinorUnitsInput } from "@/lib/format"

export type AllocationScope = "event_charges" | "whole_order"

export type AllocationMethod = "equal" | "largest_balance_first" | "manual"

export type AllocationAttendeeId = Id<"orderAttendees">

/**
 * Mirrors `allocationRequestValidator` (`convex/donations.ts`): `manual` carries
 * explicit operator amounts; `equal` and `largest_balance_first` carry only
 * targets + scope, because the server computes every distributed amount (D-07).
 *
 * The two distribution branches share one `targets` payload and differ only in
 * their literal, so they are declared with a union-typed `method`. That form is
 * assignable to the generated argument type WITHOUT a cast — pinned by the
 * `asServerRequest` probe in `tests/dashboard/donation-allocation-request.test.ts`,
 * which is typed from the real `api.donations.previewDonationAllocation`.
 */
export type AllocationRequest =
  | {
      method: "manual"
      rows: Array<{
        attendeeId: AllocationAttendeeId
        amountMinor: number
        scope: AllocationScope
      }>
    }
  | {
      method: "equal" | "largest_balance_first"
      targets: Array<{
        attendeeId: AllocationAttendeeId
        scope: AllocationScope
      }>
    }

/** One selected target as the dialog holds it: attendee + chosen scope. */
export type AllocationDraftTarget = {
  attendeeId: AllocationAttendeeId
  scope: AllocationScope
}

export const ALLOCATION_SCOPE_LABELS: Record<AllocationScope, string> = {
  event_charges: "Event charges",
  whole_order: "Whole order",
}

/** The exact operator-facing name of a recorded scope (D-14, never inferred). */
export function scopeLabel(scope: AllocationScope): string {
  return ALLOCATION_SCOPE_LABELS[scope]
}

/**
 * The CHOOSER's vocabulary (Phase 58, 58-08): scope is presented to the
 * operator as an intent, never as the stored `event_charges`/`whole_order`
 * values. The recorded-scope nouns above stay for recorded facts (the record
 * chip and the skip copy).
 *
 * KEY ORDER IS THE CHOOSER'S OPTION ORDER. `SCOPE_CHOICES =
 * Object.keys(ALLOCATION_SCOPE_INTENT_LABELS)` (58-08) feeds both the bulk and
 * the per-row scope selects, so the DEFAULT scope (`whole_order`, the simple
 * case) leads the list — the value's default and its lead position agree.
 * Values are untouched (Phase 58, 58-09).
 */
export const ALLOCATION_SCOPE_INTENT_LABELS: Record<AllocationScope, string> = {
  whole_order: "Apply to the whole order",
  event_charges: "Restrict to this attendee only",
}

/** The intent shown for a scope value (never the raw string). */
export function scopeIntentLabel(scope: AllocationScope): string {
  return ALLOCATION_SCOPE_INTENT_LABELS[scope]
}

/** The default scope: the simple case, applying to the whole order. */
export const DEFAULT_ALLOCATION_SCOPE: AllocationScope = "whole_order"

export const ALLOCATION_METHOD_OPTIONS: ReadonlyArray<{
  value: AllocationMethod
  label: string
}> = [
  { value: "equal", label: "Split equally" },
  { value: "largest_balance_first", label: "Largest balance first" },
  { value: "manual", label: "Manual amounts" },
]

/**
 * The builder's outcome. Failures carry NO partial request — a half-built
 * `manual` plan must never reach the server, so the failure branch has no
 * `request` field at all.
 */
export type AllocationRequestBuildResult =
  | { ok: true; request: AllocationRequest; canonical: string }
  | { ok: false; reason: "no_targets" }
  | { ok: false; reason: "invalid_amount"; attendeeId: AllocationAttendeeId }

/**
 * Builds the exact object the dialog submits.
 *
 *   - `no_targets` when nothing is selected.
 *   - `equal` / `largest_balance_first` keep the operator's submitted order
 *     (that array order IS the stable selection order D-09 depends on).
 *   - `manual` parses each row's typed amount through the ONE shared parser;
 *     the FIRST invalid entry is reported with its `attendeeId` so the dialog
 *     can render the field error on that row.
 *
 * `canonical` is `JSON.stringify(request)` with the object key order fixed by
 * this builder, so identical state yields a byte-identical string (the key
 * policy below compares it) and any changed amount, scope, target or method
 * yields a different one.
 */
export function buildAllocationRequest(input: {
  method: AllocationMethod
  targets: ReadonlyArray<AllocationDraftTarget>
  /** Raw input text per attendeeId; only read when method === "manual". */
  amounts?: Readonly<Record<string, string>>
}): AllocationRequestBuildResult {
  if (input.targets.length === 0) {
    return { ok: false, reason: "no_targets" }
  }

  if (input.method === "manual") {
    const rows: Array<{
      attendeeId: AllocationAttendeeId
      amountMinor: number
      scope: AllocationScope
    }> = []

    for (const target of input.targets) {
      const parsed = parseMinorUnitsInput(
        input.amounts?.[target.attendeeId] ?? ""
      )
      if (!parsed.ok) {
        return {
          ok: false,
          reason: "invalid_amount",
          attendeeId: target.attendeeId,
        }
      }
      rows.push({
        attendeeId: target.attendeeId,
        amountMinor: parsed.amountMinor,
        scope: target.scope,
      })
    }

    const request: AllocationRequest = { method: "manual", rows }
    return { ok: true, request, canonical: JSON.stringify(request) }
  }

  const targets = input.targets.map((target) => ({
    attendeeId: target.attendeeId,
    scope: target.scope,
  }))

  const request: AllocationRequest =
    input.method === "equal"
      ? { method: "equal", targets }
      : { method: "largest_balance_first", targets }

  return { ok: true, request, canonical: JSON.stringify(request) }
}

/**
 * The LOCKED code -> copy pairs (UI-SPEC §6). The server throws
 * `"<CODE>: <detail>"`, so the mapper is a pure PREFIX match — never
 * `includes`, and never a number parsed out of the detail. The UI must report
 * the bound the server named, not reinterpret it.
 */
export const ALLOCATION_REFUSAL_COPY = {
  DONATION_ALLOCATION_EXCEEDS_CEILING:
    "Attendee balance limit: this is more than this attendee's own balance for the selected scope. Reduce the amount or switch the scope.",
  DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY:
    "Order capacity limit: this attendee's order has less remaining capacity than this amount. The order's capacity is shared by every attendee on it — reduce the amount or lower another allocation on the same order.",
  DONATION_ALLOCATION_EXCEEDS_REMAINDER:
    "Donation remainder limit: this is more than the donation's unallocated remainder. Reduce the total or record the rest in a later allocation.",
  DONATION_ALLOCATION_DUPLICATE_TARGET:
    "The same attendee is selected more than once. Remove the duplicate.",
  DONATION_ALLOCATION_INVALID_AMOUNT:
    "Enter a positive amount with up to two decimal places.",
  DONATION_ALLOCATION_UNKNOWN_TARGET:
    "One of the selected attendees could not be resolved. Refresh and reselect.",
  DONATION_ALLOCATION_CROSS_EVENT:
    "One of the selected attendees belongs to another event.",
  DONATION_ALLOCATION_PLAN_TOO_LARGE:
    "Too many attendees in one allocation. Split it into two submissions.",
} as const

export const ALLOCATION_REFUSAL_GENERIC =
  "The allocation could not be quoted. Adjust the amount and try again."

/**
 * Maps a thrown allocation error message to its operator copy. A known code
 * matches when the message STARTS WITH it (bare code or `"<CODE>: …"`); every
 * other message (a network failure, a session error, a code mentioned inside
 * another string) falls through to the generic copy.
 */
export function allocationRefusalCopy(message: string): string {
  const codes = Object.keys(ALLOCATION_REFUSAL_COPY) as Array<
    keyof typeof ALLOCATION_REFUSAL_COPY
  >

  for (const code of codes) {
    if (message.startsWith(code)) {
      return ALLOCATION_REFUSAL_COPY[code]
    }
  }

  return ALLOCATION_REFUSAL_GENERIC
}

/**
 * The preview's skipped-target copy (D-20). A skipped target is listed, never
 * dropped: either its own scope balance was already cleared, or the donation
 * ran out of money before reaching it.
 */
export function allocationSkipMessage(input: {
  name: string
  skipReason: "zero_scope_balance" | "no_funds_remaining"
  scope: AllocationScope
}): string {
  if (input.skipReason === "zero_scope_balance") {
    return `${input.name}: no ${scopeLabel(input.scope)} balance left — nothing will be allocated.`
  }
  return `${input.name}: the donation ran out before this target.`
}

/** The dialog's minted-key state; the same object is reused across retries. */
export type AllocationKeyState = {
  donationId: string
  requestCanonical: string
  key: string
}

/**
 * The idempotency-key policy. A key belongs to a `(donationId, requestCanonical)`
 * pair and is REUSED across retries of that exact request; it is regenerated
 * only when there is no key yet, when the donation or the request changed, or
 * after a successful submission. A retry that minted a fresh key would defeat
 * the whole purpose of the server's replay ledger — it must never happen.
 *
 * Reuse returns `current` unchanged (same object identity), so a React state
 * update with an equal value is a no-op.
 */
export function nextAllocationKey(
  current: AllocationKeyState | null,
  donationId: string,
  requestCanonical: string,
  options?: { succeeded?: boolean }
): AllocationKeyState {
  if (
    current === null ||
    current.donationId !== donationId ||
    current.requestCanonical !== requestCanonical ||
    options?.succeeded === true
  ) {
    return {
      donationId,
      requestCanonical,
      key: `${donationId}:allocate:${crypto.randomUUID()}`,
    }
  }

  return current
}
