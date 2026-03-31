---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Attendee Signup + Accommodation Self-Assignment
status: in_progress
stopped_at: Completed 25-03-PLAN.md
last_updated: "2026-03-31T12:38:00.000Z"
last_activity: 2026-03-31
progress:
  total_phases: 8
  completed_phases: 7
  total_plans: 30
  completed_plans: 29
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-27)

- **Core value:** One trusted dashboard for church conference finance operations.
- **Current focus:** Phase 24 — canonical-orders-rewrite

## Current Position

Phase: 24
Plan: Not started

## Alignment Status

- Clerk is now the active auth provider for the root app shell, dashboard middleware, dashboard page guards, and dashboard login/logout UX.
- Convex already receives Clerk identity tokens through the client provider bridge from 12-01.
- **Convex auth hardened:** All 54 public write mutations now call `requireIdentity(ctx)` and reject unauthenticated callers (17-01).
- **Webhook verifiers fail closed:** Both Tikkie and Ticket Tailor webhook verifiers return false (not true) when signing secrets are absent or blank — misconfiguration blocks processing instead of bypassing verification (17-02).
- **Convex auth config validated:** `CLERK_JWT_ISSUER_DOMAIN` is now checked at module load with a descriptive error; no more TypeScript non-null assertion hiding missing config (17-02).
- **Transport hardened:** All operator and webhook routes have in-memory rate limiting; Tikkie and Ticket Tailor fetch clients have AbortController timeouts and bounded retry for 5xx/transient failures (17-03).
- **Auto-sync decoupled:** Convex cron-triggered auto-sync no longer makes HTTP calls back to the app. Ticket Tailor and Tikkie syncs call external APIs directly from Convex actions and write via `ctx.runMutation(internal.*)` (17-04).
- Shared `requireIdentity` helper in `convex/auth.ts` is the canonical Convex auth guard — future mutations must import and use it.
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
- **Room occupancy single-sourced:** Room occupancy is now derived from `ticketTailorAttendees.assignedRoomId` at query time in `getRoomsWithDetails`, `listAccommodationInventory`, and `getRoomAllocationBoard` — no more `occupiedBeds` counter writes from assignment/unassignment mutations (17-07).
- **Assignment mutations consolidated:** `attendees.assignRoom` and `attendees.unassignRoom` now delegate to accommodation mutations, enforcing capacity checks and event-hotel validation consistently (17-07).
- **Canonical signup read foundation added:** New additive tables (`events`, `eventSources`, `ticketTypes`, `accommodationSlots`) and `signupCatalog.getPublicSignupCatalog` now provide one source-aware public contract for published/open signup events (18-01).
- **Atomic submission boundary added:** `submitSignupEnvelope` now persists canonical submission envelopes (`submissions` + child rows + idempotency) in one mutation transaction and returns stable references (`submissionId`, `bookingRef`, `submittedAt`) (18-02).
- **Transactional guards + abuse controls active:** Signup submission now enforces in-mutation capacity/selectability checks, idempotent replay returning restore payload, and public-route protection via rate-limit + honeypot + idempotency header propagation (18-03).
- **Public signup shell foundation live:** `/events/[slug]` and `/signup/[slug]` public routes now expose signup-critical event content + CTA and a draft-backed linear flow shell with ticket quantity controls (19-01).
- **Room assignment flow added:** Signup shell now includes drag/drop attendee-to-slot mapping, deterministic assignment helpers, and explicit `acknowledgeRandomFill` gating while open beds remain (19-02).
- **Public signup flow complete:** Attendee details, dual-surface validation, review/submit, restore-choice decision controls, and booking confirmation states are now integrated end-to-end (19-03).
- **Operator handoff read model ready:** Canonical submission attendees now flow into the accommodation board via read-time Convex joins with unresolved assignment prioritization (20-01).
- **Review step with expandable sections:** ReviewSubmitStep now shows three expandable sections (Tickets, Attendee Details, Room Allocations) with room-based allocation summary, unfilled beds warnings, and unassigned attendee alerts (22-03).
- **Order queries migrated to core tables:** `orders.ts` and `tikkie.ts` now read from core `orders` and `orderAttendees` tables, joining with extension tables (`ticketTailorOrders`, `ticketTailorAttendees`) for provider-specific fields and visibility (24-03).
- **Payment matching migrated to core orders table:** `autoMatchPayments` and `getPaymentSummary` now read from `orders` and `orderAttendees` tables instead of Ticket Tailor-specific tables (24-04).
- **Signup submission migrated to core orders table:** `signupSubmission.ts` now writes to `orders`, `orderAttendees`, `orderTicketSelections`, `orderAssignments`, and `orderIdempotency` tables (24-06).

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
- [17-01] Use shared `requireIdentity(ctx)` helper for Convex mutation auth instead of inline `ctx.auth.getUserIdentity()` calls — allows future guard policy changes in one place.
- [17-01] No client-side `<Authenticated>` wrapper needed: dashboard layout uses server-side `requirePageUser` preventing unauthenticated access to Convex hook consumers.
- [17-02] Webhook verifiers fail closed: return false when signing secret env var is absent/blank, never bypass verification.
- [17-02] Replace TypeScript non-null assertions for critical env vars with explicit runtime validation that throws descriptive errors at module load.
- [17-06] Centralize `formatMoney` in `lib/format.ts` — single frozen `Intl.NumberFormat` instance for EUR minor-unit display, imported by all finance code.
- [17-06] Use Radix Dialog controlled mode for payment/Tikkie modals — preserves parent-driven state management while adding focus trapping, title/description semantics, and Escape-key close.
- [17-07] Remove direct `occupiedBeds` counter writes — room occupancy is single-sourced from `ticketTailorAttendees.assignedRoomId` at query time, eliminating counter drift risk.
- [17-07] Consolidate room assignment mutations — `attendees.assignRoom`/`unassignRoom` delegate to accommodation mutations so one authoritative implementation enforces capacity and event-hotel checks.
- [17-04] Convex cron auto-sync must call internal mutations directly via `ctx.runMutation(internal.*)` instead of HTTP-fetching app routes — eliminates circular dependency and removes need for APP_URL/TIKKIE_SYNC_CRON_SECRET in cron context.
- [17-04] Auth-free `internalMutation`/`internalQuery` wrappers mirror public mutations without `requireIdentity` — system-level cron actions run without user identity context.
- [17-08] Move Tikkie monthly quota check into mutation boundary for atomic enforcement — eliminates TOCTOU window from API route pre-flight check pattern.
- [17-08] Payment auto-match requires both normalized buyer name AND exact amount as matching criteria — reduces ambiguous matches compared to name-only matching.
- [17-09] Use .take(N) for intentionally bounded reads where pagination is not appropriate, .paginate() for growing user-facing lists, .first() for single-result indexed lookups.
- [17-09] Extract shared Convex validators into lib/types/\* for cross-layer type contracts — payments, orders, attendees, accommodation, tikkie.
- [18-01] Canonical signup public reads resolve from additive non-prefixed tables (`events`, `eventSources`, `ticketTypes`, `accommodationSlots`), while legacy `ticketTailor*` tables remain intact for compatibility.
- [18-01] Public signup catalog contract exposes machine-readable ticket/accommodation reason codes with strict `returns` validators and bounded indexed reads only.
- [18-02] Canonical submission persistence uses additive non-prefixed tables with typed ID relationships and keeps idempotency records PII-minimized.
- [18-02] Public submit route contract returns `201` with `{ submissionId, bookingRef, submittedAt }` and maps validation failures to `INVALID_SUBMISSION` `400` responses.
- [18-03] Idempotent replay returns prior submission reference and restore payload (without user-facing `reused` markers) when event-scoped fingerprint/key context matches within retry window.
- [18-03] Public signup submit route must enforce `enforceRateLimit(request, "signup-submit", { maxRequests: 20, windowMs: 60_000 })` and reject non-empty honeypot `website` values with `HONEYPOT_TRIGGERED`.
- [19-01] Preserve public event entry content contract (D-17..D-22): signup-critical details, ticket status without remaining counts, accommodation warning context, and explicit 4-step preview.
- [19-03] Duplicate retry UX stays explicit: restore payload requires continue-vs-edit user choice and never surfaces a `reused` marker.
- [23-04] Privacy masking uses "J. Smith" format (first initial + last name) in all payment displays — protects privacy while preserving enough info for reconciliation.
- [23-04] Payment auto-match checks booker name first, then falls back to attendee name matching with exact amount requirement per decision D-11.
- [24-01] submissions* tables renamed to orders* — submissions → orders, submissionAttendees → orderAttendees, etc. for semantic accuracy across integration and internal sources.
- [24-01] Core + Extension pattern — slim core tables with common fields, provider-specific extension tables (ticketTailor\*) with FKs to core for raw payloads and provider-only fields.
- [24-01] Domain concepts (assignedRoomId, allocationPriority, priorityReason) belong in core orderAttendees table, not provider-specific tables.
- [24-01] Optional fields enable cross-source compatibility — integration orders populate currency/totalAmountMinor/status/providerOrderId, internal orders populate idempotencyKey/bookingRef/honeypotSeen.
- [24-02] TT sync dual-write pattern — `internalUpsertTicketTailorOrder` writes to both `orders` (core) and `ticketTailorOrders` (extension) in single transaction; `internalUpsertTicketTailorAttendee` writes to both `orderAttendees` (core) and `ticketTailorAttendees` (extension).
- [24-02] Buyer info extraction from rawPayload — Order mutations extract buyerEmail, buyerName, currency, amounts from rawPayload internally rather than accepting as separate args.
- [24-02] Field naming alignment — Core `orders` table uses `status` field; extension `ticketTailorOrders` uses `normalizedStatus` for the same semantic value.
- [24-02] Gender normalization — TT uppercase gender types (MALE/FEMALE/MIXED/UNKNOWN) normalized to lowercase for core `orderAttendees.gender` field.
- [24-02] Family linking uses core IDs — Family group membership now references `orderAttendees._id` (canonical) instead of `ticketTailorAttendees._id` (extension).
- [24-02] Archive consistency — `internalArchiveMissingOrdersForEvent` patches both `orders` (status="cancelled") and `ticketTailorOrders` (isArchived=true) for consistency.
- [24-04] Payment matching reads from core orders table — auto-match queries use `ctx.db.query("orders")` with `by_eventId` index, attendees fetched via `orderAttendees` `by_orderId` index.
- [24-04] Payment orderId parameters use `v.id("orders")` type validator for Convex type safety instead of `v.string()`.
- [24-03] Core + Extension join pattern — query core table first (`orders`, `orderAttendees`), then join extension tables (`ticketTailorOrders`, `ticketTailorAttendees`) for provider-specific fields and visibility (removedAt, archivedAt).
- [24-03] Bounded indexed queries — all order queries use `.withIndex()` with available indexes (`by_eventId`, `by_providerOrderId`, `by_status`), no full table scans.
- [24-03] Visibility via extension — order visibility (removedAt, isArchived) checked via extension table joins, not in core tables.

