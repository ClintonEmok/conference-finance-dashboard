# Codebase Structure

**Analysis Date:** 2026-03-30

## Directory Layout

```
conference-finance-dashboard/
├── app/                          # Next.js App Router (pages, layouts, API routes)
│   ├── api/                      # HTTP API endpoints
│   │   ├── admin/                # Admin-only endpoints
│   │   ├── dashboard/            # Authenticated dashboard data endpoints
│   │   ├── integrations/         # Integration status endpoints
│   │   ├── jobs/                 # Manual job triggers (sync operations)
│   │   ├── orders/               # Order search endpoint
│   │   ├── payments/             # Payment CRUD and sync endpoints
│   │   ├── protected/            # Auth-protected utility endpoints
│   │   ├── reconciliation/       # Reconciliation data endpoint
│   │   ├── signup/               # Public signup submission endpoint
│   │   ├── ticket-tailor/        # Ticket Tailor sync endpoints
│   │   └── webhooks/             # Incoming webhooks (ticket-tailor, tikkie)
│   ├── dashboard/                # Dashboard pages (authenticated)
│   │   ├── accommodation/        # Room management and assignment
│   │   ├── attendees/            # Attendee listing and detail
│   │   ├── financial/            # Financial overview
│   │   ├── integrations/         # Integration status view
│   │   ├── orders/               # Order listing and detail
│   │   ├── payments/             # Payment listing and management
│   │   ├── reconciliation/       # Reconciliation views
│   │   ├── settings/             # Settings (ticket-types)
│   │   └── ticket-tailor/        # Sync status view
│   ├── events/                   # Public event landing pages
│   │   └── [slug]/               # Dynamic event page
│   ├── login/                    # Login redirect (Clerk)
│   ├── signup/                   # Public signup flow pages
│   │   └── [slug]/               # Dynamic signup page
│   ├── layout.tsx                # Root layout (provider stack)
│   ├── page.tsx                  # Home page (redirect)
│   └── providers.tsx             # React Query provider
├── components/                   # Reusable UI components
│   ├── dashboard/                # Dashboard-specific components
│   ├── payments/                 # Payment-related components
│   ├── signup/                   # Signup flow components and steps
│   │   └── steps/                # Multi-step form steps
│   ├── ui/                       # shadcn/ui primitives
│   └── theme-provider.tsx        # next-themes wrapper
├── convex/                       # Convex backend functions and schema
│   ├── _generated/               # Auto-generated Convex types (do not edit)
│   ├── accommodation.ts          # Accommodation queries/mutations
│   ├── attendees.ts              # Attendee queries
│   ├── auth.ts                   # Auth helper (requireIdentity)
│   ├── auth.config.ts            # Clerk JWT issuer config
│   ├── autoSync.ts               # Cron-triggered sync functions
│   ├── crons.ts                  # Cron job definitions
│   ├── events.ts                 # Event queries/mutations
│   ├── orders.ts                 # Order queries/mutations
│   ├── payments.ts               # Payment queries/mutations
│   ├── schema.ts                 # Database schema definition
│   ├── signupCatalog.ts          # Signup catalog query
│   ├── signupSubmission.ts       # Signup submission mutation
│   ├── sync.ts                   # Ticket Tailor sync logic
│   └── tikkie.ts                 # Tikkie payment link queries/mutations
├── lib/                          # Shared libraries and utilities
│   ├── auth/                     # Authentication helpers
│   │   └── server.ts             # requireApiUser, requirePageUser, unauthorizedJson
│   ├── convex/                   # Convex data access layer
│   │   ├── api.ts                # Re-exports convex/_generated/api
│   │   ├── client.tsx            # ConvexProviderWithClerk (client-side)
│   │   ├── hooks/                # React hooks wrapping Convex queries
│   │   │   ├── index.ts          # Barrel export
│   │   │   ├── accommodation.ts  # useAccommodation hooks
│   │   │   ├── attendees.ts      # useAttendees hooks
│   │   │   ├── events.ts         # useEvents hooks
│   │   │   ├── orders.ts         # useOrders hooks
│   │   │   ├── payments.ts       # usePayments hooks
│   │   │   ├── signup.ts         # useSignupCatalog hooks
│   │   │   ├── sync.ts           # useSync hooks
│   │   │   └── tikkie.ts         # useTikkie hooks
│   │   └── server.ts             # runConvexQuery, runConvexMutation, convexQuery, convexMutation
│   ├── dashboard/                # Dashboard-specific logic
│   │   └── accommodation/
│   │       └── inventory-metrics.ts  # Inventory calculation utilities
│   ├── domain/                   # Business logic (pure, transport-independent)
│   │   ├── accommodation/        # Accommodation domain
│   │   │   ├── assignments.ts    # Room assignment logic
│   │   │   └── inventory.ts      # Inventory domain logic
│   │   ├── finance/              # Finance domain
│   │   │   ├── attendees.ts      # Attendee financial data
│   │   │   ├── attendee-detail.ts # Single attendee financial detail
│   │   │   ├── matched-payments.ts # Matched payment aggregation
│   │   │   ├── order-ledger.ts   # Order ledger building
│   │   │   ├── payments.ts       # Payment CRUD and sync
│   │   │   ├── reconciliation.ts # Reconciliation calculation
│   │   │   ├── reconciliation-follow-up.ts # Follow-up logic
│   │   │   ├── reporting.ts      # Reporting aggregation
│   │   │   ├── tikkie-event-links.ts # Tikkie event link management
│   │   │   ├── tikkie-event-payments.ts # Tikkie payment fetching
│   │   │   ├── tikkie-links.ts   # Tikkie link creation
│   │   │   ├── tikkie-quota.ts   # Tikkie quota management
│   │   │   ├── tikkie-sync.ts    # Tikkie sync orchestration
│   │   │   ├── tikkie-templates.ts # Payment template logic
│   │   │   └── ticket-tailor-status.ts # TT sync status
│   │   ├── signup/               # Signup domain
│   │   │   ├── catalog.ts        # Catalog building
│   │   │   └── submission.ts     # Submission validation and persistence
│   │   └── ticket-tailor/        # Ticket Tailor domain
│   │       └── custom-answers.ts # Custom answer parsing
│   ├── integrations/             # External API client wrappers
│   │   ├── status.ts             # Integration health check
│   │   ├── ticket-tailor/        # Ticket Tailor integration
│   │   │   ├── client.ts         # HTTP client (paginated fetch, retry)
│   │   │   ├── config.ts         # Config loader (env vars)
│   │   │   ├── sync.ts           # Sync orchestration
│   │   │   └── webhook.ts        # Webhook verification and processing
│   │   └── tikkie/               # Tikkie (ABN AMRO) integration
│   │       ├── client.ts         # HTTP client (retry, timeout)
│   │       ├── config.ts         # Config loader (env vars)
│   │       └── webhook.ts        # Webhook verification and processing
│   ├── types/                    # Shared TypeScript types and Convex validators
│   │   ├── accommodation.ts      # Accommodation types
│   │   ├── attendee.ts           # Attendee types
│   │   ├── order.ts              # Order types and validators
│   │   ├── payment.ts            # Payment types and validators
│   │   ├── shared.ts             # Shared/common types
│   │   ├── signup.ts             # Signup types
│   │   └── tikkie.ts             # Tikkie-specific types
│   ├── format.ts                 # Formatting utilities (formatMoney, etc.)
│   ├── rate-limit.ts             # In-memory rate limiter
│   └── utils.ts                  # General utilities (cn for className merging)
├── tests/                        # Test files (mirrors domain structure)
│   ├── accommodation/            # Accommodation tests
│   ├── attendees/                # Attendee tests
│   ├── payments/                 # Payment tests
│   ├── reconciliation/           # Reconciliation tests
│   ├── signup-flow/              # Signup flow tests
│   ├── ticket-tailor/            # Ticket Tailor tests
│   └── tikkie/                   # Tikkie tests
├── design/                       # Design assets/references
├── public/                       # Static assets
├── prisma/                       # Prisma schema (legacy/potential)
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── next.config.mjs               # Next.js configuration
├── convex.json                   # Convex deployment config
├── vitest.config.ts              # Vitest test configuration
├── eslint.config.mjs             # ESLint flat config
└── .prettierrc                   # Prettier formatting config
```

