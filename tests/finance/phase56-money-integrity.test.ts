import { describe, expect, test } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Phase 56 source audit — Canonical Donation Accounting (no double-count).
 *
 * THE RULE: money REPORTED about an order or attendee must agree everywhere.
 * Surfaces that decide what to do NEXT are named in
 * `PHASE_56_PAYMENT_ONLY_DIVERGENCES` on purpose, with a marker and a reason, so
 * the boundary between "reported money" and "an action's basis" is a checked
 * decision instead of an omission. A REPORT surface (such as the customer-facing
 * tracker) is NEVER registerable — that is why `convex/publicTracking.ts` was
 * wired to the canonical balance owner in Phase 56-03 rather than listed here;
 * only action paths may keep a payment-only (or due-only) basis.
 *
 * This suite is a static guard: it fails if a consumer stops using the
 * allocation-aware owner, if a second paid owner appears, if new code writes to
 * `payments`, if `isOrderAppliedPayment` is widened, or if a registered
 * divergence silently changes shape.
 */

const root = resolve(import.meta.dirname, "../..")

const CANONICAL_LOADERS = [
  "loadOrderAmountDueBreakdowns",
  "loadCanonicalOrderBalances",
] as const

const ALLOCATION_AWARE_LOADERS = [
  "loadCanonicalOrderBalances",
  "loadOrderPaymentAttributions",
  "loadOrderAttendeePaymentBreakdowns",
] as const

/** Every phase-56 money surface must consume one of the allocation-aware loaders. */
const PHASE_56_MONEY_SURFACES = [
  "convex/orders.ts",
  "convex/payments.ts",
  "convex/reports.ts",
  "convex/attendees.ts",
  "convex/accommodation.ts",
  "convex/publicTracking.ts",
] as const

/** The three payment-only symbols whose every production reference is accounted for. */
const PAYMENT_ONLY_SYMBOLS = [
  "loadMatchedPaymentTotalsByOrderId",
  "buildMatchedTotalsByOrderId",
  "isOrderAppliedPayment(",
] as const

/** (i) The symbols' own definition sites. */
const PAYMENT_ONLY_DEFINITION_FILES = [
  "convex/finance.ts",
  "lib/domain/finance/matched-payments.ts",
  "lib/domain/finance/amounts.ts",
] as const

/**
 * (ii) Files admitted at file level because they consume a canonical
 * allocation-aware loader — a file-level member cannot be a divergent surface
 * (its reported money is canonical) even when another of its functions still
 * references a payment-only symbol.
 */
const CANONICAL_SET_FILES = [
  "convex/orders.ts",
  "convex/payments.ts",
  "convex/reports.ts",
  "convex/publicTracking.ts",
] as const

/**
 * The divergence register — surface-granular and machine-checked.
 *
 * `functionName` names the ONE surface (exported handler or module function)
 * that deliberately keeps a payment-only (or due-only) basis; `marker` must
 * remain inside that surface's OWN source slice; `reason` states why the surface
 * is a decision, not an omission.
 *
 * File-level co-membership is expected and legitimate: `convex/orders.ts` and
 * `convex/payments.ts` DO contain canonical loaders in other functions. That is
 * why the marker and the "still not canonical" assertions are scoped to the
 * function slice — the file-level form would fail by construction.
 */
