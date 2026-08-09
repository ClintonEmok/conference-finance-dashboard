# Architecture Research: Accommodation Upgrades & Options (v5.0)

**Domain:** Conference finance dashboard — accommodation catalog/configuration/options integration
**Researched:** 2026-08-05
**Confidence:** HIGH for integration points and data flow (verified against `convex/schema.ts`, `convex/finance.ts`, `convex/signupSubmission.ts`, `convex/signupCatalog.ts`, `convex/publicTracking.ts`, `convex/accommodation.ts`, `lib/domain/finance/amounts.ts`); MEDIUM for new-table naming and shape (design recommendation, not yet validated with stakeholders).

## Executive Framing

The v5.0 milestone does **not** introduce a new subsystem. It adds one new order-scoped record type (`orderAccommodationSelections` + option children), a reusable catalog with event-scoped pricing, and three behavioral changes to existing surfaces:

1. **Amount-due derivation** — the single canonical loader `convex/finance.ts → loadOrderAmountDueBreakdowns` is the choke point. Extend it once and every consumer (public tracking, order ledger, payments, reports, attendees, internal sync, allocation board) picks up accommodation charges with **zero consumer changes**. This is the highest-leverage integration in the milestone.
2. **Signup semantics shift** — the public signup stops reserving concrete bed slots and instead records *preferences* (category/occupancy, upgrade, cot, age band). Final placement remains admin-controlled via the existing `orderAssignments` / `orderAttendees.assignedRoomId` machinery. Preferences and placement are two different records and must stay separate.
3. **Re-pricing is a feature, not a bug** — the existing system derives money at read time (`ticketTypes.priceMinor` × selections; no price snapshots anywhere). The track-payment permalink "allows configuration changes before admin confirmation and re-prices the order" is only coherent if accommodation charges are **derived dynamically from event config at read time**, exactly like ticket prices today. Do not snapshot option prices into selection rows.

## Recommended Architecture

### System Overview

