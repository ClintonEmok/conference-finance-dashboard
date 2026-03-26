---
phase: quick-260326-i7e-the-manual-payment-didnt-update-the-outs
plan: "01"
subsystem: payments
tags: [nextjs, route-handler, reconciliation, manual-payments, provider-order-id, vitest]

# Dependency graph
requires:
  - phase: 260326-hgy
    provides: deterministic manual payment order selection and search query compatibility
provides:
  - Manual payment and assign-dialog writes now persist providerOrderId linkage for new manual matches
  - Reconciliation outstanding calculations subtract matched payment totals by provider order identity, with legacy Convex-id fallback
  - `/api/payments` now enriches linked rows with resolved order details via provider-id first lookup and id fallback
affects: [reconciliation, payment-listing, manual-payment-entry, payments-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Treat Ticket Tailor providerOrderId as the canonical cross-surface payment/order link identifier
    - Resolve legacy Convex document ids at read time so old payment records remain visible without schema migration

key-files:
  created:
    - tests/reconciliation/reconciliation-outstanding.test.ts
    - tests/payments/payments-route.test.ts
  modified:
    - components/payments/manual-entry-form.tsx
    - components/payments/assign-dialog.tsx
    - lib/domain/finance/payments.ts
    - lib/domain/finance/reconciliation.ts
    - app/api/payments/route.ts

key-decisions:
  - "Manual payment flows should submit providerOrderId from selected orders to keep reconciliation and payments views aligned."
  - "Read-time compatibility should support legacy payment.orderId Convex ids via fallback lookup instead of requiring immediate data migration."

patterns-established:
  - "API route tests mock requireApiUser plus convexQuery/listPayments to validate contract behavior independently from Convex runtime."

# Metrics
duration: 6m 59s
completed: 2026-03-26
---

# Phase Quick Task 260326-i7e Plan 01 Summary

**Manual payment links now consistently use provider order ids, reconciliation outstanding values drop when linked payments exist, and payments API rows include resolved Ticket Tailor order context.**

## Performance

- **Duration:** 6m 59s
- **Started:** 2026-03-26T12:12:58Z
- **Completed:** 2026-03-26T12:19:57Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Updated manual payment creation and manual assignment flows to send `providerOrderId` for stable order linkage.
- Made reconciliation outstanding math payment-aware by subtracting matched manual/auto payments and supporting legacy-id fallback resolution.
- Enriched `/api/payments` rows with resolved order details and added regression coverage for provider-first plus fallback lookup behavior.

## Task Commits

1. **Task 1: Align manual payment order linkage to providerOrderId across UI + domain entry points** - `52bc723` (feat)
2. **Task 2: Make reconciliation outstanding payment-aware with provider-order matching** - `d1a76c1` (feat)
3. **Task 3: Enrich payments API rows with related order details and add route regression coverage** - `3431335` (feat)

## Files Created/Modified

- `components/payments/manual-entry-form.tsx` - Manual submit payload now uses selected order `providerOrderId` for new payment links.
- `components/payments/assign-dialog.tsx` - Assignment PATCH payload now sends `providerOrderId` instead of Convex document id.
- `lib/domain/finance/payments.ts` - Added required trimmed `orderId` normalization and stable mapped `orderId` output handling.
- `lib/domain/finance/reconciliation.ts` - Added matched-payment aggregation and legacy order-id resolution fallback before outstanding calculation.
- `app/api/payments/route.ts` - Added provider-first/fallback order resolution and emitted populated `order` blocks in response rows.
- `tests/reconciliation/reconciliation-outstanding.test.ts` - Regression tests for outstanding reduction and legacy-id compatibility path.
- `tests/payments/payments-route.test.ts` - Route tests for unauthorized flow, provider lookup enrichment, and Convex-id fallback.

## Decisions Made

- Provider order id is the canonical identifier for newly linked manual payments across entry and assignment paths.
- Backward compatibility is handled in read paths (reconciliation and payments API enrichment) so historical payments with legacy ids still resolve correctly.

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Issues Encountered

- Manual browser verification step (`/dashboard/reconciliation`) was not executed in this CLI-only run; automated verification commands all passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Manual payment link writes and read models are now aligned on provider order identity.
- Reconciliation and payments views have regression coverage for the specific mismatch that previously hid outstanding/payment linkage updates.

---

_Phase: quick-260326-i7e-the-manual-payment-didnt-update-the-outs_
_Completed: 2026-03-26_
