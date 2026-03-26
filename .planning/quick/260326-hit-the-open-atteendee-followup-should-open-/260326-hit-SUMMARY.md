---
phase: quick-260326-hit-the-open-atteendee-followup-should-open-
plan: "01"
subsystem: ui
tags: [nextjs, reconciliation, attendees, navigation, vitest]

# Dependency graph
requires:
  - phase: quick-260326-e0r-fix-the-attendeedetail-page-the-api-retu
    provides: protected attendee detail route contract reused by follow-up navigation
provides:
  - detail-first reconciliation follow-up href builder with safe attendees-list fallback
  - attendee-id resolution callback plumbing from order attendee breakdown into reconciliation row CTAs
  - regression tests for follow-up href query-param continuity
affects:
  [reconciliation-ui, attendee-detail-navigation, operator-follow-up-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - centralized follow-up URL construction in domain helper instead of inline JSX string templates
    - callback-based attendee id resolution to keep reconciliation CTA routing reactive to async attendee loads

key-files:
  created:
    - lib/domain/finance/reconciliation-follow-up.ts
    - tests/reconciliation/reconciliation-follow-up.test.ts
  modified:
    - components/dashboard/order-attendee-breakdown.tsx
    - app/dashboard/reconciliation/page.tsx

key-decisions:
  - "Keep reconciliation follow-up URL generation in a framework-agnostic helper shared by desktop/mobile CTA paths."
  - "Store resolved attendee ids by provider order id so CTAs can upgrade from fallback list routes to detail routes once attendee payloads load."

patterns-established:
  - "Detail-first with safe fallback: route to /dashboard/attendees/[attendeeId] when available, otherwise preserve existing /dashboard/attendees?search=... behavior."
  - "Back-navigation continuity: always preserve reconciliation source/order/event context in query params."

# Metrics
duration: 4m 6s
completed: 2026-03-26
---

# Phase quick 260326-hit Plan 01: Open attendee follow-up detail routing summary

**Reconciliation row CTAs now resolve directly to attendee detail routes with preserved reconciliation context, while safely falling back to the filtered attendees list when no attendee id is available.**

## Performance

- **Duration:** 4m 6s
- **Started:** 2026-03-26T11:40:46Z
- **Completed:** 2026-03-26T11:44:52Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added a pure domain helper that builds follow-up hrefs for both detail-first and fallback list flows.
- Added targeted Vitest regression coverage for reconciliation follow-up link construction and query-param wiring.
- Wired reconciliation desktop/mobile CTA links to attendee-id resolution state coming from `OrderAttendeeBreakdown`.

## Task Commits

1. **Task 1: Add detail-first reconciliation follow-up href builder with fallback** - `0a6361a` (feat)
2. **Task 2: Wire reconciliation row actions to resolved attendee detail targets** - `3b06738` (feat)

_Plan metadata commit added below after summary/state update._

## Files Created/Modified

- `lib/domain/finance/reconciliation-follow-up.ts` - Centralized reconciliation follow-up href builder with detail-first + fallback logic.
- `tests/reconciliation/reconciliation-follow-up.test.ts` - Regression tests covering detail route and fallback attendees-list route branches.
- `components/dashboard/order-attendee-breakdown.tsx` - Emits deterministic attendee-id candidate per order once attendee payload resolves.
- `app/dashboard/reconciliation/page.tsx` - Tracks resolved attendee ids and builds CTA hrefs through the shared helper for desktop and mobile layouts.

## Decisions Made

- Introduced a domain-level href helper so reconciliation CTA URL behavior is defined once and reused across both responsive layouts.
- Kept fallback navigation intact by retaining attendees list filter URL generation whenever no attendee id is resolved yet.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Reconciliation follow-up navigation now supports direct detail routing with context continuity and regression coverage.
- Manual browser verification remains available to confirm end-to-end click-through behavior in the UI.

---

_Phase: quick-260326-hit-the-open-atteendee-followup-should-open-_
_Completed: 2026-03-26_
