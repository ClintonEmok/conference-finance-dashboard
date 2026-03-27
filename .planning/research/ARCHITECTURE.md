# Architecture Research: Dual-Source Events

**Domain:** Conference finance dashboard with dual event sources (integration + internal)
**Researched:** 2026-03-27
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          PUBLIC ROUTES                               │
│  /events (listing)  /events/[slug] (detail + signup)                 │
│  ┌─────────────┐    ┌──────────────────┐    ┌──────────────────┐     │
│  │ Event List  │    │  Event Detail    │    │  Signup Form     │     │
│  │ (server)    │───>│  (server)        │───>│  (client action) │     │
│  └──────┬──────┘    └────────┬─────────┘    └────────┬─────────┘     │
│         │                   │                        │               │
├─────────┴───────────────────┴────────────────────────┴───────────────┤
│                       DASHBOARD ROUTES (Clerk auth)                  │
│  /dashboard/events (list)  /dashboard/events/[id] (manage)           │
│  ┌──────────────┐   ┌────────────────┐   ┌──────────────────┐       │
│  │ Events List  │   │ Event Editor   │   │ Event Analytics  │       │
│  └──────┬───────┘   └───────┬────────┘   └────────┬─────────┘       │
│         │                   │                      │                 │
├─────────┴───────────────────┴──────────────────────┴─────────────────┤
│                      SOURCE-AGNOSTIC READ LAYER                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │   Unified Events API (convex/events.ts — extended)           │    │
│  │   getPublicEvents · getEventBySlug · getEventsForDashboard   │    │
│  └──────────────────────────┬───────────────────────────────────┘    │
│                             │                                        │
├─────────────────────────────┴────────────────────────────────────────┤
│                         DATA LAYER (Convex)                          │
│  ┌──────────────┐   ┌──────────────────┐   ┌─────────────────────┐  │
│  │ events (new) │   │ ticketTailor     │   │ ticketTailor        │  │
│  │ unified +    │   │ Events (raw)     │   │ Orders/Attendees    │  │
│  │ internal     │   │ stays as-is      │   │ FK → events._id     │  │
│  └──────────────┘   └──────────────────┘   └─────────────────────┘  │
│                                                                      │
│  ┌──────────────────┐   ┌──────────────────┐                        │
│  │ eventSignups     │   │ internalEvent    │                        │
│  │ (new)            │   │ TicketTypes (new)│                        │
│  └──────────────────┘   └──────────────────┘                        │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component                  | Responsibility                              | Implementation                                |
| -------------------------- | ------------------------------------------- | --------------------------------------------- |
| `events` table             | Canonical event records from any source     | New Convex table with `source` discriminator  |
| `ticketTailorEvents`       | Raw Ticket Tailor import buffer (unchanged) | Existing table, no schema changes             |
| `eventSignups`             | Public signup registrations                 | New Convex table                              |
| `internalEventTicketTypes` | Ticket type config for internal events      | New Convex table                              |
| Public route layer         | Unauthenticated event discovery + signup    | New Next.js App Router pages under `/events/` |
| Dashboard event pages      | Authenticated event CRUD + analytics        | New pages under `/dashboard/events/`          |
| Event sync adapter         | Syncs integration events → canonical events | New Convex mutation, extends `sync.ts`        |

## Recommended Project Structure

```
app/
├── events/                          # NEW — public event pages
│   ├── layout.tsx                   # Public layout (no Clerk, no dashboard shell)
│   ├── page.tsx                     # Event listing (server component)
│   └── [eventSlug]/
│       ├── page.tsx                 # Event detail + signup form
│       └── confirmation/
│           └── page.tsx             # Post-signup confirmation
├── dashboard/
│   └── events/                      # NEW — internal event management
│       ├── page.tsx                 # Events list (all sources)
│       └── [eventId]/
│           └── page.tsx             # Edit event, view signups
convex/
├── schema.ts                        # MODIFIED — add events, eventSignups, internalEventTicketTypes
├── events.ts                        # MODIFIED — add unified queries, internal CRUD, source-aware reads
├── eventSignups.ts                  # NEW — signup mutations and queries
└── internalEvents.ts                # NEW — internal event CRUD mutations
lib/
├── domain/
│   └── events/                      # NEW
│       ├── types.ts                 # Source-agnostic event types
│       ├── public-events.ts         # Public read model (server-side)
│       └── internal-events.ts       # Internal event business logic
├── convex/
│   └── hooks/
│       └── events.ts                # MODIFIED — add hooks for unified queries
app/
└── api/
    └── events/                      # NEW — public API routes
        └── [eventId]/
            └── signup/
                └── route.ts         # POST signup (rate-limited, no auth)
```

