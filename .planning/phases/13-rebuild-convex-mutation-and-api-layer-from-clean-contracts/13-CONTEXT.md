# Phase 13: rebuild convex mutation and api layer from clean contracts - Context

**Gathered:** 2026-03-26
**Status:** Ready for replanning

<domain>
## Phase Boundary

Rebuild the Convex mutation and API layer so reads and writes flow through one canonical typed contract boundary. This phase cleans up the backend contract surface, generated API imports, and server bridge shape without expanding product scope. It should preserve the current operator-facing dashboard and integration behavior while replacing migration-era raw string-path dispatch, nested generated imports, and oversized public Convex modules.

</domain>

<decisions>
## Implementation Decisions

### Contract preservation strictness

- **D-01:** Treat existing Next.js route JSON contracts as the stable boundary for this phase. Preserve field names, nesting, and response semantics exactly unless a route is clearly broken.
- **D-02:** Preserve existing `400`, `404`, and `500` status-code behavior and keep error message wording as close as possible to current responses, matching the already-locked `401 UNAUTHORIZED` contract discipline from Phase 12.
- **D-03:** Convex module names, internal helper names, and domain-layer internals may be renamed aggressively if that is the cleanest path, as long as route-level contracts remain stable.
- **D-04:** Preserve response fields that are currently consumed by routes, pages, or tests; do not keep backend-only extras purely out of habit.

### Zero-regression workflow priorities

- **D-05:** Protect all four operator workflow clusters during the refactor, but use this fallback priority order if sequencing or compatibility tradeoffs appear: `orders/reporting/reconciliation` first, `payments/Tikkie` second, `attendees/accommodation` third, `Ticket Tailor sync/admin flows` fourth.
- **D-06:** If temporary compatibility shims are needed during migration, prefer to concentrate them in sync/admin plumbing rather than in the main dashboard route/domain boundary.
- **D-07:** Treat orders/reporting and payments/Tikkie as the least acceptable places for contract drift because they are the most finance-sensitive operator surfaces.

### Diagnostics and operator feedback

- **D-08:** Preserve counters and diagnostic fields that are already depended on by routes or tests. Do not simplify them unless they are provably unused.
- **D-09:** Keep operator/admin-facing error and status messages close to current detail levels; this phase should not replace actionable operational feedback with vague summaries.
- **D-10:** For sync and webhook flows, keep high-signal diagnostics in API responses, but verbose plumbing detail may move behind internal helpers or logs if the externally observed contract stays intact.
- **D-11:** If cleaner contracts conflict with diagnostic preservation, keep the diagnostics already relied on by tests/routes and clean up only the hidden/internal detail.

### the agent's Discretion

- Exact Convex file/module split once the canonical top-level `convex/` tree is restored.
- Exact helper names and internal/public function boundaries inside Convex, provided route-level behavior stays stable.
- Exact migration sequence for removing string-path helpers, provided main operator contracts are protected first.

</decisions>

<specifics>
## Specific Ideas

- This phase is a cleanup/refactor phase, not a product redesign phase.
- Be strict at the route boundary and flexible inside Convex.
- Prefer removing migration debt in the backend without making dashboard pages, tests, or operators relearn behavior.

</specifics>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope and roadmap

- `.planning/PROJECT.md` — Product constraints, architecture direction, and validated phase history.
- `.planning/ROADMAP.md` — Phase 13 goal and existing plan breakdown that must be revised around this context.
- `.planning/STATE.md` — Locked cross-phase decisions, especially auth and `lib/convex` bridge constraints.

### Prior phase decisions that constrain this refactor

- `.planning/phases/11-use-convex/11-01-SUMMARY.md` — Convex migration setup, CRPC-era structure, and the original nested functions tree decisions being cleaned up here.
- `.planning/phases/11-use-convex/11-04-SUMMARY.md` — Domain migration details and finance/accommodation contract context from the first Convex conversion.
- `.planning/phases/11-use-convex/11-05-SUMMARY.md` — Search/reporting additions and deploy assumptions tied to existing Convex contracts.
- `.planning/phases/12-use-clerk-as-only-auth-remove-stale-better-auth/12-01-SUMMARY.md` — Clerk-to-Convex auth bridge and shared server auth contract that Phase 13 must preserve.
- `.planning/phases/06-tikkie-integration/06-CONTEXT.md` — Latest-link-first Tikkie contract and status/freshness presentation that must remain server-owned.

