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
