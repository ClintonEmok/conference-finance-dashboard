---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Canonical Orders Foundation
status: complete
stopped_at: Phase 29 completed
last_updated: "2026-04-25T16:24:48.483Z"
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 15
  completed_plans: 15
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-01)

- **Core value:** One trusted dashboard for church conference finance operations.
- **Current focus:** Phase 30 — safe-migration-and-parity

## Current Position

Phase: 30 (safe-migration-and-parity)
Plan: Not started

## Performance Metrics

- Total phases in active milestone: 7
- Completed phases in active milestone: 2
- Total plans completed: 84
- Current milestone progress: 99%

## Accumulated Context

### Roadmap Evolution

- Phases 13-17 established typed Convex contracts, finance hardening, auth hardening, safer sync behavior, and bounded query patterns.
- Phases 18-24 introduced canonical public signup contracts, atomic signup writes, public flow completion, and the first core `orders*` rewrite with Ticket Tailor extension tables.
- Phase 25 completed concerns-fixing work after the canonical orders rewrite.
- v3.0 starts from that base and focuses on finishing the runtime-truth migration: internal canonical tables first, provider redesign later.

### Decisions

- Internal canonical tables must become runtime truth before any provider redesign.
- Finance/runtime truth comes before removing legacy provider dependencies.
- Ticket Tailor redesign remains out of scope for v3.0; keep it as ingest/mapping only.
- Payment writes must persist canonical `orders._id`; provider order ids remain lookup-only inputs.
- Missing provider ids and totals should stay explicit as `null` across Convex, API, and dashboard contracts.
- The manage-orders route is the primary operator entry point; legacy orders URLs are compatibility redirects only.
- Inline order and attendee edits should reuse the existing PATCH APIs and refresh the detail surface immediately.
- `/dashboard` now serves as a thin bridge into the event chooser, and the chooser remains the canonical dashboard home.
- `EventSwitcher` is the shared event-scoped chrome control, with `currentSlug` passed in explicitly from shell and scoped layout.
- The global shell should stay minimal: keep event switching obvious and hide Overview / Finance / Operations from primary navigation.
- Event-scoped dashboards should keep `EventSwitcher` and section nav in one sidebar, while event title/status/actions move into a compact header and facts footer.

### Pending Todos

- Phase 26 gap-closure plans 04-06 are complete; phase 27 is now in human verification.
- Phase 27 still needs human verification for the sidebar cleanup, and Phase 28 has been scaffolded to handle the single-sidebar follow-up.

### Blockers/Concerns

- Brownfield migration must preserve existing dashboard, signup, sync, and Tikkie behavior during dual-write and cutover.
- Historical edge cases around formula parity and payment allocation rules still need plan-level validation in later phases.
- The dashboard entry flow needs to stay simple for single-event admins, with event-first navigation.
- The event-scoped dashboard still has duplicate sidebar chrome; Phase 28 will consolidate it into a single sidebar plus compact header/footer.
- Awaiting human verification for phase 27 plan 04; no code blockers remain.

## Session Continuity

Last session: 2026-04-25T16:24:48.483Z
Stopped at: Completed Phase 29 deterministic-money-model
Resume file: /Users/clintonemok/Work/2026/Church/Deeper Stack/conference-finance-dashboard/.planning/phases/29-deterministic-money-model/29-UI-SPEC.md
