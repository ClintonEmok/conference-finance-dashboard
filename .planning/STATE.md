---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: Dynamic Event Accommodation
status: planning
last_updated: "2026-08-07T08:50:00.000Z"
last_activity: 2026-08-07
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 5
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: `.planning/PROJECT.md`.

- **Core value:** One trusted dashboard for church conference finance operations.
- **Current focus:** v6.0 Dynamic Event Accommodation — event-owned setup, explicit copy/template reuse, dynamic ticket-aware signup consumption, one canonical finance/allocation contract.

## Current Position

Phase: 46 of 51 (Event-Owned Setup Schema, Generalized Pricing & Shared Contract) — planned, not started
Plan: 5 plans in 5 sequential waves (46-01 through 46-05)
Status: Phase 46 executable plans written — ready for execution
Last activity: 2026-08-07 — Completed quick task 260807-uel: hid the allocation-board Generate Suggestions button and surfaced buyer accommodation preferences (occupancy, night-before, Superior upgrade, cot) as server-driven chips on the allocation tab

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

| Metric | Value |
| --- | --- |
| Total v6.0 phases | 6 (46-51) |
| v6.0 requirements mapped | 44/44 (100%) |
| v5.0 phases | 7 (39-45), all executed; Phase 45 automated gates green |
| v5.0 deferred human verification | Phases 40-44 walkthroughs + Phase 45 UAT checkpoint (see Deferred Verification) |

## Accumulated Context

### Decisions (v6.0 roadmap)

- Phase numbering continues from v5.0: v6.0 spans Phases 46-51. Backend/data phases (46-47) land before UI phases (48-49), then integration (50), then verification (51). UI and backend/data work are never merged into the same phase (locked user requirement). No backend contract change after Phase 47.
- **Phase 46 (backend/data):** event-owned setup schema + provenance + single version boundary, optional base/extended stay window, ticket-included accommodation, ticket-specific option inclusion, generalized line-item pricing engine, one shared `loadEventOwnedAccommodationContext` projection, additive legacy compatibility, SEED-002 rules tables, generalized selection-write contract (SEL-01/02/03), snapshot `optionLines` extension with extended fail-closed guard. 21 requirements.
- **Phase 46 plan structure:** 46-01 is the schema/pricing tracer; 46-02 establishes the shared projection and per-event materialization; 46-03 wires finance/confirmation/public contracts; 46-04 completes generic selection persistence and protected edits; 46-05 runs the full regression and validation gate. UI, copy/template, eligibility enforcement, and archive/delete remain deferred to later phases.
- Phase 46 planning locks: `per_night`, `per_person`, and `per_person_per_night` units; `eventAccommodationSetup.updatedAt` is the sole version token; `eventTicketAccommodationRules` is the event-owned SEED-002 source seeded from `ticketTypes.roomTypeId`/`accommodationIncluded`; ticket rules can include specific option keys for covered base nights; Standard/Superior is data via an event-category relationship; materialization is per-event on explicit setup/save with no global backfill. SET-01's empty/legacy initialization contract lands here; copy/template source behavior remains Phase 47.
- **Phase 47 (backend/data):** copy/template engine (atomic deep copy, ID remap, idempotency, provenance audit, no order state), one shared eligibility resolver (CFG-04, TKT-02/03), reference-safe archive/delete (REUSE/LIFE). 9 requirements.
- **Phase 48 (admin UI):** data-driven Setup experience, mandatory copy/template preview, lifecycle + pending-impact controls, preserved Hotels/Allocation tabs + deep links (ADM). 3 requirements.
- **Phase 49 (public flow):** data-driven signup cards + quote/review/submission + optional extra-night selection + generalized track-payment editor with preserved protections (STAY-02, PUB). 6 requirements.
- **Phase 50 (allocation/integration):** entitlement-aligned board, paid-priority + confirmation lock preserved, canonical finance/reporting/payment consumer agreement (ALL). 2 requirements.
- **Phase 51 (verification):** money matrix, legacy hotel workflow regression, copy isolation, archive safety, security/idempotency, bounded reads, hardcoded-branch sweep, human UAT (VER). 3 requirements.
- Research flags are surfaced as per-phase "Planning decisions" in ROADMAP.md (not silently implemented): Phase 46 choices are locked in its plan set; remaining decisions are copy inventory mode, named template table, copy idempotency/OCC, audit shape (Phase 47); tab rename + deep links, copy undoability, provider mapping surface (Phase 48); legacy `slots` coexistence, mid-signup invalidation (Phase 49); board enforcement strength (Phase 50).

