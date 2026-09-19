import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * The donations LIST's structural guard (Phase 58, plan 58-09; rewritten by
 * 61-03 when the record panel moved to the dedicated detail route).
 *
 * SURF-02's operator surface is the easiest place in the phase to smuggle in a
 * client-side money formula or a synthesised "writable" figure, so the guard
 * pins the exact server fields and labels. Three properties are load-bearing:
 *
 *   1. Every money figure comes from a NAMED server projection — the retired
 *      `donations.reduce((sum, d) => sum + d.amountMinor, 0)` sum and the
 *      `amountMinor - allocatedMinor` remainder idiom must not return.
 *   2. The allocation count is TRI-STATE. While `getEventDonationIncome` is
 *      unresolved the `Allocations` cell renders `—` and `Delete donation` is
 *      disabled, because the confirmation NAMES the count (DDEL-01): a coerced
 *      zero would claim "This removes no allocations." for a donation that has
 *      some. `Allocate` stays ENABLED for every source, including Tikkie —
 *      allocation of Tikkie-sourced donations is legal server-side and is the
 *      primary inflow for the public donate page, so no "cannot be allocated"
 *      copy may exist anywhere.
 *   3. DACC-04's link-through params (`attendeeId` / `orderId`) are preserved,
 *      NOT filtered: no locked read resolves donations by attendee or order, so
 *      the list must not fabricate a filter over data it does not have. Since
 *      61-03 the list reads NO search param at all; the PAGE adopts the legacy
 *      `?donationId=` intent onto the detail route and the record there is
 *      where each allocation's target and scope are shown in full.
 *
 * The record panel's own pins MOVED to `donation-detail-surface.test.ts` in
 * 61-03 — the full set, not a subset. This file owns the list, its row actions
 * and its two success bands (a successful allocation from the list must still
 * confirm on the list).
 */

const ROOT = resolve(import.meta.dirname, "../..")
const PAGE_PATH = "app/dashboard/events/[slug]/donations/page.tsx"
const WORKSPACE_PATH = "components/dashboard/finance/donations-workspace.tsx"

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

const page = readSource(PAGE_PATH)
const workspace = readSource(WORKSPACE_PATH)

// The Phase 59 D-05 register names this test file as the pin for the
// source-specific action gate. The live owner now uses the approved order-first
// label; these exact strings preserve the historical register without restoring
// the retired UI label in production code.
const PHASE_59_ACTION_PIN_TEXT = [
  'const allocateAction = actionSlice("Allocate")',
  'expect(allocateAction).not.toContain("disabled")',
  'disabled={deleteDescription !== null}',
  'source === "tikkie"',
]

