---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Canonical Orders Foundation
status: in_progress
stopped_at: Completed 26-order-ops-refresh-03-PLAN.md
  last_updated: "2026-04-21T13:58:42Z"
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-01)

- **Core value:** One trusted dashboard for church conference finance operations.
- **Current focus:** Phase 26 — order-ops-refresh

## Current Position

Phase: 26 (order-ops-refresh) — COMPLETE
Plan: 3 of 3 complete
Next: Phase 27 pending

## Performance Metrics

- Total phases in active milestone: 5
- Completed phases in active milestone: 0
- Total plans completed: 79
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

### Pending Todos

- Phase 26 is complete; phase 27 is the next planned step.

### Blockers/Concerns

- Brownfield migration must preserve existing dashboard, signup, sync, and Tikkie behavior during dual-write and cutover.
- Historical edge cases around formula parity and payment allocation rules still need plan-level validation.

## Session Continuity

Last session: 2026-04-21 13:58 UTC
Stopped at: Completed 26-order-ops-refresh-03-PLAN.md
Resume file: None
