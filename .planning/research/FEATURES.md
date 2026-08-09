# Feature Research: v6.0 Dynamic Event Accommodation

**Domain:** Church conference finance system — event-owned accommodation configuration with explicit copy/template reuse, generic dynamic options, preserved hotel/physical-room/room-type/capacity workflow
**Researched:** 2026-08-06
**Confidence:** HIGH for codebase-grounded findings (schema, phase artifacts, current implementation read directly); MEDIUM for ecosystem patterns (carried forward from 2026-08-05 v5.0 research; niche domain has no authoritative external sources)

## Feature Landscape

This milestone (v6.0) shifts accommodation from the v5.0 two-layer model — a **live global reusable catalog** (`accommodationCategories`, `accommodationOptions`, `accommodationAgeBands`, `accommodationRoomTypes`) referenced by event-scoped config rows — to an **event-owned, self-contained configuration model**: every event carries its complete accommodation setup (inventory selection, rates, options, entitlements, availability) as independent event-owned data, and reuse between events happens **only through explicit copy/template actions** that produce independent copies which evolve separately.

Two invariants frame the whole milestone:

1. **The older hotel → physical-room → room-type → capacity workflow is preserved and remains the inventory foundation.** `accommodationHotels` / `accommodationEventHotels` / `accommodationRooms` / `accommodationRoomTypes` / `accommodationSlots` / `orderAssignments` / `roomAllocations` and the admin Hotels + Allocation tabs keep their behavior. What becomes event-owned is the *configuration layered on top*: which room types/capacities an event offers, at what rates, with which options, under which ticket entitlements.

2. **No live global admin catalog.** The event's configuration must not depend on editing shared global rows whose changes leak into other events. The v5.0 catalog tables may remain as seed/template *origins*, but event setup must not reference them live (see Copy/Template semantics).

The milestone also removes the last hardcoded option machinery: v5.0 still hardcodes `superior_upgrade` / `cot` option codes, `standard|superior|family` category codes, the four fixed age bands, and boolean `upgradeSelected`/`cotSelected` selection flags. These become **data** (generic options with units and eligibility, data-driven admin/public cards).

---

## Table Stakes

Features users (finance/ops admins and buyers) expect. Missing these makes the flow feel broken or untrustworthy.

### Admin Inventory Setup (preserved workflow, event-owned)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Event admin sets up the event's hotel/room inventory: create or link hotels, add physical rooms by room type, set capacity, generate per-room bed slots | This is the established workflow since v1.0; breaking it breaks allocation and every existing event | HIGH (exists; must be preserved without regression) | Existing sequence: `createHotel` → `linkHotelToEvent` (auto slot generation) → `createRooms` (AddRoomsDialog) → `generateSlotsForRoom`; Hotels tab in the Accommodation workspace |
| Availability is **derived** from physical inventory: sellable beds = room type `count` × `capacity`, no separate manually-tracked counter | Manual availability drifts from the physical room inventory; v5.0 locked this as the single availability source | HIGH (exists) | `eventAccommodationResources` holds room/cot counts; derived bed summaries are server-computed |
| Event-scoped hotel/room views with no global inventory affordances in the event UI | v4.0/v5.0 made hotel setup event-owned in copy/UX; v6.0 makes the underlying *configuration* event-owned | MEDIUM | `legacy-hotels-surface.tsx` + `create-hotel-dialog.tsx` + `add-rooms-dialog.tsx` already present |
| Per-room-type admin descriptions for allocation decisions | Allocation decisions need informed context; v5.0 CAT-04 established this | LOW (exists) | `accommodationRoomTypes.description`; catalog editor in Upgrades & Options tab |

