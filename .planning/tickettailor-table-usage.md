# TicketTailor Table Usage Analysis

**Analysis Date:** 2026-04-01

## Executive Summary

The codebase uses a **Core + Extension (dual-write) architecture**. TicketTailor tables are **extension tables** — they are NOT the primary source of truth. Canonical data lives in core tables (`orders`, `orderAttendees`, `events`), and TicketTailor tables store provider-specific metadata only.

**Tables found in active use:** `ticketTailorOrders`, `ticketTailorAttendees`, `ticketTailorEvents`
**Tables NOT found:** `ticketTailorTicketTypes`, `ticketTailorPayments`

**Architecture pattern:** All queries read from core tables first, then LEFT JOIN extension tables for provider-specific fields (visibility flags, raw payloads, provider IDs).

---

## 1. ticketTailorOrders

**Role:** Extension table for `orders` (core). Stores provider-specific metadata only.

**Schema FK:** `orderId: v.id("orders")` — links to canonical orders table.

**Fields stored here (slimmed):** `providerOrderId`, `providerEventId`, `orderId`, `providerStatus`, `normalizedStatus`, `normalizationNote`, `isArchived`, `archivedAt`, `archiveReason`, `removedAt`, `removedReason`, `refundedAt`, `cancelledAt`, `rawPayload`

### File-by-file usage:

#### `convex/orders.ts` (Convex backend — PRIMARY consumer)

| Lines     | Usage                                      | Description                                                                                                 |
| --------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 21-35     | Helper: `getOrderWithExtension()`          | Joins a single `orders` record with `ticketTailorOrders` via `orderId` index. Returns `{order, extension}`. |
| 37-59     | Helper: `getVisibleOrdersWithExtensions()` | Batch joins multiple orders with extensions, filters by `isOrderVisible()` (checks `removedAt`).            |
| 157-160   | `getOrderByProviderId` query               | After finding order in core table, joins extension for visibility check.                                    |
| 188-196   | `getOrderLedger` query                     | Joins extensions for all orders in an event, filters visible orders.                                        |
| 278-285   | `createOrder` mutation                     | **Dual-write:** Inserts into `orders` (core) then `ticketTailorOrders` (extension) with `orderId` FK.       |
| 348-361   | `upsertOrder` mutation                     | **Dual-write:** Patches both `orders` and `ticketTailorOrders`. Creates extension if missing.               |
| 360-376   | `upsertOrder` mutation (cont.)             | Inserts new `ticketTailorOrders` record when no existing extension found.                                   |
| 404-411   | `upsertOrder` mutation (cont.)             | Patches existing `ticketTailorOrders` extension with updated data.                                          |
| 523-527   | `listCandidateOrders` helper               | Joins extensions for visibility filtering in search/filter candidates.                                      |
| 646-650   | `getOrderCount` query                      | Joins extensions to filter out removed orders before counting.                                              |
| 728-732   | `getOrdersForReconciliation` query         | Joins extensions for additional fields (`isArchived`, `archivedAt`, `refundedAt`).                          |
| 801-805   | `searchOrders` query                       | Joins extensions for visibility filtering.                                                                  |
| 861-864   | `getOrderWithAttendees` query              | Joins extension to check `isArchived`, `archivedAt`, `archiveReason`.                                       |
| 931-935   | `getPaymentSummary` query                  | Joins extensions for visibility filtering.                                                                  |
| 1040-1051 | `removeOrderLocally` mutation              | Patches `ticketTailorOrders` with `removedAt` and `removedReason` (soft delete via extension only).         |

#### `convex/tikkie.ts` (Convex backend — payment matching)

| Lines   | Usage                        | Description                                                                                     |
| ------- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| 572-589 | `autoMatchPayments` mutation | Queries core `orders` table, joins `ticketTailorOrders` for visibility filtering (`removedAt`). |

#### `convex/sync/orders.ts` (Convex backend — sync pipeline)

