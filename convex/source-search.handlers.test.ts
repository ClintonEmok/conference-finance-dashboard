/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest } from "convex-test"
import schema from "./schema"
import {
  buildSearchHaystack,
  collectSourceSearchPage,
  decodeSearchCursor,
  encodeSearchCursor,
  matchesNormalizedSearch,
  normalizeSearchText,
  requireSearchNeedle,
  type SourceSearchFetchedPage,
  type SourceSearchPage,
} from "./search"

const modules = import.meta.glob("./**/*.ts")

type PositionedItem = { position: number }
type FetchLogEntry = { cursor: string | null; limit: number }

/**
 * Deterministic fake source over `total` 1-based positions. The cursor is
 * the number of consumed candidates, so resuming with a returned cursor
 * continues exactly where the previous fetch stopped. Every fetch is logged
 * so tests can assert the collector's requested limits directly.
 */
function makeSource(total: number, matchesAt: (position: number) => boolean) {
  const fetchLog: FetchLogEntry[] = []
  const fetchPage = async (
    cursor: string | null,
    limit: number
  ): Promise<SourceSearchFetchedPage<PositionedItem>> => {
    fetchLog.push({ cursor, limit })
    const start = cursor === null ? 0 : Number(cursor)
    const items: PositionedItem[] = []
    for (
      let offset = 0;
      offset < limit && start + offset < total;
      offset += 1
    ) {
      items.push({ position: start + offset + 1 })
    }
    const next = start + items.length
    const isDone = next >= total
    return { items, continueCursor: isDone ? null : String(next), isDone }
  }
  return { fetchPage, fetchLog, total, matchesAt }
}

function positions(rows: PositionedItem[]) {
  return rows.map((row) => row.position)
}

/** Drive the collector to `isDone`, capturing every result page and that call's fetch-log slice. */
async function collectAll(
  source: ReturnType<typeof makeSource>,
  options: {
    pageSize: number
    scanCap?: number
    fetchBatch?: number
    matches?: (item: PositionedItem) => boolean | Promise<boolean>
  }
) {
  const matches =
    options.matches ??
    ((item: PositionedItem) => source.matchesAt(item.position))
  const pages: Array<SourceSearchPage<PositionedItem>> = []
  const logs: FetchLogEntry[][] = []
  let cursor: string | null = null
  let isDone = false
  let guard = 0
  while (!isDone) {
    const before = source.fetchLog.length
    const page: SourceSearchPage<PositionedItem> =
      await collectSourceSearchPage({
        fetchPage: source.fetchPage,
        matches,
        pageSize: options.pageSize,
        cursor,
        scanCap: options.scanCap ?? 10_000,
        fetchBatch: options.fetchBatch,
      })
    logs.push(source.fetchLog.slice(before))
    pages.push(page)
    cursor = page.continueCursor
    isDone = page.isDone
    guard += 1
    if (guard > 200) throw new Error("collectAll runaway: isDone never arrived")
  }
  return { pages, logs }
}

// ---------------------------------------------------------------------------
// Task 1 — the folded normaliser, the substring matcher, and the cursor codec
// ---------------------------------------------------------------------------

test("normalizeSearchText folds case, whitespace, punctuation, and diacritics into one shared form", () => {
  expect(normalizeSearchText("  Oliver   Vos ")).toBe("olivervos")
  expect(normalizeSearchText("oliver.vos")).toBe("olivervos")
  expect(normalizeSearchText("Olivér Vós")).toBe("olivervos")
  expect(normalizeSearchText("VOS")).toBe("vos")
  expect(normalizeSearchText("BK-FAMILY-VOS")).toBe("bkfamilyvos")
  expect(normalizeSearchText("Oliver.Vos@Example.COM")).toBe(
    "olivervosexamplecom"
  )
  expect(normalizeSearchText("")).toBe("")
  expect(normalizeSearchText("--- ... ---")).toBe("")
  expect(normalizeSearchText(null)).toBe("")
  expect(normalizeSearchText(undefined)).toBe("")
})

test("the 512-character cap applies to the needle only — a long haystack field folds without throwing", () => {
  const at512 = "a".repeat(512)
  expect(requireSearchNeedle(at512)).toBe(at512)
  expect(() => requireSearchNeedle("a".repeat(513))).toThrow(/exceeds 512/)
  expect(() => requireSearchNeedle("...".repeat(200))).toThrow(/exceeds 512/)

  const longField = `${"x".repeat(600)} target`
  expect(() => normalizeSearchText(longField)).not.toThrow()
  expect(normalizeSearchText(longField)).toHaveLength(606)
  const haystack = buildSearchHaystack([longField, "Oliver Vos"])
  expect(matchesNormalizedSearch(haystack, requireSearchNeedle("target"))).toBe(
    true
  )
  expect(
    matchesNormalizedSearch(haystack, requireSearchNeedle("olivervos"))
  ).toBe(true)
})