### Event Accommodation Rules

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Event-owned stay configuration: base check-in/check-out window, night count, breakfast included, extended-stay toggles | Every event needs its own accommodation period; v5.0 established the config singleton | LOW (exists) | `eventAccommodationConfig` (`baseCheckInAt`, `baseCheckOutAt`, `nightCount`, `breakfastIncluded`, extended-stay flags, `updatedAt` = the version boundary) |
| Event-owned rate matrix: category × occupancy (single/shared/family) × price-per-person-per-night | This is how conference housing pricing actually works; must remain event-owned | HIGH (exists) | `eventAccommodationRates`; minor-unit prices; the rate grid in the Upgrades & Options tab |
| **Standard/Superior pricing relationship preserved** — "Standard" and "Superior" remain recognizable pricing groups and the superior relationship (separate rate or a visible delta) is expressed in data, not code | Admins and buyers already understand standard-vs-superior; v6.0 must not lose this while removing the hardcoded `category.code === "superior"` checks | MEDIUM | v5.0 derives the "upgrade" as a selection against the superior rate (`categoryIsSuperior` resolution in `accommodation-amounts.ts`); v6.0 keeps the concept data-driven |
| Event-owned options/upgrades as **generic dynamic rows**: label, description, **unit** (`per_night` \| `per_person` \| `per_stay`), price in minor units, eligibility rules, optional per-option availability | The whole point of "dynamic options without hardcoded option codes": adding a new option (e.g. "Parking pass", "Extra cot") must not require code or a schema union | HIGH (new) | Replaces the hardcoded `accommodationOptions.code` union (`superior_upgrade`\|`cot`) and the `isCot`/`isSuperiorUpgrade` special-casing in the config form, signup step, and `lib/domain/signup/catalog.ts` |
| Event-owned age bands: configurable bands (label, min/max age), not the fixed four; band pricing rules (`free`/`full`/`percent`/`flat`) | Age-based pricing is a family-conference feature; bands differ per event | MEDIUM | v5.0 hardcodes the band code union; `eventAccommodationAgePricing` already stores `rateType`/`value` per band |
| Availability resources event-owned: per-room-type counts and per-option resource counts | Cot count exists today; generic options may also carry capacity | MEDIUM | `eventAccommodationResources` (`kind: room\|cot`) generalizes to option-owned resources |

### Ticket Entitlements (SEED-002, event-owned)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Event-owned ticket → room entitlement mapping: a ticket type maps to its allowed room category/type during signup and allocation | SEED-002 carried forward in PROJECT.md; keeps signup and allocation rules aligned instead of drifting | MEDIUM | v5.0 aligned single `ticketTypes.roomTypeId` (set ⇒ only that type; unset ⇒ all enabled); multi-room-type array deferred |
| Rule consistency: omitted ⇒ all enabled, exactly one ⇒ auto-apply without asking, multiple ⇒ prompt | SEED-002 rules captured at planting | MEDIUM | Today the entitlement resolves to one `roomTypeCategoryId`/`roomTypeCategoryCode` in the public catalog |
| Same entitlement rule on the allocation board | Dashboard allocation must follow the same ticket-based eligibility (SEED-002) | MEDIUM | Board consumes room types today; entitlement enforcement on the board is partial |

### Copy / Template Actions (the reuse promise)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Copy accommodation setup from another event** with explicit intent (choose source event, review, confirm) | "Reusable through explicit copy actions" is a locked v6.0 decision (PROJECT.md); a recurring-conference church wants a consistent starting point without shared live state | HIGH (new) | Must clone all event-owned rows (config, rates, options, resources, age pricing, entitlements, room-type selection) with remapped IDs |
| **Create event setup from a saved template** | Template reuse for consistent multi-event setup | HIGH (new) | Template = a named snapshot of an event-owned setup, configuration-only |
| **Independent evolution after copy**: edits to the target never affect the source; edits to the source never affect copies | This is the defining difference from live catalog coupling ("copied configurations evolve independently" — locked decision) | HIGH (new) | No FK from target rows back to source rows; no shared `updatedAt` boundary |
| Copy contract is explicit about what is copied, remapped, and **reset** | Copying orders, selections, snapshots, occupied beds, or assignment state would corrupt finance/allocation | HIGH (new) | Copy: config/rates/options/resources/age pricing/entitlements/room-type inventory selection (physical hotels/rooms may be **linked** or **cloned** per mode — see Open Questions). Reset: occupancy/assignment/selection data, per-option availability counters, snapshots. Remap: all IDs |
| Template library management: save, name, list, update, delete templates | A template store is only useful if it is manageable | MEDIUM | Templates are configuration-only and must never reference orders |
| Copy/template result is immediately visible in the target event's Hotels + Upgrades & Options tabs | The admin must see the copied setup where they configure it | MEDIUM | All admin surfaces read the event-owned contract |

### Safe Archive / Delete

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Archive (soft) of event-owned entities: room types, options, categories, rate rows, entitlements, hotels-in-event | Events retire entities; soft archive keeps history and snapshots intact | MEDIUM (new) | `isArchived`/`archivedAt` pattern matches `ticketTailorOrders.isArchived` precedent |
| **Reference-safe delete/archive**: block archive/delete when referenced by orders, selections, snapshots, assignments, or audits | PITFALLS #10 (v5.0): hard-deleting referenced options corrupts historical finance; confirmed snapshots must stay resolvable | MEDIUM-HIGH (new) | Reference checks across `orderAccommodationSelections`, `priceSnapshot`, `orderAccommodationEditAudits`, `orderAssignments`, `roomAllocations`, `accommodationSlots` |
| Archive never affects finance or public signup; archived rows hidden from new signup quotes | Archived config must not re-price or appear to buyers | MEDIUM | Snapshot boundary keeps confirmed orders priced from stored snapshots |

