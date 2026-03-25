---
phase: 10-payment-reconciliation-tikkie-bank-cash
plan: "04"
subsystem: finance-payments
tags:
  - tikkie
  - payment-sync
  - auto-match
  - gap-closure
---

# Plan 10-04: Tikkie Payment Sync & Auto-Match Summary

**Gap closure for:** Gap 1 (Tikkie storage), Gap 2 (auto-match), Gap 3 (ambiguous)

## Execution Summary

**Duration:** ~4 minutes  
**Completed:** 2026-03-25  
**Tasks:** 3/3 complete

## Tasks Completed

| Task | Name                            | Commit  | Files                                 |
| ---- | ------------------------------- | ------- | ------------------------------------- |
| 1    | Add syncTikkiePayments function | 5b1ffc4 | lib/domain/finance/payments.ts        |
| 2    | Add autoMatchPayments function  | 5b1ffc4 | lib/domain/finance/payments.ts        |
| 3    | Create Tikkie sync API endpoint | 5b1ffc4 | app/api/payments/tikkie/sync/route.ts |

## What Was Delivered

### 1. syncTikkiePayments() Function

- Fetches payments from Tikkie Open Payment API via `getPaymentRequestPayments()`
- Creates Payment records for new payments (checks sourceId to avoid duplicates)
- Stores payerName, payerAccountNumber, amountMinor, paidAt
- Returns sync result with counts and errors

### 2. autoMatchPayments() Function

- Finds unassigned payments with non-empty payerName
- Matches against TicketTailorOrder by exact buyerName (case-insensitive)
- Single match: status = 'auto_matched', orderId set
- Multiple matches: status = 'ambiguous' (manual review)
- No match: remains 'unassigned'

### 3. POST /api/payments/tikkie/sync Endpoint

- Finds all TikkiePaymentLinks with status='paid'
- Calls syncTikkiePayments() for each payment request token
- Runs autoMatchPayments() after all syncs complete
- Returns combined result: synced, matched, ambiguous counts

## Gaps Closed

1. **Gap 1 (Tikkie storage):** Tikkie payments now synced to Payment table
2. **Gap 2 (auto-match):** Auto-match by payerName → buyerName works
3. **Gap 3 (ambiguous):** Ambiguous status used when multiple orders match

## Key Files Created/Modified

- `lib/domain/finance/payments.ts` - Added syncTikkiePayments and autoMatchPayments functions
- `app/api/payments/tikkie/sync/route.ts` - New sync API endpoint

## Decisions Made

- [10-04] Use case-insensitive exact match for payerName → buyerName matching
- [10-04] Mark as ambiguous when multiple orders match (requires manual review)

## Next Phase Readiness

- Plan 10-05 builds on this to show order-level payment status in dashboard
- Tikkie sync can be triggered from reconciliation dashboard

## Authentication Gates

None - all functionality is internal to the application.
