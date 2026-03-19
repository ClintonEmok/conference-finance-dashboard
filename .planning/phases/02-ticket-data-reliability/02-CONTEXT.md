# Phase 2: Ticket Data Reliability - Context

**Gathered:** 2026-03-18  
**Status:** Ready for planning

<domain>
## Phase Boundary

Make Ticket Tailor data ingestion dependable enough that finance reporting can trust event/order records as source input. This phase covers ingestion pipeline correctness, manual backfill controls, and status normalization. It does **not** include dashboard analytics surfaces (Phase 3) or Tikkie payment-link workflows (Phase 4).

</domain>

<decisions>
## Implementation Decisions

### Data ingestion source and behavior
- Ticket Tailor remains the source of truth for events/orders used in reporting.
- Ingestion should support both webhook-triggered updates and manual sync runs.
- Sync operations should be idempotent (re-running does not duplicate records or corrupt states).

### Reliability and recovery
- Failures should be recorded with actionable error context, not silent drops.
- Retry behavior should use bounded backoff and explicit next-attempt scheduling.
- Manual re-sync must allow event/date targeting to recover stale or missing data.

### Normalization and downstream contract
- Introduce a canonical status contract for downstream use: `paid | refunded | cancelled | pending`.
- Mapping from Ticket Tailor provider states must be centralized in one normalization layer (no UI-level ad-hoc mapping).
- Unknown/unmapped provider states should default safely to `pending` and record a diagnostic note.

### Operator visibility
- Admin should be able to trigger sync from protected routes/actions only.
- Sync response should include counts and clear success/failure breakdown.
- Non-sensitive diagnostics are visible to operators; secrets and raw auth tokens are never surfaced.

### Claude's Discretion
- Exact folder/module split under `lib/integrations/ticket-tailor/*` and `lib/domain/finance/*`.
- Choice of sync cursor strategy (time-window cursor vs provider pagination cursor) as long as reruns are deterministic.
- Exact API shape for manual re-sync endpoint and UI interaction model.

</decisions>

<specifics>
## Specific Ideas

- Keep phase output practical: deliver “trustworthy ingestion” first, then consume it in dashboard/reconciliation next phase.
- Prefer explicit ingestion primitives:
  1. Fetch events
  2. Fetch event orders (paginated)
  3. Normalize and upsert
  4. Emit per-run summary
- Use a single normalization function/module shared by webhook and manual sync paths.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/integrations/ticket-tailor/config.ts`: env validation and provider readiness checks.
- `lib/integrations/ticket-tailor/client.ts`: authenticated Ticket Tailor fetch wrapper + canonical payload fetch helper.
- `lib/integrations/ticket-tailor/webhook.ts`: webhook verification, ingest persistence, retry batch processing.
- `app/api/webhooks/ticket-tailor/route.ts`: protected webhook entry + ingest/process orchestration.
- `app/api/ticket-tailor/webhook-events/route.ts`: authenticated operational view over webhook events.
- `app/api/jobs/ticket-tailor/retry/route.ts`: authenticated manual retry trigger.
- `prisma/schema.prisma`: `TicketTailorWebhookEvent` model already present for ingestion traces.

### Established Patterns to Follow
- Use server-authoritative session checks via `auth.api.getSession({ headers })` for protected routes/actions.
- Return explicit operational JSON error contracts (`{ error: { code, message } }`).
- Keep integration modules non-fatal on config issues; classify state safely.

### Integration Points for Phase 2
- Add Ticket Tailor sync pipeline module(s) for event/order import and upsert.
- Extend Prisma schema with durable Ticket Tailor event/order storage models for reporting input.
- Add protected API route(s) for manual re-sync by event/date range.
- Expose run-level summary suitable for future health/audit surfaces.

</code_context>

<deferred>
## Deferred Ideas

- Dashboard metrics/trend visualizations and CSV export stay in Phase 3.
- Tikkie link creation/payment lifecycle stays in Phase 4.
- Broad operational alerting/audit dashboards remain in Phase 5.

</deferred>

---

*Phase: 02-ticket-data-reliability*
*Context gathered: 2026-03-18*