const PHASE_56_PAYMENT_ONLY_DIVERGENCES = [
  {
    path: "convex/paymentReminders.ts",
    functionName: "eligibleDeliveries",
    marker: "loadMatchedPaymentTotalsByOrderId",
    reason:
      "Reminder eligibility is an ACTION path: it chooses which orders to chase. Allocation credit is not a payment (D-06), so the selector keeps the payment-only paid basis until action semantics are revisited.",
  },
  {
    path: "convex/paymentReminders.ts",
    functionName: "getDeliveryContext",
    marker: "loadMatchedPaymentTotalsByOrderId",
    reason: "The reminder action's read model — same class as eligibleDeliveries.",
  },
  {
    path: "convex/orders.ts",
    functionName: "syncFullyPaidOrders",
    marker: "loadMatchedPaymentTotalsByOrderId",
    reason:
      "Status-write action: flips orders.status from the payment-only total. Allocation credit is not a payment (D-06) and status semantics are out of scope for Phase 56.",
  },
  {
    path: "convex/payments.ts",
    functionName: "logReconciliationPayment",
    marker: "loadMatchedPaymentTotalsByOrderId",
    reason:
      "Payment-write guard: validates a new payment against the payment-only balance before writing. A donation allocation must not make it skip the outstanding check.",
  },
  {
    path: "convex/tikkie.ts",
    functionName: "autoMatchTikkiePayments",
    marker: "loadOrderAmountDueBreakdowns",
    reason:
      "Auto-match candidate selection: assigns unassigned payments to orders by canonical amount due but deliberately keeps a payment-only matched basis — matching is a payment decision, not a balance report.",
  },
  {
    path: "convex/donations.ts",
    functionName: "loadAllocationCeilings",
    marker: "loadMatchedPaymentTotalsByOrderId",
    reason:
      "Phase 55's allocation ceiling keeps the payment-only paid share as its base by design (D-12): attributable outstanding is due minus the payment share, and other donations' claims are subtracted as separate terms — credit is never folded into this base.",
  },
] as const

/**
 * (iii) Registered divergent surfaces — the file-level projection of the
 * register above. `convex/tikkie.ts` is deliberately NOT in the coverage pass
 * set: it is a registered surface but references none of the three scan symbols
 * (its marker is the canonical amount-due loader), so the walk never collects
 * it. It is still checked marker-by-marker by case 7a.
 */
const REGISTERED_DIVERGENT_FILES: readonly string[] =
  PHASE_56_PAYMENT_ONLY_DIVERGENCES.map((entry) => entry.path)

/**
 * The exact set the coverage walk MUST collect today, listed so the walk itself
 * cannot silently match nothing. `convex/reports.ts` is allowed as canonical but
 * is not collected: it references none of the three payment-only symbols (it
 * reads the allocation-aware attribution owner instead).
 */
const EXPECTED_COVERAGE_FILES = [
  "convex/finance.ts",
  "lib/domain/finance/matched-payments.ts",
  "lib/domain/finance/amounts.ts",
  "convex/orders.ts",
  "convex/payments.ts",
  "convex/publicTracking.ts",
  "convex/paymentReminders.ts",
  "convex/donations.ts",
] as const

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8")
}