## Directory Purposes

**`app/`** (Next.js App Router):

- Purpose: Route definitions, page components, layouts, API endpoints
- Contains: `.tsx` pages, `.ts` API route handlers, `loading.tsx` suspense boundaries, `error.tsx` error boundaries
- Key files: `app/layout.tsx` (root layout), `app/dashboard/layout.tsx` (dashboard auth guard), `app/providers.tsx` (React Query)

**`components/`** (UI components):

- Purpose: Reusable React components organized by feature
- Contains: Feature components, multi-step form components, shadcn/ui primitives
- Key files: `components/ui/*.tsx` (shadcn primitives), `components/signup/SignupFlowShell.tsx` (signup orchestrator), `components/dashboard/dashboard-shell.tsx` (dashboard layout)

**`convex/`** (Backend functions):

- Purpose: Database schema, queries, mutations, and scheduled tasks
- Contains: Convex function definitions, schema, auth config
- Key files: `convex/schema.ts` (all table definitions), `convex/orders.ts`, `convex/payments.ts`, `convex/crons.ts`

**`lib/`** (Shared libraries):

- Purpose: Business logic, data access, integration clients, types, utilities
- Contains: Domain logic, Convex bridge, external API clients, type validators
- Key files: `lib/convex/server.ts` (data access), `lib/auth/server.ts` (auth guards), `lib/domain/finance/payments.ts` (payment logic)

**`tests/`** (Test files):

- Purpose: Unit and integration tests mirroring `lib/domain/` structure
- Contains: `.test.ts` files organized by feature domain

## Key File Locations

**Entry Points:**

