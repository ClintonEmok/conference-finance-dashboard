# Convex Functions Inventory

Every mutation, action, and cron job in the Convex backend. Audit for auth enforcement.

## Legend

- **PUBLIC** = `mutation({})` — callable from client, exposed via API
- **INTERNAL** = `internalMutation({})` — server-only, not exposed
- **ACTION** = `action({})` / `internalAction({})` — HTTP side-effects
- **NEEDS AUTH** = should require `ctx.auth.getUserIdentity()` before any write

---

## accommodation.ts

| Function                           | Visibility | Line | Auth?          |
| ---------------------------------- | ---------- | ---- | -------------- |
| `recalculateRoomOccupancy`         | INTERNAL   | 166  | OK (internal)  |
| `createHotel`                      | PUBLIC     | 626  | **NEEDS AUTH** |
| `createRoom`                       | PUBLIC     | 638  | **NEEDS AUTH** |
| `createRooms`                      | PUBLIC     | 655  | **NEEDS AUTH** |
| `createRoomType`                   | PUBLIC     | 719  | **NEEDS AUTH** |
| `assignRoomToAttendee`             | PUBLIC     | 731  | **NEEDS AUTH** |
| `assignAttendeeToRoom`             | PUBLIC     | 790  | **NEEDS AUTH** |
| `unassignRoomFromAttendee`         | PUBLIC     | 853  | **NEEDS AUTH** |
| `unassignAttendeeFromRoom`         | PUBLIC     | 885  | **NEEDS AUTH** |
| `linkHotelToEvent`                 | PUBLIC     | 935  | **NEEDS AUTH** |
| `unlinkHotelFromEvent`             | PUBLIC     | 960  | **NEEDS AUTH** |
| `updateHotel`                      | PUBLIC     | 981  | **NEEDS AUTH** |
| `deleteHotel`                      | PUBLIC     | 1001 | **NEEDS AUTH** |
| `updateRoomLabel`                  | PUBLIC     | 1045 | **NEEDS AUTH** |
| `deleteRoom`                       | PUBLIC     | 1064 | **NEEDS AUTH** |
| `updateRoomType`                   | PUBLIC     | 1090 | **NEEDS AUTH** |
| `deleteRoomType`                   | PUBLIC     | 1110 | **NEEDS AUTH** |
| `attachHotelToEventByProviderId`   | PUBLIC     | 1146 | **NEEDS AUTH** |
| `detachHotelFromEventByProviderId` | PUBLIC     | 1181 | **NEEDS AUTH** |

---

## attendees.ts

| Function          | Visibility | Line | Auth?                                          |
| ----------------- | ---------- | ---- | ---------------------------------------------- |
| `createAttendee`  | PUBLIC     | 101  | **NEEDS AUTH**                                 |
| `upsertAttendee`  | PUBLIC     | 141  | **NEEDS AUTH**                                 |
| `updateAttendee`  | PUBLIC     | 192  | **NEEDS AUTH**                                 |
| `assignRoom`      | PUBLIC     | 224  | **NEEDS AUTH** (duplicate — consider removing) |
| `unassignRoom`    | PUBLIC     | 237  | **NEEDS AUTH** (duplicate — consider removing) |
| `checkInAttendee` | PUBLIC     | 249  | **NEEDS AUTH**                                 |

---

## orders.ts

| Function             | Visibility | Line | Auth?          |
| -------------------- | ---------- | ---- | -------------- |
| `createOrder`        | PUBLIC     | 102  | **NEEDS AUTH** |
| `upsertOrder`        | PUBLIC     | 129  | **NEEDS AUTH** |
| `updateOrderStatus`  | PUBLIC     | 167  | **NEEDS AUTH** |
| `removeOrderLocally` | PUBLIC     | 709  | **NEEDS AUTH** |

---

## payments.ts

| Function                      | Visibility | Line | Auth?          |
| ----------------------------- | ---------- | ---- | -------------- |
| `createPayment`               | PUBLIC     | 97   | **NEEDS AUTH** |
| `upsertTikkiePayment`         | PUBLIC     | 123  | **NEEDS AUTH** |
| `cleanupLegacyTikkiePayments` | PUBLIC     | 167  | **NEEDS AUTH** |
| `assignPaymentToOrder`        | PUBLIC     | 264  | **NEEDS AUTH** |
| `unassignPayment`             | PUBLIC     | 284  | **NEEDS AUTH** |
| `autoMatchPayments`           | PUBLIC     | 299  | **NEEDS AUTH** |

