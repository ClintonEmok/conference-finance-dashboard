---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Accommodation Upgrades & Options
current_phase: 45
current_phase_name: Verification & Cross-Surface Audit
status: in_progress
stopped_at: Phase 45 plans 01-02 executed (canonical money matrix + security/idempotency/immutability gate); plan 03 paused at the human UAT checkpoint (v4.0 Phase 38 + Phase 40-44 deferred browser/provider/secret walkthrough)
last_updated: "2026-08-06T12:45:00.000Z"
last_activity: 2026-08-06
last_activity_desc: Executed 45-01 (cross-consumer canonical money matrix, zero divergence) and 45-02 (public-edit security/idempotency/confirmation gate, zero defects); 45-03 automated gates green, awaiting the final human walkthrough
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 15
  completed_plans: 14
  percent: 93
---

# Project State

## Project Reference

See: `.planning/PROJECT.md`.

- **Core value:** One trusted dashboard for church conference finance operations.
- **Current focus:** Accommodation Upgrades & Options — priced accommodation catalog, options-only signup, booking-ref permalink re-pricing, paid-priority allocation.

## Current Position

Phase: 45 — Verification & Cross-Surface Audit
Plan: 45-01 + 45-02 complete (money matrix + security gate); 45-03 automated gates green, paused at Task 3 human UAT checkpoint
Status: In progress (0/7 phases signed off; phase sign-off is the v5.0 Phase 45 human walkthrough)
Last activity: 2026-08-06 — Executed 45-01 and 45-02; ran the full 45-03 automated validation matrix green; awaiting representative-event browser/operational walkthrough

Progress: ██████████████░ (14/15 plans executed across Phases 39-45; 0/7 phases signed off)

## Performance Metrics

| Metric | Value |
| --- | --- |
| Total v5.0 phases | 7 (39-45) |
| v5.0 requirements mapped | 31/31 (100%) |
| Completed phases | 0 (phase sign-off absorbed into v5.0 Phase 45 verification) |
| v4.0 carry-over | Phases 34-37 complete; Phase 38 verification absorbed into v5.0 Phase 45 |

## Accumulated Context

### Decisions (v5.0 roadmap)

