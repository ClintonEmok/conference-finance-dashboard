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

## UX Concerns: Accommodation Module

### 1. User Flow for Adding Accommodation to an Event

**Step-by-step flow (current implementation):**

1. **Create inventory (global)**:
   - Navigate to `/dashboard/accommodation/inventory`
   - Click "Register Inventory" button
   - Step 1: Create Hotel (name, city) → Create & Continue
   - Step 2: Create Room Type Spec (label, capacity) → Save Template
   - Step 3: Provision Stock (select hotel, room type, quantity) → Sync Stock Block
   - Hotel exists in global inventory at `api.accommodation.hotels`

2. **Enable accommodation for event**:
   - Navigate to `/dashboard/events/[slug]?tab=settings`
   - Find "Accommodation Module" toggle (lines 845-886)
   - Enable it (this sets `event.accommodationEnabled = true`)

3. **Link hotel to event**:
   - Still on event settings page, find "Linked Hotels" section (lines 889-968)
   - Select hotel from dropdown → Click Add button
   - Uses `linkHotelToEvent` mutation

4. **Access event accommodation workspace**:
   - Navigate to `/dashboard/accommodation/[event-slug]`
   - Or click the "Accommodation" tab on event detail page (only visible when enabled)
   - Or go to `/dashboard/accommodation?eventId={eventId}`

5. **Manage room assignments**:
   - In the workspace, assign attendees to rooms
   - Track occupancy, view submissions

---

### 2. Where the UX is Confusing or Unclear

#### **CONFUSION #1: Two Separate Hotel-to-Event Linking Mechanisms**

**Location 1 - Event Settings** (`app/dashboard/events/[slug]/page.tsx` lines 246-260, 934-966):

```typescript
// Uses linkHotelToEvent mutation
await linkHotelToEvent({
  eventId: event._id,
  hotelId: selectedHotelId,
})
```

**Location 2 - Inventory Center** (`app/dashboard/accommodation/inventory/page.tsx` lines 211-240):

```typescript
// Uses attachHotelToEventByProviderId mutation (different mutation!)
await attachHotelToEventByProviderId({
  hotelId: activeHotelScopeId,
  eventProviderEventId: eventId,
})
```

**Problem**: The inventory page has a "Scope Reach Management" modal to link hotels to events, but it uses a different mutation (`attachHotelToEventByProviderId` vs `linkHotelToEvent`). This creates two parallel ways to do the same thing with no explanation of why.

---

#### **CONFUSION #2: No Visual Connection Between Creating Inventory and Linking to Events**

**Mental Model Users Need**: "Hotels exist globally. I create them once in Inventory, then link them to events in Event Settings."

**What UI Actually Shows**:

- Inventory page shows hotels with NO indication of which events they're linked to (until you open Scope Reach modal)
- Event settings shows linked hotels but doesn't indicate these hotels exist globally
- When you create a hotel in Inventory, there's no prompt to link it to an event
- When you link a hotel in Event Settings, there's no indication the hotel needs rooms provisioned first

**Gap**: Users can link a hotel with zero rooms to an event, making the link pointless but UI shows no warning.

---

#### **CONFUSION #3: Inventory Page "Scope Reach" vs Event Settings "Linked Hotels" Serve Same Purpose**

**Inventory Page** (`app/dashboard/accommodation/inventory/page.tsx` lines 675-748):

- "Scope Reach Management" modal
- Lists all available events with checkboxes
- Users check which events a hotel applies to

**Event Settings Page** (`app/dashboard/events/[slug]/page.tsx` lines 889-968):

- "Linked Hotels" section
- Dropdown to select hotels to add
- Users select which hotels to link to THIS event

**Problem**: These are two views of the SAME relationship (hotel ↔ event) but presented as completely separate features. A user managing inventory has no context of which events will use those hotels. A user setting up an event has no visibility into the hotel's rooms/capacity.

---

#### **CONFUSION #4: Hotel Must Have Rooms Before Being Useful, But No Enforcement**

**Flow**:

