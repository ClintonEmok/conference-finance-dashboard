# Phase 17 Research: Fix Critical Code Review Issues

**Researched:** 2026-03-28
**Sources:** Phase fix list, Convex docs, Next.js App Router docs, existing project patterns

## What matters for planning

### 1. Convex auth must be enforced inside public mutations

Current risk: many financial/accommodation/sync mutations are public and callable from the internet if someone has the deployment URL. Next.js route guards are not enough.

Relevant guidance:

- Convex public `mutation()` functions are exposed APIs.
- Sensitive internal-only flows should use `internalMutation()` / `internalAction()`.
- Public write mutations should call `ctx.auth.getUserIdentity()` and reject unauthenticated traffic.

Planning implication:

- Phase 17 should add a shared Convex auth guard helper.
- Every public write mutation in the audited modules must call that helper before any write.
- Server-only helper flows that do not need a client API should be converted to internal refs.

### 2. Fail closed for webhook verification

Both webhook verifiers currently return `true` when the secret env var is missing. That converts a deployment misconfiguration into an allow-all path.

Planning implication:

- `verifyTikkieWebhook()` and `verifyTicketTailorWebhook()` should return `false` when the configured secret is blank.
- Route tests should explicitly cover the “secret missing” path so it never regresses.

### 3. Occupancy truth should come from assignments, not `occupiedBeds`

Current risk: assignment/unassignment writes patch both attendee assignment and room `occupiedBeds`. Convex retries or partial logic duplication can drift the counter.

Relevant guidance:

- Convex mutations are transactional, but duplicated write paths still create drift risk.
- The codebase already moved hotel delete guards to `assignedRoomId` truth in a quick fix.

Planning implication:

- Treat `ticketTailorAttendees.assignedRoomId` as the authoritative occupancy source.
- Remove capacity/delete decisions that depend on stored `room.occupiedBeds`.
- Read models can still expose `occupiedBeds`, but the value should be derived from attendee assignments.

### 4. Auto-match and quota checks should be decided in one mutation boundary

Current risks:

- `lib/domain/finance/payments.ts` queries unassigned payments and paid orders, then mutates later in separate calls.
- `lib/domain/finance/tikkie-quota.ts` checks quota before link creation, creating a TOCTOU window.

Planning implication:

- Matching should happen in a Convex mutation that reads candidates and patches matches in one transaction.
- Quota enforcement should live inside the create-link mutation, not as a preflight query in the Next.js/domain layer.
- If the current schema lacks an efficient month lookup, add the smallest backward-compatible field/index needed for atomic quota reads.

### 5. `.collect()` should be replaced with indexes, `.take()`, pagination, or async iteration

Relevant Convex guidance:

- Avoid unbounded `.collect()` on growing tables.
- Use indexes to narrow reads.
- Use `.take(N)` or `.paginate()` for bounded result sets.
- If exact counting is required, prefer denormalized counters; otherwise use bounded UI counts or async iteration instead of collecting whole tables into memory.

Planning implication:

- The audited hot paths should be fixed first: attendees, orders, payments, Tikkie links, and accommodation board reads.
- Preserve current contracts but change the data-access strategy.
- Add indexes only where existing schema indexes cannot express the current query shape.

### 6. Next.js App Router already provides the recovery primitives we need

Relevant Next.js guidance:

- `error.tsx` is a route-segment error boundary and must be a client component.
- Errors bubble to the nearest parent `error.tsx`.
- `global-error.tsx` replaces the root layout when needed and must render `<html>` / `<body>`.
- `loading.tsx` provides route-segment transition fallbacks automatically.

Planning implication:

- A `app/dashboard/error.tsx` boundary is the minimum dashboard crash shield.
- `app/global-error.tsx` gives a root fallback if layout-level rendering fails.
- Main dashboard segments should get `loading.tsx` files so route transitions show immediate feedback.

### 7. `formatMoney` consolidation is low risk and high leverage

The same EUR formatter is duplicated across dashboard pages/components. This is straightforward to centralize.

Planning implication:

- Add a shared formatter module with the exact current behavior.
- Replace local duplicates without changing copy, locale, or currency output.

## Recommended plan split

1. **Security hardening** — Convex auth guard + fail-closed webhook verification
2. **Data integrity** — occupancy truth + payment auto-match/quota transaction safety + CSV archive fields
3. **Performance** — remove audited unbounded `.collect()` and full-table scans
4. **UI resilience** — error boundaries + loading states + shared money formatter

This split keeps UI work parallel with backend hardening while keeping overlapping finance/accommodation files sequential.

## Validation Architecture

### 17-01 Security hardening

- `rg "ctx\.auth\.getUserIdentity\(|assert.*Auth|require.*Identity" convex/attendees.ts convex/orders.ts convex/payments.ts convex/tikkie.ts convex/accommodation.ts convex/events.ts convex/sync.ts` returns matches in every public write module.
- `npm test -- tests/tikkie/webhook-route.test.ts tests/ticket-tailor/sync-route.test.ts` exits 0.
- `rg "return true" lib/integrations/tikkie/webhook.ts lib/integrations/ticket-tailor/webhook.ts` returns no missing-secret allow-all branch.

### 17-02 Data integrity

- `rg "archiveReason|archivedAt|isArchived" lib/domain/finance/order-ledger.ts` shows both header and row mapping include archive fields.
- Accommodation assign/unassign paths no longer patch `occupiedBeds` directly.
- Auto-match/quota flows are executed through a single Convex mutation boundary and route/domain callers stop doing query-then-write preflights.

### 17-03 Performance

- `rg "\.collect\(" convex/attendees.ts convex/orders.ts convex/payments.ts convex/tikkie.ts convex/accommodation.ts` shows no remaining unbounded table-wide hot-path collects from the audit list.
- `npm run typecheck` exits 0.

### 17-04 UI resilience

- `test -f app/global-error.tsx && test -f app/dashboard/error.tsx` exits 0.
- `rg "from \"@/lib/format" app/dashboard components` shows shared formatter imports.
- `find` is not available in plan execution, so verify route-segment loading/error files with `Glob app/dashboard/**/{error,loading}.tsx` and targeted file reads.

## Recommendations to preserve

- Keep existing route URLs and JSON contracts stable.
- Keep Clerk + `requireApiUser()` as the Next.js guard pattern, but do not rely on it as the only auth layer.
- Prefer small, local schema/index changes over broad table redesigns in this stabilization phase.

---

_Phase: 17-fix-critical-code-review-issues_
