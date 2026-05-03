---
phase: 27-event-scoped-dashboard
plan: 02
subsystem: ui
tags:
  - nextjs
  - dashboard
  - navigation
  - slug-routing
  - convex
requires:
  - phase: 27-event-scoped-dashboard-01
    provides: chooser-first dashboard entry and redirect-only root routing
provides:
  - A shared event switcher that routes between chooser and slug-scoped event pages.
  - A slimmed global dashboard shell that surfaces event switching first.
  - An event-scoped layout that reuses the shared switcher and receives the route slug directly.
affects:
  - event-scoped dashboard chrome
  - future event navigation surfaces
  - dashboard primary nav cleanup
tech-stack:
  added: []
  patterns:
    - shared slug-aware event switcher for dashboard chrome
    - minimal global shell with event-first hierarchy
    - scoped layout passes route slug directly into shared navigation
key-files:
  created:
    - components/dashboard/event-switcher.tsx
  modified:
    - app/dashboard/dashboard-shell.tsx
    - app/dashboard/events/[slug]/layout.tsx
key-decisions:
  - "`EventSwitcher` should take `currentSlug` so the active event is explicit in both global and scoped chrome."
  - "The global shell should remove Overview and hide Finance/Operations from primary navigation."
  - "The scoped event layout should pass the route slug directly into the shared switcher."
patterns-established:
  - "Pattern 1: a shared select-based switcher can keep chooser and slug-scoped routes in sync."
  - "Pattern 2: dashboard chrome should stay lightweight and navigation-focused rather than mirroring workspace content."
duration: 24min
completed: 2026-04-21
---

# Phase 27 Plan 02: Shared Event Switcher and Slim Shell Summary

**A shared slug-aware event switcher now anchors both the global dashboard shell and event-scoped layouts, making event switching obvious without restoring the old broad command-center framing.**

## Performance

- **Duration:** ~24 min
- **Started:** 2026-04-21T18:45:00Z
- **Completed:** 2026-04-21T19:09:10Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Added a reusable `EventSwitcher` that routes to chooser or slug-scoped event pages.
- Slimmed the global shell so event switching appears first and broad Finance/Operations navigation is no longer primary.
- Reused the same switcher in scoped event layouts while keeping the public-page link and sub-navigation.

## Task Commits

1. **Task 1: Build a shared dashboard event switcher** - `0836f68` (feat)
2. **Task 2: Put the shared switcher into the global dashboard shell** - `9cb09bc` (feat)
3. **Task 3: Reuse the switcher in event-scoped layouts** - `8021a61` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified
- `components/dashboard/event-switcher.tsx` - shared chooser/slug switcher
- `app/dashboard/dashboard-shell.tsx` - slimmer global shell and nav hierarchy
- `app/dashboard/events/[slug]/layout.tsx` - scoped layout using the shared switcher

## Decisions Made
- `EventSwitcher` accepts `currentSlug` so the active event is always explicit.
- The global shell should read as event-first utility chrome, not a broad operations console.
- The scoped layout should pass its route slug directly to the switcher and keep the chooser link available.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 27 is complete and the dashboard now has a chooser-first entry plus event-aware chrome.
- Later phases can refine remaining event-scoped utility surfaces without changing the core routing contract.

---
*Phase: 27-event-scoped-dashboard*
*Completed: 2026-04-21*