- `app/layout.tsx`: Root layout. Provider stack order: ClerkProvider > ConvexClientProvider > QueryProvider > ThemeProvider
- `app/dashboard/layout.tsx`: Dashboard auth guard. Calls `requirePageUser("/dashboard")`, renders `DashboardShell`
- `app/page.tsx`: Home page (landing/redirect)
- `app/events/[slug]/page.tsx`: Public event entry point
- `app/login/page.tsx`: Login redirect via Clerk `redirectToSignIn`

**Configuration:**

- `package.json`: Project deps, scripts (`dev`, `build`, `test`, `lint`, `format`, `typecheck`)
- `tsconfig.json`: Path alias `@/*` maps to project root, strict mode enabled
- `convex.json`: Convex deployment config
- `vitest.config.ts`: Test runner config
- `.prettierrc`: Formatting config

**Core Logic:**

- `lib/domain/finance/payments.ts`: Payment creation, assignment, Tikkie sync, auto-matching
- `lib/domain/finance/reconciliation.ts`: Reconciliation row derivation and outstanding calculation
- `lib/domain/finance/order-ledger.ts`: Order ledger aggregation
- `lib/domain/signup/submission.ts`: Signup validation and persistence
- `convex/schema.ts`: Full database schema (559 lines, ~30 tables)

**Testing:**

- `tests/`: Test files organized by domain: `accommodation/`, `attendees/`, `payments/`, `reconciliation/`, `signup-flow/`, `ticket-tailor/`, `tikkie/`
- `app/api/signup/submit/route.test.ts`: Co-located API route test (exception to separate test directory)

## Naming Conventions

**Files:**

- Pages: `page.tsx` (Next.js convention)
- API routes: `route.ts` (Next.js convention)
- Layouts: `layout.tsx` (Next.js convention)
- Loading states: `loading.tsx` (Next.js convention)
- Error boundaries: `error.tsx` (Next.js convention)
- Convex functions: `camelCase.ts` matching domain (`orders.ts`, `payments.ts`, `attendees.ts`)
- Domain logic: `kebab-case.ts` (`order-ledger.ts`, `tikkie-event-links.ts`, `custom-answers.ts`)
- React components: `PascalCase.tsx` for components (`SignupFlowShell.tsx`), `kebab-case.tsx` for feature components (`event-tikkie-section.tsx`)
- Types: `kebab-case.ts` (`signup.ts`, `payment.ts`)
- Tests: Mirror source with `.test.ts` suffix

**Directories:**

- Feature domains: `kebab-case` (`ticket-tailor`, `bank-transfer`)
- Convex auto-generated: `_generated/` (underscore prefix, do not edit)
- UI primitives: `ui/`

## Where to Add New Code

**New Dashboard Feature:**

- Page: `app/dashboard/{feature}/page.tsx`
- Loading state: `app/dashboard/{feature}/loading.tsx`
- API endpoint: `app/api/dashboard/{feature}/route.ts`
- Domain logic: `lib/domain/{domain}/{feature}.ts`
- Convex function: `convex/{table}.ts` (add to existing) or `convex/{feature}.ts` (new table)
- UI component: `components/dashboard/{feature}.tsx`
- Tests: `tests/{domain}/{feature}.test.ts`

**New External Integration:**

- Client: `lib/integrations/{service}/client.ts`
- Config: `lib/integrations/{service}/config.ts`
- Webhook handler: `lib/integrations/{service}/webhook.ts`
- API route: `app/api/webhooks/{service}/route.ts`
- Sync logic: `lib/integrations/{service}/sync.ts`
- Status check: `lib/integrations/status.ts` (add entry)

**New Convex Table:**

- Schema: `convex/schema.ts` (add `defineTable`)
- Functions: `convex/{table}.ts` (create new file with queries/mutations)
- Types: `lib/types/{table}.ts` (create validators and DTOs)
- Hooks: `lib/convex/hooks/{table}.ts` (create client hooks)
- Export: Update `lib/convex/hooks/index.ts` barrel

**New Signup Step:**

- Step component: `components/signup/steps/{StepName}.tsx`
- Update: `components/signup/SignupFlowShell.tsx` (add to step array)
- State: `components/signup/state.ts` (extend if needed)
- Domain: `lib/domain/signup/` (add validation logic)

**New Public Page:**

- Page: `app/{route}/page.tsx`
- Convex hook: Use existing `lib/convex/hooks/` or create new
- Loading: `app/{route}/loading.tsx`

## Special Directories

**`convex/_generated/`:**

- Purpose: Auto-generated Convex types, API references, server wrappers
- Generated: Yes (by `npx convex dev`)
- Committed: Yes (required for type checking)

**`.next/`:**

- Purpose: Next.js build output
- Generated: Yes
- Committed: No (in `.gitignore`)

**`node_modules/`:**

- Purpose: npm dependencies
- Generated: Yes
- Committed: No (in `.gitignore`)

**`tests/`:**

- Purpose: Unit and integration tests
- Generated: No
- Committed: Yes
- Structure: Mirrors `lib/domain/` organization with test files named `{module}.test.ts`

**`design/`:**

- Purpose: Design assets and references
- Generated: No
- Committed: Yes

---

_Structure analysis: 2026-03-30_
