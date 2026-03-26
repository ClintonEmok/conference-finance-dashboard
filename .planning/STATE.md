---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: complete
stopped_at: Completed 260326-hgy-PLAN.md
last_updated: "2026-03-26T11:43:09.000Z"
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
- **Current focus:** Phase 13 complete, plus quick-task hardening for Ticket Tailor sync, accommodation inventory rendering, and attendee detail API route recovery

## Current Position

Phase: 13 (rebuild-convex-mutation-and-api-layer-from-clean-contracts) — COMPLETE
Plan: 5 of 5
Quick task: 260326-hgy (fix-the-manual-payment-entry-select-orde) — COMPLETE

## Alignment Status

- Clerk is now the active auth provider for the root app shell, dashboard middleware, dashboard page guards, and dashboard login/logout UX.
- Convex already receives Clerk identity tokens through the client provider bridge from 12-01.
- Operator-facing protected API routes now use Clerk's shared server helper instead of Better Auth sessions.
- Better Auth runtime files and packages are removed from the app runtime and dependency graph.
- Browser verification for signed-out access, sign-in, dashboard access, signed-in shell, and sign-out was approved.
- Ticket Tailor manual sync now reuses returned Convex ids correctly, records terminal sync-run status, and surfaces attendee counts/diagnostics in the operator sync page.
- Accommodation inventory rendering now sanitizes malformed room metrics locally so grouped hotel Available beds totals never surface `NaN` in React.
- Attendee detail API reads now share the existing protected attendee route with PATCH overrides, so the detail page fetch no longer fails with a 405.
- Event-level Tikkie create-link CTA now opens an amount-entry modal, converts euros to `amountMinor`, and supports explicit open-amount creation with `0`.
- Manual payment entry order lookup now uses deterministic search dropdown states, and `/api/orders/search` accepts both `search` and `q` query variants.

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
- [260326-do9] Keep malformed accommodation inventory number handling at the dashboard render boundary for this quick repair, deriving fallback available beds from sanitized capacity and occupied counts.
- [260326-e0r] Keep attendee detail page loads and Tikkie override PATCH updates on the same protected `/api/dashboard/attendees/[attendeeId]` route, reusing `getAttendeeDetail` for the GET payload.
- [260326-hfn] Require modal amount entry before creating event-level Tikkie links, and enforce optional `amountMinor` as a non-negative integer (including `0`) at the route boundary.
- [260326-hgy] Keep manual payment order lookup resilient by normalizing `search`/`q` query aliases and requiring explicit dropdown selection before persisting `orderId`.

## Active Patterns / Constraints

- Protected server code should import helpers from `lib/auth/server.ts` rather than calling Better Auth or raw Clerk checks ad hoc.
- Dashboard sign-out should use Clerk `SignOutButton` with an explicit redirect target.
- Landing-page Clerk `SignInButton` and `SignUpButton` should redirect to `/dashboard` after modal completion.
- Public webhook routes must remain outside Clerk protection.
- Manual Ticket Tailor sync UI should read attendee counts and diagnostics from the route payload instead of assuming an orders-only summary.
- Accommodation inventory hotel blocks should sum sanitized per-room metrics instead of raw available-bed payload fields.
- Shared dashboard detail routes should keep GET and PATCH on the same URL when the page already depends on that endpoint contract.
- Event-level Tikkie create-link should use a modal confirmation/input step and submit explicit cent amounts (`amountMinor`) to the protected route.
- Manual payment order pickers should display min-char/loading/empty/error states and clear stale selected ids whenever the search input changes.

## Blockers / Concerns

- Repo-wide lint still has unrelated pre-existing failures outside the Clerk migration files.
- No open auth-migration blockers remain after the approved Clerk-only browser verification.

### Quick Tasks Completed

| #          | Description                                                                              | Date       | Commit  | Directory                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| 260326-di7 | fix the ticket tailor sync feature                                                       | 2026-03-26 | 5df71b4 | [260326-di7-fix-the-ticket-tailor-sync-feature](./quick/260326-di7-fix-the-ticket-tailor-sync-feature/)             |
| 260326-do9 | fix received NaN for the attribute in app accommodation inventory                        | 2026-03-26 | c909cbd | [260326-do9-fix-received-nan-for-the-attribute-in-ap](./quick/260326-do9-fix-received-nan-for-the-attribute-in-ap/) |
| 260326-e0r | fix the attendeedetail page the api returns 405. i want the attendee details to be shown | 2026-03-26 | fca8087 | [260326-e0r-fix-the-attendeedetail-page-the-api-retu](./quick/260326-e0r-fix-the-attendeedetail-page-the-api-retu/) |
| 260326-edp | show the custom answers on the attendee detail page                                      | 2026-03-26 | 97a0463 | [260326-edp-show-the-custom-answers-on-the-attendee-](./quick/260326-edp-show-the-custom-answers-on-the-attendee-/) |
| 260326-hfn | fix event tikkie create link button open                                                 | 2026-03-26 | c731fd3 | [260326-hfn-fix-event-tikkie-create-link-button-open](./quick/260326-hfn-fix-event-tikkie-create-link-button-open/) |
| 260326-hgy | fix the manual payment entry select order flow                                           | 2026-03-26 | b7fdca6 | [260326-hgy-fix-the-manual-payment-entry-select-orde](./quick/260326-hgy-fix-the-manual-payment-entry-select-orde/) |

## Accumulated Context

### Roadmap Evolution

- Phase 13: rebuild convex mutation and api layer from clean contracts (complete)
- Phase 14: Event-Level Tikkie + Payment Tracking (complete)
- Phase 15: Event-level Tikkie UI + attendee Tikkie cleanup (complete)

## Session Continuity

- **Last activity:** 2026-03-26 - Completed 260326-hgy quick task (manual payment order search dropdown + route query compatibility)
- **Last session:** 2026-03-26T11:43:09Z
- **Stopped at:** Completed 260326-hgy-PLAN.md
- **Resume file:** None
- **Next recommended plan:** Review `.planning/ROADMAP.md` for next phase or add new phases
