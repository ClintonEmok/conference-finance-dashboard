---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Canonical Orders Foundation
status: in_progress
stopped_at: Completed 26-order-ops-refresh-01-PLAN.md
last_updated: "2026-04-21T10:32:50Z"
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 3
  completed_plans: 1
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-01)

- **Core value:** One trusted dashboard for church conference finance operations.
- **Current focus:** Phase 26 — order-ops-refresh

## Current Position

Phase: 26 (order-ops-refresh) — EXECUTING
Plan: 1 of 3 complete
Next: Plan 2 of 3 pending

## Performance Metrics

- Total phases in active milestone: 5
- Completed phases in active milestone: 0
- Total plans completed: 78
- Current milestone progress: 98%

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

### Pending Todos

- Continue phase-26 planned sequence after quick contract hardening.

### Blockers/Concerns

- Brownfield migration must preserve existing dashboard, signup, sync, and Tikkie behavior during dual-write and cutover.
- Historical edge cases around formula parity and payment allocation rules still need plan-level validation.

## Session Continuity

Last session: 2026-04-21 10:32 UTC
Stopped at: Completed 26-order-ops-refresh-01-PLAN.md
Resume file: None
