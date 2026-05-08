# External Integrations

**Analysis Date:** 2026-03-30

## APIs & External Services

### Ticket Tailor (Event Ticketing Platform)

- **Purpose:** Syncs event, order, and attendee data for conference finance management
- **SDK/Client:** Custom client at `lib/integrations/ticket-tailor/client.ts`
- **API Type:** REST API (Basic Auth)
- **Base URL:** `https://api.tickettailor.com/v1` (configurable via `TICKET_TAILOR_BASE_URL`)
- **Auth:** Bearer token via `TICKET_TAILOR_API_KEY` (Base64-encoded in Authorization header)
- **Endpoints used:**
  - `GET /events` - List all events
  - `GET /events/{id}/orders` - List orders for an event
  - `GET /orders/{id}` - Get canonical order with attendees
- **Retry logic:** Exponential backoff with configurable timeout (`TICKET_TAILOR_FETCH_TIMEOUT_MS`, default 15s) and max retries (`TICKET_TAILOR_MAX_RETRIES`, default 2)
- **Files:**
  - `lib/integrations/ticket-tailor/config.ts` - Config validation
  - `lib/integrations/ticket-tailor/client.ts` - API client with pagination support
  - `lib/integrations/ticket-tailor/sync.ts` - Sync orchestration
  - `lib/integrations/ticket-tailor/webhook.ts` - Webhook ingestion and processing

### Tikkie (Dutch Payment Platform - ABN AMRO)

- **Purpose:** Creates payment links for ticket purchases, tracks payment status
- **SDK/Client:** Custom client at `lib/integrations/tikkie/client.ts`
- **API Type:** REST API (API Key + App Token)
- **Base URL:** `https://api.tikkie.me` (prod) / `https://api-sandbox.abnamro.com/v2/tikkie` (sandbox)
- **Auth:** `API-Key` header + `X-App-Token` header
- **Env vars:**
  - `TIKKIE_API_KEY` - API key
  - `TIKKIE_APP_TOKEN` - UUID-format app token
  - `TIKKIE_BASE_URL` - Base URL
  - `TIKKIE_WEBHOOK_SECRET` - HMAC secret for webhook verification
  - `TIKKIE_SUBSCRIPTION_SETUP_ENABLED` - Feature flag for webhook subscription setup
  - `TIKKIE_WEBHOOK_CALLBACK_URL` - Callback URL for payment notifications
- **Endpoints used:**
  - `POST /paymentrequests` - Create payment request (payment link)
  - `GET /paymentrequests/{token}` - Get payment request status
  - `GET /paymentrequests/{token}/payments` - List payments for a request
  - `POST /paymentrequestssubscription` - Subscribe to payment notifications
- **Retry logic:** Exponential backoff with configurable timeout (`TIKKIE_FETCH_TIMEOUT_MS`, default 15s) and max retries (`TIKKIE_MAX_RETRIES`, default 2)
- **Files:**
  - `lib/integrations/tikkie/config.ts` - Config validation
  - `lib/integrations/tikkie/client.ts` - API client with `TikkieApiError` error class
  - `lib/integrations/tikkie/webhook.ts` - Webhook verification (HMAC-SHA256) and processing

## Data Storage

**Primary Database:**

- **Convex** - Real-time serverless database
  - Connection: via `NEXT_PUBLIC_CONVEX_URL` (Convex Cloud URL)
  - Schema: `convex/schema.ts` (25+ tables)
  - Key tables: `events`, `ticketTailorEvents`, `ticketTailorOrders`, `ticketTailorAttendees`, `tikkiePaymentLinks`, `tikkiePayments`, `payments`, `accommodationSlots`, `accommodationRooms`
  - Indexes: Extensive indexing for provider IDs, event IDs, status lookups

**Secondary Database (Legacy/Reference):**

- **Prisma + PostgreSQL** (via Supabase)
  - Schema: `prisma/schema.prisma` (mirrors Convex schema)
  - Dev DB: `prisma/dev.db` (SQLite for development)
  - Connection: `DATABASE_URL` env var
  - Status: Appears to be legacy/reference schema, primary data is in Convex

**File Storage:**

- Not detected (no file upload/storage patterns found)

**Caching:**

- TanStack React Query for client-side caching
- No server-side caching layer detected

## Authentication & Identity

**Auth Provider:**

