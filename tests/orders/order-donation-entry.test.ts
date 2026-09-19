import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

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

function editorMount(): string {
  const start = surface.indexOf("<DonationAllocationDialog")
  expect(start).toBeGreaterThan(-1)
  const end = surface.indexOf("/>", start)
  expect(end).toBeGreaterThan(start)
  return surface.slice(start, end)
}

function orderIdentityDerivation(): string {
  const start = surface.indexOf("const orderIdentity")
  expect(start).toBeGreaterThan(-1)
  const end = surface.indexOf("useEffect(", start)
  expect(end).toBeGreaterThan(start)
  return surface.slice(start, end)
}

describe("single allocation code path", () => {
  it("references preview and commit only from the shared editor", () => {
    expect(filesMatching(/api\.donations\.allocateDonation/)).toEqual([
      DIALOG_PATH,
    ])
    expect(filesMatching(/api\.donations\.previewDonationAllocation/)).toEqual([
      DIALOG_PATH,
    ])
    expect(filesMatching(/\ballocateDonation\s*\(/)).toEqual([DIALOG_PATH])
  })

  it("keeps the chooser, actions row and order surface free of writers", () => {
    for (const path of [CHOOSER_PATH, ACTIONS_PATH, SURFACE_PATH]) {
      const source = readSource(path)
      expect(source).not.toContain("api.donations.allocateDonation")
      expect(source).not.toMatch(/\ballocateDonation\s*\(/)
      expect(source).not.toContain("api.donations.previewDonationAllocation")
      expect(source).not.toMatch(/\bpreviewDonationAllocation\s*\(/)
      expect(source).not.toContain("useMutation")
    }
  })
})

describe("order entry and shared order-first editor", () => {
  it("uses the exact action label and opens the chooser", () => {
    expect(actions).toContain("Add donation to order")
    expect(actions).not.toContain("Allocate a donation to this order")
    expect(actions).toContain("onOpenAllocateDialog")
    expect(surface).toContain("<AllocateDonationToOrder")
    expect(surface).toMatch(
      /<AllocateDonationToOrder[\s\S]{0,200}?eventId=\{event\._id\}/
    )
  })

  it("passes only order-facing identity to the shared editor", () => {
    const mount = editorMount()
    expect(mount).toMatch(
      /key=\{`allocation-\$\{allocationDonation\.donationId\}`\}/
    )
    expect(mount).toContain("initialOrder={orderIdentity}")
    expect(mount).not.toContain("initialTargets")
    expect(mount).not.toContain("attendeeId")
    expect(mount).toContain("donationId={allocationDonation.donationId}")
    expect(mount).toContain("eventId={event._id}")

    const derivation = orderIdentityDerivation()
    expect(derivation).toContain("orderPayload.order.id")
    expect(derivation).toContain("bookingRef: orderPayload.order.bookingRef")
    expect(derivation).toContain(
      "providerOrderId: orderPayload.order.providerOrderId"
    )
    expect(derivation).toContain("bookerName: orderPayload.order.bookerName")
    expect(derivation).toContain("bookerEmail: orderPayload.order.bookerEmail")
    expect(derivation).not.toContain("attendeeId")
    expect(surface).not.toContain("orderTargets")
    expect(surface).toContain('row.scope === "whole_order"')
    expect(surface).toContain('"Whole-order credit"')
  })

  it("keeps the chooser as a money-read-only entry point", () => {
    expect(chooser).toContain("getEventDonationIncome")
    expect(chooser).toMatch(/unallocatedRemainderMinor\s*>\s*0/)
    expect(chooser).toContain("formatMoney(donation.donationAmountMinor, currency)")
    expect(chooser).toContain(
      "formatMoney(donation.unallocatedRemainderMinor, currency)"
    )
    expect(chooser).toContain("onSelect(")
    expect(chooser).not.toContain("useMutation")
    expect(chooser).not.toContain("previewDonationAllocation")
    expect(chooser).not.toMatch(/[A-Za-z]Minor\s*[-+*/]/)
    expect(chooser).not.toMatch(/[-+*/]\s*[A-Za-z.]*[Mm]inor/)
  })
})
