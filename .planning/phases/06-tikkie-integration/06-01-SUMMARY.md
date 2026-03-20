---
phase: 06-tikkie-integration
plan: 01
subsystem: payments
tags: [tikkie, nextjs, prisma, webhooks, polling, attendee-detail]

# Dependency graph
requires:
  - phase: 05-room-allocation-operator-flow-polish
    provides: Workflow-first dashboard handoffs between outstanding balances, attendee detail, and accommodation
  - phase: 03-finance-visibility-reconciliation
    provides: Outstanding-balance rows and operator finance follow-up context
provides:
  - Provider-safe Tikkie create/list contracts with latest-link-first summaries and open-link freshness metadata
  - Webhook and manual polling sync behavior that stays monotonic, deduplicated, and explicit for missing links
  - Attendee detail Tikkie projection with latest link, prior history, and server-owned generation defaults
affects: [06-02, tikkie-ui, operator-follow-up]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Keep Tikkie operator payloads latest-link-first with top-level latest/history projection instead of client-side reshaping
    - Derive stale versus fresh trust signals only for open links from providerLastCheckedAt metadata
    - Short-circuit duplicate webhook notifications via persisted providerNotificationKey before calling the provider again

key-files:
  created:
    - tests/tikkie/tikkie-links.test.ts
  modified:
    - lib/domain/finance/tikkie-links.ts
    - app/api/dashboard/tikkie-links/route.ts
    - lib/integrations/tikkie/webhook.ts
    - lib/domain/finance/attendee-detail.ts
    - tests/tikkie/webhook-route.test.ts

key-decisions:
  - "Expose a server-owned latestLink/history contract so the Phase 6 UI plan does not need to rebuild ordering or freshness rules."
  - "Treat freshness as an operator trust signal for open links only; terminal paid and expired links do not carry stale badges."
  - "Handle duplicate and missing webhook notifications explicitly in the domain layer so webhook delivery remains best-effort but trustworthy."

patterns-established:
  - "Tikkie summary pattern: return `latestLink`, `history`, `providerLastCheckedAt`, and `latestLinkCheckState` from the dashboard API."
  - "Attendee follow-up pattern: project Tikkie generation defaults and route endpoints alongside finance totals in attendee detail."

# Metrics
duration: 11 min
completed: 2026-03-20
---

# Phase 6 Plan 01: Harden Tikkie backend contracts, status trust, and attendee-detail link projection Summary

**Tikkie backend contracts now validate provider-safe inputs, keep open-link status trust explicit through freshness metadata, and project attendee detail follow-up data as one latest-link-first server contract.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-20T02:48:35Z
- **Completed:** 2026-03-20T03:00:03Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Tightened Tikkie create/list validation around positive amounts, 35-character limits, and future expiry dates.
- Hardened webhook and poll refresh behavior with duplicate-notification short-circuiting, explicit missing-link handling, and protected manual sync coverage.
- Extended attendee detail with latest-link-first Tikkie context, history, freshness, and generation defaults for the next UI plan.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tighten Tikkie create/list contracts around provider-safe inputs and latest-link summaries** - `2ee3d99` (feat)
2. **Task 2: Verify webhook and fallback polling keep payment state trustworthy** - `b7de807` (fix)
3. **Task 3: Shape attendee detail data for latest link, history, and follow-up context** - `2027cee` (feat)

## Files Created/Modified
- `lib/domain/finance/tikkie-links.ts` - central validation, freshness projection, latest-link summaries, and duplicate-safe refresh behavior.
- `app/api/dashboard/tikkie-links/route.ts` - protected API now reuses the shared validation rules and returns the latest-link-first contract.
- `lib/integrations/tikkie/webhook.ts` - webhook processing now reports duplicate and missing-link outcomes explicitly.
- `lib/domain/finance/attendee-detail.ts` - attendee detail now includes Tikkie summary/history, freshness, and generation defaults.
- `tests/tikkie/tikkie-links.test.ts` - contract, sync, and protected-route coverage for the Tikkie backend foundation.
- `tests/tikkie/webhook-route.test.ts` - route response expectations updated for the explicit webhook result shape.

## Decisions Made
- Used one shared server-side validation path for create requests so route parsing and domain creation cannot drift on Tikkie constraints.
- Kept stale/fresh derivation limited to open links because paid and expired links do not need operator freshness warnings.
- Returned action endpoints and generation defaults from attendee detail so the next UI plan can stay thin and server-owned.

## Verification Results

1. `npm run test -- tests/tikkie/tikkie-links.test.ts`
2. `npm run test -- tests/tikkie/webhook-route.test.ts tests/tikkie/tikkie-links.test.ts && npm run typecheck`
3. `npm run typecheck && npm run build`

## Deviations from Plan

None - plan executed exactly as written.

## Authentication Gates

None.

## Issues Encountered

- Next.js still reports existing workspace-root and middleware deprecation warnings during build, but the plan verification completed successfully.

## User Setup Required

- Real end-to-end provider verification still requires `TIKKIE_API_KEY`, `TIKKIE_APP_TOKEN`, and the active `/api/webhooks/tikkie` callback subscription configured in Tikkie.

## Next Phase Readiness

- Phase 6 UI work can now consume one stable latest-link-first contract from both outstanding balances and attendee detail.
- Operators will get freshness and history context without exposing raw provider enums in the next surface-level plan.

---
*Phase: 06-tikkie-integration*
*Completed: 2026-03-20*