## Active Patterns / Constraints

- **Cron auto-sync via internal mutations:** Convex cron-triggered actions must call `ctx.runMutation(internal.*)` / `ctx.runQuery(internal.*)` directly instead of HTTP-fetching the app's own API routes. External API calls (Ticket Tailor, Tikkie) are made from the Convex action runtime using `fetch()`.
- **Auth-free internal wrappers for cron operations:** Internal mutations/queries used by cron actions must NOT call `requireIdentity(ctx)` — they run as system-level operations without user identity context.
- **Convex mutation auth:** All public mutations must `import { requireIdentity } from "./auth"` and call `await requireIdentity(ctx)` as the first handler statement.
- **Webhook verification fail-closed:** Webhook verifiers must return false when signing secret env vars are absent or blank — never return true to bypass checks.
- **Env var validation:** Critical env vars should use explicit runtime checks with descriptive errors, not TypeScript non-null assertions.
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
- Public signup catalog reads must use `api.signupCatalog.getPublicSignupCatalog` and keep event filtering to published + signup-open visibility.
- Signup submission writes must flow through `api.signupSubmission.submitSignupEnvelope` and maintain per-attendee ticket selection rows (`quantity = 1`).
- Route-level signup error handling should parse machine-readable guard prefixes from mutation errors to return conflict contracts (`CAPACITY_EXCEEDED`, `TICKET_UNAVAILABLE`, `ASSIGNMENT_UNAVAILABLE`, `SUBMISSION_CONFLICT`).

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
| 260331-2jp | replace Buffer.from with cross-platform btoa for base64 encoding                                     | 2026-03-31 | 8e60b94 | [260331-2jp-replace-buffer-from-with-cross-platform-](./quick/260331-2jp-replace-buffer-from-with-cross-platform-/) |

