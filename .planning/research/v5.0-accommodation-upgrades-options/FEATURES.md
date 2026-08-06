# Feature Research

**Domain:** Accommodation upgrades & options for a church conference finance system — configurable accommodation pricing/options, buyer-selects-options/admin-assigns-rooms, booking-reference permalink with config changes, paid-priority allocation
**Researched:** 2026-08-05
**Confidence:** HIGH (codebase facts), MEDIUM (ecosystem patterns from vendor pages)

## Feature Landscape

This milestone (v5.0) turns accommodation from a **preference capture + drag-drop self-assignment flow** into a **priced, option-driven catalog** where buyers pick what they want and admins make the final placement. The four behaviors in scope — configurable pricing/options, buyer-selects-options/admin-assigns, booking-ref permalink with re-pricing, and paid-priority allocation — form one coherent model: **accommodation becomes priced line items on the canonical order, and allocation becomes payment-aware**.

### Table Stakes (Users Expect These)

Features buyers and admins assume exist. Missing these makes the flow feel broken or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Buyers see a live price for every accommodation option at selection time | If you ask buyers to pick priced options, hiding the price until review is a trust break; the review total must not surprise | MEDIUM | Options step needs a running per-attendee price summary; reuses `formatMoney` and canonical pricing rules, not UI math |
| Rates per category × occupancy (single/shared, per-person-per-night) | This is how conference housing pricing actually works (e.g. standard single €90 vs standard shared €60); a "room costs €X" model doesn't fit dorm/shared-bathroom conferences | HIGH | New rate matrix (category × occupancy × price); must be event-scoped config with catalog-level defaults |
| Upgrade priced as a delta (standard→superior, default €10 configurable) | Buyers expect "superior costs +10/night" to be an explicit, visible choice, not a hidden column | MEDIUM | Pure line-item addition per person per night; configurable per event |
| Cot option with age-band eligibility (under-3 only) and its own price (€10/night, count 10) | If you offer a cot, you must constrain it by age — otherwise families book cots for school-age kids and the count is meaningless | MEDIUM | Requires age-band capture (optional) to gate cot; inventory = configured cot count |
| Availability derived from physical room counts and bed counts (beds = count × capacity) | "Availability" that is manually tracked drifts from the room inventory; deriving it from room counts keeps signup, allocation, and admin views consistent | HIGH | The catalog's `count` × room type `capacity` is the single availability source; no separate availability counter |
| Buyers can change accommodation configuration at the booking-ref permalink and see the re-priced total | The whole point of a durable booking link is that buyers can fix their own order pre-confirmation; a link that can't change anything is just a receipt | HIGH | Mutation + canonical re-derivation of amount-due; gated "before admin confirmation" |
| Payment status drives allocation priority (paid highlighted, unpaid grayed) | Fairness and anti-hoarding: an unpaid attendee shouldn't block a paid one; this is standard in ministry housing (Arrowhead) and expected by ops staff | MEDIUM | Allocation board needs order payment state joined in; proposal algorithm ranks paid first |
| Accommodation charges feed the canonical amount-due (Paid/Outstanding/Reconciliation stay correct) | This app's core value is trustworthy finance; if accommodation is priced but not in amount-due, every finance surface lies | HIGH | Must extend `loadOrderAmountDueBreakdowns`/`deriveOrderAmountBreakdown` (convex/finance.ts) — the single canonical source all surfaces read |
| Admin confirmation gates final room assignment | Buyers express preference (category/occupancy/upgrade/cot), admin places people in specific rooms; buyer choosing exact beds at signup is being removed | MEDIUM | Moves the existing drag-drop `RoomAssignmentStep` out of public signup; admin allocation board already exists |

### Differentiators (Competitive Advantage)

