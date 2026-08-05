---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Accommodation Upgrades & Options
status: roadmap_created
last_updated: "2026-08-05"
last_activity: 2026-08-05
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: `.planning/PROJECT.md`.

- **Core value:** One trusted dashboard for church conference finance operations.
- **Current focus:** Accommodation Upgrades & Options — priced accommodation catalog, options-only signup, booking-ref permalink re-pricing, paid-priority allocation.

## Current Position

Phase: 39 — Accommodation Catalog & Event Config Schema (next)
Plan: —
Status: Roadmap created — awaiting approval, then plan-phase 39
Last activity: 2026-08-05 — v5.0 roadmap created (Phases 39-45)

## Performance Metrics

| Metric | Value |
| --- | --- |
| Total v5.0 phases | 7 (39-45) |
| v5.0 requirements mapped | 31/31 (100%) |
| Completed phases | 0 |
| v4.0 carry-over | Phases 34-37 complete; Phase 38 verification absorbed into v5.0 Phase 45 |

## Accumulated Context

### Decisions (v5.0 roadmap)

- Phase numbering continues from v4.0: v5.0 spans Phases 39-45, ordered dependency-driven (schema → finance → admin config → signup → permalink → allocation → verification).
- Two-layer accommodation model: global reusable catalog (categories, room types w/ descriptions, options, age bands) + event-scoped config (rates, availability, enabled options) — separate tables, typed FKs, child tables, no nested arrays on one doc.
- Canonical finance: extend `loadOrderAmountDueBreakdowns` + pure `deriveOrderAmountBreakdown` (new pure accommodation-amounts module, unit-tested). Live derivation for unconfirmed orders; snapshot with config-version boundary at admin confirmation; confirmed orders never retroactively re-price. `orders.totalAmountMinor` stays the provider/write-time total.
- Signup becomes options-only (preferences in `orderAccommodationSelections`); placement stays in `orderAssignments`/`assignedRoomId` (admin assignment) — two separate records, never mixed.
- Permalink `/track-payment/[bookingRef]` is the app's first public write: ownership gate (booker email match/edit token), rate limiting, honeypot, idempotent replace-style mutation, server-side pricing only, `confirmedAt` write-guard enforced in the mutation.
- Tikkie links expire/supersede and regenerate on re-price so link amount always equals canonical amount-due.
- Paid-priority allocation keys on derived per-attendee due/paid maps (tri-state paid/partial/unpaid), never `order.status`; paid-set precomputed once per board load.
- SEED-002 aligned via single `ticketTypes.roomTypeId` (set ⇒ only that type; unset ⇒ all enabled); multi-room-type `roomTypeIds` array deferred.
- Phase 45 verification closes the PITFALLS "looks done but isn't" checklist: idempotency, edit-after-confirm rejection, ref-only rejection, price tampering, cross-surface amount agreement, stale-link expiry, internal-event paid status, deep-link preservation.

### Carried From v4.0 (context preserved)

- Event-scoped shell, single concise sidebar, shared dashboard query-state vocabulary, canonical finance/accommodation contracts, workspace tab pattern (`lib/dashboard/workspace-routes.ts`), event Overview as operational home.

### Pending Todos

- [ ] Await roadmap approval (or revision feedback)
- [ ] Plan Phase 39 (accommodation catalog & event config schema)
- [ ] Resolve Phase 40 research flag: snapshot mechanics at confirmation (per-line vs order-total snapshot; `configVersion` field placement)
- [ ] Resolve Phase 43 research flag: ownership-gate mechanism, rate limiting, honeypot reuse, edit audit rows, Tikkie regeneration timing
- [ ] Resolve Phase 42 research flag: legacy slot-based signup coexistence/migration window

### Blockers/Concerns

- Research subagents were unavailable; research was completed inline from the codebase and current official documentation (SUMMARY confidence HIGH).
- Repository-wide lint remains red from pre-existing findings (163 errors, 185 warnings); typecheck, tests, and production build pass.
- v4.0 Phase 38 (UX regression verification) not started; its human-verification scope is absorbed by v5.0 Phase 45.
- REQUIREMENTS.md earlier claimed 36 v5.0 requirements; the traceability table lists 31 — all 31 are mapped to a phase (100% coverage). Coverage note corrected in REQUIREMENTS.md.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260805-fvk | Fix donation accounting so linked overpayments preserve settlement and standalone donations count once | 2026-08-05 | 288873d | [260805-fvk-fix-donation-accounting-so-overpayment-d](./quick/260805-fvk-fix-donation-accounting-so-overpayment-d/) |

## Session Continuity

Last session: 2026-08-05
Stopped at: v5.0 roadmap created — Phases 39-45 drafted, awaiting approval
Resume file: .planning/ROADMAP.md

## Deferred Verification

| Phase | State | Resume |
|-------|-------|--------|
| 34 | verification_complete | done |
| 35 | verification_complete | done |
| 36 | verification_complete | done |
| 37 | verification_complete | done |
| 38 | not_started | absorbed into v5.0 Phase 45 |