### Structure Rationale

- **`app/events/` separate from `app/dashboard/`:** Public pages have NO auth, no dashboard shell, different layout. Keeping them in a separate top-level route group prevents accidental auth leakage and lets us apply different middleware.
- **`convex/events.ts` extended (not replaced):** Existing queries (`getEvents`, `getEventById`, `getEventByProviderId`) continue to work unchanged. New queries added alongside for unified/source-aware access.
- **`lib/domain/events/` follows existing pattern:** The codebase already uses `lib/domain/finance/` for server-side read models consumed by API routes. The events domain follows the same pattern.
- **`ticketTailorEvents` kept as-is:** This is a raw import buffer with provider-specific fields. Changing it would break the sync pipeline. The new `events` table is the canonical layer on top.

## Architectural Patterns

### Pattern 1: Canonical Event Table with Source Discriminator

**What:** A single `events` table holds event records from all sources, distinguished by a `source` field (`"ticket_tailor"` | `"internal"`). Integration events sync from the provider-specific table into the canonical table. Internal events write directly to the canonical table.

**When to use:** When you need source-agnostic reads (finance dashboard, public pages) but the sources have different write paths and different data shapes.

**Trade-offs:**

- Pro: Finance/orders/attendees can reference one `eventId` regardless of source
- Pro: Public pages don't need to know about sources
- Con: Data duplication between `ticketTailorEvents` and `events` for integration events
- Con: Sync adapter must keep the two in sync

**Schema:**

```typescript
events: defineTable({
  // Identity
  slug: v.string(), // URL-safe, unique — used in public routes
  name: v.string(),
  source: v.union(v.literal("ticket_tailor"), v.literal("internal")),

  // Timing
  startsAt: v.optional(v.number()),
  endsAt: v.optional(v.number()),
  timezone: v.optional(v.string()),

  // Finance
  currency: v.optional(v.string()),

  // Source linkage (conditional)
  providerEventId: v.optional(v.string()), // Set for ticket_tailor source

  // Public visibility
  isPublic: v.boolean(), // Controls /events listing
  description: v.optional(v.string()),
  location: v.optional(v.string()),
  bannerUrl: v.optional(v.string()),

  // Internal event config
  maxCapacity: v.optional(v.number()),
  registrationDeadline: v.optional(v.number()),

  // Metadata
  createdBy: v.optional(v.string()), // userId for internal events
})
  .index("slug", ["slug"])
  .index("source", ["source"])
  .index("source_provider", ["source", "providerEventId"])
  .index("isPublic_startsAt", ["isPublic", "startsAt"])
```

**Data flow:**

```
Ticket Tailor API
      ↓ (sync)
ticketTailorEvents (raw import)
      ↓ (sync adapter — new mutation)
events table (source: "ticket_tailor")
      ↑ (direct insert)
Operator creates internal event
      ↓
events table (source: "internal")
```

### Pattern 2: Source-Agnostic Read Models

**What:** Query functions in `convex/events.ts` that accept a `source` filter but default to returning all sources. Finance and public pages use the same queries without source awareness.

**When to use:** When downstream consumers (dashboard, public pages, finance reports) should work identically regardless of event source.

**Trade-offs:**

- Pro: Finance dashboard automatically includes internal events in reports
- Pro: Public listing shows both sources without conditional logic
- Con: Must maintain the sync adapter for integration events to flow into canonical table

**Example — Convex queries:**

