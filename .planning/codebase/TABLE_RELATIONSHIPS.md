# Table Relationship Map

**Analysis Date:** 2026-04-01

## Table Groups

### Core/Canonical Tables

Primary source-of-truth tables that form the backbone of the domain model.

| Table                      | Location               | Purpose                                             |
| -------------------------- | ---------------------- | --------------------------------------------------- |
| `events`                   | `convex/schema.ts:49`  | Conference/event definitions                        |
| `eventSources`             | `convex/schema.ts:72`  | Maps canonical events ↔ provider events             |
| `ticketTypes`              | `convex/schema.ts:91`  | Ticket types available per event                    |
| `orders`                   | `convex/schema.ts:133` | Customer orders                                     |
| `orderAttendees`           | `convex/schema.ts:169` | Attendees within an order                           |
| `orderTicketSelections`    | `convex/schema.ts:203` | Junction: which attendee selected which ticket type |
| `orderAssignments`         | `convex/schema.ts:215` | Junction: attendee ↔ accommodation slot assignments |
| `orderIdempotency`         | `convex/schema.ts:238` | Idempotency guard for order creation                |
| `accommodationHotels`      | `convex/schema.ts:375` | Hotel definitions                                   |
| `accommodationRoomTypes`   | `convex/schema.ts:405` | Room type definitions                               |
| `accommodationRooms`       | `convex/schema.ts:413` | Individual rooms                                    |
| `accommodationSlots`       | `convex/schema.ts:114` | Assignable bed-slots per event/room                 |
| `accommodationEventHotels` | `convex/schema.ts:383` | Junction: events ↔ hotels                           |
| `attendeeFamilyGroups`     | `convex/schema.ts:536` | Family group definitions                            |
| `attendeeFamilyMembers`    | `convex/schema.ts:543` | Junction: family groups ↔ attendees                 |
| `roomAllocations`          | `convex/schema.ts:586` | Room allocation proposals                           |
| `sentEmails`               | `convex/schema.ts:603` | Email delivery tracking                             |
| `payments`                 | `convex/schema.ts:553` | Canonical payment records                           |

### Extension Tables (Ticket Tailor Sync)

Mirror provider data and link back to canonical tables.

| Table                       | Location               | Purpose                                                 |
| --------------------------- | ---------------------- | ------------------------------------------------------- |
| `ticketTailorWebhookEvents` | `convex/schema.ts:251` | Raw webhook event ingestion log                         |
| `ticketTailorEvents`        | `convex/schema.ts:278` | Cached provider event data                              |
| `ticketTailorOrders`        | `convex/schema.ts:292` | Provider order extension → links to `orders`            |
| `ticketTailorAttendees`     | `convex/schema.ts:322` | Provider attendee extension → links to `orderAttendees` |
| `ticketTailorSyncRuns`      | `convex/schema.ts:513` | Sync execution tracking                                 |

### Finance/Tikkie Tables

Payment processing via Tikkie API.

| Table                          | Location               | Purpose                                  |
| ------------------------------ | ---------------------- | ---------------------------------------- |
| `tikkiePaymentTemplates`       | `convex/schema.ts:392` | Amount templates per event+ticketType    |
| `tikkiePaymentLinks`           | `convex/schema.ts:427` | Tikkie payment request links             |
| `tikkiePaymentLinkTransitions` | `convex/schema.ts:460` | Audit log of payment link status changes |
| `tikkiePayments`               | `convex/schema.ts:487` | Individual Tikkie payment receipts       |

### Identity/Auth Tables

Better-Auth session management.

| Table           | Location              | Purpose                   |
| --------------- | --------------------- | ------------------------- |
| `users`         | `convex/schema.ts:5`  | User accounts             |
| `sessions`      | `convex/schema.ts:14` | Active sessions           |
| `accounts`      | `convex/schema.ts:26` | OAuth provider accounts   |
| `verifications` | `convex/schema.ts:41` | Email verification tokens |

---

## Foreign Key Relationships (Enforced via `v.id("...")`)

These are the **only** relationships with referential integrity enforced by Convex.

### From `eventSources`

| FK Field  | References   | Cardinality | Direction             |
| --------- | ------------ | ----------- | --------------------- |
| `eventId` | `events._id` | N:1         | eventSources → events |

### From `ticketTypes`