### Public Signup Consumption

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Signup accommodation step renders **data-driven cards** from the event-owned options (label, unit, price, eligibility) — no hardcoded option codes | Buyers must see exactly what the event configured; hardcoded `superior_upgrade`/`cot` checks in `AccommodationOptionsStep.tsx` must go | MEDIUM | Cards generated from `getPublicSignupCatalog` (already server-driven; remove code-based branching) |
| Live server quote and per-person-per-night price breakdown in the review step, breakfast included, cot/age-band gated options | Trust rule from v5.0: never surprise the buyer with a total | MEDIUM (exists) | `getPublicSignupAccommodationQuote` + shared `resolvePublicSignupSelection`; quote and submission share one resolver |
| Ticket entitlement gates categories/options during signup; invalid option/ticket combinations rejected at submission | SEED-002 | MEDIUM (exists) | Validation in `submitSignupEnvelope` via the shared resolver |
| Generic per-attendee option selection (option + quantity) instead of fixed boolean flags | `upgradeSelected`/`cotSelected` booleans cannot express arbitrary options with units | HIGH (new) | `orderAccommodationSelections` selection shape generalizes to option rows/quantities |
| Signup for events with no accommodation configured remains unchanged | Not every event has accommodation; legacy empty-state behavior must survive | LOW (exists) | `accommodationEnabled` flag + unconfigured render state |

### Track-Payment Edits

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Buyer changes accommodation on the `/track-payment/[bookingRef]` permalink before admin confirmation; order re-prices server-side from the **same event-owned config** | v5.0 delivered the permalink; v6.0 must keep it working against the event-owned contract (generic options) | MEDIUM | `updateAccommodation` replace-style mutation, ownership gate (email/HMAC token), idempotency keys, rate limiting, honeypot, `orderAccommodationEditAudits` |
| Edits rejected server-side after confirmation (confirmedAt guard) | TRK-04 / immutable after confirmation | MEDIUM (exists) | `confirmedAt` write-guard enforced in the mutation |
| Overpayment surfacing on downward re-price (refund-vs-donation decision), never silent donation | TRK-05 | MEDIUM (exists) | Flexible-zero Tikkie links untouched; canonical amount-due drives balance |

### Confirmation Snapshots

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Confirmed orders price exclusively from the immutable `priceSnapshot` (resolved base/upgrade/cot rates + nights) with `configVersion` = event config `updatedAt`; never re-priced by later config edits | v5.0 finance-trust invariant; snapshots are the single historical money source | MEDIUM (exists) | `orderAccommodationSelections.confirmedAt`/`configVersion`/`priceSnapshot`; loader fails closed on confirmed-without-snapshot |
| Snapshot shape generalizes to generic options (per-option resolved unit price × quantity × unit basis) | Fixed base/upgrade/cot snapshot fields cannot capture arbitrary options | HIGH (new) | `AccommodationPriceSnapshot` and `deriveAccommodationAmount` generalize; legacy snapshots stay valid (additive) |
| Unconfirmed orders price live from current event-owned config, with admin "N pending orders will re-price" impact preview | Config edits before confirmation legitimately re-price pending orders; admins need impact visibility | MEDIUM (exists) | `getEventAccommodationConfig` returns `pendingOrders`/`pendingOrderCount`/`hasAccommodationSelections`; every config save advances the version boundary |

### Finance

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Canonical amount-due includes accommodation derived from event-owned config via the pure module; no UI/duplicate money math | Core value of the app: one reliable finance number; every consumer reads `loadOrderAmountDueBreakdowns` | HIGH | `lib/domain/finance/accommodation-amounts.ts` is the pure choke point; the loader resolves config → inputs → `deriveAccommodationAmount` |
| Generic receipt lines (label, unit, quantity, charge) instead of the fixed `Accommodation`/`Superior upgrade`/`Cot` line kinds | Receipts must reflect whatever options the event configured | MEDIUM (new) | `AccommodationReceiptLine.kind` union generalizes; label snapshots for confirmed rows |
| Per-attendee due/paid maps stay correct (per-attendee accommodation attribution, not even splits) | v5.0 FIN-01 established; per-attendee line items keep the ledger honest | MEDIUM (exists) | `amountDueByAttendeeId` includes accommodation lines |