```typescript
// Returns events from ALL sources (finance dashboard, public pages)
export const getPublicEvents = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("events")
      .withIndex("isPublic_startsAt", (q) => q.eq("isPublic", true))
      .order("asc")
      .take(args.limit ?? 50)
  },
})

// Source-aware for dashboard filtering
export const getEventsBySource = query({
  args: {
    source: v.optional(
      v.union(v.literal("ticket_tailor"), v.literal("internal"))
    ),
  },
  handler: async (ctx, args) => {
    if (args.source) {
      return await ctx.db
        .query("events")
        .withIndex("source", (q) => q.eq("source", args.source!))
        .collect()
    }
    return await ctx.db.query("events").collect()
  },
})

// Lookup by slug for public pages
export const getEventBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("events")
      .withIndex("slug", (q) => q.eq("slug", args.slug))
      .collect()
    return results[0] ?? null
  },
})
```

**Example — Server-side read model (lib/domain/events/public-events.ts):**

```typescript
import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"

export async function getPublicEventListing() {
  const events = await convexQuery(api.events.getPublicEvents, { limit: 50 })
  return events.map((event) => ({
    slug: event.slug,
    name: event.name,
    startsAt: event.startsAt ? new Date(event.startsAt).toISOString() : null,
    location: event.location ?? null,
    source: event.source,
    // Source is invisible to the public page consumer
  }))
}
```

### Pattern 3: Public Page Isolation (No Auth, Different Layout)

**What:** Public event pages live in `app/events/` with their own `layout.tsx` that does NOT wrap in ClerkProvider or DashboardShell. Auth is handled at the route level via Next.js App Router layout scoping.

**When to use:** Any time you need unauthenticated pages alongside authenticated ones in the same Next.js app.

**Trade-offs:**

- Pro: Clean auth boundary — impossible to accidentally expose dashboard data
- Pro: Public pages are fast (no auth token exchange)
- Con: Can't use ConvexProviderWithClerk for public pages (needs unauthenticated Convex access)

**Implementation:**

```
app/
├── layout.tsx              # Root layout: ClerkProvider + ConvexClientProvider (always)
├── events/
│   ├── layout.tsx          # Public layout: NO auth checks, public shell
│   └── page.tsx            # Server component, uses convexQuery() without auth token
├── dashboard/
│   ├── layout.tsx          # Dashboard layout: requirePageUser() + DashboardShell
│   └── page.tsx            # Protected content
```

**Key insight:** The root `app/layout.tsx` already wraps everything in `ClerkProvider` and `ConvexClientProvider`. Public pages can still use Convex — Clerk simply won't have an active user. Convex queries that don't call `ctx.auth.getUserIdentity()` will work fine without auth.

**Convex side — public queries must NOT require auth:**

```typescript
// Public query — no auth check, returns only isPublic=true events
export const getPublicEvents = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // No ctx.auth call — accessible without authentication
    return await ctx.db
      .query("events")
      .withIndex("isPublic_startsAt", (q) => q.eq("isPublic", true))
      .order("asc")
      .take(args.limit ?? 50)
  },
})
```

**Auth boundary enforcement:**

- `app/events/` pages: No `requirePageUser()` call. Public Convex queries used.
- `app/dashboard/` layout: `requirePageUser()` already enforced (existing).
- API routes for signup: No `requireApiUser()` — public endpoint with rate limiting.
- API routes for internal event CRUD: `requireApiUser()` enforced (existing pattern).

### Pattern 4: Integration Sync Adapter

**What:** After Ticket Tailor sync populates `ticketTailorEvents`, a second step syncs matching records into the canonical `events` table. This adapter creates/updates the canonical event and links via `providerEventId`.

**When to use:** When integration data flows into a raw table but you need a canonical representation for cross-source features.

**Trade-offs:**

- Pro: Existing sync pipeline completely untouched
- Pro: Can add additional transformation/filtering at the canonical layer
- Con: Two-step sync adds latency
- Con: Must handle drift between raw and canonical tables

**Implementation (new mutation in convex/events.ts):**

