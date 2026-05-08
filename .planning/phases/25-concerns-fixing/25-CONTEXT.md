# Phase 25: Concerns fixing - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Address CRITICAL-severity findings from the codebase audit (CONCERNS.md, CONCERNS-UX-DEVEX.md). Focus on fixes that prevent data exposure, eliminate broken behavior, and remove dead code. HIGH/MEDIUM concerns are deferred via seed planting.

</domain>

<decisions>
## Implementation Decisions

### Fix Prioritization

- **D-01:** Scope is CRITICAL-only — 3 CRITICAL issues from audit
- **D-02:** HIGH and MEDIUM concerns are deferred; seeds will be planted via `/gsd-plant-seed` for future phases
- **D-03:** Code quality fixes that are CRITICAL-adjacent (Prisma remnants, duplicate clients) are included since they reduce false positives and confusion

### Auth Guards for Convex Queries

- **D-04:** Use the existing auth pattern from Phase 17 — import auth helper from `convex/_system/auth`, add `ctx.auth.getUserIdentity()` guard to each unprotected query
- **D-05:** Affected queries: `convex/orders.ts`, `convex/payments.ts`, `convex/tikkie.ts`, `convex/attendees.ts`, `convex/events.ts`, `convex/accommodation.ts`, `convex/sync.ts`
- **D-06:** Queries that must remain public (e.g., event listing for signup) should only return non-sensitive data

### Webhook Secret Handling

- **D-07:** `TICKET_TAILOR_WEBHOOK_SECRET` is NOT needed — the webhook handler runs internally, not as an external-facing endpoint
- **D-08:** The CONCERNS.md finding about missing webhook secret is a false positive for this deployment model

### Dead Code Cleanup

- **D-09:** Dead code in `app/signup/success/[bookingRef]/page.tsx` (lines 59-85) should be extracted to a separate component, not deleted — may be needed later
- **D-10:** After extraction, the page should have clean control flow with no unreachable code

### Prisma Remnants

- **D-11:** Delete the entire `prisma/` directory including SQLite DBs — Convex migration is complete
- **D-12:** Remove any remaining Prisma imports from the codebase

### Duplicate HTTP Clients

- **D-13:** Consolidate to single client — remove duplicate HTTP client in `autoSync.ts`, use existing `lib/integrations/ticket-tailor/client.ts`

### Massive File Refactoring

- **D-14:** Defer refactoring of massive files (accommodation.ts 1,227 lines, page 1,708 lines) — not CRITICAL

### Testing

- **D-15:** Delete stale Prisma tests (868-line test file mocking non-existent interfaces) — they provide false confidence
- **D-16:** Leave vitest environment (`node`) as-is — fixing for component testing belongs in a dedicated testing phase

### the agent's Discretion

- Exact order of query auth guard implementation
- Component naming for extracted dead code
- Whether to add comments explaining why webhook secret is not needed

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Audit findings

- `.planning/codebase/CONCERNS.md` — Full audit findings with file paths and line numbers for CRITICAL issues (§CRITICAL SECURITY FINDINGS)
- `.planning/codebase/CONCERNS-UX-DEVEX.md` — UX/DevEx audit findings (§Dead code in signup success page)

### Auth patterns

- `convex/_system/auth.ts` — Existing auth helper pattern from Phase 17 to reuse for query guards

### Project decisions

- `.planning/PROJECT.md` — Key decisions: Clerk as only auth runtime, Convex contracts as canonical backend access

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `convex/_system/auth.ts` — Auth guard utility from Phase 17, can be reused for all query protection
- `lib/integrations/ticket-tailor/client.ts` — Single source of truth for Ticket Tailor HTTP client
- `lib/auth/server.ts` — `requireApiUser()` used by Next.js API routes (for reference)

### Established Patterns

- Phase 17 established the pattern of adding `requireIdentity(ctx)` to Convex queries
- Next.js API routes already enforce auth via `requireApiUser()` — Convex queries need the same treatment at the Convex layer

### Integration Points

- Convex queries are currently `publicQuery` — need to become `query` with auth guards
- `autoSync.ts` duplicates `lib/integrations/ticket-tailor/client.ts` — consolidate by removing autoSync's HTTP client
- `prisma/` directory is fully removable — no active imports should remain

</code_context>

<specifics>
## Specific Ideas

- "Use existing auth pattern" — user wants consistency with Phase 17 approach, not a new auth middleware
- Webhook secret finding is a false positive — runs internally, no external webhook endpoint needs verification
- Dead code should be preserved as a component, not deleted — user may need it later

</specifics>

<deferred>
## Deferred Ideas

These items will be planted as seeds for future phases:

### Security (HIGH severity)

- No webhook replay protection for Tikkie
- Financial amounts accept negative values (no range validation)
- No audit trail for financial mutations
- Race condition in room assignment (capacity check not atomic)

### Code Quality (MEDIUM severity)

- No Zod validation library used anywhere
- `v.any()` on 13+ schema fields
- String IDs instead of `v.id()` — no referential integrity
- Fragile name-only auto-match logic

### Structural

- Massive file refactoring (accommodation.ts 1,227 lines, page 1,708 lines)
- Missing error/loading boundaries on 7+ routes
- No mobile hamburger menu
- Accessibility gaps (table rows not keyboard-navigable, missing ARIA labels)

### Testing

- Zero component tests
- Zero E2E tests
- vitest environment fix for component testing

### Reviewed Todos (not folded)

- None — no todos were surfaced during this phase discussion

</deferred>

---

_Phase: 25-concerns-fixing_
_Context gathered: 2026-03-31_