```
┌─────────────────────────── CATALOG LAYER (reusable, global) ───────────────────────────┐
│  accommodationCategories            accommodationOptionDefinitions (kind:               │
│  (label, sortOrder, description)     upgrade | cot | age_band | resource)               │
│                                        ▲                                                 │
│  accommodationRoomTypes [MODIFIED]    │ (categoryId, description, sortOrder added)      │
└───────────────────────────────────────┼─────────────────────────────────────────────────┘
                                        │
┌────────────────────────── EVENT CONFIG LAYER (event-scoped, per event) ────────────────┐
│  accommodationEventConfig (one row/event: toggles, confirmation policy)                 │
│  accommodationEventRoomTypeRates (eventId, roomTypeId, baseRateMinor, availability)     │
│  accommodationEventOptions        (eventId, optionDefinitionId, priceMinor, enabled)    │
└───────────────────────────────────────┼─────────────────────────────────────────────────┘
                                        │ validated against + priced from
┌────────────────────────── ORDER LAYER (per order) ─────────────────────────────────────┐
│  orderAccommodationSelections         ──(child)── orderAccommodationOptionSelections    │
│  (orderId, attendeeId, roomTypeId,    (selectionId, optionDefinitionId, quantity)      │
│   ageBandId?, assignmentState, confirmedAt/By)                                           │
│                                                                                         │
│  existing: orderTicketSelections  ·  orderAssignments (placement)  ·  orderAttendees    │
└───────────────────────────────────────┼─────────────────────────────────────────────────┘
                                        │
┌────────────────────────── CANONICAL FINANCE LAYER ─────────────────────────────────────┐
│  convex/finance.ts → loadOrderAmountDueBreakdowns [MODIFIED]                            │
│  lib/domain/finance/amounts.ts → deriveOrderAmountBreakdown [MODIFIED]                 │
│    = ticket selections × ticketTypes.priceMinor + accommodation selections × event rates│
└───────────────┬─────────────────────────────────────────────────────────────────────────┘
                │ same signature → zero consumer changes
   ┌────────────┼─────────────┬──────────────┬──────────────┐
   ▼            ▼             ▼              ▼              ▼
publicTracking  orders ledger  payments      reports        attendees / sync / allocation
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Catalog (global) | Reusable definitions: categories, room types with descriptions, option/age-band definitions | Extend `accommodationRoomTypes` additively; new `accommodationCategories`, `accommodationOptionDefinitions` |
| Event config (per event) | Rates, availability, enabled options, confirmation policy for one event | New `accommodationEventConfig`, `accommodationEventRoomTypeRates`, `accommodationEventOptions` |
| Signup catalog | Publishes selectable options (not slots) to public signup, filtered by ticket entitlement | Modify `convex/signupCatalog.ts` + `lib/domain/signup/catalog.ts` |
| Signup submission | Validates and persists per-attendee accommodation preferences | Modify `convex/signupSubmission.ts` envelope + restore payload; insert `orderAccommodationSelections` |
| Canonical finance | Derives amount-due = tickets + accommodation, per order and per attendee | Modify `convex/finance.ts` + `lib/domain/finance/amounts.ts` (pure function) |
| Track payment | Booking-ref permalink; shows/re-prices; lets buyer edit options pre-confirmation | New `app/track-payment/[bookingRef]/page.tsx`; new public mutation for editing selections |
| Admin config | "Upgrades & Options" tab: rates, options, age bands, availability, descriptions | New admin queries/mutations over event config + catalog tables |
| Allocation board | Shows paid attendees highlighted, unpaid grayed; paid-first ordering | Modify `getRoomAllocationBoard` in `convex/accommodation.ts` to join canonical payment/amount-due |
| Tikkie links | Payment links whose amount must match canonical amount-due incl. accommodation | Modify template match / link regeneration in `lib/domain/finance/tikkie-templates.ts` + `convex/tikkie.ts` |

## New vs Modified (explicit)

### New tables (all additive; no destructive migration)

| Table | Scope | Purpose | Key shape |
|-------|-------|---------|-----------|
| `accommodationCategories` | global | Reusable category/occupancy groupings ("Standard", "Superior", ...) | `label`, `description?`, `sortOrder`; index `by_sortOrder` |
| `accommodationOptionDefinitions` | global | Reusable option definitions incl. age bands via `kind` discriminator | `kind` ("upgrade"\|"cot"\|"age_band"\|"resource"), `label`, `description?`, `minAge?`, `maxAge?`, `sortOrder`; index `by_kind` |
| `accommodationEventConfig` | event | One row per event: feature toggles (age bands enabled, require category), confirmation policy | `eventId` (FK `v.id("events")`); index `by_eventId` |
| `accommodationEventRoomTypeRates` | event | Rate + availability per room type per event | `eventId` FK, `roomTypeId` FK (`v.id("accommodationRoomTypes")`), `baseRateMinor`, `availabilityState` ("selectable"\|"unavailable"), `updatedAt`; indexes `by_eventId`, `by_eventId_and_roomTypeId` |
| `accommodationEventOptions` | event | Price + enabled state per option definition per event (incl. age bands) | `eventId` FK, `optionDefinitionId` FK, `priceMinor`, `enabled`, `sortOrder`; indexes `by_eventId`, `by_eventId_and_optionDefinitionId` |
| `orderAccommodationSelections` | order | Buyer's per-attendee accommodation preferences; mutable until admin confirmation | `orderId` FK, `attendeeId` FK, `roomTypeId` FK, `ageBandId?` FK, `assignmentState` ("selected"\|"confirmed"\|"removed"), `confirmedAt?`, `confirmedBy?`; indexes `by_orderId`, `by_attendeeId`, `by_orderId_and_assignmentState` |
| `orderAccommodationOptionSelections` | order | Child rows for each chosen option on a selection | `selectionId` FK, `optionDefinitionId` FK, `quantity`; indexes `by_selectionId` |

Notes:
- Follow the Convex guideline: **child collections live in their own tables** (`orderAccommodationOptionSelections`), not as unbounded arrays inside `orderAccommodationSelections`. A small bounded `optionIds` array is defensible, but the child table is more robust for admin adjustment and audit, and matches how the codebase models `orderTicketSelections`/`orderAssignments` as child rows.
- New tables should use typed FKs (`v.id(...)`) — the accommodation domain is the worst offender for string-ID joins today (`TABLE_RELATIONSHIPS.md` §Orphaned Relationships). Do not repeat that pattern in new tables.
- Index naming per Convex convention `by_field1_and_field2`.

### Modified tables / modules

| Target | Change | Why |
|--------|--------|-----|
| `accommodationRoomTypes` | Add `categoryId?` (FK), `description?`, `sortOrder?`, `isActive?` | Catalog needs category membership + buyer-facing descriptions; additive only, keeps existing rows valid |
| `convex/signupCatalog.ts` + `lib/domain/signup/catalog.ts` | Return options catalog (room types w/ rates, upgrade, cot, age bands) instead of / alongside assignable slots; eligibility from event config availability | Buyers select options, not bed slots |
| `convex/signupSubmission.ts` | Envelope gains `accommodationSelections: [{ attendeeKey, roomTypeId, optionIds?, ageBandId? }]`; validate against event config + ticket entitlement + availability; insert selection rows; include selections in `restorePayload` and `buildRestorePayload` | Persist preferences at submit; replay-safe |
| `convex/finance.ts` (`loadOrderAmountDueBreakdowns`) | Also load `orderAccommodationSelections` + event rates/options and fold into breakdown | **Single choke point** — all finance consumers update automatically |
| `lib/domain/finance/amounts.ts` (`deriveOrderAmountBreakdown`) | Accept accommodation line items alongside ticket selections; sum into `amountDueMinor` and `amountDueByAttendeeId` | Pure, testable derivation |
| `convex/publicTracking.ts` | No logic change required (uses loader); add accommodation selections to response for the permalink page | Tracking auto-correct once loader extends |
| `convex/signupSubmission.ts` `getByBookingRef` | Replace inline `ticketSelections.reduce(...)` total (lines ~850-854) with `loadOrderAmountDueBreakdowns` | This is a **duplicate money calculation** that diverges from canonical totals; accommodation makes the divergence visible |
| `convex/accommodation.ts` `getRoomAllocationBoard` | Attach `amountDueMinor` + `paymentStatus` ("unpaid"\|"partial"\|"paid"\|"overpaid") + `isPaid` to occupants, unassigned attendees, and queue rows; paid-first sort | "Allocation prioritizes paid attendees" |
| `lib/domain/finance/tikkie-templates.ts` + `convex/tikkie.ts` | Order payment-link amount must include accommodation (derive from per-attendee canonical amount-due, or regenerate order link after admin confirmation) | Prevents link-amount vs amount-due mismatch on the tracking page |
| `app/track-payment/page.tsx` | Becomes a lookup page that redirects to `/track-payment/[bookingRef]` | Milestone requirement; preserve the existing entry (deep-link constraint) |
| New `app/track-payment/[bookingRef]/page.tsx` | Renders canonical tracking + editable accommodation options pre-confirmation | Permalink with re-pricing |
| `convex/emailActions.ts` signup confirmation | List selected options; payment amount includes accommodation | Buyer confirmation email truthfulness |
| `lib/types/signup.ts` | New validators/types for accommodation selections + error codes (`OPTION_UNAVAILABLE`, `OPTION_CAPACITY_EXCEEDED`, `ACCOMMODATION_CONFIRMED`) | Typed contract boundary |

### Not changed (deliberately)

- `orderAssignments` + `accommodationSlots` + `orderAttendees.assignedRoomId` — remain the **placement** record; admin assigns final rooms through the existing workspace. Do not overload slots with option semantics.
- `orders.totalAmountMinor` — stays the provider/write-time total; canonical amount-due continues to be derived at read time (`amountDueBreakdown?.amountDueMinor ?? order.totalAmountMinor ?? 0` everywhere).
- `payments` matching, reconciliation, donation semantics — untouched; accommodation only shifts the amount-due side of the balance.
- `ticketTypes.roomTypeId` — remains the single entitlement field for SEED-002 alignment; multi-room-type `roomTypeIds` array is deferred (see Open Questions).

## Integration Points

### 1. Schema ↔ amount-due (the critical seam)

`loadOrderAmountDueBreakdowns(ctx, orders)` currently:
- queries `orderTicketSelections` by orderId (bounded `take(100)`),
- collects `ticketTypeIds`, loads `ticketTypes`, builds `ticketTypePriceById`,
- calls pure `deriveOrderAmountBreakdown({ selections, ticketTypePriceById })`.

Extension plan (keep the function signature; extend internals):
1. After loading selections, collect `orderAccommodationSelections` by the same orderIds (bounded `take`, `by_orderId` index).
2. Collect unique `eventId` from the input orders; load `accommodationEventRoomTypeRates` + `accommodationEventOptions` once per event (batch, not N+1).
3. Build a price map: `roomTypeRateByEventAndRoomType` and `optionPriceByEventAndOption`.
4. Produce accommodation line items (`{ attendeeId, priceMinor }`) and pass both ticket + accommodation lines into an extended `deriveOrderAmountBreakdown` (or a new pure helper `deriveAccommodationAmountMinor` added in `amounts.ts`, called alongside the existing derivation and summed).

Consumers that automatically become correct (verified call sites):
`convex/publicTracking.ts` (×2), `convex/orders.ts` (ledger, detail, syncFullyPaidOrders), `convex/payments.ts`, `convex/reports.ts` (×3), `convex/attendees.ts`, `convex/sync/internal.ts`.

Tests to require: extend `tests/finance/money-model.test.ts` with accommodation line items (per-attendee attribution, zero-price options, attendee map accumulation).

### 2. Catalog → signup catalog → signup submission

- `signupCatalog.getPublicSignupCatalog` accommodation section changes from "assignable slots" to an options view: for the event, list enabled room types (from `accommodationEventRoomTypeRates` joined to `accommodationRoomTypes` descriptions), their base rate, availability; plus enabled options (`accommodationEventOptions` joined to `accommodationOptionDefinitions`: superior upgrade, cot, age bands). `accommodationIneligibilityReason` gains a `no_configured_options` reason; "no_assignable_inventory" becomes legacy.
- Ticket entitlement: an attendee's eligible room types = `ticketType.roomTypeId` if set, else all enabled room types for the event (matches SEED-002's "omitted ⇒ all allowed" and the existing fallback to `event.defaultRoomTypeId` in `signupSubmission.ts` ~line 619).
- `submitSignupEnvelope` validation order: attendee keys → ticket selections (unchanged) → **accommodation selections** (attendee exists; roomTypeId is event-enabled and ticket-entitled; optionIds are event-enabled; ageBandId event-enabled if provided; availability counts not exceeded per room type) → assignments (unchanged placement validation).
- Capacity semantics shift: today capacity = ticket count vs assignable slot count (`CAPACITY_EXCEEDED`). With options-only signup, capacity checks move to per-room-type availability in event config. Keep the old slot-based check only for events that still expose slot assignment (back-compat) or remove once signup fully migrates.

### 3. Track-payment permalink

- Route: `app/track-payment/[bookingRef]` renders `publicTracking.getByBookingRef` (canonical) + the order's accommodation selections (new read) + edit controls.
- New public mutation `updateOrderAccommodationSelections({ bookingRef, selections })`:
  - guards: order exists by normalized bookingRef; no `confirmedAt` on any selection row (or an order-level `accommodationConfirmedAt` on `accommodationEventConfig` policy); selections still valid against event config; idempotency not needed (low-stakes edits) but bounded and validated;
  - re-validates availability (admin may have changed config mid-edit — same spirit as the existing slot `isAssignable` re-check);
  - amount-due re-prices automatically because the loader derives from current config — no recompute step in the mutation.
- New admin mutation `confirmOrderAccommodationSelections({ orderId })`: sets `confirmedAt/confirmedBy` on selection rows; optionally regenerates the Tikkie order link with the canonical total (see Tikkie integration).

### 4. Tikkie payment links (must not drift)

Today per-attendee links come from `matchTemplateForAttendee` (ticket-type templates, `tikkieAmountOverrideMinor` override). If amount-due includes accommodation but the link is ticket-only, the tracking page shows a paid % against a larger amount-due than the link asks for. Recommended: after admin confirmation (or at link creation when selections exist), derive the order link amount from the canonical per-attendee amount-due (tickets + accommodation) rather than the template. This mirrors how `syncFullyPaidOrders` already trusts the canonical loader.

### 5. Allocation board paid-priority

`getRoomAllocationBoard` already loads `allOrders` (scoped). Add:
- `loadOrderAmountDueBreakdowns(ctx, scopedOrders)` + `loadMatchedPaymentTotalsByOrderId(ctx, scopedOrders)` (both exist; reused, not re-implemented),
- per attendee: `paymentStatus` from their order's due vs paid (reuse `deriveBalanceAmounts` / `isOrderAppliedPayment` semantics — the board must not recalculate money; it consumes canonical totals),
- surface `isPaid` on occupants, unassigned attendees, and `submissionQueueRows`; sort unassigned/queue paid-first; highlight paid names, gray unpaid (UI concern, driven by this data).

Bound this by event-scoping and existing `.take()` limits; the payments-side loader (`payments.take(2000)`) is pre-existing and already used at this scale (see Scaling).

## Data Flows

### Signup → Order → Amount-due → Tracking

```
Buyer picks ticket + accommodation options (category/occupancy, upgrade, cot, age band)
   │  (options filtered by ticket entitlement from signupCatalog)
   ▼
