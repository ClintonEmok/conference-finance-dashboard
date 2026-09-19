import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * The DDEL-01 dialog's structural guard. The exact copy and the key policy are
 * proven behaviourally in `donation-deletion-copy.test.ts`; this suite pins the
 * wiring the platform cannot type-check: the house dialog primitive, the
 * destructive confirm affordance, the single key mint, and the absence of any
 * client money arithmetic.
 */

const ROOT = resolve(import.meta.dirname, "../..")
const DIALOG_PATH = "components/dashboard/finance/donation-delete-dialog.tsx"

function readSource(): string {
  return readFileSync(resolve(ROOT, DIALOG_PATH), "utf8")
}

describe("DonationDeleteDialog source contract", () => {
  it("uses only the house dialog primitive, never window.confirm", () => {
    const source = readSource()
    expect(source).toContain('from "@/components/ui/dialog"')
    expect(source).toContain("DialogDescription")
    expect(source).toContain("DialogFooter")
    expect(source).not.toContain("window.confirm")
  })

  it("renders the DDEL-01 confirmation with the amount and the allocation count", () => {
    const source = readSource()
    expect(source).toContain("buildDonationDeletionConfirmation")
    expect(source).toContain("amountMinor")
    expect(source).toContain("allocationCount")
  })

  it("submits through the destructive button with the house affordances", () => {
    const source = readSource()
    expect(source).toContain('variant="destructive"')
    expect(source).toContain("Keep donation")
    expect(source).toContain("Deleting…")
    expect(source).toContain("aria-busy")
    expect(source).toContain("showCloseButton")
    expect(source).toContain('role="alert"')
  })

  it("mints the key once at open and regenerates it only after success", () => {
    const source = readSource()
    expect(source).toContain("nextDonationDeletionKey")
    expect(source).toContain("idempotencyKey: keyState.key")
    // Exactly two call sites: the open-time mint and the success regeneration.
    // Neither a retry (the catch path) nor a re-render can regenerate the key.
    expect((source.match(/nextDonationDeletionKey\(/g) ?? []).length).toBe(2)
    expect(source).toMatch(/succeeded: true/)
    // Minting lives in the pure lib, never in the component.
    expect(source).not.toContain("randomUUID")
  })

  it("keeps the mutation behind the single confirm handler (an unconfirmed submit cannot reach it)", () => {
    const source = readSource()
    // The dialog IS the confirmation gate: one mutation call site, reached only
    // from the one onClick bound to the destructive submit button.
    expect((source.match(/deleteDonation\(/g) ?? []).length).toBe(1)
    expect((source.match(/handleDelete\b/g) ?? []).length).toBe(2)
    expect(source).toContain("onClick={() => void handleDelete()}")
    expect(
      source.indexOf("onClick={() => void handleDelete()}")
    ).toBeGreaterThan(source.indexOf('variant="destructive"'))
    // Nothing submits on mount/open: the operator's click is the only trigger.
    expect(source).not.toContain("useEffect")
  })

  it("maps refusals through the pure mapper and computes no money", () => {
    const source = readSource()
    expect(source).toContain("donationDeletionRefusalCopy(")
    expect(source).not.toMatch(/[A-Za-z]Minor\s*[-+*/]/)
    expect(source).not.toMatch(/[-+*/]\s*[A-Za-z.]*[Mm]inor/)
    expect(source).not.toContain("Math.min(")
    expect(source).not.toContain("Math.max(")
    expect(source).not.toContain("Math.round(")
    expect(source).not.toContain("reduce(")
    expect(source).not.toContain("toFixed(")
  })
})
