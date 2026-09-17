import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * The donations page's structural guard (Phase 58, plan 58-09).
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
 *      the page must not fabricate a filter over data it does not have. The
 *      record is where each allocation's target and scope are shown in full.
 *
 * AE-1 presentation pin (the worked case's UI half): the record presents
 * `Scope balance` (€120.00 in the worked case, from `scopeOutstandingMinor`)
 * and `Writable now` (€100.00, from `effectiveCapacityMinor`) as two separately
 * labelled figures, and `Math.min` is absent from the file — the writable figure
 * is read, never synthesised. The numeric proof of the worked case lives in
 * `convex/donation-allocation-acceptance.handlers.test.ts` (58-03).
 */

const ROOT = resolve(import.meta.dirname, "../..")
const PAGE_PATH = "app/dashboard/events/[slug]/donations/page.tsx"
const WORKSPACE_PATH = "components/dashboard/finance/donations-workspace.tsx"
const RECORD_PATH = "components/dashboard/finance/donation-record-panel.tsx"

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

const page = readSource(PAGE_PATH)
const workspace = readSource(WORKSPACE_PATH)
const record = readSource(RECORD_PATH)

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
  it("makes the selection shareable through the canonical href", () => {
    expect(workspace).toContain("donationsHref(slug, { donationId")
    expect(workspace).toContain("router.replace")
  })

  it("keeps Allocate enabled for every source and gates only Delete", () => {
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

    const allocateAction = actionSlice("Allocate")
    const deleteAction = actionSlice("Delete donation")

    expect(allocateAction).not.toContain("disabled")
    expect(allocateAction).not.toContain('source === "tikkie"')
    expect(deleteAction).toContain('source === "tikkie"')
    // Every Tikkie gate in the file lives inside the Delete action.
    expect(workspace.split('source === "tikkie"').length - 1).toBe(
      deleteAction.split('source === "tikkie"').length - 1
    )
    expect(workspace).not.toMatch(/cannot be allocated/i)
    expect(workspace).toContain("Tikkie-sourced donations cannot be deleted")
  })

  it("wires both dialogs and remounts them per donation", () => {
    expect(workspace).toContain("<DonationAllocationDialog")
    expect(workspace).toContain("<DonationDeleteDialog")
    expect(workspace).toMatch(/key=\{allocationTarget\.donationId\}/)
    expect(workspace).toMatch(/key=\{deleteTarget\.donationId\}/)
    expect(workspace).toContain("buildDonationDeletionSuccess")
    expect(workspace).toContain('role="status"')
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
    expect(workspace).toContain("Preparing the allocation count…")
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

describe("DACC-04 intent preservation", () => {
  it("preserves the link-through params without inventing a filter", () => {
    // `attendeeId` / `orderId` arrive for intent preservation. No locked read
    // resolves donations by attendee or order, so the only param this page may
    // read is `donationId`; a fabricated filter over data the page does not
    // have is exactly what this pin forbids.
    const reads = workspace.match(/searchParams\.get\([^)]*\)/g) ?? []
    expect(reads).toEqual(['searchParams.get("donationId")'])
    expect(workspace).not.toContain(".filter(")
  })
})

describe("donation record — DACC-04 and effective capacity", () => {
  it("reads the summary imperatively so the error states are real", () => {
    expect(record).toContain("getDonationAllocationSummary")
    expect(record).toContain("useConvex")
    // The SUMMARY read is imperative; the only `useQuery` is the per-row target
    // name lookup.
    expect(record).not.toMatch(
      /useQuery\(\s*api\.donations\.getDonationAllocationSummary/
    )
    expect(record).toContain("reloadToken")
    expect(record).toContain("Try again")
    expect(record).toContain("Allocations unavailable")
    expect(record).toContain("Your session has expired")
  })

  it("renders the effective-capacity figures verbatim", () => {
    expect(record).toContain("effectiveCapacityMinor")
    expect(record).toContain("scopeOutstandingMinor")
    expect(record).toContain("appliedMinor")
    expect(record).toContain("unappliedMinor")
    expect(record).toContain("exceedsCeiling")
    expect(record).toContain("exceedsCapacity")
    expect(record).toContain("Writable now")
    expect(record).toContain("Scope balance")
    expect(record).toContain("Applied")
    expect(record).toContain("Not applied")
    expect(record).toContain("Target attendee")
    expect(record).toContain("Allocations for this donation")
    expect(record).toContain("No allocations yet")
    expect(record).toContain("Show all")
    expect(record).toContain("scopeLabel(")
    expect(record).toContain("getOrderWithAttendees")
  })

  it("binds Scope balance and Writable now to their own figures", () => {
    // The LOCKED presentation: the `Scope balance` column reads
    // `scopeOutstandingMinor` and the `Writable now` column reads
    // `effectiveCapacityMinor`, in that order. A swap — the bare scope ceiling
    // relabelled as the writable amount — satisfies every label pin above, so
    // the header order AND the cell-binding order are pinned directly.
    const scopeHeaderIndex = record.indexOf("Scope balance</TableHead>")
    const writableHeaderIndex = record.indexOf("Writable now</TableHead>")
    const scopeCellIndex = record.indexOf(
      "formatMoney(row.scopeOutstandingMinor)"
    )
    const writableCellIndex = record.indexOf(
      "formatMoney(row.effectiveCapacityMinor)"
    )

    expect(scopeHeaderIndex).toBeGreaterThan(-1)
    expect(writableHeaderIndex).toBeGreaterThan(-1)
    expect(scopeCellIndex).toBeGreaterThan(-1)
    expect(writableCellIndex).toBeGreaterThan(-1)
    expect(scopeHeaderIndex).toBeLessThan(writableHeaderIndex)
    expect(scopeCellIndex).toBeLessThan(writableCellIndex)
  })

  it("derives no money figure of its own and names each bound", () => {
    expect(record).not.toContain("Math.min(")
    expect(record).not.toContain("Math.max(")
    expect(record).not.toContain("reduce(")
    expect(record).not.toContain("toFixed(")
    expect(record).not.toContain("amountMinor -")
    expect(record).toContain("Above this attendee's scope balance.")
    expect(record).toContain("Above the order's remaining capacity")
    expect(record).toContain("is not credited.")
  })
})

describe("no money arithmetic on either surface", () => {
  it("has no operator before or after a *Minor identifier", () => {
    for (const source of [workspace, record]) {
      expect(source).not.toMatch(/[A-Za-z]Minor\s*[-+*/]/)
      expect(source).not.toMatch(/[-+*/]\s*[A-Za-z.]*[Mm]inor/)
    }
  })
})
