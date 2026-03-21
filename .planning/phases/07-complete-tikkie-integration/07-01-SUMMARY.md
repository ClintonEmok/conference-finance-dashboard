---
phase: 07-complete-tikkie-integration
plan: 01
status: complete
completed: 2026-03-21
execution_time_minutes: 15
---

## Plan 07-01: Make Tikkie refresh provider-authoritative via GET payment request

### Objective

Complete the status-trust gap by making provider GET retrieval the canonical status source.

### What Was Built

Refactored Tikkie payment link refresh logic to use `GET /paymentrequests/{paymentRequestToken}` as the authoritative source for payment link status, replacing the previous list-payments-based detection.

**Key changes:**

- `lib/domain/finance/tikkie-links.ts`: Reworked `derivePaymentState` to check `numberOfPayments` and `totalAmountPaidInCents` from the payment request response as the primary canonical source. Added compatibility fallback to `getPaymentRequestPayments` only when aggregate fields are absent or zero.
- Sequential fetch pattern: GET payment request first, then payments list conditionally.
- Preserved monotonic transition guarantees — paid links never regress.
- `tests/tikkie/tikkie-links.test.ts`: Expanded coverage for provider-authoritative refresh behavior including tests for paid inference from aggregate fields, monotonicity, and unchanged link handling.

### Tasks Completed

1. **Rework refresh resolution to use GET payment request as canonical provider source** — `derivePaymentState` now prioritizes aggregate fields over payments list.
2. **Keep webhook and status-sync routes as trigger paths** — Routes delegate final status reconciliation to domain refresh; operator counters remain trustworthy.
3. **Expand tests for provider-authoritative and monotonic refresh behavior** — Added tests proving aggregate-based paid detection and transition monotonicity.

### Decisions Made

- Aggregate fields (`numberOfPayments`, `totalAmountPaidInCents`) are authoritative — payments list only fetched when aggregate is absent/zero.
- `providerLastCheckedAt` is updated on every refresh to track freshness, but only status changes increment the update counter.

### Verification

- `npm run test -- tests/tikkie/tikkie-links.test.ts` — 16 tests passed
- `npm run test -- tests/tikkie/webhook-route.test.ts` — 3 tests passed
- `npm run typecheck` — clean

### Commits

- `194660d` feat(07-01): make Tikkie refresh provider-authoritative via GET payment request
- `f71d87d` fix(07-01): add missing getPaymentRequestPayments mock in sync counts test

---
