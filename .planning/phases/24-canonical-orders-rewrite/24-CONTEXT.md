# Phase 24: canonical orders rewrite - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Consolidate the parallel data models (TicketTailor sync tables + submission tables) into a unified "orders" core with provider-specific extension tables. This eliminates the dual-data-model problem where TT orders and internal submissions have no relationship, and prevents the 30+ column bloat that would come from adding every provider's fields to a single monolithic table.

Delivers: renamed core tables (`orders`, `orderAttendees`, `orderTicketSelections`, `orderAssignments`, `orderIdempotency`), slimmed TT tables with FKs to core, updated TT sync pipeline, and updated downstream consumers.

</domain>

<decisions>
## Implementation Decisions

### Schema migration approach

- **D-01:** Drop + recreate tables (not incremental migration). We're in dev with no production data — clean break is simplest.
- **D-02:** Remove `submissions`, `submissionAttendees`, `submissionTicketSelections`, `submissionAssignments`, `submissionIdempotency` from schema. Replace with `orders`, `orderAttendees`, `orderTicketSelections`, `orderAssignments`, `orderIdempotency`.
- **D-03:** Remove `ticketTailorOrders` and `ticketTailorAttendees` from schema. Replace with slimmed versions that have FKs to core tables.

### Table naming

- **D-04:** `submissions` → `orders` (core table — semantically accurate for both integration and internal sources)
- **D-05:** `submissionAttendees` → `orderAttendees` (core table)
- **D-06:** `submissionTicketSelections` → `orderTicketSelections` (relational table)
- **D-07:** `submissionAssignments` → `orderAssignments` (relational table)
- **D-08:** `submissionIdempotency` → `orderIdempotency` (internal-only concern)
- **D-09:** `ticketTailorOrders` stays as-is (provider-specific, slimmed)
- **D-10:** `ticketTailorAttendees` stays as-is (provider-specific, slimmed)

### Core table field placement

- **D-11:** `orders` gains optional fields: `currency?`, `totalAmountMinor?`, `status?`, `providerOrderId?`, `providerEventId?`, `orderedAt?` (populated for integration orders, nullable for internal)
- **D-12:** `orders` keeps nullable: `bookingRef?`, `idempotencyKey?`, `honeypotSeen?` (populated for internal orders, nullable for integration)
- **D-13:** `orderAttendees` gains optional fields: `phone?`, `email?` (nullable for TT-sourced attendees)
- **D-14:** `orderAttendees.gender` normalized to lowercase (`"male"|"female"|"mixed"|"unknown"`)
- **D-15:** Domain concepts move to core: `assignedRoomId?`, `allocationPriority?`, `priorityReason?` → `orderAttendees` (these are provider-agnostic)

### TT table field placement (slimmed)

- **D-16:** `ticketTailorOrders` keeps: `providerEventId`, `providerStatus`, `normalizedStatus?`, `isArchived?`, `archivedAt?`, `archiveReason?`, `removedAt?`, `removedReason?`, `normalizationNote?`, `refundedAt?`, `cancelledAt?`, `rawPayload`, `orderId → orders` (FK)
- **D-17:** `ticketTailorOrders` loses: `buyerEmail`, `buyerName`, `currency`, `totalAmountMinor`, `orderedAt`, `eventId` — moved to core `orders`
- **D-18:** `ticketTailorAttendees` keeps: `providerAttendeeId?`, `providerIssuedTicketId?`, `providerTicketTypeId?`, `providerEventId`, `providerOrderId`, `ticketTypeLabel?`, `ticketStatus?`, `checkedInAt?`, `genderType?` (uppercase), `ageGroup?`, `ticketCategory?`, `tikkieAmountOverrideMinor?`, `customAnswers?`, `rawPayload`, `attendeeId → orderAttendees` (FK)
- **D-19:** `ticketTailorAttendees` loses: `name`, `email`, `eventId`, `orderId`, `assignedRoomId` — moved to core

### TT sync rewrite scope

- **D-20:** Rewrite in two waves: **orders first**, then attendees. Reduces risk, allows verification after each wave.
- **D-21:** Wave 1: Rewrite `internalUpsertTicketTailorOrder` → writes to `orders` (core) + `ticketTailorOrders` (extension). Update `internalArchiveMissingOrdersForEvent` to patch both tables.
- **D-22:** Wave 2: Rewrite `internalUpsertTicketTailorAttendee` → writes to `orderAttendees` (core) + `ticketTailorAttendees` (extension). Update family linking to use `orderAttendees` IDs.