| Lines   | Usage                                     | Description                                                                                                                                                                             |
| ------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 62      | Return type                               | `returns: v.id("ticketTailorOrders")` for public upsert mutation.                                                                                                                       |
| 103-131 | `upsertTicketTailorOrder`                 | **Dual-write:** Upserts both `orders` (core) and `ticketTailorOrders` (extension).                                                                                                      |
| 105-123 | Extension upsert logic                    | Queries by `providerOrderId` index, patches or inserts `ticketTailorOrders`.                                                                                                            |
| 153-173 | `internalUpsertTicketTailorOrder`         | Extension upsert for internal sync (no auth).                                                                                                                                           |
| 198-228 | `internalUpsertTicketTailorOrder` (cont.) | Queries extension by `providerOrderId`, patches or inserts.                                                                                                                             |
| 228     | Return type                               | Returns `{ orderId, ticketTailorOrderId }` — both IDs.                                                                                                                                  |
| 265-271 | `internalUpsertTicketTailorOrder`         | Looks up existing extension by `providerOrderId` index.                                                                                                                                 |
| 308-338 | Extension upsert                          | Patches or inserts `ticketTailorOrders` with slimmed fields + `orderId` FK.                                                                                                             |
| 355-399 | `internalArchiveMissingOrdersForEvent`    | Queries `ticketTailorOrders` by `providerEventId` index to find orders to archive. Patches extension with `isArchived`, `archivedAt`, `archiveReason`, `normalizedStatus: "cancelled"`. |
| 413-425 | Archive consistency check                 | Queries `ticketTailorOrders` by `providerOrderId` to check if orphaned orders exist.                                                                                                    |

#### `lib/types/order.ts` (Type validation)

| Lines | Usage      | Description                                                                                                    |
| ----- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| 47    | Type union | `id: v.union(v.id("orders"), v.id("ticketTailorOrders"))` — backward compatibility allowing either table's ID. |

#### `convex/schema.ts` (Schema definition)

| Lines   | Usage            | Description                                                                  |
| ------- | ---------------- | ---------------------------------------------------------------------------- |
| 292-320 | Table definition | Defines `ticketTailorOrders` with slimmed fields + `orderId` FK to `orders`. |

---

## 2. ticketTailorAttendees

**Role:** Extension table for `orderAttendees` (core). Stores provider-specific metadata only.

**Schema FK:** `attendeeId: v.id("orderAttendees")` — links to canonical orderAttendees table.

**Fields stored here (slimmed):** `providerAttendeeId`, `providerIssuedTicketId`, `providerTicketTypeId`, `providerEventId`, `providerOrderId`, `attendeeId` (FK), `orderId`, `ticketTypeLabel`, `ticketStatus`, `checkedInAt`, `customAnswers`, `genderType`, `ageGroup`, `ticketCategory`, `tikkieAmountOverrideMinor`, `rawPayload`, `assignedRoomId`, `allocationPriority`, `priorityReason`

### File-by-file usage:

#### `convex/attendees.ts` (Convex backend — PRIMARY consumer)

| Lines   | Usage                             | Description                                                                                                                                         |
| ------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 70-73   | `getAttendees` query (by orderId) | Queries `ticketTailorAttendees` directly by `orderId` index. **Note:** This is a legacy pattern — queries extension directly instead of core table. |
| 77-89   | `getAttendees` query (by eventId) | Queries `ticketTailorAttendees` by `providerEventOrder` index, paginated or bounded.                                                                |
| 92-99   | `getAttendees` query (all)        | Full table scan of `ticketTailorAttendees` with bounded take(500).                                                                                  |
| 186-189 | `getAttendeeById` query           | Direct `ctx.db.get("ticketTailorAttendees", args.attendeeId)`.                                                                                      |
| 198-202 | `getAttendeeByEmail` query        | Queries by `by_email` index on `ticketTailorAttendees`.                                                                                             |
| 241-243 | `createAttendee` mutation         | Direct insert into `ticketTailorAttendees`.                                                                                                         |
| 284-295 | `upsertAttendee` mutation         | Queries by `providerAttendeeId` index, patches or inserts `ticketTailorAttendees`.                                                                  |
| 300-328 | `updateAttendee` mutation         | Patches `ticketTailorAttendees` directly (assignedRoomId, name, email, genderType, etc.).                                                           |
| 332-343 | `assignRoom` mutation             | Delegates to `accommodation.assignAttendeeToRoom` with `ticketTailorAttendees` ID.                                                                  |
| 347-357 | `unassignRoom` mutation           | Delegates to `accommodation.unassignAttendeeFromRoom` with `ticketTailorAttendees` ID.                                                              |
| 360-370 | `checkInAttendee` mutation        | Patches `checkedInAt` on `ticketTailorAttendees`.                                                                                                   |
| 373-388 | `getAttendeeByStringId` query     | Normalizes string ID to `ticketTailorAttendees` ID, then fetches.                                                                                   |

#### `convex/orders.ts` (Convex backend — join in ledger)

| Lines   | Usage                  | Description                                                                                                                             |
| ------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 218-228 | `getOrderLedger` query | For each order's attendees (from core `orderAttendees`), joins `ticketTailorAttendees` by `attendeeId` FK for provider-specific fields. |

#### `convex/accommodation.ts` (Convex backend — room management)

