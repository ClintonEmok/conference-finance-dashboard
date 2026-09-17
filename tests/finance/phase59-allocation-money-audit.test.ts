import { describe, expect, test } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Phase 59 source audit — the Phase 58 allocation surface set carries no
 * client-side money formula (SC5's static half).
 *
 * THE RULE: every figure the Phase 58 surfaces render is a SERVER field, and
 * the ONE formatter is `formatMoney` in `lib/format.ts`. This suite is a static
 * guard, two clauses deep:
 *
 *  1. the `*Minor` arithmetic sweep — over the WHOLE
 *     `components/dashboard/finance/` directory (a directory walk, never a
 *     hand-maintained list, so a NEW file a future phase adds there is swept
 *     automatically — what the per-file guards cannot do) plus the five pinned
 *     route pages and the four `lib/dashboard/` modules; and
 *  2. the hand-rolled-currency clause (`Intl.NumberFormat`, `.toFixed(`,
 *     `/ 100`) over the same pinned set, with two DELIBERATE exclusions
 *     documented at `CURRENCY_CLAUSE_EXCLUSIONS` below.
 *
 * WHY THIS FILE EXISTS (59-CONTEXT gap 3): per-file guards exist —
 * `tests/dashboard/donation-allocation-dialog.test.ts:253-256` (the money-free
 * picker), `tests/dashboard/donations-workspace.test.ts:280-284` (no money
 * arithmetic on the workspace/record pair),
 * `tests/dashboard/dacc-04-allocation-visibility.test.ts:105-111` (no
 * per-attendee sum) and `tests/dashboard/donation-deletion-dialog.test.ts:72-82`
 * (no money math in the delete dialog) — but none of them is a consolidated
 * audit of the Phase 58 SURFACE SET. This suite is additive: it re-reads the
 * shipped bytes independently and never replaces a per-file guard.
 *
 * NON-VACUITY (the W1 lesson): the expected file set is READ, not assumed. A
 * renamed or moved file throws ENOENT inside `case 1` and fails the suite, and
 * the directory walk must CONTAIN every expected component by name — a walk
 * that silently matched nothing cannot go green.
 *
 * A TEXT SCAN IS NOT A CALL GRAPH: these clauses scan source text. A literal
 * reference in a comment fires (that is the recorded M-4 probe for the
 * `assignPaymentToOrder` clause in this file's second half), while a computed
 * or dynamically-built reference would not. The guard is cheap and loud, never
 * a security boundary.
 */

const root = resolve(import.meta.dirname, "../..")

const FINANCE_DIR = "components/dashboard/finance"

/**
 * The six Phase 58 UI surfaces, by name. They are the pinned half of the
 * directory walk: `case 1` proves the walk still reaches every one of them,
 * and `case 2` then sweeps every walked file as a target.
 */
const PHASE_58_UI_SURFACES = [
  "donation-allocation-dialog.tsx",
  "donation-allocation-attendee-picker.tsx",
  "donation-delete-dialog.tsx",
  "donation-record-panel.tsx",
  "donations-workspace.tsx",
  "payments-workspace.tsx",
] as const

/** The five routes the Phase 58 inversion made real (or left as the shims). */
const PHASE_58_ROUTE_PAGES = [
  "app/dashboard/events/[slug]/payments/page.tsx",
  "app/dashboard/events/[slug]/donations/page.tsx",
  "app/dashboard/events/[slug]/reconciliation/page.tsx",
  "app/dashboard/events/[slug]/finance/page.tsx",
  "app/dashboard/events/[slug]/donation/page.tsx",
] as const

/** The four `lib/dashboard/` modules the Phase 58 surfaces are built from. */
const PHASE_58_LIB_MODULES = [
  "lib/dashboard/donation-allocation-request.ts",
  "lib/dashboard/donation-deletion-copy.ts",
  "lib/dashboard/workspace-routes.ts",
  "lib/dashboard/query-state.ts",
] as const

/**
 * The pinned Phase 58 surface set, in full: 6 UI + 5 routes + 4 libs. Every
 * path is READ by `case 1` — a missing path throws and the suite fails, so the
 * set can never silently shrink (the classic vacuous-guard failure mode).
 */
const PHASE_58_SURFACE_SET: readonly string[] = [
  ...PHASE_58_UI_SURFACES.map((name) => `${FINANCE_DIR}/${name}`),
  ...PHASE_58_ROUTE_PAGES,
  ...PHASE_58_LIB_MODULES,
]

/**
 * The three surfaces that RENDER money and must go through the house
 * formatter. The picker renders no money by design (pinned per-file at
 * `tests/dashboard/donation-allocation-dialog.test.ts:253-256`) and the delete
 * dialog formats through its copy builder — both are handled separately.
 */
const MONEY_RENDERING_SURFACES = [
  `${FINANCE_DIR}/donation-allocation-dialog.tsx`,
  `${FINANCE_DIR}/donation-record-panel.tsx`,
  `${FINANCE_DIR}/donations-workspace.tsx`,
] as const

/** The delete dialog: the copy builder owns the format, never an inline call. */
const DELETE_DIALOG = `${FINANCE_DIR}/donation-delete-dialog.tsx`

/**
 * The three allocation surfaces: a hand-rolled paid total on the donations UI
 * must fail HERE, statically, not just in code review.
 */
const ALLOCATION_SURFACES = [
  `${FINANCE_DIR}/donation-allocation-dialog.tsx`,
  `${FINANCE_DIR}/donation-record-panel.tsx`,
  `${FINANCE_DIR}/donations-workspace.tsx`,
] as const

/** The payment-only paid symbols that may never appear on those surfaces. */
const PAYMENT_ONLY_PAID_SYMBOLS = [
  "loadMatchedPaymentTotalsByOrderId",
  "isOrderAppliedPayment",
  "appliedPaymentsMinor",
  "matchedAmountMinor",
] as const

/**
 * DELIBERATELY OUTSIDE the hand-rolled-currency clause (which scans
 * `PHASE_58_SURFACE_SET` only). Stated here so the omission can never be
 * mistaken for an oversight:
 *
 *  - `legacy-*.tsx` — the four PRE-Phase-58 surfaces. They legitimately
 *    hand-roll currency for legacy amounts:
 *    `legacy-reconciliation-surface.tsx:461` contains
 *    `(outstanding / 100).toFixed(2)`, which predates this milestone and is
 *    unchanged by it. Legacy formatting is not this phase's scope.
 *  - `lib/format.ts` — this file IS the one money formatter
 *    (`getFormatter(currency).format(minor / 100)` at `:33`); scanning it for
 *    `/ 100` would fail correct code by construction.
 *
 * The exclusion is CHECKED, not decorative (`case 3b`): only a `legacy-*` file
 * in the finance directory or `lib/format.ts` may be named, every legacy
 * surface must be named, and no named path may ever appear in the pinned Phase
 * 58 set. The exclusion cannot be widened to cover a Phase 58 surface without
 * failing the suite.
 */
const CURRENCY_CLAUSE_EXCLUSIONS = [
  `${FINANCE_DIR}/legacy-order-detail-surface.tsx`,
  `${FINANCE_DIR}/legacy-orders-surface.tsx`,
  `${FINANCE_DIR}/legacy-payments-surface.tsx`,
  `${FINANCE_DIR}/legacy-reconciliation-surface.tsx`,
  "lib/format.ts",
] as const

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8")
}

/**
 * The finance directory read as text — never a hand-maintained list. A file a
 * future phase adds here is swept by `case 2` by construction; test files are
 * excluded so a colocated suite cannot introduce its own scan text.
 */
function walkFinanceSurfaces(): string[] {
  return readdirSync(resolve(root, FINANCE_DIR), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .filter((entry) => !/\.test\.tsx?$/.test(entry.name))
    .map((entry) => `${FINANCE_DIR}/${entry.name}`)
    .sort()
}

describe("phase 59 allocation money audit — the Phase 58 surface set", () => {
  test("case 1 — the pinned set exists and the directory walk reaches every expected file", () => {
    // Read EVERY expected path: a renamed or moved file throws ENOENT here and
    // fails the suite rather than silently disappearing from the set.
    for (const path of PHASE_58_SURFACE_SET) {
      expect(
        readSource(path),
        `${path} must exist — a pinned Phase 58 surface was renamed or moved`
      ).toBeTruthy()
    }

    const walked = walkFinanceSurfaces()
    expect(
      walked.length,
      "the finance-directory walk matched nothing"
    ).toBeGreaterThan(0)
    expect(
      walked.length,
      "the walk must reach at least the six pinned UI surfaces"
    ).toBeGreaterThanOrEqual(PHASE_58_UI_SURFACES.length)

    // The walk must reach each expected component BY NAME: a walk that
    // collected a different set cannot go green.
    for (const name of PHASE_58_UI_SURFACES) {
      expect(
        walked,
        `the finance-directory walk failed to reach ${name}`
      ).toContain(`${FINANCE_DIR}/${name}`)
    }
  })

  test("case 2 — no *Minor identifier participates in an arithmetic operator on any Phase 58 path", () => {
    const swept = [
      ...walkFinanceSurfaces(),
      ...PHASE_58_ROUTE_PAGES,
      ...PHASE_58_LIB_MODULES,
    ]
    expect(
      swept.length,
      "the arithmetic sweep must cover the whole surface set plus the walk"
    ).toBeGreaterThanOrEqual(PHASE_58_SURFACE_SET.length)

    for (const path of swept) {
      const source = readSource(path)
      // `*Minor` on either side of an arithmetic operator, whitespace
      // tolerant. Both idioms are the per-file guards' own (the house
      // patterns), lifted here to the whole directory so a NEW file cannot
      // sidestep them.
      expect(
        source,
        `${path} performs arithmetic with a *Minor identifier`
      ).not.toMatch(/[A-Za-z]Minor\s*[-+*/]/)
      expect(
        source,
        `${path} performs arithmetic with a *Minor identifier`
      ).not.toMatch(/[-+*/]\s*[A-Za-z.]*[Mm]inor/)
    }
  })

  test("case 3 — no hand-rolled currency on any pinned Phase 58 surface", () => {
    for (const path of PHASE_58_SURFACE_SET) {
      for (const idiom of ["Intl.NumberFormat", ".toFixed(", "/ 100"] as const) {
        expect(
          readSource(path),
          `${path} hand-rolls currency (found ${idiom}) — money renders through formatMoney from @/lib/format`
        ).not.toContain(idiom)
      }
    }
  })

  test("case 3b — the currency exclusions cover only legacy surfaces and the formatter", () => {
    const walked = walkFinanceSurfaces()
    const excludedLegacy = CURRENCY_CLAUSE_EXCLUSIONS.filter((path) =>
      path.startsWith(`${FINANCE_DIR}/`)
    ).sort()
    const walkedLegacy = walked
      .filter((path) => (path.split("/").pop() ?? "").startsWith("legacy-"))
      .sort()

    // Every legacy surface in the directory is excluded — and no new
    // `legacy-*` file can appear (or be retired) without a recorded decision
    // here. This is the "do not widen the exclusion" pin.
    expect(
      excludedLegacy,
      "the legacy-* surfaces in the finance directory and the currency-clause exclusions must be the same set"
    ).toEqual(walkedLegacy)

    for (const path of CURRENCY_CLAUSE_EXCLUSIONS) {
      const name = path.split("/").pop() ?? ""
      const isLegacySurface =
        path.startsWith(`${FINANCE_DIR}/`) && name.startsWith("legacy-")
      const isFormatter = path === "lib/format.ts"
      expect(
        isLegacySurface || isFormatter,
        `${path} may not be excluded from the currency clause — only legacy-* finance surfaces and lib/format.ts have a documented reason`
      ).toBe(true)

      expect(
        PHASE_58_SURFACE_SET,
        `${path} is a Phase 58 surface and may never be excluded`
      ).not.toContain(path)
    }
  })

  test("case 4 — money renders through the house formatter, never inline", () => {
    for (const path of MONEY_RENDERING_SURFACES) {
      const source = readSource(path)
      expect(
        source,
        `${path} must import the house formatter from @/lib/format`
      ).toMatch(/from "@\/lib\/format"/)
      expect(
        source,
        `${path} must call formatMoney(…)`
      ).toMatch(/formatMoney\(/)
    }

    // The delete dialog is the exception that proves the discriminator: it
    // formats through `buildDonationDeletionConfirmation` (the copy builder),
    // and `:53` contains the bare word "formatMoney" in a COMMENT
    // ("Server-provided donation amount; `formatMoney` runs in the copy
    // builder."). The CALL pattern below is therefore the only correct
    // assertion — `not.toContain("formatMoney")` would false-fail correct code
    // (the plan-check finding this clause was corrected for).
    const deleteDialog = readSource(DELETE_DIALOG)
    expect(
      deleteDialog,
      `${DELETE_DIALOG} must never call formatMoney directly — the copy builder owns the format`
    ).not.toMatch(/formatMoney\(/)
    expect(
      deleteDialog,
      `${DELETE_DIALOG} must format through buildDonationDeletionConfirmation(…)`
    ).toMatch(/buildDonationDeletionConfirmation\(/)
  })

  test("case 5 — the allocation surfaces never name a payment-only paid symbol", () => {
    for (const path of ALLOCATION_SURFACES) {
      const source = readSource(path)
      for (const symbol of PAYMENT_ONLY_PAID_SYMBOLS) {
        expect(
          source,
          `${path} names the payment-only paid symbol ${symbol} — a hand-rolled paid total on the donations UI must fail here, not in review`
        ).not.toContain(symbol)
      }
    }
  })
})