test("substring matching reaches mid-word fragments and punctuation-agnostic typing (D-02)", () => {
  expect(matchesNormalizedSearch("...olivervos...", "vos")).toBe(true)
  expect(
    matchesNormalizedSearch(
      normalizeSearchText("family"),
      requireSearchNeedle("amil")
    )
  ).toBe(true)
  expect(
    matchesNormalizedSearch(
      normalizeSearchText("Oliver Vos"),
      requireSearchNeedle("OLIVER VOS")
    )
  ).toBe(true)
  expect(
    matchesNormalizedSearch(
      normalizeSearchText("oliver.vos@example.com"),
      requireSearchNeedle("Oliver.Vos@Example.COM")
    )
  ).toBe(true)
  expect(
    matchesNormalizedSearch(
      normalizeSearchText("oliver.vos@example.com"),
      requireSearchNeedle("vos@example")
    )
  ).toBe(true)
})

test("every haystack part folds through the same normaliser", () => {
  const haystack = buildSearchHaystack([
    "Oliver Vos",
    "oliver.vos@example.com",
    "BK-FAMILY-VOS",
    undefined,
  ])
  expect(haystack).toBe("olivervos olivervosexamplecom bkfamilyvos")
  for (const fragment of [
    "oliver",
    "vos",
    "bkfamilyvos",
    "examplecom",
    "olivervosexamplecom",
  ]) {
    expect(
      matchesNormalizedSearch(haystack, requireSearchNeedle(fragment))
    ).toBe(true)
  }
})

test("an empty needle browses; a punctuation-only needle folds to the empty needle", () => {
  const haystack = buildSearchHaystack(["Oliver Vos"])
  expect(matchesNormalizedSearch(haystack, "")).toBe(true)
  expect(matchesNormalizedSearch(haystack, requireSearchNeedle("..."))).toBe(
    true
  )
  expect(matchesNormalizedSearch("", requireSearchNeedle("vos"))).toBe(false)
  expect(matchesNormalizedSearch("", "")).toBe(true)
})

test("the cursor codec round-trips and stays signature-bound", () => {
  expect(
    decodeSearchCursor(
      encodeSearchCursor("kind=order&event=e1&q=vos", "opaque:cursor")
    )
  ).toEqual({
    signature: "kind=order&event=e1&q=vos",
    cursor: "opaque:cursor",
  })
  expect(decodeSearchCursor(encodeSearchCursor("sig", null))).toEqual({
    signature: "sig",
    cursor: null,
  })
  const hostile = 'a"b+c/d=e&f'
  expect(decodeSearchCursor(encodeSearchCursor("sig", hostile))).toEqual({
    signature: "sig",
    cursor: hostile,
  })
  // Signature binding is the caller's comparison; decoding a different
  // signature is not an error, it is a mismatch the caller must reject.
  expect(decodeSearchCursor(encodeSearchCursor("other", null)).signature).toBe(
    "other"
  )
  for (const malformed of [
    "not-a-cursor",
    "ss1:%",
    "ss1:null",
    "ss1:" +
      encodeURIComponent(
        JSON.stringify({ v: 2, signature: "s", cursor: null })
      ),
    "ss1:" +
      encodeURIComponent(JSON.stringify({ v: 1, signature: 42, cursor: null })),
    "ss1:" +
      encodeURIComponent(JSON.stringify({ v: 1, signature: "s", cursor: 42 })),
    "ss1:" + encodeURIComponent(JSON.stringify({ v: 1, signature: "s" })),
  ]) {
    expect(() => decodeSearchCursor(malformed)).toThrow(/Invalid search cursor/)
  }
})

test("the legacy projection apparatus stays exported for 62-04 to retire (delete this case in 62-04)", async () => {
  const search = await import("./search")
  const legacyExports: Array<keyof typeof search> = [
    "paginateSearchDocuments",
    "maintainOrderSearchProjection",
    "upsertOrderSearchDocument",
    "upsertAttendeeSearchDocument",
    "deleteSearchProjection",
    "refreshAttendeeSearchDocumentsForOrder",
    "refreshAttendeeSearchDocumentsForTicketType",
    "refreshAttendeeSearchDocumentsForFamily",
    "enqueueSearchProjectionFanout",
    "startSearchProjectionFanout",
    "continueSearchProjectionFanout",
    "SearchProjectionBlocked",
  ]
  for (const name of legacyExports) {
    expect(search[name], `legacy export ${name}`).toBeDefined()
  }
})

// ---------------------------------------------------------------------------
// Task 2 — collectSourceSearchPage: boundary, cap, resume, and async proofs
// ---------------------------------------------------------------------------