| Lines | Usage                              | Description                                                                               |
| ----- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| 11    | Type definition                    | `ticketTailorAttendees: Doc<"ticketTailorAttendees">` in `DocTables` union type.          |
| 784   | `getRoomsWithDetails` query        | Queries `ticketTailorAttendees.take(2000)` to compute room occupancy by `assignedRoomId`. |
| 823   | `listAccommodationInventory` query | Queries `ticketTailorAttendees.take(2000)` for inventory view.                            |

#### `convex/sync/attendees.ts` (Convex backend — sync pipeline)

| Lines   | Usage                                       | Description                                                                           |
| ------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| 49      | Return type                                 | `returns: v.id("ticketTailorAttendees")` for public upsert.                           |
| 52-70   | `upsertTicketTailorAttendee`                | Queries by `providerEventOrder` index, patches or inserts `ticketTailorAttendees`.    |
| 77-85   | `getTicketTailorAttendeesByOrderId`         | Queries by `orderId` index on `ticketTailorAttendees`.                                |
| 118     | Return type                                 | `returns: { attendeeId, ticketTailorAttendeeId }` — both IDs.                         |
| 138-150 | `internalUpsertTicketTailorAttendee`        | Looks up existing extension by `providerEventOrder` index.                            |
| 204-246 | Extension upsert                            | Patches or inserts `ticketTailorAttendees` with slimmed fields + `attendeeId` FK.     |
| 263-272 | `internalGetTicketTailorAttendeesByOrderId` | Queries core `orderAttendees`, then joins `ticketTailorAttendees` by `attendeeId` FK. |

#### `app/api/dashboard/attendees/[attendeeId]/route.ts` (Next.js API route)

| Lines   | Usage         | Description                                                                                                                          |
| ------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 151-155 | PATCH handler | Calls `attendees.updateAttendee` mutation with `Id<"ticketTailorAttendees">` to update `tikkieAmountOverrideMinor` and `genderType`. |

#### `convex/schema.ts` (Schema definition)

| Lines   | Usage            | Description                                                                                |
| ------- | ---------------- | ------------------------------------------------------------------------------------------ |
| 322-360 | Table definition | Defines `ticketTailorAttendees` with slimmed fields + `attendeeId` FK to `orderAttendees`. |

---

## 3. ticketTailorEvents

**Role:** Extension table for `events` (core). Stores provider-specific metadata only.

**Schema FK:** No direct FK to `events` — linked via `eventSources` table (`provider: "tickettailor"`, `externalEventId` = `providerEventId`).

**Fields stored here:** `providerEventId`, `name`, `startsAt`, `endsAt`, `timezone`, `currency`, `rawPayload`

### File-by-file usage:

#### `convex/events.ts` (Convex backend — event management)

| Lines   | Usage                                    | Description                                                                           |
| ------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| 285-287 | Section header                           | Marked as "INTEGRATION-LEGACY: TicketTailor Events (for backward compatibility)"      |
| 289-299 | `getTicketTailorEventByProviderId` query | Queries `ticketTailorEvents` by `providerEventId` index. Legacy lookup.               |
| 302-327 | `upsertTicketTailorEvent` mutation       | Queries by `providerEventId`, patches or inserts `ticketTailorEvents`. Requires auth. |

#### `convex/sync/events.ts` (Convex backend — sync pipeline)

| Lines | Usage                                    | Description                                                                                  |
| ----- | ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| 22-49 | `upsertTicketTailorEvent` mutation       | Public mutation — queries by `providerEventId`, patches or inserts.                          |
| 32    | Return type                              | `returns: v.id("ticketTailorEvents")`                                                        |
| 54-64 | `getTicketTailorEventByProviderId` query | Queries by `providerEventId` index.                                                          |
| 69-99 | `internalUpsertTicketTailorEvent`        | **Dual-write:** Upserts `ticketTailorEvents` AND canonical `events` table. Returns both IDs. |
| 80    | Return type                              | `returns: { ticketTailorEventId, canonicalEventId }`                                         |
| 86-98 | Extension upsert                         | Patches or inserts `ticketTailorEvents`.                                                     |

#### `convex/accommodation.ts` (Convex backend — room management)

| Lines     | Usage                          | Description                                                                                                              |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 271-279   | `getRoomAllocationBoard` query | Backward-compat check: queries `ticketTailorEvents` by `providerEventId` to resolve event IDs for accommodation scoping. |
| 302       | `getRoomAllocationBoard` query | Bulk loads all `ticketTailorEvents.take(200)` alongside canonical `events` for dual-source event resolution.             |
| 1650-1660 | `getEventByProviderId` query   | Queries `ticketTailorEvents` by `providerEventId` index. Used for deprecated hotel attachment flow.                      |

