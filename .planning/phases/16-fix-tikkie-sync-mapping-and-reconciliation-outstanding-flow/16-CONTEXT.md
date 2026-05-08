# Phase 16: fix-tikkie-sync-mapping-and-reconciliation-outstanding-flow - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix Tikkie payment ingestion and reconciliation update flow so provider payments are mapped correctly, synced consistently, deduplicated safely, and reflected in outstanding balances with clear operator-visible run outcomes. This phase improves correctness and trust of existing Tikkie sync/reconciliation behavior and does not add new payment product capabilities.

</domain>

<decisions>
## Implementation Decisions

### Payment field mapping contract

- **D-01:** Use provider `paymentToken` as canonical Tikkie payment identity and persist it as `sourceId` for Tikkie-origin payments.
- **D-02:** Map `counterPartyName -> payerName` and `counterPartyAccountNumber -> payerAccountNumber`.
- **D-03:** Map `createdDateTime -> paidAt` as canonical timestamp for stored payment time.
- **D-04:** Map `amountInCents -> amountMinor` with strict numeric validation (`finite integer >= 0`); invalid rows are skipped and logged as mapping errors.

### Sync link selection and run scope

- **D-05:** Sync scope includes non-expired links (`created` and `paid`), not only `paid` links.
- **D-06:** Phase 16 sync behavior targets event-level links only.
- **D-07:** Process links in recent-first capped batches per run (bounded volume), with repeatable reruns.
- **D-08:** If no in-scope links exist, return success with explicit zero counts (not an error).

### Idempotency and legacy data correction

- **D-09:** Use global `paymentToken` dedupe semantics for upsert/idempotency.
- **D-10:** Run a one-time cleanup migration before enabling final corrected sync behavior.
- **D-11:** If the same `paymentToken` is observed again with changed non-identity fields, patch mutable fields from latest provider payload.
- **D-12:** Migration is deployment-first (cleanup before or with corrected sync) so outstanding totals become consistent immediately.

### Operator sync feedback and reconciliation refresh

- **D-13:** Show sync outcomes as both inline status near the reconciliation sync control and toast feedback.
- **D-14:** Post-run UI shows full summary counts: links scanned, fetched/new/existing payments, matched/ambiguous, and error count.
- **D-15:** Runs with mixed outcomes use explicit partial-success state (successful work preserved, failures visible).
- **D-16:** After sync completes, reconciliation summary/list auto-refreshes without forcing full page reload.

### the agent's Discretion

- Exact copy for inline/toast success, warning, and partial-success wording.
- Exact capped batch size defaults as long as runs remain bounded and recent-first.
- Exact migration script shape and rollout mechanics as long as migration-first ordering is preserved.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and phase constraints

- `.planning/PROJECT.md` — Core value, integration risk notes, and architecture direction for Tikkie and reconciliation trust.
- `.planning/REQUIREMENTS.md` — Finance workflow correctness requirements and constraints (traceability around DASH and TK flows).
- `.planning/STATE.md` — Locked cross-phase decisions including `providerOrderId` canonical linking and reconciliation behavior constraints.
- `.planning/ROADMAP.md` — Phase 16 entry and dependency boundary.

### Prior phase decisions that constrain Phase 16

- `.planning/phases/06-tikkie-integration/06-CONTEXT.md` — Existing Tikkie sync/status trust expectations in finance workflow.
- `.planning/phases/13-rebuild-convex-mutation-and-api-layer-from-clean-contracts/13-CONTEXT.md` — Route contract preservation and `lib/convex` boundary constraints.
- `.planning/phases/15-event-level-tikkie-ui-attendee-tikkie-cleanup/15-CONTEXT.md` — Event-level Tikkie direction and auto-match-on-sync expectation.

### Provider contract and current implementation surfaces

- `TikkieAPI_v2.yaml` — Provider payment schema (`paymentToken`, `counterPartyName`, `counterPartyAccountNumber`, `amountInCents`, `createdDateTime`).
- `lib/integrations/tikkie/client.ts` — Current payment-list API client contract for Tikkie fetches.
- `app/api/payments/tikkie/sync/route.ts` — Legacy sync entrypoint currently filtering links too narrowly.
- `lib/domain/finance/payments.ts` — Legacy sync + auto-match logic that currently contains mapping mismatch risk.
- `lib/domain/finance/reconciliation.ts` — Outstanding calculation semantics from matched payment statuses.
- `lib/domain/finance/tikkie-event-payments.ts` — Event-level sync path and upsert/match behavior to align with.
- `convex/tikkie.ts` — Payment-link query/mutation surface used by sync paths.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `lib/domain/finance/tikkie-event-payments.ts`: Existing fetch/store loop and event-level match trigger that can be reused/normalized.
- `app/api/jobs/tikkie/event-payment-sync/route.ts`: Clean protected sync route shape with structured JSON response.
- `lib/domain/finance/reconciliation.ts`: Existing matched-status outstanding reduction logic already aligned with operator expectations.

### Established Patterns

- Protected operator routes use `requireApiUser()` and return structured JSON errors/success payloads.
- Sync APIs typically return machine-readable counts for UI follow-up.
- Reconciliation trust depends on matched payment statuses (`manual_assignment`, `auto_matched`) reducing outstanding totals.

### Integration Points

- `app/dashboard/reconciliation/page.tsx`: Sync trigger UX and post-sync refresh behavior.
- `app/api/payments/tikkie/sync/route.ts`: Primary legacy sync orchestration path to correct.
- `lib/domain/finance/payments.ts`: Field mapping, dedupe, and auto-match coupling.
- `lib/domain/finance/reconciliation.ts`: Downstream outstanding totals affected by synced/matched records.

</code_context>

<specifics>
## Specific Ideas

- Keep this phase focused on reliability and reconciliation correctness, not broader feature expansion.
- Prefer provider-authoritative identity/timestamp fields over inferred local fallbacks.
- Make sync outcomes operator-visible in-page so "button did nothing" ambiguity is eliminated.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

_Phase: 16-fix-tikkie-sync-mapping-and-reconciliation-outstanding-flow_
_Context gathered: 2026-03-26_
