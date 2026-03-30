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
- Modal accessibility fixes for custom payment/Tikkie dialogs used in current dashboard flows
- Integration hardening for API rate limits, outbound fetch timeouts/retries, and auto-sync execution path safety
- Targeted regression and contract tests for each touched critical path, including Convex auth, webhook verification, occupancy truth, quota/match logic, interface extraction, and UI resilience fallbacks

Out of scope:

- New v2.0 event-signup schema/features from phases 18-21
- Broad redesign of dashboard UX beyond resilience and shared formatting
- Role-based access control redesign beyond existing authenticated operator access
- Non-critical polish issues from the review unless they are directly required by the critical fixes above

</domain>

<decisions>
## Implementation Decisions

### Security boundaries

- Keep Clerk as the auth provider and preserve the existing `requireApiUser()` route guard pattern in Next.js.
- Harden Convex itself instead of trusting the Next.js layer alone: every public write mutation in the audited modules must call `ctx.auth.getUserIdentity()` and reject unauthenticated access.
- Prefer `internalMutation` / `internalAction` for helper flows that are not true client APIs.
- Webhook verification must fail closed when the required secret env var is missing; missing secret is a misconfiguration, not an allow-all mode.
- Role-based access control is explicitly deferred from this phase; Phase 17 only closes authentication and transport-level security gaps.
- Any client component calling an authenticated Convex query must render beneath `<Authenticated>` from `convex/react` (or an equivalent Convex auth-ready guard), otherwise the query can throw during page load while auth is unresolved.

### Data integrity

- Treat attendee assignment truth (`ticketTailorAttendees.assignedRoomId`) as the authoritative room occupancy source.
- Stop relying on denormalized `occupiedBeds` writes as the source of truth for capacity or delete guards.
- Auto-match must avoid fetch-then-mutate races; matching decisions should happen in a single Convex mutation boundary.
- Tikkie monthly quota enforcement must happen inside the same write transaction that creates a link.
- CSV exports must include the archive columns already present in the header.

### Performance

- Replace unbounded `.collect()` calls on growing tables with indexed reads, `.take(N)`, pagination, or async iteration.
- Split execution into smaller plans so each risk area can land and verify independently.
- Preserve current route/domain response shapes while changing query strategy underneath.
- Avoid Convex query `.filter((q) => ...)` on touched hot paths; prefer `.withIndex` / `.withSearchIndex`, or explicit TypeScript filtering only after intentionally small reads.

### Convex implementation hygiene

- Await every touched Convex promise (`ctx.db.*`, `ctx.scheduler.*`, `ctx.run*`) so writes and schedules cannot fail silently.
- Keep argument validators on every public function and add return validators where practical on touched contracts.
- Use `ctx.auth.getUserIdentity()` for access control on all non-anonymous public functions; never trust spoofable args like email for authorization.
- Keep cron, scheduling, and `ctx.run*` targets on `internal.*` functions only.
- Prefer plain TypeScript helper functions over unnecessary `ctx.runQuery`, `ctx.runMutation`, and `ctx.runAction` hops.
- Include the table name in touched `ctx.db.get`, `ctx.db.patch`, `ctx.db.replace`, and `ctx.db.delete` calls.
- Do not introduce `Date.now()`-dependent query logic; if time-based filtering is needed, pass explicit args or use persisted coarse-grained fields.
- When adding indexes to remove scans, audit for redundant prefix indexes so the fix does not add avoidable write/storage overhead.

### UI resilience

- Add App Router `error.tsx` / `global-error.tsx` boundaries so dashboard crashes degrade to recoverable fallbacks instead of white screens.
- Add route-level `loading.tsx` surfaces for the main dashboard areas.
- Extract duplicated `formatMoney` into one shared utility without changing displayed EUR formatting.
- Replace custom modal shells with accessible dialog primitives or equivalent keyboard/focus-safe behavior.

### Integration hardening

- Add rate limiting to operator-facing and webhook API routes touched by this phase.
- Add explicit timeout and bounded retry behavior to outbound Ticket Tailor and Tikkie fetch clients.
- Remove circular Convex cron -> app HTTP -> Convex flow where feasible; prefer internal-only Convex execution paths.

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
- Extract model-specific interfaces/types into dedicated modules like `lib/types/payment.ts`, `lib/types/order.ts`, `lib/types/accommodation.ts`, `lib/types/tikkie.ts`, `lib/types/attendee.ts`, and `lib/types/shared.ts` where Phase 17 touches those contracts.

</specifics>

<deferred>
## Deferred Ideas

- Broad authorization model / RBAC redesign

</deferred>

---

_Phase: 17-fix-critical-code-review-issues_
_Context gathered: 2026-03-28 via roadmap + code-review artifacts_
