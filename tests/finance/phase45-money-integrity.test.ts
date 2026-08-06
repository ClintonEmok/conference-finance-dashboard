import { describe, expect, test } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Source/domain audit for the Phase 45 canonical money boundary.
 *
 * The executable matrix (tests/convex/phase45-money-integrity.test.ts) proves
 * one server-owned amount-due across every consumer by exercising the real
 * handler contracts. This suite is a static guard: it fails if a consumer
 * file stops consuming the canonical loader or starts importing a second
 * accommodation pricing formula, even before a behavioral test can observe
 * the divergence.
 */

const root = resolve(import.meta.dirname, "../..")

const NAMED_MONEY_CONSUMERS = [
  "convex/orders.ts",
  "convex/payments.ts",
  "convex/reports.ts",
  "convex/attendees.ts",
  "convex/publicTracking.ts",
  "convex/signupSubmission.ts",
  "convex/tikkie.ts",
  "convex/sync/internal.ts",
  "convex/accommodation.ts",
] as const

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8")
}

describe("canonical money source audit (Phase 45)", () => {
  test("every named money consumer consumes the canonical loader", () => {
    for (const consumer of NAMED_MONEY_CONSUMERS) {
      const source = readSource(consumer)
      expect(
        source.includes("loadOrderAmountDueBreakdowns"),
        `${consumer} must consume loadOrderAmountDueBreakdowns (the only amount-due authority)`
      ).toBe(true)
    }
  })

  test("the pure accommodation formula has exactly two callers: the loader and the public quote", () => {
    // The loader (convex/finance.ts) prices stored orders; signupCatalog.ts
    // prices the pre-submission public quote with the same pure module. No
    // consumer surface may duplicate accommodation arithmetic.
    const consumerFiles = NAMED_MONEY_CONSUMERS.map((path) =>
      readSource(path)
    )
    for (const source of consumerFiles) {
      expect(
        source.includes("deriveAccommodationAmount"),
        "a consumer surface must not import deriveAccommodationAmount — accommodation totals come from the canonical loader only"
      ).toBe(false)
    }
  })

  test("orders.totalAmountMinor is only ever a canonical fallback or pass-through", () => {
    const loader = readSource("convex/finance.ts")
    expect(loader).toContain("loadOrderAmountDueBreakdowns")
    expect(loader).toContain("deriveAccommodationAmount")

    for (const consumer of NAMED_MONEY_CONSUMERS) {
      const source = readSource(consumer)
      for (const line of source.split("\n")) {
        if (!line.includes("totalAmountMinor")) continue

        // No arithmetic with the provider/write-time total: it is never a
        // term in a due/balance computation.
        expect(
          /[+\-*/]\s*(?:order|o)\.totalAmountMinor/.test(line),
          `${consumer} performs arithmetic with orders.totalAmountMinor: ${line.trim()}`
        ).toBe(false)

        // Any line that derives an amount from it must use the canonical
        // `??` fallback chain after the loader result.
        if (line.includes("amountDueMinor")) {
          expect(
            line.includes("??"),
            `${consumer} combines amountDueMinor and totalAmountMinor without the canonical fallback: ${line.trim()}`
          ).toBe(true)
        }
      }
    }
  })

  test("flexible-zero Tikkie order links are enforced at the creation boundary", () => {
    const tikkie = readSource("convex/tikkie.ts")
    // createPaymentLink must reject any non-zero order-link amount so a
    // re-priced amount-due can never be persisted as a link amount.
    expect(tikkie).toContain("amountMinor !== 0")
    expect(tikkie).toContain("flexible zero")
    // Matching uses canonical due: the auto-match reads the loader result.
    expect(tikkie).toContain("loadOrderAmountDueBreakdowns")
    expect(tikkie).toMatch(/canonicalAmountDueMinor\s*=/)
  })

  test("matching and tracking compare candidates to canonical due, not provider totals", () => {
    const tikkie = readSource("convex/tikkie.ts")
    const tracking = readSource("convex/publicTracking.ts")
    const payments = readSource("convex/payments.ts")

    // tikkie auto-match computes candidates from the canonical breakdown map.
    expect(tikkie).toContain("amountDueBreakdownsByOrderId")
    expect(tikkie).toContain("canonicalAmountDueMinor")
    expect(tikkie).toContain("?.amountDueMinor")
    // public tracking derives due from the canonical breakdown map.
    expect(tracking).toContain(
      "amountDueBreakdown?.amountDueMinor ?? order.totalAmountMinor"
    )
    // payments auto-match and summary derive from the canonical breakdown map.
    expect(payments).toContain("amountDueBreakdownsByOrderId")
    expect(payments).toContain("?.amountDueMinor")
  })
})
