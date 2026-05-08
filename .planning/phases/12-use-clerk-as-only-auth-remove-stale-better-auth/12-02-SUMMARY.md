---
phase: 12-use-clerk-as-only-auth-remove-stale-better-auth
plan: 02
subsystem: auth
tags: [clerk, nextjs, app-router, middleware, dashboard]
requires:
  - phase: 12-use-convex
    provides: Convex-backed dashboard app shell and existing protected routes.
  - phase: quick-260326-163-add-clerk-to-next-js-app-router
    provides: Clerk provider and proxy entry wiring for the App Router.
  - phase: 12-use-clerk-as-only-auth-remove-stale-better-auth
    provides: Shared Clerk server auth helpers and Convex Clerk token bridge from plan 12-01.
provides:
  - Clerk middleware protection for `/dashboard(.*)` routes.
  - Dashboard server components guarded by `requirePageUser` instead of Better Auth sessions.
  - Clerk-based logout and `/login` compatibility redirect flow.
affects: [12-03, 12-04, auth, dashboard]
tech-stack:
  added: []
  patterns:
    - Dashboard pages should rely on Clerk middleware plus `requirePageUser` instead of manual `/login` redirects.
    - Legacy `/login` remains a Clerk redirect shim rather than an interactive Better Auth form.
key-files:
  created:
    - .planning/phases/12-use-clerk-as-only-auth-remove-stale-better-auth/12-02-SUMMARY.md
  modified:
    - proxy.ts
    - app/dashboard/layout.tsx
    - app/dashboard/integrations/page.tsx
    - app/dashboard/logout-button.tsx
    - app/login/page.tsx
    - app/login/login-form.tsx
key-decisions:
  - Protect only `/dashboard(.*)` in Clerk middleware so public pages and webhook routes keep their current access behavior.
  - Reuse `requirePageUser()` for dashboard pages to keep signed-in UX and redirect behavior consistent across server components.
  - Keep `/login` as a compatibility route that immediately hands off to Clerk sign-in instead of serving a Better Auth form.
patterns-established:
  - "Protected dashboard server components should call `requirePageUser(returnBackUrl)` rather than `auth.api.getSession(...)`."
  - "Dashboard sign-out uses Clerk `SignOutButton` with an explicit post-logout redirect."
requirements-completed: []
duration: 2 min
completed: 2026-03-26
---

# Phase 12 Plan 02: Protect dashboard routes with Clerk and replace the old login/logout flow Summary

**Clerk now protects dashboard routes in middleware, guards dashboard pages through `requirePageUser`, and replaces the Better Auth login/logout UX with Clerk redirects.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-26T00:36:49Z
- **Completed:** 2026-03-26T00:39:14Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added Clerk middleware protection for `/dashboard(.*)` before dashboard pages render.
- Moved dashboard layout and integrations page auth checks onto the shared Clerk page helper.
- Replaced Better Auth login/logout UI with Clerk sign-out and a redirect-only `/login` compatibility page.

## Task Commits

Each task was committed atomically:

1. **Task 1: Protect dashboard routes in Clerk middleware** - `eb6b386` (feat)
2. **Task 2: Replace dashboard page guards and logout with Clerk** - `2bd4ecd` (feat)

**Plan metadata:** pending

## Files Created/Modified

- `proxy.ts` - protects `/dashboard(.*)` with `createRouteMatcher()` and `auth.protect()`.
- `app/dashboard/layout.tsx` - uses `requirePageUser("/dashboard")` and preserves `DashboardShell` email props.
- `app/dashboard/integrations/page.tsx` - uses `requirePageUser("/dashboard/integrations")` before loading integration status.
- `app/dashboard/logout-button.tsx` - swaps Better Auth client logout for Clerk `SignOutButton` with redirect to `/`.
- `app/login/page.tsx` - turns `/login` into a Clerk sign-in handoff that preserves a safe callback URL.
- `app/login/login-form.tsx` - removed the stale Better Auth email/password form from the live route flow.

## Decisions Made

- Protected only dashboard routes in `proxy.ts` so existing public pages and webhook paths remain unaffected while Clerk takes over operator auth.
- Reused the shared `requirePageUser()` helper for dashboard pages instead of duplicating direct Clerk calls in each server component.
- Kept `/login` as a compatibility handoff route so older links still land users in Clerk sign-in with the intended return URL.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration.** See [12-USER-SETUP.md](./12-USER-SETUP.md) for:

- Environment variables to add
- Clerk JWT template / audience setup
- Convex deployment issuer-domain configuration

## Next Phase Readiness

- Ready for `12-03-PLAN.md` to migrate protected API routes and related tests from Better Auth to Clerk.
- Dashboard route protection, login handoff, and sign-out behavior now assume Clerk is the only interactive auth flow for operator pages.

---

_Phase: 12-use-clerk-as-only-auth-remove-stale-better-auth_
_Completed: 2026-03-26_
