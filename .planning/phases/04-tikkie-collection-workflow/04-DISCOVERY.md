# Phase 4 Discovery: Tikkie Collection Workflow

**Date:** 2026-03-19  
**Discovery Level:** Level 2 (standard research)  
**Why Level 2:** New external integration workflow (Tikkie payment-link creation + webhook/polling state updates) with medium-risk contract decisions.

## Research Questions

1. Which Tikkie API endpoints and payload fields should be used for payment-link creation and state retrieval?
2. What status model should we persist in-app to satisfy `created/paid/expired` operator visibility while preserving provider fidelity?
3. How should webhook and fallback polling be combined to avoid stale status when notifications are missed?

## Sources

- Local OpenAPI spec: `TikkieAPI_v2.yaml` (v2.3.3)
- Existing project patterns:
  - `lib/integrations/ticket-tailor/webhook.ts`
  - `app/api/webhooks/ticket-tailor/route.ts`
  - `app/api/jobs/ticket-tailor/retry/route.ts`
  - `app/dashboard/reconciliation/page.tsx`

## Findings

### Tikkie create/retrieve contract

- Use `POST /paymentrequests` to create links (returns `paymentRequestToken`, `url`, `status`, `expiryDate`, `createdDateTime`).
- Use `GET /paymentrequests/{paymentRequestToken}` for authoritative status checks.
- For paid-state confirmation details, use `GET /paymentrequests/{paymentRequestToken}/payments` (paginated, requires `pageNumber` + `pageSize`).
- Required headers: `API-Key` and `X-App-Token`.

### Status model for v1

- Persist app-level status enum as `created | paid | expired` to match roadmap truths.
- Map provider statuses conservatively:
  - `OPEN` -> `created`
  - `EXPIRED`, `CLOSED`, `MAX_*` -> `expired`
  - Any successful payment observed from `.../payments` -> `paid`
- Preserve raw provider status payload and timestamps for auditability/debugging.

### Webhook + polling pattern

- Use webhook ingestion as primary fast path for state transitions.
- Keep idempotent event storage + transition guards (only monotonic `created -> paid|expired` and no duplicate writes).
- Add fallback polling job for links still in `created` status (scheduled/manual trigger) to recover from missed webhooks.

## Decision Applied to Planning

Phase 4 plans should implement:

1. Persistent Tikkie payment-link model wired from reconciliation context and protected dashboard APIs.
2. Link generation UX on reconciliation rows with copy/share affordance and immediate persisted status visibility.
3. Webhook ingestion + fallback polling synchronization to keep status current and recover from delivery gaps.
