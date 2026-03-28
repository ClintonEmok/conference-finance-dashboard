# Phase 17: Fix Critical Code Review Issues - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning
**Source:** Roadmap + code-review fix list + UI review

<domain>
## Phase Boundary

This phase is a stabilization gate before v2.0 schema work.

In scope:

- Convex write-surface auth hardening for finance, sync, attendee, order, event, and accommodation mutations
- Webhook verification fail-closed behavior when secrets are missing
- Data-integrity repairs for room occupancy, payment auto-match, Tikkie quota enforcement, and CSV export completeness
- Performance fixes for known unbounded Convex reads and table scans
- Dashboard resilience fixes: App Router error boundaries/loading states and `formatMoney` consolidation

Out of scope:

- New v2.0 event-signup schema/features from phases 18-21
- Broad redesign of dashboard UX beyond resilience and shared formatting
- Non-critical polish issues from the review unless they are directly required by the critical fixes above

</domain>

<decisions>
## Implementation Decisions

### Security boundaries

- Keep Clerk as the auth provider and preserve the existing `requireApiUser()` route guard pattern in Next.js.
- Harden Convex itself instead of trusting the Next.js layer alone: every public write mutation in the audited modules must call `ctx.auth.getUserIdentity()` and reject unauthenticated access.
- Prefer `internalMutation` / `internalAction` for helper flows that are not true client APIs.
- Webhook verification must fail closed when the required secret env var is missing; missing secret is a misconfiguration, not an allow-all mode.

### Data integrity

- Treat attendee assignment truth (`ticketTailorAttendees.assignedRoomId`) as the authoritative room occupancy source.
- Stop relying on denormalized `occupiedBeds` writes as the source of truth for capacity or delete guards.
- Auto-match must avoid fetch-then-mutate races; matching decisions should happen in a single Convex mutation boundary.
- Tikkie monthly quota enforcement must happen inside the same write transaction that creates a link.
- CSV exports must include the archive columns already present in the header.

### Performance

- Replace unbounded `.collect()` calls on growing tables with indexed reads, `.take(N)`, pagination, or async iteration.
- Preserve current route/domain response shapes while changing query strategy underneath.

### UI resilience

- Add App Router `error.tsx` / `global-error.tsx` boundaries so dashboard crashes degrade to recoverable fallbacks instead of white screens.
- Add route-level `loading.tsx` surfaces for the main dashboard areas.
- Extract duplicated `formatMoney` into one shared utility without changing displayed EUR formatting.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase sources

- `.planning/ROADMAP.md` — Phase 17 goal, success criteria, and plan placeholders
- `.planning/STATE.md` — active auth/accommodation constraints carried forward from Phase 16
- `.planning/phases/17-fix-critical-code-review-issues/17-FIX-LIST.md` — audited issue inventory with file targets
- `.planning/phases/17-fix-critical-code-review-issues/17-CONVEX-FUNCTIONS.md` — public/internal Convex function audit for auth hardening
- `.planning/ui-reviews/001-UI-REVIEW.md` — dashboard resilience and duplicated-formatting findings

### Project rules

- `AGENTS.md` — project-wide Convex instruction gate
- `convex/_generated/ai/guidelines.md` — required Convex API/auth/query guidance

### Prior implementation patterns

- `.planning/phases/13-rebuild-convex-mutation-and-api-layer-from-clean-contracts/13-03-PLAN.md` — established pattern for focused Convex contracts and typed route/domain boundaries
- `.planning/phases/16-v1-milestone-gap-closure/16-03-SUMMARY.md` — current accommodation scoring/board assumptions to preserve
- `.planning/phases/16-v1-milestone-gap-closure/16-04-SUMMARY.md` — current accommodation filter and `hasFamily` UI contract to preserve

</canonical_refs>

<specifics>
## Specific Ideas

- Use a small shared Convex auth helper so every public mutation gets the same guard instead of copy-pasted auth logic.
- Add targeted regression tests for webhook misconfiguration, CSV archive fields, and any new quota/match logic.
- Keep route URLs and operator-facing JSON envelopes stable while tightening backend behavior.

</specifics>

<deferred>
## Deferred Ideas

- Modal accessibility refactors beyond what is required for current route resilience
- Broad type-extraction cleanup from the fix list (`lib/types/*`) unless needed to complete the critical work above
- Cron/timeout/rate-limit improvements not required by the eight roadmap success criteria

</deferred>

---

_Phase: 17-fix-critical-code-review-issues_
_Context gathered: 2026-03-28 via roadmap + code-review artifacts_
