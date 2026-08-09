# Roadmap: Conference Finance Dashboard

## Overview

v4.0 improved the protected event-scoped dashboard: information architecture, an actionable event Overview, consolidated Finance and Accommodation workspaces, and hardened shared states, responsiveness, and accessibility.

v5.0 turned accommodation into a reusable, configurable catalog: buyers select priced options at signup (admin assigns final rooms), admins configure rates and availability and explicitly confirm, a booking-reference permalink supports pre-confirmation configuration changes with server-side re-pricing, accommodation charges flow into the canonical amount-due, and allocation prioritizes paid attendees.

v6.0 completes the inversion v5.0 started: accommodation becomes **event-owned configuration** (deep-copied per event, evolving independently) layered over the preserved reusable hotel/physical-room/room-type/capacity inventory. Hardcoded option/category/age-band codes and boolean selection flags are replaced by generic data-driven options, pricing units, eligibility rules, and ticket entitlements (SEED-002). Setup is reused only through explicit copy/template actions with independent rows and auditable provenance, and signup, track-payment, confirmation, finance, reporting, payments, and allocation all consume one event-scoped contract with a single version boundary — with the confirmation snapshot remaining the single historical money authority.

## Milestones

- ✅ **v1.0 MVP** — shipped 2026-03-27
- ✅ **v2.0 Attendee Signup + Accommodation Self-Assignment** — groundwork delivered in phases 18-25
- ✅ **v3.0 Canonical Orders Foundation** — canonical runtime and finance groundwork delivered in phases 26-33
- ✅ **v4.0 Event Dashboard UX Overhaul** — phases 34-38 (Phase 38 verification absorbed into v5.0 Phase 45)
- ✅ **v5.0 Accommodation Upgrades & Options** — phases 39-45 executed; automated gates green, human verification items deferred (see STATE.md)
- 🚧 **v6.0 Dynamic Event Accommodation** — initialized 2026-08-06, phases 46-51 (roadmap created, awaiting approval)

<details>
<summary>✅ v4.0 Event Dashboard UX Overhaul (Phases 34-38) — shipped</summary>

## Milestone: v4.0 Event Dashboard UX Overhaul (Phases 34-38)

**Objective:** Turn the event-scoped dashboard into a stats-led operational home with concise navigation and coherent Finance and Accommodation workspaces.

### Scope

- Event Overview information architecture and bounded operational stats
- One concise event sidebar and clear event context
- Finance workspace for Orders, Payments, Donations, and Reconciliation
- Accommodation workspace for Hotels and Allocation
- Shared query states, responsive behavior, accessibility, settings/share placement, and regression verification

### Out Of Scope

- New public signup UX
- Ticket Tailor/provider schema redesign
- New finance formulas or canonical data model changes
- Cross-event analytics or multi-tenant support

## Phases

- [x] **Phase 34: Event Dashboard Information Architecture** - Establish the final event home, sidebar structure, route ownership, and Settings placement.
- [x] **Phase 35: Actionable Event Overview** - Build the stats-led event home and action-oriented operational summary from bounded existing contracts.
- [x] **Phase 36: Finance And Accommodation Workspaces** - Consolidate related routes into tabbed workspaces while preserving behavior and deep links.
- [x] **Phase 37: Shared Dashboard Quality** - Standardize query states, responsive layouts, keyboard behavior, and accessibility across migrated surfaces.
- [ ] **Phase 38: UX Regression And Human Verification** - Verify route integrity, data consistency, mobile/desktop behavior, and visual coherence. *(Deferred — absorbed into v5.0 Phase 45; human verification still open.)*

</details>

## Milestone: v5.0 Accommodation Upgrades & Options (Phases 39-45) — executed, human verification deferred

**Objective:** Turn accommodation into a reusable, configurable catalog where buyers select options and upgrades, admins configure rates and availability, payment tracking becomes a booking-reference permalink, and allocation prioritizes paid attendees — without weakening canonical finance behavior.

**Milestone status:** All 7 phases executed. Phase 45 plans 01-02 complete and plan 03 automated gates green. Deferred human verification: Phase 40/41/42/43/44 visual walkthroughs and the Phase 45 plan 03 task 3 human UAT checkpoint (tracked in STATE.md Deferred Verification).

### Scope

- Reusable accommodation catalog (categories, room types with descriptions, options, age bands) and event-scoped configuration (rates, upgrade, cot, availability, age-band rules)
- Admin "Upgrades & Options" workspace tab with explicit confirmation that locks buyer configuration changes
- Public signup: options-only selection (category/occupancy, superior upgrade, cot, optional age band) with live pricing; ticket-driven room eligibility (SEED-002)
- `/track-payment/[bookingRef]` permalink with ownership-gated, server-priced, idempotent configuration edits and re-pricing before admin confirmation
- Accommodation option charges flow into the canonical order amount-due (live for unconfirmed, snapshotted at confirmation)
- Allocation prioritizes paid attendees (paid highlighted, unpaid grayed) with assignment confirmation setting the lock boundary
- Cross-surface verification of money integrity, edit security, and idempotency

### Out Of Scope

- Multi-night/date-range rate engine, tax/discount/coupon engine, freeform admin price overrides
- Buyer-facing room self-assignment, real-time room-level inventory holds, roommate matching marketplace
- Full waitlist workflows (exhausted inventory keeps current no-availability behavior)
- SEED-002 multi-room-type entitlement array (`roomTypeIds` schema change deferred; single `roomTypeId` alignment only)
- Inline payment capture (Tikkie-link model preserved)

## Phases

