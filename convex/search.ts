// ---------------------------------------------------------------------------
// Source-table search primitives (Phase 62 Stage 1)
//
// Search reads the tables that hold the truth. This module contains no
// derived-projection maintenance of any kind; the retired projection
// apparatus is not part of this contract.
//
// (a) Why substring is code-side: the Convex query filter API exposes only
// `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `not`, `and`, `or`, and `field` —
// there is no `contains`/`includes`/`like`/`startsWith`/regex. Matching a
// mid-word fragment (`amil` inside `family`) is therefore necessarily a
// code-side `String.includes` over a bounded fetch.
//
// (b) One fold, both sides: `normalizeSearchText` is applied to every
// haystack part (through `buildSearchHaystack`) and to the typed needle
// (through `requireSearchNeedle`), so no consumer re-implements
// normalisation. The 512-character cap belongs to the NEEDLE only:
// haystack fields can be arbitrarily long (notably `payments.notes`), and
// `normalizeSearchText` must never throw on length — a long field should
// merely fail to match, never abort the whole query.
//
// (c) The cursor codec is signature-bound: `encodeSearchCursor` embeds the
// request signature (filters + page size) opaquely, and callers must reject
// a decoded cursor whose signature differs from the current request, so a
// stale cursor can never resume against different filters.
//
// The no-overshoot invariant (the collector): `collectSourceSearchPage`
// fetches `limit = min(fetchBatch, pageSize - matchedSoFar)` candidates per
// internal page and consumes the whole fetched page before advancing the
// cursor. Reaching `pageSize` matches inside a page is therefore possible
// only when every candidate of that page matched, which means the collector
// stops exactly on a fetched-page boundary. There is no mid-page stop, so
// no candidate is skipped at a boundary and none is returned twice across
// resumptions. A fixed (larger) fetch size can overshoot the target
// mid-page, and returning a page-level cursor then skips the unconsumed
// candidates — recall loss. Do not "optimise" the limit away.
// ---------------------------------------------------------------------------

export const MAX_SOURCE_SEARCH_LENGTH = 512
/** Hard ceiling for one source-search result page. Consumers keep their own smaller caps (orders 200, ledger 100, payments 500). */
export const SOURCE_SEARCH_PAGE_MAX = 1_000
/** Default number of candidates fetched per internal source page. */
export const SOURCE_SEARCH_FETCH_BATCH = 200

/**
 * The one fold for BOTH sides of a match: trim → NFKD decomposition →
 * strip combining marks (diacritics) → lowercase → drop every character
 * that is not a letter or a number. `"Oliver Vos"`, `"oliver.vos"`,
 * `"OLIVER VOS"` and `"Olivér Vós"` all fold to `"olivervos"`.
 *
 * Never throws on length: this function is mapped over haystack fields.
 * The 512-character cap is applied to the NEEDLE by `requireSearchNeedle`.
 */
export function normalizeSearchText(value: string | null | undefined): string {
  const raw = value?.trim() ?? ""
  return raw
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
}

/**
 * Validate and fold a typed search query. `MAX_SOURCE_SEARCH_LENGTH` caps
 * the query only — never a haystack field (see `buildSearchHaystack`).
 */
export function requireSearchNeedle(value: string | null | undefined): string {
  const raw = value?.trim() ?? ""
  if (raw.length > MAX_SOURCE_SEARCH_LENGTH) {
    throw new Error(
      `Search input exceeds ${MAX_SOURCE_SEARCH_LENGTH} characters.`
    )
  }
  return normalizeSearchText(raw)
}

/**
 * Fold every part through `normalizeSearchText`, drop the empties, and join
 * with a single space so text from one field cannot silently span into the
 * next. Applies no length cap: a long field merely contributes a long,
 * unmatchable segment instead of throwing the whole query.
 */
export function buildSearchHaystack(
  parts: ReadonlyArray<string | null | undefined>
): string {
  return parts
    .map((part) => normalizeSearchText(part))
    .filter(Boolean)
    .join(" ")
}

/**
 * Mid-word substring match over already-folded text. An empty needle
 * matches everything (browse); punctuation-only input folds to the empty
 * needle and therefore also browses.
 */
export function matchesNormalizedSearch(
  haystack: string,
  needle: string
): boolean {
  return needle === "" || haystack.includes(needle)
}

const SOURCE_SEARCH_CURSOR_PREFIX = "ss1:"

/**
 * Wrap an internal pagination cursor together with the request signature it
 * belongs to. Callers must compare the decoded signature against the
 * current request's signature and reject a mismatch.
 */
export function encodeSearchCursor(
  signature: string,
  cursor: string | null
): string {
  return `${SOURCE_SEARCH_CURSOR_PREFIX}${encodeURIComponent(JSON.stringify({ v: 1, signature, cursor }))}`
}

/** Decode `encodeSearchCursor` output; throws `Invalid search cursor.` on any malformed payload. */
export function decodeSearchCursor(raw: string): {
  signature: string
  cursor: string | null
} {
  if (!raw.startsWith(SOURCE_SEARCH_CURSOR_PREFIX)) {
    throw new Error("Invalid search cursor.")
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(
      decodeURIComponent(raw.slice(SOURCE_SEARCH_CURSOR_PREFIX.length))
    )
  } catch {
    throw new Error("Invalid search cursor.")
  }
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("Invalid search cursor.")
  }
  const payload = parsed as {
    v?: unknown
    signature?: unknown
    cursor?: unknown
  }
  if (payload.v !== 1 || typeof payload.signature !== "string") {
    throw new Error("Invalid search cursor.")
  }
  const cursor = payload.cursor
  if (cursor !== null && typeof cursor !== "string") {
    throw new Error("Invalid search cursor.")
  }
  return { signature: payload.signature, cursor }
}

