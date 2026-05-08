---
phase: 13-rebuild-convex-mutation-and-api-layer-from-clean-contracts
plan: "02"
subsystem: api
tags: [convex, orders, reporting, reconciliation, api-routes]
requires:
  - phase: 13-rebuild-convex-mutation-and-api-layer-from-clean-contracts
    provides: Canonical Convex tree and typed Clerk-aware server bridge.
provides:
  - Bounded order/reporting Convex projections with explicit return contracts
  - Finance order/reporting domain modules using generated refs
  - Protected order search/detail/reconciliation routes migrated to typed Convex refs
affects: [13-05, orders, reporting, reconciliation]
tech-stack:
  added: []
  patterns:
    - "Finance reporting readers call `api.orders.*` and `api.events.*` refs through `convexQuery`."
    - "Order reporting Convex queries expose explicit `returns:` validators for app-facing projections."
key-files:
  created: []
  modified:
    - convex/orders.ts
    - convex/events.ts
    - lib/domain/finance/reporting.ts
    - lib/domain/finance/order-ledger.ts
    - lib/domain/finance/reconciliation.ts
    - app/api/dashboard/orders/[orderId]/route.ts
    - app/api/orders/search/route.ts
    - app/api/reconciliation/route.ts
key-decisions:
  - "Bounded hot-path order queries around indexed candidate reads and explicit max windows instead of unbounded table scans."
  - "Cleared remaining raw order string dispatch in finance-domain files that would have failed the plan grep gate, even outside the narrow route slice."
patterns-established:
  - "Use generated `api.orders.*` / `api.events.*` refs in finance domain modules and protected order routes."
  - "Order/reporting Convex projections should declare `returns:` validators for stable route-facing payloads."
requirements-completed: []
duration: 29 min
completed: 2026-03-26
---

# Phase 13 Plan 02: Rebuild orders, reporting, and reconciliation read contracts on bounded typed Convex APIs Summary

**Bounded order reporting queries and typed generated refs now power revenue, order search, order detail, and reconciliation reads.**

## Performance

- **Duration:** 29 min
- **Started:** 2026-03-26T07:33:00Z
- **Completed:** 2026-03-26T08:02:17Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Added explicit return validators and bounded candidate-query logic to the core order reporting/search Convex functions.
- Migrated reporting, order ledger, reconciliation, order search, and order detail code paths to generated `api.orders.*` / `api.events.*` refs.
- Removed the remaining raw order string dispatch from finance-domain files covered by the plan verification grep.

## Task Commits

Each task was committed atomically:

1. **Task 1: Refocus order/reporting queries into bounded public contracts and internal helpers** - `400dd45` (feat)
2. **Task 2: Migrate order/reporting domain modules and protected routes to typed refs** - `1fc60bd` (feat)

**Plan metadata:** pending

## Files Created/Modified

- `convex/orders.ts` - bounded order search, ledger, reconciliation, detail, and payment-status projections with `returns:` validators.
- `convex/events.ts` - typed event projection returns for reporting consumers.
- `lib/domain/finance/reporting.ts` - revenue overview now uses `api.orders.getOrdersForReconciliation` and `api.events.getEventsForLedger`.
- `lib/domain/finance/order-ledger.ts` - order ledger now consumes `api.orders.getOrdersWithFilters`.
- `lib/domain/finance/reconciliation.ts` - reconciliation reader now consumes `api.orders.getOrdersForReconciliation`.
- `app/api/dashboard/orders/[orderId]/route.ts`, `app/api/orders/search/route.ts`, `app/api/reconciliation/route.ts` - protected routes now call typed refs through the shared bridge.

## Decisions Made

- Preserved the existing route-layer JSON contracts while tightening the Convex side around typed projections and bounded candidate reads.
- Treated stray raw `orders/*` strings in other finance domain files as blocking verification debt and cleared them inside this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cleared finance-layer raw order strings outside the narrow route slice**

- **Found during:** Task 2 (typed ref migration)
- **Issue:** the plan verification grep spans all of `lib/domain/finance`, so lingering raw `orders/*` calls in attendee, payments, and Tikkie helpers would have failed the plan even after the target routes were migrated.
- **Fix:** updated those finance-domain callers to consume `api.orders.*` refs through the shared bridge.
- **Files modified:** `lib/domain/finance/attendees.ts`, `lib/domain/finance/attendee-detail.ts`, `lib/domain/finance/payments.ts`, `lib/domain/finance/tikkie-links.ts`
- **Verification:** `rg '"orders:|"orders/' lib/domain/finance app/api/dashboard app/api/orders app/api/reconciliation`
- **Committed in:** `1fc60bd`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** This widened the migration slightly but kept it aligned with the plan's explicit verification gate and reduced later cleanup debt.

## Issues Encountered

- No route-contract regressions surfaced; the main issue was broader grep scope than the initial file list implied, which was resolved by clearing the remaining finance order strings.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Order/reporting readers are now on generated refs, so the remaining attendee/accommodation and payments/Tikkie migrations can follow the same bridge pattern.
- Final legacy string-dispatch removal in Plan 05 can now assume order/reporting callers no longer depend on raw order paths.

---

_Phase: 13-rebuild-convex-mutation-and-api-layer-from-clean-contracts_
_Completed: 2026-03-26_
