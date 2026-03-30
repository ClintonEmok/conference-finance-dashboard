# Codebase Concerns

**Analysis Date:** 2026-03-30

## Security Considerations

**Live credentials in local `.env`:**

- Risk: Developer machines expose API keys for Ticket Tailor (`sk_12782_...`), Tikkie (`2G56Du...`), Clerk (`pk_test_...`/`sk_test_...`), and Convex deployment URL
- Files: `/Users/clintonemok/Work/2026/Church/Deeper Stack/conference-finance-dashboard/.env`
- Current mitigation: `.env` is in `.gitignore` (not tracked by git)
- Recommendations: Rotate all keys shown in `.env`. Add `.env` to a pre-commit hook scan. Consider using `direnv` or `vault` for secret management in team environments

**Webhook error handling asymmetry:**

- Risk: `app/api/webhooks/ticket-tailor/route.ts` does not wrap `processTicketTailorWebhookEvent` in try/catch — an unhandled exception returns a 500 with stack trace potential
- Files: `app/api/webhooks/ticket-tailor/route.ts`
- The Tikkie webhook at `app/api/webhooks/tikkie/route.ts` correctly wraps processing in try/catch
- Fix approach: Wrap the processing pipeline in try/catch matching the Tikkie webhook pattern

**No role-based access control:**

- Risk: Any authenticated user has full admin access — no role checks on mutations that create hotels, delete templates, or manage payments
- Files: `convex/auth.ts`, all Convex mutations
- Current mitigation: `requireIdentity()` only checks that _someone_ is logged in
- Recommendations: Add role/claim checks (e.g., `identity.role === "admin"`) for write operations

## Tech Debt

**Prisma remnants after Convex migration:**

- Issue: Full `prisma/` directory with schema (432 lines), 9 migration SQL files, and SQLite database files remain, but no production code imports Prisma
- Files: `prisma/`, `prisma/dev.db`, `prisma/test-db.sqlite`, `prisma/prisma/test-db.sqlite`
- Impact: Confuses onboarding; `prisma/` and SQLite files (~500KB) add repo bloat
- Fix approach: Remove `prisma/` directory entirely (keep in git history if needed for reference). Verify no scripts reference Prisma CLI

**Stale tests referencing Prisma mocks:**

- Issue: `tests/tikkie/tikkie-links.test.ts` (868 lines) mocks `prisma.tikkiePaymentLink.findMany`, `prisma.tikkiePaymentLinkTransition.findUnique`, etc. — interfaces that no longer exist in the production code (`lib/domain/finance/tikkie-links.ts` now uses Convex queries/mutations)
- Files: `tests/tikkie/tikkie-links.test.ts`
- Impact: Tests test mock behavior against Prisma API surface, not actual Convex-backed behavior. These tests provide false confidence
- Fix approach: Rewrite tests to mock Convex query/mutation functions (`convexQuery`, `convexMutation`) instead of Prisma client

**Duplicate HTTP client in `autoSync.ts`:**

- Issue: `convex/autoSync.ts` (848 lines) reimplements a full Ticket Tailor HTTP client (`ttFetch`, `ttFetchPaginated`, `extractItems`, `extractAttendeeItems`) that already exists in `lib/integrations/ticket-tailor/client.ts` (508 lines)
- Files: `convex/autoSync.ts` (lines 54-229), `lib/integrations/ticket-tailor/client.ts`
- Impact: Bug fixes or API changes must be applied in two places. Code duplication ~180 lines
- Fix approach: Convex actions CAN call external APIs. Refactor to import and use the shared client, or extract a shared module that both can import

**Duplicated cleanup mutations:**

- Issue: `cleanupLegacyTikkiePayments` (public) and `internalCleanupLegacyTikkiePayments` (internal) in `convex/payments.ts` contain identical logic (~95 lines each)
- Files: `convex/payments.ts` (lines 153-250, lines 417-505)
- Impact: Changes must be applied to both; risk of divergence
- Fix approach: Extract shared cleanup logic into a helper function called by both mutations

## Performance Bottlenecks

**In-memory rate limiter with no eviction:**

- Problem: `lib/rate-limit.ts` uses a `Map` that grows unboundedly — entries are never cleaned up after their window expires
- Files: `lib/rate-limit.ts`
- Impact: Memory leak on long-running processes. Also, the map is per-instance — multi-instance deployments (e.g., multiple Vercel serverless functions) don't share state, making rate limiting ineffective
- Fix approach: Add periodic cleanup of expired entries. For production, replace with Redis-backed or Convex-backed rate limiting

**Payments API in-memory pagination:**

- Problem: `app/api/payments/route.ts` fetches ALL payments from Convex, filters by date in JS, then paginates in memory. At 10,000+ payments this becomes slow
- Files: `app/api/payments/route.ts` (lines 129-150)
- Impact: O(n) memory and time on every page request regardless of page size
- Fix approach: Push date filtering and pagination into the Convex query using indexes

**Full table scan in `autoMatchPayments`:**

- Problem: `convex/payments.ts` `autoMatchPayments` fetches up to 1000 payments without index filtering, then filters `status === "unassigned"` in JavaScript
- Files: `convex/payments.ts` (lines 299-302)
- Impact: Reads 1000 documents when only a small fraction may be unassigned
- Fix approach: Use the existing `status` index: `ctx.db.query("payments").withIndex("status", q => q.eq("status", "unassigned")).take(1000)`