- **Clerk** (`@clerk/nextjs` ^7.0.7)
  - Implementation: JWT-based authentication integrated with Convex
  - Config:
    - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Client-side publishable key
    - `CLERK_SECRET_KEY` - Server-side secret key
    - `CLERK_JWT_ISSUER_DOMAIN` - JWT issuer domain for Convex verification
    - `CLERK_FRONTEND_API_URL` - Frontend API URL
  - Convex integration: `convex/auth.config.ts` configures Clerk as JWT provider
  - Server auth: `lib/auth/server.ts` provides `requireApiUser()` and `requirePageUser()` helpers
  - Layout: `ClerkProvider` wraps entire app in `app/layout.tsx`

**Legacy Auth (Deprecated):**

- Better Auth (commented out in `.env` files)
  - Supabase Auth (referenced in `.env.example` comment)

## Monitoring & Observability

**Error Tracking:**

- None detected (no Sentry, LogRocket, etc.)

**Logs:**

- Convex built-in logging (console.log within Convex functions)
- Integration health checks via `lib/integrations/status.ts` (pings provider APIs)

**Health Checks:**

- `lib/integrations/status.ts` - Built-in integration status checker
  - Checks Ticket Tailor: `GET {baseUrl}/events`
  - Checks Tikkie: `GET {baseUrl}/paymentrequests?pageSize=1&pageNumber=0`
  - Timeout: `INTEGRATION_PING_TIMEOUT_MS` (default 5000ms)
  - Returns: `configured | misconfigured | unreachable`

## CI/CD & Deployment

**Hosting:**

- Convex Cloud (backend)
- Vercel or similar (frontend - inferred from Next.js setup, not confirmed)

**CI Pipeline:**

- Not detected (no GitHub Actions, Vercel config, etc.)

**Scripts:**

- `npm run dev` - Development server with Turbopack
- `npm run build` - Production build
- `npm run test` - Run tests
- `npm run lint` - ESLint
- `npm run format` - Prettier
- `npm run typecheck` - TypeScript type checking

## Environment Configuration

**Required env vars:**

- `CONVEX_DEPLOYMENT` - Convex deployment selector
- `NEXT_PUBLIC_CONVEX_URL` - Convex Cloud URL (client-side)
- `NEXT_PUBLIC_CONVEX_SITE_URL` - Convex HTTP actions URL
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `CLERK_SECRET_KEY` - Clerk secret key
- `CLERK_JWT_ISSUER_DOMAIN` - Clerk JWT issuer for Convex
- `TICKET_TAILOR_API_KEY` - Ticket Tailor API key
- `TICKET_TAILOR_BASE_URL` - Ticket Tailor API base URL
- `TIKKIE_API_KEY` - Tikkie API key
- `TIKKIE_APP_TOKEN` - Tikkie app token (UUID)
- `TIKKIE_BASE_URL` - Tikkie API base URL

**Optional env vars:**

- `DATABASE_URL` - PostgreSQL connection (for Prisma schema reference)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` - Supabase credentials (legacy)
- `TIKKIE_WEBHOOK_SECRET` - Webhook signature verification
- `TIKKIE_WEBHOOK_CALLBACK_URL` - Webhook callback URL
- `TIKKIE_SUBSCRIPTION_SETUP_ENABLED` - Feature flag (default: false)
- `INTEGRATION_PING_TIMEOUT_MS` - Health check timeout

**Secrets location:**

- `.env` - Development defaults
- `.env.local` - Local overrides (Convex deployment config)
- `.env.example` - Template with placeholders

## Webhooks & Callbacks

**Incoming Webhooks:**

- **Ticket Tailor** - `app/api/webhooks/ticket-tailor/`
  - Signature verification: HMAC-SHA256 via `x-ticket-tailor-signature` header
  - Processing: Ingests to Convex `ticketTailorWebhookEvents` table, processes with retry/backoff
- **Tikkie** - `app/api/webhooks/tikkie/`
  - Signature verification: HMAC-SHA256 via `x-tikkie-signature` header
  - Notification types: PAYMENT, REFUND, BUNDLE
  - Processing: Updates payment link status in Convex

**Outgoing Webhooks:**

- **Tikkie subscription** - `POST /paymentrequestssubscription`
  - Feature flag controlled: `TIKKIE_SUBSCRIPTION_SETUP_ENABLED`
  - Callback URL: `TIKKIE_WEBHOOK_CALLBACK_URL`

**Cron Jobs (Convex):**

- `ticket-tailor-auto-sync` - Every 15 minutes, syncs Ticket Tailor data
- `tikkie-payments-auto-sync` - Every 15 minutes, syncs Tikkie payment statuses
- Defined in `convex/crons.ts`

---

_Integration audit: 2026-03-30_
