import { describe, expect, it } from "vitest"
import type { FunctionArgs } from "convex/server"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import {
  ALLOCATION_METHOD_OPTIONS,
  ALLOCATION_REFUSAL_COPY,
  ALLOCATION_REFUSAL_GENERIC,
  ALLOCATION_SCOPE_LABELS,
  allocationRefusalCopy,
  allocationSkipMessage,
  buildAllocationRequest,
  nextAllocationKey,
  scopeLabel,
} from "@/lib/dashboard/donation-allocation-request"

/**
 * The pure editor contract (Phase 58 task 2). These cases pin the three things
 * the dialog must not re-implement: the request shape the server validator
 * declares, the locked refusal copy per code, and a retry-stable idempotency
 * key.
 */

// Branded ids are strings at runtime; no server is involved in this suite.
const maria = "attendee_maria" as Id<"orderAttendees">
const tom = "attendee_tom" as Id<"orderAttendees">

const mariaTarget = { attendeeId: maria, scope: "event_charges" as const }
const tomTarget = { attendeeId: tom, scope: "whole_order" as const }

/**
 * The REAL server argument type for `request`, taken from the generated API.
 * Passing a built request through this function proves at compile time that the
 * builder's object is assignable to `previewDonationAllocation` /
 * `allocateDonation`'s `request` WITHOUT a cast — the plan's load-bearing rule.
 */
type ServerRequestArg = FunctionArgs<
  typeof api.donations.previewDonationAllocation
>["request"]

function asServerRequest(request: ServerRequestArg): ServerRequestArg {
  return request
}

function expectBuilt<T extends { ok: boolean }>(
  result: T
): asserts result is T & { ok: true } {
  if (!result.ok) {
    throw new Error(
      `expected the request to build, received ${JSON.stringify(result)}`
    )
  }
}

describe("buildAllocationRequest", () => {
  it("builds the exact server request shape in the submitted order", () => {
    const targets = [tomTarget, mariaTarget]

    const equal = buildAllocationRequest({ method: "equal", targets })
    expect(equal).toEqual({
      ok: true,
      request: {
        method: "equal",
        targets: [
          { attendeeId: tom, scope: "whole_order" },
          { attendeeId: maria, scope: "event_charges" },
        ],
      },
      canonical:
        '{"method":"equal","targets":[{"attendeeId":"attendee_tom","scope":"whole_order"},{"attendeeId":"attendee_maria","scope":"event_charges"}]}',
    })
    expectBuilt(equal)
    // No cast: the built request IS the server argument type.
    expect(asServerRequest(equal.request)).toEqual(equal.request)

    const largest = buildAllocationRequest({
      method: "largest_balance_first",
      targets,
    })
    expectBuilt(largest)
    expect(largest.request).toEqual({
      method: "largest_balance_first",
      targets: [
        { attendeeId: tom, scope: "whole_order" },
        { attendeeId: maria, scope: "event_charges" },
      ],
    })
    expect(asServerRequest(largest.request)).toEqual(largest.request)

    const manual = buildAllocationRequest({
      method: "manual",
      targets,
      amounts: { [maria]: "12,50", [tom]: "10" },
    })
    expectBuilt(manual)
    expect(manual.request).toEqual({
      method: "manual",
      rows: [
        { attendeeId: tom, amountMinor: 1000, scope: "whole_order" },
        { attendeeId: maria, amountMinor: 1250, scope: "event_charges" },
      ],
    })
    expect(manual.canonical).toBe(
      '{"method":"manual","rows":[{"attendeeId":"attendee_tom","amountMinor":1000,"scope":"whole_order"},{"attendeeId":"attendee_maria","amountMinor":1250,"scope":"event_charges"}]}'
    )
    expect(asServerRequest(manual.request)).toEqual(manual.request)
  })

  it("keeps the canonical string byte-identical for identical state", () => {
    const first = buildAllocationRequest({
      method: "largest_balance_first",
      targets: [tomTarget, mariaTarget],
    })
    const second = buildAllocationRequest({
      method: "largest_balance_first",
      targets: [tomTarget, mariaTarget],
    })
    expect(first).toEqual(second)

    // A changed scope is a changed request.
    const changedScope = buildAllocationRequest({
      method: "largest_balance_first",
      targets: [{ attendeeId: tom, scope: "event_charges" }, mariaTarget],
    })
    expectBuilt(first)
    expectBuilt(changedScope)
    expect(changedScope.canonical).not.toBe(first.canonical)

    // A changed amount is a changed request.
    const baseManual = buildAllocationRequest({
      method: "manual",
      targets: [mariaTarget],
      amounts: { [maria]: "12" },
    })
    const changedAmount = buildAllocationRequest({
      method: "manual",
      targets: [mariaTarget],
      amounts: { [maria]: "13" },
    })
    expectBuilt(baseManual)
    expectBuilt(changedAmount)
    expect(changedAmount.canonical).not.toBe(baseManual.canonical)
  })

  it("refuses to emit a partial request", () => {
    expect(buildAllocationRequest({ method: "equal", targets: [] })).toEqual({
      ok: false,
      reason: "no_targets",
    })

    const zero = buildAllocationRequest({
      method: "manual",
      targets: [mariaTarget],
      amounts: { [maria]: "0" },
    })
    expect(zero).toEqual({
      ok: false,
      reason: "invalid_amount",
      attendeeId: maria,
    })
    expect(zero).not.toHaveProperty("request")

    const nonNumeric = buildAllocationRequest({
      method: "manual",
      targets: [mariaTarget],
      amounts: { [maria]: "abc" },
    })
    expect(nonNumeric).toEqual({
      ok: false,
      reason: "invalid_amount",
      attendeeId: maria,
    })
    expect(nonNumeric).not.toHaveProperty("request")

    // A missing entry is invalid too, and the FIRST offending target is named
    // even when a later entry is also invalid.
    const missing = buildAllocationRequest({
      method: "manual",
      targets: [mariaTarget, tomTarget],
      amounts: { [maria]: "12" },
    })
    expect(missing).toEqual({
      ok: false,
      reason: "invalid_amount",
      attendeeId: tom,
    })
    expect(missing).not.toHaveProperty("request")

    const firstInvalidWins = buildAllocationRequest({
      method: "manual",
      targets: [mariaTarget, tomTarget],
      amounts: { [maria]: "0", [tom]: "abc" },
    })
    expect(firstInvalidWins).toEqual({
      ok: false,
      reason: "invalid_amount",
      attendeeId: maria,
    })
  })
})