submitSignupEnvelope(accommodationSelections=[...])
   ├─ validate: attendee keys, ticket availability (unchanged),
   │            option availability, room-type entitlement, per-type availability
   ├─ insert orders, orderAttendees, orderTicketSelections (unchanged)
   ├─ insert orderAccommodationSelections + orderAccommodationOptionSelections   [NEW]
   └─ orderAssignments: only for legacy slot flow; otherwise none (admin assigns later)
   │
   ▼
loadOrderAmountDueBreakdowns(order)                       [MODIFIED]
   ├─ orderTicketSelections × ticketTypes.priceMinor      (unchanged)
   └─ orderAccommodationSelections × event rates/options  [NEW]
   ▼
publicTracking.getByBookingRef(bookingRef)  →  amountDue incl. accommodation  (unchanged call)
   ▼
/track-payment/[bookingRef]  ← buyer edits options → updateOrderAccommodationSelections
   → loader re-derives amount-due → progress bar updates → admin confirms →
     confirmOrderAccommodationSelections (locks edits, regenerates Tikkie link w/ total)
```

### Allocation board

```
getRoomAllocationBoard(eventId)
   ├─ load scoped orders/attendees/rooms/slots (unchanged)
   ├─ loadOrderAmountDueBreakdowns(scopedOrders) + loadMatchedPaymentTotalsByOrderId   [NEW]
   ├─ compute per-attendee paymentStatus/isPaid from canonical totals                  [NEW]
   ├─ occupants: paid highlighted, unpaid grayed                                       [NEW]
   ├─ unassigned queue + buyerSuggestions: paid-first sort                            [NEW]
   └─ admin assigns room via existing assignRoomToAttendee (placement unchanged)