### Downstream consumer update order

- **D-23:** Update by dependency order:
  1. `sync.ts` / `autoSync.ts` (write path — TT sync mutations)
  2. `orders.ts` (order management queries/mutations)
  3. `tikkie.ts` (Tikkie link creation, reads orders)
  4. `payments.ts` (payment matching, reads orders)
  5. `accommodation.ts` (reads both orders + attendees — update last, most complex)

### Convex best practices applied

- **D-24:** All queries use `.take(N)` or `.paginate()` — no unbounded `.collect()` calls
- **D-25:** No `.filter()` in queries — use indexes instead
- **D-26:** Use `ctx.db` directly within mutations (not `ctx.runQuery`/`ctx.runMutation`) to stay within single transaction
- **D-27:** Strict types: `Id<"orders">`, `Id<"orderAttendees">`, `Doc<"orders">` throughout
- **D-28:** Internal mutations use `internalMutation`/`internalQuery` (no `requireIdentity`) for cron-triggered sync
- **D-29:** Public mutations use `requireIdentity(ctx)` as first handler statement

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema + data model

- `convex/schema.ts` — Current table definitions (lines 133-333 cover submissions + TT tables)
- `convex/_generated/ai/guidelines.md` — Convex schema guidelines, query patterns, mutation limits

### TT sync pipeline

- `convex/autoSync.ts` — Cron-triggered TT sync (orders + attendees fetch + upsert + archive)
- `convex/sync.ts` — Manual TT sync mutations + internal wrappers for cron

### Downstream consumers

- `convex/accommodation.ts` — Room allocation board (reads both TT + submissions, most complex consumer)
- `convex/orders.ts` — Order management queries/mutations (reads TT orders)
- `convex/payments.ts` — Payment matching (reads TT orders by status)
- `convex/tikkie.ts` — Tikkie link creation (reads TT orders)
- `convex/signupSubmission.ts` — Signup form submission (writes to submissions tables)

### Requirements

- `.planning/REQUIREMENTS.md` — USF-01, USF-06 (source-aware contracts)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `requireIdentity(ctx)` in `convex/auth.ts` — Auth guard for public mutations, must be preserved
- `ttFetchPaginated()` in `convex/autoSync.ts` — TT HTTP client with retry/backoff, reusable as-is
- `extractAttendeeItems()` in `convex/autoSync.ts` — Attendee payload extraction, reusable as-is
- `linkAttendeesAsFamily()` in `convex/autoSync.ts` — Family grouping logic, needs ID reference updates
- `mapSubmissionGender()` in `convex/accommodation.ts` — Gender normalization helper, should be generalized

### Established Patterns

- Internal mutation wrappers (`internal*` in `sync.ts`) mirror public mutations without auth — pattern to preserve
- Cron auto-sync calls `ctx.runMutation(internal.*)` directly, not HTTP routes — must preserve
- Idempotency window: 2 hours (`IDEMPOTENCY_WINDOW_MS = 2 * 60 * 60 * 1000`)
- Booking ref format: `BK-{YYYYMMDD}-{8-char hash}`
- Gender mapping: submissions use lowercase, TT uses uppercase — core normalizes to lowercase

### Integration Points

- `getRoomAllocationBoard` in `convex/accommodation.ts` (line 220-662) — Main consumer of both TT + submission data
- `autoMatchPayments` in `convex/payments.ts` — Reads `ticketTailorOrders` by status for payment matching
- `autoMatchUnassignedPayments` in `convex/autoSync.ts` — Same pattern, reads TT orders
- Family groups (`attendeeFamilyGroups`/`attendeeFamilyMembers`) — Currently reference TT attendee IDs as strings, need update to reference `orderAttendees` IDs

</code_context>

<specifics>
## Specific Ideas

- "No 'extras' naming convention" — TT tables keep their existing names, just slimmed down
- "Rename submissions to orders" — semantic accuracy, not just cosmetic
- Core + Extension pattern: slim core with common fields, provider-specific tables for rawPayloads and provider-only fields
- Domain concepts (assignedRoomId, allocationPriority) belong in core, not provider-specific tables
- Provider-specific data (customAnswers, tikkieAmountOverrideMinor, genderType uppercase) stays in TT tables

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)

None.

</deferred>

---

_Phase: 24-canonical-orders-rewrite_
_Context gathered: 2026-03-31_
