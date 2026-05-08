---
phase: 26-order-ops-refresh
plan: 01
subsystem: api
tags: [convex, nextjs, orders, payments, tikkie, validation]

# Dependency graph
requires:
  - phase: 25
    provides: canonical order rewrite, finance hardening, and the existing payment/order contract base
provides:
  - shared payment reference formatting across writes and reads
  - canonical dashboard order edit mutation + validated PATCH contract
  - normalized sync-driven status writes for order truth
affects:
  - phase 26-order-ops-refresh plans 02-03
  - payment and order admin APIs
  - future canonical finance/runtime cutover work

# Tech tracking
tech-stack:
  added: []
  patterns:
    - shared domain helper for payment reference formatting
    - allow-listed PATCH payload validation with structured 4xx errors
    - canonical order edit mutation in Convex with dashboard-facing API wrapper

key-files:
  created:
    - lib/domain/finance/payment-reference.ts
    - tests/orders/order-detail-route.test.ts
  modified:
    - lib/domain/finance/payments.ts
    - convex/tikkie.ts
    - convex/orders.ts
    - convex/_generated/api.d.ts
    - app/api/dashboard/orders/[orderId]/route.ts

key-decisions:
  - "Kept payment reference formatting in one shared helper and reused it for both Tikkie writes and dashboard reads."
  - "Added a canonical Convex mutation for order detail edits so the dashboard route stays a thin authenticated wrapper."
  - "Kept PATCH inputs strict: allow-listed fields only, explicit type coercion, and 400 responses for invalid payloads."

patterns-established:
  - "Pattern 1: Shared finance formatting helper exported from the domain layer and consumed by Convex writers."
  - "Pattern 2: Route handlers validate JSON payloads before calling Convex mutations and return structured client errors."

requirements-completed: []

# Metrics
duration: 20 min
completed: 2026-04-21
---

# Phase 26: Canonical Runtime Contract Summary

**Shared payment reference formatting, canonical order edit mutation, and validated dashboard order PATCH flow**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-21T10:12:50Z
- **Completed:** 2026-04-21T10:32:50Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Centralized payment reference formatting so Tikkie writes and payment reads use the same prefix behavior.
- Added canonical order-detail edits through Convex and exposed them through a validated admin PATCH route.
- Kept order sync status writes aligned with canonical order truth and preserved extension timestamps.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add a shared global payment prefix** - `e2040f7` (feat)
2. **Task 2: Make sync-driven order status writes canonical** - `9a64701` (fix)
3. **Task 3: Expand dashboard PATCH handlers for edits** - `3352405` (feat)

**Plan metadata:** pending (docs commit will capture summary + state)

## Files Created/Modified
- `lib/domain/finance/payment-reference.ts` - shared payment reference formatter
- `lib/domain/finance/payments.ts` - re-exports shared formatter and uses it for payment DTOs
- `convex/tikkie.ts` - uses shared formatter when creating payment links
- `convex/orders.ts` - adds canonical order edit mutation and status helper usage
- `app/api/dashboard/orders/[orderId]/route.ts` - validated authenticated PATCH endpoint for order edits
- `tests/orders/order-detail-route.test.ts` - route coverage for GET/PATCH behavior

## Decisions Made
- Shared payment reference formatting now lives in a dedicated finance domain helper.
- Dashboard order edits should go through Convex mutations, not direct client-side data shaping.
- PATCH inputs must be explicit and narrow to prevent accidental provider-id edits.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Git index lock appeared while staging files in parallel; reran staging sequentially and completed the commit cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Order/payment reference contracts are stable for the next phase.
- Phase 26 plans 02-03 can build on canonical status propagation and validated dashboard edits.

---
*Phase: 26-order-ops-refresh*
*Completed: 2026-04-21*
