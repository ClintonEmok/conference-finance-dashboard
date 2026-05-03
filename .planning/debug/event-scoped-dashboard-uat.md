---
status: investigating
trigger: "Investigate the two UAT gaps recorded in `.planning/phases/27-event-scoped-dashboard/27-UAT.md`.\n\nIssues to diagnose:\n1. The chooser should be a fullscreen selection screen after login, and event switching should show a fullscreen loading screen.\n2. The event-scoped dashboard shell should keep only the event switcher in the sidebar.\n\nRead these files first:\n- `.planning/phases/27-event-scoped-dashboard/27-UAT.md`\n- `app/dashboard/layout.tsx`\n- `app/dashboard/page.tsx`\n- `app/dashboard/events/page.tsx`\n- `app/dashboard/dashboard-shell.tsx`\n- `app/dashboard/events/[slug]/layout.tsx`\n- `components/dashboard/event-switcher.tsx`\n- any `loading.tsx` under `app/dashboard` if present\n\nReturn a concise diagnosis for each issue with:\n- root cause\n- affected files\n- what is missing compared to the user's expectation\n- a fix direction that would be useful for a planner\n\nDo not change files."
created: 2026-04-21T00:00:00Z
updated: 2026-04-21T00:00:00Z
---

## Current Focus

hypothesis: Two layout issues: chooser is still rendered inside persistent dashboard shell, and event layout includes extra sidebar/nav beyond event switcher
test: Compare dashboard layout, event chooser page, event layout, switcher, and loading routes to expected fullscreen/simplified shell behavior
expecting: Find missing route boundaries and missing loading surface
next_action: Summarize root causes from inspected files

## Symptoms

expected: fullscreen chooser after login; fullscreen loading on event switch; only event switcher in sidebar for event-scoped shell
actual: UAT gaps indicate current implementation does not match those expectations
errors: 
reproduction: 
started: 2026-04-21

## Eliminated

## Evidence

- timestamp: 2026-04-21
  checked: UAT note
  found: Both issues are reported as major gaps; chooser needs fullscreen selection/loading behavior, and event-scoped shell should keep only event switcher in sidebar
  implication: The current route structure likely keeps the chooser inside the app shell and the event page shell too busy

- timestamp: 2026-04-21
  checked: app/dashboard/layout.tsx + app/dashboard/page.tsx + app/dashboard/loading.tsx
  found: `/dashboard` always renders `DashboardShell`; `/dashboard` only redirects to `/dashboard/events`; loading UI exists only at the dashboard segment and is shell-shaped, not a fullscreen chooser/loading view
  implication: The chooser cannot appear as a standalone fullscreen screen without a different layout/route boundary, and switching/loading currently inherits the persistent shell

- timestamp: 2026-04-21
  checked: app/dashboard/events/[slug]/layout.tsx + components/dashboard/event-switcher.tsx + app/dashboard/dashboard-shell.tsx
  found: Event layout renders a full secondary sidebar with active-event card, back-to-chooser link, and section nav; DashboardShell also renders EventSwitcher plus top-level navigation sections
  implication: The event-scoped dashboard is duplicating navigation chrome instead of keeping only the switcher in the sidebar

## Resolution

root_cause: 
  1) The chooser/loading experience is nested inside the persistent DashboardShell, so there is no fullscreen chooser or fullscreen transition state.
  2) The event-scoped layout still renders its own sidebar/navigation stack, so the sidebar is not limited to the event switcher.
fix: 
verification: 
files_changed: []
