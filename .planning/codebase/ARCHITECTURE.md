# Architecture

**Analysis Date:** 2026-03-30

## Pattern Overview

**Overall:** Layered architecture with Next.js App Router, Convex backend, and Clerk authentication

**Key Characteristics:**

- Next.js 16 App Router as the HTTP layer and UI framework
- Convex as the real-time backend database and function runtime
- Clerk for authentication, bridged to Convex via JWT tokens
- Domain logic separated from infrastructure concerns in `lib/domain/`
- External service integrations abstracted behind client modules in `lib/integrations/`
- Dual data access: Convex hooks for client-side, `runConvexQuery`/`runConvexMutation` for server-side API routes

## Layers

**Presentation (Next.js App Router):**

- Purpose: HTTP routing, SSR pages, API endpoints, UI rendering
- Location: `app/`
- Contains: Page components (`page.tsx`), API routes (`api/*/route.ts`), layouts (`layout.tsx`), loading states (`loading.tsx`), providers (`providers.tsx`)
- Depends on: `components/`, `lib/`, `convex/_generated/api`
- Used by: Browser clients

**Components:**

- Purpose: Reusable UI components organized by feature domain
- Location: `components/`
- Contains: Feature components (`dashboard/`, `payments/`, `signup/`), base UI primitives (`ui/`)
- Depends on: `lib/`, shadcn/ui primitives
- Used by: Pages in `app/`

**Domain Logic:**

- Purpose: Pure business logic decoupled from HTTP and database concerns
- Location: `lib/domain/`
- Contains: Finance operations (`lib/domain/finance/`), signup flow (`lib/domain/signup/`), accommodation management (`lib/domain/accommodation/`), Ticket Tailor domain (`lib/domain/ticket-tailor/`)
- Depends on: `lib/convex/server.ts` (for data access), `lib/integrations/` (for external calls)
- Used by: API routes and Convex functions

**Convex Backend Functions:**

- Purpose: Server-side queries, mutations, and scheduled tasks
- Location: `convex/`
- Contains: Table schemas (`schema.ts`), query/mutation functions (`orders.ts`, `payments.ts`, etc.), auth helpers (`auth.ts`), cron jobs (`crons.ts`)
- Depends on: `convex/_generated/` (auto-generated types), `lib/types/` (shared validators)
- Used by: Client hooks, server-side data access, cron scheduler

**Integration Layer:**

- Purpose: HTTP clients for external services with retry/timeout logic
- Location: `lib/integrations/`
- Contains: Ticket Tailor API client (`ticket-tailor/client.ts`), Tikkie API client (`tikkie/client.ts`), webhook handlers (`*/webhook.ts`), config loaders (`*/config.ts`), sync logic (`ticket-tailor/sync.ts`), integration status (`status.ts`)
- Depends on: Environment variables, HTTP fetch API
- Used by: Domain logic, API routes

**Data Access (Convex Bridge):**

- Purpose: Abstraction layer for calling Convex functions from Next.js server components/routes
- Location: `lib/convex/`
- Contains: Server-side data access helpers (`server.ts`), API reference re-export (`api.ts`), client provider (`client.tsx`), React hooks (`hooks/`)
- Depends on: `@clerk/nextjs` for auth tokens, `convex/nextjs` for fetch adapters
- Used by: API routes (server), page components (client hooks)

**Shared Types:**

- Purpose: Type definitions and validators shared across layers
- Location: `lib/types/`
- Contains: Domain types (`order.ts`, `payment.ts`, `attendee.ts`, `accommodation.ts`, `tikkie.ts`, `signup.ts`, `shared.ts`)
- Depends on: Convex validators
- Used by: Convex functions, domain logic, API routes

## Data Flow

**Webhook Ingestion (Ticket Tailor / Tikkie):**

1. External service sends webhook POST to `app/api/webhooks/{provider}/route.ts`
2. Route verifies signature using `lib/integrations/{provider}/webhook.ts`
3. Rate limit enforced via `lib/rate-limit.ts`
4. Webhook payload ingested into Convex table (`ticketTailorWebhookEvents` or `tikkiePaymentLinkTransitions`)
5. Processing function runs domain logic (e.g., `processTicketTailorWebhookEvent`)
6. Domain logic calls Convex mutations to update normalized data tables

**Dashboard Data Retrieval:**

1. Dashboard page (`app/dashboard/page.tsx`) mounts as client component
2. Uses `fetch()` to call Next.js API routes (e.g., `/api/dashboard/revenue`)
3. API route authenticates via `requireApiUser()` using Clerk
4. Domain function in `lib/domain/finance/` calls `convexQuery()` / `convexMutation()`
5. Convex functions query database and return typed results
6. API route returns JSON to client
7. Client renders data with React components

**Public Signup Flow:**

1. Public page `/events/[slug]` loads, calls `usePublicSignupCatalog()` Convex hook
2. User navigates to `/signup/[slug]` which renders `SignupFlowShell` multi-step form
3. Steps: TicketStep -> RoomAssignmentStep -> AttendeeDetailsStep -> ReviewSubmitStep
4. Final submission POSTs to `app/api/signup/submit/route.ts`
5. Domain function `submitSignup()` in `lib/domain/signup/submission.ts` validates and persists via Convex mutations
6. Idempotency enforced via `submissionIdempotency` table

