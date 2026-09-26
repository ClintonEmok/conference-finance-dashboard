import { describe, expect, it } from "vitest"

import {
  formatMoney,
  parseMinorUnitsInput,
  parseNonNegativeMinorUnitsInput,
} from "@/lib/format"

/**
 * The shared typed-amount parser (Phase 58 task 1) plus a regression pin on the
 * untouched `formatMoney`.
 *
 * The parser is INPUT CONVERSION, never a money formula over server figures:
 * these cases pin the grammar, the two-digit pad and the integer guarantee, so
 * a widened grammar (a float escaping as `amountMinor`) fails loudly.
 */
describe("formatMoney", () => {
  it("keeps the untouched formatter pinned", () => {
    expect(formatMoney(1250)).toBe("€12.50")
    expect(formatMoney(1250, "USD")).toBe("$12.50")
  })
})

describe("parseMinorUnitsInput", () => {
  it("converts accepted amounts to integer minor units", () => {
    const accepted: Array<{ input: string; amountMinor: number }> = [
      { input: "12", amountMinor: 1200 },
      { input: "12.5", amountMinor: 1250 },
      { input: "12,50", amountMinor: 1250 },
      { input: "0.01", amountMinor: 1 },
      { input: "1000000.99", amountMinor: 100000099 },
      { input: "007", amountMinor: 700 },
    ]

    for (const entry of accepted) {
      const result = parseMinorUnitsInput(entry.input)
      expect(result).toEqual({ ok: true, amountMinor: entry.amountMinor })
      if (result.ok) {
        expect(Number.isInteger(result.amountMinor)).toBe(true)
      }
    }
  })

  it("reports empty input as empty", () => {
    expect(parseMinorUnitsInput("")).toEqual({ ok: false, reason: "empty" })
    expect(parseMinorUnitsInput("   ")).toEqual({ ok: false, reason: "empty" })
  })

  it("rejects zero and zero-equivalents as non_positive", () => {
    for (const input of ["0", "0.00", "0,0"]) {
      expect(parseMinorUnitsInput(input)).toEqual({
        ok: false,
        reason: "non_positive",
      })
    }
  })

  it("rejects malformed input without widening the grammar", () => {
    for (const input of ["-5", "5.", ".5", "1.234", "1,2,3", "abc", "1e3"]) {
      expect(parseMinorUnitsInput(input)).toEqual({
        ok: false,
        reason: "malformed",
      })
    }
  })
})

describe("parseNonNegativeMinorUnitsInput", () => {
  it("accepts zero for free ticket types", () => {
    expect(parseNonNegativeMinorUnitsInput("0.00")).toEqual({
      ok: true,
      amountMinor: 0,
    })
  })

  it("accepts positive amounts and rejects malformed input", () => {
    expect(parseNonNegativeMinorUnitsInput("50.00")).toEqual({
      ok: true,
      amountMinor: 5_000,
    })
    expect(parseNonNegativeMinorUnitsInput("-1")).toEqual({
      ok: false,
      reason: "malformed",
    })
  })
})