- [x] **Phase 39: Accommodation Catalog & Event Config Schema** - Additive catalog and event-config data model that every other phase reads from. (completed 2026-08-05)
- [x] **Phase 40: Canonical Finance Derivation** - Accommodation charges flow into the single canonical amount-due loader. *(executed; human verification deferred)*
- [x] **Phase 41: Admin Upgrades & Options Tab** - Third workspace tab for rates, options, age bands, availability, and descriptions with explicit confirmation. *(executed; human verification deferred)*
- [x] **Phase 42: Public Signup Options** - Options-only selection with live pricing and ticket-driven eligibility. *(executed; human verification deferred)*
- [x] **Phase 43: Track Payment Permalink** - Booking-reference permalink with ownership-gated, server-priced configuration edits. *(executed; human verification deferred)*
- [x] **Phase 44: Allocation Paid-Priority** - Paid highlighted, unpaid grayed, assignment confirmation locks configuration. *(executed; human verification deferred)*
- [x] **Phase 45: Verification & Cross-Surface Audit** - "Looks done but isn't" checklist across money, security, and idempotency. *(automated gates green; human UAT task pending)*

---

### Phase 39: Accommodation Catalog & Event Config Schema

**Goal:** The system stores a reusable accommodation catalog (categories, room types with descriptions, options, age bands) and event-scoped configuration (stay, rates, upgrade/cot pricing, availability, age-band rules) so buyers can be offered priced options and admins can configure them.

**Depends on:** Phase 38 (v4.0 foundation)

**Requirements:** CAT-01, CAT-02, CAT-03, CFG-01, CFG-02, CFG-03, CFG-04, CFG-05

**Success Criteria:**

1. The catalog holds accommodation categories (standard, superior, family) with a label and an admin-facing description for allocation, and physical room types as leaf inventory items (label, capacity, physical count, admin description) each referencing a category, with bed arrangement part of the label.
2. The catalog holds reusable accommodation options (superior upgrade, cot) and age bands (under 3, 3-11, 12-17, 18+) defined once and referenceable by any event.
3. An event configures its accommodation stay (one night before the event initially, night count configurable), which catalog items/options are active, per-category × occupancy rates per person per night in minor units, upgrade price (default €10) and cot price (default €10) with cot age eligibility (under 3), and physical availability per room type and cot count.
4. Sellable beds equal room count × capacity — one derived availability source with no separate manually-tracked availability counter; age-band pricing rules may be left empty and seeded later; breakfast is included in all room prices.
5. The change is purely additive: existing events, room types, orders, and finance contracts remain valid, and Convex codegen and development deployment pass.

**Plans:** 1/1 plans complete

Plans:

- [x] 39-01-PLAN.md — Add the additive accommodation catalog and event configuration contract

---

### Phase 40: Canonical Finance Derivation

**Goal:** Accommodation option charges are part of the canonical order amount-due so Paid, Outstanding, and Reconciliation stay correct across every consumer.

**Depends on:** Phase 39

**Requirements:** FIN-01, FIN-02, FIN-03, FIN-04

**Success Criteria:**

1. Order amount-due includes accommodation line items (room rate, upgrade, cot) derived from event config, and the identical total appears on public tracking, order ledger, payments, reconciliation, reports, and attendee detail — no consumer recomputes it.
2. Unconfirmed orders price live from current event config; at admin confirmation the amount is snapshotted with a config-version boundary so confirmed orders never retroactively re-price when an admin later edits a rate.
3. A pure domain module computes accommodation amounts and is covered by unit tests; the duplicate inline total in the signup read path is removed and no UI surface computes accommodation totals.
4. Tikkie payment links agree with the canonical amount-due after accommodation re-pricing; stale links are expired/superseded and regenerated so buyers never pay a mismatched amount. *(Locked in execution: links are flexible-zero and never regenerated — STATE.md flexible-zero decision is authoritative.)*

**Plans:** 1/1 plans complete *(executed per STATE.md; visual verification deferred)*

Plans:

- [x] 40-01-PLAN.md — Extend canonical finance with live accommodation pricing and confirmation snapshots

---

### Phase 41: Admin Upgrades & Options Tab

**Goal:** Admins configure rates, options, age bands, availability, and room-type descriptions for an event from the Accommodation workspace, and explicitly confirm configuration to lock buyer changes.

**Depends on:** Phase 39

**Requirements:** ADM-01, ADM-02, ADM-03, CAT-04

**Success Criteria:**

1. The event Accommodation workspace provides an "Upgrades & Options" tab beside Hotels and Allocation where an admin configures per-category × occupancy rates, upgrade/cot prices and eligibility, age bands, availability counts, and room-type descriptions.
2. An admin can view and edit the reusable catalog and room-type descriptions so room allocation decisions are well informed.
3. The Hotels and Allocation tabs keep their existing behavior and money is never recomputed in the UI — every amount shown comes from canonical contracts.
4. An explicit confirm action locks buyer configuration changes, closing the buyer edit window for that order (server-enforced by later phases).
5. Saving rate/option changes communicates pending-order impact (e.g., "N pending orders will re-price") without eagerly rewriting any order data.

**Plans:** 2/2 plans complete *(executed per STATE.md; visual verification deferred)*

Plans:

- [x] 41-01-PLAN.md — Add version-aware admin impact data and server-backed buyer configuration confirmation
- [x] 41-02-PLAN.md — Build the responsive Upgrades & Options workspace tab and reusable catalog editor

---

### Phase 42: Public Signup Options

**Goal:** Buyers select accommodation options only (category + occupancy, superior upgrade, cot, optional age band) with live pricing, and room eligibility is driven by the ticket.

