---
phase: 27-event-scoped-dashboard
plan: 03
subsystem: ui
tags: [nextjs, react, dashboard, routing, loading-state]

# Dependency graph
requires:
  - phase: 27-event-scoped-dashboard / plan 01
    provides: chooser-first dashboard entry and event chooser surface
  - phase: 27-event-scoped-dashboard / plan 02
    provides: slimmed shell and shared event switcher baseline
provides:
  - route-aware dashboard surface that only mounts the shell for slug-scoped event routes
  - fullscreen chooser entry for `/dashboard`, `/dashboard/events`, and `/dashboard/events/new`
  - viewport-filling dashboard loading transition for chooser entry and event switching
affects: [event-scoped-dashboard, dashboard-shell, chooser-entry, route-transitions]

# Tech tracking
tech-stack:
  added: []
  patterns: [route-aware client shell gating, fullscreen route-transition loading]

key-files:
  created: [app/dashboard/dashboard-surface.tsx]
  modified: [app/dashboard/layout.tsx, app/dashboard/loading.tsx]

key-decisions:
  - "Keep `/dashboard` as the auth-gated bridge while moving shell visibility into a client route gate."
  - "Treat chooser-entry routes as fullscreen content and reserve the persistent shell for slug-scoped event pages."
  - "Replace the old shell-shaped loading skeleton with a fullscreen transition screen."

patterns-established:
  - "Pattern 1: server layout handles auth, client surface handles route-aware chrome decisions"
  - "Pattern 2: route loading UI should match the navigation experience instead of the underlying page shell"

# Metrics
duration: 10min
completed: 2026-04-21
---

# Phase 27: Event-Scoped Dashboard Summary

**Fullscreen chooser entry and fullscreen loading transition for the event-scoped dashboard**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-21T20:35:08Z
- **Completed:** 2026-04-21T20:45:08Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added a route-aware dashboard surface that hides the shell on chooser-entry routes.
- Kept slug-scoped event pages inside the persistent dashboard shell.
- Replaced the dashboard loading skeleton with a fullscreen transition screen.

## Task Commits

1. **Task 1: Add a route-aware dashboard surface** - `199acdf` (feat)
2. **Task 2: Replace the shell-shaped loading state** - `1c7effd` (feat)

**Plan metadata:** pending

## Files Created/Modified
- `app/dashboard/dashboard-surface.tsx` - client gate that decides whether to mount the shell
- `app/dashboard/layout.tsx` - delegates shell visibility to `DashboardSurface`
- `app/dashboard/loading.tsx` - fullscreen loading transition UI

## Decisions Made
- Kept chooser-first routing intact and avoided moving the chooser off `/dashboard/events`.
- Used path-based shell gating instead of restructuring the chooser or event layouts.
- Focused the loading screen on fullscreen route transitions rather than in-shell skeletons.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The implementation is ready for manual verification of the fullscreen chooser and fullscreen loading experience.
- Awaiting the blocking human verification checkpoint before any further phase work.

---
*Phase: 27-event-scoped-dashboard*
*Completed: 2026-04-21*
