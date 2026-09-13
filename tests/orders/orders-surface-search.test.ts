import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const source = readFileSync(resolve(import.meta.dirname, "../../components/dashboard/orders/orders-surface.tsx"), "utf8")

describe("OrdersSurface server search lifecycle", () => {
  it("sends applied search and opaque cursor without local filtering", () => {
    expect(source).toContain('query.set("search", appliedSearch.trim())')
    expect(source).toContain('query.set("searchCursor", searchCursor)')
    expect(source).not.toContain("payload?.rows.filter")
    expect(source).toContain("setSearchCursor(null)")
    expect(source).toContain("setCursorHistory([])")
  })

  it("debounces search independently from the filter form", () => {
    expect(source).toContain("SEARCH_DEBOUNCE_MS = 300")
    expect(source).toContain("window.setTimeout")
    expect(source).toContain("window.clearTimeout(timeout)")
    expect(source).not.toContain("setAppliedSearch(searchInput)")
  })

  it("guards every request lifecycle state write and aborts superseded work", () => {
    expect(source).toContain("requestSequence")
    expect(source).toContain("new AbortController()")
    expect(source).toContain("sequence === requestSequence.current")
    expect(source).toContain("controller.abort()")
  })

  it("keeps cursor totals nullable and preserves canonical detail links/retry states", () => {
    expect(source).toContain("totalRows: number | null")
    expect(source).toContain("payload.page.hasNextPage")
    expect(source).toContain("/dashboard/events/${slug}/orders/${row.orderId}")
    expect(source).toContain('onRetry={() => setLoadAttempt')
    expect(source).toContain('state="empty"')
  })
})