**`tikkie.ts` `getPaymentLinksByOrderId` full scan:**

- Problem: Fetches up to 500 Tikkie payment links unfiltered, then filters by `orderId` in JavaScript instead of using the `orderId` index
- Files: `convex/tikkie.ts` (lines 284-317)
- Impact: Reads 500 docs to find the few matching an order
- Fix approach: Use the existing `orderId` index on `tikkiePaymentLinks`

## Fragile Areas

**`convex/accommodation.ts` — 1,227-line monolith:**

- Files: `convex/accommodation.ts`
- Why fragile: Contains queries, mutations, internal mutations, helper functions, auto-allocation logic, and board assembly — all in one file. Touching one area risks breaking another
- Safe modification: Read the full file before editing. The function `attendeeMatchesSignalFilters` (line 94) is exported — verify callers before changing its signature

**`convex/payments.ts` — `as any` cast for pagination:**

- Issue: Line 54 returns `(await base.paginate(args.paginationOpts)) as any` — the return type doesn't match the declared `returns: v.array(paymentDocValidator)` validator
- Files: `convex/payments.ts` (line 54)
- Impact: When pagination is requested, callers receive a `{page, isDone, continueCursor}` object but TypeScript thinks they get an array
- Fix approach: Create separate paginated and non-paginated query endpoints with correct return types

**Schema uses `v.any()` extensively:**

- Issue: 13+ table fields use `v.any()` — `rawPayload`, `providerPayload`, `customAnswers`, `diagnostics`, `payload`, `canonicalPayload`
- Files: `convex/schema.ts`
- Impact: No compile-time or runtime type safety on these fields. Code accessing them must use unsafe casts (`as Record<string, unknown>`)
- Fix approach: Define typed schemas for known payload shapes. Keep `v.any()` only for truly unstructured webhook payloads

**Helper functions typed with `ctx: any`:**

- Issue: `convex/accommodation.ts` helper functions (`getAccommodationHotelByStringId`, `getAccommodationRoomByStringId`, `getAccommodationRoomTypeByStringId`, `getAttendeeByStringId`) all accept `ctx: any`
- Files: `convex/accommodation.ts` (lines 35-70)
- Impact: No type checking on database operations; easy to pass wrong table names or get wrong return types
- Fix approach: Type `ctx` properly using `QueryCtx` or `MutationCtx` from Convex

## Scaling Limits

**In-memory rate limiter:**

- Current capacity: Works on single Vercel serverless function instance
- Limit: Breaks across multiple instances (no shared state) and leaks memory over time
- Scaling path: Redis or Convex-backed rate limiting

**Cron-based sync every 15 minutes:**

- Current capacity: 15-minute interval for both Ticket Tailor and Tikkie syncs
- Limit: `convex/crons.ts` runs both syncs every 15 minutes. The Ticket Tailor sync fetches all events + all orders per event. With many events, this could exceed Convex action time limits
- Scaling path: Incremental sync (only fetch changed records since last sync), parallelize event processing

**Monthly Tikkie quota hard-coded to 5:**

- Current capacity: 5 payment link creations per month
- Limit: `DEFAULT_MONTHLY_TIKKIE_CREATION_LIMIT = 5` in `convex/tikkie.ts` (line 6)
- Scaling path: Move to environment variable or per-event configurable quota

## Missing Critical Features

**No Convex-side authentication enforcement on public queries:**

- Problem: Several Convex queries lack `requireIdentity()` — any client with the Convex URL can read data
- Files: `convex/orders.ts` (`getOrders`, `getOrderById`, `getOrderByProviderId`, `getOrderLedger`), `convex/accommodation.ts` (`getRoomAllocationBoard`, `getHotelById`, `getRooms`, `getRoomTypes`), `convex/tikkie.ts` (`getPaymentLinks`, `getPaymentLinkByToken`, `getPaymentTemplates`)
- Current mitigation: The Next.js API layer authenticates before calling Convex, but direct Convex client access bypasses this
- Fix approach: Add `requireIdentity()` to all public queries, or mark them as internal

**No input validation on string lengths:**

- Problem: Convex mutations accept `v.string()` for fields like `name`, `description`, `notes` without length bounds
- Files: `convex/schema.ts`, all mutation definitions
- Impact: Arbitrary-length strings can be stored, potentially causing UI rendering issues or storage abuse
- Fix approach: Add `v.string()` with validators or validate in mutation handlers

## Test Coverage Gaps

**No integration tests for Convex mutations:**

- What's not tested: Convex mutations (`accommodation.ts`, `payments.ts`, `tikkie.ts`, `sync.ts`, `autoSync.ts`) have no direct test coverage
- Files: `convex/accommodation.ts`, `convex/payments.ts`, `convex/tikkie.ts`
- Risk: Database logic bugs go undetected
- Priority: High

**No E2E tests:**

- What's not tested: Full user flows (login → dashboard → payment assignment) are untested
- Risk: Integration bugs between Next.js API routes and Convex are caught only in production
- Priority: Medium

**Stale tikkie-links tests:**

- What's not tested: The 868-line `tests/tikkie/tikkie-links.test.ts` tests Prisma mock behavior, not actual Convex logic
- Files: `tests/tikkie/tikkie-links.test.ts`
- Risk: False confidence — tests pass but don't validate production behavior
- Priority: High

---

_Concerns audit: 2026-03-30_