test("collector: fills a page at a fetched-page boundary and resumes with the union exactly once", async () => {
  const pageSize = 5
  const fetchBatch = 3
  const source = makeSource(120, (position) => position % 10 === 0)
  const { pages, logs } = await collectAll(source, { pageSize, fetchBatch })

  expect(positions(pages[0].rows)).toEqual([10, 20, 30, 40, 50])
  expect(pages[0].isDone).toBe(false)
  expect(pages[0].continueCursor).not.toBeNull()
  expect(pages[0].scanned).toBe(50)

  const final = pages[pages.length - 1]
  expect(final.isDone).toBe(true)
  expect(final.continueCursor).toBeNull()

  const union = pages.flatMap((page) => positions(page.rows))
  expect(union).toEqual(
    Array.from({ length: 12 }, (_, index) => (index + 1) * 10)
  )
  expect(new Set(union).size).toBe(union.length)

  // The no-overshoot invariant itself, replayed over the fetch log: every
  // requested limit is at most the remaining need at that moment. A
  // fixed-size fetch ignoring `pageSize - matched` fails here.
  pages.forEach((_, callIndex) => {
    let matched = 0
    for (const entry of logs[callIndex]) {
      expect(entry.limit).toBeGreaterThanOrEqual(1)
      expect(entry.limit).toBeLessThanOrEqual(
        Math.min(fetchBatch, pageSize - matched)
      )
      const start = entry.cursor === null ? 0 : Number(entry.cursor)
      const returned = Math.max(0, Math.min(entry.limit, source.total - start))
      for (let offset = 0; offset < returned; offset += 1) {
        if (source.matchesAt(start + offset + 1)) matched += 1
      }
    }
  })
})

test("collector: an internal fetch can never exceed the remaining need (overshoot would skip matches)", async () => {
  const source = makeSource(10, () => true)
  const { pages } = await collectAll(source, { pageSize: 3, fetchBatch: 5 })
  expect(pages.flatMap((page) => positions(page.rows))).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ])
  for (const page of pages) {
    expect(page.rows.length).toBeLessThanOrEqual(3)
  }
})

test("collector: sparse matches still fill the page (no post-pagination undersizing)", async () => {
  const source = makeSource(60, (position) => position >= 58)
  const { pages } = await collectAll(source, { pageSize: 2 })
  expect(pages).toHaveLength(2)
  expect(positions(pages[0].rows)).toEqual([58, 59])
  expect(pages[0].isDone).toBe(false)
  expect(pages[0].continueCursor).not.toBeNull()
  expect(positions(pages[1].rows)).toEqual([60])
  expect(pages[1].isDone).toBe(true)
  expect(pages[1].continueCursor).toBeNull()
})

test("collector: hitting the scan cap yields a partial page whose cursor resumes to the match", async () => {
  const source = makeSource(100, (position) => position === 100)
  const matches = (item: PositionedItem) => source.matchesAt(item.position)
  const first = await collectSourceSearchPage({
    fetchPage: source.fetchPage,
    matches,
    pageSize: 1,
    cursor: null,
    scanCap: 50,
  })
  expect(first.rows).toEqual([])
  expect(first.isDone).toBe(false)
  expect(first.continueCursor).not.toBeNull()
  expect(first.scanned).toBe(50)

  const second = await collectSourceSearchPage({
    fetchPage: source.fetchPage,
    matches,
    pageSize: 1,
    cursor: first.continueCursor,
    scanCap: 50,
  })
  expect(positions(second.rows)).toEqual([100])
  expect(second.isDone).toBe(true)
  expect(second.continueCursor).toBeNull()
  expect(second.scanned).toBe(50)
  expect([...positions(first.rows), ...positions(second.rows)]).toEqual([100])
})

test("collector: an exact fill on a middle page resumes with no duplicates", async () => {
  const source = makeSource(10, () => true)
  const { pages } = await collectAll(source, { pageSize: 4, fetchBatch: 2 })
  expect(pages.map((page) => positions(page.rows))).toEqual([
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10],
  ])
  expect(pages.map((page) => page.isDone)).toEqual([false, false, true])
  expect(pages[0].continueCursor).not.toBeNull()
  expect(pages[1].continueCursor).not.toBeNull()
  expect(pages[2].continueCursor).toBeNull()
})

test("collector: an async predicate is awaited in order and its false results do not count", async () => {
  const source = makeSource(6, () => true)
  const seen: number[] = []
  const page = await collectSourceSearchPage({
    fetchPage: source.fetchPage,
    matches: async (item) => {
      await Promise.resolve()
      seen.push(item.position)
      return item.position % 2 === 0
    },
    pageSize: 4,
    cursor: null,
    scanCap: 100,
    fetchBatch: 2,
  })
  expect(seen).toEqual([1, 2, 3, 4, 5, 6])
  expect(positions(page.rows)).toEqual([2, 4, 6])
  expect(page.isDone).toBe(true)
  expect(page.scanned).toBe(6)
})