function escapeRegExp(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Isolates ONE surface's own source slice, anchored on its DECLARATION form.
 *
 * `indexOf(name)` is NOT acceptable: `eligibleDeliveries` has call sites before
 * and after its declaration (`convex/paymentReminders.ts:103` inside
 * `previewPaymentReminderAudience`, then `:259` and `:570`), so an `indexOf`
 * slice runs 103→131 and misses the marker that genuinely sits at `:218` inside
 * the declaration span 202–233. `lastIndexOf` is equally wrong — it would start
 * at the last call site. A missing declaration THROWS: a register entry whose
 * surface was renamed or removed is itself a register defect and must fail
 * loudly, never fall back to a whole-file slice or a silent pass.
 */
function functionSlice(source: string, name: string, path: string): string {
  const declarationPattern = new RegExp(
    `(?:export\\s+)?(?:async\\s+)?function\\s+${escapeRegExp(name)}\\s*\\(` +
      `|(?:export\\s+)?const\\s+${escapeRegExp(name)}\\s*=`
  )
  const match = declarationPattern.exec(source)
  if (!match) {
    throw new Error(
      `No declaration found for ${name} in ${path} — the divergence register entry is stale or the surface was renamed/removed`
    )
  }

  const start = match.index
  const startLine = source.slice(0, start).split("\n").length - 1
  const lines = source.split("\n")

  for (let index = startLine + 1; index < lines.length; index += 1) {
    // "the next line that starts at column 0 with `}` or `})`" — the column-0
    // closing brace of the declaration itself.
    if (lines[index].startsWith("}")) {
      return lines.slice(startLine, index + 1).join("\n")
    }
  }

  throw new Error(
    `No column-0 closing brace found for ${name} in ${path} — the declaration anchor is unusable`
  )
}

type ProductionSource = { path: string; source: string }

/**
 * Shared production-tree walk (cases 3 and 7): every `.ts`/`.tsx` file under
 * `convex/` and `lib/`, excluding generated code and test files. A
 * hand-maintained file list is what let `lib/domain/finance/reconciliation.ts`
 * slip through the first time; this walk is the assertion that cannot be
 * outgrown.
 */
function walkProductionSources(
  relativeDir: string,
  acc: ProductionSource[] = []
): ProductionSource[] {
  const absoluteDir = resolve(root, relativeDir)
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const childPath = `${relativeDir}/${entry.name}`
    if (entry.isDirectory()) {
      if (entry.name === "_generated" || entry.name === "node_modules") continue
      walkProductionSources(childPath, acc)
      continue
    }
    if (!/\.tsx?$/.test(entry.name)) continue
    if (/\.test\.tsx?$/.test(entry.name)) continue
    acc.push({ path: childPath, source: readFileSync(resolve(root, childPath), "utf8") })
  }
  return acc
}

function productionSources(): ProductionSource[] {
  return [...walkProductionSources("convex"), ...walkProductionSources("lib")]
}