Features that set this product apart from generic event platforms. All align with the PROJECT.md core value (trustworthy finance + clear ops).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Booking-ref permalink with self-service config changes before confirmation | Eventbrite only lets buyers edit attendee info (not quantities/payment type — organizer-only); a durable link that re-prices accommodation changes is genuinely ahead of mainstream platforms | HIGH | `/track-payment/[bookingRef]` replaces the search-first page; needs mutation + re-derivation + clear "not yet confirmed" state |
| Reusable accommodation catalog across events (categories, room types, options, age bands defined once) | Admin describes categories/descriptions once and reuses for future conferences; most tools are per-event only | HIGH | New catalog tables + event-scoped config tables; matches the "reusable catalog vs event configuration" decision in PROJECT.md |
| Ticket-driven room eligibility (SEED-002) | Ticket type determines which room types a buyer may select; auto-applies when only one option; keeps signup and allocation rules aligned instead of drifting | MEDIUM | `ticketTypes.roomTypeId` already exists in schema; needs catalog mapping + signup gating + allocation alignment |
| Per-person-per-night occupancy pricing matrix | Generic event platforms can't express "shared bed pricing" or occupancy-based rates; this is a niche domain model that fits church conference housing exactly | HIGH | The rate matrix is the pricing engine; keep it fixed-rate (one-night-before), not dynamic |
| Paid-priority allocation with visual states (highlighted/grayed) | Operational fairness without manual review: allocation board instantly shows who can be placed; proposal algorithm already supports priority ordering (`allocationPriority`) | MEDIUM | Reuse existing `getRoomAllocationBoard`/`generateAllocationProposal`; add payment-state join |
| Age-band capture (optional) with conditional cot eligibility | Family-friendly conference handling; the age band is captured only when needed (cot/children), not forced on every attendee | LOW | Optional field on attendee; gates cot eligibility |
| "Breakfast included" and descriptive category copy surfaced to buyers | Reduces support questions ("is breakfast included?") during signup; cheap to do once the catalog has descriptions | LOW | Catalog description field rendered in options step |

### Anti-Features (Commonly Requested, Often Problematic)

These feel attractive but create problems in this milestone. The current app already exhibits the first one.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Keep buyer self-assignment of specific rooms at signup (current drag-drop `RoomAssignmentStep`) | Feels empowering; already built; "buyers pick their bed" | Enables room hoarding, lets unpaid buyers block paid ones, and directly conflicts with the paid-priority + admin-assigns model | Buyers select options only; keep drag-drop in the admin allocation board where confirmation lives |
| Real-time room-level inventory holds/locking during signup | Feels "accurate" and prevents double-booking at the exact-room level | Requires room-level reservation state, OCC conflicts, and abandoned-cart holds; massive overkill for category-level availability | Availability at category level (remaining beds), derived from room counts; final room assignment is admin's job |
| Multi-night / date-range rate engine (check-in/check-out pricing) | Conferences sometimes span nights; feels more flexible | Multiplies pricing complexity (per-night rates, partial stays, date math) for a fixed one-night-before stay | Keep single fixed stay per event ("one-night-before" config); revisit only if a real multi-night event appears |
| Freeform admin price overrides per order | Handles "special cases" fast | Breaks canonical derivation and reconciliation; finance surfaces can no longer explain a total | Rate matrix + explicit upgrade/cot line items; overrides only via documented, derivable mechanisms |
| Inline payment capture at signup (card payment for accommodation) | Fewer steps for buyers | The app's finance model is Tikkie-link + booking-ref tracking; adding a payment gateway is a whole other milestone and breaks canonical payment matching | Keep Tikkie payment links; the permalink shows the re-priced balance and payment link |
| Buyer-facing roommate matching marketplace (RoomSync-style mutual matching) | Attendees want to choose roommates | That is a full product (profiles, mutual consent, matching algorithms); the app already captures `roommatePreference` | Keep roommate preference + gender guardrails in allocation proposal; revisit as a later milestone if requested |
| Full waitlist workflow with notifications for exhausted inventory | Avoids turning buyers away | A complete waitlist (state machine, emails, promotion) is scope creep; SEED-002 only asks to capture intent | Capture "request/waitlist/pending" state on the order when inventory is exhausted; admin resolves it |
| Required age bands for every attendee | Wants clean data | Adds friction to every signup for a field only used for cot eligibility | Optional age-band capture, required only when a cot (or child option) is selected |
| Tax/discount/coupon engine on accommodation | Feels complete | Discounts + taxes on line items massively complicate canonical derivation; no requirement exists | Fixed rates in minor units; no tax/discount model in this milestone |