## Accumulated Context

### Roadmap Evolution

- Phase 13: rebuild convex mutation and api layer from clean contracts (complete)
- Phase 14: Event-Level Tikkie + Payment Tracking (complete)
- Phase 15: Event-level Tikkie UI + attendee Tikkie cleanup (complete)
- Phase 16: v1 milestone gap closure execution complete (16-01/16-02/16-03/16-04 complete)
- Phase 17: Fix Critical Code Review Issues — COMPLETE (9/9 plans: 17-01 Convex auth guards, 17-02 webhook/auth fail-closed, 17-03 transport hardening, 17-04 circular cron-HTTP path removed, 17-05 error/loading fallbacks, 17-06 formatMoney centralization + dialog accessibility, 17-07 room occupancy single-sourced + mutation consolidation, 17-08 finance correctness, 17-09 pagination + bounded reads + shared types)
- Phase 18: Schema + Canonical Contracts (complete — 18-01/18-02/18-03 complete)
- Phase 19: Public Signup Pages (planned — 3 plans)
- Phase 20: Admin Event Management (planned — 3 plans)
- Phase 21: Accommodation UX Redesign (completed — inline event settings flow with auto-slot generation)
- Phase 22: Redesign signup UX for family ticket allocation with attendee grouping and room bedslot allocation UI (COMPLETE)
  - 22-01: Flow reorder + location field (COMPLETE) - Step order changed to tickets → attendees → rooms → review
  - 22-02: Room assignment redesign (COMPLETE) - Bedslot grouping by room type with real-time preview
  - 22-03: Review step expandable sections (COMPLETE) - Tickets, Attendees, Rooms with allocation summary
- Phase 23 added: Add email confirmation and show tikkie link (payment). after signup is completed and improve tracking. we can fetch tikkie automatically already, but payments are done by name. payment details only show first letter and last name (context gathered)
- Phase 24 added: canonical orders rewrite
- Phase 25 added: Concerns fixing

## Session Continuity

- **Last activity:** 2026-03-31
- **Last session:** 2026-03-31T12:38:00.000Z
- **Stopped at:** Completed 25-03-PLAN.md
- **Resume file:** None
- **Next recommended plan:** Phase 25 complete (3/3 plans). All concerns fixing done.
