---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Canonical Orders Foundation
status: roadmap_created
stopped_at: Roadmap created for milestone v3.0
last_updated: "2026-04-01T00:00:00.000Z"
last_activity: 2026-04-01 - Created roadmap for phases 26-30
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-01)

- **Core value:** One trusted dashboard for church conference finance operations.
- **Current focus:** Phase 26 - Canonical Runtime Contract

## Current Position

Phase: 26 of 30 (Canonical Runtime Contract)
Plan: —
Status: Ready to plan
Last activity: 2026-04-01 — Roadmap created for milestone v3.0

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

- Total phases in active milestone: 5
- Completed phases in active milestone: 0
- Total plans completed: 0
- Current milestone progress: 0%

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

### Pending Todos

- None captured yet for v3.0.

### Blockers/Concerns

- Brownfield migration must preserve existing dashboard, signup, sync, and Tikkie behavior during dual-write and cutover.
- Historical edge cases around formula parity and payment allocation rules still need plan-level validation.

## Session Continuity

Last session: 2026-04-01 00:00
Stopped at: Roadmap created and files updated for milestone v3.0
Resume file: None
