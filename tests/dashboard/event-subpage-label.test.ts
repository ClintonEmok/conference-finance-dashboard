import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { resolveEventSubpageLabel } from "@/lib/dashboard/event-subpage-label"

const ROOT = resolve(import.meta.dirname, "../..")
const EVENT_ROOT = "/dashboard/events/divine-redesign"

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

/**
 * Removes block and line comments before a presence scan. Without this, a doc
 * comment naming the anchor satisfies a pin even when the wiring is gone (the
 * decoy-comment probe); a label guard must never be satisfiable by a comment.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*$/gm, "")
}

describe("event sidebar sub-labels are for humans (D-08)", () => {
  it("maps the known meaningful segments to human labels", () => {
    expect(
      resolveEventSubpageLabel(`${EVENT_ROOT}/attendees`, EVENT_ROOT)
    ).toBe("Attendees")
    expect(
      resolveEventSubpageLabel(`${EVENT_ROOT}/reconciliation`, EVENT_ROOT)
    ).toBe("Reconciliation")
    expect(resolveEventSubpageLabel(`${EVENT_ROOT}/payments`, EVENT_ROOT)).toBe(
      "Payments"
    )
    expect(resolveEventSubpageLabel(`${EVENT_ROOT}/orders`, EVENT_ROOT)).toBe(
      "Orders"
    )
    expect(
      resolveEventSubpageLabel(
        `${EVENT_ROOT}/accommodation/allocation`,
        EVENT_ROOT
      )
    ).toBe("Accommodation")
  })

  it("keeps the settings and accommodation sub-routes labelled", () => {
    expect(
      resolveEventSubpageLabel(
        `${EVENT_ROOT}/settings/sources`,
        `${EVENT_ROOT}/settings`
      )
    ).toBe("Sources")
    expect(
      resolveEventSubpageLabel(
        `${EVENT_ROOT}/accommodation/hotels`,
        `${EVENT_ROOT}/accommodation`
      )
    ).toBe("Hotels & Rooms")
    expect(
      resolveEventSubpageLabel(
        `${EVENT_ROOT}/accommodation/upgrades-options`,
        `${EVENT_ROOT}/accommodation`
      )
    ).toBe("Upgrades & Options")
  })

  it("suppresses raw order, attendee, donation, and room identifiers", () => {
    expect(
      resolveEventSubpageLabel(
        `${EVENT_ROOT}/orders/ph7dxxr9sebg2bc6x4vpk664mn8e9d2d`,
        `${EVENT_ROOT}/orders`
      )
    ).toBeNull()
    expect(
      resolveEventSubpageLabel(
        `${EVENT_ROOT}/attendees/p575s0khrnzt227e520dcastn8e8p23`,
        `${EVENT_ROOT}/attendees`
      )
    ).toBeNull()
    expect(
      resolveEventSubpageLabel(
        `${EVENT_ROOT}/donations/kd732ppby1109g4a461e35w3gs8em7a9`,
        `${EVENT_ROOT}/donations`
      )
    ).toBeNull()
    expect(
      resolveEventSubpageLabel(
        `${EVENT_ROOT}/accommodation/rooms/kd70mc1d7nxx7kv3h95f6kzyr18em6ye`,
        `${EVENT_ROOT}/accommodation/allocation`
      )
    ).toBeNull()
  })

  it("suppresses unknown segments instead of uppercasing them", () => {
    expect(
      resolveEventSubpageLabel(`${EVENT_ROOT}/not-a-real-id`, EVENT_ROOT)
    ).toBeNull()
    expect(
      resolveEventSubpageLabel(
        `${EVENT_ROOT}/orders/some-future-branch`,
        `${EVENT_ROOT}/orders`
      )
    ).toBeNull()
    expect(
      resolveEventSubpageLabel(`${EVENT_ROOT}/ZZZ999`, EVENT_ROOT)
    ).toBeNull()
  })

  it("only considers paths genuinely below the item's own destination", () => {
    expect(
      resolveEventSubpageLabel(`${EVENT_ROOT}/orders`, `${EVENT_ROOT}/orders`)
    ).toBeNull()
    expect(
      resolveEventSubpageLabel(`${EVENT_ROOT}/orders/`, `${EVENT_ROOT}/orders`)
    ).toBeNull()
    expect(
      resolveEventSubpageLabel("/dashboard/events/other/orders", EVENT_ROOT)
    ).toBeNull()
    expect(resolveEventSubpageLabel("", EVENT_ROOT)).toBeNull()
  })

  it("derives the sub-label through the allow-list helper", () => {
    const layout = stripComments(
      readSource("app/dashboard/events/[slug]/layout.tsx")
    )

    expect(layout).toContain("resolveEventSubpageLabel(pathname, item.href)")
  })

  it("never renders or re-derives a raw segment in the layout", () => {
    const raw = readSource("app/dashboard/events/[slug]/layout.tsx")

    // The raw segment must never be rendered or re-derived in the layout...
    expect(raw).not.toMatch(/\{subpage\}/)
    expect(raw).not.toMatch(/\/\{subpage\}/)
    expect(raw).not.toContain('.split("/")[0]')
    // ...and the human label paints in the item AND in its tooltip.
    const layout = stripComments(raw)
    expect(layout.match(/\{subpageLabel\}/g) ?? []).toHaveLength(2)
  })
})