---

## tikkie.ts

| Function                  | Visibility | Line | Auth?          |
| ------------------------- | ---------- | ---- | -------------- |
| `createPaymentLink`       | PUBLIC     | 45   | **NEEDS AUTH** |
| `updatePaymentLinkStatus` | PUBLIC     | 70   | **NEEDS AUTH** |
| `createPaymentTemplate`   | PUBLIC     | 129  | **NEEDS AUTH** |
| `updatePaymentTemplate`   | PUBLIC     | 168  | **NEEDS AUTH** |
| `deletePaymentTemplate`   | PUBLIC     | 190  | **NEEDS AUTH** |
| `createEventPaymentLink`  | PUBLIC     | 278  | **NEEDS AUTH** |
| `upsertTikkiePayment`     | PUBLIC     | 355  | **NEEDS AUTH** |
| `matchTikkiePayment`      | PUBLIC     | 394  | **NEEDS AUTH** |
| `autoMatchTikkiePayments` | PUBLIC     | 413  | **NEEDS AUTH** |

---

## sync.ts

| Function                       | Visibility | Line | Auth?          |
| ------------------------------ | ---------- | ---- | -------------- |
| `startSyncRun`                 | PUBLIC     | 33   | **NEEDS AUTH** |
| `updateSyncRun`                | PUBLIC     | 51   | **NEEDS AUTH** |
| `completeSyncRun`              | PUBLIC     | 71   | **NEEDS AUTH** |
| `processWebhookEvent`          | PUBLIC     | 124  | **NEEDS AUTH** |
| `createWebhookEvent`           | PUBLIC     | 140  | **NEEDS AUTH** |
| `upsertTicketTailorEvent`      | PUBLIC     | 174  | **NEEDS AUTH** |
| `upsertTicketTailorOrder`      | PUBLIC     | 216  | **NEEDS AUTH** |
| `archiveMissingOrdersForEvent` | PUBLIC     | 266  | **NEEDS AUTH** |
| `upsertTicketTailorAttendee`   | PUBLIC     | 330  | **NEEDS AUTH** |
| `createAttendeeFamilyGroup`    | PUBLIC     | 401  | **NEEDS AUTH** |
| `addAttendeeToFamilyGroup`     | PUBLIC     | 426  | **NEEDS AUTH** |
| `updateWebhookEvent`           | PUBLIC     | 472  | **NEEDS AUTH** |

---

## events.ts

| Function      | Visibility | Line | Auth?          |
| ------------- | ---------- | ---- | -------------- |
| `createEvent` | PUBLIC     | 50   | **NEEDS AUTH** |
| `upsertEvent` | PUBLIC     | 66   | **NEEDS AUTH** |

---

## Actions (autoSync.ts)

| Function                 | Visibility | Line | Auth?         |
| ------------------------ | ---------- | ---- | ------------- |
| `autoSyncTicketTailor`   | INTERNAL   | 3    | OK (internal) |
| `autoSyncTikkiePayments` | INTERNAL   | 41   | OK (internal) |

---

## Cron Jobs (crons.ts)

| Job                         | Schedule     | Target                            | Notes                                    |
| --------------------------- | ------------ | --------------------------------- | ---------------------------------------- |
| `ticket-tailor-auto-sync`   | Every 15 min | `autoSync.autoSyncTicketTailor`   | Circular: calls own Next.js API via HTTP |
| `tikkie-payments-auto-sync` | Every 15 min | `autoSync.autoSyncTikkiePayments` | Same                                     |

---

## Summary

| Category                      | Count                                           |
| ----------------------------- | ----------------------------------------------- |
| Public mutations (NEEDS AUTH) | **54**                                          |
| Internal mutations (safe)     | 1                                               |
| Internal actions (safe)       | 2                                               |
| Cron jobs                     | 2                                               |
| Duplicates to consolidate     | 2 (`assignRoom`/`unassignRoom` in attendees.ts) |

**Option A — Convert all to `internalMutation`:** Only expose via authenticated Next.js API routes. Safest approach for financial operations.

**Option B — Add auth check to each:** Keep `mutation({})` but add `ctx.auth.getUserIdentity()` guard at top of every handler. Simpler migration but wider attack surface if check is missed.
