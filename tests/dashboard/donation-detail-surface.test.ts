import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

/**
 * The dedicated donation detail host's structural guard (Phase 61, plan 61-03).
 *
 * 61-03 REMOVED the record panel from `donations-workspace.tsx` and relocated
 * its host here. The record panel's pins therefore MOVED to this file in FULL —
 * this is the contract the old suite's record blocks carried, re-asserted
 * against the same file at its new host. The panel itself was NOT rewritten:
 * `donation-record-panel.tsx` keeps its money bindings, its imperative read,
 * its copy and its states, and the index/cell-order pins still prove the LOCKED
 * presentation (`Writable now` = `effectiveCapacityMinor` leading, `Scope
 * balance` = `scopeOutstandingMinor` demoted last).
 *
 * The host obligations pinned here are the ones a wrong relocation could lose:
 *   - the id SHAPE gate must run before any query (a malformed URL segment must
 *     never reach Convex argument validation);
 *   - a READ FAILURE gets its own "We could not load this donation" state with
 *     a retry AND a back link — it must never render the not-found copy or
 *     claim non-existence, because a failed query says nothing about existence
 *     (Convex's `v.id` checks the encoded table number, so a fabricated
 *     32-char segment passes the shape gate and still throws during render);
 *   - the TRUE not-found state belongs to a read that resolved as absent
 *     (null payment, non-standalone, cross-event, or absent from income) and
 *     offers the way back but NO retry;
 *   - the record renders only for a standalone donation this event owns that
 *     the income projection contains, with a KNOWN allocation count;
 *   - the same two dialogs are hosted with element-namespaced keys;
 *   - deletion reports DDEL-02's reversal on-route;
 *   - every state carries a way back.
 */

const ROOT = resolve(import.meta.dirname, "../..")

const RECORD_PATH = "components/dashboard/finance/donation-record-panel.tsx"
const SURFACE_PATH = "components/dashboard/finance/donation-detail-surface.tsx"
const DETAIL_PAGE_PATH =
  "app/dashboard/events/[slug]/donations/[donationId]/page.tsx"
const LIST_PAGE_PATH = "app/dashboard/events/[slug]/donations/page.tsx"
const WORKSPACE_PATH = "components/dashboard/finance/donations-workspace.tsx"
const HOOK_PATH = "lib/convex/hooks/payments.ts"

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

/**
 * Removes block and line comments before a presence scan. Without this, a doc
 * comment naming the centring classes satisfies the pin even when the real
 * markup was reverted (the decoy-comment probe); a presentation guard must
 * never be satisfiable by a comment.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*$/gm, "")
}

function walkSourceFiles(relativeRoot: string): string[] {
  const out: string[] = []
  const visit = (relativeDir: string) => {
    for (const entry of readdirSync(resolve(ROOT, relativeDir), {
      withFileTypes: true,
    })) {
      const relativePath = `${relativeDir}/${entry.name}`
      if (entry.isDirectory()) visit(relativePath)
      else if (/\.tsx?$/.test(entry.name)) out.push(relativePath)
    }
  }
  visit(relativeRoot)
  return out.sort()
}

/**
 * The source of ONE top-level declaration (function or class), from its
 * declaration to its column-0 closing brace. Slicing is what makes the
 * two-failure-state pins discriminate: each state's copy is checked in its own
 * component, so one state cannot satisfy the other's absence pins.
 */
function topLevelSlice(source: string, declaration: string): string {
  const start = source.indexOf(declaration)
  expect(start, `missing declaration: ${declaration}`).toBeGreaterThan(-1)
  // A column-0 closing brace FOLLOWED BY a newline: the destructuring pattern's
  // own `}` (e.g. `}: {` on its own line) is followed by `:`, not `\n`.
  const end = source.indexOf("\n}\n", start + declaration.length)
  expect(end, `missing closing brace for: ${declaration}`).toBeGreaterThan(
    start
  )
  return source.slice(start, end + 2)
}

const record = readSource(RECORD_PATH)
const surface = readSource(SURFACE_PATH)
const detailPage = readSource(DETAIL_PAGE_PATH)
const listPage = readSource(LIST_PAGE_PATH)
const hook = readSource(HOOK_PATH)

