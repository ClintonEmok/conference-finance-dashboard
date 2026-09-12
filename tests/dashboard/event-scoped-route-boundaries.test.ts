import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "../..")

function readRoute(relativePath: string) {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

function collectTsx(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? collectTsx(path) : path.endsWith(".tsx") ? [path] : []
  })
}

describe("event-scoped dashboard route boundaries", () => {
  it("disables root-level event operation pages", () => {
    for (const route of [
      "app/dashboard/attendees/page.tsx",
      "app/dashboard/attendees/[attendeeId]/page.tsx",
      "app/dashboard/accommodation/page.tsx",
      "app/dashboard/accommodation/[event-slug]/page.tsx",
      "app/dashboard/accommodation/inventory/page.tsx",
      "app/dashboard/accommodation/rooms/[roomId]/page.tsx",
      "app/dashboard/orders/page.tsx",
      "app/dashboard/orders/[orderId]/page.tsx",
      "app/dashboard/manage-orders/page.tsx",
      "app/dashboard/manage-orders/[orderId]/page.tsx",
      "app/dashboard/payments/page.tsx",
      "app/dashboard/financial/page.tsx",
      "app/dashboard/reconciliation/page.tsx",
      "app/dashboard/reconciliation/payments/page.tsx",
    ]) {
      expect(readRoute(route), route).toContain("notFound()")
    }
  })

  it("keeps the attendee list and detail under the event slug", () => {
    const list = readRoute("app/dashboard/events/[slug]/attendees/page.tsx")
    const detail = readRoute("app/dashboard/events/[slug]/attendees/[attendeeId]/page.tsx")

    expect(list).toContain("/api/dashboard/attendees?")
    expect(list).toContain("/dashboard/events/${slug}/attendees/${attendee._id}")
    expect(detail).toContain('from "@/components/dashboard/attendee-detail-surface"')
  })

  it("does not leave root-level event destinations in dashboard navigation code", () => {
    const rootLevelDestination = /["'`]\/dashboard\/(?:attendees|accommodation|orders|manage-orders|payments|financial|reconciliation)(?:[/?!"'`]|$)/
    const sourceFiles = [
      ...collectTsx(resolve(ROOT, "app/dashboard/events")),
      ...collectTsx(resolve(ROOT, "components")),
    ]

    for (const path of sourceFiles) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(rootLevelDestination)
    }
  })
})