test("collector: a throwing predicate propagates", async () => {
  const source = makeSource(6, () => true)
  await expect(
    collectSourceSearchPage({
      fetchPage: source.fetchPage,
      matches: (item) => {
        if (item.position === 3) throw new Error("predicate exploded")
        return true
      },
      pageSize: 4,
      cursor: null,
      scanCap: 100,
      fetchBatch: 2,
    })
  ).rejects.toThrow("predicate exploded")
})

test("collector: validates page size and scan cap, accepting the 1_000 ceiling", async () => {
  const source = makeSource(0, () => true)
  const base = {
    fetchPage: source.fetchPage,
    matches: () => true,
    cursor: null,
    scanCap: 10,
  }
  await expect(
    collectSourceSearchPage({ ...base, pageSize: 0 })
  ).rejects.toThrow("Invalid source search page size.")
  await expect(
    collectSourceSearchPage({ ...base, pageSize: 1_001 })
  ).rejects.toThrow("Invalid source search page size.")
  await expect(
    collectSourceSearchPage({ ...base, pageSize: 2.5 })
  ).rejects.toThrow("Invalid source search page size.")
  await expect(
    collectSourceSearchPage({ ...base, pageSize: 4, scanCap: 0 })
  ).rejects.toThrow("Invalid source search scan cap.")

  const accepted = await collectSourceSearchPage({ ...base, pageSize: 1_000 })
  expect(accepted.rows).toEqual([])
  expect(accepted.isDone).toBe(true)
  expect(accepted.continueCursor).toBeNull()
})

test("collector: a source returning empty non-final pages stops instead of spinning", async () => {
  let calls = 0
  const page = await collectSourceSearchPage({
    fetchPage: async (
      cursor: string | null
    ): Promise<SourceSearchFetchedPage<PositionedItem>> => {
      calls += 1
      return { items: [], isDone: false, continueCursor: cursor ?? "c1" }
    },
    matches: () => true,
    pageSize: 5,
    cursor: null,
    scanCap: 100,
  })
  expect(calls).toBe(4)
  expect(page.rows).toEqual([])
  expect(page.isDone).toBe(false)
  expect(page.continueCursor).toBe("c1")
  expect(page.scanned).toBe(0)
})

test("collector: composes with real paginate cursors across resumes", async () => {
  const t = convexTest(schema, modules)
  const orderId = await t.run(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      slug: "source-search-integration",
      title: "Source Search Integration",
      startsAt: 1,
      timezone: "UTC",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: false,
      primarySourceKind: "internal",
      updatedAt: 1,
    })
    const order = await ctx.db.insert("orders", {
      eventId,
      source: "internal",
      bookingRef: "BK-SOURCE-SEARCH",
      bookerName: "Booker",
      submittedAt: 1,
      status: "pending",
    })
    for (let index = 1; index <= 12; index += 1) {
      await ctx.db.insert("orderAttendees", {
        orderId: order,
        attendeeKey: `attendee-${index}`,
        name: index % 4 === 0 ? `Match ${index}` : `Other ${index}`,
        gender: "unknown",
        sortOrder: index,
      })
    }
    return order
  })

  const fetchPage = async (
    cursor: string | null,
    limit: number
  ): Promise<SourceSearchFetchedPage<{ name: string }>> => {
    const result = await t.run(async (ctx) =>
      ctx.db
        .query("orderAttendees")
        .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
        .paginate({ numItems: limit, cursor })
    )
    return {
      items: result.page.map((row) => ({ name: row.name })),
      continueCursor: result.isDone ? null : result.continueCursor,
      isDone: result.isDone,
    }
  }

  const first = await collectSourceSearchPage({
    fetchPage,
    matches: (item) => item.name.startsWith("Match"),
    pageSize: 2,
    cursor: null,
    scanCap: 50,
    fetchBatch: 3,
  })
  expect(first.isDone).toBe(false)
  expect(first.continueCursor).not.toBeNull()

  const second = await collectSourceSearchPage({
    fetchPage,
    matches: (item) => item.name.startsWith("Match"),
    pageSize: 2,
    cursor: first.continueCursor,
    scanCap: 50,
    fetchBatch: 3,
  })
  expect([...first.rows, ...second.rows].map((row) => row.name)).toEqual([
    "Match 4",
    "Match 8",
    "Match 12",
  ])
  expect(second.isDone).toBe(true)
  expect(second.continueCursor).toBeNull()
})
