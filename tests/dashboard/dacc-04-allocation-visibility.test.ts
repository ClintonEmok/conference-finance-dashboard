import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * DACC-04's order/attendee half — the structural guard (Phase 58, plan 58-07).
 *
 * The decision this guard defends (58-CONTEXT, UI-SPEC §G2): NO read resolves
 * donations by attendee or order, so these two views must render the
 * server-owned credit figures and LINK THROUGH to the donation record — never
 * fabricate a filter over data no read provides, and never re-derive a figure
 * from the sibling field.
 *
 * Load-bearing properties:
 *
 *   1. Every money figure is a NAMED server field. The order view maps the
 *      `getOrderWithAttendees` per-attendee `paidAmountMinor` /
 *      `outstandingAmountMinor` pair into the panel verbatim, and the attendee
 *      view captions the figure its attendee-detail payload already carries.
 *      No `reduce(`, no `Math.min/max`, no arithmetic on either field — and
 *      the two figures' ORDER is pinned, so a swap of the values under the
 *      kept labels fails even though every label pin would still pass.
 *   2. The link-through carries the intent params the record tolerates:
 *      `donationsHref(slug, { orderId })` (order view) and
 *      `donationsHref(eventSlug, { attendeeId })` (attendee view). The exact
 *      hrefs are pinned, so an invented filter param fails.
 *   3. No additive per-order read is introduced (that would be a backend
 *      change, explicitly out of this phase): neither view reaches for
 *      `api.donations` / `getDonationAllocationSummary`.
 *
 * The other half of DACC-04 — the record's per-allocation `Target attendee`
 * and recorded-scope columns — lives on the donation record and is pinned in
 * `tests/dashboard/donations-workspace.test.ts` (58-09).
 */

const ROOT = resolve(import.meta.dirname, "../..")

const SURFACE_PATH = "components/dashboard/orders/order-detail-surface.tsx"
const PANEL_PATH = "components/dashboard/orders/panels/attendees-panel.tsx"
const ATTENDEE_PATH = "components/dashboard/attendee-detail-surface.tsx"
const DONATIONS_PAGE_PATH = "app/dashboard/events/[slug]/donations/page.tsx"

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

const surface = readSource(SURFACE_PATH)
const panel = readSource(PANEL_PATH)
const attendee = readSource(ATTENDEE_PATH)

describe("order view — the credit pair is mapped from the server query", () => {
  it("reads the canonical order query and widens the payload with its fields", () => {
    expect(surface).toContain("getOrderWithAttendees")
    expect(surface).toContain("paidAmountMinor: attendee.paidAmountMinor")
    expect(surface).toContain(
      "outstandingAmountMinor: attendee.outstandingAmountMinor"
    )
  })

  it("carries the pair on the panel's row contract", () => {
    expect(panel).toContain("paidAmountMinor: number")
    expect(panel).toContain("outstandingAmountMinor: number")
  })
})

