---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Event Dashboard UX Overhaul
status: phase_complete
stopped_at: Phase 37 shared dashboard quality execution complete
last_updated: "2026-08-05T10:15:00Z"
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 23
  completed_plans: 23
---

# Project State

## Project Reference

See: `.planning/PROJECT.md`.

- **Core value:** One trusted dashboard for church conference finance operations.
- **Current focus:** Defining and executing the event dashboard UX overhaul.

## Current Position

Phase: 37 of 5 (Shared Dashboard Quality)
Plan: 8 of 8
Status: Phase 37 complete; Phase 38 not started
Last activity: 2026-08-05 — Manual verification of Phases 34–37 completed

Progress: ████████████████████ 100% of known planned execution; 23/23 plans complete

## Accumulated Context

### Decisions

- Use the existing event-scoped shell and Convex hooks.
- Make Overview the operational home.
- Group Finance and Accommodation into coherent workspaces.
- Preserve canonical finance semantics and deep links.
- Canonical event root renders the shared Overview surface; `/overview` redirects safely to the slug root.
- Finance owns payment, order, donation, and reconciliation descendants; Accommodation owns accommodation descendants.
- Settings owns sharing/configuration; `/share` redirects to the slug-scoped sharing anchor.
- Disabled accommodation allocation access points directly to the slug-scoped Settings page.
- Overview reads use explicit event-start-to-now scope, canonical returned totals, and projection-derived actions; missing event dates remain unavailable rather than defaulting to 30 days.
- Overview exceptions are limited to confirmed reconciliation, pending order, accommodation setup, and unassigned-attendee states with one slug-scoped destination each.
- Money readiness requires both revenue and reconciliation payloads; confirmed canonical zero balances remain valid while unresolved reconciliation stays explicit.
- Overview accommodation wrappers use discriminated pending/success/error results so Convex failures cannot remain indefinite loading or become setup exceptions.
- Phase 36 workspaces use shared restrained framing, URL-addressable tabs, exception-first action strips, and local adapters that preserve canonical finance/accommodation contracts.
- Legacy finance and accommodation routes are explicit same-slug redirects; order and room intent are carried in encoded workspace query parameters.
- Finance and Accommodation attention queues derive only from resolved canonical payloads; pending/error states never render fabricated open counts, and unmatched payments remain explicitly global.
- Workspace tabs use stable workspace/tab IDs, normal native-link tab order, and one active labelled tabpanel per workspace.
- Allocation filters are normalized in URL state and passed only through existing supported board arguments; roomId intent selects a canonical room page or reports unavailable intent.
- Finance and Accommodation tab adapters lead directly with operational workflows and restrained inline summaries rather than duplicate glass metric-card dashboards.
- Slug-scoped event descendants consume one layout-owned `EventDashboardProvider`; event-local global event-list reads use an explicit Convex skip path.
- Dashboard loading, error, empty, unavailable, disabled, unconfigured, and ready states use one presentation vocabulary with ready-only content/count handoffs.
- Native sidebar links, URL tabs, and table primitives expose current/selected semantics, visible focus, local overflow, and mobile Sheet close behavior.
- Finance attention payloads are parent-owned and reused by active Payments/Reconciliation surfaces; unmatched payments remain explicitly global.
- Accommodation read modes are pure and active-tab-aware: default Allocation reuses the parent board, while filters and room intent opt into a distinct detail read.
- Unresolved canonical money remains unavailable; confirmed canonical zero remains valid and visible as zero.

### Pending Todos

### Blockers/Concerns

- Research subagents were unavailable, so research was completed inline from the codebase and current official documentation.
- Existing phase directories from v3.0 should be archived before implementation begins if the planning runtime requires clean phase numbering.
- Repository-wide lint remains red from pre-existing findings (163 errors, 185 warnings); typecheck, tests, and production build pass.
- Phase 35 manual visual/browser verification completed 2026-08-05; production build emits existing metadata/workspace-root warnings but passes.
- Phase 36 automated verification passes; manual human/browser visual verification completed 2026-08-05.
- Phase 37 automated verification passes; manual human/browser visual, responsive, keyboard, and live-data verification completed 2026-08-05.
- Phase 37 plans 37-01 through 37-08 are complete; Phase 38 was intentionally not started.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260805-fvk | Fix donation accounting so linked overpayments preserve settlement and standalone donations count once | 2026-08-05 | 288873d | [260805-fvk-fix-donation-accounting-so-overpayment-d](./quick/260805-fvk-fix-donation-accounting-so-overpayment-d/) |

## Session Continuity

Last session: 2026-08-05T09:47:58Z
Stopped at: Manual verification of Phases 34–37 completed
Resume file: —

## Deferred Verification

| Phase | State | Resume |
|-------|-------|--------|
| 34 | verification_complete | done |
| 35 | verification_complete | done |
| 36 | verification_complete | done |
| 37 | verification_complete | done |
