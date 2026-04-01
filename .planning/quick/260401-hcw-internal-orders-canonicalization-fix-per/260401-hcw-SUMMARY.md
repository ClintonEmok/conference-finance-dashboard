---
phase: 26-canonical-runtime-contract
plan: 01
subsystem: payments
tags: [convex, nextjs, vitest, reconciliation, canonical-orders]

# Dependency graph
requires:
  - phase: 24-canonical-orders-rewrite
    provides: canonical orders table and provider extension model
  - phase: 25-concerns-fixing
    provides: stabilized order/payment dashboard behavior before canonicalization hardening
provides:
  - Internal order sync now persists and backfills canonical totals for integration orders
  - Payment writes resolve provider-facing references to canonical `orders._id`
  - Read/API/UI contracts preserve explicit nulls for missing provider ids and totals
  - Regression coverage for canonical write paths, provider-id lookup precedence, and null-safe reconciliation
affects:
  [
    phase-26 runtime contract hardening,
    future money-model work,
    provider redesign preparation,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      canonical-order-id-on-write,
      null-safe-finance-contracts,
      provider-id-first-lookup,
    ]

key-files:
  created:
    - tests/finance/internal-orders-canonicalization.test.ts
  modified:
    - convex/sync/orders.ts
    - convex/payments.ts
    - lib/domain/finance/payments.ts
    - convex/orders.ts
    - lib/types/order.ts
    - lib/domain/finance/order-ledger.ts
    - lib/domain/finance/reconciliation.ts
    - lib/domain/finance/matched-payments.ts
    - app/api/payments/route.ts
    - app/dashboard/orders/page.tsx
    - app/dashboard/orders/[orderId]/page.tsx
    - app/dashboard/reconciliation/page.tsx
    - tests/payments/payments-route.test.ts
    - tests/reconciliation/reconciliation-outstanding.test.ts

key-decisions:
  - "Canonical order ids are always write-time truth for payment foreign keys; provider ids are lookup inputs only."
  - "Missing provider ids and totals are represented as null end-to-end instead of empty string/zero fallbacks."

patterns-established:
  - "Provider-order resolution pattern: provider lookup first, canonical-order-id fallback second."
  - "UI financial math treats unknown totals as unknown, not zero-valued money."

# Metrics
duration: 9min
completed: 2026-04-01
---

# Phase 26 Plan 01: Internal Orders Canonicalization Fix Summary

**Canonical internal orders now persist/backfill totals and payment assignments store canonical `orders._id`, with null-safe finance contracts through API and dashboard surfaces.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-01T10:36:06Z
- **Completed:** 2026-04-01T10:44:46Z
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments

- Added internal backfill support for integration orders missing `totalAmountMinor`, while only patching rows that truly lack canonical totals.
- Canonicalized payment write paths so provider-facing order references are resolved to canonical `orders._id` before insert/assignment.
- Updated order/reconciliation/payment contracts and dashboards to preserve explicit missing-data states (`null`) and render clear placeholders.

## Task Commits

Each task was committed atomically:

1. **Task 1: Canonicalize internal writes and backfill missing totals** - `1136dc0` (feat)
2. **Task 2: Make finance reads and API contracts null-safe** - `48eb017` (feat)
3. **Task 2 follow-up: Validator alignment for nullable provider ids** - `ce136fb` (fix)
4. **Task 3: Update dashboard surfaces and contract tests** - `97951d6` (feat)

_Note: Task 2 required a small post-commit validator correction to keep Convex return validators aligned with the new nullable contract._

## Files Created/Modified

- `convex/sync/orders.ts` - Added missing-total backfill helper and mutation.
- `convex/payments.ts` - Enforced canonical order-id resolution for payment writes.
- `lib/domain/finance/payments.ts` - Canonicalized write-side order id normalization/resolution.
- `convex/orders.ts` - Returned nullable provider ids/totals in ledger and reconciliation-facing shapes.
- `lib/types/order.ts` - Updated order validators for nullable ledger fields.
- `lib/domain/finance/order-ledger.ts` - Updated ledger row types to nullable provider/amount fields.
- `lib/domain/finance/reconciliation.ts` - Preserved missing amount/provider id states and null-safe outstanding logic.
- `lib/domain/finance/matched-payments.ts` - Matched totals by canonical provider key with null-safe order keys.
- `app/api/payments/route.ts` - Preserved nullable resolved order facts instead of coercing defaults.
- `app/dashboard/orders/page.tsx` - Rendered missing provider id/amount placeholders and null-safe page totals.
- `app/dashboard/orders/[orderId]/page.tsx` - Displayed explicit missing states and avoided fake 0%-coverage semantics.
- `app/dashboard/reconciliation/page.tsx` - Consumed nullable contract fields and surfaced missing amount/provider states.
- `tests/finance/internal-orders-canonicalization.test.ts` - Added canonicalization regression coverage.
- `tests/payments/payments-route.test.ts` - Locked provider lookup precedence + null order-fact preservation.
- `tests/reconciliation/reconciliation-outstanding.test.ts` - Locked missing-amount reconciliation behavior.

## Decisions Made

- Store canonical `orders._id` as the only persisted payment foreign key, regardless of whether input is provider id or legacy order id.
- Keep missing finance facts explicit (`null`) through Convex validators, domain DTOs, API responses, and dashboard rendering.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Nullable validator mismatch after contract hardening**

- **Found during:** Task 2 (Make finance reads and API contracts null-safe)
- **Issue:** `getOrderWithAttendees` validator still required non-null `providerOrderId` while Task 2 made the field nullable.
- **Fix:** Updated Convex return validator and response mapping to accept/emit nullable provider ids.
- **Files modified:** `convex/orders.ts`
- **Verification:** Targeted tests pass and build succeeds.
- **Committed in:** `ce136fb`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary contract-consistency fix; no scope creep.

## Issues Encountered

- Full `pnpm typecheck` failed due to pre-existing accommodation test fixture typing (`pendingAssignments` missing) unrelated to this plan’s files; used successful `pnpm build` plus targeted test suites as the plan’s compile verification path.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Runtime contract is now safer for phase-26 follow-on work because missing provider ids/totals are explicit and canonical order-id writes are enforced.
- Remaining concern: unrelated accommodation test fixture typing should be cleaned in a separate scope before relying on global `pnpm typecheck` as a strict gate.

---

_Phase: 26-canonical-runtime-contract_
_Completed: 2026-04-01_
