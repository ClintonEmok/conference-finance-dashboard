# TicketTailor Sync Analysis - Zero Orders Issue

**Analysis Date:** 2026-03-31
**Issue:** Zero orders/attendees being synced via autoSync.ts

---

## Root Cause Identified

**`autoSync.ts` bypasses the 404 fallback logic** by calling `ticketTailorFetchPaginated` directly instead of using `fetchTicketTailorOrdersByEventPaginated`.

---

## Detailed Code Comparison

### autoSync.ts Order Fetching (BROKEN)

**Location:** `convex/autoSync.ts`, lines 202-206

```typescript
// Fetch orders for this event
const { items: orderPayloads } = await ticketTailorFetchPaginated(
  `/events/${encodeURIComponent(providerEventId)}/orders`,
  { pageSize: 100, maxPages: 200 }
)
```

**Problem:** No error handling for 404 responses. When Ticket Tailor returns 404 for draft events' order endpoints, this throws an uncaught error that fails the entire sync.

---

### sync.ts Order Fetching (WORKING)

**Location:** `lib/integrations/ticket-tailor/sync.ts`, lines 462-468

```typescript
const ordersResult = await fetchTicketTailorOrdersByEventPaginated(
  providerEventId,
  {
    pageSize: 100,
    maxPages: 200,
  }
)
```

**Why it works:** Uses `fetchTicketTailorOrdersByEventPaginated` which has built-in 404 fallback logic.

---

### The Fallback Function (client.ts)

**Location:** `lib/integrations/ticket-tailor/client.ts`, lines 397-446

```typescript
export async function fetchTicketTailorOrdersByEventPaginated(
  providerEventId: string,
  options: PaginationOptions = {}
): Promise<PaginatedCollectionResult<TicketTailorOrderPayload>> {
  const cleanEventId = providerEventId.trim()

  if (!cleanEventId) {
    return { items: [], pagesFetched: 0 }
  }

  let result: PaginatedCollectionResult<TicketTailorOrderPayload>

  try {
    result = await ticketTailorFetchPaginated<TicketTailorOrderPayload>(
      `/events/${encodeURIComponent(cleanEventId)}/orders`,
      options
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Ticket Tailor error"
    const missingNestedOrdersEndpoint =
      /\(404\)|PAGE_NOT_FOUND|Not Found/i.test(message)

    if (!missingNestedOrdersEndpoint) {
      throw error // Re-throw if NOT a 404
    }

    // FALLBACK: Fetch ALL orders and filter client-side
    result = await ticketTailorFetchPaginated<TicketTailorOrderPayload>(
      "/orders",
      { ...options }
    )

    result.items = result.items.filter((order) => {
      const eventIdFromOrder =
        pickString(order.event_id) ??
        pickString(order.eventId) ??
        pickString(asRecord(order.event).id) ??
        pickString(asRecord(order.event_summary).id) ??
        pickString(asRecord(order.event_summary).event_id)

      return eventIdFromOrder === cleanEventId
    })
  }

  result.items.sort((a, b) => orderSortKey(a).localeCompare(orderSortKey(b)))
  return result
}
```

**Fallback behavior:**

1. First tries: `/events/{eventId}/orders`
2. If 404 (draft event): Falls back to `/orders` (all orders)
3. Filters client-side to only include orders for the target event

---

## Existing Logging

### autoSync.ts (lines 377-383, 384-387)

```typescript
console.log("Ticket Tailor auto-sync completed", {
  runId,
  status,
  eventsScanned,
  ordersUpserted,
  attendeesUpserted,
})

// In catch block:
console.error(`Ticket Tailor auto-sync error: ${message}`)
```

### sync.ts

No explicit console logging, but logs to `ticketTailorSyncRuns` table via `api.sync.completeSyncRun`.

---

## Impact Analysis

| Aspect           | autoSync.ts                         | sync.ts                                   |
| ---------------- | ----------------------------------- | ----------------------------------------- |
| Order fetching   | Direct `ticketTailorFetchPaginated` | `fetchTicketTailorOrdersByEventPaginated` |
| 404 handling     | ❌ None - throws                    | ✅ Fallback to `/orders`                  |
| Draft events     | ❌ Fails entirely                   | ✅ Falls back gracefully                  |
| Error visibility | Logs to console + syncRuns table    | Logs to syncRuns table                    |
| Attendees        | Depends on orders                   | Depends on orders                         |

---

## Recommendation

### Option A: Update autoSync.ts to use the fallback function (RECOMMENDED)

**Why:** Leverages existing, tested fallback logic. Minimal code change.

**Changes needed:**

1. Update imports in `convex/autoSync.ts` (line 5-8):

```typescript
import {
  ticketTailorFetch,
  ticketTailorFetchPaginated,
  fetchTicketTailorOrdersByEventPaginated, // ADD THIS
  extractAttendeeItems,
} from "../lib/integrations/ticket-tailor/client"
```

2. Replace order fetching (lines 202-206):

```typescript
// Before:
const { items: orderPayloads } = await ticketTailorFetchPaginated(
  `/events/${encodeURIComponent(providerEventId)}/orders`,
  { pageSize: 100, maxPages: 200 }
)

// After:
const { items: orderPayloads } = await fetchTicketTailorOrdersByEventPaginated(
  providerEventId,
  { pageSize: 100, maxPages: 200 }
)
```

### Option B: Add diagnostic logging only (NOT SUFFICIENT)

Would identify which events fail but not fix the underlying issue.

---

## Additional Observations

1. **No fallbackNotes logging in autoSync.ts:** Unlike sync.ts which logs fallback usage, autoSync.ts doesn't track when fallbacks are used.

2. **attendee fetching also has try/catch:** Lines 267-279 in autoSync.ts catch errors when fetching canonical order, but this is per-order not per-event.

3. **Error aggregation:** Both files aggregate errors but autoSync.ts may fail early before processing multiple events.

---

## Action Items

1. **Immediate:** Update `autoSync.ts` to use `fetchTicketTailorOrdersByEventPaginated`
2. **Optional:** Add fallbackNotes tracking to autoSync.ts for consistency
3. **Verify:** Check sync runs table for "Ticket Tailor auto-sync error" entries to confirm this is the failure mode
