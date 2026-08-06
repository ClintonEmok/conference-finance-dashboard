# Architecture Research: Dynamic Event Accommodation (v6.0)

**Domain:** Conference finance dashboard — dynamic, event-owned accommodation configuration with explicit setup reuse, ticket-aware signup consumption, and one canonical finance/allocation contract
**Researched:** 2026-08-06
**Confidence:** HIGH for current-state analysis (verified against `convex/schema.ts`, `convex/accommodation.ts`, `convex/signupCatalog.ts`, `convex/signupSubmission.ts`, `convex/publicTracking.ts`, `convex/finance.ts`, `convex/events.ts`, `lib/domain/finance/accommodation-amounts.ts`, `lib/types/signup.ts`, the admin/public UI surfaces, and `.planning/PROJECT.md`). MEDIUM for the target-state design (recommendation informed by locked milestone decisions, not yet validated with stakeholders).

> This research supersedes the v5.0 architecture research (implemented across Phases 39-44). The v5.0 research described the *introduction* of a reusable catalog + event-scoped config. v6.0 completes the inversion: the **setup** becomes fully event-owned with explicit copy/template reuse, and the **inventory** (hotels, physical rooms, room types, capacity) stays the reusable foundation.

---

## Executive Framing

The v5.0 milestone built a two-layer accommodation model: a **global reusable catalog** (`accommodationCategories`, `accommodationOptions`, `accommodationAgeBands`, `accommodationRoomTypes`) and **event-scoped config rows** that *reference* global catalog IDs (`eventAccommodationRates.categoryId`, `eventAccommodationOptions.optionId`, `eventAccommodationResources.roomTypeId`). That reference model is the root problem v6.0 solves:

1. **Live global coupling.** Mutating a global catalog row (e.g. `updateAccommodationCategory` changes a label, or `updateAccommodationOption` re-labels "Cot") silently changes every event that references it — the exact "live global configuration coupling" the milestone forbids. Copy/template reuse is impossible because there is no copy; there are only live references.
2. **Hardcoded option codes.** `accommodationOptions.code` is a closed union (`superior_upgrade` | `cot`) enforced in **four** places (schema validator, `accommodation.ts` `optionCodeValidator`, `signupCatalog.ts` validator, `publicTracking.ts` `editOptionCodeValidator`), the pricing formula branches on those two codes in **three** loader/resolver sites, and the public signup UI does `.find(option => option.optionCode === "superior_upgrade")`. "Flexible dynamic options, pricing units, eligibility rules" is not possible while the code is a union literal and the formula is two if-branches.
3. **Duplicated resolvers.** Two parallel event-config resolvers already exist — `loadPublicSignupAccommodationContext` (signup/track-payment) and `loadEventAccommodationContexts` (finance) — each independently re-deriving "which option is the upgrade, which is the cot, which age band gates the cot." v6.0 must collapse this into **one event-owned config loader** consumed by every surface.
4. **Boolean selection flags.** `orderAccommodationSelections.upgradeSelected`/`cotSelected` hardcode the two-option world into the order layer, the confirmation snapshot, and the track-payment edit contract. Dynamic options require a data-driven selection representation.

**Architectural thesis for v6.0:** invert the model — the event **owns a deep copy** of its commercial setup (categories, options, age bands, rates, eligibility, ticket rules, inventory rules) and the global catalog becomes a **template library** used only to seed copies. Physical inventory (hotels, physical rooms, room types, capacity) stays referenced because it is genuinely shared infrastructure. A **copy/template engine** materializes independent event-owned setups. A **generalized pricing engine** (option kind × unit, data-driven receipt lines) replaces the two hardcoded branches. The **confirmation snapshot and canonical finance loader remain the single money authority** — dynamic config must never create a second money or historical-pricing source.

---

## Current State Analysis (verified)

### Inventory layer (global, reusable — stays)

| Table | Shape | Role |
|---|---|---|
| `accommodationHotels` | name, city?, notes? | Global hotel registry |
| `accommodationRoomTypes` | label, `defaultCapacity`, count?, description?, `categoryId?` | Global room-type catalog; capacity feeds sellable-beds derivation |
| `accommodationRooms` | hotelId, roomTypeId, label, capacity, occupiedBeds? | Physical rooms; `assignedRoomId` occupancy is derived from `orderAttendees` |
| `accommodationEventHotels` | eventId, hotelId | Links inventory to an event; used for event scoping of the allocation board |
| `accommodationSlots` | eventId, hotelId, roomId, slotLabel, genderPolicy, isAssignable | Legacy per-event bed slots; still the placement machinery for `orderAssignments` |

### Commercial setup layer (currently references global catalog — to become event-owned)