### Allocation

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Allocation board consumes the same event-owned room types/entitlements + canonical payment state; paid highlighted, unpaid grayed | Paid-priority fairness from v5.0; entitlement alignment with signup (SEED-002) | MEDIUM (exists) | `getRoomAllocationBoard` + `lib/domain/finance/allocation-payment-state.ts` tri-state classification |
| Admin assigns rooms from the preserved hotel/room workflow; assignment confirmation sets the confirmedAt lock boundary | Admin-assigns model; lock is server-enforced | MEDIUM (exists) | `assignRoomToAttendee`/`confirmBuyerAssignment` reuse the Phase 41/44 confirmation resolver |
| Entitlement mismatch warnings when assigning outside the ticket's allowed room category/type | SEED-002 alignment on the board | MEDIUM | Partial today; completes with event-owned entitlements |

---

## Differentiators

Features that set this product apart from generic event platforms and from its own v5.0 state. All align with PROJECT.md core value (trustworthy finance + clear ops).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Explicit copy/template with independent evolution** | A recurring-conference church gets consistent accommodation setups (same hotels, rates, options) with zero live coupling — each conference diverges safely as it matures. Eventbrite/Pretix are strictly per-event; ministry tools (Arrowhead CE, CampBrain) reuse via per-site/per-property config, not explicit copy-with-divergence | HIGH | The copy action is the reuse primitive; "copy then diverge" beats both "re-type everything" and "shared config surprises" |
| **Generic options engine with units and eligibility** | New accommodation options (parking, extra cot, meal pass, equipment) are added by an admin in the UI — no schema union, no code, no special-case cards. Hardcoded `superior_upgrade`/`cot` machinery removed end-to-end | HIGH | Units (`per_night`/`per_person`/`per_stay`) + eligibility rules + resource counts; data-driven admin/public cards |
| **Event-owned self-contained setup** | One event scope contains the complete accommodation contract: audit-friendly, archive-safe, no cross-event mutation surprises, and a clean "whole setup" copy/template surface | MEDIUM-HIGH | Contrast with v5.0's live catalog references where editing a global option leaks into other events |
| **Ticket-entitlement-driven signup + allocation** (SEED-002) | Ticket defines room eligibility everywhere; no drift between signup offers and allocation rules | MEDIUM | Single source of entitlement truth, event-owned |
| **Confirmation snapshot boundary** | Confirmed orders never re-price after config edits; unconfirmed orders re-price live with a visible pending-impact count. Finance history is immutable while configuration stays flexible | MEDIUM | Preserved from v5.0; generalized to generic options |
| **Age-band pricing rules** (`free`/`full`/`percent`/`flat`) | Family-conference niche: children priced by band without per-event code | MEDIUM | Event-owned bands + pricing rows |
| **Extended-stay configurability** (before/after/both) | Real conference need (travel days) that generic platforms don't model | LOW | Exists; retained |

---

## Anti-Features / Out Of Scope

These feel attractive but create problems in this milestone — or were explicitly deferred. The first three are the *current* v5.0 behaviors this milestone is removing.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Live global catalog coupling** (event config referencing editable shared catalog rows; editing a global option leaks into every event) | "Reusable" sounds like shared state | Editing one event's rates/options silently changes other events; config errors cascade; no independent evolution | Event-owned rows; reuse only via explicit copy/template (the v6.0 decision) |
| **Hardcoded option/category/age-band codes and fixed two-option model** (`superior_upgrade`, `cot`, `standard`/`superior`/`family`, four fixed bands, boolean selection flags) | Fixed codes made v5.0 simple and the UI cheap | Every new option is a code change; admin/public cards branch on magic strings; selection booleans can't express quantity or units | Generic dynamic options as data (label/unit/price/eligibility); data-driven cards |
| **Waitlist workflows with notifications for exhausted inventory** | Avoids turning buyers away | A complete waitlist (state machine, emails, promotion) is scope creep; SEED-002 only asks to capture intent | Keep current exhausted-inventory no-availability behavior; defer waitlist |
| Multi-night / date-range rate engine (check-in/check-out pricing) | Conferences sometimes span nights | Multiplies pricing complexity (per-night rates, partial stays, date math) for a fixed one-night-before stay | Keep single fixed stay per event; revisit only if a real multi-night event appears |
| Real-time room-level inventory holds/locking during signup | Feels "accurate" | Requires room-level reservation state, OCC conflicts, abandoned-cart holds; overkill when category-level availability is derived from physical counts | Derived availability at room-type level; admin final assignment |
| Freeform admin price overrides per order | Handles "special cases" fast | Breaks canonical derivation and reconciliation; finance surfaces can no longer explain a total | Rate matrix + explicit option line items; overrides only via documented, derivable mechanisms |
| Buyer-facing room self-assignment at signup (v5.0 drag-drop retirement) | Feels empowering; already built once | Room hoarding, unpaid buyers blocking paid ones, conflict with admin-assigns + paid-priority | Options-only signup; admin assignment in the Allocation board |
| Hard delete of entities referenced by orders/selections/snapshots | Frees up space, feels clean | Destroys historical finance resolution; confirmed snapshots reference resolved values, not live rows — but audits/assignments reference IDs | Reference-checked soft archive; block or null-out only unreferenced rows |
| Tax/discount/coupon engine on accommodation | Feels complete | Discounts + taxes on line items massively complicate canonical derivation; no requirement exists | Fixed rates in minor units; no tax/discount model |
| Inline payment capture at signup | Fewer steps for buyers | Breaks the Tikkie-link + booking-ref tracking model and canonical payment matching | Keep Tikkie links; permalink shows re-priced balance |
| Roommate matching marketplace (RoomSync-style) | Attendees want to choose roommates | Full product (profiles, mutual consent, matching); app already captures `roommatePreference` | Keep preference + gender guardrails in the proposal; later milestone if requested |
| Full Ticket Tailor table/provider redesign | Provider schema is aging | Entirely separate project; PROJECT.md out-of-scope | None in this milestone |
| Cross-event analytics product | Portfolio insight | Separate information architecture and authorization model | None in this milestone |
| Multi-room-type entitlement array (`roomTypeIds`) | SEED-002 ideal shape | v5.0 deferred the schema change; keep single `roomTypeId` alignment unless v6.0 explicitly picks it up | Single entitlement mapping, event-owned |