describe("allocationRefusalCopy", () => {
  const lockedCopies: Array<{ code: string; copy: string }> = [
    {
      code: "DONATION_ALLOCATION_EXCEEDS_CEILING",
      copy: "Attendee balance limit: this is more than this attendee's own balance for the selected scope. Reduce the amount or switch the scope.",
    },
    {
      code: "DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY",
      copy: "Order capacity limit: this attendee's order has less remaining capacity than this amount. The order's capacity is shared by every attendee on it — reduce the amount or lower another allocation on the same order.",
    },
    {
      code: "DONATION_ALLOCATION_EXCEEDS_REMAINDER",
      copy: "Donation remainder limit: this is more than the donation's unallocated remainder. Reduce the total or record the rest in a later allocation.",
    },
    {
      code: "DONATION_ALLOCATION_DUPLICATE_TARGET",
      copy: "The same attendee is selected more than once. Remove the duplicate.",
    },
    {
      code: "DONATION_ALLOCATION_INVALID_AMOUNT",
      copy: "Enter a positive amount with up to two decimal places.",
    },
    {
      code: "DONATION_ALLOCATION_UNKNOWN_TARGET",
      copy: "One of the selected attendees could not be resolved. Refresh and reselect.",
    },
    {
      code: "DONATION_ALLOCATION_CROSS_EVENT",
      copy: "One of the selected attendees belongs to another event.",
    },
    {
      code: "DONATION_ALLOCATION_PLAN_TOO_LARGE",
      copy: "Too many attendees in one allocation. Split it into two submissions.",
    },
  ]

  it("maps each locked code to its exact copy", () => {
    for (const entry of lockedCopies) {
      // The server throws "<CODE>: <detail>" — and a bare code is mapped too.
      expect(allocationRefusalCopy(`${entry.code}: server detail`)).toBe(
        entry.copy
      )
      expect(allocationRefusalCopy(entry.code)).toBe(entry.copy)
    }
  })

  it("names the bound the server named, in the right entry", () => {
    expect(
      ALLOCATION_REFUSAL_COPY.DONATION_ALLOCATION_EXCEEDS_CEILING.startsWith(
        "Attendee balance limit:"
      )
    ).toBe(true)
    expect(
      ALLOCATION_REFUSAL_COPY.DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY.startsWith(
        "Order capacity limit:"
      )
    ).toBe(true)
    expect(
      ALLOCATION_REFUSAL_COPY.DONATION_ALLOCATION_EXCEEDS_REMAINDER.startsWith(
        "Donation remainder limit:"
      )
    ).toBe(true)

    // ...and the labels are not interchangeable.
    expect(
      ALLOCATION_REFUSAL_COPY.DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY.startsWith(
        "Attendee balance limit:"
      )
    ).toBe(false)
    expect(
      ALLOCATION_REFUSAL_COPY.DONATION_ALLOCATION_EXCEEDS_CEILING.startsWith(
        "Order capacity limit:"
      )
    ).toBe(false)
  })

  it("falls back to the generic copy, matching by prefix and never includes", () => {
    expect(allocationRefusalCopy("SOMETHING_ELSE: x")).toBe(
      ALLOCATION_REFUSAL_GENERIC
    )
    expect(allocationRefusalCopy("")).toBe(ALLOCATION_REFUSAL_GENERIC)

    // A code mentioned inside a longer string is NOT a refusal of that code.
    expect(
      allocationRefusalCopy("X_DONATION_ALLOCATION_EXCEEDS_CEILING: nested")
    ).toBe(ALLOCATION_REFUSAL_GENERIC)
    expect(
      allocationRefusalCopy("network error: DONATION_ALLOCATION_CROSS_EVENT")
    ).toBe(ALLOCATION_REFUSAL_GENERIC)
  })
})