```

## Patterns to Follow

### Pattern 1: Single canonical derivation choke point

**What:** All money presentation flows through `loadOrderAmountDueBreakdowns` + pure `deriveOrderAmountBreakdown`; UI and board never recalculate.
**When:** Any change touching amount-due (this milestone's core).
**Trade-offs:** One function to change; risk concentrated in that function — mitigate with the pure `amounts.ts` helper + unit tests (`tests/finance/money-model.test.ts`).

### Pattern 2: Preferences vs placement as separate records

**What:** `orderAccommodationSelections` = buyer preferences (mutable, priced). `orderAssignments`/`assignedRoomId` = operator placement (final, not priced). Keep the seam explicit.
**When:** The whole milestone depends on this separation (options-only signup + admin final assignment).
**Trade-offs:** Two records to keep consistent per attendee; keep the invariant "a confirmed selection may exist with no assignment yet" and surface that state in the admin order detail.

### Pattern 3: Dynamic derivation, no price snapshots

**What:** Re-price by reading current event config at read time, exactly like `ticketTypes.priceMinor` today. Re-pricing on config change is the product requirement.
**When:** Config may change before admin confirmation; canonical totals must reflect the latest state.
**Trade-offs:** Historical orders re-price if admin changes rates — acceptable and consistent with today's ticket behavior; if a hard price lock is ever required, add a `confirmedAt` boundary (already proposed), never snapshots.

### Pattern 4: Event-scoped batch reads

**What:** Load event config once per event for all orders in a batch (collect `eventId`s, load rates/options, build maps), avoid N+1 in the loader and board.
**When:** Extending `loadOrderAmountDueBreakdowns` and the allocation board.
**Trade-offs:** Slightly more plumbing; bounded `.take()` reads stay within Convex limits and keep reactivity coarse-grained per event rather than per row.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Snapshotting option prices into selection rows

**What people do:** Store `priceMinor` on `orderAccommodationSelections` "so the price is frozen."
**Why it's wrong:** Breaks the mandated re-pricing behavior and creates a second money source diverging from every canonical consumer; the rest of the system has no price snapshots.
**Do this instead:** Derive at read time from event config; lock via `confirmedAt` if a price boundary is ever needed.

### Anti-Pattern 2: Storing event config as arrays inside one document

**What people do:** `accommodationEventConfig` with `roomTypeRates: [...]`, `options: [...]` arrays.
**Why it's wrong:** Convex 1MB document cap + every update rewrites the whole doc; violates the "child items in their own table" guideline.
**Do this instead:** `accommodationEventRoomTypeRates` and `accommodationEventOptions` as separate rows keyed by `eventId`.

### Anti-Pattern 3: Reusing slots/assignments to mean options

**What people do:** Store option choices in `orderAssignments` or mint pseudo-slots per option.
**Why it's wrong:** Slots are real bed inventory with capacity/occupancy semantics; mixing preferences into them corrupts occupancy counts, `signupCatalog` slot summaries, and the allocation board.
**Do this instead:** New `orderAccommodationSelections` records; leave slot machinery for placement only.

### Anti-Pattern 4: Recalculating money in the UI or in duplicate reads

**What people do:** Recompute totals in `signupSubmission.getByBookingRef` (already happening: inline `reduce` at lines ~850-854) or in the allocation board.
**Why it's wrong:** Duplicate formulas drift; the project explicitly forbids UI-specific finance formulas (PROJECT.md constraints, v4.0 decisions).
**Do this instead:** Route every read through `loadOrderAmountDueBreakdowns`; delete the inline total in `getByBookingRef` as part of this milestone.

### Anti-Pattern 5: Tikkie link amount ≠ canonical amount-due

**What people do:** Create the payment link from the ticket template while amount-due includes accommodation.
**Why it's wrong:** Tracking page shows progress vs a total the link doesn't collect; under/over-collection confusion for the finance team.
**Do this instead:** Derive the order link amount from canonical per-attendee amount-due (or regenerate after admin confirmation).

## Scaling Considerations

| Concern | Today (v4.0) | After v5.0 | Mitigation |
|---------|--------------|------------|------------|
| Amount-due loader | `orderTicketSelections` per order, bounded `.take(100)`; `ticketTypes` deduped | + `orderAccommodationSelections` per order (bounded) + event config loaded once per event | Batch event-config loads; keep `.take()` bounds; selection rows are small |
| Payments scan | `payments.take(2000)` in `loadMatchedPaymentTotalsByOrderId` (pre-existing) | Same; allocation board now also consumes it | Reuse the existing loader; do not add a second payments scan |
| Allocation board | `orderAttendees.take(2000)`, rooms `.take(500)`, slots `.take(1000)` (pre-existing) | + canonical amount-due/payment totals for scoped orders | Same bounded reads; compute in-memory maps |
| Catalog/config tables | tiny | + 3 small config tables per event | Trivial; reactive queries fine |
| Signup capacity check | slot-count based | per-room-type availability counts | Availability counters denormalized on `accommodationEventRoomTypeRates` if contention appears |

**First bottleneck:** the amount-due loader's per-order child reads (already the pattern; grows linearly with orders per batch). Keep `.take()` bounds and event-batched config loads.
**Second bottleneck:** `loadMatchedPaymentTotalsByOrderId` full payments scan at high payment volume — pre-existing; flag for a future index/pagination change, not this milestone.

## Build Order Recommendation (for roadmap phases)

Rationale: finance derivation must exist before selections are priced; admin config before public signup can offer options; signup before the permalink can edit them; allocation last (depends on canonical totals + selections).

1. **Schema + catalog foundation** — new tables (additive), extend `accommodationRoomTypes`, typed FKs, indexes, codegen. No behavior change. *(Unblocks everything; zero risk.)*
2. **Canonical finance derivation** — extend `amounts.ts` (pure, tested) + `finance.ts` loader; delete inline total in `signupSubmission.getByBookingRef`. *(Choke point; every consumer verified by existing tests.)*
3. **Admin "Upgrades & Options" config surface** — admin CRUD over event config + catalog; descriptions/rates/availability/age bands.
4. **Signup catalog + submission** — options step, validation, selection insert, restore payload, email confirmation.
5. **Track-payment permalink** — route, edit mutation, confirmation boundary, Tikkie link amount alignment.
6. **Allocation paid-priority + SEED-002 eligibility alignment** — board joins canonical totals; ticket entitlement respected.

## Open Questions / Flags

- **Multi-room-type entitlement (SEED-002 full):** schema only has single `ticketTypes.roomTypeId`. This milestone can align with the single-field rule (set ⇒ only that type; unset ⇒ all enabled). The `roomTypeIds` array is a larger schema change — defer and decide explicitly.
- **Tikkie link regeneration timing:** derive link amount from canonical totals at creation, or regenerate after admin confirmation? Recommend: creation-time derivation with regeneration on confirmation (avoids stale links).
- **Legacy slot-based signup:** do existing events keep slot assignment, or does the options flow fully replace it? Recommend phased: options flow new/default; slot flow remains for events without config until migration verified.
- **Age-band pricing:** per-event price on `accommodationEventOptions` with `kind="age_band"` covers it; confirm whether a band affects room-type rate (occupancy) vs per-attendee add-on (option). Assumption here: per-attendee option.

## Sources

- `convex/schema.ts` — existing accommodation/order/finance tables (verified)
- `convex/finance.ts` — `loadOrderAmountDueBreakdowns`, `loadMatchedPaymentTotalsByOrderId` (verified)
- `lib/domain/finance/amounts.ts` — `deriveOrderAmountBreakdown`, `isOrderAppliedPayment`, `deriveBalanceAmounts` (verified)
- `convex/signupSubmission.ts` — envelope, validators, restore payload, `getByBookingRef` inline total (verified)
- `convex/signupCatalog.ts` — assignable-slot summaries, ineligibility reasons (verified)
- `convex/publicTracking.ts` — canonical tracking read (verified)
- `convex/accommodation.ts` — `getRoomAllocationBoard` (verified)
- `lib/domain/finance/tikkie-templates.ts`, `convex/tikkie.ts` — template/link amount derivation (verified)
- `.planning/codebase/TABLE_RELATIONSHIPS.md` — string-ID join inventory (verified)
- `.planning/codebase/FINANCIAL_DATA_FLOW.md` — amount authority and attendee outstanding derivation (verified)
- `.planning/PROJECT.md` — v5.0 target features and decisions
- `.planning/seeds/SEED-002-ticket-room-eligibility.md` — ticket-driven eligibility rules
- `convex/_generated/ai/guidelines.md` — Convex schema/query/mutation guidelines (child tables, index naming, bounded reads)

---
*Architecture research for: v5.0 Accommodation Upgrades & Options*
*Researched: 2026-08-05*