| Table | Shape | Current coupling |
|---|---|---|
| `eventAccommodationConfig` | eventId, stay window, extended-stay booleans, defaultCategoryId?, breakfastIncluded, nightCount, `updatedAt` (version) | **Already event-owned**; `updatedAt` is the single config-version boundary |
| `eventAccommodationRates` | eventId, `categoryId` FK, occupancy (single/shared/family), pricePerPersonMinor | **Live reference** to global category |
| `eventAccommodationOptions` | eventId, `optionId` FK, enabled, priceMinor, eligibilityAgeBandCode?, notes | **Live reference** to global option; code union is hardcoded |
| `eventAccommodationResources` | eventId, kind (room/cot), `roomTypeId?`, count | **Reference** to global room type (inventory — intended to stay) |
| `eventAccommodationAgePricing` | eventId, ageBandCode, rateType (free/full/percent/flat), value, sortOrder | **Reference** to global age-band code; rateType not yet consumed by any formula |

### Global catalog layer (becomes template library)

| Table | Shape | v6.0 role |
|---|---|---|
| `accommodationCategories` | code union (standard/superior/family), label, description?, sortOrder | Seed source for event-owned categories |
| `accommodationOptions` | code union (superior_upgrade/cot), label, kind (addon/upgrade/eligibility), unit (per_night/per_person) | Seed source for event-owned options; `kind`/`unit` already present but under-used; `LOCKED_OPTION_SEMANTICS` notes "custom option codes are not yet supported" |
| `accommodationAgeBands` | code union, label, minAge, maxAge, sortOrder | Seed source for event-owned age bands |
| `accommodationRoomTypes` | label, defaultCapacity, categoryId? | Inventory anchor (kept) |

### Order/selection layer

- `orders` — write-time/provider total (`totalAmountMinor` is fallback-only; canonical amount-due is derived at read time).
- `orderAttendees` — `assignedRoomId` (placement), `allocatedRoomTypeId` (ticket-entitlement hint), allocationPriority.
- `orderTicketSelections` — one row per attendee (quantity = 1), links attendee → `ticketTypes`.
- `orderAccommodationSelections` — per-attendee preference: categoryId, occupancy, `upgradeSelected`, `cotSelected`, ageBandCode?, checkInAt/OutAt, nightCount, plus the Phase 44 confirmation contract (`confirmedAt`, `configVersion`, immutable `priceSnapshot`).
- `orderAccommodationEditAudits` — append-only audit of public permalink edits.
- `orderAssignments` — legacy placement intent rows (slotId, intent assign/skip, status pending/confirmed/declined).

### Contracts and consumers

- **Canonical finance:** `convex/finance.ts → loadOrderAmountDueBreakdowns` (single choke point; confirmed rows price from snapshot, unconfirmed rows live from event config) → pure `lib/domain/finance/accommodation-amounts.ts` (`deriveAccommodationAmount` / `buildAccommodationPriceSnapshot`).
- **Public signup:** `getPublicSignupCatalog` (tickets + active categories/rates/options/age bands; legacy `slots` preserved for compatibility), `getPublicSignupAccommodationQuote` (server-priced), `submitSignupEnvelope` (options-only; persists unconfirmed selection rows; token-gated).
- **Track payment:** `getTrackPaymentEditContext`, `updateAccommodation` (ownership-gated, signature-verified, replace-style, confirmedAt lock, idempotent).
- **Admin:** `getEventAccommodationConfig` (config + catalog + pending-order impact), upsert mutations per config facet (all touching the `eventAccommodationConfig.updatedAt` version boundary), `confirmAccommodationOrderConfiguration`, `getRoomAllocationBoard` (paid-priority), hotel/room/room-type CRUD + `linkHotelToEvent` (auto slot generation).
- **UI surfaces:** Admin workspace tabs Hotels / Allocation / Upgrades & Options (`?tab=` contract via `lib/dashboard/workspace-routes.ts`); public signup steps (tickets → buyer → attendees → accommodation → review) with `AccommodationOptionsStep`; track-payment permalink editor `TrackPaymentAccommodationEditor`.
- **Typed access boundary:** `lib/convex/hooks/accommodation.ts` (admin) + `lib/domain/signup/catalog.ts` (public types).

---

## Recommended Architecture

### System Overview (target state)