**Depends on:** Phases 40-41

**Requirements:** SIG-01, SIG-02, SIG-03, SIG-04, TKT-01, TKT-02

**Success Criteria:**

1. During signup a buyer selects accommodation options only — category with single/shared/family occupancy, superior upgrade, cot for under-3, optional age band — and never books a specific room.
2. The accommodation step and review step show per-person-per-night pricing and a live price breakdown, with breakfast included and cot eligibility gated by age band.
3. Age band is captured optionally per attendee and may be left blank; the buyer-facing slot drag-drop is replaced by option selection.
4. Submitting the order persists per-attendee accommodation selections (preferences), not room placements; final room placement remains admin-controlled.
5. Room eligibility derives from the selected ticket's allowed room category/type; the signup shows the selected ticket rather than asking for ticket type again, and invalid option/ticket combinations are rejected at submission.

**Plans:** 2/2 plans complete *(executed per STATE.md; visual verification deferred)*

Plans:

- [x] 42-01-PLAN.md — Establish the public catalog, canonical live quote, and server-side options-only submission contract
- [x] 42-02-PLAN.md — Replace room assignment with quote-backed per-attendee accommodation options in public signup

---

### Phase 43: Track Payment Permalink

**Goal:** A buyer opens their booking at a durable `/track-payment/[bookingRef]` permalink, sees balance, progress, and selections, and can change accommodation configuration before admin confirmation with server-side re-pricing and ownership-gated edits.

**Depends on:** Phases 40, 42

**Requirements:** TRK-01, TRK-02, TRK-03, TRK-04, TRK-05, TRK-06

**Success Criteria:**

1. A buyer opens a booking via the durable `/track-payment/[bookingRef]` permalink and sees balance, payment progress, tickets, and accommodation selections; the existing booking-reference search page remains as an entry point and old `/track-payment` deep links still work.
2. Before admin confirmation, a buyer can change accommodation configuration on the permalink; the order re-prices server-side from event config and the amount due updates immediately.
3. Permalink edits require ownership proof (booker email match or edit token), are rate-limited, idempotent (re-submitting identical changes alters nothing), and reject client-supplied amounts — all pricing is computed server-side from validated option IDs.
4. After admin confirmation, permalink edits are rejected server-side (not merely hidden in the UI) and the payment link reflects the confirmed amount.
5. When a change reduces the amount due, the excess is surfaced as an overpayment with an explicit refund-vs-donation handling path rather than a silent donation, and stale Tikkie links are expired/superseded. *(Locked in execution: flexible-zero links are never regenerated — STATE.md flexible-zero decision is authoritative.)*

**Plans:** 3/3 plans complete *(executed per STATE.md; visual verification deferred)*

Plans:

- [x] 43-01-PLAN.md — Establish the ownership-gated, audited server edit contract
- [x] 43-02-PLAN.md — Add the rate-limited honeypot-protected edit API route
- [x] 43-03-PLAN.md — Build the durable permalink UI and options editor

---

### Phase 44: Allocation Paid-Priority

**Goal:** The admin Allocation view derives per-attendee paid state from canonical finance data, highlights paid attendees, grays unpaid ones, and its assignment-confirmation flow sets the boundary that locks buyer configuration changes.

**Depends on:** Phases 40-41

**Requirements:** ALL-01, ALL-02, ALL-03

**Success Criteria:**

1. The Allocation view derives a per-attendee paid state from canonical per-attendee due/paid maps (never from order status), surfacing paid/partial/unpaid distinctions.
2. Paid attendees are highlighted and ranked first in unassigned/queue ordering; unpaid attendees are grayed so admins do not assign rooms before payment completes.
3. An internal event with recorded payments correctly shows paid attendees as paid (not everyone grayed).
4. Admin assignment confirmation sets the confirmedAt boundary that locks buyer configuration changes; subsequent edit attempts are rejected server-side.

**Plans:** 3/3 plans complete *(executed per STATE.md; visual verification deferred)*

Plans:

- [x] 44-01-PLAN.md — Define the pure canonical allocation payment-state contract
- [x] 44-02-PLAN.md — Wire paid-priority board data and assignment confirmation locking
- [x] 44-03-PLAN.md — Render accessible paid-first Allocation states and preserve proposal ordering

---

### Phase 45: Verification & Cross-Surface Audit

**Goal:** The "looks done but isn't" checklist is closed: money integrity, edit security, idempotency, immutability after confirmation, deep-link preservation, and full automated validation.

**Depends on:** Phases 39-44

**Requirements:** (none — verifies Phases 39-44)

**Success Criteria:**

1. Invoking the permalink edit mutation twice with identical arguments leaves the order total unchanged (idempotency verified by test).
2. Edit-after-confirm and ref-only-edit requests are rejected server-side; client price tampering and unknown/stale option IDs are rejected with typed errors.
3. The same order shows identical amount-due across reconciliation, revenue, order ledger, payment summary, auto-match, attendee detail, and public tracking; attendee detail outstanding equals that attendee's ticket + accommodation line items.
4. Confirmed orders do not re-price after an admin rate edit; stale Tikkie links are expired post-re-price; downward re-price after payment surfaces the overpayment decision instead of silently donating. *(Locked in execution: flexible-zero links are never regenerated — STATE.md flexible-zero decision is authoritative.)*
5. Convex codegen and development deploy, typecheck, tests, and production build pass, and human UAT confirms options-only signup, permalink re-pricing, and paid-priority allocation on representative events.

**Plans:** 3 plans in 2 waves *(plans 01-02 executed, plan 03 tasks 1-2 executed; task 3 human UAT pending)*

