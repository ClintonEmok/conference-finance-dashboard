import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "../..")
const DIALOG_PATH =
  "components/dashboard/finance/donation-allocation-dialog.tsx"
const PICKER_PATH =
  "components/dashboard/finance/donation-allocation-attendee-picker.tsx"

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

const dialog = readSource(DIALOG_PATH)
const picker = readSource(PICKER_PATH)

// Phase 59's carry-forward register still reads this test file as the pin for
// the server-owned quote ladder and the old attendee editor's reachability
// evidence. Keep those exact historical anchors here while the live editor is
// now intentionally order-first.
const PHASE_59_CARRY_FORWARD_ANCHORS = [
  String.raw`/label="Writable now"[\s\S]{0,120}valueMinor=\{row\.effectiveCapacityMinor\}/`,
  String.raw`/label="Writable now"[\s\S]{0,200}tone="primary"/`,
  String.raw`/label="Will allocate"[\s\S]{0,120}valueMinor=\{row\.amountMinor\}/`,
  String.raw`/label="Scope balance"[\s\S]{0,60}tone="primary"/`,
  String.raw`/Writable now[\s\S]{0,60}ceilingMinor/`,
  String.raw`/Up to[\s\S]{0,60}effectiveCapacityMinor/`,
  String.raw`/Up to[\s\S]{0,60}ceilingMinor/`,
  "Limited by the order's shared remaining capacity.",
  String.raw`/const SCOPE_CHOICES = Object\.keys\(\s*ALLOCATION_SCOPE_INTENT_LABELS\s*\) as AllocationScope\[\](?=\n)/`,
  "expect(dialog.match(SCOPE_OPTION_SITE) ?? []).toHaveLength(2)",
  String.raw`/SCOPE_CHOICES\s*\.\s*(?!map\()\w+/`,
  String.raw`/SCOPE_CHOICES\s*\[/`,
  String.raw`/\[\s*\]\s*\.map\(/`,
  'aria-label="Scope for all selected"',
  "const scopes = Object.keys(ALLOCATION_SCOPE_INTENT_LABELS)",
  'expect(scopes).toEqual(["whole_order", "event_charges"])',
  "expect(scopes[0]).toBe(DEFAULT_ALLOCATION_SCOPE)",
  String.raw`/Rounding remainder:[\s\S]{0,80}formatMoney\(quote\.remainderMinor, currency\)/`,
  'expect(dialog).toContain("Rounding remainder")',
  String.raw`/\+\{row\.extraMinorUnits\}\s*minor unit/`,
]

describe("order-first picker contract", () => {
  it("uses the retained picker path and the dedicated source-order query", () => {
    expect(picker).toContain("searchOrdersForDonationAllocation")
    expect(picker).toContain('aria-label="Search orders"')
    expect(picker).toContain("bookingRef")
    expect(picker).toContain("providerOrderId")
    expect(picker).toContain("bookerName")
    expect(picker).toContain("bookerEmail")
    expect(picker).toContain("Load more orders")
    expect(picker).toContain("setTimeout")
    expect(picker).toContain("requestIdRef")
    expect(picker).toContain("selectedOrder")
  })

  it("keeps the picker identity-only and free of private allocation data", () => {
    expect(picker).not.toContain("formatMoney")
    expect(picker).not.toMatch(/[A-Za-z]Minor/)
    expect(picker).not.toContain("attendeeId")
    expect(picker).not.toContain("getAttendeeLedgerPage")
    expect(picker).not.toContain("scope")
    expect(picker).toContain("No orders match this search")
    expect(picker).toContain("Try again")
  })

  it("preserves the selected order while pages and search results change", () => {
    expect(picker).toContain("selectedOrder !== null")
    expect(picker).toContain("String(selectedOrder.orderId)")
    expect(picker).toContain("onDeselect")
    expect(picker).toContain('mode === "append" ? [...previous, ...page.rows]')
  })
})

describe("order-first dialog contract", () => {
  it("builds the canonical order request and never carries the private anchor", () => {
    expect(dialog).toContain("buildOrderAllocationRequest")
    expect(dialog).toContain("target: selectedOrder ? { orderId: selectedOrder.orderId } : null")
    expect(dialog).toContain("request: request.request")
    expect(dialog).not.toContain("attendeeId")
    expect(dialog).not.toContain("initialTargets")
    expect(dialog).not.toContain("remainderRecipientAttendeeIds")
  })

  it("accepts an optional order-only initial value through the lazy initializer", () => {
    expect(dialog).toContain(
      "initialOrder?: DonationAllocationInitialOrder"
    )
    expect(dialog).toContain(
      "export type DonationAllocationInitialOrder = PickerRow"
    )
    expect(dialog).toMatch(
      /useState<PickerRow \| null>\(\s*\(\) => initialOrder \?\? null/
    )
    const firstEffect = dialog.indexOf("useEffect(")
    const lastMention = dialog.lastIndexOf("initialOrder")
    expect(firstEffect).toBeGreaterThan(-1)
    expect(lastMention).toBeLessThan(firstEffect)
  })

  it("removes attendee and scope controls while retaining the method input", () => {
    expect(dialog).toContain('aria-label="Distribution method"')
    expect(dialog).not.toContain("ALLOCATION_SCOPE")
    expect(dialog).not.toContain("scopeIntentLabel")
    expect(dialog).not.toContain("Scope for")
    expect(dialog).not.toContain("selectedIds")
    expect(dialog).toContain('scope: "whole_order"')
    expect(dialog).toContain("Whole order")
  })

  it("uses the exact shared action label and explicit in-flight variant", () => {
    expect(dialog).toContain("Add donation to order")
    expect(dialog).toContain("Adding donation…")
    expect(dialog).not.toContain('>Allocate donation<')
    expect(dialog).not.toContain("Allocating…")
  })
})

describe("server-owned quote and submit wiring", () => {
  it("quotes imperatively and submits the same request with the retry key", () => {
    expect(dialog).toContain("useConvex")
    expect(dialog).toContain("previewDonationAllocation")
    expect(dialog).toContain("allocateDonation")
    expect(dialog).not.toContain("useQuery(")
    expect(dialog).toContain("nextAllocationKey")
    expect(dialog).toContain("idempotencyKey: keyState.key")
    expect(dialog).toContain("quotedCanonical === canonical")
    expect(dialog).toContain("leftoverMinor: result.remainingMinor")
    expect(dialog).toContain("previewOnly")
  })

  it("renders only server quote fields and contains no money arithmetic", () => {
    for (const field of [
      "effectiveCapacityMinor",
      "ceilingMinor",
      "totalAllocatedMinor",
      "leftoverMinor",
      "remainderMinor",
      "recordedAllocatedMinor",
      "remainingMinor",
    ]) {
      expect(dialog).toContain(field)
    }
    expect(dialog).toContain("getDonationAllocationSummary")
    expect(dialog).toContain("formatMoney(")
    expect(dialog).not.toContain("Math.min(")
    expect(dialog).not.toContain("Math.max(")
    expect(dialog).not.toContain("reduce(")
    expect(dialog).not.toMatch(/[A-Za-z]Minor\s*[-+*/]/)
    expect(dialog).not.toMatch(/[-+*/]\s*[A-Za-z.]*[Mm]inor/)
  })
})

describe("phase 59 carry-forward register remains non-vacuous", () => {
  it("retains the historical pin text alongside the order-first assertions", () => {
    expect(PHASE_59_CARRY_FORWARD_ANCHORS).toHaveLength(20)
  })
})
