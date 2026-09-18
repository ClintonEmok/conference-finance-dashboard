import { describe, expect, it } from "vitest"

import {
  ALLOCATION_COUNT_PENDING,
  TIKKIE_DELETE_REFUSAL,
  buildDonationDeleteDescription,
} from "@/lib/dashboard/donation-delete-availability"

/**
 * The truth table for bug A (D-03): every row announces EXACTLY the reasons
 * true of it, and nothing when neither applies. This suite tests the real
 * builder — no source scans — because the builder is the single owner of the
 * per-row rule and both copy strings.
 *
 * A known count is any resolved number, including 0: the tri-state server
 * value distinguishes `undefined` (unknown) from `0` (known empty), and the
 * pending reason must never announce a resolved row.
 */
const KNOWN_COUNTS = [0, 1, 5] as const

describe("buildDonationDeleteDescription — per-row truth table", () => {
  it("announces nothing for a cash row whose count is known", () => {
    for (const allocationCount of KNOWN_COUNTS) {
      expect(
        buildDonationDeleteDescription({ source: "cash", allocationCount })
      ).toBeNull()
    }
  })

  it("announces only the pending reason for a cash row with an unknown count", () => {
    expect(
      buildDonationDeleteDescription({
        source: "cash",
        allocationCount: undefined,
      })
    ).toBe(ALLOCATION_COUNT_PENDING)
  })

  it("announces only the Tikkie refusal for a Tikkie row whose count is known", () => {
    for (const allocationCount of KNOWN_COUNTS) {
      expect(
        buildDonationDeleteDescription({ source: "tikkie", allocationCount })
      ).toBe(TIKKIE_DELETE_REFUSAL)
    }
  })

  it("announces both true reasons for a Tikkie row with an unknown count, Tikkie first", () => {
    expect(
      buildDonationDeleteDescription({
        source: "tikkie",
        allocationCount: undefined,
      })
    ).toBe(`${TIKKIE_DELETE_REFUSAL} ${ALLOCATION_COUNT_PENDING}`)
  })

  it("treats bank transfers exactly like cash at every count", () => {
    for (const allocationCount of KNOWN_COUNTS) {
      expect(
        buildDonationDeleteDescription({
          source: "bank_transfer",
          allocationCount,
        })
      ).toBeNull()
    }

    expect(
      buildDonationDeleteDescription({
        source: "bank_transfer",
        allocationCount: undefined,
      })
    ).toBe(ALLOCATION_COUNT_PENDING)
  })

  it("never claims a donation cannot be allocated", () => {
    for (const source of ["cash", "bank_transfer", "tikkie"] as const) {
      for (const allocationCount of [...KNOWN_COUNTS, undefined]) {
        const description = buildDonationDeleteDescription({
          source,
          allocationCount,
        })
        expect(description ?? "").not.toContain("cannot be allocated")
      }
    }
  })
})