```typescript
export const syncIntegrationEvent = mutation({
  args: {
    providerEventId: v.string(),
    name: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    timezone: v.optional(v.string()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const slug = generateSlug(args.name ?? args.providerEventId)

    // Upsert into canonical events table
    const existing = await ctx.db
      .query("events")
      .withIndex("source_provider", (q) =>
        q
          .eq("source", "ticket_tailor")
          .eq("providerEventId", args.providerEventId)
      )
      .collect()

    const canonicalFields = {
      slug,
      name: args.name ?? args.providerEventId,
      source: "ticket_tailor" as const,
      providerEventId: args.providerEventId,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      timezone: args.timezone,
      currency: args.currency,
      isPublic: false, // Integration events hidden by default
    }

    if (existing[0]) {
      await ctx.db.patch("events", existing[0]._id, canonicalFields)
      return existing[0]._id
    }

    return await ctx.db.insert("events", canonicalFields)
  },
})
```

**Integration point with existing sync:** The `runTicketTailorSync()` function in `lib/integrations/ticket-tailor/sync.ts` currently calls `api.sync.upsertTicketTailorEvent`. After that call, add a second call to `api.events.syncIntegrationEvent` to populate the canonical table. This is a non-breaking additive change.

## Data Flow

### Flow 1: Integration Event Sync (existing pipeline extended)

```
Ticket Tailor API
      ↓
fetchTicketTailorEventsPaginated()
      ↓
convex sync.upsertTicketTailorEvent    ← UNCHANGED (populates ticketTailorEvents)
      ↓
convex events.syncIntegrationEvent     ← NEW (populates canonical events table)
      ↓
events table (source: "ticket_tailor", providerEventId: "tt_123")
```

### Flow 2: Internal Event Creation

```
Operator fills form (/dashboard/events/new)
      ↓
POST /api/dashboard/events             ← NEW API route (auth required)
      ↓
convex events.createInternalEvent      ← NEW mutation
      ↓
events table (source: "internal", slug: "summer-conference-2026")
```

### Flow 3: Public Event Discovery

```
Visitor lands on /events
      ↓
Server component fetches convexQuery(events.getPublicEvents)
      ↓
Renders event cards (name, date, location)
      ↓
User clicks → /events/[slug]
      ↓
Server component fetches convexQuery(events.getEventBySlug, { slug })
      ↓
Renders event detail + signup form
```

### Flow 4: Public Signup

```
Visitor fills signup form on /events/[slug]
      ↓
POST /api/events/[eventId]/signup      ← NEW public API route (rate-limited)
      ↓
convex eventSignups.createSignup       ← NEW mutation
      ↓
eventSignups table
      ↓
Redirect to /events/[slug]/confirmation
```

### Flow 5: Finance Dashboard (source-agnostic)

```
Dashboard loads /dashboard
      ↓
GET /api/dashboard/revenue?eventId=...  ← EXISTING route
      ↓
lib/domain/finance/order-ledger.ts      ← EXISTING code
      ↓
convex events.getEventsForLedger        ← MODIFIED to include events from all sources
      ↓
Returns revenue for BOTH integration and internal events
```

## Integration Points

### Existing Code That Must Be Modified

| File                                     | Change                                                              | Risk                                                 |
| ---------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| `convex/schema.ts`                       | Add `events`, `eventSignups`, `internalEventTicketTypes` tables     | LOW — additive only                                  |
| `convex/events.ts`                       | Add unified queries, internal CRUD mutations                        | LOW — existing queries untouched                     |
| `convex/orders.ts`                       | `getOrdersWithFilters` should join against `events` table for names | MEDIUM — must handle events without canonical record |
| `lib/convex/hooks/events.ts`             | Add hooks for `getPublicEvents`, `getEventBySlug`                   | LOW — additive                                       |
| `lib/integrations/ticket-tailor/sync.ts` | After `upsertTicketTailorEvent`, call `syncIntegrationEvent`        | MEDIUM — must not break existing sync                |

### Existing Code That Stays Untouched

| File                                   | Why                                                   |
| -------------------------------------- | ----------------------------------------------------- |
| `convex/sync.ts`                       | Raw Ticket Tailor import pipeline — no changes needed |
| `lib/integrations/tikkie/*`            | Payment flow is orthogonal to event source            |
| `lib/domain/finance/reconciliation.ts` | Works on orders/attendees, not events directly        |
| `app/dashboard/layout.tsx`             | Auth boundary already correct                         |
| `lib/auth/server.ts`                   | Auth helpers reused as-is                             |
| `convex/auth.config.ts`                | Clerk config unchanged                                |