- Phase numbering continues from v4.0: v5.0 spans Phases 39-45, ordered dependency-driven (schema → finance → admin config → signup → permalink → allocation → verification).
- Two-layer accommodation model: global reusable catalog (categories, room types w/ descriptions, options, age bands) + event-scoped config (rates, availability, enabled options) — separate tables, typed FKs, child tables, no nested arrays on one doc.
- Canonical finance: extend `loadOrderAmountDueBreakdowns` + pure `deriveOrderAmountBreakdown` (new pure accommodation-amounts module, unit-tested). Live derivation for unconfirmed orders; snapshot with config-version boundary at admin confirmation; confirmed orders never retroactively re-price. `orders.totalAmountMinor` stays the provider/write-time total.
- Signup becomes options-only (preferences in `orderAccommodationSelections`); placement stays in `orderAssignments`/`assignedRoomId` (admin assignment) — two separate records, never mixed.
- Permalink `/track-payment/[bookingRef]` is the app's first public write: ownership gate (booker email match/edit token), rate limiting, honeypot, idempotent replace-style mutation, server-side pricing only, `confirmedAt` write-guard enforced in the mutation.
- Tikkie links are open, flexible payment requests: creation amount is always 0 (installments), never derived from canonical amount-due, and links are never regenerated/superseded/expired on config change (supersedes the earlier re-price-regeneration roadmap decision).
- Paid-priority allocation keys on derived per-attendee due/paid maps (tri-state paid/partial/unpaid), never `order.status`; paid-set precomputed once per board load.
- SEED-002 aligned via single `ticketTypes.roomTypeId` (set ⇒ only that type; unset ⇒ all enabled); multi-room-type `roomTypeIds` array deferred.
- Phase 45 verification closes the PITFALLS "looks done but isn't" checklist: idempotency, edit-after-confirm rejection, ref-only rejection, price tampering, cross-surface amount agreement, stale-link expiry, internal-event paid status, deep-link preservation.
- **Phase 40 executed:** `orderAccommodationSelections` carries the confirmation contract on each selection row (`confirmedAt` + `configVersion = eventAccommodationConfig.updatedAt` + immutable `priceSnapshot` with resolved base/upgrade/cot rates and total/covered nights); loader fails closed on confirmed-without-snapshot. Tikkie order links are flexible: creation amount always 0 (installments) — canonical amount-due drives tracking balance/progress and matching only; links are never regenerated/expired on config change. Money is computed only in the pure module `lib/domain/finance/accommodation-amounts.ts`; the UI and booking lookup render server-provided values only.
- **Phase 41 executed:** the Upgrades & Options admin contract is server-owned — `getEventAccommodationConfig` returns a bounded `pendingOrders` list, `pendingOrderCount`, and `hasAccommodationSelections`; every event-scoped pricing save (rates/options/resources/age pricing) advances the single `eventAccommodationConfig.updatedAt` version boundary (initializing the singleton when absent) without rewriting orders; `confirmAccommodationOrderConfiguration` takes only an order ID and atomically persists `confirmedAt` + `configVersion` + the pure-module `priceSnapshot` on every selection row (reusable by Phase 44). The third Accommodation workspace tab (`?tab=upgrades-options`) edits stay/rates/options/age pricing/availability and the reusable catalog, shows server-backed pending impact, and confirms buyer configurations with a locked state — no client-side money, night, capacity, or pending-count arithmetic; Hotels and Allocation unchanged.
- **Phase 42 plan 01 executed:** the public signup contract is server-owned end-to-end. `getPublicSignupCatalog` exposes event-configured config (base stay/nightCount/breakfastIncluded), active category/rate rows, enabled options (with event-configured cot eligibility band), age bands, and ticket entitlement (`roomTypeCategoryId`/`roomTypeCategoryCode` from `ticketTypes.roomTypeId`) — legacy `slots` preserved for compatibility only. Public `getPublicSignupAccommodationQuote` accepts only eventId + per-attendee ticket/option choices and prices via `deriveAccommodationAmount`; quote and `submitSignupEnvelope` share one resolver (`loadPublicSignupAccommodationContext` + `resolvePublicSignupSelection`), so eligibility/cot/rate/category rules cannot diverge. New submissions reject any non-empty legacy `assignments` before a write, never create `orderAssignments`, and persist one unconfirmed `orderAccommodationSelections` row per preference with server-resolved stay fields (no `confirmedAt`/`configVersion`/`priceSnapshot`); category/occupancy may be absent only when the event has no configured accommodation; the quote prices the event base stay only (buyers never choose nights).
- **Phase 42 plan 02 executed:** the public signup UI is options-only end-to-end. `SIGNUP_STEP_ORDER` is tickets/buyer/attendees/accommodation/review; `SignupDraft` holds per-attendee `AccommodationSelectionDraft` keyed by stable attendee keys (no `assignments`/`acknowledgeRandomFill`). `AccommodationOptionsStep` offers category/occupancy/upgrade/cot/age-band choices generated exclusively from the catalog response (cot gated on the server eligibility band; no hardcoded age bands). Review and summary render the server quote contract (ticket lines, per-person-per-night accommodation lines, breakfast copy, `totalDueMinor`) with no client money arithmetic; submission sends `accommodationSelections` + `assignments: []` only. `PublicSignupQuoteRenderState` (unconfigured/incomplete/loading/error/ready) blocks submit until a fresh valid quote matches the selection signature.
- **Phase 43 executed (plans 01-03):** the `/track-payment/[bookingRef]` permalink is the app's first public write, protected at both boundaries. Plan 01: `lib/domain/track-payment/edit-token.ts` adds an HMAC edit token bound to `track-payment:{bookingRef}:{normalizedEmail}` and a short-lived route-to-Convex request signature bound to the normalized edit envelope, both reusing `SIGNUP_SUBMISSION_SECRET` (no new secret, no stored raw tokens); schema adds the append-only `orderAccommodationEditAudits` table (order/idempotency and order/request-digest indexes, server-valued fields only); confirmation/resend emails prefer `/track-payment/{bookingRef}?token=...` with a root-tracker fallback that fails closed. `getTrackPaymentEditContext` is a bounded public projection (current selections, locked state, event-configured category/rate/option/age-band choices, per-selection `ticketCategoryId` entitlement; never returns edit credentials). `updateAccommodation` is the atomic replace-style mutation: verifies the route-issued signature recomputed from its own validated args, re-checks ownership (email match or HMAC token) before loading any editable detail, enforces the `confirmedAt` lock and exact-match replacement cardinality, validates every preference through the Phase 42 shared resolver, re-prices via `loadOrderAmountDueBreakdowns`, treats identical replacements as true no-ops, replays used idempotency keys from stored results, inserts one server-valued audit row per applied edit, and never touches order totals, payments, assignments, or flexible-zero Tikkie links. Plan 02: `POST /api/track-payment/[bookingRef]` applies `enforceRateLimit` (track-payment-edit, 20/60s) before body work, reuses the signup `website` honeypot, rejects client authority fields (amounts/dates/nights/rooms/slots/snapshots) at the HTTP boundary, mints the request signature over the exact normalized envelope (honoring `x-idempotency-key` retries), and maps ownership/confirmed/stale/not-found/validation failures to stable JSON codes that never reveal other bookings. Plan 03: `TrackPaymentView` is the single server-backed presentation for root search (navigates to the permalink) and the durable permalink (back-link instead of a second shell); `TrackPaymentAccommodationEditor` renders per-attendee fieldsets with server-configured choices (ticket-constrained category filtering via `ticketCategoryId`, cot gated on the server band), collects ownership locally (email + optional edit link prefilled in memory), submits complete options-only replacements with a stable idempotency key, and shows accessible loading/error/confirmed-lock/overpayment/success states with zero client money math (overpayment is a server-provided panel).