| FK Field  | References   | Cardinality | Direction            |
| --------- | ------------ | ----------- | -------------------- |
| `eventId` | `events._id` | N:1         | ticketTypes → events |

### From `accommodationSlots`

| FK Field  | References                | Cardinality | Direction                                |
| --------- | ------------------------- | ----------- | ---------------------------------------- |
| `eventId` | `events._id`              | N:1         | accommodationSlots → events              |
| `hotelId` | `accommodationHotels._id` | N:1         | accommodationSlots → accommodationHotels |
| `roomId`  | `accommodationRooms._id`  | N:1         | accommodationSlots → accommodationRooms  |

### From `orders`

| FK Field  | References   | Cardinality    | Direction       |
| --------- | ------------ | -------------- | --------------- |
| `eventId` | `events._id` | N:1 (optional) | orders → events |

### From `orderAttendees`

| FK Field  | References   | Cardinality | Direction               |
| --------- | ------------ | ----------- | ----------------------- |
| `orderId` | `orders._id` | N:1         | orderAttendees → orders |

### From `orderTicketSelections` (3-way junction)

| FK Field       | References           | Cardinality | Direction                              |
| -------------- | -------------------- | ----------- | -------------------------------------- |
| `orderId`      | `orders._id`         | N:1         | orderTicketSelections → orders         |
| `attendeeId`   | `orderAttendees._id` | N:1         | orderTicketSelections → orderAttendees |
| `ticketTypeId` | `ticketTypes._id`    | N:1         | orderTicketSelections → ticketTypes    |

### From `orderAssignments` (3-way junction)

| FK Field     | References               | Cardinality | Direction                             |
| ------------ | ------------------------ | ----------- | ------------------------------------- |
| `orderId`    | `orders._id`             | N:1         | orderAssignments → orders             |
| `attendeeId` | `orderAttendees._id`     | N:1         | orderAssignments → orderAttendees     |
| `slotId`     | `accommodationSlots._id` | N:1         | orderAssignments → accommodationSlots |

### From `orderIdempotency`

| FK Field  | References   | Cardinality | Direction                 |
| --------- | ------------ | ----------- | ------------------------- |
| `eventId` | `events._id` | N:1         | orderIdempotency → events |
| `orderId` | `orders._id` | N:1         | orderIdempotency → orders |

### From `ticketTailorOrders` (extension)

| FK Field  | References   | Cardinality | Direction                   |
| --------- | ------------ | ----------- | --------------------------- |
| `orderId` | `orders._id` | 1:1         | ticketTailorOrders → orders |

### From `ticketTailorAttendees` (extension)

| FK Field     | References           | Cardinality    | Direction                              |
| ------------ | -------------------- | -------------- | -------------------------------------- |
| `orderId`    | `orders._id`         | N:1            | ticketTailorAttendees → orders         |
| `attendeeId` | `orderAttendees._id` | 1:1 (optional) | ticketTailorAttendees → orderAttendees |

---

## String-ID Relationships (NOT Enforced)

These fields reference other tables by string value only. No referential integrity.

### Accommodation Domain

| Table                      | Field        | References (string)          | Enforced? |
| -------------------------- | ------------ | ---------------------------- | --------- |
| `accommodationEventHotels` | `eventId`    | `events._id`                 | ❌ No     |
| `accommodationEventHotels` | `hotelId`    | `accommodationHotels._id`    | ❌ No     |
| `accommodationRooms`       | `hotelId`    | `accommodationHotels._id`    | ❌ No     |
| `accommodationRooms`       | `roomTypeId` | `accommodationRoomTypes._id` | ❌ No     |

### Order Attendees

| Table            | Field            | References (string)      | Enforced? |
| ---------------- | ---------------- | ------------------------ | --------- |
| `orderAttendees` | `assignedRoomId` | `accommodationRooms._id` | ❌ No     |

### Ticket Tailor Attendees

| Table                   | Field            | References (string)      | Enforced? |
| ----------------------- | ---------------- | ------------------------ | --------- |
| `ticketTailorAttendees` | `assignedRoomId` | `accommodationRooms._id` | ❌ No     |

### Tikkie Finance Domain