Plans:

- [x] 45-01-PLAN.md — Prove canonical money integrity across every consumer
- [x] 45-02-PLAN.md — Close edit security, idempotency, and confirmation immutability gaps
- [ ] 45-03-PLAN.md — Verify deep links, cross-surface UX, full automation, and deferred UAT *(tasks 1-2 executed; task 3 human UAT checkpoint pending)*

---

## Active Milestone: v6.0 Dynamic Event Accommodation

**Objective:** Redesign accommodation as flexible, event-owned configuration over the established reusable hotel and physical-room workflow, with explicit setup reuse and dynamic ticket-aware signup consumption.

**Phase structure:** Backend/data phases (46-47) land first as one typecheck-green unit; UI phases (48-49) and integration (50) consume the locked contracts; verification (51) closes the cross-surface checklist. No backend contract change happens after Phase 47 (verification may only surface defects). UI and backend/data work are never merged into the same phase.

### Scope

- Event-owned accommodation setup: rules, rate matrix (incl. recognizable Standard/Superior as data), generic dynamic options (label, description, unit, price, eligibility, optional resource limits), age bands + pricing, resources, and ticket entitlements (SEED-002) — deep-copied per event, evolving independently; global catalog rows are never read live by signup or finance.
- Explicit copy/template reuse: atomic deep copy under the target `eventId` with remapped IDs, snapshotted labels, provenance, idempotency, and no order/occupancy state; independent evolution after copy.
- Safe lifecycle: reference-checked soft archive/delete of event-owned entities; archived rows hidden from new signup while remaining resolvable for existing selections and historical snapshots.
- Generalized pricing and finance: pure line-item engine priced from resolved event-owned option rows by unit/quantity/night basis; data-driven receipt lines; confirmation snapshots generalized with a complete line-item list while legacy boolean shapes stay valid; fail-closed completeness guard extended, never loosened.
- One shared event-owned projection and single version boundary consumed by admin setup, public catalog, quote, submission, track-payment edit, canonical finance, reporting, payments, and allocation; one server-side eligibility resolver so surfaces cannot drift.
- Public signup and track-payment consumption of the dynamic contract: data-driven cards, server-owned quotes, generic option + quantity selections, preserved permalink protections, post-confirmation edit lock.
- Allocation alignment and canonical consumer integration: entitlement-aligned board, paid-priority + confirmation lock preserved, no consumer recomputes accommodation money.
- Cross-surface verification: money integrity, legacy hotel workflow regression, copy isolation, archive safety, security/idempotency, bounded reads, hardcoded-branch sweep, human UAT.

### Out Of Scope

- Live global configuration coupling (global catalog rows may remain seed/template origins only)
- Hardcoded option/category/age-band codes and boolean selection flags (explicitly removed by this milestone)
- Buyer-facing physical-room selection or room holds (placement remains admin-controlled)
- Destructive migration of existing orders or snapshots (historical finance must remain readable and immutable)
- Multi-room-type `roomTypeIds` entitlement array (capability delivered event-side via ticket-rule rows; no `ticketTypes` schema break)
- Template version propagation or bulk template updates after a copy (templates immutable-after-copy)
- Waitlist/pending-intent workflows, spreadsheet import/export, multi-night/date-range pricing, roommate matching
- Inline payment capture, taxes, discounts, coupons, freeform admin price overrides
- Full Ticket Tailor/provider schema redesign, cross-event analytics, multi-tenant support, QR-code event check-in (SEED-001 remains dormant)
- New runtime dependencies, services, payment providers, or auth systems

## Phases

- [ ] **Phase 46: Event-Owned Setup Schema, Generalized Pricing & Shared Contract** (backend/data) - Additive event-owned schema, generalized line-item pricing engine, shared projection + single version boundary, legacy compatibility, SEED-002 rules tables.
- [ ] **Phase 47: Copy/Template Engine, Eligibility Resolver & Safe Archive** (backend/data) - Atomic copy/template mutations with provenance and idempotency, one shared eligibility resolver, reference-safe archive/delete.
- [ ] **Phase 48: Admin Accommodation Setup UX** (UI) - Data-driven Setup experience, copy/template preview dialogs, lifecycle + pending-impact controls; Hotels/Allocation tabs and deep links preserved.
- [ ] **Phase 49: Public Signup & Track-Payment Consumption** (UI/flow) - Data-driven option cards, server-owned quote/review/submission, generalized track-payment editor with preserved protections.
- [ ] **Phase 50: Allocation Alignment & Canonical Consumer Integration** (integration) - Entitlement-aligned allocation board, paid-priority + confirmation lock preserved, canonical finance/reporting/payment consumer agreement.
- [ ] **Phase 51: Verification & Cross-Surface Audit** - Money integrity, legacy hotel workflow, copy isolation, archive safety, security, bounded reads, hardcoded-branch sweep, human UAT.

---

### Phase 46: Event-Owned Setup Schema, Generalized Pricing & Shared Contract

**Goal:** The system stores the complete event-owned accommodation contract (setup provenance, categories, options with units, age bands, rates, age pricing, resources, ticket rules) with one shared server projection and one version boundary, prices it through a generalized pure line-item engine, and keeps every existing event, order, selection, and confirmed snapshot readable and financially unchanged.

**Depends on:** Phases 39-45 (v5.0 foundation — schema, finance loader, selection/snapshot contracts, version boundary)

**Requirements:** SET-01, SET-02, SET-03, SET-04, SET-05, STAY-01, CFG-01, CFG-02, CFG-03, CFG-05, TKT-01, TKT-04, TKT-05, SEL-01, SEL-02, SEL-03, FIN-01, FIN-02, FIN-03, FIN-04, FIN-05

