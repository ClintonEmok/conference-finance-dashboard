import { describe, expect, it } from "vitest"

import {
  allocationRemovalRefusalCopy,
  buildAllocationRemovalConfirmation,
  buildAllocationRemovalSuccess,
  DONATION_ALLOCATION_REMOVAL_REFUSAL_COPY,
  DONATION_ALLOCATION_REMOVAL_REFUSAL_GENERIC,
  mintAllocationRemovalKey,
  nextAllocationRemovalKey,
} from "@/lib/dashboard/donation-allocation-removal-copy"
import { nextAllocationKey } from "@/lib/dashboard/donation-allocation-request"

/**
 * The pure D-06 removal-dialog contract (Phase 61, plan 61-07).
 *
 * These cases pin the two properties the dialog must not re-implement:
 *
 *   1. The LIGHT confirmation names the target attendee, the row's RECORDED
 *      amount, and the return to the donation's unallocated remainder — the
 *      operator must understand that nothing is clamped, re-spent or
 *      redistributed (D-03), and that the money does not vanish.
 *   2. The idempotency key is REUSED across retries, because the server's
 *      replay resolves BEFORE its guards: a regenerated key would surface
 *      `DONATION_ALLOCATION_NOT_FOUND` for work that already succeeded. The key
 *      is `remove`-namespaced so it can never be mistaken for an allocation
 *      key (a reused `allocate` key is an intentional digest conflict).
 */

describe("buildAllocationRemovalConfirmation", () => {
  it("renders the operator's example verbatim, naming the attendee and the amount", () => {
    const copy = buildAllocationRemovalConfirmation({
      amountMinor: 15000,
      attendeeName: "Preview Attendee 116",
    })

    expect(copy).toBe(
      "Remove the €150.00 allocation to Preview Attendee 116? The amount returns to this donation's unallocated remainder."
    )
    expect(copy).toContain("Preview Attendee 116")
    expect(copy).toContain("€150.00")
    expect(copy).toContain(
      "returns to this donation's unallocated remainder"
    )
  })

  it("names the RECORDED amount, never a lower applied figure", () => {
    // The builder has no applied input by construction: the value it formats is
    // the row's recorded amount. A hypothetical applied figure (the row's
    // ceiling had dropped) must not appear anywhere in the string.
    const recordedMinor = 15000
    const appliedMinor = 12500
    const copy = buildAllocationRemovalConfirmation({
      amountMinor: recordedMinor,
      attendeeName: "Preview Attendee 116",
    })

    expect(copy).toContain("€150.00")
    expect(copy).not.toContain("€125.00")
    expect(copy).not.toContain(String(appliedMinor))
  })

  it("threads a non-EUR currency through formatMoney", () => {
    const copy = buildAllocationRemovalConfirmation({
      amountMinor: 15000,
      attendeeName: "Preview Attendee 116",
      currency: "USD",
    })

    expect(copy).toContain("$150.00")
    expect(copy).not.toContain("€")
  })
})

describe("buildAllocationRemovalSuccess", () => {
  it("renders the exact freed-amount string", () => {
    expect(buildAllocationRemovalSuccess({ amountMinor: 15000 })).toBe(
      "Allocation removed. €150.00 returns to this donation's unallocated remainder."
    )
  })

  it("threads a non-EUR currency through formatMoney", () => {
    const copy = buildAllocationRemovalSuccess({
      amountMinor: 15000,
      currency: "USD",
    })
    expect(copy).toBe(
      "Allocation removed. $150.00 returns to this donation's unallocated remainder."
    )
    expect(copy).not.toContain("€")
  })
})

