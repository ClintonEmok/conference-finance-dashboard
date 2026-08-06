import { describe, expect, test } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Phase 45 cross-surface UI source audit (v4.0 Phase 38 scope absorbed).
 *
 * The executable component suites (Phases 42-44) prove the behavioral
 * contracts; this static guard keeps the edited UI surfaces honest: no client
 * money arithmetic, options-only signup (no physical room/slot controls), and
 * Allocation rendering server payment state as explicit text-plus-icon.
 */

const root = resolve(import.meta.dirname, "..")

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8")
}

const AUDITED_UI_SURFACES = [
  "components/track-payment/TrackPaymentView.tsx",
  "components/track-payment/TrackPaymentAccommodationEditor.tsx",
  "components/signup/SignupFlowShell.tsx",
  "components/signup/steps/AccommodationOptionsStep.tsx",
  "components/dashboard/accommodation/legacy-allocation-surface.tsx",
] as const

describe("Phase 45 cross-surface UI source audit", () => {
  test("no audited UI surface performs client money arithmetic", () => {
    for (const file of AUDITED_UI_SURFACES) {
      const source = readSource(file)
      // A component may format server values, but never add/subtract/
      // multiply/divide money or derive payment state client-side.
      expect(
        /(?:totalDueMinor|totalPaidMinor|amountDueMinor|paidAmountMinor|overpaymentDeltaMinor|priceMinor|chargeMinor|ratePerNightMinor)\s*[+\-*/]/.test(
          source
        ),
        `${file} performs client arithmetic on a money field`
      ).toBe(false)
      expect(
        /Math\.(?:round|floor|ceil|min|max)\([^)]*(?:totalDueMinor|totalPaidMinor|amountDueMinor|paidAmountMinor)/.test(
          source
        ),
        `${file} derives money client-side via Math helpers`
      ).toBe(false)
    }
  })

  test("track-payment surfaces render server money values only", () => {
    const view = readSource(
      "components/track-payment/TrackPaymentView.tsx"
    )
    const editor = readSource(
      "components/track-payment/TrackPaymentAccommodationEditor.tsx"
    )
    // All displayed amounts come from the server payloads.
    expect(view).toContain("result.tracking.payment.totalPaidMinor")
    expect(view).toContain("result.tracking.payment.totalDueMinor")
    expect(editor).toContain("formatMoney(result.overpaymentDeltaMinor")
  })

  test("signup surfaces stay options-only with no physical room/slot controls", () => {
    const shell = readSource("components/signup/SignupFlowShell.tsx")
    const step = readSource(
      "components/signup/steps/AccommodationOptionsStep.tsx"
    )
    // The buyer flow must never expose rooms, slots, or assignment controls.
    // (roomTypeId is the server ticket-entitlement field forwarded to the
    // quote/submission contract, not a physical room control.)
    expect(
      /assignedRoomId|slotId|accommodationSlots/.test(`${shell}\n${step}`),
      "signup surfaces expose a physical room/slot control"
    ).toBe(false)
    // The accommodation step is driven by the server catalog contract.
    expect(step).toMatch(/categoryId|occupancy|upgradeSelected|cotSelected|ageBandCode/)
  })

  test("Allocation renders server payment state as text-plus-icon, never derives it", () => {
    const allocation = readSource(
      "components/dashboard/accommodation/legacy-allocation-surface.tsx"
    )
    // Explicit text labels for the three canonical states (never color alone).
    expect(allocation).toContain('paid: "Paid"')
    expect(allocation).toContain('partial: "Partially paid"')
    expect(allocation).toContain('unpaid: "Unpaid"')
    // The badge consumes the board's typed paymentState through a known-state
    // guard and renders text-plus-icon with an explicit aria-label.
    expect(allocation).toMatch(/state === ["']paid["']/)
    expect(allocation).toMatch(/state === ["']partial["']/)
    expect(allocation).toMatch(/state === ["']unpaid["']/)
    expect(allocation).toContain("aria-label={`Payment status:")
    expect(allocation).toContain("PAYMENT_LABEL[state]")
    // No client-side paid/partial/unpaid derivation from money fields.
    expect(
      /(?:paidAmountMinor|totalPaidMinor|amountDueMinor)\s*[+\-*/]/.test(
        allocation
      ),
      "Allocation derives payment state client-side"
    ).toBe(false)
  })
})