## Feature Dependencies

```text
[Reusable accommodation catalog]
    ├──requires──> [Category + room-type + option + age-band data model]
    ├──requires──> [Event-scoped configuration (rates, upgrade, cot, availability)]
    │                   └──requires──> [Catalog schema + admin config surface]
    ├──enables──> [Buyer selects options during signup]
    │                   ├──requires──> [Pricing rule: category × occupancy × nights]
    │                   ├──requires──> [Cot gating on age band]
    │                   └──enables──> [Ticket-driven room eligibility (SEED-002)]
    └──enables──> [Accommodation charges → canonical amount-due]
                            ├──requires──> [Order accommodation selections persisted at submission]
                            ├──requires──> [deriveOrderAmountBreakdown extended with accommodation lines]
                            └──enables──> [Paid/Outstanding/Reconciliation correctness]

[Booking-ref permalink with config changes]
    ├──requires──> [Canonical amount-due derivation (above)]
    ├──requires──> [Config-change mutation + re-price]
    └──requires──> [Order "confirmed by admin" gate]

[Paid-priority allocation]
    ├──requires──> [Order payment state join in allocation board]
    └──enables──> [Paid highlighted / unpaid grayed]

[Buyer self-assignment of rooms] ──conflicts──> [Admin assigns final rooms]
[Freeform admin price overrides] ──conflicts──> [Canonical amount-due derivation]
```

### Dependency Notes

- **Catalog → event config → signup options:** the public signup cannot offer priced options until the catalog and event-scoped rates exist. Admin config surface must land first (or in the same phase).
- **Options selection → persisted selections → canonical amount-due:** buyer choices must be persisted as order-level accommodation selections at submission, then the canonical breakdown (`loadOrderAmountDueBreakdowns` in `convex/finance.ts`, currently ticket-selections-only) must sum them. Every finance surface (orders, payments, publicTracking, reports, autoSync) reads this one function — extending it once keeps all surfaces correct. This is the highest-leverage dependency in the milestone.
- **Permalink re-price depends on canonical derivation:** the config-change mutation must call the same derivation as submission, so the permalink total always matches finance totals.
- **Paid-priority allocation depends on payment state:** the allocation board currently reads `orderAttendees` + `orderAssignments`; it needs each attendee's order payment status (orders.status / matched payment totals) joined in to highlight/gray and to rank the proposal.
- **SEED-002 enhances the options step:** `ticketTypes.roomTypeId` exists in the schema; once categories map to room types, the ticket can gate which categories a buyer may select (auto-apply when one option).
- **Room self-assignment conflicts with the admin-assigns model:** the public `RoomAssignmentStep` (drag-drop into slots) must be retired from signup; the same interaction remains valid inside the admin allocation board.

## Milestone Definition (v5.0 Launch Set)

This is a subsequent milestone on an existing app, so "MVP" is the minimal set that delivers the milestone goal while keeping canonical finance trustworthy.

### Launch With (This Milestone)