| Table                          | Field           | References (string)      | Enforced? |
| ------------------------------ | --------------- | ------------------------ | --------- |
| `tikkiePaymentTemplates`       | `eventId`       | `events._id`             | ❌ No     |
| `tikkiePaymentLinks`           | `orderId`       | `orders._id`             | ❌ No     |
| `tikkiePaymentLinks`           | `eventId`       | `events._id`             | ❌ No     |
| `tikkiePaymentLinkTransitions` | `paymentLinkId` | `tikkiePaymentLinks._id` | ❌ No     |
| `tikkiePayments`               | `paymentLinkId` | `tikkiePaymentLinks._id` | ❌ No     |
| `tikkiePayments`               | `orderId`       | `orders._id`             | ❌ No     |

### Payments

| Table      | Field      | References (string)                 | Enforced? |
| ---------- | ---------- | ----------------------------------- | --------- |
| `payments` | `orderId`  | `orders._id`                        | ❌ No     |
| `payments` | `sourceId` | variable (tikkiePaymentLinks, etc.) | ❌ No     |

### Room Allocations

| Table             | Field     | References (string)      | Enforced? |
| ----------------- | --------- | ------------------------ | --------- |
| `roomAllocations` | `eventId` | `events._id`             | ❌ No     |
| `roomAllocations` | `roomId`  | `accommodationRooms._id` | ❌ No     |

### Family Groups

| Table                   | Field               | References (string)        | Enforced? |
| ----------------------- | ------------------- | -------------------------- | --------- |
| `attendeeFamilyGroups`  | `primaryAttendeeId` | `orderAttendees._id`       | ❌ No     |
| `attendeeFamilyMembers` | `familyGroupId`     | `attendeeFamilyGroups._id` | ❌ No     |
| `attendeeFamilyMembers` | `attendeeId`        | `orderAttendees._id`       | ❌ No     |

---

## Index Relationships (How Tables Are Queried Together)

### Event-Centric Queries

```
events (by_slug, by_startsAt)
  └─ eventSources (by_eventId, by_eventId_and_provider)
  └─ ticketTypes (by_eventId, by_eventId_and_availabilityState)
  └─ accommodationSlots (by_eventId, by_eventId_and_isAssignable)
  └─ orders (by_eventId)
  └─ orderIdempotency (by_eventId_and_idempotencyKey, by_eventId_and_fingerprint)
  └─ accommodationEventHotels (eventId_hotelId)  -- string join
  └─ tikkiePaymentTemplates (eventId, eventId_ticketType)  -- string join
  └─ roomAllocations (eventId_roomId, eventId_status)  -- string join
```

### Order-Centric Queries

```
orders (by_eventId, by_bookingRef, by_status, by_providerOrderId, by_providerEventId)
  ├─ orderAttendees (by_orderId)
  │   └─ orderTicketSelections (by_orderId)
  │   └─ orderAssignments (by_orderId, by_attendeeId)
  │   └─ ticketTailorAttendees (by_email, by_assignedRoomId)  -- string join on assignedRoomId
  ├─ orderTicketSelections (by_orderId)
  ├─ orderAssignments (by_orderId)
  ├─ orderIdempotency (by_eventId_and_idempotencyKey)
  ├─ ticketTailorOrders (orderId, providerOrderId, providerEventId)
  ├─ ticketTailorAttendees (orderId, attendeeId)
  ├─ tikkiePaymentLinks (orderId)  -- string join
  ├─ tikkiePayments (orderId)  -- string join
  └─ payments (orderId)  -- string join
```

### Accommodation-Centric Queries

```
accommodationHotels (name)
  ├─ accommodationRooms (hotelId_label, hotelId_capacity)  -- string join
  ├─ accommodationEventHotels (hotelId, eventId_hotelId)  -- string join
  └─ accommodationSlots (via hotelId FK)

accommodationRoomTypes (label)
  └─ accommodationRooms (roomTypeId)  -- string join

accommodationSlots (by_eventId, by_eventId_and_isAssignable)
  └─ orderAssignments (by_slotId)
  └─ accommodationRooms (via roomId FK)

accommodationRooms
  └─ orderAttendees (by_assignedRoomId)  -- string join
  └─ ticketTailorAttendees (by_assignedRoomId)  -- string join
  └─ roomAllocations (eventId_roomId)  -- string join
```

### Family Group Queries

```
attendeeFamilyGroups (primaryAttendeeId)
  └─ attendeeFamilyMembers (familyGroupId, attendeeId)  -- string join
```

