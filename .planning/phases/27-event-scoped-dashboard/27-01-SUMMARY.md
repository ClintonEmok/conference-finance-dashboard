---
phase: 27-event-scoped-dashboard
plan: 01
subsystem: ui
tags:
  - nextjs
  - dashboard
  - chooser
  - navigation
  - redirect
requires:
  - phase: 26-order-ops-refresh
    provides: canonical order/dashboard foundation and the current admin shell baseline
provides:
  - `/dashboard` now acts as a redirect-only bridge into the event chooser.
  - The chooser page is the canonical landing surface for event selection and creation.
  - Event cards emphasize recent work first while preserving public URLs and new-event entry.
affects:
  - 27-event-scoped-dashboard-02
  - event-scoped navigation
  - dashboard landing flow
tech-stack:
  added: []
  patterns:
    - redirect-only dashboard root as a chooser bridge
    - event-first landing surface with recent-event emphasis
key-files:
  created: []
  modified:
    - app/dashboard/page.tsx
    - app/dashboard/events/page.tsx
key-decisions:
  - "`/dashboard` should hand off to `/dashboard/events` instead of rendering the old broad overview."
  - "`/dashboard/events` is the canonical chooser/home surface for admins."
  - "The chooser should foreground recent events and keep `Open event` / `New event` as the primary actions."
patterns-established:
  - "Pattern 1: server-side redirect routes can be used as thin entry bridges for authenticated dashboard flows."
  - "Pattern 2: chooser pages should lead with the next action and keep filters secondary."
duration: 24min
completed: 2026-04-21
---

# Phase 27 Plan 01: Event Chooser Entry Summary

**Dashboard entry now lands admins on the event chooser instead of the old broad overview, with recent events and new-event creation treated as the primary next steps.**

## Performance

- **Duration:** ~24 min
- **Started:** 2026-04-21T18:45:00Z
- **Completed:** 2026-04-21T19:09:10Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced the dashboard root with a redirect-only landing route.
- Reworked the chooser page to lead with `Choose an event`, `Open event`, and `New event`.
- Kept published event URLs visible while making the chooser feel event-first.

## Task Commits

1. **Task 1: Turn the dashboard root into an event-first entry point** - `eb34bde` (feat)
2. **Task 2: Promote the event list into the primary chooser** - `71b8f16` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified
- `app/dashboard/page.tsx` - redirect-only dashboard root
- `app/dashboard/events/page.tsx` - event-first chooser surface

## Decisions Made
- `/dashboard` is now a bridge route, not a broad command center.
- `/dashboard/events` remains the canonical chooser/home surface.
- The chooser prioritizes recent events and keeps create/open actions obvious.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The event chooser is ready for shared event-switching chrome.
- Event-scoped shell/layout work can now rely on the chooser as the main entry point.

---
*Phase: 27-event-scoped-dashboard*
*Completed: 2026-04-21*