**Success Criteria:**

1. An admin who opens any existing event, order, selection, or confirmed snapshot after this phase lands sees the same accommodation configuration, selections, and amounts as before — the change is additive, legacy rows (including boolean confirmed snapshots) remain readable, and incomplete confirmed snapshots still fail closed.
2. Every amount shown to a buyer or admin for an unconfirmed order derives from the event's own setup rows via the generalized pure pricing engine and the existing finance loader — no consumer reads global catalog rows as live configuration and no UI formula computes money.
3. A configured option with any supported v6.0 unit (`per_night`, `per_person`, or `per_person_per_night`) prices correctly by unit × quantity × applicable nights with base-coverage, option-inclusion, and age rules applied, and appears as a data-driven receipt line carrying label, unit, quantity, and charge — future units are rejected rather than silently interpreted.
4. Every consumer (admin setup read, public catalog, quote, submission, track-payment edit, canonical finance, allocation) resolves the same event-scoped projection and version token; every config write advances the single version boundary atomically, and pending-order impact is honest.
5. Each event owns a ticket accommodation rule (SEED-002) seeded from `ticketTypes.roomTypeId` / `accommodationIncluded`, so entitlement resolution can read one event-owned rule set across all surfaces; included tickets cover the configured base accommodation nights while non-included tickets pay the base rate.
6. Ticket rules explicitly control included upgrades/add-ons: a selected higher-tier upgrade can be charged per person per night across all selected nights, including covered base nights, unless that option is explicitly included by the ticket rule.

**Scope:**

- New event-owned tables: `eventAccommodationSetup` (provenance + single version boundary), event-owned categories/options/age bands, the base/extended stay contract, `eventAccommodationRates` rekeyed to event categories, `eventTicketAccommodationRules` (SEED-002), and `orderAccommodationOptionSelections` child rows. Copy/template audit behavior is Phase 47.
- Widen hardcoded naming unions (`categories.code`, `options.code`, `ageBandCode`) to data while keeping option `kind`, `occupancy`, `unit`, and `rateType` as typed domain unions; move `LOCKED_OPTION_SEMANTICS` / `LOCKED_AGE_BAND_BOUNDS` from code to seed data.
- Generalize `lib/domain/finance/accommodation-amounts.ts` into a pure line-item engine (resolved option list, no named booleans); extend `AccommodationPriceSnapshot` with data-driven `optionLines` and extend the fail-closed completeness guard to accept both legacy and new shapes.
- Collapse the two duplicate resolvers into one `loadEventOwnedAccommodationContext` shared projection; wire `convex/finance.ts` loader; dual-read `setupMode: legacy_global | event_owned | uninitialized` with per-event materialization.
- Selection-write contract generalization: signup submission and track-payment validators accept event-scoped option IDs, quantities, and bounded stay-choice inputs while rejecting monetary/computed-night/eligibility args; legacy boolean dual-read during transition.

**Out of scope:** Copy/template mutations (Phase 47), the shared eligibility resolver's enforcement logic (Phase 47), archive/delete mutations (Phase 47), any UI change, one-time global backfill migration (per-event materialization only).

**Planning decisions (research flags to lock at plan time):**

- Pricing-unit vocabulary — locked to `per_night` / `per_person` / `per_person_per_night` for v6.0; `per_stay` and `flat` are future extensions and must be rejected as unhandled. `unit` / `rateType` stay typed unions with pure handler registries, never free strings in money math.
- Single version-boundary owner — locked to `eventAccommodationSetup.updatedAt`; `eventAccommodationConfig.updatedAt` remains a stay-window timestamp only.
- Ticket-rules shape — locked to event-owned `eventTicketAccommodationRules` with `allowedCategoryKeys` and current single `ticketTypes.roomTypeId` seed; no `ticketTypes.roomTypeIds` array.
- Standard/Superior as data — locked to an explicit event-category relationship such as `isSuperior`; no `categoryCode === "superior"` branches survive.
- Percent rate-type rounding — follow the codebase `allocateMinorAmountByWeight` conventions.
- Per-event materialization on first explicit admin setup/save; no one-time global backfill.
- Additive selection/snapshot generalization — keep legacy boolean fields readable; new generic child rows only.

**Plans:** 5 plans in 5 waves

Plans:
- [ ] 46-01-PLAN.md — Add the additive event-owned schema and generalized pure pricing tracer
- [ ] 46-02-PLAN.md — Build the shared event-owned projection, materialization, and version boundary
- [ ] 46-03-PLAN.md — Wire canonical finance, confirmation snapshots, and public server contracts
- [ ] 46-04-PLAN.md — Generalize signup and track-payment selection persistence with server authority
- [ ] 46-05-PLAN.md — Run cross-surface regression and complete Phase 46 validation gates

---

### Phase 47: Copy/Template Engine, Eligibility Resolver & Safe Archive

**Goal:** An admin can explicitly copy an accommodation setup from another event or apply a named template, producing fully independent event-owned rows with auditable provenance; one shared eligibility resolver enforces ticket/option rules identically across every surface; archive/delete is reference-safe.

**Depends on:** Phase 46 (rows to copy and price, widened validators, shared projection)

**Requirements:** CFG-04, TKT-02, TKT-03, REUSE-01, REUSE-02, REUSE-03, REUSE-04, LIFE-01, LIFE-02

**Success Criteria:**