describe("order view panel — labelled server figures, no order-level total", () => {
  it("renders the two labelled figures verbatim from the attendee row", () => {
    expect(panel).toContain("<span>Allocated credit</span>")
    expect(panel).toContain("<span>Remaining</span>")
    expect(panel).toContain("formatMoney(attendee.paidAmountMinor)")
    expect(panel).toContain("formatMoney(attendee.outstandingAmountMinor)")
  })

  it("keeps the due figure first and the figures then the link in bound order", () => {
    const dueIndex = panel.indexOf("formatMoney(attendee.amountDueMinor)")
    const allocatedIndex = panel.indexOf("formatMoney(attendee.paidAmountMinor)")
    const remainingIndex = panel.indexOf(
      "formatMoney(attendee.outstandingAmountMinor)"
    )
    const linkIndex = panel.indexOf("donationsHref(slug, { orderId })")

    expect(dueIndex).toBeGreaterThan(-1)
    expect(allocatedIndex).toBeGreaterThan(dueIndex)
    expect(remainingIndex).toBeGreaterThan(allocatedIndex)
    expect(linkIndex).toBeGreaterThan(remainingIndex)
    // The label order matches the figure order, so a swap of either the two
    // labelled rows or their two values fails one of these pins.
    expect(panel.indexOf("<span>Allocated credit</span>")).toBeLessThan(
      panel.indexOf("<span>Remaining</span>")
    )
  })

  it("links through with the order intent and invents no filter", () => {
    expect(panel).toContain("donationsHref(")
    expect(panel).toContain("orderId")
    expect(panel).toContain("donationsHref(slug, { orderId })")
    expect(panel).toContain("View allocations")
    // The intent param selects the record; it is not a filter the receiving
    // page can act on, so no row-filtering and no filtered-results copy may
    // appear on this view either.
    expect(panel).not.toMatch(/attendees\s*\.filter\(/)
    expect(panel).not.toMatch(/filtered|Filtered/)
  })

  it("never sums the per-attendee figures or does arithmetic on them", () => {
    expect(panel).not.toContain("reduce(")
    expect(panel).not.toContain("Math.min(")
    expect(panel).not.toContain("Math.max(")
    expect(panel).not.toMatch(/paidAmountMinor\s*[+\-*/]/)
    expect(panel).not.toMatch(/outstandingAmountMinor\s*[+\-*/]/)
  })
})

describe("attendee view — the label on the existing figure and the link", () => {
  it("captions the existing paid stat card from the server payload", () => {
    expect(attendee).toContain("Allocated credit")
    expect(attendee).toContain("formatMoney(payload.finance.paidAmountMinor)")
    // The caption is real markup (a comment alone must not satisfy the label
    // pins) attached to the Amount Paid card's own conditional.
    expect(attendee).toMatch(
      /<p className="[^"]*text-xs[^"]*text-muted-foreground[^"]*">Allocated credit<\/p>/
    )
    expect(attendee).toContain('stat.label === "Amount Paid"')
  })

  it("binds the caption and each figure to their own stat card", () => {
    const statArrayStart = attendee.indexOf('{ label: "Total Due"')
    const statArrayEnd = attendee.indexOf("].map((stat, i) =>")
    expect(statArrayStart).toBeGreaterThan(-1)
    expect(statArrayEnd).toBeGreaterThan(statArrayStart)

    const statArray = attendee.slice(statArrayStart, statArrayEnd)
    const paidEntryStart = statArray.indexOf('label: "Amount Paid"')
    const outstandingEntryStart = statArray.indexOf('label: "Outstanding"')
    expect(paidEntryStart).toBeGreaterThan(-1)
    expect(outstandingEntryStart).toBeGreaterThan(paidEntryStart)

    const paidEntry = statArray.slice(paidEntryStart, outstandingEntryStart)
    const outstandingEntry = statArray.slice(outstandingEntryStart)

    expect(paidEntry).toContain("formatMoney(payload.finance.paidAmountMinor)")
    expect(paidEntry).not.toContain(
      "formatMoney(payload.finance.outstandingAmountMinor)"
    )
    expect(outstandingEntry).toContain(
      "formatMoney(payload.finance.outstandingAmountMinor)"
    )
    expect(outstandingEntry).not.toContain(
      "formatMoney(payload.finance.paidAmountMinor)"
    )

    // The caption renders inside the mapped card (after the stat array) and is
    // gated on the Amount Paid card — a caption moved to another card, or out
    // of the map, fails here even though the label pins still pass.
    expect(attendee.indexOf('stat.label === "Amount Paid"')).toBeGreaterThan(
      statArrayEnd
    )
  })

  it("links through with the attendee intent", () => {
    expect(attendee).toContain(
      "donationsHref(eventSlug, { attendeeId: payload.attendee.id })"
    )
    expect(attendee).toContain("View allocations")
  })

  it("does no arithmetic on the paid field and leaves the ledger otherwise alone", () => {
    expect(attendee).not.toMatch(/paidAmountMinor\s*[+\-*/]/)
    // The pre-existing progress ring stays exactly where it was; only the
    // caption and the link were added.
    expect(attendee).toContain("paymentProgress")
    expect(attendee).toContain("Settlement Progress")
  })
})

describe("no additive per-order read", () => {
  it("keeps both views on the reads they already had", () => {
    for (const source of [surface, panel, attendee]) {
      expect(source).not.toContain("api.donations")
      expect(source).not.toContain("getDonationAllocationSummary")
    }
  })
})

describe("DACC-04 destination", () => {
  it("is the real donations page both links point at", () => {
    expect(existsSync(resolve(ROOT, DONATIONS_PAGE_PATH))).toBe(true)
    const page = readSource(DONATIONS_PAGE_PATH)
    expect(page).toContain("DonationsWorkspace")
    // The record's per-allocation target attendee and recorded-scope columns
    // are DACC-04's other half and are pinned in
    // `tests/dashboard/donations-workspace.test.ts` (58-09).
  })
})
