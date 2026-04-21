---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Canonical Orders Foundation
  status: in_progress
  stopped_at: Checkpoint pending after 27-03-PLAN.md
  last_updated: "2026-04-21T20:45:08Z"
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 6
  completed_plans: 6
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-01)

- **Core value:** One trusted dashboard for church conference finance operations.
- **Current focus:** Phase 27 — event-scoped-dashboard

## Current Position

Phase: 27 (event-scoped-dashboard) — checkpoint pending
Plan: 03 of 03 complete (awaiting human verification)
Next: Human verify fullscreen chooser/loading behavior, then Phase 28 planning / follow-up

## Performance Metrics

- Total phases in active milestone: 6
- Completed phases in active milestone: 1
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

### Pending Todos

- Phase 26 gap-closure plans 04-06 are complete; phase 27 is the next planned step.
- Phase 27 is now in human verification after the fullscreen chooser/loading gap closure.

### Blockers/Concerns

- Brownfield migration must preserve existing dashboard, signup, sync, and Tikkie behavior during dual-write and cutover.
- Historical edge cases around formula parity and payment allocation rules still need plan-level validation in later phases.
- The dashboard entry flow needs to stay simple for single-event admins, with event-first navigation.
- Awaiting human verification for phase 27 plan 03; no code blockers remain.

## Session Continuity

Last session: 2026-04-21 20:45 UTC
Stopped at: Checkpoint pending after 27-03-PLAN.md
Resume file: None
