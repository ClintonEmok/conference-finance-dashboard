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

_Concerns audit: 2026-03-30_