describe("nextAllocationKey", () => {
  const canonicalA =
    '{"method":"equal","targets":[{"attendeeId":"attendee_tom","scope":"whole_order"}]}'
  const canonicalB =
    '{"method":"equal","targets":[{"attendeeId":"attendee_tom","scope":"event_charges"}]}'

  it("a retry never regenerates the key", () => {
    const first = nextAllocationKey(null, "donation_1", canonicalA)
    expect(first.donationId).toBe("donation_1")
    expect(first.requestCanonical).toBe(canonicalA)
    // The key is minted HERE, through the platform UUID source.
    expect(first.key).toMatch(
      /^donation_1:allocate:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )

    const retry = nextAllocationKey(first, "donation_1", canonicalA)
    expect(retry.key).toBe(first.key)
    // Reuse returns the same state object, so a React state update is a no-op.
    expect(retry).toBe(first)

    // A retry after a transient failure still carries the same key.
    const retryAfterFailure = nextAllocationKey(retry, "donation_1", canonicalA)
    expect(retryAfterFailure.key).toBe(first.key)

    const changedRequest = nextAllocationKey(retry, "donation_1", canonicalB)
    expect(changedRequest.key).not.toBe(first.key)
    expect(changedRequest.requestCanonical).toBe(canonicalB)

    const afterSuccess = nextAllocationKey(
      changedRequest,
      "donation_1",
      canonicalB,
      {
        succeeded: true,
      }
    )
    expect(afterSuccess.key).not.toBe(changedRequest.key)

    const otherDonation = nextAllocationKey(
      afterSuccess,
      "donation_2",
      canonicalB
    )
    expect(otherDonation.key).not.toBe(afterSuccess.key)
    expect(otherDonation.key.startsWith("donation_2:allocate:")).toBe(true)

    // Two distinct submissions never share a key.
    const another = nextAllocationKey(null, "donation_1", canonicalA)
    expect(another.key).not.toBe(first.key)
  })
})

describe("scope labels, method options and skip copy", () => {
  it("pins the operator-facing labels", () => {
    expect(ALLOCATION_SCOPE_LABELS).toEqual({
      event_charges: "Event charges",
      whole_order: "Whole order",
    })
    expect(scopeLabel("event_charges")).toBe("Event charges")
    expect(scopeLabel("whole_order")).toBe("Whole order")

    expect(ALLOCATION_METHOD_OPTIONS).toEqual([
      { value: "equal", label: "Split equally" },
      { value: "largest_balance_first", label: "Largest balance first" },
      { value: "manual", label: "Manual amounts" },
    ])
  })

  it("names the skipped target and interpolates its scope", () => {
    expect(
      allocationSkipMessage({
        name: "Maria",
        skipReason: "zero_scope_balance",
        scope: "event_charges",
      })
    ).toBe("Maria: no Event charges balance left — nothing will be allocated.")
    expect(
      allocationSkipMessage({
        name: "Tom",
        skipReason: "zero_scope_balance",
        scope: "whole_order",
      })
    ).toBe("Tom: no Whole order balance left — nothing will be allocated.")
    expect(
      allocationSkipMessage({
        name: "Tom",
        skipReason: "no_funds_remaining",
        scope: "whole_order",
      })
    ).toBe("Tom: the donation ran out before this target.")
  })
})