```
┌────────────────────────── INVENTORY LAYER (global, reusable — unchanged) ──────────────────────────┐
│  accommodationHotels · accommodationRooms · accommodationRoomTypes · accommodationEventHotels      │
│  (physical rooms/capacity; event↔hotel link; allocation board scoping)                              │
└───────────────────────────────────────┬─────────────────────────────────────────────────────────────┘
                                        │ referenced by
┌────────────────────────── TEMPLATE LAYER (global, seed-only — v6.0 new semantics) ────────────────┐
│  accommodationCategories · accommodationOptions · accommodationAgeBands   (existing tables,        │
│  accommodationSetupTemplates (NEW: named, versioned, typed snapshot)     treated as a library)    │
└───────────────────────────────────────┬─────────────────────────────────────────────────────────────┘
                                        │ copyAccommodationSetup(scope) → deep, independent materialization
┌────────────────────────── EVENT-OWNED SETUP LAYER (per event — v6.0 core) ────────────────────────┐
│  eventAccommodationSetup (NEW: provenance, setupMode, version)                                     │
│  eventAccommodationConfig (stay window — kept)                                                     │
│  eventAccommodationCategories (NEW)   eventAccommodationRates (rekeyed to event categories)        │
│  eventAccommodationOptions (NEW shape: dynamic key/kind/unit/eligibility)                          │
│  eventAccommodationAgeBands (NEW)     eventAccommodationAgePricing (kept, now consumed)            │
│  eventAccommodationResources (kept — inventory rules over global room types)                       │
│  eventTicketAccommodationRules (NEW: per ticket allowed categories/occupancies/inclusion)          │
└───────────────────────────────────────┬─────────────────────────────────────────────────────────────┘
                                        │ single loader: loadEventOwnedAccommodationContext(eventId)
     ┌───────────────────────────────────┼───────────────────────────────────────────────────────────┐
     ▼                                   ▼                                                           ▼
┌─────────────┐                ┌─────────────────────┐                                  ┌──────────────────────────┐
│ public      │                │ canonical finance   │                                  │ admin config + copy/     │
│ signup +    │                │ loadOrderAmountDue  │                                  │ template actions;        │
│ track-      │                │ Breakdowns → pure   │                                  │ allocation board         │
│ payment     │                │ pricing engine      │                                  │ (placement only)         │
└─────────────┘                └─────────────────────┘                                  └──────────────────────────┘
                                        │
                     orderAccommodationSelections (+ NEW orderAccommodationOptionSelections)
                     confirmedAt + configVersion + priceSnapshot (v6: extended, backward compatible)
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|---|---|---|
| Inventory layer | Physical hotels, rooms, room types, capacity; event↔hotel links | Referenced (read-only) by event-owned resources and allocation board |
| Template layer | Seed data for event-owned setup; named versioned templates | Seeded **into** event-owned tables by the copy engine; never read live by signup/finance |
| Event-owned setup | The event's complete commercial configuration: categories, options, age bands, rates, age pricing, resources, ticket rules, stay window, provenance | Single loader → all consumers; version boundary on `eventAccommodationSetup.updatedAt` |
| Copy/template engine | `copyAccommodationSetup` deep-copies setup between events or from a template; provenance recorded; never copies order data | Reads template/event setup; writes target event setup |
| Ticket rules | Per-ticket allowed categories/occupancies + accommodation-included policy, event-owned | Gates public catalog, quote, submission, permalink editor, and allocation eligibility |
| Public signup/permalink | Renders data-driven options from the event-owned loader; submits/edits option selections; server-priced | Event-owned loader; order selection rows; canonical finance for re-pricing |
| Canonical finance | Derives amount-due (tickets + base + option lines) via the pure pricing engine; snapshot authority for confirmed rows | Event-owned loader; selection rows; snapshot contract |
| Allocation | Places attendees into physical rooms (global inventory); paid-priority; assignment confirmation triggers the lock boundary | Global inventory; canonical finance projection; selection rows |
| Admin setup editor | Author/edit event-owned setup, ticket rules, run copy/template actions, view pending impact | Event-owned mutations (all advancing the version boundary) |

### Data Flow 1 — Setup authoring (admin)

1. Admin opens the event Accommodation workspace → **Setup tab**.
2. Fresh event: `getEventOwnedAccommodationSetup` returns `setupMode: "uninitialized"`; the UI offers "Start from template", "Copy from event", or "Start empty".
3. Copy action materializes deep-copied rows into the event-owned tables, derives the stay window from the *target* event's dates (never copies the source stay window), records `copiedFromTemplateId`/`copiedFromEventId` + `copiedAt` on `eventAccommodationSetup`, and sets `setupMode: "event_owned"`.
4. Every subsequent save (category/option/rate/age pricing/resource/ticket rule) advances the single version boundary and recomputes the pending-order impact count (existing `touchEventAccommodationConfigVersion` pattern extended to the new tables).
5. Admin can "Save as template" — snapshots the current event-owned setup into `accommodationSetupTemplates` (a new versioned row; the event keeps no live link to it).

### Data Flow 2 — Signup consumption (public)

1. `getPublicSignupCatalog` → `loadEventOwnedAccommodationContext` (event-owned rows only; **no global catalog reads at consumption time**; global rows only appear when seeding).
2. Tickets resolve through `eventTicketAccommodationRules` → per-ticket allowed categories/occupancies/options; catalog cards and the quote gate on the rule.
3. Buyer selects dynamic options (any enabled event option with a unit/price/eligibility). `getPublicSignupAccommodationQuote` prices via the generalized pure engine; receipt lines are data-driven (`optionKey` + label + unit + unitPrice + quantity).
4. `submitSignupEnvelope` persists one `orderAccommodationSelections` row per attendee **plus** `orderAccommodationOptionSelections` child rows for every non-base option chosen (including the legacy booleans for backward-compatible rows). No money, nights, or eligibility decided client-side.

### Data Flow 3 — Track-payment edit (public write)

1. `getTrackPaymentEditContext` returns the event-owned choice sets + current selections (child rows) + locked state.
2. `updateAccommodation` replaces the full selection set (base row + option child rows) atomically: verifies signature/ownership, validates through the shared resolver against event-owned config + ticket rule, enforces `confirmedAt`, re-prices via `loadOrderAmountDueBreakdowns`, writes one audit row. Legacy boolean rows are read/written through the same abstraction.

### Data Flow 4 — Canonical finance and allocation

1. `loadOrderAmountDueBreakdowns` resolves event context via the **same** event-owned loader (collapsing today's duplicate `loadEventAccommodationContexts`); confirmed rows price exclusively from `priceSnapshot` (v6 snapshot includes data-driven `optionLines`); unconfirmed rows price live.
2. `getRoomAllocationBoard` continues to join canonical due/paid projections; eligibility-to-place gating reads the attendee's ticket rule (allowed categories) so an admin can never place a buyer into a category their ticket does not allow. The physical placement (`assignedRoomId`/`orderAssignments`) is unchanged.

---

## New vs Modified (explicit)

### New tables (all additive; no destructive migration)

| Table | Scope | Purpose | Key shape |
|---|---|---|---|
| `eventAccommodationSetup` | event | One row per event: setup mode, provenance (copiedFromEventId/templateId, copiedAt), version boundary (replaces `eventAccommodationConfig.updatedAt` as the single version owner) | `eventId` FK, `setupMode` ("legacy_global"\|"event_owned"\|"uninitialized"), `copiedFromEventId?`, `copiedFromTemplateId?`, `copiedAt?`, `updatedAt`; index `by_eventId` |
| `eventAccommodationCategories` | event | Event-owned categories: code (free string within the event), label, description, isSuperior flag, sortOrder, enabled | `eventId` FK, `key` (slug), `label`, `description?`, `isSuperior`, `sortOrder`; indexes `by_eventId`, `by_eventId_and_key` |
| `eventAccommodationAgeBands` | event | Event-owned age bands: key, label, minAge, maxAge, sortOrder | `eventId` FK, `key`, `label`, `minAge`, `maxAge?`, `sortOrder`; indexes `by_eventId`, `by_eventId_and_key` |
| `eventTicketAccommodationRules` | event | Ticket-driven entitlement: allowed event-owned categories, allowed occupancies, accommodation-included policy, includedNights? | `eventId` FK, `ticketTypeId` FK, `allowedCategoryKeys` (array of event category keys — bounded), `allowedOccupancies` (array), `accommodationIncluded`, `includedNights?`, `updatedAt`; indexes `by_eventId`, `by_eventId_and_ticketTypeId` |
| `orderAccommodationOptionSelections` | order | Child rows for each chosen dynamic option on a selection (child-table convention, mirrors `orderTicketSelections`) | `selectionId` FK (→ `orderAccommodationSelections`), `optionKey`, `quantity`, `sortOrder`; indexes `by_selectionId`, `by_orderId` |
| `accommodationSetupTemplates` | global | Named, versioned, immutable setup snapshots used as copy sources | `name`, `description?`, `snapshot` (typed object: categories[], options[], ageBands[], agePricing[], resources[], ticketDefaults[]), `version`, `updatedAt`; index `by_name` |

Typed FKs (`v.id(...)`) on all new tables — the accommodation domain is the worst offender for string-ID joins today (e.g. `accommodationEventHotels.eventId`/`hotelId` are strings, `orderAccommodationSelections` mixed typing); do not repeat that pattern.

### Modified tables / modules

| Target | Change | Why |
|---|---|---|
| `eventAccommodationConfig` | Loses the version-boundary role to `eventAccommodationSetup.updatedAt` (or keeps `updatedAt` and the setup row aliases it); stays the stay-window owner | One version boundary must remain; two boundaries invite snapshot ambiguity |
| `eventAccommodationRates` | Rekey `categoryId` from global → event-owned category; add `categoryKey` join safety | Rates belong to the event's own categories |
| `eventAccommodationOptions` | Drop `optionId` global FK; own the full definition: `key` (free string), `label`, `description?`, `kind` (addon/upgrade/eligibility), `unit` (per_night/per_person/per_person_per_night/flat), `priceMinor`, `eligibilityRule?` (ageBandKey and/or ticketRuleKey), `enabled`, `sortOrder` | Dynamic options with no code-union hardcode |
| `eventAccommodationResources` | Keep (inventory rules); `roomTypeId` stays a global inventory reference — this is the intentional boundary | Physical inventory is genuinely shared |
| `eventAccommodationAgePricing` | Keep; becomes consumed by the pricing engine (rateType free/full/percent/flat) | Seeded-but-unused contract finally wired |
| `accommodationOptions.code` | Widen from union → `v.string()` (or keep union for backward compat and treat new events as string-keyed); seed rows remain for template seeding | Dynamic option keys |
| `accommodationCategories.code` | Widen similarly if event-owned categories use free keys | Event-owned labels |
| `ticketTypes.roomTypeId` / `accommodationIncluded` | Remain writable as the **seed source** for `eventTicketAccommodationRules`; the event rule becomes authoritative for consumption | SEED-002 single-alignment carried forward without schema break |
| `orderAccommodationSelections` | Keep base fields (categoryId, occupancy, ageBandCode, stay fields, confirmation contract); `upgradeSelected`/`cotSelected` become **legacy dual-write fields** during transition, then read-only | Dynamic options live in the child table; legacy rows stay valid |
| `orderAccommodationSelections.priceSnapshot` | Extend `AccommodationPriceSnapshot` with optional data-driven `optionLines`; `isCompleteAccommodationPriceSnapshot` must accept both v5 (legacy) and v6 shapes | Confirmed rows never re-price; both shapes are self-contained |
| `lib/domain/finance/accommodation-amounts.ts` | Generalize into a pricing engine: base charge (nights − covered) × rate; per-option charge by kind/unit; data-driven receipt lines; keep v5 snapshot contract | Remove the two hardcoded option branches |
| `convex/finance.ts` `loadEventAccommodationContexts` | Replace internals with the shared event-owned loader (`loadEventOwnedAccommodationContext`) | One resolver, not two |
| `convex/signupCatalog.ts` + `lib/domain/signup/catalog.ts` | Public contract options become data-driven (`key`, `label`, `unit`, `priceMinor`, `eligibility`); quote/submission validators drop the option-code union; `slots` legacy block finally removable after the transition window | Data-driven public cards |
| `convex/publicTracking.ts` | Edit-choice validators drop the code union; `updateAccommodation` reads/writes option child rows; legacy boolean dual-read | Generalized permalink editor |
| `convex/signupSubmission.ts` | Persist `orderAccommodationOptionSelections` child rows; include them in restore payloads; keep legacy boolean dual-write | Selection representation |
| `convex/accommodation.ts` | New `getEventOwnedAccommodationSetup`, generalized upserts, `copyAccommodationSetup`, `saveAccommodationTemplate`, ticket-rule mutations; `getEventAccommodationConfig` extended or replaced; confirmation resolver reads child rows | Admin contract + copy engine |
| `lib/convex/hooks/accommodation.ts` | New hooks for setup editor, copy/template, ticket rules | Typed access boundary |
| Admin workspace + signup step + permalink editor | Data-driven rendering; no `optionCode === "superior_upgrade"` lookups | Milestone's dynamic-options requirement |

### Not changed (deliberately)

- `accommodationHotels`, `accommodationRooms`, `accommodationRoomTypes`, `accommodationEventHotels`, `accommodationSlots` — physical inventory and placement machinery stay global/reusable (locked decision).
- `orderAssignments` + `assignedRoomId` — the placement record; admin-controlled.
- `orders.totalAmountMinor` — write-time/provider total; fallback only.
- `payments`, matching, reconciliation, donation semantics — untouched; only the amount-due side shifts.
- `orderAccommodationEditAudits` — append-only edit evidence; extended in shape only.
- Confirmation contract semantics — `confirmedAt` + version + immutable snapshot remain the only place selection rows are locked; dynamic config must not create a second pricing source.
- Clerk authorization boundaries, event-scoped routing, workspace tab contract, deep-link preservation (`/dashboard/events/[slug]/accommodation?tab=...`, `/track-payment/[bookingRef]`).

---

## The Three Core Design Decisions

### Decision 1 — What is event-owned vs referenced (the boundary)

Recommendation: **everything the buyer sees or that prices the buyer is event-owned; everything physical is referenced.**

- **Event-owned (deep copies):** categories, options, age bands, rates, age pricing, ticket rules, eligibility rules. Mutating a source template or another event's setup never affects this event.
- **Referenced (global):** hotels, physical rooms, room types (label, capacity), event↔hotel links. `eventAccommodationResources` references room types by design — the event picks which inventory it sells and how many, but the capacity/label of a physical room type is shared infrastructure.
- **Consequence:** `accommodationRoomTypes.categoryId` (global category classification) becomes a *seed hint only*. The event-owned setup maps its own categories to room types via its resource rows (which room types count toward which sellable category). This removes the need for a global category as the join key.

This matches the locked decision precisely: "Existing reusable hotels, physical rooms, room types, and capacity remain the inventory foundation" + "event-owned accommodation setup."

### Decision 2 — Template representation

Three options, recommended: **named template table with a typed snapshot document.**

| Option | Description | Verdict |
|---|---|---|
| A. Named template table (`accommodationSetupTemplates` with typed snapshot) | Templates are versioned snapshot rows; `copyAccommodationSetup` hydrates event tables from the snapshot; templates are immutable (each "Save as template" creates a new version) | **Recommended.** Explicit, independent, no live coupling, no event lifecycle coupling |
| B. Template = a hidden event | Copy-from-event only; reuse a "master event" as the template | Cheaper (no new table) but couples template lifetime to an event, allows drift, and copy-from-event is already needed anyway; add it as a secondary convenience, not the primary mechanism |
| C. Template rows in event-owned tables with a `templateId` discriminator | Same schema for templates and events | Pollutes every event query; templates would need their own lifecycle; rejected |

The snapshot document must be **typed** (object with bounded arrays), not an untyped JSON blob, to keep schema validation and fail-closed loaders. Templates never store money history, order references, or confirmation data. A template's stay window is *not* part of the snapshot (target events derive their own from their dates); rates/options/age pricing/resources/ticket defaults are.

### Decision 3 — Dynamic option model and selection representation

- **Option row (event-owned):** `key` (free string, unique per event — e.g. `cot`, `superior_upgrade`, `bike_rack`), `label`, `description?`, `kind` (`addon` | `upgrade` | `eligibility`), `unit` (`per_night` | `per_person` | `per_person_per_night` | `flat`), `priceMinor`, `eligibilityRule` (`ageBandKey?`, `ticketRuleKey?`), `enabled`, `sortOrder`.
- **Pricing semantics per kind × unit (generalized engine, replacing the two branches):**
  - `upgrade` × `per_night`: charged per night on top of the base rate, applied only when the selected base category is not the option's target category (v5 `superior_upgrade` semantics generalized: `upgrade.appliesToCategoryKey`).
  - `addon` × `per_night` / `per_person` / `per_person_per_night` / `flat`: quantity × unit price (v5 `cot` becomes an addon with an `ageBandKey` eligibility rule).
  - `eligibility` kind: unlocks/restricts other options or categories; never priced itself.
- **Selection rows (child table):** `orderAccommodationOptionSelections(selectionId, optionKey, quantity, sortOrder)`.
- **Legacy bridge:** v5 rows wrote `upgradeSelected`/`cotSelected` booleans. The loader maps legacy rows to synthetic option keys (`superior_upgrade`, `cot`) via the event-owned options list; new rows write child rows and keep the booleans in sync only for legacy consumers during the transition window. The confirmation snapshot extension (`optionLines`) makes confirmed rows fully self-contained for both shapes.

---

## Migration & Compatibility Concerns

1. **No destructive migrations.** All new tables additive. Existing global catalog rows and existing event-config rows remain valid and readable.
2. **Transition mode.** `eventAccommodationSetup.setupMode` distinguishes:
   - `legacy_global`: event still references global catalog IDs (v5 rows). Loaders dual-read: event-owned rows when present, else resolve global references (the exact v5 path). This keeps all existing events and orders live while the new model rolls in.
   - `event_owned`: full event-owned setup; global references ignored.
   - `uninitialized`: no setup yet; the admin Setup tab offers seed actions.
   - Cutover per event is triggered by the admin's first explicit "Start from template / Copy from event / Save setup" action, which materializes event-owned rows from the current global references. A one-time backfill migration is optional and must be a per-event decision, not a global sweep (events have different configuration maturity).
3. **Confirmed snapshots.** `isCompleteAccommodationPriceSnapshot` must accept both the v5 shape (existing fields) and the v6 shape (adds optional `optionLines`). Confirmed v5 rows keep pricing forever — the loader never re-derives them from dynamic config. This is the hard guarantee that "dynamic configuration must not create a second money or historical-pricing source."
4. **Selection booleans.** Keep `upgradeSelected`/`cotSelected` writable during transition (dual-write) so existing track-payment edit contract and restore payloads keep round-tripping; remove only after the transition window closes and the legacy slot contract is likewise removed.
5. **Hardcoded unions.** Widen option/category code unions to `v.string()` in schema + validators; keep the union values valid for legacy rows. Age-band codes: keep the closed union for validation but allow event-owned bands to carry any label/bounds (event-owned age bands already diverge per event today via `eventAccommodationAgePricing`).
6. **Deep links & contracts.** `?tab=upgrades-options` route and `/track-payment/[bookingRef]` permalink must be preserved; renaming the tab ("Accommodation Setup") must keep the query-param contract or redirect.
7. **Copy safety.** `copyAccommodationSetup` must never copy: stay window, confirmed selections, snapshots, orders, payments, pending order state, edit audits, or physical assignments. Provenance (copiedFromEventId/templateId + copiedAt) is required so admins can trace where a setup came from.

---

## Patterns to Follow

### Pattern 1: One event-owned config loader, one money module
`loadEventOwnedAccommodationContext(ctx, eventId)` is the single resolver for public catalog, quote, submission, permalink edit, canonical finance, and admin setup reads. All pricing flows through `lib/domain/finance/accommodation-amounts.ts`. No consumer derives a category/option/eligibility decision or a money figure itself.

### Pattern 2: Single version boundary
The confirmation snapshot records exactly one `configVersion`. Every event-owned setup write (categories, options, rates, age pricing, resources, ticket rules) advances `eventAccommodationSetup.updatedAt` monotonically (`nextConfigVersion` pattern). Never introduce a second version field.

### Pattern 3: Preferences vs placement remain separate records
Dynamic option selections (`orderAccommodationSelections` + child rows) are buyer preference. Physical placement (`assignedRoomId`/`orderAssignments`) is admin-controlled. The allocation board joins them for display and gating but never conflates them.

### Pattern 4: Child collections live in their own tables
Dynamic options are `orderAccommodationOptionSelections` child rows, not an array on the selection doc — mirrors `orderTicketSelections`/`orderAssignments` and enables audit, admin adjustment, and idempotent replace.

### Pattern 5: Fail-closed loaders and bounded async iteration
New loaders keep the existing patterns: `.unique()` for singletons, full indexed iteration (never truncated `.take()` for authoritative counts like pending impact), fail closed on confirmed-without-snapshot, and event-scoped reads only.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Keeping live global references (the v5 coupling)
Mutating `accommodationCategories`/`accommodationOptions` re-labels every referencing event. v6.0's whole point is to eliminate this. Any design that "pins a version" on a global reference is a partial fix that still leaks coupling through shared IDs — reject it.

### Anti-Pattern 2: Hardcoded option codes anywhere
The current code has the union in 4 validator sites + 3 resolver branches + UI `.find(optionCode === ...)`. v6.0 must eliminate all of them. If a new feature needs a special option, it should be configured, not coded.

### Anti-Pattern 3: Duplicate resolvers
Two event-config resolvers already exist (public vs finance). v6.0's generalization is the moment to unify; adding a third (admin) resolver would entrench the divergence.

### Anti-Pattern 4: Copying order state in copy/template actions
A copy action that drags selections, confirmations, payments, or stay windows between events corrupts both events. Copy scope must be commercial setup only.

### Anti-Pattern 5: Client-decided pricing units or eligibility
The UI may render data-driven cards, but unit multiplication, eligibility evaluation, and night counting are server-owned (existing signup/quote/permalink contract discipline).

---

## Architecture Options Considered

| Option | Description | Pros | Cons | Verdict |
|---|---|---|---|---|
| **A. Full event-owned deep copy (recommended core)** | All commercial setup deep-copied per event; global catalog = seed library | No live coupling; copy semantics natural; independent evolution; matches locked decisions | Row duplication; materialization/backfill work | **Adopt** |
| B. Reference + versioned overlay | Keep global IDs; add event-level overrides and version pins | Less duplication | Leaky coupling; complex merge; contradicts "copied configurations evolve independently" | Reject |
| C. Hybrid: inventory referenced, setup copied | Physical inventory referenced; commercial setup copied (Decision 1) | Precise boundary per PROJECT.md; minimal duplication where it matters | Requires defining "commercial vs physical" precisely | **Adopt** (A + C are the same design; C is A applied to the project's stated boundary) |
| D. Templates = hidden events | Copy-from-event only | No new table | Template drift; event lifecycle coupling | Reject as primary; keep as convenience action |
| E. Child rows for option selections | `orderAccommodationOptionSelections` | Codebase convention; auditable; replace-friendly | More rows | **Adopt** (vs array-on-doc) |

---

## Roadmap Separation & Build Order

The milestone must separate backend/data/schema/contracts from admin UI, public signup/track-payment UI, and cross-surface integration. Suggested phase clusters (dependency-driven):

1. **Backend: schema & contracts** — new event-owned tables, `eventAccommodationSetup` + provenance, `eventTicketAccommodationRules`, dynamic option model (widen unions), `accommodationSetupTemplates` snapshot doc, selection child table, snapshot `optionLines` extension, validators (public catalog/quote/submission/edit). Additive only; legacy dual-read stubs.
2. **Backend: generalized pricing + unified loader** — pure pricing engine (kind × unit), `loadEventOwnedAccommodationContext` merging the public + finance resolvers, canonical finance loader rewired, confirmation resolver reads child rows, legacy boolean mapping, dual-read (legacy_global vs event_owned) + per-event materialization.
3. **Backend: copy/template engine** — `copyAccommodationSetup`, `saveAccommodationTemplate`, provenance, ticket-rule seeding from `ticketTypes.roomTypeId`/`accommodationIncluded`, pending-impact and version-boundary rewiring.
4. **Admin UI** — Setup tab (event-owned category/option/age-band/rate/age-pricing/resource editors, ticket-rules table, data-driven option cards), copy/template actions + provenance display, pending-impact panel; Hotels and Allocation tabs unchanged.
5. **Public signup & track-payment UI** — data-driven accommodation options step (no hardcoded code lookups), generalized quote rendering, generalized permalink editor consuming child-row selections; legacy slot block finally removable.
6. **Cross-surface integration & verification** — canonical money matrix across all consumers (including new option lines), edit security/idempotency/confirmation regression, snapshot dual-shape integrity, deep-link preservation, copy-scope safety tests, human UAT.

**Why this order:** schema first because every surface reads the same event-owned contract; pricing/loader unification second because it is the highest-leverage integration point (one change propagates everywhere); copy/template third because it needs the materialization path; UIs last because they consume stable contracts; verification closes the "looks done but isn't" checklist exactly as v5.0 Phase 45 did.

## Scalability Considerations

| Concern | Approach |
|---|---|
| Event-owned rows per event | Bounded and small (categories < 10, options < 20, age bands < 5, rates < 30, ticket rules = ticket count) — indexed by `eventId`; each consumer is event-scoped |
| Pending-impact counts | Existing bounded async-iteration pattern (never derive an authoritative count from a truncated `.take()`) |
| Template snapshots | One doc per template version; copies materialize into normal event-owned rows; no cross-event read at query time |
| Allocation board | Already capped and event-scoped; eligibility gating joins the ticket rule (one indexed lookup per attendee) |
| Public mutation surface | Permalink edit remains the only public write; child-row replace keeps the exact-match cardinality contract; audit rows unchanged |
| Snapshot dual-shape | Purely additive type guard; loader cost unchanged |

## Sources

- Codebase (verified directly): `convex/schema.ts`, `convex/accommodation.ts`, `convex/signupCatalog.ts`, `convex/signupSubmission.ts`, `convex/publicTracking.ts`, `convex/finance.ts`, `convex/events.ts`, `convex/init.ts`, `lib/domain/finance/accommodation-amounts.ts`, `lib/types/signup.ts`, `lib/domain/signup/catalog.ts`, `lib/convex/hooks/accommodation.ts`, `components/dashboard/accommodation/*`, `components/signup/steps/AccommodationOptionsStep.tsx`, `components/track-payment/TrackPaymentAccommodationEditor.tsx`, `app/dashboard/events/[slug]/accommodation/*` — HIGH confidence.
- Planning docs: `.planning/PROJECT.md` (v6.0 target features + locked decisions), `.planning/ROADMAP.md` (Phase 46 placeholder), `.planning/REQUIREMENTS.md` (SEED-002 TKT-01/TKT-02, ADM/CFG/SIG/TRK contracts), `.planning/STATE.md` (executed v5.0 decisions), `.planning/milestones/` — HIGH confidence.
- Design recommendations (template table, event-owned boundary, dynamic option model, build order) are the researcher's opinionated synthesis — MEDIUM confidence until validated with stakeholders during roadmap creation.

## Open Questions / Research Flags

- Should `accommodationRoomTypes.categoryId` be deprecated as a global classification once event-owned categories exist, or kept as the seed hint? (Recommend: keep as seed hint only.)
- Is a one-time backfill of existing events to `event_owned` mode required, or is per-event materialization on first admin save sufficient? (Recommend: per-event; a global sweep risks re-pricing surprises.)
- Should the "Upgrades & Options" tab be renamed to "Accommodation Setup" in v6.0, and does the rename require redirect handling for `?tab=upgrades-options`? (Recommend: keep the query param, rename the label.)
- Multi-room-type ticket entitlement (`roomTypeIds` array, deferred in v5.0) — the `eventTicketAccommodationRules.allowedCategoryKeys` array effectively delivers this capability event-side without a `ticketTypes` schema break; confirm this satisfies SEED-002's intent.
- Age-pricing `rateType` (free/full/percent/flat) is consumed by the generalized engine — confirm the percent base is per-person-per-night minor and that percent rounding (floor per line, remainder allocation) follows the codebase's existing `allocateMinorAmountByWeight` conventions.
