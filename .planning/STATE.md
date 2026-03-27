---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: event-signup-dual-source
status: active
stopped_at: Completed 16-04-PLAN accommodation signal filter closure
last_updated: "2026-03-27T12:36:14Z"
progress:
  total_phases: 17
  completed_phases: 10
  total_plans: 41
  completed_plans: 40
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-18)

- **Core value:** One trusted dashboard for church conference finance operations.
- **Current focus:** Kick off v2 milestone for public event signup and dual-source event operations (integration + internal)

## Current Position

Milestone: v2.0 (event-signup-dual-source) — ACTIVE
Phase: 16 (v1-milestone-gap-closure) — COMPLETE
Plan: 4 of 4 (16-01, 16-02, 16-03, 16-04 complete)
Status: Phase complete
Last activity: 2026-03-27 - Completed 16-04-PLAN.md

Progress: ██████████ 98% (40/41 plans)

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
- Reconciliation follow-up now opens attendee detail routes when attendee ids are available, while preserving context query params and fallback list navigation.
- Accommodation inventory delete flows now block room/hotel deletion when dependent assignments exist and surface actionable operator error messages.
- Manual payment creation and assignment now link orders using `providerOrderId`, keeping new payment/order references consistent across finance views.
- Reconciliation outstanding totals now subtract matched manual/auto payments by provider order id with legacy Convex-id fallback resolution.
- Payments API rows now enrich linked payments with resolved order blocks (`id`, `providerOrderId`, `buyerName`, `totalAmountMinor`) using provider-first lookup.
- Hotel deletion guards now use real attendee assignments (`assignedRoomId`) as the blocker condition, not `occupiedBeds` counters.
- Accommodation inventory now exposes room-type delete actions end-to-end (UI -> protected API -> domain), with clear blocked-state feedback when rooms still use the type.
- Manual Ticket Tailor sync endpoint now enforces shared Clerk API auth guard (`requireApiUser`) and returns the standard unauthorized contract before any sync execution.
- Accommodation allocation board now applies family/location attendee filters end-to-end and computes `hasFamily` from persisted family members with provider-order fallback.
- Accommodation auto-allocation proposals now use compatibility-aware scoring (family/order cohesion + gender guardrails + priority ordering) and compute a real `familyGroupsKeptTogether` metric.
- Accommodation page apply/reset flows now keep signal filters canonical via shared URL/query serialization, so signal-only changes always trigger board reloads.
- Accommodation queue family badges now render from backend-provided `hasFamily` contract truth instead of inferred optional fields.

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
- [260326-hit] Centralize reconciliation follow-up href generation and prefer `/dashboard/attendees/[attendeeId]` when attendee ids resolve, preserving source/order/event context with a safe attendees-list fallback.
- [260326-ib1] Keep accommodation destructive actions guard-first: block room deletion when attendees are assigned and block hotel deletion while rooms or event-scope links exist, with explicit `Cannot delete...` API feedback.
- [260326-i7e] Treat `providerOrderId` as canonical for manual payment links, while preserving legacy Convex-id payment compatibility through read-time order resolution in reconciliation and payments APIs.
- [260326-ijx] Add dedicated unassigned payments page at `/dashboard/reconciliation/payments` with source/date filtering and AssignDialog integration.
- [260326-it5] Block hotel deletion only when attendees are assigned to its rooms, and expose room-type deletion through protected API and inventory UI with explicit `Cannot delete...` messaging.
- [260327-16a] Protect `POST /api/ticket-tailor/sync` with shared `requireApiUser()` and lock unauthorized/authorized behavior via route-level regression tests.
- [260327-16b] Treat `attendeeFamilyMembers` membership as canonical family truth for allocation board rows, with same-order attendee counts as fallback for `hasFamily`.
- [260327-16c] Treat `providerOrderId` cohorts as allocation-time family/order group keys and only count `familyGroupsKeptTogether` when all suggested family attendees are co-located in one room.
- [260327-16d] Keep accommodation signal filter normalization/serialization in a shared helper and base queue family badge rendering on `hasFamily` payload truth.
- [v2-01] Treat event source as an explicit domain boundary (`integration` vs `internal`) and keep dashboard reads source-agnostic.
- [v2-02] Preserve existing finance/Tikkie/Ticket Tailor behavior while adding internal signup flows incrementally.

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
- Reconciliation follow-up links should be generated via shared helper logic and upgrade to attendee-detail routes as attendee ids resolve per row.
- Accommodation inventory delete actions must require explicit operator confirmation and display backend `Cannot delete...` reasons inline when dependency guards block deletion.
- Manual payment writes should persist Ticket Tailor `providerOrderId`; read paths must support provider-id first with Convex-id fallback for pre-existing payment records.
- Hotel delete checks should use attendee assignment truth (`ticketTailorAttendees.assignedRoomId`) rather than `occupiedBeds` counters.
- Room-type inventory cards should provide delete actions with confirm prompts, in-flight disablement, and inline server error feedback.
- Accommodation signal filters (`familyGroupId`, `location`) must be normalized and passed through domain -> Convex boundaries; board payload filter echoes should reflect applied values.
- Accommodation apply/reset UI and assignment fetch query construction must share one signal-filter helper to prevent dropped signal params in URL-only updates.
- Accommodation proposal generation should remain deterministic and compatibility-scored, with reasons that cite family/gender/priority rationale rather than generic availability messaging.
- Public event pages must only expose published/internal-safe fields and never leak operator-only finance data.
- Internal signup writes should be idempotent enough for accidental duplicate submits and enforce capacity constraints at write time.