describe("donation record — the moved pins, in full (DACC-04 + effective capacity)", () => {
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
       "formatMoney(row.scopeOutstandingMinor, currency)"
    )
    const writableCellIndex = record.indexOf(
       "formatMoney(row.effectiveCapacityMinor, currency)"
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

describe("donation detail surface — host obligations", () => {
  it("reads the payment by id and the event income projection", () => {
    expect(surface).toContain("usePaymentById")
    expect(surface).toContain("getEventDonationIncome")
  })

  it("renders the record only for a standalone donation this event owns", () => {
    expect(surface).toMatch(/payment\.donationKind === "standalone"/)
    expect(surface).toMatch(
      /String\(payment\.eventId\) === String\(event\._id\)/
    )
  })

  it("gates the record on a KNOWN allocation count", () => {
    // The panel's `allocationCount` prop is required; an unresolved income
    // projection must gate the record rather than arm the delete dialog with a
    // fabricated zero (DDEL-01). The guard renders the TRUE not-found state.
    expect(surface).toMatch(
      /allocationCount === undefined\s*\)\s*\{\s*return <DonationNotFound slug=\{slug\} \/>/
    )
    expect(surface).toMatch(
      /allocationCount =[\s\S]{0,80}incomeRow === undefined/
    )
  })

  it("mounts the record with the full prop set and the namespaced key", () => {
    const start = surface.indexOf("<DonationRecordPanel")
    const end = surface.indexOf("/>", start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const panelMount = surface.slice(start, end)

    expect(panelMount).toMatch(/key=\{`record-\$\{donationId\}`\}/)
    expect(panelMount).toContain("donationId={payment._id}")
    expect(panelMount).toContain("eventId={event._id}")
    expect(panelMount).toContain("payerName={payment.payerName}")
    expect(panelMount).toContain("amountMinor={payment.amountMinor}")
    expect(panelMount).toContain("source={payment.source}")
    expect(panelMount).toContain("paidAt={payment.paidAt}")
    expect(panelMount).toContain("notes={payment.notes ?? null}")
    expect(panelMount).toContain("allocationCount={allocationCount}")
    expect(panelMount).toContain("reloadToken={reloadToken}")
    expect(panelMount).toContain("allocationSuccess={allocationSuccess}")
    expect(panelMount).toContain("onAllocate={")
    expect(panelMount).toContain("onDelete={")
  })

  it("hosts both dialogs with element-namespaced keys", () => {
    expect(surface).toContain("<DonationAllocationDialog")
    expect(surface).toContain("<DonationDeleteDialog")
    expect(surface).toMatch(
      /key=\{`allocation-\$\{allocationTarget\.donationId\}`\}/
    )
    expect(surface).toMatch(/key=\{`deletion-\$\{deleteTarget\.donationId\}`\}/)
  })

  it("reports the deletion reversal on-route with a way back", () => {
    expect(surface).toContain("buildDonationDeletionSuccess")
    expect(surface).toMatch(
      /\{buildDonationDeletionSuccess\(\{\s*allocationCount: deletionSuccess\.allocationCount,\s*\}\)\}/
    )
    expect(surface).toMatch(/role="status"/)
    // Deleted state: the payment row is gone, so the reversal band plus the
    // back link replace the record — never a bare dead end.
    expect(surface).toMatch(/if \(deletionSuccess !== null\)/)
    expect(surface).toMatch(/href=\{donationsHref\(slug\)\}/)
    expect(surface).toContain("Back to donations")
  })

  it("renders the true not-found state for a read that RESOLVED as absent", () => {
    // The not-found state is its own component, rendered by the null-payment
    // branch and by the validity guards — its full discrimination pins live in
    // the two-failure-state block below.
    expect(surface).toMatch(/return <DonationNotFound slug=\{slug\} \/>/)
  })

  it("keeps the dialog result wiring the list had (success clears the other band)", () => {
    // onAllocated: record the result, clear the deletion band, bump the reload
    // token; onDeleted: record the reversal, clear the allocation band, bump.
    expect(surface).toMatch(
      /onAllocated=\{\(result\) => \{[\s\S]{0,400}setReloadToken\(\(token\) => token \+ 1\)/
    )
    expect(surface).toMatch(
      /onDeleted=\{\(result\) => \{[\s\S]{0,400}setReloadToken\(\(token\) => token \+ 1\)/
    )
  })
})

describe("donation detail surface — the two failure states are distinct", () => {
  it("renders a read-failure state that never claims non-existence", () => {
    const failed = topLevelSlice(surface, "function DonationLoadFailed(")
    expect(failed).toContain("We could not load this donation")
    expect(failed).toContain("Try again")
    expect(failed).toMatch(/onClick=\{onRetry\}/)
    expect(failed).toContain("<BackToDonations")
    // A FAILED READ says nothing about existence: the copy must not claim the
    // donation is absent, and the not-found state's distinctive copy must not
    // leak into this component.
    expect(failed).not.toContain("Donation not found")
    expect(failed).not.toContain("not available")
    expect(failed).not.toMatch(/does not exist|doesn't exist/i)
  })

  it("renders the true not-found state without a retry affordance", () => {
    const missing = topLevelSlice(surface, "function DonationNotFound(")
    expect(missing).toContain("Donation not found")
    expect(missing).toContain('state="empty"')
    expect(missing).toContain("<BackToDonations")
    // The shared way-back link is real markup with the canonical href — a
    // comment naming it cannot satisfy the state slices above.
    const backLink = topLevelSlice(surface, "function BackToDonations(")
    expect(backLink).toContain("Back to donations")
    expect(backLink).toContain("href={donationsHref(slug)}")
    // The read-failure copy must not leak into the not-found component, and a
    // genuinely absent id gets no retry (there is nothing to re-issue).
    expect(missing).not.toContain("We could not load this donation")
    expect(missing).not.toContain("Something went wrong")
    expect(missing).not.toContain("Try again")
  })

  it("centres and enlarges the true not-found state locally (D-08)", () => {
    const missing = topLevelSlice(surface, "function DonationNotFound(")
    const mountStart = missing.indexOf("<DashboardQueryState")
    const mountEnd = missing.indexOf("/>", mountStart)
    expect(mountStart).toBeGreaterThan(-1)
    expect(mountEnd).toBeGreaterThan(mountStart)
    // Comments are stripped BEFORE the class scan: a comment naming the
    // classes can no longer satisfy the pin (the decoy-comment probe).
    const stateMount = stripComments(missing.slice(mountStart, mountEnd))

    // The centring and the larger type ride on THIS mount's className, so the
    // shared component's default presentation is untouched for every other
    // consumer and the change stays local to the not-found state.
    expect(stateMount).toMatch(/className="[^"]*\bitems-center\b[^"]*"/)
    expect(stateMount).toMatch(/className="[^"]*\bjustify-center\b[^"]*"/)
    expect(stateMount).toMatch(/className="[^"]*\btext-center\b[^"]*"/)
    expect(stateMount).toMatch(/className="[^"]*\btext-lg\b[^"]*"/)
  })

  it("routes each failure mode to its own state, never the other", () => {
    // The boundary's fallback is the READ-FAILURE state...
    expect(surface).toMatch(
      /fallback=\{\(retry\) => <DonationLoadFailed slug=\{slug\} onRetry=\{retry\} \/>\}/
    )
    expect(surface).not.toMatch(/fallback=\{[\s\S]{0,120}<DonationNotFound/)
    // ...and the inner's guards + null-payment branch render NOT-FOUND.
    expect(surface).toMatch(/return <DonationNotFound slug=\{slug\} \/>/)
    expect(surface).not.toMatch(/return <DonationLoadFailed/)
    // Both states exist as separate components — neither may be satisfied by a
    // comment naming the other's copy.
    expect(surface).toContain("function DonationNotFound(")
    expect(surface).toContain("function DonationLoadFailed(")
  })
})

describe("donation detail surface — the read boundary catches and retries", () => {
  it("wraps the querying inner surface in a local boundary keyed per donation", () => {
    expect(surface).toMatch(/class DonationReadBoundary extends Component/)
    expect(surface).toMatch(/static getDerivedStateFromError\(\)/)
    expect(surface).toMatch(
      /<DonationReadBoundary\s+key=\{`read-\$\{donationId\}`\}/
    )
    expect(surface).toMatch(
      /<DonationDetailSurfaceInner slug=\{slug\} donationId=\{donationId\} \/>/
    )
    // The read lives INSIDE the boundary: the inner component is the one that
    // calls the hooks.
    const inner = topLevelSlice(surface, "function DonationDetailSurfaceInner(")
    expect(inner).toContain("usePaymentById(")
    expect(inner).toContain("getEventDonationIncome")
  })

  it("resets the boundary on retry so the child remounts and re-issues the read", () => {
    const boundary = topLevelSlice(surface, "class DonationReadBoundary")
    // The retry is the boundary's own reset; a reset re-renders the children
    // where the fallback was, which MOUNTS them afresh — the inner's
    // `useQuery` subscriptions re-issue. A cached failure cannot pass.
    expect(boundary).toMatch(/this\.setState\(\{ failed: false \}\)/)
    expect(boundary).toMatch(/this\.state\.failed/)
    expect(boundary).toMatch(/this\.props\.children/)
    // The reset is threaded to the visible affordance: fallback receives the
    // boundary's retry and the failure state's button clicks it.
    expect(surface).toMatch(
      /fallback=\{\(retry\) => <DonationLoadFailed slug=\{slug\} onRetry=\{retry\} \/>\}/
    )
    expect(topLevelSlice(surface, "function DonationLoadFailed(")).toMatch(
      /onClick=\{onRetry\}/
    )
  })
})

describe("donation detail surface — the id-shape gate", () => {
  it("shape-checks the URL segment before any query", () => {
    expect(surface).toMatch(
      /const DONATION_ID_PATTERN = \/\^\[a-z0-9\]\{32\}\$\//
    )
    expect(surface).toMatch(/DONATION_ID_PATTERN\.test\(donationId\)/)
  })

  it("passes null — never the raw string — into the payment read", () => {
    expect(surface).toMatch(
      /usePaymentById\(\s*isValidDonationId \? \(donationId as Id<"payments">\) : null\s*\)/
    )
    expect(surface).not.toMatch(/usePaymentById\(donationId\)/)
  })

  it("widens the hook to skip the query for a null id", () => {
    expect(hook).toMatch(/usePaymentById\(paymentId: Id<"payments"> \| null\)/)
    expect(hook).toContain('"skip"')
    expect(hook).toMatch(/paymentId === null \? "skip" : \{ paymentId \}/)
  })

  it("orders the malformed-id branch before the loading branch", () => {
    // A malformed id must land on the not-found state, not the spinner, and
    // never reach the query. The branch ORDER is the discriminator.
    const idGateIndex = surface.indexOf("if (!isValidDonationId)")
    const loadingIndex = surface.indexOf(
      "if (payment === undefined || income === undefined)"
    )
    expect(idGateIndex).toBeGreaterThan(-1)
    expect(loadingIndex).toBeGreaterThan(-1)
    expect(idGateIndex).toBeLessThan(loadingIndex)
  })
})

describe("the detail route and its link producers", () => {
  it("is a plain client bridge — the detail never redirects back", () => {
    expect(detailPage).toContain('"use client"')
    expect(detailPage).toContain("useParams")
    expect(detailPage).toContain("<DonationDetailSurface")
    expect(detailPage).toMatch(
      /export default function DonationDetailPage\s*\(/
    )
    expect(detailPage).not.toContain("redirect(")
    expect(detailPage).not.toContain("useRouter")
  })

  it("adopts the legacy query intent once on the list page", () => {
    expect(listPage).toContain('searchParams.get("donationId")')
    expect(listPage).toMatch(
      /router\.replace\(donationDetailHref\(slug, donationId\)\)/
    )
    expect(listPage).not.toContain("redirect(")
  })

  it("produces no legacy ?donationId= URL anywhere in app/ or components/", () => {
    const files = [...walkSourceFiles("app"), ...walkSourceFiles("components")]
    // Non-vacuity: the walk must reach the producers it is meant to scan.
    expect(files).toContain(WORKSPACE_PATH)
    expect(files).toContain(DETAIL_PAGE_PATH)
    expect(files).toContain(LIST_PAGE_PATH)
    expect(files.length).toBeGreaterThan(100)

    const offenders = files.filter((file) =>
      readSource(file).includes("donationsHref(slug, { donationId")
    )
    expect(offenders).toEqual([])
  })

  it("builds every detail link through the canonical builder", () => {
    const files = [...walkSourceFiles("app"), ...walkSourceFiles("components")]
    const rawTemplateOffenders = files.filter((file) =>
      readSource(file).includes("/donations/${")
    )
    expect(rawTemplateOffenders).toEqual([])

    expect(readSource(WORKSPACE_PATH)).toContain(
      "donationDetailHref(slug, row._id)"
    )
    expect(listPage).toContain("donationDetailHref(slug, donationId)")
  })
})

describe("no money arithmetic on the detail host or the record", () => {
  it("has no operator before or after a *Minor identifier", () => {
    for (const source of [surface, record]) {
      expect(source).not.toMatch(/[A-Za-z]Minor\s*[-+*/]/)
      expect(source).not.toMatch(/[-+*/]\s*[A-Za-z.]*[Mm]inor/)
    }
  })
})