1. Copying setup from event A to event B yields fully independent B-owned rows — editing B's rate/option never changes A and editing A never changes B (bidirectional isolation proven by test).
2. Re-running a copy with the same idempotency key is a no-op or fails cleanly ("setup already exists"); a copy never carries orders, selections, snapshots, assignments, or the source stay window, and leaves an append-only provenance record.
3. Applying a saved named template to a fresh event creates an event-owned setup with remapped IDs, target-derived stay details, and no order/occupancy state (or, if the named-template flag defers the table, copy-from-event satisfies this criterion).
4. The one server-side eligibility resolver gates catalog, quote, submission, track-payment edit, and allocation identically: disabled, archived, out-of-scope, or ineligible selections are rejected server-side with the same explicit reason everywhere, and omitted/single/multiple entitlement cases behave as SEED-002 prescribes.
5. Archive/delete of a referenced category/option/age band/rule/resource is blocked or performs a reference-safe soft archive; archived rows disappear from new signup choice sets while remaining resolvable for existing selections and historical snapshots.

**Scope:**

- `copyAccommodationSetupFromEvent` and template apply: one atomic Convex mutation per action, deep copy of every event-owned row under the target `eventId`, global catalog/inventory IDs preserved (intentionally shared), labels/descriptions snapshotted, target stay derived from target dates, `sourceRef` provenance, idempotency key + fingerprint (reuse `orderIdempotency` pattern), "setup exists" guard, copy audit rows.
- One server-side eligibility resolver (pure function: ticket × event × choice → allowed/denied + reason) shared by signup catalog, quote, submission, track-payment edit, and allocation; ticket-rule seeding from `ticketTypes.roomTypeId` / `accommodationIncluded`.
- Reference-checked soft archive/delete mutations for event-owned entities (block with "Cannot delete with references" guard; archive-only for anything referenceable by selections/snapshots/audits/assignments).
- Contract extensions: `getEventAccommodationConfig` gains copy-source/template options + preview; catalog/quote return dynamic rules and archive state.

**Out of scope:** Any UI change (Phase 48), the pricing engine and shared projection (Phase 46), legacy boolean field removal (post-v6.0 transition window), template versioning/update propagation.

**Planning decisions (research flags to lock at plan time):**

- Physical inventory on copy — linked (shared physical entities, event-owned configuration only; PROJECT.md leans this way) vs cloned; lock before the copy engine is written.
- Named template table (`accommodationSetupTemplates`) vs copy-from-event only — research recommends copy-first; the named table is P2 unless a requirement demands presets.
- Copy idempotency / OCC conflict — "setup already exists" guard vs last-writer-wins (recommended: guard + idempotency key).
- Copy audit table shape — append-only, server-valued fields, `by_*_and_*` indexes (reuse the `orderAccommodationEditAudits` pattern).

**Plans:** TBD (run /gsd-plan-phase 47 after roadmap approval)

---

### Phase 48: Admin Accommodation Setup UX

**Goal:** Admins configure the full event-owned setup, run copy/template actions with a mandatory preview, and manage lifecycle from the Accommodation workspace — rendered exclusively from server contracts, with no code-specific branches and no changes to the Hotels/Allocation behavior.

**Depends on:** Phases 46-47 (contracts and copy/archive mutations locked)

**Requirements:** ADM-01, ADM-02, ADM-03

**Success Criteria:**

1. From the Accommodation workspace, an admin can create, edit, reorder, enable, and disable event-owned categories, rate rows, generic options (label, description, unit, price, resource limit, eligibility), age bands, age pricing, and ticket entitlements — rendered from `getEventAccommodationConfig` / the setup contract with no hardcoded option-code lookups.
2. Before applying a copy or template action, the admin sees a mandatory preview: source event/template, what will be copied/remapped/reset, what already exists on the target, archived references skipped, and the target stay derivation.
3. Before destructive or re-pricing actions, the admin sees server-computed archive reference state and pending-order impact ("N pending orders will re-price") and can review provenance and archive state of the setup.
4. The existing Hotels and Allocation tabs, deep links (`?tab=` contract), event scoping, loading/error/empty states, responsive behavior, and accessibility remain usable after the Setup experience is added.
5. Fresh, disabled-accommodation, exhausted, ineligible, and archived states each have deliberate honest copy with a pointer to the configuring action.

**Scope:**

- Data-driven generalization of `upgrades-options-config-form.tsx` / `upgrades-options-catalog.tsx` (codes/kinds/units editable in place, dynamic ticket-rules table, age-band editor, rate grid, resource limits).
- Copy/template dialog with mandatory preview step (source picker, copy/remap/reset summary, existing-target state, confirm, audit status).
- Lifecycle controls (archive/delete) with reference-safety outcomes and pending-impact panel extended to all dynamic config changes; provenance display.
- Provider (Ticket Tailor) mapping surface: unmapped provider ticket categories/age groups visible, not silently null.
- Tab rename handling ("Upgrades & Options" → "Accommodation Setup") preserving the `?tab=` query-param contract or providing a safe redirect.

**Out of scope:** Backend contract changes (Phases 46-47), public signup/track-payment UI (Phase 49), allocation board changes (Phase 50), copy undo (audit-only, no eager revert — recommended).

**Planning decisions (research flags to lock at plan time):**

- Tab rename — keep the `?tab=upgrades-options` query-param contract and rename the label (recommended) vs a redirect.
- Copy undoability — audit-only, no eager revert (recommended).
- Provider mapping surface — exact UI shape for unmapped provider tickets/age groups (research: must be visible, not silently null).

**Plans:** TBD (run /gsd-plan-phase 48 after roadmap approval)

---

### Phase 49: Public Signup & Track-Payment Consumption

