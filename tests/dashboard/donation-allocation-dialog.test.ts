import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  ALLOCATION_SCOPE_INTENT_LABELS,
  DEFAULT_ALLOCATION_SCOPE,
} from "@/lib/dashboard/donation-allocation-request"

/**
 * The allocation editor's structural guard (Phase 58, plan 58-08).
 *
 * This is the SIMPLIFIED presentation, and the assertions below are the
 * discriminating layer for it. Each group says which rule it pins:
 *
 *   - The writable-leading ladder: `Writable now` renders the server's
 *     `effectiveCapacityMinor` (added by 58-11) as the row's PRIMARY figure,
 *     and the bare scope ceiling is demoted to muted `Scope balance`, rendered
 *     last, never the headline and never the bound of a manual input. Swapping
 *     the two bindings — the exact regression that misled the operator — fails
 *     these assertions.
 *   - Scope as INTENT: the pickers and the badge render the shared intent
 *     vocabulary, never the raw schema values or the recorded-scope nouns,
 *     while BOTH intents stay reachable in bulk and per row (DON-07; Phase 59
 *     SC2 depends on the choice remaining functional). The option list is
 *     pinned to the FULL vocabulary — its construction AND both render sites —
 *     so narrowing or emptying the choice fails (W1).
 *   - The money-free picker: the structural guarantee behind the LOCKED
 *     effective-capacity rule — no per-attendee figure is rendered before the
 *     server quotes one.
 *   - The imperative, server-quoted preview and the retry-stable key policy.
 *
 * The guards are source scans because the platform cannot type-check JSX
 * bindings or the absence of arithmetic idioms.
 */

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

/**
 * The exact option shape EACH of the two scope controls must render, for every
 * entry of the complete list. Any narrowing of the list (`.slice(`, `.filter(`,
 * an empty-array literal) or trimming after the map breaks this shape, so the
 * count of two is what turns "a chooser exists" into "both scopes are
 * rendered" — the presence pins alone cannot see that (W1).
 */
const SCOPE_OPTION_SITE =
  /SCOPE_CHOICES\s*\.map\(\(scope\)\s*=>\s*\(\s*<SelectItem key=\{scope\} value=\{scope\}>\s*\{ALLOCATION_SCOPE_INTENT_LABELS\[scope\]\}\s*<\/SelectItem>\s*\)\)/g

describe("the writable-leading ladder (LOCKED effective-capacity rule)", () => {
  it("binds Writable now to the server's effectiveCapacityMinor, primary and first", () => {
    expect(dialog).toContain("Writable now")
    expect(dialog).toContain("Will allocate")
    expect(dialog).toContain("Scope balance")
    expect(dialog).toContain("effectiveCapacityMinor")
    expect(dialog).toContain("exceedsCapacity")
    expect(dialog).toContain("ceilingMinor")
    expect(dialog).toContain("totalAllocatedMinor")
    expect(dialog).toContain("leftoverMinor")
    expect(dialog).toContain("remainderMinor")
    expect(dialog).toContain("previewOnly")

    // The three figures go through the one renderer, in this order, and only
    // the writable figure carries the primary tone.
    expect(dialog).toMatch(
      /label="Writable now"[\s\S]{0,120}valueMinor=\{row\.effectiveCapacityMinor\}/
    )
    expect(dialog).toMatch(/label="Writable now"[\s\S]{0,120}tone="primary"/)
    expect(dialog).toMatch(
      /label="Will allocate"[\s\S]{0,120}valueMinor=\{row\.amountMinor\}/
    )
    expect(dialog).toMatch(
      /label="Scope balance"[\s\S]{0,120}valueMinor=\{row\.ceilingMinor\}/
    )
    expect(dialog).toMatch(/label="Scope balance"[\s\S]{0,120}tone="muted"/)
  })

  it("demotes the bare ceiling: never the headline, never the primary tone", () => {
    expect(dialog).not.toMatch(
      /label="Scope balance"[\s\S]{0,60}tone="primary"/
    )
    expect(dialog).not.toMatch(/Writable now[\s\S]{0,60}ceilingMinor/)
  })

  it("bounds the manual helper at the writable figure, never at the ceiling", () => {
    expect(dialog).toContain("Up to")
    expect(dialog).toMatch(/Up to[\s\S]{0,60}effectiveCapacityMinor/)
    expect(dialog).not.toMatch(/Up to[\s\S]{0,60}ceilingMinor/)
  })

  it("renders the approved demoted note and the qualitative shared-order notice", () => {
    expect(dialog).toContain(
      "Limited by the order's shared remaining capacity."
    )
    expect(dialog).toContain(
      "These attendees share one order. Allocations draw on that order's single remaining capacity, so the total placed can be less than the sum of their balances."
    )
    // The notice is qualitative: it states no figure and nothing sums the
    // per-row capacity — the only capacity number rendered is the server's.
    expect(dialog).not.toContain("Math.min(")
  })

  it("presents the leftover as success and the remainder as allocated money", () => {
    expect(dialog).toContain("Cannot be placed")
    expect(dialog).toContain(
      "This stays unallocated and can be allocated later."
    )
    expect(dialog).toContain("Rounding remainder")
    expect(dialog).toContain("remainderRecipientAttendeeIds")
    expect(dialog).toContain("Nothing to allocate")
  })

  it("synthesises no writable figure client-side", () => {
    expect(dialog).not.toContain("Math.min(")
    expect(dialog).not.toContain("Math.max(")
  })
})