---

## Feature Dependencies

```text
[Event-owned accommodation setup model]                    ← foundation
    ├──requires──> [Admin inventory setup (hotels/rooms/room types/capacity) preserved & event-scoped]
    ├──requires──> [Event-owned rules (stay, rates incl. Standard/Superior, resources)]
    ├──requires──> [Generic dynamic options (units + eligibility) as data]
    ├──requires──> [Event-owned ticket entitlements (SEED-002)]
    └──enables──>  [Copy/template actions]
                        ├──requires──> [Copy semantics (ID remap, reset, no live refs)]
                        └──enables──>  [Reuse without live coupling]
                        └──enables──>  [Safe archive/delete]
                                            └──requires──> [Reference checks (orders/selections/snapshots/assignments/audits)]

[Generic options + units + eligibility]
    ├──enables──>  [Data-driven admin cards (Upgrades & Options tab)]
    └──enables──>  [Data-driven public cards (signup step)]
    └──requires──> [Generalized selection shape (option + quantity, not booleans)]
    └──requires──> [Generalized snapshot shape (per-option resolved price)]

[Public signup consumption]
    ├──requires──> [Event-owned config contract (quotes + submission shared resolver)]
    ├──requires──> [Ticket entitlement gating]
    └──enables──>  [Track-payment edits]
                        ├──requires──> [Canonical finance derivation from event-owned config]
                        └──requires──> [Confirmation snapshot boundary (confirmedAt guard)]

[Canonical finance]
    ├──requires──> [Generic receipt-line derivation (unit math: per_night/per_person/per_stay)]
    └──enables──>  [Paid/Outstanding/Reconciliation correctness everywhere]

[Allocation]
    ├──requires──> [Preserved hotel/room workflow + event-owned entitlements]
    └──requires──> [Canonical payment state]
    └──enables──>  [Paid-priority + entitlement-aligned assignment]

Copy/template ──produces──> event-owned rows (never live refs) ──implies──> archive/delete must be reference-safe
Hardcoded codes ──removed──> generic options (admin/public cards data-driven)
```

### Dependency Notes

- **Setup model → everything:** signup quotes, track-payment re-pricing, finance derivation, and allocation all read one event-owned contract. The event-owned data model (schema + admin inventory) is the dependency root.
- **Generic options → selection/snapshot/finance:** generalizing options to data forces the selection shape (option + quantity), the snapshot shape (per-option resolved price), and the finance line derivation (unit math) to generalize together. They are one coherent change, not three independent ones.
- **Copy/template requires the setup model first:** you can only copy a self-contained setup. Copy and safe archive/delete are siblings — copy must respect reference-safe rules (never clone order data), and archive must respect copy provenance (archiving a source event must not break its copies, which are ID-independent).
- **Finance before signup/permalink:** as in v5.0, money must derive correctly before any surface prices anything. Generalize the pure module right after the options model lands.
- **Allocation last:** it consumes entitlements, payment state, and the preserved room workflow.

