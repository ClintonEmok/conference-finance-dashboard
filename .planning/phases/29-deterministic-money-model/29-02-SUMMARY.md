---
phase: 29-deterministic-money-model
plan: 02
subsystem: ui
tags: [nextjs, react, orders, sidebar, routing]

# Dependency graph
requires:
  - phase: 29-deterministic-money-model
    provides: deterministic finance totals and canonical amount readers
provides:
  - slug-scoped orders ledger pages
  - legacy redirect bridges for manage-orders routes
  - sidebar navigation targets for Orders and Reconciliation
affects: [29-04, 31-safe-migration-and-parity]

# Tech tracking
tech-stack:
  added: []
  patterns: [slug-scoped route ownership, redirect bridges, inline attendee disclosure]

key-files:
  created: [app/dashboard/events/[slug]/orders/page.tsx, app/dashboard/events/[slug]/orders/[orderId]/page.tsx]
  modified: [app/dashboard/manage-orders/page.tsx, app/dashboard/manage-orders/[orderId]/page.tsx, app/dashboard/events/[slug]/layout.tsx]

key-decisions:
  - "Event slug became the source of truth for the canonical orders surface."
  - "Legacy manage-orders URLs remain compatibility bridges only."
  - "Attendees are shown inline under each order so operators never need a separate detail hop for basic review."

patterns-established:
  - "Pattern 1: create slug-scoped pages first, then backfill legacy redirects."
  - "Pattern 2: keep event navigation visible in the event shell instead of global dashboards."

# Metrics
duration: 1min
completed: 2026-04-25
---

# Phase 29: Deterministic Money Model Summary

**Orders now live on slug-scoped event routes with inline attendee visibility and legacy URLs that safely redirect.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-25T16:23:57Z
- **Completed:** 2026-04-25T16:23:57Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments
- Added the canonical event-scoped orders ledger and order detail routes.
- Bridged old manage-orders URLs into the new event-scoped route tree.
- Exposed Orders and Reconciliation in the event shell navigation.

## Task Commits

1. **Task 1: Build the slug-scoped orders ledger and detail pages** - `97fd7e2` (feat)

## Files Created/Modified
- `app/dashboard/events/[slug]/orders/page.tsx` - slug-scoped ledger view
- `app/dashboard/events/[slug]/orders/[orderId]/page.tsx` - slug-scoped order detail view
- `app/dashboard/manage-orders/page.tsx` - legacy bridge redirect
- `app/dashboard/manage-orders/[orderId]/page.tsx` - legacy detail bridge redirect
- `app/dashboard/events/[slug]/layout.tsx` - adds Orders/Reconciliation navigation

## Decisions Made
- Keep attendee visibility inline under the order row or in the order detail view.
- Preserve filters, pagination, CSV export, and back navigation behavior while changing the route contract.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- None beyond routine type/route wiring.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Canonical orders pages are ready for human verification and reconciliation pairing.
- Sidebar navigation now exposes the event-scoped finance entrypoints.

---
*Phase: 29-deterministic-money-model*
*Completed: 2026-04-25*
