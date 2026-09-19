import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"

const ROOT = resolve(import.meta.dirname, "../..")
const CONVEX_ROOT = resolve(ROOT, "convex")

/**
 * Remove comments without treating `https://` or another string literal as a
 * comment. Comment contents become spaces, while newlines stay in place so
 * diagnostics still point at the original source lines.
 */
function stripComments(source: string): string {
  let output = ""
  let state: "code" | "line" | "block" | "single" | "double" | "template" =
    "code"
  let escaped = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const next = source[index + 1]

    if (state === "line") {
      if (character === "\n") {
        output += character
        state = "code"
      } else {
        output += " "
      }
      continue
    }

    if (state === "block") {
      if (character === "*" && next === "/") {
        output += "  "
        index += 1
        state = "code"
      } else if (character === "\n") {
        output += character
      } else {
        output += " "
      }
      continue
    }

    if (state === "single" || state === "double" || state === "template") {
      output += character
      if (escaped) {
        escaped = false
      } else if (character === "\\") {
        escaped = true
      } else if (
        (state === "single" && character === "'") ||
        (state === "double" && character === '"') ||
        (state === "template" && character === "`")
      ) {
        state = "code"
      }
      continue
    }

    if (character === "/" && next === "/") {
      output += "  "
      index += 1
      state = "line"
      continue
    }
    if (character === "/" && next === "*") {
      output += "  "
      index += 1
      state = "block"
      continue
    }
    if (character === "'") state = "single"
    if (character === '"') state = "double"
    if (character === "`") state = "template"
    output += character
  }

  return output
}

function convexProductionFiles(): string[] {
  const files: string[] = []
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const absolute = resolve(directory, entry)
      const relative = absolute.slice(ROOT.length + 1)
      if (entry === "_generated") continue
      if (statSync(absolute).isDirectory()) {
        visit(absolute)
      } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
        files.push(relative)
      }
    }
  }
  visit(CONVEX_ROOT)
  return files.sort()
}

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

function occurrences(source: string, token: string): number[] {
  const positions: number[] = []
  let from = 0
  while (from < source.length) {
    const position = source.indexOf(token, from)
    if (position === -1) break
    positions.push(position)
    from = position + token.length
  }
  return positions
}

