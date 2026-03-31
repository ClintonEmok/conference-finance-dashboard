# 25-01 Summary: Auth Guards on Unprotected Convex Queries

**Phase:** 25-concerns-fixing
**Plan:** 01
**Status:** COMPLETE
**Date:** 2026-03-31

## Objective

Add `requireIdentity(ctx)` auth guards to all unprotected Convex queries that return sensitive data (financial data, attendee PII, accommodation assignments).

## Changes Made

### Auth Guards Added (14+ new query-level guards)

| File                      | Queries Protected                                                                                              | Pre-existing Guards | Total |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------- | ----- |
| `convex/orders.ts`        | `getOrders`, `getOrderById`, `getOrderLedger`, `getOrdersWithFilters`, `getOrderPaymentStatus`, `searchOrders` | 4 (mutations)       | 10    |
| `convex/payments.ts`      | `getPayments`, `getUnassignedPayments`, `getPaymentSummary`                                                    | 6 (mutations)       | 9     |
| `convex/tikkie.ts`        | `getPaymentLinks`, `getPaymentTemplates`                                                                       | 9 (mutations)       | 11    |
| `convex/attendees.ts`     | `getAttendees`, `getAttendeeById`, `getAttendeeByEmail`, `getAttendeeByStringId`                               | 6 (mutations)       | 10    |
| `convex/events.ts`        | `getEventsForLedger`                                                                                           | 6 (mutations)       | 7     |
| `convex/accommodation.ts` | `getRoomAllocationBoard`, `getRoomsWithDetails`, `listAccommodationInventory`                                  | 19 (mutations)      | 22    |
| `convex/sync.ts`          | `getWebhookEvents`, `getPendingWebhookEvents`, `startSyncRun` (debug log removed)                              | 11 (mutations)      | 14    |

### Queries Kept Public (with explanatory comments)

| File               | Query                        | Reason                                                            |
| ------------------ | ---------------------------- | ----------------------------------------------------------------- |
| `convex/events.ts` | `getEvents`                  | Returns non-sensitive event metadata, used by signup flow         |
| `convex/events.ts` | `getEventById`               | Returns non-sensitive event metadata                              |
| `convex/events.ts` | `getEventBySlug`             | Returns non-sensitive event metadata, used by signup success page |
| `convex/events.ts` | `getEventsWithAccommodation` | Returns non-sensitive accommodation metadata                      |
| `convex/tikkie.ts` | `getPaymentLinkByToken`      | Token-based access control, no sensitive data exposed             |

### Debug Logging Removed

- Removed `console.log("server identity", await ctx.auth.getUserIdentity())` from `convex/sync.ts:44`

### No Internal Functions Modified

All `internalQuery` and `internalMutation` exports remain auth-free as intended (for cron/system use).

## Verification

- `grep -c "requireIdentity(ctx)"` on all 7 files confirms correct counts
- `grep -c "server identity" convex/sync.ts` returns 0 (debug log removed)
- `grep -A1 "// Public:" convex/events.ts` confirms 4 public queries have explanatory comments
- No `internalQuery`/`internalMutation` handlers modified
- Pre-existing TypeScript errors remain (schema mismatches unrelated to auth guards)

## Files Modified

1. `convex/orders.ts` — 6 queries protected
2. `convex/payments.ts` — 3 queries protected
3. `convex/tikkie.ts` — 2 queries protected
4. `convex/attendees.ts` — 4 queries protected
5. `convex/events.ts` — 1 query protected + 4 public queries annotated
6. `convex/accommodation.ts` — 3 queries protected
7. `convex/sync.ts` — 2 queries protected + debug log removed

## Next

Proceed to plan 25-02 (Delete Prisma remnants, stale tests, debug logging; consolidate duplicate mutations).