## Blockers / Concerns

- Repo-wide lint still has unrelated pre-existing failures outside the Clerk migration files.
- No open auth-migration blockers remain after the approved Clerk-only browser verification.

### Quick Tasks Completed

| #          | Description                                                                                          | Date       | Commit  | Directory                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| 260326-di7 | fix the ticket tailor sync feature                                                                   | 2026-03-26 | 5df71b4 | [260326-di7-fix-the-ticket-tailor-sync-feature](./quick/260326-di7-fix-the-ticket-tailor-sync-feature/)             |
| 260326-do9 | fix received NaN for the attribute in app accommodation inventory                                    | 2026-03-26 | c909cbd | [260326-do9-fix-received-nan-for-the-attribute-in-ap](./quick/260326-do9-fix-received-nan-for-the-attribute-in-ap/) |
| 260326-e0r | fix the attendeedetail page the api returns 405. i want the attendee details to be shown             | 2026-03-26 | fca8087 | [260326-e0r-fix-the-attendeedetail-page-the-api-retu](./quick/260326-e0r-fix-the-attendeedetail-page-the-api-retu/) |
| 260326-edp | show the custom answers on the attendee detail page                                                  | 2026-03-26 | 97a0463 | [260326-edp-show-the-custom-answers-on-the-attendee-](./quick/260326-edp-show-the-custom-answers-on-the-attendee-/) |
| 260326-hfn | fix event tikkie create link button open                                                             | 2026-03-26 | c731fd3 | [260326-hfn-fix-event-tikkie-create-link-button-open](./quick/260326-hfn-fix-event-tikkie-create-link-button-open/) |
| 260326-hgy | fix the manual payment entry select order flow                                                       | 2026-03-26 | b7fdca6 | [260326-hgy-fix-the-manual-payment-entry-select-orde](./quick/260326-hgy-fix-the-manual-payment-entry-select-orde/) |
| 260326-hit | the open atteendee followup should open attendee detail                                              | 2026-03-26 | 3b06738 | [260326-hit-the-open-atteendee-followup-should-open-](./quick/260326-hit-the-open-atteendee-followup-should-open-/) |
| 260326-ib1 | for room inventory we need to be to able to delete rooms and hotels if they have no assinged to them | 2026-03-26 | 93cf05b | [260326-ib1-for-room-inventory-we-need-to-be-to-able](./quick/260326-ib1-for-room-inventory-we-need-to-be-to-able/) |
| 260326-i7e | the manual payment didnt update the outstanding totals                                               | 2026-03-26 | 3431335 | [260326-i7e-the-manual-payment-didnt-update-the-outs](./quick/260326-i7e-the-manual-payment-didnt-update-the-outs/) |
| 260326-ijx | create the ui for reconciliation route                                                               | 2026-03-26 | 4af536d | [260326-ijx-create-the-ui-for-reconciliation-route-t](./quick/260326-ijx-create-the-ui-for-reconciliation-route-t/) |
| 260326-it5 | allow hotels to be deleted if there aree                                                             | 2026-03-26 | 8dbce91 | [260326-it5-allow-hotels-to-be-deleted-if-there-aree](./quick/260326-it5-allow-hotels-to-be-deleted-if-there-aree/) |

## Accumulated Context

### Roadmap Evolution

- Phase 13: rebuild convex mutation and api layer from clean contracts (complete)
- Phase 14: Event-Level Tikkie + Payment Tracking (complete)
- Phase 15: Event-level Tikkie UI + attendee Tikkie cleanup (complete)
- Phase 16: v1 milestone gap closure execution complete (16-01/16-02/16-03/16-04 complete)

## Session Continuity

- **Last activity:** 2026-03-27 - Completed 16-04-PLAN.md
- **Last session:** 2026-03-27T12:36:14Z
- **Stopped at:** Completed 16-04-PLAN.md
- **Resume file:** None
- **Next recommended plan:** Execute Phase 17 plan(s) for dual-source event signup platform