/**
 * Cursor for a manual `_creationTime`-boundary scan.
 *
 * Convex allows only ONE paginated query per function execution, so a
 * `fetchPage` that is called more than once cannot use `.paginate()`: the
 * second call throws "ran multiple paginated queries". A scanner therefore
 * uses `.take()` and carries its own cursor, which is the last consumed
 * `_creationTime` plus the ids consumed at that timestamp (`ids`), so
 * candidates sharing a timestamp are neither skipped nor returned twice.
 */
export interface SourceScanBoundary {
  t: number
  ids: string[]
}

const SOURCE_SCAN_BOUNDARY_MAX_IDS = 16_000

export function encodeSourceScanBoundary(t: number, ids: string[]): string {
  return JSON.stringify({ t, ids })
}

/** Decode `encodeSourceScanBoundary` output; throws `Invalid search cursor.` on any malformed payload. */
export function decodeSourceScanBoundary(
  raw: string | null
): SourceScanBoundary | null {
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("Invalid search cursor.")
  }
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("Invalid search cursor.")
  }
  const payload = parsed as { t?: unknown; ids?: unknown }
  if (
    typeof payload.t !== "number" ||
    !Number.isFinite(payload.t) ||
    !Array.isArray(payload.ids) ||
    payload.ids.length > SOURCE_SCAN_BOUNDARY_MAX_IDS ||
    !payload.ids.every((id) => typeof id === "string")
  ) {
    throw new Error("Invalid search cursor.")
  }
  return { t: payload.t, ids: payload.ids as string[] }
}

export type SourceSearchFetchedPage<T> = {
  items: T[]
  continueCursor: string | null
  isDone: boolean
  /** Stop this collector invocation and let the caller resume with the cursor. */
  stopAfterPage?: boolean
}

export type SourceSearchPage<T> = {
  rows: T[]
  continueCursor: string | null
  isDone: boolean
  scanned: number
}

/** Consecutive empty non-final fetched pages tolerated before the collector gives up and leaves a resumable cursor. */
const MAX_CONSECUTIVE_EMPTY_SOURCE_PAGES = 4

/**
 * Page a source query until `pageSize` matches are found, the source is
 * exhausted, or `scanCap` candidates have been scanned.
 *
 * Returns `{ rows, continueCursor: isDone ? null : cursor, isDone, scanned }`
 * where `scanned` counts fetched CANDIDATES (not matches) and
 * `continueCursor` is null exactly when `isDone`.
 *
 * The no-overshoot invariant: each internal fetch requests
 * `limit = min(fetchBatch, pageSize - rows.length)`, and the collector
 * consumes the WHOLE fetched page before advancing the cursor. `rows` can
 * only grow by one per candidate, so filling `pageSize` inside a page is
 * possible only when every candidate of that page matched — the stop
 * therefore lands exactly on a fetched-page boundary. No mid-page stop
 * means nothing is skipped at a boundary and nothing is duplicated on
 * resume. A fixed (larger) fetch size can overshoot mid-page and the
 * page-level cursor would then skip the unconsumed candidates.
 *
 * `matches` may be async: a consumer can match cheap fields first and only
 * then perform a validated join read. A predicate throw propagates.
 */
export async function collectSourceSearchPage<T>(args: {
  fetchPage: (
    cursor: string | null,
    limit: number
  ) => Promise<SourceSearchFetchedPage<T>>
  matches: (item: T) => boolean | Promise<boolean>
  pageSize: number
  cursor: string | null
  scanCap: number
  fetchBatch?: number
}): Promise<SourceSearchPage<T>> {
  const { pageSize, scanCap } = args
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > SOURCE_SEARCH_PAGE_MAX
  ) {
    throw new Error("Invalid source search page size.")
  }
  if (!Number.isFinite(scanCap) || scanCap < 1) {
    throw new Error("Invalid source search scan cap.")
  }
  const rawBatch = args.fetchBatch ?? SOURCE_SEARCH_FETCH_BATCH
  const fetchBatch = Number.isFinite(rawBatch)
    ? Math.max(1, Math.floor(rawBatch))
    : SOURCE_SEARCH_FETCH_BATCH

  const rows: T[] = []
  let cursor = args.cursor
  let isDone = false
  let scanned = 0
  let consecutiveEmptyPages = 0

  while (rows.length < pageSize && !isDone && scanned < scanCap) {
    const need = pageSize - rows.length
    const limit = Math.min(fetchBatch, need)
    const page = await args.fetchPage(cursor, limit)
    scanned += page.items.length
    for (const item of page.items) {
      if (await args.matches(item)) rows.push(item)
    }
    cursor = page.continueCursor
    isDone = page.isDone
    if (page.stopAfterPage) break
    if (page.items.length === 0 && !isDone) {
      consecutiveEmptyPages += 1
      if (consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_SOURCE_PAGES) break
    } else {
      consecutiveEmptyPages = 0
    }
  }

  return { rows, continueCursor: isDone ? null : cursor, isDone, scanned }
}
