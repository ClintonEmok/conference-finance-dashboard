import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

import { DEFAULT_ALLOCATION_SCOPE } from "@/lib/dashboard/donation-allocation-request"

/**
 * The order-detail allocation entry guard (Phase 61, plan 61-04, D-02).
 *
 * The entry point is "Allocate a donation to this order" on the order detail
 * page: a chooser of standalone donations that still have an unallocated
 * remainder, then the SAME `DonationAllocationDialog` pre-scoped to the
 * order's attendees. Three properties are load-bearing:
 *
 *   1. SINGLE CODE PATH. `previewDonationAllocation` and `allocateDonation`
 *      are referenced and called from the shared editor only. The chooser, the
 *      actions row and the order surface carry neither a mutation hook nor a
 *      call — a second writer would recreate the divergence class Phases 55-58
 *      eliminated.
 *   2. PRE-SCOPING IS DERIVED, NOT FABRICATED. `orderTargets` maps the WHOLE
 *      loaded order attendee list (`orderPayload.attendees`) and carries the
 *      order's own booking ref; the editor seeds its target state from that
 *      prop at `DEFAULT_ALLOCATION_SCOPE` (initializer-only, pinned in the
 *      dialog suite).
 *   3. THE CHOOSER IS AN ENTRY POINT. It reads the event donation-income
 *      projection, filters that server field for a remainder with a display
 *      comparison, and renders two server figures through `formatMoney` —
 *      no writer, no quote path, no client arithmetic.
 *
 * The scans read the raw source. The presence pins are anchored to the exact
 * code expressions (the mount element is sliced from `<DonationAllocationDialog`
 * to its closing `/>`), and the absence pins cannot be satisfied by removing
 * real code and leaving a comment: the single-path counts are exact file lists,
 * so a stray mention only ever makes the guard fail louder.
 */

const ROOT = resolve(import.meta.dirname, "../..")
const DIALOG_PATH =
  "components/dashboard/finance/donation-allocation-dialog.tsx"
const CHOOSER_PATH =
  "components/dashboard/orders/panels/allocate-donation-to-order.tsx"
const ACTIONS_PATH =
  "components/dashboard/orders/panels/order-actions-panel.tsx"
const SURFACE_PATH = "components/dashboard/orders/order-detail-surface.tsx"

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

/** Every `.ts`/`.tsx` under `app/` and `components/` — the writer-scan scope. */
function appAndComponentSources(): Array<{ path: string; source: string }> {
  const sources: Array<{ path: string; source: string }> = []
  for (const root of ["app", "components"]) {
    for (const entry of readdirSync(resolve(ROOT, root), { recursive: true })) {
      const path = `${root}/${String(entry)}`
      if (!path.endsWith(".ts") && !path.endsWith(".tsx")) continue
      sources.push({ path, source: readSource(path) })
    }
  }
  return sources
}

const sources = appAndComponentSources()
const chooser = readSource(CHOOSER_PATH)
const actions = readSource(ACTIONS_PATH)
const surface = readSource(SURFACE_PATH)
const dialog = readSource(DIALOG_PATH)

function filesMatching(pattern: RegExp): string[] {
  return sources
    .filter(({ source }) => pattern.test(source))
    .map(({ path }) => path)
}

/**
 * The shared editor's JSX mount, from its opening tag to its closing `/>`.
 * Pins read the ELEMENT, so an import line or a comment carrying the same
 * tokens cannot satisfy them.
 */
function editorMount(): string {
  const start = surface.indexOf("<DonationAllocationDialog")
  expect(start, "the surface must mount the shared editor").toBeGreaterThan(-1)
  const end = surface.indexOf("/>", start)
  expect(
    end,
    "the editor mount must close as a self-closing element"
  ).toBeGreaterThan(start)
  return surface.slice(start, end)
}

/**
 * The `orderTargets` derivation, from its declaration to the next effect.
 * A fabricated constant (or a map over anything but the order payload) fails
 * these pins even though the rest of the surface still maps attendees for the
 * attendees panel.
 */
function orderTargetsDerivation(): string {
  const start = surface.indexOf("const orderTargets")
  expect(start, "the surface must derive orderTargets").toBeGreaterThan(-1)
  const end = surface.indexOf("useEffect(", start)
  expect(end).toBeGreaterThan(start)
  return surface.slice(start, end)
}