**Server-Side Data Access Pattern:**

1. API route imports `{ convexQuery, convexMutation }` from `lib/convex/server.ts`
2. Passes Convex function reference from `lib/convex/api.ts` (re-exports `convex/_generated/api`)
3. Server helper obtains Clerk JWT token via `auth().getToken({ template: "convex" })`
4. Calls `fetchQuery` / `fetchMutation` from `convex/nextjs` with token
5. In test mode, uses direct HTTP fetch to Convex URL (allows mocking)

**Automated Sync (Cron):**

1. Convex crons defined in `convex/crons.ts` run every 15 minutes
2. `autoSyncTicketTailor` and `autoSyncTikkiePayments` invoke `internal.autoSync.*` functions
3. Internal functions call domain sync logic to fetch latest data from external APIs
4. Results written back to Convex tables

## Key Abstractions

**Domain Functions (`lib/domain/`):**

- Purpose: Encapsulate business logic independent of transport
- Examples: `lib/domain/finance/payments.ts`, `lib/domain/finance/reconciliation.ts`, `lib/domain/signup/submission.ts`
- Pattern: Export async functions that accept typed inputs, call `convexQuery`/`convexMutation` for data, return typed DTOs

**Integration Clients (`lib/integrations/`):**

- Purpose: HTTP wrappers for external APIs with retry, timeout, and error handling
- Examples: `lib/integrations/ticket-tailor/client.ts`, `lib/integrations/tikkie/client.ts`
- Pattern: Export fetch functions that build URLs from config, add auth headers, retry on 429/5xx, throw typed errors

**Convex Bridge (`lib/convex/server.ts`):**

- Purpose: Server-side adapter for calling Convex functions with Clerk auth
- Examples: `runConvexQuery()`, `runConvexMutation()`, `convexQuery()`, `convexMutation()`
- Pattern: Obtain Clerk token, pass to Convex fetch helpers, format errors consistently. In test mode, uses raw HTTP for mockability

**React Convex Hooks (`lib/convex/hooks/`):**

- Purpose: Client-side React hooks wrapping Convex `useQuery` / `useMutation`
- Examples: `lib/convex/hooks/orders.ts`, `lib/convex/hooks/events.ts`
- Pattern: Export hooks that re-export Convex-generated API references for type-safe client usage

**Type Validators (`lib/types/`):**

- Purpose: Convex-compatible validators shared between server functions and client types
- Examples: `lib/types/order.ts`, `lib/types/payment.ts`
- Pattern: Export `v.object(...)` validators used in Convex function args/returns and type imports

## Entry Points

**Application Root:**

- Location: `app/layout.tsx`
- Triggers: Browser page load
- Responsibilities: Provider stack (Clerk -> Convex -> React Query -> Theme), font loading, global CSS

**Dashboard Layout:**

- Location: `app/dashboard/layout.tsx`
- Triggers: Any `/dashboard/*` route
- Responsibilities: Auth guard (`requirePageUser`), renders `DashboardShell` with sidebar navigation

**Public Signup:**

- Location: `app/events/[slug]/page.tsx`
- Triggers: Public event landing page
- Responsibilities: Load catalog via Convex hook, display event details, link to signup flow

**API Routes (webhooks):**

- Location: `app/api/webhooks/ticket-tailor/route.ts`, `app/api/webhooks/tikkie/route.ts`
- Triggers: External service HTTP POST
- Responsibilities: Signature verification, payload ingestion, processing

**API Routes (dashboard):**

- Location: `app/api/dashboard/*/route.ts`
- Triggers: Authenticated client fetch requests
- Responsibilities: Auth guard, query parameter parsing, domain function delegation, JSON response

**API Routes (jobs):**

- Location: `app/api/jobs/*/route.ts`
- Triggers: Manual or scheduled invocations
- Responsibilities: Full sync operations (e.g., `tikkie/full-sync`, `tikkie/event-payment-sync`)

**Convex Crons:**

- Location: `convex/crons.ts`
- Triggers: Convex cron scheduler (every 15 minutes)
- Responsibilities: Auto-sync Ticket Tailor orders/attendees, auto-sync Tikkie payments

## Error Handling

**Strategy:** Typed error responses with HTTP status codes at API boundary; domain exceptions for business rule violations

**Patterns:**

- API routes return `{ error: { code, message } }` JSON with appropriate status (400, 401, 409, 500)
- Domain functions throw `SignupSubmissionValidationError` for validation failures (caught in routes, mapped to 400)
- Integration clients throw `TikkieApiError` with status and kind classification
- Convex functions throw `"Unauthorized"` for auth failures
- Rate limiting returns 429 via `enforceRateLimit()` before any business logic

## Cross-Cutting Concerns

**Logging:** No centralized logging framework. Convex `console.log` used in functions. Integration clients log to error messages

**Validation:** Convex validators (`v.*`) enforce schema at function boundaries. Domain functions do additional business rule validation

**Authentication:** Clerk for user auth. JWT tokens bridged to Convex via `ConvexProviderWithClerk` (client) and `getToken({ template: "convex" })` (server). `requireIdentity()` guards Convex mutations. `requireApiUser()` guards API routes. Public routes (signup, events) are unauthenticated

---

_Architecture analysis: 2026-03-30_