describe("scope as intent (DON-07 stays reachable)", () => {
  it("renders the shared intent vocabulary, never the schema values or recorded nouns", () => {
    expect(dialog).toContain("scopeIntentLabel(")
    expect(dialog).toContain("ALLOCATION_SCOPE_INTENT_LABELS")
    expect(dialog).toContain("DEFAULT_ALLOCATION_SCOPE")
    // No schema value or recorded-scope noun may appear as rendered text.
    expect(dialog).not.toMatch(
      />\s*(Event charges|Whole order|event_charges|whole_order)\s*</
    )
    // The dialog's scope presentation is intent-only; the noun labels stay
    // with the record and the skip copy.
    expect(dialog).not.toContain("scopeLabel(")
  })

  it("keeps both scopes choosable in bulk and per row", () => {
    // The chooser's options come from the shared vocabulary...
    expect(dialog).toMatch(
      /SCOPE_CHOICES\s*=\s*Object\.keys\(\s*ALLOCATION_SCOPE_INTENT_LABELS\s*\)/
    )
    // ...and are rendered by TWO controls: the bulk select and each target
    // row's own select. Removing either — "default only, no way to restrict" —
    // must fail these pins, because DON-07 requires the choice to remain.
    expect(dialog).toContain('aria-label="Scope for all selected"')
    expect(dialog).toMatch(/aria-label=\{`Scope for \$\{target\.name\}`\}/)
    expect(dialog).toContain("onValueChange")
    expect(dialog).toContain("setBulkScope")
    expect(dialog).toContain("handleRowScopeChange")
    // Each control's selection state is BOUND to the scope state (a value
    // hardcoded to the default would make the chooser cosmetic) and starts on
    // the shared default.
    expect(dialog).toContain("value={bulkScope}")
    expect(dialog).toContain("value={target.scope}")
    expect(dialog).toMatch(
      /useState<AllocationScope>\(\s*DEFAULT_ALLOCATION_SCOPE\s*\)/
    )
    // Each control renders EVERY vocabulary entry (two call sites).
    expect(
      (dialog.match(/\{ALLOCATION_SCOPE_INTENT_LABELS\[scope\]\}/g) ?? [])
        .length
    ).toBe(2)
  })

  it("builds the option list from the vocabulary and renders it whole at both sites (W1)", () => {
    // The declaration is pinned as a WHOLE statement: nothing — no `slice(`,
    // no `filter(`, no literal array, no reassignment — may sit between the
    // keys call and the cast, and nothing may follow it on the statement
    // (`(?=\n)` is that end pin).
    expect(dialog).toMatch(
      /const SCOPE_CHOICES = Object\.keys\(\s*ALLOCATION_SCOPE_INTENT_LABELS\s*\) as AllocationScope\[\](?=\n)/
    )

    // BOTH controls render EVERY entry of that list, through the exact option
    // shape. `SCOPE_CHOICES.slice(0, 1).map(...)`, `SCOPE_CHOICES.filter(...)`,
    // `{[].map(...)}` and any post-map trimming render fewer than two options
    // and fail this count (W1).
    expect(dialog.match(SCOPE_OPTION_SITE) ?? []).toHaveLength(2)
  })

  it("bans the narrowing idioms around the option list (W1)", () => {
    // No method other than `.map(` may be called directly on the list...
    expect(dialog).not.toMatch(/SCOPE_CHOICES\s*\.\s*(?!map\()\w+/)
    // ...the list may never be indexed...
    expect(dialog).not.toMatch(/SCOPE_CHOICES\s*\[/)
    // ...and no empty-array literal may feed an option map.
    expect(dialog).not.toMatch(/\[\s*\]\s*\.map\(/)
  })

  it("pins the vocabulary itself: exactly the two scopes, the default leading (W1)", () => {
    // Read from the MODULE, not the source text: exactly the two scope values,
    // in the chooser's own order — `Object.keys` order IS the option order, so
    // the default leads the list (58-09's carry-over from 58-08).
    const scopes = Object.keys(ALLOCATION_SCOPE_INTENT_LABELS)
    expect(scopes).toEqual(["whole_order", "event_charges"])
    expect(scopes[0]).toBe(DEFAULT_ALLOCATION_SCOPE)
    // Both options carry a distinct operator-facing intent.
    expect(new Set(Object.values(ALLOCATION_SCOPE_INTENT_LABELS)).size).toBe(2)
  })
})

describe("money-free picker (the structural guarantee)", () => {
  it("renders no money and reads no money field", () => {
    expect(picker).not.toContain("formatMoney")
    expect(picker).not.toMatch(/[A-Za-z]Minor/)
    expect(picker).toContain("getAttendeeLedgerPage")
    expect(picker).toContain("bookingRef")
    expect(picker).toContain("ticketTypeLabel")
    expect(picker).toContain('type="checkbox"')
    expect(picker).toContain("Load more attendees")
    expect(picker).toContain('aria-label="Search attendees"')
  })

  it("keeps selection by attendeeId (it survives searches) and debounces the search", () => {
    // Selection is read from the parent-owned set keyed by the row's id, and
    // the row reports that same id — never a page index.
    expect(picker).toContain("selectedIds.has(String(row._id))")
    expect(picker).toContain("attendeeId: row._id")
    expect(picker).toContain("onDeselect")
    expect(picker).toContain("setTimeout")
    expect(picker).toContain("debouncedSearch")
  })
})

describe("imperative server-quoted preview", () => {
  it("quotes through useConvex().query, never through a throwing subscription", () => {
    expect(dialog).toContain("previewDonationAllocation")
    expect(dialog).toContain("useConvex")
    // `useQuery` THROWS on a refusal; the refusal band is a designed outcome.
    expect(dialog).not.toContain("useQuery(")
    expect(dialog).toContain("requestId")
    expect(dialog).toContain("setTimeout")
    expect(dialog).toContain("Updating")
    expect(dialog).toContain('role="alert"')
  })
})

describe("self-contained donation band", () => {
  it("reads its own summary and never computes a fallback", () => {
    expect(dialog).toContain("getDonationAllocationSummary")
    expect(dialog).toContain("Recorded allocated")
    expect(dialog).toContain("Remaining")
    expect(dialog).toContain("donationAmountMinor")
    expect(dialog).toContain("recordedAllocatedMinor")
    expect(dialog).toContain("remainingMinor")
  })
})

describe("refusal mapping, stable key and submit gate", () => {
  it("maps refusals through the pure mapper and mints no key itself", () => {
    expect(dialog).toContain("allocationRefusalCopy(")
    expect(dialog).toContain("buildAllocationRequest(")
    expect(dialog).toContain("nextAllocationKey(")
    expect(dialog).not.toContain("randomUUID")
    expect(dialog).toContain("idempotencyKey:")
  })

  it("submits through allocateDonation with the house affordances", () => {
    expect(dialog).toContain("allocateDonation")
    expect(dialog).toContain("Allocate donation")
    expect(dialog).toContain("Allocating…")
    expect(dialog).toContain("Cancel")
    expect(dialog).toContain("aria-busy")
  })
})

describe("no client-side money arithmetic in either file", () => {
  it("never computes over a money figure", () => {
    for (const path of [DIALOG_PATH, PICKER_PATH]) {
      const source = readSource(path)
      // Display comparisons (`<`, `===`) are deliberately allowed — they gate
      // presentation and produce no figure. These are the arithmetic idioms.
      expect(source).not.toMatch(/[A-Za-z]Minor\s*[-+*/]/)
      expect(source).not.toMatch(/[-+*/]\s*[A-Za-z.]*[Mm]inor/)
      expect(source).not.toContain("reduce(")
      expect(source).not.toContain("toFixed(")
      expect(source).not.toContain("Math.round(")
      expect(source).not.toContain("Math.floor(")
    }
  })
})
