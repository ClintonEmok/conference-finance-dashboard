# Phase 17: Fix Critical Code Review Issues

Fix list from 4-subagent code review of the v1.0 codebase.

## Extract Interfaces

Extract shared TypeScript interfaces/types out of implementation files into dedicated type files:

- Payment types (`PaymentDTO`, `PaymentStatus`, etc.) → `lib/types/payment.ts`
- Order types (`OrderDTO`, `OrderStatus`, etc.) → `lib/types/order.ts`
- Accommodation types (`RoomDTO`, `HotelDTO`, `AssignmentDTO`, etc.) → `lib/types/accommodation.ts`
- Tikkie types (`TikkieLinkDTO`, `TikkieStatus`, etc.) → `lib/types/tikkie.ts`
- Attendee types (`AttendeeDTO`, etc.) → `lib/types/attendee.ts`
- Shared types (`formatMoney` signature, common ID types, etc.) → `lib/types/shared.ts`

Current problem: interfaces are scattered across implementation files, making them hard to find and causing circular import risks.

## Critical

| #   | File                                        | Line(s)       | Issue                                                                                                     |
| --- | ------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | `convex/attendees.ts`                       | 101           | `createAttendee` — no auth check, publicly callable                                                       |
| 2   | `convex/orders.ts`                          | 102           | `createOrder` — no auth check                                                                             |
| 3   | `convex/payments.ts`                        | 97            | `createPayment` — no auth check                                                                           |
| 4   | `convex/payments.ts`                        | all mutations | `assignPaymentToOrder`, `removePaymentAssignment` — no auth                                               |
| 5   | `convex/tikkie.ts`                          | all mutations | `createPaymentLink`, `updatePaymentLinkStatus` — no auth                                                  |
| 6   | `convex/accommodation.ts`                   | 731-787       | `assignRoomToAttendee` — non-atomic double-patch (`assignedRoomId` + `occupiedBeds`), drifts on OCC retry |
| 7   | `convex/accommodation.ts`                   | 853-917       | `unassignRoomFromAttendee` / `unassignAttendeeFromRoom` — same drift                                      |
| 8   | `convex/payments.ts`                        | 332-357       | `getPaymentSummary` — full table scan `.collect()`, should use `orderId` index                            |
| 9   | `lib/integrations/tikkie/webhook.ts`        | 94-97         | `verifyTikkieWebhook` returns `true` when secret not configured                                           |
| 10  | `lib/integrations/ticket-tailor/webhook.ts` | 75-77         | Same — `verifyTicketTailorWebhook` returns `true` when secret missing                                     |
| 11  | `lib/domain/finance/order-ledger.ts`        | 166-195       | CSV headers include `isArchived`/`archivedAt`/`archiveReason` but row mapping omits them — data loss      |
| 12  | `lib/domain/finance/payments.ts`            | 385-407       | `autoMatchPayments` — race condition (fetch-then-mutate without transaction)                              |
| 13  | `lib/domain/finance/tikkie-quota.ts`        | 93-101        | `enforceTikkieMonthlyCreationQuota` — TOCTOU (check-then-create)                                          |
| 14  | `app/**/layout.tsx` and route segments      | all           | Zero `error.tsx` files — crashes white-screen the app                                                     |
| 15  | `components/assign-dialog.tsx`              | whole file    | Custom modal missing `role="dialog"`, `aria-modal`, focus trapping, Escape key                            |
| 16  | `components/event-tikkie-section.tsx`       | modal usage   | Same accessibility issues as above                                                                        |

## Important

| #   | File                                       | Line(s)   | Issue                                                                            |
| --- | ------------------------------------------ | --------- | -------------------------------------------------------------------------------- |
| 17  | `convex/attendees.ts`                      | 78        | `getAttendees` — unbounded `.collect()`, no filters                              |
| 18  | `convex/orders.ts`                         | 426       | `getOrderCount` — unbounded `.collect()`                                         |
| 19  | `convex/payments.ts`                       | 92        | `getUnassignedPayments` — unbounded `.collect()`                                 |
| 20  | `convex/payments.ts`                       | 307       | `autoMatchPayments` — unbounded `.collect()`                                     |
| 21  | `convex/tikkie.ts`                         | 12        | `getPaymentLinks` — unbounded `.collect()`                                       |
| 22  | `convex/tikkie.ts`                         | 224       | `getPaymentLinksByOrderId` — collects ALL, filters in JS                         |
| 23  | `convex/accommodation.ts`                  | 194-434   | `getRoomAllocationBoard` — loads 6 entire tables                                 |
| 24  | `convex/payments.ts`                       | 299-330   | `autoMatchPayments` — name-only matching, should add amount match                |
| 25  | `convex/tikkie.ts`                         | 413-464   | Same name-only matching issue                                                    |
| 26  | `convex/attendees.ts`                      | 224       | `assignRoom` — duplicate of `accommodation.ts:731` but skips `occupiedBeds`      |
| 27  | `convex/attendees.ts`                      | 237       | `unassignRoom` — duplicate of `accommodation.ts:853`                             |
| 28  | `lib/integrations/tikkie/client.ts`        | 136-145   | No timeout on `fetch` — can hang indefinitely                                    |
| 29  | `lib/integrations/ticket-tailor/client.ts` | 69-73     | No timeout on `fetch`                                                            |
| 30  | `app/**/route.ts`                          | all       | No rate limiting on any API route                                                |
| 31  | `components/**/*.tsx`                      | ~12 files | `formatMoney` duplicated — extract to `lib/format.ts`                            |
| 32  | `app/dashboard/accommodation/page.tsx`     | 564-588   | Bulk assignment reports success count regardless of individual failures          |
| 33  | `convex/autoSync.ts`                       | 14, 60    | Cron calls own API endpoint — circular dependency, move sync to `internalAction` |
| 34  | `convex/auth.config.ts`                    | 10        | `process.env.CLERK_JWT_ISSUER_DOMAIN!` — non-null assertion, fails silently      |

## Minor

| #   | File                      | Line(s)     | Issue                                                               |
| --- | ------------------------- | ----------- | ------------------------------------------------------------------- |
| 35  | `convex/payments.ts`      | 97-121      | `createPayment` — no amount validation (accepts 0 or negative)      |
| 36  | `convex/accommodation.ts` | 34,41,48,61 | Helper functions use `ctx: any` instead of `QueryCtx`/`MutationCtx` |
| 37  | `convex/orders.ts`        | 709-735     | `removeOrderLocally` — doesn't cascade to attendees                 |
| 38  | Various                   | —           | `console.error`/`console.log` left in production code               |
