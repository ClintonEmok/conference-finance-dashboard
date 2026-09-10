---
status: complete
quick_id: 260910-tum
slug: implement-crud-gaps-for-payments-and-att
date: 2026-09-10
---

# Quick Task 260910-tum — CRUD gaps for manual payments and attendees

## Status: complete

## What was delivered

### 1. Deletable unassigned manual payments
- `convex/payments.ts:deletePayment` — authenticated mutation that only deletes a payment when it exists, is `status === "unassigned"`, and is a manual `cash` or `bank_transfer` row (Tikkie-synced, assigned, ambiguous, and donation rows are always protected).
- `app/api/payments/[id]/route.ts` — authenticated `DELETE` endpoint with 404 (not found) / 400 (guard) / 500 error mapping.
- `components/payments/payment-list.tsx` — trash-icon delete action shown only on eligible rows, with hover reveal next to Assign.
- `app/dashboard/payments/page.tsx` — `onDelete` handler with `window.confirm`, success/danger toast, and `refreshKey` bump.
- Tests: `tests/payments/payment-delete-route.test.ts` (401, success + mutation args, 404, 400, 500).

### 2. Attendee removal — dashboard (backend + UI)
- `convex/attendees.ts:removeAttendeeFromOrder` + shared `deleteAttendeeScopedRowsAndRecompute`:
  - enforces the minimum-attendee guard (an order must always retain at least one attendee);
  - deletes every attendee-scoped row in one transaction: `orderAttendees`, `ticketTailorAttendees` extensions, `orderTicketSelections`, accommodation selection + option children, `orderAssignments`, family-member links, and any family group the removed attendee was primary of;
  - decrements the affected `ticketTypes.soldCount` safely (never below zero);
  - recomputes the order amount due **exactly** through the canonical `loadOrderAmountDueBreakdowns` loader; existing order-level payments stay attached so a lower recalculated amount surfaces as overpayment.
- `app/api/dashboard/attendees/[attendeeId]/remove/route.ts` — authenticated `DELETE` endpoint.
- `components/dashboard/orders/panels/attendees-panel.tsx` — Remove button per attendee card (hidden when only one attendee) + confirmation dialog + reload.
- `components/dashboard/attendee-order-editor.tsx` — "Remove attendee" section with confirmation dialog and `canRemove` awareness.
- Tests: `convex/attendee-order-mutations.handlers.test.ts` (anonymous rejection, middle-attendee removal with exact recompute to 0, full row cleanup + inventory decrement, last-attendee rejection, missing attendee), `tests/attendees/attendee-remove-route.test.ts`.

### 3. Attendee removal — public manage-booking (ownership-verified)
- `lib/domain/track-payment/edit-token.ts` — signed removal-envelope helpers: `canonicalizeRemoveAttendeeEnvelope`, `digestRemoveAttendeeEnvelope`, `mintRemoveAttendeeSignature`, `verifyRemoveAttendeeSignature` (same HMAC secret + short TTL as the accommodation edit).
- `convex/publicTracking.ts:removeAttendeeFromBooking` — public mutation that verifies the route signature, re-verifies ownership (normalized booker-email match OR HMAC edit token), resolves the order alias-aware, finds the attendee by key, and delegates to the shared removal helper. Retry after success fails closed at "attendee not found" (natural destructive-op idempotency).
- `app/api/track-payment/[bookingRef]/remove/route.ts` — rate-limited + honeypot-gated `POST` that mints the signature and maps guard failures to stable JSON (404/403/409).
- `components/track-payment/TrackPaymentAttendeeRemoval.tsx` — buyer-facing attendee list with per-attendee Remove, ownership gate (email or signed link), confirmation dialog, and reload after success; wired into `TrackPaymentView`.
- Tests: `convex/track-payment-edit.handlers.test.ts` (success + exact recompute to 8500/8000, missing-signature, ownership mismatch, edit-token path, last-attendee rejection, unknown attendee key), `app/api/track-payment/[bookingRef]/remove/route.test.ts` (rate limit, normalization + mutation args, unsupported field, ownership, guard mapping).

## Verification
- `npm run typecheck` — green
- `npm test` — 588 passed / 5 skipped
- `npx vitest run --config vitest.convex.config.ts` — 251 passed
- `NEXT_PUBLIC_CONVEX_URL=... npm run build` — production build green
- `npx convex codegen` / `npx convex dev --once` — could not run (no `CONVEX_DEPLOYMENT` configured in this worktree; non-interactive terminal). Tracked `convex/_generated/api.d.ts` was updated manually to match codegen output and typecheck passes.

## Commits
- `feat(finance): deletable unassigned manual payments and attendee removal` (backend + routes + tests)
- `feat(ui): payment delete action and attendee removal on dashboard + manage-booking` (frontend)

## Notes / scope
- Tikkie-synced and assigned/donation payments remain protected from deletion.
- Existing order-level payments are never deleted or detached on attendee removal; a lower recalculated amount shows as overpayment.
- No production data modified; no automated broadcasts or legacy backfill touched.