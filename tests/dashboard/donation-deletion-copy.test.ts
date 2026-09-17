import { describe, expect, it } from "vitest"

import {
  buildDonationDeletionConfirmation,
  buildDonationDeletionSuccess,
  DONATION_DELETION_REFUSAL_COPY,
  DONATION_DELETION_REFUSAL_GENERIC,
  donationDeletionRefusalCopy,
  mintDonationDeletionKey,
  nextDonationDeletionKey,
} from "@/lib/dashboard/donation-deletion-copy"

/**
 * The pure DDEL-01 deletion-dialog contract (Phase 58 task 1). These cases pin
 * the two properties the dialog must not re-implement: the confirmation that
 * NAMES the amount and the allocation count, and the key that is REUSED across
 * retries so the server's replay ledger is actually reachable.
 */

const AE_2_COPY =
  "Delete the €125.00 donation from Maria Jansen? This removes 2 allocations and restores the affected attendee balances. This cannot be undone."

describe("buildDonationDeletionConfirmation", () => {
  it("renders the AE-2 exact copy with the amount and the allocation count", () => {
    const copy = buildDonationDeletionConfirmation({
      amountMinor: 12500,
      payerName: "Maria Jansen",
      allocationCount: 2,
    })

    expect(copy).toBe(AE_2_COPY)
    expect(copy).toContain("€125.00")
    expect(copy).toContain("2 allocations")
  })

  it("inflects the singular and the zero case (never `0 allocations`)", () => {
    const singular = buildDonationDeletionConfirmation({
      amountMinor: 12500,
      payerName: "Maria Jansen",
      allocationCount: 1,
    })
    expect(singular).toContain("1 allocation and restores")
    expect(singular).not.toContain("1 allocations")

    const zero = buildDonationDeletionConfirmation({
      amountMinor: 12500,
      payerName: "Maria Jansen",
      allocationCount: 0,
    })
    expect(zero).toBe(
      "Delete the €125.00 donation from Maria Jansen? This removes no allocations. This cannot be undone."
    )
    expect(zero).not.toContain("0 allocations")
  })

  it("threads a non-EUR currency through formatMoney", () => {
    const copy = buildDonationDeletionConfirmation({
      amountMinor: 12500,
      payerName: "Maria Jansen",
      allocationCount: 2,
      currency: "USD",
    })
    expect(copy).toContain("$125.00")
    expect(copy).not.toContain("€")
  })
})

describe("buildDonationDeletionSuccess", () => {
  it("renders the exact zero/one/many strings", () => {
    expect(buildDonationDeletionSuccess({ allocationCount: 0 })).toBe(
      "Donation deleted. No allocations were reversed."
    )
    expect(buildDonationDeletionSuccess({ allocationCount: 1 })).toBe(
      "Donation deleted. 1 allocation reversed and attendee balances restored."
    )
    expect(buildDonationDeletionSuccess({ allocationCount: 2 })).toBe(
      "Donation deleted. 2 allocations reversed and attendee balances restored."
    )
  })
})

describe("donationDeletionRefusalCopy", () => {
  it("maps every locked code to its exact copy by prefix", () => {
    const codes = Object.keys(DONATION_DELETION_REFUSAL_COPY) as Array<
      keyof typeof DONATION_DELETION_REFUSAL_COPY
    >
    expect(codes).toHaveLength(7)

    for (const code of codes) {
      expect(donationDeletionRefusalCopy(`${code}: some detail`)).toBe(
        DONATION_DELETION_REFUSAL_COPY[code]
      )
    }

    expect(donationDeletionRefusalCopy("DONATION_DELETE_NOT_STANDALONE")).toBe(
      DONATION_DELETION_REFUSAL_COPY.DONATION_DELETE_NOT_STANDALONE
    )
  })

  it("falls back to the generic copy for an unknown code or an empty message", () => {
    expect(donationDeletionRefusalCopy("OTHER_CODE: x")).toBe(
      DONATION_DELETION_REFUSAL_GENERIC
    )
    expect(donationDeletionRefusalCopy("")).toBe(
      DONATION_DELETION_REFUSAL_GENERIC
    )
  })

  it("matches by prefix, never by substring", () => {
    expect(donationDeletionRefusalCopy("X_DONATION_DELETE_NOT_FOUND")).toBe(
      DONATION_DELETION_REFUSAL_GENERIC
    )
  })

  it("leaves the unreachable blank-key refusal on the generic copy", () => {
    expect(
      donationDeletionRefusalCopy("DONATION_DELETE_INVALID_KEY: key")
    ).toBe(DONATION_DELETION_REFUSAL_GENERIC)
  })
})

describe("nextDonationDeletionKey", () => {
  it("a retry of the same confirmation reuses the same key", () => {
    const first = nextDonationDeletionKey(null, "p_1")
    expect(first.donationId).toBe("p_1")
    // The key is minted HERE, through the platform UUID source.
    expect(first.key).toMatch(
      /^p_1:delete:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )

    const retry = nextDonationDeletionKey(first, "p_1")
    expect(retry.key).toBe(first.key)
    // Reuse returns the same state object, so a React state update is a no-op.
    expect(retry).toBe(first)

    // A retry after a refusal, a transient error or a double-click still
    // carries the same key: the dialog's catch path never touches the state.
    const retryAfterRefusal = nextDonationDeletionKey(retry, "p_1")
    expect(retryAfterRefusal.key).toBe(first.key)
  })

  it("mints a different key after success or for a different donation", () => {
    const first = nextDonationDeletionKey(null, "p_1")

    const afterSuccess = nextDonationDeletionKey(first, "p_1", {
      succeeded: true,
    })
    expect(afterSuccess.key).not.toBe(first.key)
    expect(afterSuccess.donationId).toBe("p_1")

    const otherDonation = nextDonationDeletionKey(first, "p_2")
    expect(otherDonation.key).not.toBe(first.key)
    expect(otherDonation.donationId).toBe("p_2")
  })

  it("mintDonationDeletionKey builds the same shape the policy mints", () => {
    expect(mintDonationDeletionKey("p_9")).toMatch(/^p_9:delete:/)
  })
})
