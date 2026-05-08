---
phase: 29-deterministic-money-model
plan: 01
subsystem: testing
tags: [vitest, finance, money-model, convex, typescript]

# Dependency graph
requires:
  - phase: 28-single-sidebar-shell
    provides: event-scoped shell and dashboard navigation context
provides:
  - deterministic minor-unit helpers for finance math
  - canonical order/attendee amount regression coverage
  - normalized ledger/reconciliation balance handling
affects: [29-02, 29-03, 31-safe-migration-and-parity]

# Tech tracking
tech-stack:
  added: [vitest]
  patterns: [canonical minor-unit math, zero-collapsing normalization, atomic finance regressions]

key-files:
  created: [tests/finance/money-model.test.ts]
  modified: [lib/domain/finance/amounts.ts, lib/domain/finance/order-ledger.ts, lib/domain/finance/reconciliation.ts]

key-decisions:
  - "Zero and nullish money inputs collapse to 0 instead of leaking NaN into downstream views."
  - "Ledger and reconciliation readers use the same canonical amount source without fallback total math."

patterns-established:
  - "Pattern 1: treat regression tests as the contract for canonical finance values before UI work."
  - "Pattern 2: normalize every minor-unit balance through one helper before comparison or display."

# Metrics
duration: 12min
completed: 2026-04-25
---

# Phase 29: Deterministic Money Model Summary

**Canonical money math now resolves attendee payables, ledger totals, and reconciliation balances through one zero-safe path.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-25T16:11:56Z
- **Completed:** 2026-04-25T16:23:57Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments
- Added a focused regression suite for FIN-01/FIN-02/FIN-03 behavior.
- Normalized balance helpers so nullish and empty money inputs collapse safely.
- Removed fallback amount logic from ledger and reconciliation readers.

## Task Commits

1. **Task 1: Write failing money-model regressions / make the money model deterministic** - `ebc8a7b` (feat)

## Files Created/Modified
- `tests/finance/money-model.test.ts` - regression coverage for canonical amount behavior
- `lib/domain/finance/amounts.ts` - deterministic helper normalization
- `lib/domain/finance/order-ledger.ts` - stable amountDueMinor output
- `lib/domain/finance/reconciliation.ts` - canonical outstanding math

## Decisions Made
- Canonical amount math must never fall back to totals when amountDueMinor is already the source of truth.
- Zero-value attendee allocations should remain represented explicitly in the breakdown map.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed zero-value attendee omission**
- **Found during:** Task 1 (red regression pass)
- **Issue:** Zero-priced selections were skipped and disappeared from the attendee breakdown map.
- **Fix:** Retained zero-value attendee entries while still excluding them from the aggregate sum.
- **Files modified:** `lib/domain/finance/amounts.ts`, `tests/finance/money-model.test.ts`
- **Verification:** `npm test -- tests/finance/money-model.test.ts` passed.
- **Committed in:** `ebc8a7b`

**2. [Rule 1 - Bug] Fixed nullish balance handling**
- **Found during:** Task 1 (red regression pass)
- **Issue:** Null/undefined amount inputs produced NaN in balance calculations.
- **Fix:** Added shared minor-unit normalization for balance math.
- **Files modified:** `lib/domain/finance/amounts.ts`
- **Verification:** `npm test -- tests/finance/money-model.test.ts` and typecheck passed.
- **Committed in:** `ebc8a7b`

**3. [Rule 1 - Bug] Removed reconciliation fallback total math**
- **Found during:** Task 1 (follow-up verification)
- **Issue:** Reconciliation still fell back to total amounts instead of respecting canonical amountDueMinor.
- **Fix:** Reconciliation now uses the canonical amount field only.
- **Files modified:** `lib/domain/finance/order-ledger.ts`, `lib/domain/finance/reconciliation.ts`
- **Verification:** Finance regression suite and typecheck passed.
- **Committed in:** `ebc8a7b`

---

**Total deviations:** 3 auto-fixed (3 bug fixes)
**Impact on plan:** All fixes were required for canonical correctness.

## Issues Encountered
- Initial red run exposed missing zero-value tracking and null-safe balance handling; both were corrected inline.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Canonical finance math is deterministic and ready for event-scoped UI surfaces.
- Downstream pages can safely consume `amountDueMinor` and reconciliation balances without fallback logic.

---
*Phase: 29-deterministic-money-model*
*Completed: 2026-04-25*