- **Phase 44 executed (plans 01-03):** Allocation is now paid-priority end-to-end. Plan 01: the pure `lib/domain/finance/allocation-payment-state.ts` contract (`deriveAllocationPaymentState` + `deriveAllocationPaymentBreakdowns`) classifies every canonical due-map attendee as paid/partial/unpaid from server-supplied due/paid minor units (zero-due = paid, paid ≥ due = paid, positive below due = partial, else unpaid), allocates matched payment totals by due weight via the existing `allocateMinorAmountByWeight` (deterministic remainder), and never reads order status/DB/UI state. Plan 02: `convex/finance.ts` adds `loadOrderAttendeePaymentBreakdowns` (one matched-payment load per scoped order set); `getRoomAllocationBoard` loads the canonical projection once per board read, attaches typed `paymentState`/`amountDueMinor`/`paidAmountMinor` to unassigned rows, room occupants, buyer suggestions, and submission queue rows, and sorts unassigned + queue paid-first then by allocation priority and stable ties; `persistOrderAccommodationConfirmation` reuses the Phase 41 `resolveOrderAccommodationConfirmation` in `assignRoomToAttendee`/`assignAttendeeToRoom`/`confirmBuyerAssignment` to persist `confirmedAt`+`configVersion`+`priceSnapshot` atomically with the assignment write — legacy orders (no selection rows) skip cleanly, fully-confirmed orders are idempotent no-ops, partially-confirmed sets fail closed; the shared resolver's age-band guard now accepts an optional blank band without cot (Phase 42 optional-age-band rule) while cot still requires the event-configured eligibility band. Plan 03: the Allocation workspace renders server-owned `Paid`/`Partially paid`/`Unpaid` badges (explicit text + icon + aria-label, emerald/amber/muted treatments, unpaid never hidden), a payment-priority legend, and the lock-boundary helper copy (`Confirming an assignment confirms this buyer's accommodation configuration and closes further buyer changes.`); `generateAllocationProposal` keeps payment state as the primary rank then allocationPriority and the existing stable tie-breakers, with `paymentState` propagated onto suggestion/unplaced rows. Internal events with recorded payments render as paid even when order/provider status stays pending.

- **Phase 45 plan 01 executed:** cross-consumer canonical money matrix. `tests/convex/phase45-money-integrity.test.ts` proves one server-owned amount-due and per-attendee map across the loader, booking lookup, public tracking, reconciliation, order ledger, payment summary, attendee detail, revenue/reporting share, Allocation board, and internal sync (representative order = 14000; A 6000/B 8000; due-weight paid split A 2143/B 2857), plus live-vs-snapshot, legacy/missing-config safety, paid/partial/unpaid/overpaid classification, auto-match amount authority, and flexible-zero link immutability. `tests/finance/phase45-money-integrity.test.ts` is a static source audit (loader-only authority, no second formula, totalAmountMinor fallback-only, flexible-zero creation guard). Zero consumer divergence — evidence-only, no production changes.
- **Phase 45 plan 02 executed:** public-edit security/idempotency/confirmation gate. Added cross-order ownership (another order's email/token fail `EDIT_OWNERSHIP` with no writes), signature-key binding (captured signature under a fresh key fails `SIGNATURE_REQUIRED`), duplicate attendee key, broken ticket entitlement, route-level client-signature rejection, persisted selection-row idempotency, and partially-confirmed assignment fail-closed. Zero guard/atomicity defects — test-only.
- **Phase 45 plan 03 tasks 1-2 executed:** deep-link/single-shell/cross-surface UI contracts (root search → normalized permalink, token query preservation, no duplicate shell, email token-permalink with root fallback, legacy workspace redirects, no client money arithmetic, options-only signup, Allocation server payment-state badges) and the full automated validation matrix (component 483, convex 113, default 439, typecheck, build, codegen, dev --once, diff-check all green).

### Carried From v4.0 (context preserved)

- Event-scoped shell, single concise sidebar, shared dashboard query-state vocabulary, canonical finance/accommodation contracts, workspace tab pattern (`lib/dashboard/workspace-routes.ts`), event Overview as operational home.

### Pending Todos

- [ ] Await roadmap approval (or revision feedback)
- [x] Execute Phase 39 plan 01 (accommodation catalog & event config schema)
- [x] Execute Phase 40 plan 01 (canonical finance derivation: pure accommodation pricing, loader wiring, flexible Tikkie links, snapshot contract)
- [x] Resolve Phase 40 research flag: snapshot mechanics at confirmation (per-line snapshot on each selection row; `confirmedAt`/`configVersion`/`priceSnapshot` field placement locked)
- [x] Execute Phase 41 plan 01 (admin contract: pending impact, version boundary, order confirmation)
- [x] Execute Phase 41 plan 02 (Upgrades & Options tab: config editor, catalog editor, pending confirmation UI)
- [x] Execute Phase 42 plan 01 (public catalog/quote contract + options-only submission)
- [x] Execute Phase 42 plan 02 (options-only signup UI: accommodation step, quote-backed review/summary, options-only client payload)
- [x] Resolve Phase 43 research flag: ownership-gate mechanism, rate limiting, honeypot reuse, edit audit rows, Tikkie regeneration timing (email/HMAC token ownership, route + mutation guards, reused `website` honeypot, append-only audit rows, flexible-zero links untouched)
- [x] Execute Phase 43 plan 01 (server edit contract: token primitives, audit schema, permalink email links, edit-context projection, atomic replace mutation, handler coverage)
- [x] Execute Phase 43 plan 02 (rate-limited honeypot-protected POST /api/track-payment/[bookingRef] + route tests)
- [x] Execute Phase 43 plan 03 (durable permalink UI: shared view, dynamic route, accommodation editor, client contract tests)
- [x] Execute Phase 44 plan 01 (pure allocation payment-state contract: tri-state classification + due-weight allocation)
- [x] Execute Phase 44 plan 02 (paid-priority board projection + assignment-confirmation lock via Phase 41 resolver)
- [x] Execute Phase 44 plan 03 (accessible paid-first Allocation UI + payment-first proposal ordering)
- [x] Execute Phase 45 plan 01 (cross-consumer canonical money matrix + source audit; zero divergence — evidence-only)
- [x] Execute Phase 45 plan 02 (public-edit security/idempotency/confirmation regression gate; zero defects — test-only)
- [x] Execute Phase 45 plan 03 tasks 1-2 (deep-link/single-shell/cross-surface UI contracts + full automated validation matrix green)
- [ ] Complete Phase 45 plan 03 task 3 (human UAT walkthrough: v4.0 Phase 38 routes + Phase 40-44 deferred browser/provider/secret checks) — paused at checkpoint
- [ ] Resolve Phase 42 research flag: legacy slot-based signup coexistence/migration window

### Blockers/Concerns

- Research subagents were unavailable; research was completed inline from the codebase and current official documentation (SUMMARY confidence HIGH).
- Repository-wide lint remains red from pre-existing findings (163 errors, 185 warnings); typecheck, tests, and production build pass.
- v4.0 Phase 38 (UX regression verification) not started; its human-verification scope is absorbed by v5.0 Phase 45.
- REQUIREMENTS.md earlier claimed 36 v5.0 requirements; the traceability table lists 31 — all 31 are mapped to a phase (100% coverage). Coverage note corrected in REQUIREMENTS.md.
- Phase 41 execution added one additive contract field beyond the Plan 01 SUMMARY (`hasAccommodationSelections`) so the pending panel renders the honest pre-signup empty state; covered by tests and documented in the 41-02 SUMMARY.
- Phase 42 plan 02 has two backstop-verified must_haves (no page overflow at 320px; long server-provided labels wrap without clipping). No backstop tooling is configured in the repo; the markup is UI-SPEC-compliant and source-inspected, and the visual checks are deferred to Phase 45 human verification alongside the Phase 40/41 deferred items.
- Phase 43 plan 03 adds the same two backstop must_haves (no page overflow at 320px; long event-configured labels wrap without clipping) plus deep-link preservation for `/track-payment/[bookingRef]?token=...`; markup is UI-SPEC-compliant and source-inspected (min-w-0/flex-wrap contract asserted in component tests) and the visual walkthrough is deferred to Phase 45.
- Phase 43 plan 03 extended `vitest.components.config.ts` include with `components/**/*.test.tsx` (the repo previously had no tsx component tests); documented in the 43-03 SUMMARY.
- Phase 44 plan 03 carries the same two backstop must_haves (no page overflow at 320px; long labels/badges wrap without clipping) plus the lock-boundary helper copy; markup is UI-SPEC-compliant and source-inspected (min-w-0/flex-wrap badge and legend contract) and the visual walkthrough is deferred to Phase 45 alongside the Phase 40/41/42/43 deferred items.
- Phase 44 execution had no autonomous deviations requiring user choice; the only plan adjustment was committing Plan 02 Tasks 1+2 as one atomic backend unit (shared file, neither typechecks without the other) and updating the existing `app/api/dashboard/accommodation/assignments/route.test.ts` fixtures for the typed board rows — both documented in the 44-02/44-03 SUMMARIES.
- The pre-existing track-payment overpaid banner computes the donation amount client-side (`totalPaidMinor - totalDueMinor`) and is preserved unchanged as legacy behavior; the new Phase 43 editor/overpayment surfaces are strictly server-provided. Flagged for Phase 45 cross-surface money-agreement review.
- Phase 45 plan 01 documented the REQUIREMENTS FIN-04 / ROADMAP "stale links are expired/superseded/regenerated" wording conflict with the locked flexible-zero decision; `STATE.md` flexible-zero remains authoritative and the conflict is recorded in the 45-01 SUMMARY.
- Phase 45 plans 01-02 found zero production defects: every money consumer already consumes `loadOrderAmountDueBreakdowns` (no second formula), and every security/idempotency/confirmation guard held under the extended matrix. All changes were regression evidence (test files only).

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260805-fvk | Fix donation accounting so linked overpayments preserve settlement and standalone donations count once | 2026-08-05 | 288873d | [260805-fvk-fix-donation-accounting-so-overpayment-d](./quick/260805-fvk-fix-donation-accounting-so-overpayment-d/) |

## Session Continuity

Last session: 2026-08-06T12:45:00.000Z
Stopped at: Phase 45 plans 01-02 complete; plan 03 automated gates green — paused at the human UAT checkpoint (Task 3)
Resume file: .planning/phases/45-verification-cross-surface-audit/45-03-PLAN.md

## Deferred Verification

| Phase | State | Resume |
|-------|-------|--------|
| 34 | verification_complete | done |
| 35 | verification_complete | done |
| 36 | verification_complete | done |
| 37 | verification_complete | done |
| 38 | not_started | absorbed into v5.0 Phase 45 |
| 40 | verification_deferred_human | /gsd-verify-work 40 (responsive receipt and external Tikkie flow deferred until v5.0 milestone completion) |
| 41 | verification_deferred_human | /gsd-verify-work 41 (configured-event UI walkthrough, responsive layout, browser confirmation flow deferred until v5.0 milestone completion) |
| 42 | verification_deferred_human | /gsd-verify-work 42 (320px/responsive signup walkthrough; production SIGNUP_SUBMISSION_SECRET + Turnstile provisioning) |
| 43 | verification_deferred_human | /gsd-verify-work 43 (responsive permalink walkthrough; production SIGNUP_SUBMISSION_SECRET provisioning) |
| 44 | verification_deferred_human | /gsd-verify-work 44 (Allocation paid-priority 320px/desktop visual walkthrough, inbox/suggestions/assignment accessibility) |
| 44 | verification_deferred_human | /gsd-verify-work 44 (320px/responsive Allocation walkthrough; browser assignment-confirm lock flow) |