### Current source-of-truth code

- `lib/convex/server.ts` — Existing server bridge with raw string-path dispatch that this phase is replacing.
- `lib/convex/api.ts` — Current nested generated import and `any` cast that should be eliminated.
- `lib/domain/finance/*.ts` — App-facing finance boundaries whose output contracts should stay stable.
- `lib/domain/accommodation/*.ts` — App-facing accommodation boundaries whose output contracts should stay stable.
- `lib/integrations/ticket-tailor/*.ts` — Sync/webhook/admin integration boundaries where temporary compatibility shims are most acceptable.
- `app/api/**/*.ts` — Protected/public route handlers that define the stable external JSON contract.
- `convex/_generated/ai/guidelines.md` — Repo-specific Convex rules for validators, internal/public separation, ids, and bounded reads.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `lib/auth/server.ts` — Centralized protected-route auth helper; keep using it instead of moving auth checks into Convex cleanup work.
- `lib/convex/client.tsx` — Working Clerk-authenticated Convex client provider; Phase 13 should not disturb client auth wiring.
- `lib/domain/finance/reporting.ts`, `lib/domain/finance/order-ledger.ts`, `lib/domain/finance/reconciliation.ts` — Stable app-facing read boundaries for finance routes.
- `lib/domain/accommodation/inventory.ts`, `lib/domain/accommodation/assignments.ts` — Stable app-facing boundaries for room/inventory flows.
- `lib/domain/finance/payments.ts`, `lib/domain/finance/tikkie-links.ts`, `lib/domain/finance/tikkie-templates.ts` — Stable payment/Tikkie boundaries whose existing operator payloads should survive the backend cleanup.
- `lib/integrations/ticket-tailor/sync.ts` and `lib/integrations/ticket-tailor/webhook.ts` — Operational integration layer where temporary compatibility shims are safest if needed.

### Established Patterns

- Protected operator routes already gate through `requireApiUser()` and should keep doing so.
- The project prefers server-owned contracts in `lib/domain/**` and `lib/integrations/**`, with route handlers staying thin.
- Tikkie latest-link-first ordering and freshness metadata are already intentionally centralized in backend contracts.
- Order-level payment status is already intentionally centralized in backend logic.
- Phase 11 established `lib/convex` as the bridge layer; Phase 13 should clean that boundary up, not bypass it.

### Integration Points

- `app/api/orders/search/route.ts` shows the current raw string-path pattern (`convexQuery("orders:searchOrders", ...)`) that needs replacement without changing route output.
- `app/api/dashboard/revenue/route.ts` and related finance routes depend on `lib/domain/finance/*` projections that should stay stable externally.
- `app/api/dashboard/accommodation/**` routes depend on accommodation domain outputs and should keep their assignment/inventory semantics.
- `app/api/payments/**`, `app/api/dashboard/tikkie-*/route.ts`, and `app/api/webhooks/tikkie/route.ts` define the finance-sensitive mutation/read surface that should keep current behavior.
- `app/api/ticket-tailor/**`, `app/api/jobs/ticket-tailor/retry/route.ts`, and `app/api/webhooks/ticket-tailor/route.ts` are the operational sync/admin surfaces where internal rework is most acceptable.

</code_context>

<deferred>
## Deferred Ideas

- Product-level dashboard redesign or payload simplification beyond current contract preservation.
- New finance capabilities or new operator workflows unrelated to backend contract cleanup.
- Broader observability redesign beyond preserving existing operator-visible diagnostics.

</deferred>

---

_Phase: 13-rebuild-convex-mutation-and-api-layer-from-clean-contracts_
_Context gathered: 2026-03-26_