### Carried From v5.0 (context preserved)

- Two-layer accommodation model executed in Phases 39-45: global reusable catalog (categories, room types, options, age bands) + event-scoped config (rates, availability, enabled options); confirmedAt + configVersion + immutable priceSnapshot on each selection row; loader fails closed on confirmed-without-snapshot.
- Canonical finance: `loadOrderAmountDueBreakdowns` + pure `lib/domain/finance/accommodation-amounts.ts`; live derivation for unconfirmed orders, snapshot for confirmed; `orders.totalAmountMinor` stays provider/write-time total.
- Permalink `/track-payment/[bookingRef]`: ownership gate (email match/edit token), rate limiting, honeypot, idempotent replace-style mutation, server-side pricing only, `confirmedAt` write-guard. Tikkie links are flexible-zero and never regenerated (supersedes the earlier re-price-regeneration wording).
- Paid-priority allocation keys on derived per-attendee due/paid maps (tri-state), never `order.status`; SEED-002 aligned via single `ticketTypes.roomTypeId`; multi-room-type array deferred.
- Phase 45 plans 01-02 found zero production defects (every money consumer already consumes `loadOrderAmountDueBreakdowns`); plan 03 automated gates green.

### Pending Todos

- [x] Await roadmap approval (or revision feedback)
- [x] Plan Phase 46 (event-owned setup schema + generalized pricing + shared projection + legacy compat + SEED-002 rules)
- [x] Resolve Phase 46 planning decisions: unit vocabulary, version-boundary owner, ticket-rules shape, Standard/Superior-as-data, percent rounding, per-event materialization
- [ ] Resolve Phase 47 planning decisions: copy inventory mode (linked vs cloned), named template table, copy idempotency/OCC, copy audit shape
- [ ] Resolve Phase 48/49/50 planning decisions: tab rename + deep links, copy undoability, provider mapping, legacy `slots` coexistence, board enforcement strength
- [ ] Review hardcoded accommodation vocabularies and decide the data-driven refactor scope for occupancy, categories, night-before levels, and resource kinds
- [ ] v5.0 carry-over: Phase 45 plan 03 task 3 human UAT + Phases 40-44 deferred human verification (fold into v6.0 verification window)

### Blockers/Concerns