- [ ] Reusable catalog data model: categories (standard/superior/family with descriptions), room types (label, capacity, count, description), options (upgrade, cot), age bands (under_3/3-11/12-17/18+) — essential because everything else reads from it
- [ ] Event-scoped configuration: one-night-before stay, category × occupancy rates, upgrade delta, cot price + count, breakfast-included flag — essential to price anything
- [ ] Admin "Upgrades & Options" config surface — essential for admins to set rates/availability without code
- [ ] Buyer selects options only (category/occupancy, upgrade, cot gated to under-3, optional age band) with live price display — essential to the buyer flow
- [ ] Order accommodation selections persisted + canonical amount-due extended — essential so Paid/Outstanding/Reconciliation stay correct (the milestone's core promise)
- [ ] `/track-payment/[bookingRef]` permalink with config change + re-price (before admin confirmation) — essential to the durable-link requirement
- [ ] Paid-priority allocation: paid highlighted, unpaid grayed, proposal ranks paid first — essential to fairness

### Add After Validation (v5.1)

- [ ] SEED-002 ticket-driven room eligibility fully wired into signup gating — needs the catalog stable first; can be a tightening pass
- [ ] Inventory-exhausted "request/waitlist/pending" capture on the order — once the options flow is proven, add graceful degradation
- [ ] "Breakfast included" and category descriptions surfaced in signup copy — cheap polish once catalog descriptions exist

### Future Consideration (v6+)

- [ ] Buyer-facing roommate matching — full product; only if explicitly requested
- [ ] Multi-night / date-range pricing — only when a real multi-night event appears
- [ ] Inline payment capture — separate finance milestone, conflicts with the Tikkie-link model
- [ ] Admin-accepted partial option changes after confirmation (upgrades after cutoff) — needs change-history/audit design

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Catalog + event-config data model | HIGH | HIGH | P1 |
| Admin Upgrades & Options config surface | HIGH | MEDIUM | P1 |
| Buyer selects options with live pricing | HIGH | MEDIUM | P1 |
| Order accommodation selections persisted | HIGH | MEDIUM | P1 |
| Canonical amount-due includes accommodation | HIGH | HIGH | P1 |
| Booking-ref permalink with config change + re-price | HIGH | HIGH | P1 |
| Paid-priority allocation (highlight/gray + ranking) | HIGH | MEDIUM | P1 |
| SEED-002 ticket-driven eligibility wiring | MEDIUM | MEDIUM | P2 |
| Waitlist/pending capture on exhaustion | MEDIUM | LOW | P2 |
| Category descriptions + breakfast flag surfaced to buyers | MEDIUM | LOW | P2 |
| Roommate matching marketplace | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for milestone success
- P2: High leverage once the catalog/price model is stable
- P3: Valuable later, should not block the milestone

## Competitor Feature Analysis

| Feature | Arrowhead CE (Cru ministry housing) | Eventbrite | Pretix | CampBrain (conference centers) | Our Approach |
|---------|-------------------------------------|------------|--------|--------------------------------|--------------|
| Buyer selects accommodation at signup | Integrated registration + housing; group bookings with one payment | No accommodation; add-ons via separate products | Add-on product categories (add-ons only purchasable with a base product) | Group booking + accommodation charges | Options-only selection during signup with live price |
| Payment gates accommodation | Configurable: require registration+payment before room reservation; limit one room per paid registrant | Payment required at order time | Order payment gates fulfillment | Payment terms per group | Paid-priority allocation; unpaid grayed, paid highlighted |
| Admin controls final assignment | Manual assignment, roommate changes, hotel changes until cutoff | Organizer edits attendee info only; quantity/payment-type changes are organizer-controlled | Admin order management in backend | Admin booking management | Admin assigns final rooms in allocation board |
| Buyer self-service changes | Changes/cancellations until cutoff date, admin-controlled | "Manage order": attendee info edits only; can't change quantity or payment type | Order modification in backend with secret link | Admin-driven | Booking-ref permalink, config changes before admin confirmation, re-priced |
| Inventory model | Hotel room blocks managed per event | Event capacity | Quotas = sellable capacity | Buildings/rooms calendar inventory | Physical room counts × capacity = beds; category-level availability |
| Roommate handling | Roommate requests with permission-seeking | N/A | N/A | N/A | roommatePreference + gender guardrails in proposal |
| Pricing model | Hotel contracted rates | Per-ticket price | Per-product price | Fixed/variable charges | Category × occupancy per-person-per-night + upgrade/cot line items |
| Reusable catalog across events | Per-event site | Per-event | Per-organizer product libraries (partial) | Per-property | Explicit reusable catalog + event-scoped config (differentiator) |

## Existing-Flow Dependencies (This Codebase)

These are the concrete integration points the roadmap must respect (verified in code, HIGH confidence):

- **`convex/finance.ts` → `loadOrderAmountDueBreakdowns` + `lib/domain/finance/amounts.ts` → `deriveOrderAmountBreakdown`:** the single canonical amount-due source used by orders, payments, publicTracking, reports, and autoSync. Accommodation lines must be added here (or as a parallel loader folded into the same map) or finance surfaces will silently disagree.
- **`convex/signupSubmission.ts`:** currently validates slot-level assignments, computes `totalAmountMinor` from ticket selections only, and persists `orderAssignments` per slot. Must persist accommodation selections (category/occupancy/upgrade/cot/age-band) and price them.
- **`components/signup/steps/RoomAssignmentStep.tsx` + `components/signup/state.ts`:** the buyer drag-drop room assignment step is replaced by an options step; `SignupDraft` gains accommodation option fields; `SIGNUP_STEP_ORDER` changes (rooms → options).
- **`components/signup/steps/ReviewSubmitStep.tsx`:** shows tickets + attendees today; must show accommodation options with prices and the new total.
- **`app/track-payment/page.tsx` (search-first) → `app/track-payment/[bookingRef]/page.tsx`:** permalink route; `convex/publicTracking.ts` already returns amount-due + payment status per booking ref and is the natural read contract for the re-priced order.
- **`convex/accommodation.ts` + `lib/domain/accommodation/assignments.ts`:** `getRoomAllocationBoard` / `generateAllocationProposal` already implement priority/gender/family ranking and `allocationPriority` (CRITICAL/HIGH/NORMAL/LOW) on attendees; add payment-state join and paid-first ranking.
- **`convex/schema.ts`:** `accommodationRoomTypes` (label, defaultCapacity, notes) and `accommodationRooms` (hotelId, roomTypeId, label, capacity, occupiedBeds) exist; categories, options, age bands, per-event rate config, and order accommodation selections are new tables. `ticketTypes.roomTypeId` and `events.accommodationEnabled` already exist (SEED-002 groundwork).
- **`lib/dashboard/workspace-routes.ts`:** accommodation workspace tabs are `hotels` and `allocation`; the new admin surface fits as a third tab (e.g. `options`/`upgrades`) or a settings action — route pattern is established.

## Sources

- Arrowhead Conferences & Events (Cru ministry) — Registration + Housing: payment-before-reservation config, one-room-per-paid-registrant, admin block control, manual assignment, change windows: https://arrowheadce.org/service/registration-housing/ (MEDIUM — vendor marketing page, but concrete feature claims)
- CampBrain Conference Center Management — buildings/rooms inventory, bookings, charges: https://campbrain.com/conference-centers/ (MEDIUM)
- Pretix product docs — add-on categories (add-ons only purchasable with base product), quotas as sellable capacity: https://docs.pretix.eu/guides/products/ (HIGH — official docs, current 2026)
- Eventbrite Help — "Edit your order information": self-service edits limited to attendee info, quantity/payment changes organizer-controlled: https://www.eventbrite.com/help/en-us/articles/441118/how-to-update-your-ticket-registration-information/ (HIGH — official help center)
- RoomSync — roommate matching/self-selection software (student housing; used as the "buyer-facing matching" anti-feature reference): https://www.roomsync.com/ (LOW — product marketing)
- Cvent room block management — group reservations, upgrades/amenities for group guests: https://www.cvent.com/en/event-marketing-management/passkey-room-block-management (LOW — marketing page)
- `.planning/PROJECT.md` — v5.0 milestone goal, active requirements, key decisions (HIGH)
- `.planning/seeds/SEED-002-ticket-room-eligibility.md` — ticket-driven room eligibility rules, waitlist/pending intent (HIGH)
- Codebase reads: `convex/finance.ts`, `convex/orders.ts`, `convex/publicTracking.ts`, `convex/signupSubmission.ts`, `convex/schema.ts`, `convex/accommodation.ts`, `components/signup/state.ts`, `components/signup/steps/*.tsx`, `lib/domain/accommodation/assignments.ts`, `lib/domain/finance/amounts.ts`, `lib/dashboard/workspace-routes.ts`, `app/track-payment/page.tsx` (HIGH — verified directly)

---

_Feature research for: v5.0 Accommodation Upgrades & Options — configurable pricing, buyer-selects/admin-assigns, booking-ref permalink with re-pricing, paid-priority allocation_
_Researched: 2026-08-05_