describe("phase 56 canonical donation accounting source audit", () => {
  test("case 1 — every named money consumer consumes the canonical loader", () => {
    for (const consumer of PHASE_56_MONEY_SURFACES) {
      const source = readSource(consumer)
      expect(
        CANONICAL_LOADERS.some((loader) => source.includes(loader)),
        `${consumer} must consume the canonical amount-due authority (loadOrderAmountDueBreakdowns or its order-level owner loadCanonicalOrderBalances)`
      ).toBe(true)
    }

    // The tracker is on the list so it can never drift back to a locally
    // computed paid figure.
    expect(readSource("convex/publicTracking.ts")).toContain(
      "loadCanonicalOrderBalances"
    )
  })

  test("case 2 — the allocation-aware owner is consumed by every phase-56 money surface", () => {
    for (const consumer of PHASE_56_MONEY_SURFACES) {
      const source = readSource(consumer)
      expect(
        ALLOCATION_AWARE_LOADERS.some((loader) => source.includes(loader)),
        `${consumer} must consume the ONE allocation-aware owner (loadCanonicalOrderBalances, loadOrderPaymentAttributions or loadOrderAttendeePaymentBreakdowns)`
      ).toBe(true)
    }
  })

  test("case 3 — one paid owner; the removed derivations stay removed", () => {
    for (const path of [
      "convex/reports.ts",
      "lib/domain/finance/attendees.ts",
      "lib/domain/finance/attendee-detail.ts",
    ]) {
      const source = readSource(path)
      expect(
        source.includes("allocateReportPaymentsByAttendee"),
        `${path} must not reference the removed per-attendee paid spread`
      ).toBe(false)
      expect(
        source.includes("allocateMinorAmountByWeight"),
        `${path} must not reference the removed paid-weight spread`
      ).toBe(false)
    }

    expect(readSource("lib/domain/finance/reconciliation.ts")).not.toContain(
      "buildMatchedTotalsByOrderId"
    )

    const tracking = readSource("convex/publicTracking.ts")
    expect(tracking).toContain("loadCanonicalOrderBalances")
    expect(
      tracking.includes("loadPaidTotalForOrder"),
      "the deleted local paid reader must not return to convex/publicTracking.ts"
    ).toBe(false)

    // Tree scan: a hand-maintained three-file list is what let
    // `lib/domain/finance/reconciliation.ts` slip through the first time.
    const builderFiles = productionSources()
      .filter(({ source }) => source.includes("buildMatchedTotalsByOrderId"))
      .map(({ path }) => path)
    expect(builderFiles).toEqual(["lib/domain/finance/matched-payments.ts"])
  })

  test("case 4 — no payments write in the projection code (D-06/D-07)", () => {
    // Allocation credit arrives only through the allocation layer: the
    // donation's payment row is never rewritten and never assigned an orderId.
    const forbiddenWrites = [
      'db.insert("payments"',
      'db.patch("payments"',
      'db.replace("payments"',
      'db.delete("payments"',
    ] as const

    for (const path of [
      "convex/finance.ts",
      "convex/donations.ts",
      "lib/domain/finance/donation-attribution.ts",
      "lib/domain/finance/donation-income.ts",
    ]) {
      const source = readSource(path)
      for (const write of forbiddenWrites) {
        expect(
          source.includes(write),
          `${path} must not write to payments (${write})`
        ).toBe(false)
      }
    }
  })

  test("case 5 — isOrderAppliedPayment semantics are unchanged", () => {
    const amounts = readSource("lib/domain/finance/amounts.ts")
    const predicate = functionSlice(
      amounts,
      "isOrderAppliedPayment",
      "lib/domain/finance/amounts.ts"
    )

    // The order-link guard.
    expect(predicate).toContain("hasOrderId")
    // The standalone exclusion: a donation is applied only when it is an order
    // overpayment. Nobody may widen the payment class without failing this.
    expect(predicate).toContain('donationKind === "overpayment"')
    expect(predicate).toContain(
      'payment.status === "donation" && payment.donationKind === "overpayment"'
    )
  })

  test("case 6 — bounded reads and the declared event-scoped index", () => {
    const finance = readSource("convex/finance.ts")
    expect(finance).toContain('"by_orderId"')
    expect(finance.includes(".collect(")).toBe(false)

    const donations = readSource("convex/donations.ts")
    expect(donations).toContain('"by_donationId"')
    expect(donations.includes(".collect(")).toBe(false)

    const payments = readSource("convex/payments.ts")
    expect(payments.includes(".collect(")).toBe(false)

    // The event-scoped index is DECLARED in the schema and never read anywhere
    // (verified repo-wide: `by_eventId_and_createdAt` appears only in
    // `convex/schema.ts`). Pinning the declaration is the only satisfiable
    // assertion — the index exists for future event-scoped readers, and this
    // audit pins that it still exists.
    const schema = readSource("convex/schema.ts")
    const blockStart = schema.indexOf("donationAllocations: defineTable(")
    expect(
      blockStart,
      "convex/schema.ts must still declare the donationAllocations table"
    ).toBeGreaterThanOrEqual(0)

    const blockEnd = schema.indexOf(
      '.index("by_attendeeId", ["attendeeId"]),',
      blockStart
    )
    expect(
      blockEnd,
      "the donationAllocations index chain must still end with by_attendeeId"
    ).toBeGreaterThan(blockStart)

    expect(schema.slice(blockStart, blockEnd)).toContain(
      '.index("by_eventId_and_createdAt", ["eventId", "createdAt"])'
    )
  })

  test("case 7a — the divergence register survives: marker, surface and non-canonical shape", () => {
    for (const entry of PHASE_56_PAYMENT_ONLY_DIVERGENCES) {
      const source = readSource(entry.path)
      expect(
        source.includes(entry.functionName),
        `${entry.path} must still contain the registered surface ${entry.functionName}`
      ).toBe(true)

      // Throws (failing loudly) when no DECLARATION matches.
      const slice = functionSlice(source, entry.functionName, entry.path)

      // The slice must START on the declaration itself, never on a call site:
      // this is the `indexOf`/`lastIndexOf` failure mode the anchor exists for.
      expect(slice.split("\n")[0]).toMatch(
        new RegExp(
          `(?:export\\s+)?(?:async\\s+)?function\\s+${escapeRegExp(entry.functionName)}\\s*\\(` +
            `|(?:export\\s+)?const\\s+${escapeRegExp(entry.functionName)}\\s*=`
        )
      )

      // A whole-file fallback is not acceptable: the slice must be a real
      // sub-span of the file.
      expect(slice.length).toBeGreaterThan(0)
      expect(slice.length).toBeLessThan(source.length)

      expect(
        slice.includes(entry.marker),
        `${entry.path}:${entry.functionName} lost its registered marker ${entry.marker}`
      ).toBe(true)

      // The marker surface itself must NOT be canonical. Scoping this to the
      // function slice (not the file) is what keeps `convex/orders.ts` and
      // `convex/payments.ts` satisfiable — those files DO contain canonical
      // loaders in OTHER functions.
      for (const loader of ALLOCATION_AWARE_LOADERS) {
        expect(
          slice.includes(loader),
          `${entry.path}:${entry.functionName} is registered as a divergent surface but now consumes ${loader}`
        ).toBe(false)
      }
    }
  })

  test("case 7a (anchor guard) — a stale register entry fails loudly, never silently", () => {
    const source = readSource("convex/paymentReminders.ts")
    // A missing declaration is a register defect: THROW, never fall back to a
    // whole-file slice and never pass silently.
    expect(() =>
      functionSlice(source, "noSuchSurfaceNameHere", "convex/paymentReminders.ts")
    ).toThrow(/No declaration found for noSuchSurfaceNameHere/)

    // The load-bearing case from the plan: `eligibleDeliveries` has call sites
    // at `:103` (before) and `:259`/`:570` (after) its declaration at `:202`,
    // so an `indexOf`-anchored slice (103→131) and a `lastIndexOf`-anchored
    // slice (570→634) both MISS the registered marker at `:218`.
    const declarationSlice = functionSlice(
      source,
      "eligibleDeliveries",
      "convex/paymentReminders.ts"
    )
    expect(declarationSlice).toContain("loadMatchedPaymentTotalsByOrderId")
    expect(declarationSlice.split("\n")[0]).toBe("async function eligibleDeliveries(")
    // Sanity: the call site BEFORE the declaration is genuinely outside it.
    const callSiteBefore = source.slice(
      source.indexOf("eligibleDeliveries"),
      source.indexOf("async function eligibleDeliveries")
    )
    expect(callSiteBefore).not.toContain("loadMatchedPaymentTotalsByOrderId")
  })

  test("case 7b — coverage is complete: every payment-only reference is a definition, canonical, or registered", () => {
    const collected = productionSources().filter(({ source }) =>
      PAYMENT_ONLY_SYMBOLS.some((symbol) => source.includes(symbol))
    )
    const collectedPaths = collected.map(({ path }) => path)

    // Guard the walk itself: it must reach every file it is expected to.
    for (const expected of EXPECTED_COVERAGE_FILES) {
      expect(
        collectedPaths,
        `the coverage walk failed to collect ${expected} — the scan set or the walk is broken`
      ).toContain(expected)
    }

    const allowed = new Set<string>([
      ...PAYMENT_ONLY_DEFINITION_FILES,
      ...CANONICAL_SET_FILES,
      ...REGISTERED_DIVERGENT_FILES,
    ])

    for (const { path, source } of collected) {
      const isCanonical = ALLOCATION_AWARE_LOADERS.some((loader) =>
        source.includes(loader)
      )
      expect(
        isCanonical || allowed.has(path),
        `${path} references a payment-only paid derivation but is neither a definition file, part of the canonical set, nor a registered divergent surface — register it in PHASE_56_PAYMENT_ONLY_DIVERGENCES or wire it to a canonical loader`
      ).toBe(true)
    }

    // `convex/tikkie.ts` registers a surface but references none of the three
    // scan symbols, so it is legitimately outside this walk.
    expect(collectedPaths).not.toContain("convex/tikkie.ts")
  })
})