### New Files That Must Be Created

| File                                           | Purpose                                                     |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `convex/eventSignups.ts`                       | Signup CRUD mutations and queries                           |
| `convex/internalEvents.ts`                     | Internal event business logic (validation, slug generation) |
| `lib/domain/events/types.ts`                   | Shared event type definitions                               |
| `lib/domain/events/public-events.ts`           | Server-side read model for public pages                     |
| `lib/domain/events/internal-events.ts`         | Server-side write model for internal events                 |
| `app/events/layout.tsx`                        | Public layout (no auth shell)                               |
| `app/events/page.tsx`                          | Event listing page                                          |
| `app/events/[eventSlug]/page.tsx`              | Event detail + signup page                                  |
| `app/events/[eventSlug]/confirmation/page.tsx` | Post-signup confirmation                                    |
| `app/dashboard/events/page.tsx`                | Dashboard events management list                            |
| `app/dashboard/events/[eventId]/page.tsx`      | Dashboard event editor                                      |
| `app/api/events/[eventId]/signup/route.ts`     | Public signup API endpoint                                  |
| `app/api/dashboard/events/route.ts`            | Authenticated event CRUD API                                |
| `app/api/dashboard/events/[eventId]/route.ts`  | Authenticated single-event API                              |

## Anti-Patterns

### Anti-Pattern 1: Putting Internal Events in `ticketTailorEvents`

**What people do:** Add internal events to `ticketTailorEvents` with a fake `providerEventId` or a `source` field on that table.

**Why it's wrong:** `ticketTailorEvents` is a raw import buffer with provider-specific semantics. Mixing internal events there contaminates the import pipeline, confuses the sync logic, and couples internal event creation to a table designed for webhook/sync ingestion.

**Do this instead:** Create a separate canonical `events` table. Integration events sync into it. Internal events write to it directly. The `ticketTailorEvents` table stays as a pure import buffer.

### Anti-Pattern 2: Auth Middleware for Public Pages

**What people do:** Apply `requirePageUser()` to the `/events` layout or try to gate public pages behind Clerk.

**Why it's wrong:** Public signup pages must be accessible to anyone. Requiring login destroys the signup funnel and adds unnecessary auth token overhead.

**Do this instead:** Keep `/events/` outside the `/dashboard/` layout scope. The dashboard layout already calls `requirePageUser()`. Public pages simply don't call it. Convex queries used by public pages must not call `ctx.auth.getUserIdentity()`.

### Anti-Pattern 3: Source-Aware Code in Finance Layer

**What people do:** Add `if (event.source === "internal")` branches in finance, reconciliation, or reporting code.

**Why it's wrong:** The whole point of a canonical events table is to make downstream code source-agnostic. Source-specific logic in the finance layer means every new source requires touching finance code.

**Do this instead:** Finance code references `events._id` — full stop. Source awareness lives in the events layer (sync adapter, CRUD mutations). Finance code never checks source.

### Anti-Pattern 4: One Convex Query for Both Public and Dashboard

**What people do:** Create a single `getEvents` query that returns different fields based on auth state.

**Why it's wrong:** Convex queries don't have middleware. You'd need to check `ctx.auth.getUserIdentity()` inside the query and conditionally filter, which is fragile and conflates access control with data retrieval.

**Do this instead:** Separate queries: `getPublicEvents` (always returns only `isPublic=true`, no auth check) and `getEventsForDashboard` (auth-gated, returns all fields). The public query has a smaller return shape and stricter filtering.

## Scaling Considerations

| Scale              | Architecture Adjustments                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| <50 events         | Current approach is fine. Canonical `events` table stays small. No index concerns.                                    |
| 50-500 events      | Add pagination to public listing (`paginationOpts`). The `isPublic_startsAt` index handles this well.                 |
| 500+ events        | Consider search index on `name` + `description` for public discovery. Convex supports `.withSearchIndex()`.           |
| High signup volume | `eventSignups` table should be indexed by `eventId` + `createdAt`. Consider batch processing for email notifications. |

### Scaling Priorities

1. **First bottleneck:** Public event listing at scale — solved by the `isPublic_startsAt` index and pagination
2. **Second bottleneck:** Signup form abuse — solved by rate limiting on the public API route (Next.js middleware or Vercel edge config)