### Tikkie Payment Flow

```
tikkiePaymentTemplates (eventId_ticketType)
  └─ tikkiePaymentLinks (providerOrderEvent, orderId, eventId, eventId_linkType)
      ├─ tikkiePaymentLinkTransitions (paymentLinkId)  -- string join
      └─ tikkiePayments (paymentLinkId, paymentRequestToken)  -- string join
```

### Ticket Tailor Sync Flow

```
ticketTailorWebhookEvents (providerEventId, status_nextRetry, eventType)
  └─ ticketTailorOrders (providerEventId, providerOrderId)  -- string join
      └─ orders (by_providerOrderId, by_providerEventId)  -- FK via orderId

ticketTailorEvents (providerEventId, startsAt)
  └─ eventSources (by_provider_and_externalEventId)  -- FK to events
```

---

## Relationship Graph

### Core Domain Graph

```
                    ┌─────────────┐
                    │   events    │
                    │  (canonical) │
                    └──────┬──────┘
                           │ 1
                           │
              ┌────────────┼────────────────┐
              │            │                │
              │ N          │ N              │ N
     ┌────────▼───┐ ┌──────▼──────┐  ┌──────▼──────────┐
     │eventSources│ │ ticketTypes │  │accommodationSlots│
     └────────────┘ └──────┬──────┘  └──────┬──────────┘
                           │                │
                           │ N              │ N
                    ┌──────▼──────┐    ┌────▼─────┐
                    │orderTicket  │    │order     │
                    │Selections   │    │Assignments│
                    └──────┬──────┘    └────┬─────┘
                           │                │
              ┌────────────┘                │
              │ N                           │
     ┌────────▼──────┐                      │
     │  orderAttendees│◄─────────────────────┘
     │  (canonical)  │
     └───────┬───────┘
             │ N
      ┌──────▼──────┐
      │   orders    │
      │  (canonical)│
      └──────┬──────┘
             │
             │ 1 (optional eventId)
             │
      ┌──────▼──────┐
      │   events    │  (back-reference)
      └─────────────┘
```

### Extension Pattern (Ticket Tailor)

```
  Provider API
       │
       ▼
┌──────────────────────┐         ┌──────────────────┐
│ ticketTailorOrders   │──FK────►│     orders       │
│ (extension table)    │  1:1    │  (canonical)     │
│                      │         │                  │
│ providerOrderId (str)│         │ providerOrderId  │
│ providerEventId (str)│         │ providerEventId  │
│ orderId (FK) ────────┼────────►│ _id              │
└──────────────────────┘         └──────────────────┘

┌──────────────────────┐         ┌──────────────────┐
│ticketTailorAttendees │──FK────►│  orderAttendees  │
│ (extension table)    │  1:1    │   (canonical)    │
│                      │         │                  │
│ orderId (FK) ────────┼──┐      │ attendeeId (FK)  │
│ attendeeId (FK opt)──┼──┼─────►│ _id              │
│                      │  │      └──────────────────┘
└──────────────────────┘  │
                          │    ┌──────────────────┐
                          └───►│     orders       │
                               │  (canonical)     │
                               └──────────────────┘
```

### Accommodation Hierarchy

```
┌──────────────────┐
│accommodationHotels│
│  (canonical)     │
└────────┬─────────┘
         │ 1
         │
    ┌────┴────┐
    │ N       │ N (string joins)
    │         │
┌───▼─────┐ ┌─▼─────────────────────┐
│accommod.│ │accommodationEventHotels│
│ Rooms   │ │ (junction: event-hotel)│
└───┬─────┘ └─┬─────────────────────┘
    │ 1       │ (string eventId, string hotelId)
    │         │
┌───▼──────┐  │    ┌─────────────┐
│accommod. │  └───►│   events    │
│ Slots    │       │ (canonical) │
│ (FK to  │       └─────────────┘
│  events,│
│  hotels,│
│  rooms) │
└─────────┘
    │
    │ N (via slotId FK)
    │
┌───▼──────────┐
│orderAssignments│
│  (junction)   │
└──────────────┘
```

### Finance/Tikkie Flow

