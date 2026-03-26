---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: Completed 12-02-PLAN.md
last_updated: "2026-03-26T00:39:36Z"
progress:
  total_phases: 15
  completed_phases: 8
  total_plans: 28
  completed_plans: 25
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-18)

- **Core value:** One trusted dashboard for church conference finance operations.
- **Current focus:** Phase 12 — use-clerk-as-only-auth-remove-stale-better-auth.

## Current Position

- **Phase:** 12 of 15 — `12-use-clerk-as-only-auth-remove-stale-better-auth`
- **Plan:** 3 of 4
- **Status:** In progress
- **Last activity:** 2026-03-26 — Completed `12-02-PLAN.md`
- **Progress:** `[█████████░]` 25/28 plans documented, Phase 12 at 2/4 plans complete

## Alignment Status

- Clerk is now the active auth provider for the root app shell, dashboard middleware, dashboard page guards, and dashboard login/logout UX.
- Convex already receives Clerk identity tokens through the client provider bridge from 12-01.
- Remaining migration scope is API route guards/tests (12-03) and Better Auth runtime/package cleanup plus end-to-end verification (12-04).

## Key Decisions

Recent decisions that future work should preserve:

- [12-01] Preserve the existing `UNAUTHORIZED` JSON payload in one Clerk-native helper so API route consumers do not change during migration.
- [12-01] Keep `ClerkProvider` outermost and pass Clerk `useAuth` into `ConvexProviderWithClerk` for authenticated Convex requests.
- [12-02] Protect only `/dashboard(.*)` in `proxy.ts` so public pages and webhook routes keep their current access behavior.
- [12-02] Use `requirePageUser(returnBackUrl)` for dashboard server components instead of direct Better Auth session checks.
- [12-02] Keep `/login` as a compatibility route that immediately hands off to Clerk sign-in with a safe return URL.
- [260326-163] Use Clerk's current App Router `proxy.ts` + `clerkMiddleware()` entrypoint instead of legacy Better Auth middleware.
- [05-02] Keep dashboard navigation centered on overview, finance follow-up, attendees, and rooms as one operator command center.
- [06-01] Keep latest-link-first Tikkie presentation and freshness metadata centralized in backend contracts.
- [10-05] Calculate payment status at the order level using order total vs linked payment sums.
- [11-04] Keep server-side API routes on the `lib/convex` bridge rather than importing Convex functions directly into route handlers.

## Active Patterns / Constraints

- Protected server code should import helpers from `lib/auth/server.ts` rather than calling Better Auth or raw Clerk checks ad hoc.
- Dashboard sign-out should use Clerk `SignOutButton` with an explicit redirect target.
- Public webhook routes must remain outside Clerk protection.
- Do not remove Better Auth runtime files/packages until imports are gone from protected API routes and tests.

## Blockers / Concerns

- Protected API routes still import Better Auth in many places; Phase 12 is not complete until those guards move to Clerk.
- Repo-wide lint still has unrelated pre-existing failures outside the Clerk migration files.
- End-to-end human verification of Clerk sign-in, dashboard access, and sign-out is still pending for 12-04.

## Session Continuity

- **Last session:** 2026-03-26T00:39:36Z
- **Stopped at:** Completed `12-02-PLAN.md`
- **Resume file:** None
- **Next recommended plan:** `12-03-PLAN.md`