describe("allocationRemovalRefusalCopy", () => {
  it("maps every locked code to its exact copy by prefix", () => {
    const codes = Object.keys(
      DONATION_ALLOCATION_REMOVAL_REFUSAL_COPY
    ) as Array<keyof typeof DONATION_ALLOCATION_REMOVAL_REFUSAL_COPY>
    expect(codes).toHaveLength(4)

    for (const code of codes) {
      expect(allocationRemovalRefusalCopy(`${code}: some detail`)).toBe(
        DONATION_ALLOCATION_REMOVAL_REFUSAL_COPY[code]
      )
      expect(allocationRemovalRefusalCopy(code)).toBe(
        DONATION_ALLOCATION_REMOVAL_REFUSAL_COPY[code]
      )
    }
  })

  it("falls back to the generic copy for an unknown, empty or mid-string code", () => {
    expect(allocationRemovalRefusalCopy("OTHER_CODE: x")).toBe(
      DONATION_ALLOCATION_REMOVAL_REFUSAL_GENERIC
    )
    expect(allocationRemovalRefusalCopy("")).toBe(
      DONATION_ALLOCATION_REMOVAL_REFUSAL_GENERIC
    )
    // Prefix match only: a code mentioned inside another string never matches.
    expect(
      allocationRemovalRefusalCopy(
        "X_DONATION_ALLOCATION_NOT_FOUND: trailing detail"
      )
    ).toBe(DONATION_ALLOCATION_REMOVAL_REFUSAL_GENERIC)
  })

  it("leaves the unreachable invalid-key refusal on the generic copy", () => {
    // The dialog always mints a non-empty key, so `DONATION_ALLOCATION_INVALID_KEY`
    // cannot be reached from this surface — it must not acquire UI copy that
    // claims a reachable state.
    expect(
      allocationRemovalRefusalCopy("DONATION_ALLOCATION_INVALID_KEY: key")
    ).toBe(DONATION_ALLOCATION_REMOVAL_REFUSAL_GENERIC)
  })
})

describe("nextAllocationRemovalKey", () => {
  it("a retry of the same removal reuses the same key and state object", () => {
    const first = nextAllocationRemovalKey(null, "p_1")
    expect(first.donationId).toBe("p_1")
    expect(first.key).toMatch(
      /^p_1:remove:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )

    const retry = nextAllocationRemovalKey(first, "p_1")
    expect(retry.key).toBe(first.key)
    // Reuse returns the same state object, so a React state update is a no-op.
    expect(retry).toBe(first)

    // A retry after a refusal, a transient error or a double-click still
    // carries the same key: the dialog's catch path never touches the state.
    const retryAfterRefusal = nextAllocationRemovalKey(retry, "p_1")
    expect(retryAfterRefusal.key).toBe(first.key)
  })

  it("mints a different key after success or for a different donation", () => {
    const first = nextAllocationRemovalKey(null, "p_1")

    const afterSuccess = nextAllocationRemovalKey(first, "p_1", {
      succeeded: true,
    })
    expect(afterSuccess.key).not.toBe(first.key)
    expect(afterSuccess.donationId).toBe("p_1")

    const otherDonation = nextAllocationRemovalKey(first, "p_2")
    expect(otherDonation.key).not.toBe(first.key)
    expect(otherDonation.key).toMatch(/^p_2:remove:/)
  })

  it("mints distinct keys on repeated mints", () => {
    expect(mintAllocationRemovalKey("p_9")).toMatch(/^p_9:remove:/)
    expect(mintAllocationRemovalKey("p_9")).not.toBe(
      mintAllocationRemovalKey("p_9")
    )
  })

  it("can never be mistaken for an allocation key (the namespace-collision pin)", () => {
    const removal = nextAllocationRemovalKey(null, "p_1")
    const allocation = nextAllocationKey(null, "p_1", "canonical")

    expect(removal.key).not.toContain(":allocate:")
    expect(allocation.key).toContain(":allocate:")
    expect(removal.key).not.toBe(allocation.key)
    expect(removal.key.startsWith("p_1:remove:")).toBe(true)
    expect(allocation.key.startsWith("p_1:allocate:")).toBe(true)
  })
})