- v5.0 deferred human verification items remain open (Phase 40/41/42/43/44 visual walkthroughs; Phase 45 UAT checkpoint) — carry into v6.0 Phase 51 verification window.
- Open v5.0 flag: legacy `slots`-based signup coexistence/migration window (Phase 42) — v6.0 Phase 49 must not force the legacy flow off before its window is decided.
- Repository-wide lint remains red from pre-existing findings (163 errors, 185 warnings); typecheck, tests, and production build pass.
- Research MEDIUM-confidence target-state decisions remaining for later phases are flagged per phase and must be locked at plan time (template table, copy inventory mode, and later UI/integration choices), not assumed in implementation.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260807-ocs | Shipped the simplified accommodation contract across signup + manage booking: included stay always Standard (server-resolved, no buyer category picker), occupancy Single/Shared only, Superior as an independent €10/person/night included-stay upgrade, independent one-night night-before (Standard €90/€60, Superior €100/€70), shared server pricing across quote/submission/edit/confirmation/signatures, idempotent divine-conference migration, €360 acceptance example locked | 2026-08-07 | e11a0a9 | [260807-ocs-ship-simplified-signup-accommodation-to-](./quick/260807-ocs-ship-simplified-signup-accommodation-to-/) |
| 260807-uel | Hidden the allocation-board Generate Suggestions button (dormant) and surfaced buyer accommodation preferences as server-driven chips: getRoomAllocationBoard joins stored orderAccommodationSelections + option child rows and exposes occupancy, nightBeforeLevel, categoryLabel, optionKeys on unassigned attendees and room occupants; allocation tab renders Single/Shared/Family, Superior upgrade, Cot, and Night before chips from server fields only | 2026-08-07 | 5eb22d3 | [260807-uel-hide-the-generate-suggestions-button-on-](./quick/260807-uel-hide-the-generate-suggestions-button-on-/) |
| 260807-ka4 | Repointed the manage-booking permalink to `/booking/[bookingRef]/manage` with `/booking` as canonical search entry; `/manage*` and `/track-payment*` became full-query-preserving legacy redirects; all buyer-facing link producers repointed | 2026-08-07 | a22e470 | [260807-ka4-repoint-the-manage-booking-permalink-to-booking](./quick/260807-ka4-repoint-the-manage-booking-permalink-to-/) |
| 260807-f6r | Manage booking page permalink — renamed the track-payment surface to "Manage booking" at `/manage`, booking summary + payment tracking + accommodation edit + Tikkie retained, edit-token permalink builder + email links moved, legacy `/track-payment*` redirects | 2026-08-07 | d6dac52 | [260807-f6r-add-a-manage-booking-page-with-a-permali](./quick/260807-f6r-add-a-manage-booking-page-with-a-permali/) |
| 260807-ejn | Buyer-facing optional extended night-before accommodation purchase (per-attendee nights stepper, server-authoritative nights validation shared by quote + submission, review/sidebar display, full test matrix) | 2026-08-07 | 490ea43 | [260807-ejn-add-buyer-facing-optional-extended-night](./quick/260807-ejn-add-buyer-facing-optional-extended-night/) |

## Deferred Verification

| Phase | State | Resume |
|-------|-------|--------|
| 34 | verification_complete | done |
| 35 | verification_complete | done |
| 36 | verification_complete | done |
| 37 | verification_complete | done |
| 38 | not_started | absorbed into v5.0 Phase 45 |
| 40 | verification_deferred_human | /gsd-verify-work 40 (responsive receipt and external Tikkie flow) |
| 41 | verification_deferred_human | /gsd-verify-work 41 (configured-event UI walkthrough, responsive layout, browser confirmation flow) |
| 42 | verification_deferred_human | /gsd-verify-work 42 (320px/responsive signup walkthrough; production SIGNUP_SUBMISSION_SECRET + Turnstile provisioning) |
| 43 | verification_deferred_human | /gsd-verify-work 43 (responsive permalink walkthrough; production SIGNUP_SUBMISSION_SECRET provisioning) |
| 44 | verification_deferred_human | /gsd-verify-work 44 (Allocation paid-priority 320px/desktop visual walkthrough, inbox/suggestions/assignment accessibility) |
| 44 | verification_deferred_human | /gsd-verify-work 44 (320px/responsive Allocation walkthrough; browser assignment-confirm lock flow) |
| 45 | verification_deferred_human | /gsd-verify-work 45 (human UAT checkpoint — plan 03 task 3) |

## Session Continuity

Last session: 2026-08-07
Last activity: Completed quick task 260807-ka4: manage-booking permalink at /booking/[bookingRef]/manage (canonical /booking search, legacy /manage* + /track-payment* redirects, all producers repointed; 455/502/116 tests + tsc green)
Stopped at: Phase 46 planning complete; implementation has not started
Resume file: None (next: /gsd/execute-phase 46)