**Goal:** Buyers see exactly what each event configured — data-driven option cards, server-owned quotes, and editable selections from one server contract — with no hardcoded option cards, and the track-payment permalink keeps every protection from v5.0.

**Depends on:** Phases 46-47 (widened public contracts, shared eligibility resolver, generalized selection writes)

**Requirements:** STAY-02, PUB-01, PUB-02, PUB-03, PUB-04, PUB-05

**Success Criteria:**

1. Signup renders every enabled event option and eligibility state generically from the server display contract — an admin-created third option appears on signup and can be selected without code changes.
2. Signup quote, review, and submission use the same server-side resolver and show an honest data-driven breakdown: labels, units, quantities, charges, configured stay rules, breakfast, and ticket eligibility.
3. Events without configured or enabled accommodation show a clear no-accommodation/unavailable state, and invalid accommodation choices cannot be submitted.
4. Before confirmation, the booking-reference flow can edit generic option selections under the existing ownership, signature, rate-limit, honeypot, idempotency, and server-pricing protections; after confirmation, edits are rejected server-side and the confirmed snapshot is the source of the displayed accommodation amount.
5. Selection payloads carry only event-scoped option IDs, quantities, and validated stay-choice inputs — prices, totals, computed nights, and eligibility are server-resolved (price-tamper and cross-event-option rejection tests pass).
6. When event extensions are enabled, an attendee can add an allowed night before or after the event even when the ticket includes base accommodation; the quote charges only the extra non-covered night and confirmation snapshots the resolved stay choice.

**Scope:**

- `AccommodationOptionsStep.tsx` rewritten to render generic data-driven cards from `getPublicSignupCatalog` (kind/unit/price/eligibility, option-agnostic).
- Generalized quote rendering (`getPublicSignupAccommodationQuote`) and generalized `TrackPaymentAccommodationEditor` consuming the same resolver and `orderAccommodationOptionSelections` child rows.
- Selection payloads become `Array<{ optionId, quantity? }>` plus a bounded validated stay choice; legacy boolean dual-read during transition.
- Extended-stay choices are explicit buyer preferences; check-in/check-out or an equivalent bounded choice is validated against the event stay policy, while night count and price are always derived server-side. Ticket-included base nights do not suppress allowed paid extensions.
- Mid-signup invalidation generalized from the v5.0 cot-clearing rule to any option that becomes disabled/archived/ineligible mid-flow (clear + explain + allow re-selection).
- Legacy `slots`-based signup coexistence preserved until its migration window is decided (open v5.0 flag — do not force the legacy flow off).

**Out of scope:** Backend contract changes (Phases 46-47), admin setup UI (Phase 48), allocation board (Phase 50), removal of legacy `slots` block or legacy boolean fields (post-v6.0 transition window).

**Planning decisions (research flags to lock at plan time):**

- Legacy `slots`-based signup coexistence — open v5.0 flag; dynamic rules must not force the legacy flow off before its migration window is decided.
- Mid-signup invalidation semantics — confirm the generalized clear+explain+re-select rule for any disabled/archived/ineligible option (extends the Phase 42 cot rule).

**Plans:** TBD (run /gsd-plan-phase 49 after roadmap approval)

---

### Phase 50: Allocation Alignment & Canonical Consumer Integration

**Goal:** The Allocation board applies the same event-owned ticket entitlement and eligibility rules used by signup while keeping the physical hotel/room/room-type/capacity workflow and paid-priority + confirmation lock intact, and every canonical consumer (finance, reporting, payments) integrates the generalized accommodation contract without drift.

**Depends on:** Phases 46-49 (shared projection, eligibility resolver, public surfaces, admin surfaces)

**Requirements:** ALL-01, ALL-02

**Success Criteria:**

1. The Allocation board continues to use the physical hotel/room/room-type/capacity workflow while applying the same event-owned ticket entitlement rules as signup — an admin cannot place an attendee into a category their ticket does not allow (block or warn per the locked decision).
2. Paid-priority classification and assignment confirmation continue to consume canonical per-attendee due/paid state and preserve the confirmedAt lock boundary; no accommodation money is recalculated in the UI.
3. Canonical finance, reporting, payments, attendee detail, and allocation agree on event-owned accommodation amounts including dynamic option lines — no consumer recomputes or diverges (loader wiring from Phase 46 verified across the full consumer set).
4. Assignment/confirmation writes persist `confirmedAt` + `configVersion` + the generalized snapshot atomically; legacy and partially-confirmed sets behave exactly as in v5.0.

**Scope:**

- `getRoomAllocationBoard` joins the shared entitlement resolver so board eligibility matches signup; mismatch warnings or blocks per the locked enforcement strength.
- Paid-priority + entitlement-aligned assignment confirmed; physical placement machinery (`assignedRoomId` / `orderAssignments`) unchanged.
- Integration verification across canonical consumers: `convex/publicTracking.ts`, `orders.ts`, `payments.ts`, `reports.ts`, `attendees.ts`, `autoSync.ts` all read `loadOrderAmountDueBreakdowns` with the generalized inputs — no consumer-level changes expected, regressions surfaced and fixed here.

**Out of scope:** New money formulas or loader redesign (Phase 46), signup/admin/public UI changes (Phases 48-49), hotel/room workflow redesign, removal of legacy fields.

**Planning decisions (research flags to lock at plan time):**

- Entitlement enforcement strength on the board — block vs warn (align with SEED-002; research recommends explicit + auditable).

**Plans:** TBD (run /gsd-plan-phase 50 after roadmap approval)

---

### Phase 51: Verification & Cross-Surface Audit