1. User creates hotel in Inventory (Step 1 of 3)
2. User can skip to linking hotel to event
3. User links hotel to event (now appears in event's accommodation tab)
4. But the hotel has NO rooms yet!

**Result**: Empty state in `app/dashboard/accommodation/[event-slug]/page.tsx`:

```tsx
// Lines 258-269
{eventHotels.length === 0 ? (
  <div className="flex flex-col items-center justify-center py-8 text-center">
    <Hotel className="mb-4 size-12 text-muted-foreground/50" />
    <p className="text-sm text-muted-foreground">
      No hotels linked yet. Add hotels to enable room assignments.
```

**But there's no warning when linking a hotel with 0 rooms!**

---

#### **CONFUSION #5: Event's Accommodation Tab vs Main Accommodation Page - Redundant**

**Event's Accommodation Tab** (`app/dashboard/events/[slug]/page.tsx` lines 1047-1085):

- Shows: hotels linked, total slots, submissions count
- Links to: `/dashboard/accommodation/${event.slug}` and `/dashboard/accommodation?eventId=${event._id}`

**Event Accommodation Page** (`app/dashboard/accommodation/[event-slug]/page.tsx`):

- Shows: same stats + quick actions
- Links to: Full workspace and Global Inventory

**Main Accommodation Page** (`/dashboard/accommodation`):

- Shows: room allocation workspace when eventId in URL
- Has: "Open stock" link to inventory

**Problem**: Users can end up in 3 different places that all show "accommodation" data for the same event. No clear "this is the main workspace" vs "this is a summary" distinction.

---

### 3. Mental Model vs UI Reality

| Mental Model                                 | UI Reality                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| "I set up accommodation for an event"        | Actually two separate steps: (1) create global inventory, (2) link inventory to event |
| "Hotels belong to events"                    | Hotels exist globally; they get "linked" to events as a separate action               |
| "A hotel has rooms"                          | Rooms exist globally too; hotel-room-type-room hierarchy is non-obvious               |
| "Inventory page manages what events can use" | Inventory page has NO event context; event settings has no inventory context          |
| "One place to manage all accommodation"      | 4+ pages with overlapping functionality                                               |

---

### Key File Locations

**Navigation:**

- `app/dashboard/dashboard-shell.tsx` lines 100-110 - Sidebar navigation for accommodation

**Event Settings (Hotel Linking):**

- `app/dashboard/events/[slug]/page.tsx` lines 845-886 - Accommodation toggle
- `app/dashboard/events/[slug]/page.tsx` lines 889-968 - Linked Hotels section

**Inventory Management:**

- `app/dashboard/accommodation/inventory/page.tsx` lines 528-673 - 3-step provisioning modal
- `app/dashboard/accommodation/inventory/page.tsx` lines 675-748 - Scope Reach Management modal

**Event Accommodation Pages:**

- `app/dashboard/accommodation/page.tsx` - Main room allocation workspace
- `app/dashboard/accommodation/[event-slug]/page.tsx` - Event-specific accommodation

**Convex Hooks:**

- `lib/convex/hooks/accommodation.ts` - All accommodation hooks
  - `useHotels()` - Global hotels
  - `useEventHotels(eventId)` - Hotels linked to specific event
  - `useLinkHotelToEvent()` - Event settings hotel linking
  - `useAttachHotelToEventByProviderId()` - Inventory hotel-to-event linking

---

## Additional Structural Issues (2026-03-31)

### Massive Frontend Page Components

**Issue:** Several page components exceed 500+ lines, mixing data fetching, state management, UI rendering, and business logic:

- `app/dashboard/accommodation/page.tsx` — **1,708 lines**
- `app/dashboard/events/[slug]/page.tsx` — **1,340 lines**
- `app/dashboard/accommodation/inventory/page.tsx` — **975 lines**
- `app/dashboard/page.tsx` — **664 lines**
- `app/dashboard/orders/[orderId]/page.tsx` — **595 lines**
- `app/dashboard/attendees/[attendeeId]/page.tsx` — **585 lines**
- `app/dashboard/settings/ticket-types/page.tsx` — **539 lines**
- `components/dashboard/event-tikkie-section.tsx` — **874 lines**

**Impact:** These files are unmaintainable. A single change to one feature may inadvertently affect another. No clear separation between UI components and data-fetching logic.

**Fix approach:** Extract sub-components into `components/dashboard/` or route-local `components/` directories. Move data-fetching hooks into `lib/convex/hooks/`.

### Widespread `any` Type Usage in Frontend

**Issue:** Over 160 instances of `any` in non-test, non-generated source files. Key offenders:

- `app/dashboard/events/[slug]/page.tsx` — ~15 `any` usages for hotel IDs, ticket types, event data (lines 265, 277, 292, 345, 380, 399, 405, 995, 1065, 1266, 1332)
- `app/dashboard/accommodation/[event-slug]/page.tsx` — ~10 `any` usages (lines 59, 71, 83, 98, 147, 159, 426)
- `app/dashboard/accommodation/inventory/page.tsx` — ~8 `any` usages in catch blocks and delete operations (lines 189, 227, 247, 273, 284, 286, 297, 299)
- `app/dashboard/events/[slug]/components/add-hotel-dialog.tsx` — `any` in form data (line 134)
- `app/dashboard/accommodation/[event-slug]/components/add-rooms-dialog.tsx` — `any` cast (line 128)

**Impact:** No type safety. Refactoring is risky. IDE autocomplete doesn't work.

**Fix approach:** Define proper types for all entities. Use `Id<"tableName">` for Convex document IDs.

### Duplicate Type Definitions

**Issue:** The same type concepts are defined in multiple places:

- `GenderType` is defined in `app/dashboard/page.tsx:60` and also exists in schema as `genderType`
- `RevenueResponse` type in `app/dashboard/page.tsx:25` duplicates the API response shape
- `CandidateOrder` type in `convex/orders.ts:216` duplicates the schema shape
- Payment match status enums are defined in both schema and `lib/types/payment.ts`

**Impact:** Types can drift. Changes to schema require manual updates to duplicated types.

**Fix approach:** Derive types from the Convex schema using `Doc<"tableName">` and `Id<"tableName">` from `_generated/dataModel`.

### Inconsistent ID Types in Schema

**Issue:** The schema uses `v.string()` for foreign key references in several tables, while using `v.id()` in others:

- `accommodationEventHotels.eventId` / `hotelId` — `v.string()` (lines 345-346) instead of `v.id()`
- `tikkiePaymentTemplates.eventId` — `v.string()` (line 354) instead of `v.id("events")`
- `accommodationRooms.hotelId` / `roomTypeId` — `v.string()` (lines 375-376) instead of `v.id()`
- `tikkiePaymentLinks.providerOrderId`, `orderId`, `eventId` — all `v.string()` (lines 389-392)
- `roomAllocations.eventId`, `roomId` — `v.string()` (lines 547-548)
- `attendeeFamilyGroups.primaryAttendeeId` — `v.string()` (line 498)
- `attendeeFamilyMembers.familyGroupId`, `attendeeId` — `v.string()` (lines 504-505)

**Impact:** No referential integrity. Cannot use `ctx.db.get()` directly — must normalize IDs manually. Queries are error-prone.

**Fix approach:** Migrate string IDs to proper `v.id()` types. This requires a data migration.

### Missing Metadata on Routes

**Issue:** No `metadata` exports found on any route pages. The root layout at `app/layout.tsx` has no `metadata` export either.

**Impact:** Poor SEO, no Open Graph tags, no proper page titles.

**Fix approach:** Add `metadata` export to root layout and key route pages.

### Missing Loading/Error Boundaries on Some Routes

**Issue:** Not all route segments have `loading.tsx` or `error.tsx`:

- `app/dashboard/events/` — no `loading.tsx` or `error.tsx`
- `app/dashboard/financial/` — has `loading.tsx` but no `error.tsx`
- `app/dashboard/integrations/` — has `loading.tsx` but no `error.tsx`
- `app/dashboard/settings/ticket-types/` — has `loading.tsx` but no `error.tsx`
- `app/dashboard/accommodation/[event-slug]/` — no `loading.tsx` or `error.tsx`
- `app/dashboard/accommodation/inventory/` — no `loading.tsx` or `error.tsx`
- `app/dashboard/reconciliation/payments/` — no `loading.tsx` or `error.tsx`

**Impact:** Users see blank screens or unhandled errors when these pages load slowly or fail.

**Fix approach:** Add `loading.tsx` and `error.tsx` to all route segments.

### Client-Side Data Fetching via Raw `fetch` in Dashboard Page

**Issue:** `app/dashboard/page.tsx` uses raw `fetch` calls to custom API routes (`/api/dashboard/revenue`, `/api/dashboard/attendees`) instead of using Convex's reactive subscriptions.

**Impact:** No real-time updates. Manual loading/error state management. No abort handling beyond the controller pattern. More code to maintain.

**Fix approach:** Use `useQuery` from Convex for reactive data, or at least consolidate into a custom hook.

### N+1 Query Pattern in Order Ledger

**Issue:** `convex/orders.ts:103-112` — `getOrderLedger` fetches all orders for an event, then for each order makes a separate query to fetch attendees:

```typescript
const ordersWithAttendees = await Promise.all(
  visibleOrders.map(async (order) => {
    const attendees = await ctx.db
      .query("ticketTailorAttendees")
      .withIndex("orderId", (q) => q.eq("orderId", order._id))
      .take(100)
    return { ...order, attendees }
  })
)
```

**Impact:** With 100 orders, this executes 101 database queries. Convex batches these, but it still reads far more data than needed.

**Fix approach:** Fetch all attendees for the event in one query, then group by orderId in JavaScript.

### Repeated Full Event Table Scans

**Issue:** `convex/orders.ts:336-348` — `loadEventNamesById` and `loadEventSlugsById` each independently scan the entire events table. They're called together in `getOrdersWithFilters` and `getOrdersForReconciliation`.

**Impact:** Two full table scans when one would suffice.

**Fix approach:** Combine into a single function that returns both maps.

### Debug Logging Left in Production Code

**Issue:** `convex/sync.ts:44` contains a `console.log` statement that logs auth identity on every sync run start:

```typescript
console.log("server identity", await ctx.auth.getUserIdentity())
```

**Impact:** Exposes authentication details in logs. Adds unnecessary log volume.

**Fix approach:** Remove this line.

### Unprotected Signup Submission Endpoint

**Issue:** `app/api/signup/submit/route.ts` accepts submissions with only honeypot validation. No CSRF protection, no rate limiting, no CAPTCHA.

**Impact:** Vulnerable to automated spam submissions.

**Fix approach:** Add rate limiting per IP, consider CAPTCHA for high-volume events.

### Sensitive Data in `providerPayload` Fields

**Issue:** Multiple tables store raw API responses in `v.any()` fields (`rawPayload`, `providerPayload`). These may contain sensitive data like API keys, tokens, or PII.

**Impact:** Sensitive data is persisted in the database without encryption.

**Fix approach:** Sanitize payloads before storage. Remove sensitive fields. Consider encrypting stored payloads.

### `shadcn` as a Runtime Dependency

**Issue:** `package.json` lists `"shadcn": "^4.0.8"` as a runtime dependency. shadcn is a CLI tool for generating components, not a runtime library.

**Impact:** Unnecessary bundle size. Should be a devDependency.

**Fix approach:** Move `shadcn` to `devDependencies`.

### No Testing Framework for Convex

**Issue:** The project uses Vitest for testing, but there's no Convex testing setup (no `convex-test` package). Convex functions are tested indirectly via API routes.

**Impact:** Cannot unit test Convex mutations and queries in isolation.

**Fix approach:** Add `convex-test` package for isolated Convex function testing.

### Unused `proxy.ts` at Project Root

**Issue:** `proxy.ts` exists at the project root with no imports from any source file.

**Impact:** Dead code. May be a leftover from development.

**Fix approach:** Remove if unused, or document its purpose.

### Duplicate `lib/convex/hooks/` and Route-Local Hook Files

**Issue:** Convex hooks exist in both:

- `lib/convex/hooks/accommodation.ts`
- `app/dashboard/events/[slug]/components/accommodation-hooks.ts`

**Impact:** Confusion about which hooks to use. Potential for inconsistent behavior.

**Fix approach:** Consolidate into `lib/convex/hooks/` and remove route-local duplicates.

### Missing Error Boundaries at Component Level

**Issue:** No React Error Boundary components found. The global `app/global-error.tsx` handles fatal errors, but individual components (tables, forms, charts) have no fallback UI.

**Impact:** A single component crash can take down the entire page.

**Fix approach:** Add Error Boundary wrappers around complex components like data tables and forms.

## Missing Indexes on Frequently Queried Fields

**Issue:** Several schema fields are queried but lack indexes or queries don't use them:

- `ticketTailorOrders.eventId` — the field is typed as `v.union(v.id("events"), v.string())` (schema line 254), but the index `by_eventId` expects consistent types. Some orders have string eventIds that won't match the index
- `ticketTailorAttendees.providerAttendeeId` — queried in upsert but the composite index `providerEventOrder` doesn't include it, forcing a `.collect()` then `.filter()` pattern

**Impact:** Queries fall back to full table scans filtered in JavaScript, wasting read operations.

**Fix approach:** Add missing indexes. Ensure field types are consistent (not `v.union(v.id(), v.string())` for indexed fields).

## CRITICAL SECURITY FINDINGS (2026-03-31 Deep Audit)

### CRITICAL: Unprotected Public Convex Queries Expose Financial Data

**Issue:** Multiple Convex queries are `public` (no `requireIdentity` check) and return sensitive financial data including orders, payments, attendees, and revenue.

**Files:**

- `convex/orders.ts` — `getOrders` (line 20), `getOrderById` (line 61), `getOrdersWithFilters` (line 350), `getOrderPaymentStatus` (line 617)
- `convex/payments.ts` — `getPayments` (line 12), `getPaymentSummary` (line 344)
- `convex/tikkie.ts` — `getPaymentLinks` (line 50), `getPaymentLinkByToken` (line 72)
- `convex/attendees.ts` — `getAttendees` (line 42), `getAttendeeByEmail` (line 107)
- `convex/events.ts` — `getEvents` (line 14), `getEventsForLedger` (line 62)
- `convex/accommodation.ts` — `getRoomAllocationBoard` (line 220), `getRoomsWithDetails` (line 696), `listAccommodationInventory` (line 734)
- `convex/sync.ts` — `getWebhookEvents` (line 117), `getPendingWebhookEvents` (line 517)

**Impact:** Any user with the Convex URL can query all financial data — orders, payment amounts, attendee PII (names, emails, phones), accommodation assignments. The Next.js API routes do enforce auth via `requireApiUser()` from `@/lib/auth/server.ts`, but the Convex functions themselves are directly callable from any client that knows the deployment URL.

**Fix approach:** Add `requireIdentity(ctx)` to all queries that return sensitive data. For queries that must remain public (e.g., event listing), ensure they only return non-sensitive data.

### CRITICAL: No Webhook Signature Verification for Ticket Tailor in Production

**Issue:** The Ticket Tailor webhook verification in `lib/integrations/ticket-tailor/webhook.ts` requires `TICKET_TAILOR_WEBHOOK_SECRET` env var, but this variable is not present in `.env.example` or `.env`. Without it, `verifyTicketTailorWebhook` always returns `false`, meaning all webhooks are rejected.

**Files:**

- `lib/integrations/ticket-tailor/webhook.ts` (lines 69-98) — `verifyTicketTailorWebhook` returns `false` if `TICKET_TAILOR_WEBHOOK_SECRET` is not set
- `.env.example` — missing `TICKET_TAILOR_WEBHOOK_SECRET`
- `.env` — missing `TICKET_TAILOR_WEBHOOK_SECRET`

**Impact:** If `TICKET_TAILOR_WEBHOOK_SECRET` is not configured, ALL Ticket Tailor webhooks are silently rejected (401). The app falls back to cron-based polling every 15 minutes, but real-time webhook processing is broken.

**Fix approach:** Add `TICKET_TAILOR_WEBHOOK_SECRET` to `.env.example` and document how to configure it in the Ticket Tailor dashboard.

### HIGH: No Webhook Replay Protection for Tikkie

**Issue:** The Tikkie webhook handler (`app/api/webhooks/tikkie/route.ts`) verifies HMAC signatures but does not implement timestamp-based replay protection. An intercepted webhook could be replayed.

**Files:**

- `app/api/webhooks/tikkie/route.ts` (lines 36-97)
- `lib/integrations/tikkie/webhook.ts` (lines 92-119) — `verifyTikkieWebhook` only checks HMAC

**Impact:** An attacker who captures a valid Tikkie webhook could replay it to trigger duplicate payment status updates or payment link status changes.

**Fix approach:** Add a timestamp check in the webhook signature payload (if Tikkie supports it) or implement nonce tracking in the `tikkiePaymentLinkTransitions` table to detect duplicate notifications.

### HIGH: Financial Amounts Accept Negative Values

**Issue:** All monetary fields use `v.number()` with no range constraints. Negative amounts could be inserted through mutations.

**Files:**

- `convex/schema.ts` — all `amountMinor`, `totalAmountMinor`, `priceMinor` fields are `v.number()` with no constraints
- `convex/payments.ts:89` — `amountMinor: v.number()` — accepts negative values
- `convex/tikkie.ts:100` — `amountMinor: v.number()` — accepts negative values
- `convex/orders.ts:135` — `totalAmountMinor: v.optional(v.number())` — accepts negative values

**Impact:** Negative amounts could be inserted, potentially creating fraudulent credits or refunds.

**Fix approach:** Add validation in mutation handlers to ensure `amountMinor >= 0`. Consider adding a maximum reasonable amount check.

### HIGH: No Audit Trail for Financial Mutations

**Issue:** While payment transitions are tracked (`tikkiePaymentLinkTransitions`), there is no comprehensive audit trail for financial operations. Key mutations like `createPayment`, `assignPaymentToOrder`, `updateOrderStatus`, and `removeOrderLocally` do not log who performed the action or when.

**Files:**

- `convex/payments.ts:82` — `createPayment` — no audit log
- `convex/payments.ts:253` — `assignPaymentToOrder` — stores `matchedBy` but no full audit record
- `convex/orders.ts:724` — `removeOrderLocally` — stores `removedAt` and `removedReason` but no audit trail
- `convex/orders.ts:194` — `updateOrderStatus` — no audit log

**Impact:** In a finance application, the inability to trace who changed what and when is a compliance and security risk.

**Fix approach:** Create an `auditLog` table and insert records for all financial mutations. Include `userId`, `action`, `entityType`, `entityId`, `beforeState`, `afterState`, and `timestamp`.

### HIGH: Race Condition in Room Assignment

**Issue:** `convex/accommodation.ts` — `assignRoomToAttendee` (line 1050) and `assignAttendeeToRoom` (line 1122) check room capacity by counting existing assignments, then patch. Between the check and the patch, another concurrent mutation could assign the same room.

**Files:**

- `convex/accommodation.ts` (lines 1105-1116) — capacity check then patch, not atomic

**Impact:** Overbooking of rooms — more attendees assigned than the room's capacity allows.

**Fix approach:** Use Convex's transactional guarantees by performing the check and write in a single mutation. Or use a counter field on the room document that is atomically incremented.

### MEDIUM: No Zod Validation Library Used Anywhere

**Issue:** The codebase has no Zod (or equivalent) validation library. All validation relies on Convex's `v` validators and manual `typeof` checks.

**Files:**

- All API routes — no zod imports found
- `lib/types/*.ts` — only Convex `v` validators

**Impact:** Manual validation is error-prone and inconsistent. Different API routes use different patterns for parsing and validating input (compare `app/api/payments/cash/route.ts` vs `app/api/dashboard/tikkie-links/route.ts`).

**Fix approach:** Introduce Zod for API route validation. Keep Convex `v` validators for Convex function args (they're required there), but add Zod schemas at the API route boundary.

### MEDIUM: Sensitive Data in `providerPayload` Fields

**Issue:** Multiple tables store raw API responses in `v.any()` fields (`rawPayload`, `providerPayload`). These may contain sensitive data like API keys, tokens, or PII.

**Files:**

- `convex/schema.ts` — `ticketTailorOrders.rawPayload`, `ticketTailorAttendees.rawPayload`, `ticketTailorAttendees.customAnswers`, `tikkiePayments.providerPayload`, `payments.providerPayload`, `ticketTailorWebhookEvents.payload`

**Impact:** Sensitive data is persisted in the database without encryption.

**Fix approach:** Sanitize payloads before storage. Remove sensitive fields. Consider encrypting stored payloads.

### MEDIUM: Auto-Match Logic Is Fragile (Name-Only Matching)

**Issue:** Payment auto-matching in `convex/tikkie.ts:494` and `convex/payments.ts:290` matches payments to orders by comparing normalized buyer/payer names. This is fragile — typos, different name formats, or common names could cause incorrect matches.

**Files:**

- `convex/tikkie.ts` (lines 535-547) — matches on `buyerName?.toLowerCase() === payment.payerName.toLowerCase()`
- `convex/payments.ts` (lines 322-337) — matches on name + exact amount, but still fragile

**Impact:** Incorrect payment-to-order matching could lead to financial reconciliation errors.

**Fix approach:** Add additional matching criteria (e.g., email, order reference in payment description). Flag ambiguous matches for manual review rather than auto-assigning.

### MEDIUM: No CSRF Protection on API Routes

**Issue:** The API routes use Clerk session cookies for authentication but do not implement CSRF token validation.

**Files:**

- All API routes in `app/api/` — no CSRF token checks

**Impact:** If the application uses cookie-based auth (not just Bearer tokens), CSRF attacks are possible. Clerk's default setup may mitigate this, but it should be verified.

**Fix approach:** Verify Clerk's CSRF protection is enabled. If using custom cookie auth, add CSRF tokens.

### MEDIUM: Missing TIKKIE_WEBHOOK_SECRET in .env

**Issue:** `.env` does not contain `TIKKIE_WEBHOOK_SECRET`, but `.env.example` (line 24) and `.env.prod.example` (line 22) both list it as required. Without it, Tikkie webhook verification always fails.

**Files:**

- `.env` — missing `TIKKIE_WEBHOOK_SECRET`
- `lib/integrations/tikkie/webhook.ts:93` — returns `false` if secret is not set

**Impact:** Tikkie webhooks will never be verified, meaning either they're silently rejected or the app falls back to polling only.

**Fix approach:** Add `TIKKIE_WEBHOOK_SECRET` to `.env` with the value from the Tikkie dashboard.

### LOW: No Input Sanitization for User-Generated Content

**Issue:** User-submitted fields like `notes`, `bookerName`, `dietaryRestrictions`, `roommatePreference`, etc. are stored directly without sanitization.

**Files:**

- `convex/signupSubmission.ts` — all string fields stored as-is
- `convex/accommodation.ts` — `notes` fields stored as-is

**Impact:** If any frontend component renders these fields using `dangerouslySetInnerHTML` or similar, XSS is possible. No `dangerouslySetInnerHTML` usage was found in the codebase, which is good, but this should be enforced.

**Fix approach:** Add input sanitization at the API/mutation boundary. Ensure all frontend rendering uses React's default escaping (no `dangerouslySetInnerHTML`).

### LOW: Convex .env File Missing RESEND_API_KEY

**Issue:** `.env.example` (line 34) lists `RESEND_API_KEY` as required for the email component, but `.env` does not include it.

**Files:**

- `.env.example` (line 34)
- `.env` — missing `RESEND_API_KEY`
- `convex/email.ts` (lines 10-12) — Resend component initialized

**Impact:** Email sending will fail silently or throw errors when triggered.

**Fix approach:** Add `RESEND_API_KEY` to `.env` and ensure it's configured in the Convex dashboard environment variables.

---

_Concerns audit: 2026-03-30 (original), 2026-03-31 (additional findings + deep security audit)_