```
┌─────────────────────┐
│tikkiePaymentTemplates│
│ (eventId str,       │
│  ticketTypeLabel)   │
└─────────────────────┘
         │
         │ (string eventId join)
         ▼
┌─────────────────────┐
│ tikkiePaymentLinks  │
│ (orderId str,       │
│  eventId str,       │
│  paymentRequestToken)│
└──────────┬──────────┘
           │ 1
           │
     ┌─────┴─────┐
     │ N         │ N
     │           │
┌────▼──────┐ ┌──▼────────────────────┐
│tikkie     │ │tikkiePaymentLink       │
│Payments   │ │Transitions            │
│(actual    │ │(audit log)            │
│ payments) │ │                       │
└────┬──────┘ └───────────────────────┘
     │
     │ (string orderId join)
     ▼
┌─────────────┐
│  payments   │
│ (canonical) │
│ (orderId str)│
└──────┬──────┘
       │
       │ (string orderId join)
       ▼
┌─────────────┐
│   orders    │
│ (canonical) │
└─────────────┘
```

---

## Orphaned Relationships & Missing Links

### 1. String IDs Where FKs Should Be

**High Impact:**

| Table                      | Field           | Should Reference             | Problem                                                     |
| -------------------------- | --------------- | ---------------------------- | ----------------------------------------------------------- |
| `accommodationRooms`       | `hotelId`       | `accommodationHotels._id`    | Rooms can reference non-existent hotels. No cascade delete. |
| `accommodationRooms`       | `roomTypeId`    | `accommodationRoomTypes._id` | Rooms can reference non-existent room types.                |
| `accommodationEventHotels` | `eventId`       | `events._id`                 | Event-hotel links can dangle when events are deleted.       |
| `accommodationEventHotels` | `hotelId`       | `accommodationHotels._id`    | Links can reference deleted hotels.                         |
| `payments`                 | `orderId`       | `orders._id`                 | Payments can reference non-existent orders.                 |
| `tikkiePaymentLinks`       | `orderId`       | `orders._id`                 | Payment links can dangle.                                   |
| `tikkiePayments`           | `paymentLinkId` | `tikkiePaymentLinks._id`     | Payments can reference deleted links.                       |

**Medium Impact:**

| Table                    | Field               | Should Reference           | Problem                                       |
| ------------------------ | ------------------- | -------------------------- | --------------------------------------------- |
| `orderAttendees`         | `assignedRoomId`    | `accommodationRooms._id`   | Room assignments can reference deleted rooms. |
| `ticketTailorAttendees`  | `assignedRoomId`    | `accommodationRooms._id`   | Same issue in extension table.                |
| `roomAllocations`        | `eventId`           | `events._id`               | Allocations can dangle.                       |
| `roomAllocations`        | `roomId`            | `accommodationRooms._id`   | Allocations can reference deleted rooms.      |
| `attendeeFamilyMembers`  | `familyGroupId`     | `attendeeFamilyGroups._id` | Family members can dangle.                    |
| `attendeeFamilyMembers`  | `attendeeId`        | `orderAttendees._id`       | Members can reference deleted attendees.      |
| `attendeeFamilyGroups`   | `primaryAttendeeId` | `orderAttendees._id`       | Primary attendee can be deleted.              |
| `tikkiePaymentTemplates` | `eventId`           | `events._id`               | Templates can dangle.                         |

### 2. Missing Direct Links

**Event ↔ Ticket Tailor Events:**

- `ticketTailorEvents` has no FK or string reference to `events`. The relationship is only through `eventSources.externalEventId` = `ticketTailorEvents.providerEventId`. This requires a two-hop join: `ticketTailorEvents` → (match `providerEventId` to `externalEventId`) → `eventSources` → `events`.
- **Impact:** Every query that needs to map provider events to canonical events must go through `eventSources`.

**Ticket Tailor Attendees ↔ Ticket Types:**

- `ticketTailorAttendees` stores `providerTicketTypeId` (string) but has no link to `ticketTypes._id`. The mapping is purely by label matching (`ticketTypeLabel`).
- **Impact:** Cannot directly query "which attendees have which canonical ticket types" without string matching.

**Tikkie Payments ↔ Canonical Payments:**

- `tikkiePayments` and `payments` are parallel tables. `tikkiePayments` has `matchStatus` but no FK to `payments`. The `payments` table has `source: "tikkie"` and `sourceId` (string) that could link back, but it's not enforced.
- **Impact:** Reconciliation between Tikkie receipts and canonical payment records is done in application code, not at the data layer.

### 3. Dual-Source Relationships

