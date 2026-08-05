# Phase 39: Accommodation Catalog & Event Config Schema - Context

**Gathered:** 2026-08-05
**Status:** Ready for planning

<domain>
## Phase Boundary

The system stores a reusable accommodation catalog (categories, room types with descriptions, options, age bands) and event-scoped configuration (stay window, active items, rates, upgrade/cot pricing, availability, age-band rules) so buyers can be offered priced options and admins can configure them. The change is purely additive — existing events, room types, orders, and finance contracts remain valid.

</domain>

<decisions>
## Implementation Decisions

### Catalog Table Shape
- Room-type physical counts, admin descriptions, and category linkage are **additive optional fields on the existing `accommodationRoomTypes` table** (`count`, `description`, `categoryId`) — the catalog is the dictionary (definitions only, no prices, no stay).
- Occupancy is modeled with an **explicit `occupancy` field** (`single` / `shared` / `family`) on event rates, not derived from capacity.
- Age-band pricing rules live in an `eventAccommodationAgePricing` table that is **empty and seedable later**; no multiplier field on the band.
- Categories (standard/superior/family), options (superior upgrade, cot), and age bands (under 3, 3-11, 12-17, 18+) are **reusable catalog tables** defined once and referenced by any event.

### Event Config (all per-event)
- `eventAccommodationConfig` stores the **stay window as `checkInAt`/`checkOutAt`**; `nightCount` is derived and **never hardcoded** (night-before is only one possible configuration — multi-night and per-event stays must work with zero schema change).
- Rates are stored as **full rates per category × occupancy**: `(eventId, categoryId, occupancy)` → `pricePerPersonMinor` per night (e.g. standard single 9000, standard shared 6000, superior single 10000, superior shared 7000). The standard→superior "upgrade" is a **selection**, not a second charge — the €10 is the price difference shown in the UI, derived from the rate table, never added on top of the superior rate.
- Upgrade and cot are separate `eventAccommodationOptions` rows with per-night prices; cot has age eligibility (under 3) and its own availability count. Breakfast is an included flag on rates.
- Availability is physical room count per room type plus cot count; **sellable beds = count × capacity** — one derived availability source, no separate manually-tracked availability counter.

### Compatibility
- Additive optional fields only on existing room types; **no migration, no backfill required**; unlinked room types remain valid.
- `categoryId` is optional on `accommodationRoomTypes`; unlinked types still work.

### Pricing Relationship
- Ticket price and accommodation pricing are **independent**. A ticket may or may not include accommodation in its price — the system does not special-case this.
- Accommodation base rate is an **additive line item** (`category × occupancy`, per person per night). When a ticket already includes accommodation, the event configures the base rate at €0 (or the buyer takes no accommodation line); otherwise the base rate is the real add-on (€90/€60/€100/€70).
- **Options/upgrades/addons are always separate additive line items**, regardless of what the ticket includes: superior upgrade (standard → superior, per-person/night), cot (per-night, under-3), and future add-ons. A ticket-inclusive event can still offer paid upgrades.
- Canonical amount-due = Σ(ticket price) + Σ(base accommodation rate × nights, €0 when included) + Σ(options/upgrades/addons × nights). The rate table supports €0; no bundled flag or special-casing is required.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `convex/schema.ts` — defineTable pattern with typed validators and `.index()` helpers; existing `accommodationRoomTypes`, `accommodationRooms`, `accommodationSlots`, `accommodationEventHotels` tables.
- `convex/accommodation.ts` — accommodation queries/mutations (room types, hotels, slots, allocation board).
- `lib/domain/finance/amounts.ts` — minor-unit money helpers (`deriveBalanceAmounts`, `formatMoney` via `lib/format.ts`).
- `lib/types/` — shared validator/type pattern (e.g. `lib/types/signup.ts`).

### Established Patterns
- Minor-unit money everywhere (cents as integers).
- Convex `defineTable` with `v.object` validators and explicit indexes.
- Domain logic in `lib/domain/`, validators in `convex/`, typed hooks in `lib/convex/hooks/`.
- Existing global accommodation tables are cross-event; event linkage via `accommodationEventHotels`.

### Integration Points
- `convex/schema.ts` — new tables: `accommodationCategories`, `accommodationOptions`, `accommodationAgeBands`, `eventAccommodationConfig`, `eventAccommodationRates`, `eventAccommodationOptions`, `eventAccommodationResources`, `eventAccommodationAgePricing`, and additive fields on `accommodationRoomTypes`.
- `convex/accommodation.ts` — new queries/mutations for catalog + event config (admin surface consumed in Phase 41).
- `convex/finance.ts` — `loadOrderAmountDueBreakdowns` extended in Phase 40 to include accommodation; not this phase.

</code_context>

<specifics>
## Specific Ideas

- Room-type labels already carry bed arrangement (e.g. "Twin separate"); category (standard/superior/family) is the pricing grouping.
- Initial reusable catalog content (categories/options/age bands) is defined but seeding is deferred; the schema must support later seeding.
- Admin-facing descriptions are essential for allocation (each room type needs a description to help the admin allocate properly).

</specifics>

<deferred>
## Deferred Ideas

- Actual seed data population (categories, room types, options, age bands) — seeding happens later, after schema is stable.
- Family room prices are not defined yet — `eventAccommodationRates` supports family occupancy but values stay empty until provided.
- Rate snapshotting mechanics — live-derive for unconfirmed, snapshot at admin confirmation is a Phase 40+ decision, not Phase 39.

</deferred>