**Goal:** The "looks done but isn't" checklist is closed across cross-surface money integrity, the preserved legacy hotel workflow, copy isolation, archive safety, security/idempotency, bounded reads, and the hardcoded-branch sweep.

**Depends on:** Phases 46-50

**Requirements:** VER-01, VER-02, VER-03

**Success Criteria:**

1. A cross-surface money matrix proves that admin setup, signup, track-payment, confirmation, finance, reporting, payments, and allocation agree on event configuration and canonical amounts including dynamic option lines (extends the Phase 45 matrix).
2. The old hotel/physical-room/room-type/capacity workflow still works end-to-end (create hotel → link to event → create rooms → generate slots → allocate), with no buyer-required physical room.
3. Copy isolation is proven bidirectionally; archive/reference safety holds (referenced rows blocked or archived, unconfirmed references fail closed); and legacy boolean snapshots still price identically after the schema change.
4. Security regressions hold: price tampering and cross-event option IDs rejected; edit-after-confirm rejected; idempotency honored; incomplete confirmed snapshots fail closed.
5. Bounded-read tests prove a setup larger than every old `.take()` cap round-trips fully through admin, signup, and finance, and a static source audit shows no hardcoded option/category/age-band code branches remain in the new dynamic setup or public rendering paths.

**Scope:**

- Automated tests: schema compatibility, generic unit pricing per unit type, eligibility consistency across surfaces, copy isolation, idempotency, archive/reference safety, legacy snapshot fixtures, bounded event-scoped projections.
- Static source audit extended from `tests/finance/phase45-money-integrity.test.ts` style (no client money, no option-code switches).
- Full validation matrix: node + convex + components + typecheck + build + `npx convex codegen` + `npx convex dev --once`; human UAT walkthrough (incl. the third-option rendering check, copy preview, and empty/unavailable states).

**Out of scope:** Production code changes except defect fixes surfaced by the audit; removal of legacy `slots` / boolean fields (post-v6.0 transition window); new features.

**Planning decisions:** Standard verification patterns proven in v5.0 Phase 45 — no research flags.

**Plans:** TBD (run /gsd-plan-phase 51 after roadmap approval)

---

## Progress

| Phase | Milestone | Goal | Requirements | Status |
| --- | --- | --- | --- | --- |
| 34 - Event Dashboard Information Architecture | v4.0 | Event home and navigation | UX-01, UX-02, UX-03, QUAL-04 | Complete |
| 35 - Actionable Event Overview | v4.0 | Stats-led operational home | OPS-01, OPS-02 | Complete |
| 36 - Finance And Accommodation Workspaces | v4.0 | Consolidated operational workspaces | FINUX-01, FINUX-02, ACCUX-01, ACCUX-02 | Complete |
| 37 - Shared Dashboard Quality | v4.0 | Shared states and responsive accessibility | QUAL-01, QUAL-02, QUAL-03 | Complete |
| 38 - UX Regression And Human Verification | v4.0 | Cross-route verification | OPS-03 | Deferred (absorbed into v5.0 Phase 45) |
| 39 - Accommodation Catalog & Event Config Schema | v5.0 | Reusable catalog + event config | CAT-01..03, CFG-01..05 | Complete (2026-08-05) |
| 40 - Canonical Finance Derivation | v5.0 | Accommodation in canonical amount-due | FIN-01..04 | Executed — human verification deferred |
| 41 - Admin Upgrades & Options Tab | v5.0 | Config surface + explicit confirm | ADM-01..03, CAT-04 | Executed — human verification deferred |
| 42 - Public Signup Options | v5.0 | Options-only signup + ticket eligibility | SIG-01..04, TKT-01, TKT-02 | Executed — human verification deferred |
| 43 - Track Payment Permalink | v5.0 | Booking-ref permalink + re-price | TRK-01..06 | Executed — human verification deferred |
| 44 - Allocation Paid-Priority | v5.0 | Paid-priority allocation + lock | ALL-01..03 | Executed — human verification deferred |
| 45 - Verification & Cross-Surface Audit | v5.0 | Money/security/idempotency audit | — | Automated gates green; human UAT pending |
| 46 - Event-Owned Setup Schema, Generalized Pricing & Shared Contract | v6.0 | Event-owned contract + generalized money | SET-01..05, STAY-01, CFG-01..03, CFG-05, TKT-01, TKT-04..05, SEL-01..03, FIN-01..05 | Not started |
| 47 - Copy/Template Engine, Eligibility Resolver & Safe Archive | v6.0 | Independent reuse + one resolver + safe lifecycle | CFG-04, TKT-02..03, REUSE-01..04, LIFE-01..02 | Not started |
| 48 - Admin Accommodation Setup UX | v6.0 | Data-driven setup + preview + lifecycle controls | ADM-01..03 | Not started |
| 49 - Public Signup & Track-Payment Consumption | v6.0 | Dynamic option cards + quotes + edits + optional extra nights | STAY-02, PUB-01..05 | Not started |
| 50 - Allocation Alignment & Canonical Consumer Integration | v6.0 | Entitlement-aligned board + consumer agreement | ALL-01..02 | Not started |
| 51 - Verification & Cross-Surface Audit | v6.0 | Money/legacy/isolation/security/read-bounds audit | VER-01..03 | Not started |

**Execution Order:** 46 → 47 → 48 → 49 → 50 → 51

**Totals:** v4.0: 5 phases (34-38), 14 requirements. v5.0: 7 phases (39-45), 31 requirements, all executed (human verification deferred). v6.0: 6 phases (46-51), 44 requirements mapped (100%), Phase 46 planned.