#### `convex/schema.ts` (Schema definition)

| Lines   | Usage            | Description                                                |
| ------- | ---------------- | ---------------------------------------------------------- |
| 278-290 | Table definition | Defines `ticketTailorEvents` with `providerEventId` index. |

---

## 4. ticketTailorTicketTypes

**NOT FOUND** — No references to this table exist in the codebase. The codebase uses `ticketTypes` (canonical table) instead, defined in `convex/schema.ts` and managed via `convex/events.ts` (`getTicketTypesForEvent`, `createTicketType`).

---

## 5. ticketTailorPayments

**NOT FOUND** — No references to this table exist in the codebase. The codebase uses `payments` (canonical table) and `tikkiePayments` (Tikkie-specific extension) instead.

---

## Architecture Pattern: Core + Extension

### How it works:

```
┌─────────────────────┐     ┌──────────────────────────┐
│   Core Tables       │     │   Extension Tables       │
│   (Source of Truth) │     │   (Provider Metadata)    │
├─────────────────────┤     ├──────────────────────────┤
│ orders              │◄───┤  ticketTailorOrders      │
│   _id               │ FK  │   orderId → orders._id   │
│   status            │     │   providerStatus          │
│   bookerEmail       │     │   removedAt               │
│   totalAmountMinor  │     │   isArchived              │
│   source            │     │   rawPayload              │
├─────────────────────┤     ├──────────────────────────┤
│ orderAttendees      │◄───┤  ticketTailorAttendees    │
│   _id               │ FK  │   attendeeId → orderAtt. │
│   name              │     │   providerAttendeeId      │
│   email             │     │   genderType              │
│   assignedRoomId    │     │   ticketTypeLabel         │
├─────────────────────┤     ├──────────────────────────┤
│ events              │     │  ticketTailorEvents       │
│   _id               │     │   providerEventId         │
│   title             │     │   name                    │
│   slug              │     │   rawPayload              │
└─────────────────────┘     └──────────────────────────┘
        ▲                            ▲
        │                            │
        │   eventSources (bridge)     │
        │   provider: "tickettailor"  │
        │   externalEventId           │
        └────────────────────────────┘
```

### Query Pattern (standard):

1. Query core table (`orders`, `orderAttendees`, `events`)
2. Join extension table via FK index
3. Use extension for: visibility filtering (`removedAt`), provider-specific fields, raw payloads
4. Return merged result with core `_id` preserved

### Write Pattern (dual-write):

1. Upsert core table record
2. Upsert extension table record with FK to core
3. Both in same transaction (single mutation handler)

---

## Primary vs Extension Usage Assessment

### Tables used as PRIMARY source of truth: **NONE**

All five TicketTailor tables are extension tables. The codebase has been migrated (Phase 24: Canonical Orders Rewrite) to use core tables as the primary source.

### Tables used as EXTENSION (provider metadata only):

| Table                   | Core Table       | Extension Purpose                                      |
| ----------------------- | ---------------- | ------------------------------------------------------ |
| `ticketTailorOrders`    | `orders`         | Visibility flags, provider status, raw payload         |
| `ticketTailorAttendees` | `orderAttendees` | Provider IDs, ticket type label, gender type, check-in |
| `ticketTailorEvents`    | `events`         | Provider event ID, raw payload                         |

### Legacy patterns still using TT tables as primary:

**`convex/attendees.ts`** — Most attendee queries (`getAttendees`, `getAttendeeById`, `getAttendeeByEmail`) read directly from `ticketTailorAttendees` instead of the core `orderAttendees` table. This is a **migration gap** — the sync pipeline dual-writes, but the read path hasn't been fully migrated.

**`convex/accommodation.ts`** — `getRoomsWithDetails` and `listAccommodationInventory` read `ticketTailorAttendees` directly for room occupancy. This works because `assignedRoomId` lives on the extension table, but it means room occupancy is coupled to the TT extension.

---

## Summary Statistics

| Table                     | Files (non-generated) | Total References | Primary Reads | Extension Joins | Writes |
| ------------------------- | --------------------- | ---------------- | ------------- | --------------- | ------ |
| `ticketTailorOrders`      | 5                     | ~35              | 0             | ~25             | ~10    |
| `ticketTailorAttendees`   | 6                     | ~40              | ~15           | ~5              | ~15    |
| `ticketTailorEvents`      | 4                     | ~15              | ~5            | ~3              | ~7     |
| `ticketTailorTicketTypes` | 0                     | 0                | 0             | 0               | 0      |
| `ticketTailorPayments`    | 0                     | 0                | 0             | 0               | 0      |

---

_Analysis complete: 2026-04-01_