describe("Phase 62 source-search static guardrails", () => {
  test("stripComments is string-aware and decoy controls are non-vacuous", () => {
    const comment = '// ctx.db.insert("searchDocuments", …)'
    expect(comment).toContain("searchDocuments")
    expect(stripComments(comment)).not.toContain("searchDocuments")

    const urlLiteral = 'const url = "https://example.test/searchDocuments"'
    expect(stripComments(urlLiteral)).toContain(
      "https://example.test/searchDocuments"
    )

    const fakeWrite = 'const x = ctx.db.insert("searchDocuments", {})'
    expect(stripComments(fakeWrite)).toContain("searchDocuments")

    const fakeRemovedComment = "// upsertOrderSearchDocument(row)"
    const fakeRemovedCode = "const x = upsertOrderSearchDocument(row)"
    expect(stripComments(fakeRemovedComment)).not.toContain(
      "upsertOrderSearchDocument"
    )
    expect(stripComments(fakeRemovedCode)).toContain(
      "upsertOrderSearchDocument"
    )
  })

  test("retained projection table names occur only in schema and the scan set cannot shrink", () => {
    const files = convexProductionFiles()
    expect(files.length).toBeGreaterThanOrEqual(40)

    const requiredFiles = [
      "convex/orders.ts",
      "convex/attendees.ts",
      "convex/events.ts",
      "convex/signupSubmission.ts",
      "convex/sync/families.ts",
      "convex/search.ts",
      "convex/payments.ts",
      "convex/schema.ts",
    ]
    for (const required of requiredFiles) {
      expect(files, `${required} must be visited`).toContain(required)
    }

    for (const file of files) {
      const source = stripComments(readSource(file))
      for (const tableName of [
        "searchDocuments",
        "searchProjectionFanoutJobs",
      ]) {
        if (source.includes(tableName)) {
          expect(file, `${tableName} must stay schema-only`).toBe(
            "convex/schema.ts"
          )
        }
      }
    }
  })

  test("removed projection symbols are absent outside schema and source search remains present", () => {
    const removedSymbols = [
      "upsertOrderSearchDocument",
      "upsertAttendeeSearchDocument",
      "maintainOrderSearchProjection",
      "refreshAttendeeSearchDocumentsFor",
      "enqueueSearchProjectionFanout",
      "deleteSearchProjection",
      "paginateSearchDocuments",
      "backfillSearchProjections",
    ]
    const scanned = convexProductionFiles()
      .filter((file) => file !== "convex/schema.ts")
      .map((file) => ({ file, source: stripComments(readSource(file)) }))

    for (const { file, source } of scanned) {
      for (const symbol of removedSymbols) {
        expect(source, `${symbol} revived in ${file}`).not.toContain(symbol)
      }
    }
    expect(readSource("convex/search.ts")).toContain("collectSourceSearchPage")
    expect(
      existsSync(resolve(ROOT, "convex/backfillSearchProjections.ts"))
    ).toBe(false)
  })

  test("the projection backfill is gone without deleting the source-search module", () => {
    // The positive control makes this absence assertion fail loudly if the
    // production tree is accidentally replaced by an empty/deleted scan.
    expect(readSource("convex/search.ts")).toContain(
      "export function normalizeSearchText"
    )
    expect(
      existsSync(resolve(ROOT, "convex/backfillSearchProjections.ts"))
    ).toBe(false)
  })

  test("all literal attendee inserts copy eventId and the dynamic seed writer is covered", () => {
    const token = 'db.insert("orderAttendees"'
    const hits = convexProductionFiles().flatMap((file) => {
      const source = stripComments(readSource(file))
      return occurrences(source, token).map((position) => ({
        file,
        source,
        position,
      }))
    })

    // Three literal sites are expected, but that count is NOT evidence of
    // completeness: seedPreviewSimulation uses a dynamic table name.
    expect(hits).toHaveLength(3)
    expect(new Set(hits.map((hit) => hit.file))).toEqual(
      new Set([
        "convex/attendees.ts",
        "convex/events.ts",
        "convex/signupSubmission.ts",
      ])
    )
    for (const hit of hits) {
      expect(hit.source.slice(hit.position, hit.position + 300)).toContain(
        "eventId"
      )
    }

    const seed = stripComments(readSource("convex/seedPreviewSimulation.ts"))
    expect(seed).toMatch(
      /if \(table === "orderAttendees"\)[\s\S]{0,900}insertRow\.eventId = mappedEventId/
    )
    expect(seed).toContain("ctx.db.insert(\n          table as never")

    // Behavioural backstop: the handler suite seeds through this dynamic path
    // and proves the row is immediately visible through the event-scoped
    // ledger query, before any backfill can run.
    const seedSuite = readSource(
      "convex/attendee-source-search.handlers.test.ts"
    )
    expect(seedSuite).toContain(
      'test("the preview seed writes eventId with the row'
    )
    expect(seedSuite).toContain("eventId: seeded.eventId")
    expect(seedSuite).toContain("search: attendee.name")
    expect(seedSuite).toContain("page.rows.map((row) => String(row._id))")
  })

  test("same-event mover guards and their behavioural pins remain present", () => {
    const orders = stripComments(readSource("convex/orders.ts"))
    const attendees = stripComments(readSource("convex/attendees.ts"))
    expect(orders).toContain("belongs to a different event")
    expect(attendees).toContain("Orders must belong to the same event")

    // These named tests are the behavioural proof that makes the copied
    // eventId staleness-free rather than merely a textual field check.
    expect(readSource("convex/order-merge.handlers.test.ts")).toContain(
      'test("mergeOrders rejects cross-event source"'
    )
    expect(
      readSource("convex/attendee-order-mutations.handlers.test.ts")
    ).toContain(
      'test("moveAttendeeToOrder fails closed on cross-event and missing targets"'
    )
  })

  test("reconciliation fallback sends debounced search to the server without re-filtering it", () => {
    const surface = readSource(
      "components/dashboard/finance/legacy-reconciliation-surface.tsx"
    )
    expect(surface).toContain("const SEARCH_DEBOUNCE_MS = 250")
    expect(surface).toContain(
      'const [debouncedSearch, setDebouncedSearch] = useState("")'
    )
    expect(surface).toMatch(
      /useUnassignedPayments\(\s*!hasParentUnassignedPayments,\s*debouncedSearch\s*\)/
    )

    const fallbackStart = surface.indexOf("if (!hasParentUnassignedPayments)")
    const parentFilter = surface.indexOf(
      "const query = searchQuery.trim().toLowerCase()"
    )
    expect(fallbackStart).toBeGreaterThanOrEqual(0)
    expect(parentFilter).toBeGreaterThan(fallbackStart)
    expect(surface.slice(fallbackStart, parentFilter)).toContain(
      'unassignedState.status === "ready" ? unassignedState.data : []'
    )
    expect(surface.slice(fallbackStart, parentFilter)).not.toContain(".filter(")
  })
})
