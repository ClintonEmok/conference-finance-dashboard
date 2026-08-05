---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Accommodation Upgrades & Options
current_phase: 42
current_phase_name: Public Signup Options
status: in_progress
stopped_at: Phase 42 plan 01 executed (public catalog/quote/submission contract); plan 02 UI next
last_updated: "2026-08-06T00:00:00.000Z"
last_activity: 2026-08-06
last_activity_desc: Executed 42-01 (public catalog/quote contract + options-only submission); Phase 40/41 human verification remains deferred to v5.0 milestone completion
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 6
  completed_plans: 5
  percent: 83
---

# Project State

## Project Reference

See: `.planning/PROJECT.md`.

- **Core value:** One trusted dashboard for church conference finance operations.
- **Current focus:** Accommodation Upgrades & Options — priced accommodation catalog, options-only signup, booking-ref permalink re-pricing, paid-priority allocation.

## Current Position

Phase: 42 — Public Signup Options
Plan: 42-01 complete (public catalog/quote/submission contract); 42-02 options-only signup UI next
Status: In progress
Last activity: 2026-08-06 — Executed 42-01; Phase 40/41 human items remain deferred until v5.0 milestone completion

Progress: ███████░ (5/6 plans executed across Phases 39-42; 0/7 phases signed off)

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
- [ ] Execute Phase 42 plan 02 (options-only signup UI: accommodation step, quote-backed review/summary, options-only client payload)
- [ ] Resolve Phase 43 research flag: ownership-gate mechanism, rate limiting, honeypot reuse, edit audit rows, Tikkie regeneration timing (note: Tikkie links are now flexible-zero, so regeneration on re-price no longer applies)
- [ ] Resolve Phase 42 research flag: legacy slot-based signup coexistence/migration window

### Blockers/Concerns

- Research subagents were unavailable; research was completed inline from the codebase and current official documentation (SUMMARY confidence HIGH).
- Repository-wide lint remains red from pre-existing findings (163 errors, 185 warnings); typecheck, tests, and production build pass.
- v4.0 Phase 38 (UX regression verification) not started; its human-verification scope is absorbed by v5.0 Phase 45.
- REQUIREMENTS.md earlier claimed 36 v5.0 requirements; the traceability table lists 31 — all 31 are mapped to a phase (100% coverage). Coverage note corrected in REQUIREMENTS.md.
- Phase 41 execution added one additive contract field beyond the Plan 01 SUMMARY (`hasAccommodationSelections`) so the pending panel renders the honest pre-signup empty state; covered by tests and documented in the 41-02 SUMMARY.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260805-fvk | Fix donation accounting so linked overpayments preserve settlement and standalone donations count once | 2026-08-05 | 288873d | [260805-fvk-fix-donation-accounting-so-overpayment-d](./quick/260805-fvk-fix-donation-accounting-so-overpayment-d/) |

## Session Continuity

Last session: 2026-08-05T22:54:00.000Z
Stopped at: Completed 42-01-PLAN.md (public catalog/quote/submission contract)
Resume file: .planning/phases/42-public-signup-options/42-02-PLAN.md

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