## Build Order (Dependency-Aware)

### Phase 1: Schema Foundation

**Depends on:** Nothing (all additive)
**Risk:** LOW

1. Add `events` table to `convex/schema.ts`
2. Add `eventSignups` table to `convex/schema.ts`
3. Add `internalEventTicketTypes` table to `convex/schema.ts`
4. Deploy schema migration

### Phase 2: Canonical Event Queries + Internal CRUD

**Depends on:** Phase 1
**Risk:** LOW

5. Add unified queries to `convex/events.ts` (`getPublicEvents`, `getEventBySlug`, `getEventsBySource`, `getEventsForLedger` modified)
6. Add internal event mutations to `convex/events.ts` (`createInternalEvent`, `updateInternalEvent`, `deleteInternalEvent`)
7. Add `convex/eventSignups.ts` (signup CRUD)
8. Create `lib/domain/events/types.ts`
9. Create `lib/domain/events/public-events.ts`
10. Create `lib/domain/events/internal-events.ts`

### Phase 3: Integration Sync Adapter

**Depends on:** Phase 2
**Risk:** MEDIUM

11. Add `syncIntegrationEvent` mutation to `convex/events.ts`
12. Modify `lib/integrations/ticket-tailor/sync.ts` to call `syncIntegrationEvent` after `upsertTicketTailorEvent`
13. Backfill existing `ticketTailorEvents` into `events` table (one-time migration)

### Phase 4: Public Pages

**Depends on:** Phase 2 (not Phase 3 — public pages work with internal events even before integration sync)
**Risk:** LOW

14. Create `app/events/layout.tsx` (public shell)
15. Create `app/events/page.tsx` (event listing)
16. Create `app/events/[eventSlug]/page.tsx` (event detail + signup form)
17. Create `app/events/[eventSlug]/confirmation/page.tsx`
18. Create `app/api/events/[eventId]/signup/route.ts` (public signup endpoint)

### Phase 5: Dashboard Event Management

**Depends on:** Phase 2
**Risk:** LOW

19. Create `app/dashboard/events/page.tsx` (events list)
20. Create `app/dashboard/events/[eventId]/page.tsx` (event editor)
21. Create `app/api/dashboard/events/route.ts` (CRUD API)
22. Create `app/api/dashboard/events/[eventId]/route.ts`
23. Update `dashboard-shell.tsx` navigation to include Events section

### Phase 6: Finance Integration

**Depends on:** Phase 3 (needs canonical events populated)
**Risk:** MEDIUM

24. Modify `convex/events.ts` `getEventsForLedger` to union canonical events
25. Verify `convex/orders.ts` `getOrdersWithFilters` handles `eventId` references to canonical table
26. Test revenue dashboard with mixed-source events

## Confidence Assessment

| Area                     | Confidence | Notes                                                                                                                              |
| ------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Schema design            | HIGH       | Follows existing Convex patterns, additive only, well-indexed                                                                      |
| Source-agnostic reads    | HIGH       | Existing code already uses string `eventId` — table swap is clean                                                                  |
| Public page isolation    | HIGH       | App Router layout scoping is well-understood, existing auth pattern is solid                                                       |
| Integration sync adapter | MEDIUM     | Works in theory, but the exact timing of when to call `syncIntegrationEvent` relative to order sync needs testing                  |
| Finance integration      | MEDIUM     | `getEventsForLedger` modification is straightforward, but `getOrdersWithFilters` join behavior with mixed sources needs validation |
| Backfill migration       | LOW        | One-time migration from `ticketTailorEvents` → `events` — straightforward but needs a runbook                                      |

## Sources

- Existing codebase: `convex/schema.ts`, `convex/events.ts`, `convex/sync.ts`, `lib/integrations/ticket-tailor/sync.ts`
- Convex guidelines: `convex/_generated/ai/guidelines.md`
- Project context: `.planning/PROJECT.md`
- Next.js App Router: Layout scoping for auth boundaries (official docs, training data)

---

_Architecture research for: Dual-source events (integration vs internal) in Conference Finance Dashboard_
_Researched: 2026-03-27_
