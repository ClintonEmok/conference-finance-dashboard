---
status: diagnosed
phase: 27-event-scoped-dashboard
source:
  - .planning/phases/27-event-scoped-dashboard/27-01-SUMMARY.md
  - .planning/phases/27-event-scoped-dashboard/27-02-SUMMARY.md
started: 2026-04-21T19:19:11Z
updated: 2026-04-21T20:35:04Z
---

## Current Test
[testing complete]

## Tests

### 1. Dashboard root redirects to chooser
expected: |
  Sign in and visit `/dashboard`.
  You should land on `/dashboard/events`, not the old broad overview, and the first screen should be the event chooser entry surface.
result: issue
reported: "pass but id like the chooser to be a fullscreen experience like a selection screen after login but the event switcher can stay. and when swtiching we need a fullscreen loading screen"
severity: major

### 2. Chooser feels event-first
expected: |
  On `/dashboard/events`, the page should clearly say `Choose an event`, show recent events before deeper filtering, and make `Open event` and `New event` the obvious primary actions.
result: pass

### 3. Event scope stays explicit
expected: |
  Open an event page such as `/dashboard/events/[slug]` or `/dashboard/events/[slug]/overview`.
  The shell should show the active event explicitly, let you switch to another event or back to `/dashboard/events`, and avoid feeling like the old broad command center.
result: issue
reported: "we only need the event switcher in the side bar"
severity: major

## Summary

total: 3
passed: 1
issues: 2
pending: 0
skipped: 0

## Gaps

- truth: "Dashboard chooser is a fullscreen selection screen after login, and event switching shows a fullscreen loading screen"
  status: failed
  reason: "User reported: pass but id like the chooser to be a fullscreen experience like a selection screen after login but the event switcher can stay. and when swtiching we need a fullscreen loading screen"
  severity: major
  test: 1
  root_cause: "The chooser is rendered inside the persistent dashboard shell, and event switching only has a shell-shaped loading state instead of a fullscreen route boundary."
  artifacts:
    - path: app/dashboard/layout.tsx
      issue: "Keeps the shell mounted around chooser/loading states"
    - path: app/dashboard/page.tsx
      issue: "Redirects into the chooser instead of owning a fullscreen entry surface"
    - path: app/dashboard/loading.tsx
      issue: "Loading UI matches the shell rather than a fullscreen transition"
    - path: components/dashboard/event-switcher.tsx
      issue: "Switches events without a dedicated fullscreen transition state"
  missing:
    - "A fullscreen chooser route or layout that hides the dashboard shell after login"
    - "A fullscreen loading state when switching between events"
  debug_session: ses_24e3eaee5ffe0uRcQ95WNGNBDt
- truth: "The event-scoped dashboard shell keeps only the event switcher in the sidebar"
  status: failed
  reason: "User reported: we only need the event switcher in the side bar"
  severity: major
  test: 3
  root_cause: "The event layout still renders a second sidebar rail with event details and section navigation, while the global shell also keeps its own chrome, so the sidebar is doing more than switch events."
  artifacts:
    - path: app/dashboard/dashboard-shell.tsx
      issue: "Sidebar still includes extra global navigation and footer chrome"
    - path: app/dashboard/events/[slug]/layout.tsx
      issue: "Adds active event details, back link, and section nav inside the sidebar"
    - path: components/dashboard/event-switcher.tsx
      issue: "Is embedded in a sidebar that still contains more than switcher UI"
  missing:
    - "A minimal sidebar containing only the event switcher"
    - "A separate placement for the remaining event navigation and status UI"
  debug_session: ses_24e3eaee5ffe0uRcQ95WNGNBDt
