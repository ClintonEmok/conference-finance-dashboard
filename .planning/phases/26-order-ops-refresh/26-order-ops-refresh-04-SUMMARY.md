---
phase: 26-order-ops-refresh
plan: 04
subsystem: payments
tags:
  - payments
  - reconciliation
  - convex
  - canonical-ids
  - vitest
requires:
  - phase: 25
    provides: canonical order/runtime contract baseline
provides:
  - Payment enrichment resolves canonical order ids before legacy provider ids.
  - Reconciliation keys now flow from internal order ids instead of provider-first joins.
  - Targeted payment/reconciliation regression coverage was updated for the new lookup order.
affects:
  - phase-27
  - phase-29
tech-stack:
  added: []
  patterns:
    - canonical order-id first, provider fallback only as compatibility adapter
    - runtime payment reads avoid provider-first lookup chains
key-files:
  created: []
  modified:
    - lib/domain/finance/payments.ts
    - app/api/payments/route.ts
    - tests/payments/payments-route.test.ts
    - tests/finance/internal-orders-canonicalization.test.ts
key-decisions:
  - "Canonical order ids became the primary join key for payment writes and runtime enrichment."
  - "Legacy provider-id lookups remain only as private migration compatibility paths."
patterns-established:
  - "Pattern 1: resolve internal ids first, then isolate provider fallback behind a private helper."
  - "Pattern 2: API read surfaces should preserve null order facts instead of coercing legacy defaults."
duration: 20min
completed: 2026-04-21
---

# Phase 26 Plan 04: Runtime Payment Join Canonicalization Summary

**Canonical payment enrichment now resolves internal order ids first, with provider lookups quarantined to compatibility paths.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-21T17:07:00Z
- **Completed:** 2026-04-21T17:27:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Payment assignment now resolves against `orders._id` before legacy provider ids.
- `GET /api/payments` no longer prefers provider-id enrichment.
- Regression tests now assert canonical lookup ordering and null-preserving behavior.

## Task Commits

1. **Task 1: Make payment enrichment canonical-first** - `246b8b7` (fix)
2. **Task 2: Canonicalize matched-payment aggregation and reconciliation** - `76f4137` (fix)

**Plan metadata:** pending final docs commit

## Files Created/Modified
- `lib/domain/finance/payments.ts` - canonical-first payment assignment lookup
- `app/api/payments/route.ts` - canonical order enrichment for payment list responses
- `tests/payments/payments-route.test.ts` - route regression coverage for canonical lookup
- `tests/finance/internal-orders-canonicalization.test.ts` - payment write canonicalization coverage

## Decisions Made
- Keep provider-id fallback only in private compatibility helpers.
- Preserve `null` for missing order facts instead of inventing defaults.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness
- Payment/reconciliation joins now use a single internal identifier contract.
- Phase 05/06 work can continue on provider boundary isolation and attendee/Tikkie flows.

---
*Phase: 26-order-ops-refresh*
*Completed: 2026-04-21*
