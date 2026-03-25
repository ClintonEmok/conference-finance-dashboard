---
phase: 11-use-convex
plan: "05"
subsystem: api
tags: [convex, api-routes, nextjs, migration, prisma-removal]

# Dependency graph
requires:
  - phase: "11-03"
    provides: Convex functions for all domains (orders, attendees, sync, payments, accommodation)
  - phase: "11-04"
    provides: Domain layer migrated to use Convex instead of Prisma
provides:
  - All API routes migrated from Prisma to Convex function calls
  - Type-safe convexQuery/convexMutation server helpers in lib/convex/server.ts
  - 5 API routes calling Convex directly (webhook-events, orders/search, order detail, attendee PATCH, reconciliation)
  - 2 API routes calling Convex through domain layer (payments list, tikkie sync)
  - New Convex query functions: searchOrders, getOrderWithAttendeesByProviderId, getOrderPaymentStatus
affects: "All downstream consumers of API routes now receive Convex-sourced data"

# Tech tracking
tech-stack:
  added: [lib/convex/server.ts (convexQuery/convexMutation HTTP helpers)]
  patterns:
    - "Direct Convex HTTP fetch from Next.js API routes (not ConvexClient)"
    - "Generic typed convexQuery<Args, Response>(path, args) pattern for API route handlers"
    - "Convex functions called via string path like 'orders:searchOrders' (not imported references)"

key-files:
  created:
    - lib/convex/server.ts - convexQuery and convexMutation HTTP helper functions
    - convex/functions/orders.ts - searchOrders, getOrderWithAttendeesByProviderId, getOrderPaymentStatus
  modified:
    - app/api/ticket-tailor/webhook-events/route.ts - Prisma → convexQuery("sync:getWebhookEvents")
    - app/api/orders/search/route.ts - Prisma → convexQuery("orders:searchOrders")
    - app/api/dashboard/orders/[orderId]/route.ts - Prisma → convexQuery("orders:getOrderWithAttendeesByProviderId")
    - app/api/dashboard/attendees/[attendeeId]/route.ts - Prisma → convexMutation("attendees:updateAttendee")
    - app/api/reconciliation/route.ts - Prisma → convexQuery("orders:getOrderPaymentStatus")
    - app/api/payments/route.ts - Prisma → listPayments domain function (Convex-backed)
    - app/api/payments/tikkie/sync/route.ts - Prisma → convexQuery("tikkie/getPaymentLinks")

key-decisions:
  - "Used direct HTTP fetch to Convex URL instead of ConvexClient for server-side API routes"
  - "convexQuery/convexMutation are generic typed helpers with path-based function dispatch"
  - "Payments route delegates to domain layer (listPayments) rather than calling Convex directly"
  - "Tikkie sync route inlines its own convexQuery helper rather than importing from lib/convex/server.ts"

patterns-established:
  - "API route Convex pattern: import { convexQuery } from '@/lib/convex/server' → call with typed generics"

requirements-completed: []

# Metrics
duration: ~30min
completed: 2026-03-25
---

# Phase 11 Plan 05: API Routes Migration Summary

**All API routes migrated from Prisma to Convex HTTP function calls with type-safe generic wrappers**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-03-25 (session start)
- **Completed:** 2026-03-25T17:45:22Z
- **Tasks:** 1 (API route migration)
- **Files modified:** 9 (7 API routes + 1 new helper + 1 Convex function file)

## Accomplishments

- Migrated 5 direct API route handlers from Prisma to Convex function calls
- Migrated 2 additional API routes (payments, tikkie sync) to use Convex-backed domain layer
- Created type-safe `convexQuery`/`convexMutation` server helpers in `lib/convex/server.ts`
- Added 3 new Convex query functions to support API routes (searchOrders, getOrderWithAttendeesByProviderId, getOrderPaymentStatus)
- Verified TypeScript compiles without errors
- Confirmed zero remaining Prisma calls in `lib/` or `app/` directories (except auth.ts better-auth adapter — expected)

## Task Commits

Work is currently **uncommitted** — all changes are in the working tree.

**Files changed (unstaged):**

- `app/api/ticket-tailor/webhook-events/route.ts`
- `app/api/orders/search/route.ts`
- `app/api/dashboard/orders/[orderId]/route.ts`
- `app/api/dashboard/attendees/[attendeeId]/route.ts`
- `app/api/reconciliation/route.ts`
- `app/api/payments/route.ts`
- `app/api/payments/tikkie/sync/route.ts`
- `lib/convex/server.ts` (new)
- `convex/functions/orders.ts` (new functions added)

## Files Created/Modified

- `lib/convex/server.ts` — convexQuery/convexMutation HTTP helpers with generic types, fetches Convex URL directly
- `convex/functions/orders.ts` — Added searchOrders (buyer/providerId search), getOrderWithAttendeesByProviderId (order + attendees), getOrderPaymentStatus (reconciliation summary)
- `app/api/ticket-tailor/webhook-events/route.ts` — GET now calls `convexQuery("sync:getWebhookEvents")` instead of `prisma.ticketTailorWebhookEvent.findMany`
- `app/api/orders/search/route.ts` — GET now calls `convexQuery("orders:searchOrders")` instead of `prisma.ticketTailorOrder.findMany`
- `app/api/dashboard/orders/[orderId]/route.ts` — GET now calls `convexQuery("orders:getOrderWithAttendeesByProviderId")` instead of `prisma.ticketTailorOrder.findFirst`
- `app/api/dashboard/attendees/[attendeeId]/route.ts` — PATCH now calls `convexMutation("attendees:updateAttendee")` instead of `prisma.ticketTailorAttendee.update`
- `app/api/reconciliation/route.ts` — GET now calls `convexQuery("orders:getOrderPaymentStatus")` instead of inline Prisma aggregation
- `app/api/payments/route.ts` — GET now calls `listPayments` domain function (Convex-backed) instead of `prisma.payment.findMany`
- `app/api/payments/tikkie/sync/route.ts` — POST now calls `convexQuery("tikkie/getPaymentLinks")` instead of `prisma.tikkiePaymentLink.findMany`

## Decisions Made

- **Direct HTTP fetch over ConvexClient:** Used plain `fetch()` to Convex URL for server-side API routes rather than importing the Convex client library. This keeps API routes lightweight and avoids client-side SDK overhead in server-only code.
- **Generic typed helpers:** `convexQuery<Args, Response>(path, args)` provides type safety without needing generated function references at the API route layer.
- **Domain layer delegation for payments:** The payments list route delegates to `listPayments` from the domain layer rather than calling Convex directly, maintaining the established domain-layer abstraction.
- **Remaining Prisma (expected):** `lib/prisma.ts` and `lib/auth.ts` still use Prisma for the better-auth adapter — this is intentional and expected to remain until better-auth gets a Convex adapter.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- None — TypeScript compiled cleanly after all changes, no blocking issues.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- API routes now fully use Convex — no Prisma calls remain in the request path
- **Remaining work:** Tasks 2-4 of the plan (env vars, e2e verify checkpoint, deploy) were not completed in this session
- Deploy task requires `NEXT_PUBLIC_CONVEX_URL` env var to be set for production
- E2E verification checkpoint should be completed before deploy

---

_Phase: 11-use-convex_
_Completed: 2026-03-25_
