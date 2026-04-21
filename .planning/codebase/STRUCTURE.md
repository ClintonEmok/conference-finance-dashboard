# Codebase Structure

**Analysis Date:** 2026-04-21

## Directory Layout

```
cosmic-walrus/
├── app/                          # Next.js App Router
│   ├── api/dashboard/            # Dashboard API routes
│   ├── dashboard/                # Dashboard pages (orders, payments, etc.)
│   ├── events/[slug]/            # Public event pages
│   ├── signup/[slug]/            # Public signup flow
│   └── page.tsx                  # Landing page
├── convex/                       # Convex backend
│   ├── schema.ts                 # Database schema
│   ├── orders.ts                 # Order queries/mutations
│   ├── payments.ts              # Payment queries/mutations
│   ├── tikkie.ts                # Tikkie payment link management
│   ├── events.ts                # Event queries/mutations
│   ├── attendees.ts             # Attendee queries
│   ├── finance.ts               # Finance helpers (amount breakdowns)
│   ├── sync/                    # External sync logic
│   │   ├── orders.ts            # Ticket Tailor order sync
│   │   ├── webhooks.ts          # Webhook event tracking
│   │   ├── attendees.ts         # Attendee sync
│   │   └── events.ts            # Event sync
│   └── crons.ts                 # Cron job handlers
├── lib/
│   ├── convex/
│   │   ├── api.ts               # Convex API export
│   │   ├── client.tsx            # ConvexProvider setup
│   │   └── hooks/               # React hooks for Convex
│   │       ├── orders.ts        # useOrders, useOrderById, etc.
│   │       ├── payments.ts      # usePayments, useAssignPaymentToOrder, etc.
│   │       ├── events.ts        # useEvents, etc.
│   │       └── ...
│   ├── domain/finance/          # Business logic layer
│   │   ├── order-ledger.ts      # Order ledger aggregation
│   │   ├── reconciliation.ts    # Reconciliation logic
│   │   ├── payments.ts          # Payment operations
│   │   └── amounts.ts            # Amount calculations
│   ├── integrations/
│   │   ├── tikkie/              # Tikkie API client
│   │   └── ticket-tailor/       # Ticket Tailor API client
│   └── types/                   # Shared TypeScript types
│       ├── order.ts             # Order types + validators
│       └── payment.ts           # Payment types + validators
└── components/                   # Shared UI components
```

## Directory Purposes

**`app/` - Next.js App Router:**
- Contains all pages (dashboard, public-facing, auth)
- API routes for dashboard operations
- Webhook handlers for external services

**`convex/` - Backend:**
- Schema definition (source of truth for data model)
- All query and mutation handlers
- Cron jobs and scheduled tasks
- Webhook processing

**`lib/convex/hooks/` - Client-side data access:**
- React hooks wrapping `useQuery`/`useMutation`
- Provides typed interfaces to Convex functions
- Keys: `useOrders`, `usePayments`, `useEvents`, `useOrderWithAttendees`, etc.

**`lib/domain/finance/` - Business logic:**
- Type transformations (DTO mapping)
- Validation and normalization
- Cross-entity operations (reconciliation, matching)
- Called by API routes, not directly by UI

**`lib/types/` - Shared contracts:**
- Convex validators (`v.union(...)`)
- TypeScript interfaces mirroring schema
- Used by both Convex and frontend

## Key File Locations

**Entry Points:**
- Dashboard home: `app/dashboard/page.tsx`
- Orders list: `app/dashboard/orders/page.tsx`
- Order detail: `app/dashboard/orders/[orderId]/page.tsx`
- Reconciliation: `app/dashboard/reconciliation/page.tsx`
- Payments: `app/dashboard/payments/page.tsx`

**Configuration:**
- Convex schema: `convex/schema.ts`
- Convex config: `convex/convex.config.ts`
- Auth config: `convex/auth.config.ts`

**Core Logic:**
- Order queries: `convex/orders.ts`
- Payment mutations: `convex/payments.ts`
- Payment links: `convex/tikkie.ts`
- Order sync: `convex/sync/orders.ts`
- Amount calculations: `convex/finance.ts`

**API Routes:**
- Orders: `app/api/dashboard/orders/route.ts`
- Order detail: `app/api/dashboard/orders/[orderId]/route.ts`
- Reconciliation: `app/api/dashboard/reconciliation/route.ts`

## Naming Conventions

**Files:**
- PascalCase for pages: `OrdersPage.tsx`, `OrderDetailPage.tsx`
- kebab-case for API routes: `orders/route.ts`, `reconciliation/route.ts`
- snake_case for Convex modules: `orders.ts`, `payments.ts`, `sync_orders.ts`

**Directories:**
- kebab-case for all: `dashboard/orders/`, `api/dashboard/`, `domain/finance/`

**Functions/Variables:**
- camelCase: `useOrders`, `getOrderLedger`, `upsertTikkiePayment`
- PascalCase for types: `OrderLedgerRow`, `CanonicalOrderStatus`

## Where to Add New Code

**New Feature (order/payment related):**
1. Convex queries/mutations: `convex/orders.ts` or `convex/payments.ts`
2. Domain logic: `lib/domain/finance/`
3. React hooks: `lib/convex/hooks/` (create new or extend existing)
4. API route: `app/api/dashboard/[resource]/route.ts`
5. Page component: `app/dashboard/[resource]/page.tsx`

**New Component/Module:**
- Implementation: `app/dashboard/` (for pages) or `convex/` (for backend)
- Shared UI: `components/ui/` (shadcn components)

**Utilities:**
- Shared helpers: `lib/utils/`
- Type definitions: `lib/types/`
- Integration clients: `lib/integrations/[provider]/`

## Special Directories

**`convex/_generated/`:**
- Purpose: Auto-generated Convex types and API bindings
- Generated: Yes (by Convex CLI)
- Committed: Yes (for type safety)

**`app/api/webhooks/`:**
- Purpose: External webhook receivers
- Not auth-protected (use signature verification)

**`lib/convex/hooks/sync.ts`:**
- Purpose: Sync status tracking hooks
- Related to: Ticket Tailor webhook processing status

---

*Structure analysis: 2026-04-21*
