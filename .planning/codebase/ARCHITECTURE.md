# Architecture

**Analysis Date:** 2026-04-21

## Pattern Overview

**Overall:** Next.js frontend with Convex backend, external integration with Ticket Tailor (ticketing) and Tikkie (payments)

**Key Characteristics:**
- **Dual data model**: Canonical tables (`orders`, `payments`) + extension tables (`ticketTailorOrders`, `tikkiePaymentLinks`) joined at query time
- **Event-scoped operations**: Most queries filter by `eventId` with source-agnostic canonical types
- **Reconciliation-first design**: Payments tracked separately from order status, matched via payer name or explicit assignment
- **Webhook + polling hybrid sync**: Ticket Tailor uses webhooks; Tikkie uses polling/cron for status updates

## Layers

**Frontend (Next.js App Router):**
- Purpose: User interface for finance operations, order management, and reconciliation
- Location: `app/` directory
- Contains: Pages, API routes, client components
- Depends on: Convex queries/mutations via hooks
- Used by: Dashboard users (authenticated)

**API Routes:**
- Purpose: Server-side aggregation layer between UI and Convex
- Location: `app/api/dashboard/`
- Contains: REST endpoints that call Convex queries + domain logic
- Depends on: Convex API, domain libraries
- Used by: Frontend pages (fetch calls)

**Domain Logic:**
- Purpose: Business logic, type transformations, validation
- Location: `lib/domain/finance/` and `lib/domain/*`
- Contains: Order ledger, reconciliation, payment matching, amounts calculation
- Depends on: Convex API (via convexQuery/convexMutation wrappers)
- Used by: API routes

**Convex Backend:**
- Purpose: Database schema, queries, mutations, auth, cron jobs, webhooks
- Location: `convex/` directory
- Contains: Schema definitions, query/mutation handlers, sync logic
- Depends on: None (self-contained)
- Used by: API routes (via Convex client), frontend (direct hooks)

**External Integrations:**
- Ticket Tailor: Ticketing provider; syncs orders/attendees via webhooks and scheduled sync
- Tikkie: Dutch payment platform; creates payment links and syncs payment status via polling

## Data Flow

**Order Creation Flow:**
1. Ticket Tailor webhook received at `app/api/webhooks/ticket-tailor/route.ts`
2. Convex mutation `sync.upsertTicketTailorOrder` inserts/updates `orders` + `ticketTailorOrders` tables
3. Orders get `status: "paid" | "pending" | "cancelled" | "refunded"` normalized from provider status

**Payment Flow:**
1. Tikkie creates payment links via `convex.tikkie.createPaymentLink`
2. Polling cron `convex.crons.ts` checks Tikkie API for payment status updates
3. `convex.payments.upsertTikkiePayment` records payments to `payments` table
4. `convex.payments.autoMatchPayments` attempts to match payments to orders by payer name + exact amount
5. Manual assignment via `convex.payments.assignPaymentToOrder` when auto-match fails

**Reconciliation Flow:**
1. `lib/domain/finance/reconciliation.ts` loads orders via `api.orders.getOrdersForReconciliation`
2. Payments matched via `lib/domain/finance/matched-payments.ts` 
3. `deriveReconciliation()` computes outstanding amounts and flags issues (pending-payment, cancelled-with-amount, missing-amount, refund-without-refunded-at)

**Status Update Flow:**
1. `convex.orders.updateOrderStatus` patches both `orders.status` and `ticketTailorOrders.normalizedStatus`
2. Sets `refundedAt`/`cancelledAt` timestamps in extension table

## Key Abstractions

**Order + Extension Join Pattern:**
- Purpose: Separate core order data from provider-specific extension
- Examples: `convex/orders.ts:getOrderWithExtension()`, `getVisibleOrdersWithExtensions()`
- Pattern: Query core table, join with extension table via `orderId` index, filter by visibility (`!removedAt`)

**Canonical Status:**
- Purpose: Normalized status independent of payment provider
- Location: `lib/types/order.ts:canonicalOrderStatusValidator`
- Values: `"paid" | "refunded" | "cancelled" | "pending"`

**Amount Due Breakdown:**
- Purpose: Per-attendee payment responsibility derived from ticket selections
- Location: `convex/finance.ts:loadOrderAmountDueBreakdowns()`, `lib/domain/finance/amounts.ts`
- Pattern: Query `orderTicketSelections` → look up `ticketTypes.priceMinor` → compute per-attendee share

**Payment Matching:**
- Purpose: Link payments to orders (auto or manual)
- Location: `lib/domain/finance/payments.ts`, `convex/payments.ts:autoMatchPayments`
- Statuses: `"unassigned" | "auto_matched" | "manual_assignment" | "ambiguous"`

## Entry Points

**Dashboard Orders Page:**
- Location: `app/dashboard/orders/page.tsx`
- Triggers: User navigation to `/dashboard/orders`
- Responsibilities: List orders with filters (event, status, date range), pagination, CSV export

**Order Detail Page:**
- Location: `app/dashboard/orders/[orderId]/page.tsx`
- Triggers: Click on order row in orders list
- Responsibilities: Show order details, attendees, payment assignments, outstanding amounts

**Orders API:**
- Location: `app/api/dashboard/orders/route.ts`
- Triggers: GET request from orders page
- Responsibilities: Auth check, filter validation, call `getOrderLedger()`, return paginated results

**Reconciliation API:**
- Location: `app/api/dashboard/reconciliation/route.ts`
- Triggers: GET request from reconciliation page
- Responsibilities: Auth check, call `getReconciliationRows()`, return filtered results with totals

**Ticket Tailor Webhook:**
- Location: `app/api/webhooks/ticket-tailor/route.ts`
- Triggers: POST from Ticket Tailor on order/attendee changes
- Responsibilities: Validate, store in `ticketTailorWebhookEvents`, process asynchronously

## Error Handling

**Strategy:** Error boundaries in UI, try-catch in mutations, status codes in API routes

**Patterns:**
- API routes return `{ error: { code, message } }` with appropriate HTTP status
- Frontend shows inline error messages
- Convex mutations throw `Error` with messages for validation failures
- Webhook processing tracks `failed` status with `lastError` and `nextRetryAt` for retry

## Cross-Cutting Concerns

**Logging:** Console logging in API routes; Convex handles function execution logs

**Validation:** Domain validation in `lib/domain/finance/payments.ts` (normalizeAmountMinor, normalizePaidAt, etc.); Convex validators in mutation args

**Authentication:** `requireIdentity()` in Convex queries/mutations; `requireApiUser()` in API routes; Clerk for frontend auth

---

*Architecture analysis: 2026-04-21*
