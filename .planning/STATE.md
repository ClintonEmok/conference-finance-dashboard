---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: complete
stopped_at: Completed 260326-di7-PLAN.md
last_updated: "2026-03-26T08:54:29.000Z"
progress:
  total_phases: 16
  completed_phases: 9
  total_plans: 33
  completed_plans: 33
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-18)

- **Core value:** One trusted dashboard for church conference finance operations.
- **Current focus:** Phase 13 complete, plus the Ticket Tailor manual sync repair shipped as a quick task

## Current Position

Phase: 13 (rebuild-convex-mutation-and-api-layer-from-clean-contracts) — COMPLETE
Plan: 5 of 5
Quick task: 260326-di7 (fix-the-ticket-tailor-sync-feature) — COMPLETE

## Alignment Status

- Clerk is now the active auth provider for the root app shell, dashboard middleware, dashboard page guards, and dashboard login/logout UX.
- Convex already receives Clerk identity tokens through the client provider bridge from 12-01.
- Operator-facing protected API routes now use Clerk's shared server helper instead of Better Auth sessions.
- Better Auth runtime files and packages are removed from the app runtime and dependency graph.
- Browser verification for signed-out access, sign-in, dashboard access, signed-in shell, and sign-out was approved.
- Ticket Tailor manual sync now reuses returned Convex ids correctly, records terminal sync-run status, and surfaces attendee counts/diagnostics in the operator sync page.

## Key Decisions

Recent decisions that future work should preserve:

- [12-01] Preserve the existing `UNAUTHORIZED` JSON payload in one Clerk-native helper so API route consumers do not change during migration.
- [12-01] Keep `ClerkProvider` outermost and pass Clerk `useAuth` into `ConvexProviderWithClerk` for authenticated Convex requests.
- [12-02] Protect only `/dashboard(.*)` in `proxy.ts` so public pages and webhook routes keep their current access behavior.
- [12-02] Use `requirePageUser(returnBackUrl)` for dashboard server components instead of direct Better Auth session checks.
- [12-02] Keep `/login` as a compatibility route that immediately hands off to Clerk sign-in with a safe return URL.
- [12-03] Route handlers should gate operator access through `requireApiUser()` so Clerk preserves the legacy unauthorized JSON contract centrally.
- [12-03] Auth-sensitive API tests should mock `lib/auth/server` and, where needed, Convex fetch boundaries rather than Better Auth session payloads.
- [12-04] Landing-page Clerk modal auth actions should set `forceRedirectUrl="/dashboard"` so operators land in the protected shell after auth.
- [260326-163] Use Clerk's current App Router `proxy.ts` + `clerkMiddleware()` entrypoint instead of legacy Better Auth middleware.
- [05-02] Keep dashboard navigation centered on overview, finance follow-up, attendees, and rooms as one operator command center.
- [06-01] Keep latest-link-first Tikkie presentation and freshness metadata centralized in backend contracts.
- [10-05] Calculate payment status at the order level using order total vs linked payment sums.
- [11-04] Keep server-side API routes on the `lib/convex` bridge rather than importing Convex functions directly into route handlers.
- [260326-di7] Treat `api.sync.*` upsert mutations as id-returning boundaries and add Convex `returns` validators so generated refs no longer hide that contract as `any`.

## Active Patterns / Constraints

- Protected server code should import helpers from `lib/auth/server.ts` rather than calling Better Auth or raw Clerk checks ad hoc.
- Dashboard sign-out should use Clerk `SignOutButton` with an explicit redirect target.
- Landing-page Clerk `SignInButton` and `SignUpButton` should redirect to `/dashboard` after modal completion.
- Public webhook routes must remain outside Clerk protection.
- Manual Ticket Tailor sync UI should read attendee counts and diagnostics from the route payload instead of assuming an orders-only summary.

## Blockers / Concerns

- Repo-wide lint still has unrelated pre-existing failures outside the Clerk migration files.
- No open auth-migration blockers remain after the approved Clerk-only browser verification.

## Accumulated Context

### Roadmap Evolution

- Phase 13 added: rebuild convex mutation and api layer from clean contracts

## Session Continuity

- **Last session:** 2026-03-26T08:54:29Z
- **Stopped at:** Completed 260326-di7-PLAN.md
- **Resume file:** None
- **Next recommended plan:** Review `.planning/ROADMAP.md` for the next planned phase or execute the next queued quick task.