---

## Milestone Definition (v6.0 Launch Set)

This is a subsequent milestone on an existing app, so the launch set is the minimal scope that delivers "event-owned, reusable-by-explicit-copy, dynamic-option accommodation" while keeping canonical finance trustworthy and the hotel/room workflow intact.

### Launch With (This Milestone)

1. **Event-owned accommodation setup model** — event-owned rows for rules, rates, options (generic, with units + eligibility), resources/availability, age bands + pricing, ticket entitlements; the hotel/room/room-type/capacity inventory workflow preserved (no regression on Hotels + Allocation tabs). *Foundation; everything else reads it.*
2. **Generic dynamic options + units + eligibility + data-driven admin/public cards** — remove hardcoded `superior_upgrade`/`cot`/category/band codes and boolean selection flags; generalized selection + snapshot + receipt-line shapes. *The "dynamic" promise.*
3. **Canonical finance generalization** — pure module prices generic unit-based options; loader + per-attendee maps stay correct; confirmed snapshots stay authoritative. *Money trust.*
4. **Event-owned ticket entitlements (SEED-002)** — per-ticket → room category/type mapping, event-owned, enforced in signup and allocation. *Rule alignment.*
5. **Copy/template actions** — copy setup from another event or from a saved template; explicit, ID-remapped, order-data-free; independent evolution after copy; template library management. *The reuse promise.*
6. **Safe archive/delete** — reference-checked soft archive of event-owned entities; archived rows never affect finance/signup. *Lifecycle safety.*
7. **Public signup consumption** — data-driven cards, quote-backed, entitlement-gated, generic selections persisted. *Buyer flow.*
8. **Track-payment edits + confirmation snapshots** — permalink edits against the event-owned contract; confirmedAt guard; generalized snapshots. *Post-submit flow.*
9. **Allocation alignment** — board consumes event-owned entitlements + payment state; assignment confirmation still sets the lock. *Operator flow.*
10. **Verification & cross-surface audit** — copy independence test (editing a copy doesn't touch the source), archive-reference checks, money integrity across every consumer, legacy hotel workflow regression, hardcoded-code sweep (no `"superior_upgrade"`/`"cot"`/`"under_3"` string branching in UI or domain). *"Looks done but isn't" gate.*

### Add After Validation (v6.1+)

- Multi-room-type entitlement array (`roomTypeIds`) if SEED-002 is revisited.
- Template versioning / template update propagation (currently templates are immutable-after-copy snapshots).
- Waitlist/pending-intent capture on exhausted inventory.
- Bulk import of accommodation setup from spreadsheets.

### Future Consideration (v7+)

- Multi-night / date-range pricing — only when a real multi-night event appears.
- Buyer-facing roommate matching — full product; only if explicitly requested.
- Inline payment capture — separate finance milestone, conflicts with the Tikkie-link model.
- Admin-accepted partial option changes after confirmation (change-history/audit design).

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Event-owned setup model (rules/rates/options/entitlements) | HIGH | HIGH | P1 |
| Generic dynamic options + units + eligibility | HIGH | HIGH | P1 |
| Canonical finance generalization | HIGH | HIGH | P1 |
| Copy/template actions (explicit, independent) | HIGH | HIGH | P1 |
| Event-owned ticket entitlements (SEED-002) | MEDIUM-HIGH | MEDIUM | P1 |
| Public signup consumption (data-driven cards) | HIGH | MEDIUM | P1 |
| Track-payment edits + confirmation snapshots (generalized) | HIGH | MEDIUM | P1 |
| Safe archive/delete | MEDIUM-HIGH | MEDIUM | P1 |
| Allocation alignment (entitlements + payment state) | MEDIUM | MEDIUM | P2 (depends on everything; safe to land late) |
| Template library management | MEDIUM | MEDIUM | P2 (copy first, template store after) |
| Pending-impact preview polish | MEDIUM | LOW | P2 |
| Extended-stay configurability | LOW | LOW | P3 (exists) |

**Priority key:**
- P1: Must have for milestone success
- P2: High leverage once the event-owned model is stable
- P3: Valuable later; should not block the milestone

---

## Existing-Flow Dependencies (This Codebase)

Concrete integration points the roadmap must respect (verified in code, HIGH confidence):

- **`convex/schema.ts`** — legacy inventory tables to preserve: `accommodationHotels`, `accommodationEventHotels` (string IDs), `accommodationRooms` (string IDs), `accommodationRoomTypes`, `accommodationSlots`, `orderAssignments`, `roomAllocations`, `orderAttendees.assignedRoomId`. v5.0 catalog/config tables to event-own: `accommodationCategories` (code union), `accommodationOptions` (code union), `accommodationAgeBands` (code union), `eventAccommodationConfig` (+ `updatedAt` version boundary), `eventAccommodationRates`, `eventAccommodationOptions`, `eventAccommodationResources`, `eventAccommodationAgePricing`. Order-layer to generalize: `orderAccommodationSelections` (`upgradeSelected`/`cotSelected` booleans, `categoryId`/`occupancy`, `priceSnapshot`), `orderAccommodationEditAudits`. Ticket seams: `ticketTypes.roomTypeId`, `ticketTypes.accommodationIncluded`, `events.defaultRoomTypeId`, `events.accommodationEnabled`.
- **`convex/init.ts`** — seeds the global catalog with hardcoded codes (`standard`/`superior`/`family`, `superior_upgrade`/`cot`, the four age bands). v6.0 must decide the fate of this seed data (template origin vs. event-owned seed).
- **`convex/accommodation.ts`** — `createHotel`, `linkHotelToEvent` (auto slot generation), `createRooms`, `generateSlotsForRoom`, `unlinkHotelFromEvent`, `getRoomAllocationBoard`, `getEventAccommodationConfig`, `getAccommodationCatalog`, `upsertEventAccommodation*` mutations, `confirmAccommodationOrderConfiguration`. Copy/template and archive/delete mutations are new here.
- **`convex/signupCatalog.ts` + `convex/signupSubmission.ts`** — `loadPublicSignupAccommodationContext`, `resolvePublicSignupSelection` (single shared resolver for quote + submission), `getPublicSignupAccommodationQuote`, `submitSignupEnvelope` (options-only). Signup consumption re-routes to the event-owned contract.
- **`convex/finance.ts` → `loadOrderAmountDueBreakdowns` + `lib/domain/finance/accommodation-amounts.ts`** — pure module with hardcoded `superior_upgrade`/`cot` line kinds, `categoryIsSuperior` resolution, snapshot builder. The generalization choke point.
- **Track-payment** — `app/track-payment/[bookingRef]` + `updateAccommodation` (replace-style, ownership-gated, idempotent, audit rows, `confirmedAt` guard). Must keep working against generic options.
- **`lib/domain/accommodation/assignments.ts` + `inventory.ts`** — assignment proposal and inventory math; preserved.
- **UI** — `components/dashboard/accommodation/legacy-hotels-surface.tsx` (preserve), `upgrades-options-config-form.tsx` + `upgrades-options-catalog.tsx` + `upgrades-options-tab.tsx` (hardcoded `isCot`/`isSuperiorUpgrade` branching to remove; gains copy/template + archive controls), `components/signup/steps/AccommodationOptionsStep.tsx` (hardcoded `option.optionCode === "superior_upgrade"` / `"cot"` branching to remove), `app/dashboard/events/[slug]/accommodation/workspace/components/*`, `lib/convex/hooks/accommodation.ts`.
- **Canonical consumers** (no change expected; must not regress): `convex/publicTracking.ts`, `convex/orders.ts`, `convex/payments.ts`, `convex/reports.ts`, `convex/attendees.ts`, `convex/autoSync.ts` — all read `loadOrderAmountDueBreakdowns`.

---

## Research Flags / Open Questions

Honest gaps this research could not resolve; they need decisions during planning:

1. **Physical inventory ownership on copy** — when copying setup to a new event, are hotels/physical rooms/room types **linked** (shared physical entities, event-owned configuration only) or **cloned** (fully independent physical inventory)? PROJECT.md says the reusable hotel/room workflow "remains the inventory foundation", which leans *linked-physical / event-owned-configuration*; the copy action then needs both modes or a locked choice. This is the single biggest architecture decision for the milestone.
2. **Fate of the v5.0 global catalog tables** — retained as template/seed origins (event setup still bootstrappable from them, copies become event-owned) vs. fully replaced by event-owned rows seeded per event. "Do not assume a live global admin catalog" rules out live references either way.
3. **Selection/snapshot generalization strategy** — additive (keep `upgradeSelected`/`cotSelected` + fixed snapshot fields for legacy rows, add generic option-selection child rows) vs. migrate. Additive is safer and matches the codebase's non-destructive schema evolution rule.
4. **Unit semantics** — confirm the locked unit set (`per_night`, `per_person`, `per_stay`) and how each composes with night count and per-person quantities; whether an option can combine units (e.g. per_person_per_night).
5. **Superior/Standard as data** — confirm that "Standard" and "Superior" remain category rows (labels only) with the pricing relationship expressed purely through rates/options, and that the v5.0 `categoryIsSuperior` logic (upgrade = selection against superior rate) is preserved or replaced by a per-option delta model.
6. **Template update semantics** — templates immutable-after-copy (recommended, keeps independence) vs. update-propagation (rejected: violates independent evolution).
7. **Archive scope** — whether archiving a source event's setup affects its prior copies (it must not: copies are ID-independent), and whether archived room types remain selectable for new signups (they must not).
8. **Multi-room-type entitlement** — whether v6.0 finally lands `roomTypeIds` (SEED-002 full) or stays on single `roomTypeId`, event-owned.

---

## Ecosystem Patterns (comparative, MEDIUM confidence)

| Pattern | Eventbrite | Pretix | Arrowhead CE (Cru) | CampBrain | v6.0 approach |
|---------|-----------|--------|--------------------|-----------|---------------|
| Accommodation reuse across events | Per-event only | Per-organizer product libraries (partial) | Per-event site | Per-property | **Explicit copy/template; copies evolve independently** |
| Event-ownership of config | Per-event | Per-event w/ global products | Per-event | Per-property | **Event-owned self-contained setup** |
| Options/upgrades | Per-event add-ons (products) | Add-on categories (only with base product) | Fixed housing choices | Fixed charges | **Generic data-driven options with units + eligibility** |
| Ticket→room entitlement | N/A | N/A | One room per paid registrant | N/A | **Event-owned ticket entitlement (SEED-002)** |
| Inventory | Event capacity | Quotas | Hotel blocks per event | Buildings/rooms calendar | **Physical room counts × capacity, derived availability** |
| Payment gates accommodation | Payment at order | Order payment gates fulfillment | Configurable payment-before-reservation | Payment terms per group | **Paid-priority allocation; unpaid grayed** |

Sources: carried forward from the 2026-08-05 v5.0 research (Eventbrite Help, Pretix docs — official; Arrowhead CE, CampBrain — vendor pages; MEDIUM/LOW as marked there). This niche has no authoritative external source; codebase facts dominate.

---

## Sources

### Primary (HIGH confidence — read directly this session)
- `.planning/PROJECT.md` — v6.0 milestone goal, target features, locked decisions (event-owned config, copy/template reuse, no live coupling, dynamic options, SEED-002 carry-forward)
- `.planning/features/dynamic-accommodation/README.md` — v6.0 design scope (entities, admin UX, end-to-end flows, dynamic config, safe reuse/deletion, snapshots)
- `.planning/STATE.md` — executed v5.0 phases 39-45 contracts (selection/snapshot contract, shared resolver, permalink guards, allocation lock, money matrix)
- `.planning/ROADMAP.md` + `.planning/REQUIREMENTS.md` — v5.0 phases 39-45 scope, CAT/CFG/ADM/SIG/TRK/FIN/ALL/TKT requirements
- `.planning/seeds/SEED-002-ticket-room-eligibility.md` — ticket entitlement rules
- `convex/schema.ts` — full accommodation inventory + catalog/config + order-layer tables (verified)
- `lib/domain/finance/accommodation-amounts.ts` — hardcoded unit/line-kind/snapshot logic to generalize (verified)
- `convex/accommodation.ts`, `convex/signupCatalog.ts`, `convex/signupSubmission.ts`, `convex/init.ts` — current admin/signup/seed contracts (verified)
- `lib/convex/hooks/accommodation.ts`, `components/dashboard/accommodation/*`, `components/signup/steps/AccommodationOptionsStep.tsx`, `app/dashboard/events/[slug]/accommodation/workspace/components/*` — hardcoded-code sweep targets (verified)
- Archived v5.0 research: `.planning/research/v5.0-accommodation-upgrades-options/FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `SUMMARY.md` (HIGH — codebase-grounded, 2026-08-05)

### Secondary (MEDIUM confidence)
- Eventbrite Help — order-edit limitations (official; carried from v5.0 research)
- Pretix docs — add-on categories, quotas (official; carried from v5.0 research)
- Arrowhead CE (Cru ministry), CampBrain — vendor pages (carried from v5.0 research)

### Tertiary (LOW confidence)
- Generic event-platform marketing pages — used only as anti-feature/ecosystem references; no authoritative external source exists for this niche.

---

*Feature research for: v6.0 Dynamic Event Accommodation — event-owned configuration, explicit copy/template reuse, generic dynamic options with units/eligibility, preserved hotel/room/capacity workflow, aligned signup/track-payment/snapshot/finance/allocation*
*Researched: 2026-08-06*