describe("single allocation code path", () => {
  it("references the writer and the preview from exactly one file — the shared editor", () => {
    expect(filesMatching(/api\.donations\.allocateDonation/)).toEqual([
      DIALOG_PATH,
    ])
    expect(filesMatching(/api\.donations\.previewDonationAllocation/)).toEqual([
      DIALOG_PATH,
    ])
  })

  it("has exactly one submission call site in app/ and components/", () => {
    // The local binding's own call (`allocateDonation({ ... })`) is the only
    // place a plan is submitted. A second component that obtains the mutation
    // under another name still lands here the moment it calls it.
    expect(filesMatching(/\ballocateDonation\s*\(/)).toEqual([DIALOG_PATH])
  })

  it("bans the bracket-access evasion of both identifiers", () => {
    expect(filesMatching(/\[\s*["'`]allocateDonation["'`]\s*\]/)).toEqual([])
    expect(
      filesMatching(/\[\s*["'`]previewDonationAllocation["'`]\s*\]/)
    ).toEqual([])
  })

  it("keeps the chooser, the actions row and the order surface free of the writer", () => {
    for (const path of [CHOOSER_PATH, ACTIONS_PATH, SURFACE_PATH]) {
      const source = readSource(path)
      expect(
        source,
        `${path} must not reference the allocation writer`
      ).not.toContain("api.donations.allocateDonation")
      expect(source, `${path} must not call allocateDonation`).not.toMatch(
        /\ballocateDonation\s*\(/
      )
      expect(source, `${path} must not reference the preview`).not.toContain(
        "api.donations.previewDonationAllocation"
      )
      expect(
        source,
        `${path} must not call previewDonationAllocation`
      ).not.toMatch(/\bpreviewDonationAllocation\s*\(/)
      expect(source, `${path} must not obtain a mutation hook`).not.toContain(
        "useMutation"
      )
    }
  })
})

describe("the order entry — action, chooser and shared editor", () => {
  it("labels the action exactly and exposes the chooser opener", () => {
    expect(actions).toContain("Allocate a donation to this order")
    expect(actions).toContain("onOpenAllocateDialog")
  })

  it("mounts the chooser from the surface with the event scope", () => {
    expect(surface).toContain("<AllocateDonationToOrder")
    expect(surface).toMatch(
      /<AllocateDonationToOrder[\s\S]{0,200}?eventId=\{event\._id\}/
    )
    expect(surface).toContain("isAllocateChooserOpen")
  })

  it("reuses the shared editor, keyed by element namespace, pre-scoped via orderTargets", () => {
    const mount = editorMount()
    // 61-01's invariant: the mount key is namespaced by ELEMENT, never a bare
    // donation id (the collision class that duplicated the record panel).
    expect(mount).toMatch(
      /key=\{`allocation-\$\{allocationDonation\.donationId\}`\}/
    )
    expect(mount).toContain("initialTargets={orderTargets}")
    expect(mount).toContain("donationId={allocationDonation.donationId}")
    expect(mount).toContain("eventId={event._id}")
    // The editor opens only for a chosen donation, and choosing one closes
    // the chooser.
    expect(surface).toMatch(/allocationDonation !== null &&/)
    expect(surface).toMatch(/setIsAllocateChooserOpen\(false\)/)
    expect(surface).toMatch(/setAllocationDonation\(donation\)/)
  })

  it("renders the dialog's own allocation result as the status band", () => {
    expect(surface).toContain('role="status"')
    expect(surface).toMatch(
      /formatMoney\(allocationSuccess\.allocatedTotalMinor, event\.currency\)/
    )
    expect(surface).toMatch(
      /formatMoney\(allocationSuccess\.leftoverMinor, event\.currency\)/
    )
  })
})

describe("pre-scoping derivation", () => {
  it("maps the WHOLE order attendee list, with the order's own booking ref", () => {
    const derivation = orderTargetsDerivation()
    expect(derivation).toMatch(
      /orderPayload\s*\?\s*orderPayload\.attendees\.map\(/
    )
    expect(derivation).toContain(
      'attendeeId: attendee.id as Id<"orderAttendees">'
    )
    expect(derivation).toContain("name: attendee.name")
    expect(derivation).toContain("orderRef: orderPayload.order.bookingRef")
    expect(derivation).toContain("ticketTypeLabel: attendee.ticketTypeLabel")
    // Bound to the payload, not to a constant.
    expect(derivation).toContain("[orderPayload]")
  })

  it("keeps the seeded scope at the editor's whole-order default", () => {
    expect(DEFAULT_ALLOCATION_SCOPE).toBe("whole_order")
    // Absent prop → exactly today's []; present prop → default scope per row.
    expect(dialog).toMatch(/initialTargets\s*\?\?\s*\[\]/)
    expect(dialog).toMatch(/scope:\s*DEFAULT_ALLOCATION_SCOPE/)
  })
})

describe("the chooser is an entry point only", () => {
  it("reads the event donation-income projection and lists only remainders", () => {
    expect(chooser).toContain("getEventDonationIncome")
    expect(chooser).toMatch(/unallocatedRemainderMinor\s*>\s*0/)
    expect(chooser).toContain(
      "formatMoney(donation.donationAmountMinor, currency)"
    )
    expect(chooser).toContain(
      "formatMoney(donation.unallocatedRemainderMinor, currency)"
    )
    expect(chooser).toContain("No donations with an unallocated remainder.")
    expect(chooser).toContain("onSelect(")
    expect(chooser).toContain("Choose")
  })

  it("carries no writer, no quote path and no money arithmetic", () => {
    expect(chooser).not.toContain("useMutation")
    expect(chooser).not.toContain("allocateDonation")
    expect(chooser).not.toContain("previewDonationAllocation")
    expect(chooser).not.toContain(".reduce(")
    expect(chooser).not.toContain("Math.")
    expect(chooser).not.toMatch(/[A-Za-z]Minor\s*[-+*/]/)
    expect(chooser).not.toMatch(/[-+*/]\s*[A-Za-z.]*[Mm]inor/)
  })
})