**Order Attendees ↔ Rooms (two paths):**

- `orderAttendees.assignedRoomId` (string) — direct assignment
- `orderAssignments` → `accommodationSlots` → `accommodationRooms` — assignment through slots
- `ticketTailorAttendees.assignedRoomId` (string) — extension table also tracks room
- **Impact:** Three different ways to express "attendee is in room." These can get out of sync.

**Orders ↔ Events (two paths):**

- `orders.eventId` (FK, optional) — direct link
- `orders.providerEventId` (string) → `ticketTailorEvents.providerEventId` → `eventSources` → `events`
- **Impact:** An order's event can be determined two different ways. If `eventId` is null, must use the provider path.

### 4. No Cascade Behavior

Because many relationships use string IDs instead of `v.id()`, there is **no cascade delete** anywhere in the schema. Deleting an event, order, hotel, or room will leave orphaned references in:

- Deleting `events`: orphaned `eventSources`, `ticketTypes`, `accommodationSlots`, `orderIdempotency`, `accommodationEventHotels` (string), `roomAllocations` (string), `tikkiePaymentTemplates` (string)
- Deleting `orders`: orphaned `orderAttendees`, `orderTicketSelections`, `orderAssignments`, `orderIdempotency`, `ticketTailorOrders`, `ticketTailorAttendees`, `tikkiePaymentLinks` (string), `tikkiePayments` (string), `payments` (string)
- Deleting `accommodationHotels`: orphaned `accommodationRooms` (string), `accommodationEventHotels` (string), `accommodationSlots` (FK — this one IS enforced)
- Deleting `accommodationRooms`: orphaned `accommodationSlots` (FK — enforced), `orderAttendees.assignedRoomId` (string), `ticketTailorAttendees.assignedRoomId` (string), `roomAllocations` (string)

---

## Cardinality Summary

| From                   | To                           | Type | Via           |
| ---------------------- | ---------------------------- | ---- | ------------- |
| events                 | eventSources                 | 1:N  | FK            |
| events                 | ticketTypes                  | 1:N  | FK            |
| events                 | accommodationSlots           | 1:N  | FK            |
| events                 | orders                       | 1:N  | FK (optional) |
| events                 | orderIdempotency             | 1:N  | FK            |
| events                 | accommodationEventHotels     | 1:N  | string        |
| events                 | tikkiePaymentTemplates       | 1:N  | string        |
| events                 | roomAllocations              | 1:N  | string        |
| orders                 | orderAttendees               | 1:N  | FK            |
| orders                 | orderTicketSelections        | 1:N  | FK            |
| orders                 | orderAssignments             | 1:N  | FK            |
| orders                 | orderIdempotency             | 1:N  | FK            |
| orders                 | ticketTailorOrders           | 1:1  | FK            |
| orders                 | ticketTailorAttendees        | 1:N  | FK            |
| orders                 | tikkiePaymentLinks           | 1:N  | string        |
| orders                 | tikkiePayments               | 1:N  | string        |
| orders                 | payments                     | 1:N  | string        |
| orderAttendees         | orderTicketSelections        | 1:N  | FK            |
| orderAttendees         | orderAssignments             | 1:N  | FK            |
| orderAttendees         | ticketTailorAttendees        | 1:1  | FK (optional) |
| orderAttendees         | attendeeFamilyMembers        | 1:N  | string        |
| ticketTypes            | orderTicketSelections        | 1:N  | FK            |
| accommodationHotels    | accommodationRooms           | 1:N  | string        |
| accommodationHotels    | accommodationSlots           | 1:N  | FK            |
| accommodationHotels    | accommodationEventHotels     | 1:N  | string        |
| accommodationRoomTypes | accommodationRooms           | 1:N  | string        |
| accommodationRooms     | accommodationSlots           | 1:N  | FK            |
| accommodationSlots     | orderAssignments             | 1:N  | FK            |
| attendeeFamilyGroups   | attendeeFamilyMembers        | 1:N  | string        |
| tikkiePaymentLinks     | tikkiePaymentLinkTransitions | 1:N  | string        |
| tikkiePaymentLinks     | tikkiePayments               | 1:N  | string        |
| users                  | sessions                     | 1:N  | string        |
| users                  | accounts                     | 1:N  | string        |

---

_Relationship analysis: 2026-04-01_
