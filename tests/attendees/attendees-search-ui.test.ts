import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const source = readFileSync(resolve(import.meta.dirname, "../../app/dashboard/events/[slug]/attendees/page.tsx"), "utf8")

describe("event attendees search UI", () => {
  it("uses the authenticated server route with applied values and cursor navigation", () => {
    expect(source).toContain("/api/dashboard/attendees?")
    expect(source).toContain('query.set("search", appliedSearch.trim())')
    expect(source).toContain('query.set("searchCursor", searchCursor)')
    expect(source).toContain("setCursorHistory([])")
  })

  it("debounces search independently from event and date filters", () => {
    expect(source).toContain("SEARCH_DEBOUNCE_MS = 300")
    expect(source).toContain("window.setTimeout")
    expect(source).toContain("window.clearTimeout(timeout)")
    expect(source).not.toContain("setAppliedSearch(searchInput)")
  })

  it("protects loading, errors, and payloads from stale requests", () => {
    expect(source).toContain("requestSequence")
    expect(source).toContain("new AbortController()")
    expect(source).toContain("sequence === requestSequence.current")
    expect(source).toContain("controller.abort()")
    expect(source).toContain('state="error"')
    expect(source).toContain('state="empty"')
    expect(source).toContain("onRetry")
  })

  it("does not fabricate totals when cursor pagination is active", () => {
    expect(source).toContain("totalRows: number | null")
    expect(source).toContain("totalRows === null")
    expect(source).toContain("hasNextPage")
  })
})
