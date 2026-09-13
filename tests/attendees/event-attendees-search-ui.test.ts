import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const source = readFileSync(resolve(import.meta.dirname, "../../app/dashboard/events/[slug]/attendees/page.tsx"), "utf8")

describe("event attendees server search UI", () => {
  it("sends explicit event scope and relies on the server all-time contract", () => {
    expect(source).toContain('new URLSearchParams({ eventId: event._id, pageSize: "25" })')
    expect(source).toContain("/api/dashboard/attendees?")
    expect(source).not.toContain("getAttendeesForEvent")
    expect(source).not.toContain("from:")
    expect(source).not.toContain("to:")
  })

  it("uses applied search, exact cursors, and stale-request protection", () => {
    expect(source).toContain("SEARCH_DEBOUNCE_MS = 300")
    expect(source).toContain("window.setTimeout")
    expect(source).toContain("window.clearTimeout(timeout)")
    expect(source).toContain('query.set("searchCursor", searchCursor)')
    expect(source).not.toContain("Apply search")
    expect(source).toContain("requestSequence")
    expect(source).toContain("new AbortController()")
    expect(source).toContain("sequence === requestSequence.current")
  })

  it("retains grouping, manual actions, detail links, and retryable states", () => {
    expect(source).toContain("familyGroups")
    expect(source).toContain("Assign family")
    expect(source).toContain("/dashboard/events/${slug}/attendees/${attendee._id}")
    expect(source).toContain('state="error"')
    expect(source).toContain('state="empty"')
    expect(source).toContain("onRetry")
  })
})