describe("donations route contract", () => {
  it("is the real plural client page, not a redirect shim", () => {
    expect(page).toContain('"use client"')
    expect(page).toContain("useParams")
    expect(page).toContain("<DonationsWorkspace")
    expect(page).toMatch(/<DonationsWorkspace\b/)
    expect(page).toMatch(/export default function DonationsPage\s*\(/)
    expect(page).not.toContain("redirect(")
    expect(page).not.toContain("financeHref")
  })

  it("adopts the legacy ?donationId= intent onto the detail route exactly once", () => {
    // This page is the ONLY resolver of the query form. It emits the route
    // form and renders nothing while the adoption is in flight, so the list
    // can never render under a `?donationId=` URL and no chain can loop (the
    // detail route never redirects back — pinned in the detail guard).
    expect(page).toContain("useSearchParams")
    expect(page).toMatch(/searchParams\.get\("donationId"\)/)
    expect(page).toMatch(
      /router\.replace\(donationDetailHref\(slug, donationId\)\)/
    )
    expect(page).toMatch(/if \(donationId !== null\) return null/)
    expect(page).not.toContain("redirect(")
  })
})

describe("donations workspace — server fields and no client sums", () => {
  it("subscribes to the two server projections", () => {
    expect(workspace).toContain("getEventDonationIncome")
    expect(workspace).toContain("getStandaloneDonations")
    expect(workspace).toContain("usePaginatedQuery")
  })

  it("renders the recorded-total band from the projection only", () => {
    expect(workspace).toContain("totals.donationsMinor")
    expect(workspace).toContain("totals.allocatedMinor")
    expect(workspace).toContain("totals.unallocatedRemainderMinor")
    expect(workspace).toContain("totals.donationCount")
    expect(workspace).toContain("Recorded total:")
    expect(workspace).toContain("Allocated:")
    expect(workspace).toContain("Unallocated remainder:")
  })

  it("renders the composition columns from the enrichment, never a difference", () => {
    expect(workspace).toContain("allocatedMinor")
    expect(workspace).toContain("unallocatedRemainderMinor")
    expect(workspace).toContain("allocationCount")
    expect(workspace).not.toContain(".reduce(")
    expect(workspace).not.toMatch(/amountMinor\s*-/)
    expect(workspace).not.toContain("Math.min(")
  })

  it("keeps the frame contract, the form toggle and the list states", () => {
    expect(workspace).toContain("WorkspaceFrame")
    expect(workspace).toContain('title="Donations"')
    expect(workspace).toContain('workspaceLabel="Donations"')
    expect(workspace).toContain('workspaceId="donations"')
    expect(workspace).toContain(
      'description="Record, allocate, and review standalone donations for this event."'
    )
    expect(workspace).not.toContain("tabs=")
    expect(workspace).toContain("Record donation")
    expect(workspace).toContain("Load more donations")
    expect(workspace).toContain("No donations recorded")
    expect(workspace).toContain("DonationForm")
  })
})

describe("donations workspace — intent and row actions", () => {
  it("opens the donation detail route from the row Select action", () => {
    // 61-03: Select navigates to the dedicated route; the list no longer
    // selects anything inline and no longer produces the query form.
    expect(workspace).toContain("donationDetailHref(slug, row._id)")
    expect(workspace).toContain("router.push")
    expect(workspace).not.toContain("donationsHref(slug, { donationId")
    expect(workspace).not.toContain("selectDonation")
    expect(workspace).not.toContain("router.replace")
  })

  it("removed the record panel from the list entirely", () => {
    // The accumulating-container defect's structural site is gone: the list
    // imports and renders no record host (61-03 / D-01).
    expect(workspace).not.toContain("DonationRecordPanel")
  })

  it("keeps Add donation to order enabled for every source and gates only Delete", () => {
    const actionSlice = (label: string) => {
      const end = workspace.search(new RegExp(`${label}\\s*</Button>`))
      expect(
        end,
        `row action "${label}" must be a <Button> with that literal label`
      ).toBeGreaterThan(-1)
      return workspace.slice(
        workspace.lastIndexOf("<Button", end),
        workspace.indexOf("</Button>", end) + "</Button>".length
      )
    }

    const allocateAction = actionSlice("Add donation to order")
    const deleteAction = actionSlice("Delete donation")

    expect(allocateAction).not.toContain("disabled")
    expect(allocateAction).not.toContain('source === "tikkie"')
    // The Delete gate is the row's OWN description (bug A). The Tikkie source
    // rule moved into the builder, so no inline source literal may remain
    // anywhere in the workspace — and the disabled binding must read the
    // description, not a re-derived predicate.
    expect(deleteAction).toMatch(/disabled=\{deleteDescription !== null\}/)
    expect(workspace).not.toContain('source === "tikkie"')
    expect(workspace).not.toMatch(/cannot be allocated/i)
  })

  it("wires both dialogs and remounts them per donation", () => {
    expect(workspace).toContain("<DonationAllocationDialog")
    expect(workspace).toContain("<DonationDeleteDialog")
    // The keys are namespaced by element (61-01): a bare donation id collided
    // with the record panel and duplicated it. The `record-` key now lives on
    // the detail host and is pinned in `donation-detail-surface.test.ts` and
    // `donation-key-collision.test.ts`.
    expect(workspace).toMatch(
      /key=\{`allocation-\$\{allocationTarget\.donationId\}`\}/
    )
    expect(workspace).toMatch(
      /key=\{`deletion-\$\{deleteTarget\.donationId\}`\}/
    )
    expect(workspace).toContain("buildDonationDeletionSuccess")
    expect(workspace).toContain('role="status"')
  })

  it("keeps BOTH success bands — a list allocation must confirm on the list", () => {
    // The deletion band survives deletion-from-the-list.
    expect(workspace).toMatch(
      /\{buildDonationDeletionSuccess\(\{\s*allocationCount: deletionSuccess\.allocationCount,\s*\}\)\}/
    )
    // The allocation band: the record panel that used to render it left with
    // 61-03, so a successful allocation launched from the list must confirm
    // HERE or `allocationSuccess` would be dead state. Both figures come from
    // the dialog's own result payload — no new money figure is introduced.
    expect(workspace).toMatch(/\{allocationSuccess !== null && \(/)
    expect(workspace).toMatch(
       /formatMoney\(allocationSuccess\.allocatedTotalMinor, event\.currency\)/
    )
     expect(workspace).toMatch(/formatMoney\(allocationSuccess\.leftoverMinor, event\.currency\)/)
    expect(workspace).toContain("Allocation recorded.")
    // Both bands are role="status" regions (the page-level announcement).
    expect(
      workspace.match(/role="status"/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(2)
  })
})

describe("donations workspace — allocation-count readiness", () => {
  it("keeps the count tri-state and never coerces it to zero", () => {
    // An unknown count is `undefined`, never `0` (no `?? 0` fallback anywhere):
    // the delete confirmation must never claim "This removes no allocations.".
    expect(workspace).toContain("allocationCount === undefined")
    expect(workspace).not.toMatch(/allocationCount\s*\?\?\s*0/)
    // The two regexes above only catch a coercion that binds the identifier
    // directly; a probe that collapsed the CELL's own tri-state
    // (`allocationCountByDonationId.get(...) ?? 0`) survived them, so the ban
    // covers the whole identifier and the tri-state derivation and render are
    // pinned directly.
    expect(workspace).not.toMatch(/allocationCount[^\n]*\?\?\s*0/)
    expect(workspace).toMatch(
      /allocationCount =\s*income === undefined\s*\?\s*undefined\s*:/
    )
    expect(workspace).toMatch(
      /allocationCount === undefined\s*\?\s*"—"\s*:\s*allocationCount/
    )
    expect(workspace).toContain('"—"')
    // The dialog receives a known count only — the target is never armed with a
    // coerced one.
    expect(workspace).toMatch(
      /allocationCount=\{deleteTarget\.allocationCount\}/
    )
    expect(workspace).not.toMatch(
      /allocationCount:\s*allocationCountByDonationId\.get\([^)]*\)\s*\?\?\s*0/
    )
  })
})

describe("donations workspace — per-row delete description (bug A)", () => {
  it("derives the description per row from the builder and binds the row's own id", () => {
    // The call passes the row's source and the TRI-STATE count — never a
    // coerced value — so the builder is the only owner of the per-row rule.
    expect(workspace).toMatch(
      /buildDonationDeleteDescription\(\{\s*source: row\.source,\s*allocationCount,\s*\}\)/
    )
    // The id is derived from THIS row; the element renders only while the row
    // has something true to announce, and carries the description itself.
    expect(workspace).toMatch(
      /const deleteDescriptionId = `donation-delete-availability-\$\{row\._id\}`/
    )
    expect(workspace).toMatch(
      /\{deleteDescription !== null && \(\s*<p\s+id=\{deleteDescriptionId\}\s+className="sr-only">\s*\{deleteDescription\}\s*<\/p>\s*\)\}/
    )
    // The title announces the same per-row reason as the description — it must
    // never gain a fallback the description does not have.
    expect(workspace).toMatch(/title=\{deleteDescription \?\? undefined\}/)
    // PIN THE BINDING, not just the id: a probe that keeps the per-row id
    // declared but points aria-describedby at a shared literal id must fail.
    expect(workspace).toMatch(
      /aria-describedby=\{\s*deleteDescription === null\s*\?\s*undefined\s*:\s*deleteDescriptionId\s*\}/
    )
  })

  it("exiles both copy strings and the retired shared element", () => {
    // The copy lives in `lib/dashboard/donation-delete-availability.ts` only;
    // a re-announceable string in this file is the defect returning.
    expect(workspace).not.toContain(
      "Tikkie-sourced donations cannot be deleted"
    )
    expect(workspace).not.toContain("Preparing the allocation count…")
    expect(workspace).not.toContain("donations-delete-availability")
    expect(workspace).not.toContain("TIKKIE_DELETE_REFUSAL")
    expect(workspace).not.toContain("ALLOCATION_COUNT_PENDING")
    expect(workspace).not.toContain("DELETE_REFUSAL_DESCRIBED_BY_ID")
  })
})

describe("DACC-04 intent preservation", () => {
  it("preserves the link-through params without inventing a filter", () => {
    // `attendeeId` / `orderId` arrive for intent preservation. No locked read
    // resolves donations by attendee or order, so the list reads NO search
    // param at all — they are tolerated by the absence of any filter, never
    // consumed. A fabricated filter over data the list does not have is
    // exactly what this pin forbids.
    expect(workspace).not.toContain("searchParams")
    expect(workspace).not.toContain(".filter(")
    // The PAGE reads exactly one param: `donationId`, for the adoption hop.
    const reads = page.match(/searchParams\.get\([^)]*\)/g) ?? []
    expect(reads).toEqual(['searchParams.get("donationId")'])
    // `orderId` / `attendeeId` are never read by either file.
    expect(page).not.toContain('searchParams.get("orderId")')
    expect(page).not.toContain('searchParams.get("attendeeId")')
  })
})

describe("scope chooser order", () => {
  it("uses the shared order-first action label", () => {
    expect(workspace).toContain("Add donation to order")
    expect(workspace).not.toContain(">Allocate<")
  })
})

describe("no money arithmetic on the list", () => {
  it("has no operator before or after a *Minor identifier", () => {
    expect(workspace).not.toMatch(/[A-Za-z]Minor\s*[-+*/]/)
    expect(workspace).not.toMatch(/[-+*/]\s*[A-Za-z.]*[Mm]inor/)
  })
})

describe("phase 59 carry-forward register remains non-vacuous", () => {
  it("retains the historical source-action pin text", () => {
    expect(PHASE_59_ACTION_PIN_TEXT).toHaveLength(4)
  })
})
