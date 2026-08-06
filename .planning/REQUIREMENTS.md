# Requirements: Conference Finance Dashboard

**Defined:** 2026-08-06
**Milestone:** v6.0 Dynamic Event Accommodation
**Core Value:** Give church finance admins one reliable place to track conference revenue, reconcile ticket sales with payment collections, and act on outstanding balances quickly.

## v6.0 Requirements

### Event-Owned Setup

- [ ] **SET-01**: An admin can initialize an event accommodation setup from an empty or legacy event state without changing any other event's setup; explicit event/template reuse is covered by REUSE-01 and REUSE-02.
- [ ] **SET-02**: The event owns the commercial accommodation configuration used for labels, rates, options, age rules, availability rules, and ticket entitlements; global catalog rows are never read as live configuration by signup or finance.
- [ ] **SET-03**: The established hotel, physical-room, room-type, capacity, room-slot, and admin allocation workflow continues to work without requiring a buyer to select a physical room.
- [ ] **SET-04**: All accommodation consumers use one event-scoped server projection and one configuration-version boundary for setup reads, quotes, finance, confirmation, and allocation.
- [ ] **SET-05**: Existing events, existing orders, legacy selections, and legacy confirmed snapshots remain readable and financially safe while event-owned setup is introduced.
- [ ] **STAY-01**: An event-owned setup can be accommodation-disabled or can store a configurable base accommodation window (commonly the night before the event), night count, breakfast policy, and optional extended-stay availability before the event, after the event, or both with configured limits; the same resolved stay rules feed signup, track-payment, finance, and confirmation.
- [ ] **STAY-02**: When extended stays are enabled, an attendee can select an allowed extra night before and/or after the event independently of ticket inclusion; the server derives the resulting night count, charges only the non-covered extra nights, and snapshots the resolved stay choice at confirmation.

### Dynamic Configuration

- [ ] **CFG-01**: An admin can define event-owned accommodation categories and rate rows for the supported occupancy vocabulary, including recognizable Standard and Superior pricing relationships without code-specific category branching.
- [ ] **CFG-02**: An admin can create, edit, enable, disable, and order generic accommodation options with labels, descriptions, typed pricing units, prices, and optional resource limits.
- [ ] **CFG-03**: An admin can define event-owned age bands and age-band pricing rules using the supported rate behaviors without relying on a fixed set of age-band codes.
- [ ] **CFG-04**: Event configuration can express option eligibility and ticket-driven room/category rules, and the server rejects selections that are disabled, archived, out of scope, or ineligible.
- [ ] **CFG-05**: Event configuration changes update the single version boundary and expose honest pending-order impact without rewriting existing orders.

### Ticket Entitlements

- [ ] **TKT-01**: A ticket type or event-owned ticket rule defines the attendee's accommodation entitlement and allowed room category/type during signup and allocation, following SEED-002.
- [ ] **TKT-02**: Omitted, single, and multiple eligible accommodation choices produce predictable server-owned behavior: all enabled choices, automatic application, or an explicit buyer choice respectively.
- [ ] **TKT-03**: One server-side eligibility resolver is reused by public catalog, quote, signup submission, track-payment edits, and allocation so the surfaces cannot drift.
- [ ] **TKT-04**: A ticket can include the event's configured base accommodation stay; included tickets receive the configured covered-night allowance, non-included tickets pay the base accommodation rate, and included tickets may still add allowed extra nights before or after the event as separate accommodation charges; paid options/upgrades remain separate charges.
- [ ] **TKT-05**: An event ticket accommodation rule can explicitly identify which selected upgrades or add-ons are included on covered base nights; any allowed option not included by that rule remains chargeable, including when the base room nights are covered.

### Generic Selection And Finance

- [ ] **SEL-01**: Signup and track-payment accept generic option selections with quantities or units rather than requiring fixed `upgradeSelected` and `cotSelected` booleans.
- [ ] **SEL-02**: Selection writes accept only event-scoped identifiers, quantities, and validated stay-choice inputs; prices, totals, computed nights, eligibility decisions, and snapshots are resolved server-side.
- [ ] **SEL-03**: A selected upgrade or add-on can apply across all selected stay nights; a `per_person_per_night` option is charged for each selected night, including ticket-covered nights unless the ticket rule explicitly includes that option for those covered nights.
- [ ] **FIN-01**: Canonical amount-due includes event-owned accommodation base rates and generic option charges through the existing finance loader and pure domain pricing module.
- [ ] **FIN-02**: Pricing correctly applies the configured unit, quantity, night basis, included-night rule, age rule, and occupancy without client-side or consumer-specific formulas.
- [ ] **FIN-03**: Receipt and attendee-level breakdowns contain data-driven labels, units, quantities, and charges for any configured option.
- [ ] **FIN-04**: Unconfirmed selections price from the current event-owned setup while confirmed selections price exclusively from a complete immutable snapshot with a configuration version.
- [ ] **FIN-05**: Legacy confirmed snapshots and legacy unconfirmed selections remain valid through an explicit compatibility path; incomplete confirmed snapshots still fail closed.

### Copy, Templates, And Lifecycle

- [ ] **REUSE-01**: An admin can explicitly copy accommodation setup from another event into a target event with independent event-owned rows and no live coupling to the source.
- [ ] **REUSE-02**: An admin can save and apply a named configuration-only accommodation template whose contents are independent of event orders, payments, assignments, and confirmation state.
- [ ] **REUSE-03**: Copy and template actions preserve or reference only the intended physical inventory boundary, remap copied configuration identifiers safely, derive target-specific stay details, and never copy order or occupancy state.
- [ ] **REUSE-04**: Copy and template actions provide a server-owned preview or result, are idempotent or fail cleanly on conflicts, and leave an auditable provenance record.
- [ ] **LIFE-01**: Admins can archive or delete event-owned categories, options, age bands, rules, and resources only through reference-safe behavior that preserves existing selections, audits, assignments, and finance history.
- [ ] **LIFE-02**: Archived configuration is hidden from new signup choices while remaining resolvable for valid existing selections and historical snapshots.

### Admin Experience

- [ ] **ADM-01**: The Accommodation workspace provides a detailed event setup experience for stay rules, categories, rates, options, age bands, resources, ticket entitlements, and descriptions using server-owned contracts.
- [ ] **ADM-02**: The admin setup experience makes copy/template source, scope, preview, target impact, provenance, archive state, and pending-order impact understandable before a destructive or re-pricing action.
- [ ] **ADM-03**: Existing Hotels and Allocation tabs, deep links, event scoping, loading/error/empty states, responsive behavior, and accessibility remain usable after the setup experience is added.

### Public Signup And Track Payment

- [ ] **PUB-01**: Public signup renders every enabled event option and eligibility state from the event-owned server contract without hardcoded option-code lookups or fixed-card assumptions.
- [ ] **PUB-02**: Signup quote, review, and submission use the same server-side resolver and show an honest breakdown for dynamic options, configured stay rules, breakfast, and ticket eligibility.
- [ ] **PUB-03**: Events without configured or enabled accommodation retain a clear no-accommodation or unavailable state and cannot submit invalid accommodation choices.
- [ ] **PUB-04**: Before confirmation, the booking-reference track-payment flow can edit generic accommodation selections through the existing ownership, signature, rate-limit, honeypot, idempotency, and server-pricing protections.
- [ ] **PUB-05**: After confirmation, track-payment edits remain blocked and the confirmed snapshot remains the source of the displayed accommodation amount.

### Allocation And Verification

- [ ] **ALL-01**: Allocation continues to use the physical hotel/room/room-type/capacity workflow while applying the same event-owned ticket entitlement and eligibility rules used by signup.
- [ ] **ALL-02**: Paid-priority allocation and confirmation continue to consume canonical per-attendee due/paid state, preserve the confirmation lock boundary, and never recalculate accommodation money in the UI.
- [ ] **VER-01**: Automated tests cover schema compatibility, generic unit pricing, eligibility consistency, copy isolation, idempotency, archive/reference safety, legacy snapshots, and bounded event-scoped projections.
- [ ] **VER-02**: Cross-surface verification proves that admin setup, signup, track-payment, confirmation, finance, reporting, payments, and allocation agree on event configuration and canonical amounts.
- [ ] **VER-03**: Verification proves the old hotel and physical-room workflow still works and that hardcoded option/category/age-band branches are absent from new dynamic setup and public rendering paths.

## Future Requirements

- Multi-room-type ticket entitlement arrays if the initial event-owned rule shape proves insufficient.
- Template version propagation or bulk template updates after a copy.
- Waitlist and pending-intent workflows for exhausted accommodation.
- Spreadsheet import/export for accommodation setup.
- Multi-night or date-range pricing.
- Buyer-facing roommate matching.
- Inline payment capture, taxes, discounts, or coupon pricing.
- Cross-event analytics and portfolio reporting.
- Full Ticket Tailor/provider schema redesign.
- QR-code event check-in (SEED-001).

## Out Of Scope

| Feature | Reason |
| --- | --- |
| Live global configuration coupling | It violates independent event evolution; global rows may remain seed/template origins only. |
| Hardcoded two-option accommodation model | v6.0 explicitly replaces fixed option codes and boolean selection flags with generic data-driven options. |
| Buyer-facing physical-room selection or room holds | Physical placement remains admin-controlled and derived inventory remains the existing workflow. |
| Destructive migration of existing orders or snapshots | Historical finance must remain readable and immutable. |
| New runtime dependencies, services, payment providers, or auth systems | The installed Next.js, React, Convex, Clerk, shadcn/ui, and test stack already supports the milestone. |
| Multi-tenant organization support | The project remains single-org scoped. |

## Traceability

| Requirement | Phase | Status |
| --- | --- | --- |
| SET-01 | Phase 46 | Pending |
| SET-02 | Phase 46 | Pending |
| SET-03 | Phase 46 | Pending |
| SET-04 | Phase 46 | Pending |
| SET-05 | Phase 46 | Pending |
| STAY-01 | Phase 46 | Pending |
| STAY-02 | Phase 49 | Pending |
| CFG-01 | Phase 46 | Pending |
| CFG-02 | Phase 46 | Pending |
| CFG-03 | Phase 46 | Pending |
| CFG-04 | Phase 47 | Pending |
| CFG-05 | Phase 46 | Pending |
| TKT-01 | Phase 46 | Pending |
| TKT-02 | Phase 47 | Pending |
| TKT-03 | Phase 47 | Pending |
| TKT-04 | Phase 46 | Pending |
| TKT-05 | Phase 46 | Pending |
| SEL-01 | Phase 46 | Pending |
| SEL-02 | Phase 46 | Pending |
| SEL-03 | Phase 46 | Pending |
| FIN-01 | Phase 46 | Pending |
| FIN-02 | Phase 46 | Pending |
| FIN-03 | Phase 46 | Pending |
| FIN-04 | Phase 46 | Pending |
| FIN-05 | Phase 46 | Pending |
| REUSE-01 | Phase 47 | Pending |
| REUSE-02 | Phase 47 | Pending |
| REUSE-03 | Phase 47 | Pending |
| REUSE-04 | Phase 47 | Pending |
| LIFE-01 | Phase 47 | Pending |
| LIFE-02 | Phase 47 | Pending |
| ADM-01 | Phase 48 | Pending |
| ADM-02 | Phase 48 | Pending |
| ADM-03 | Phase 48 | Pending |
| PUB-01 | Phase 49 | Pending |
| PUB-02 | Phase 49 | Pending |
| PUB-03 | Phase 49 | Pending |
| PUB-04 | Phase 49 | Pending |
| PUB-05 | Phase 49 | Pending |
| ALL-01 | Phase 50 | Pending |
| ALL-02 | Phase 50 | Pending |
| VER-01 | Phase 51 | Pending |
| VER-02 | Phase 51 | Pending |
| VER-03 | Phase 51 | Pending |

**Coverage:** 44/44 v6.0 requirements mapped across Phases 46-51 (100%).

### Mapping Summary

- **Phase 46** (backend/data — event-owned schema, optional stay-window contract, ticket-included accommodation, ticket-specific option inclusion, generalized pricing, shared projection/version boundary, legacy compat, SEED-002 rules): SET-01..05, STAY-01, CFG-01..03, CFG-05, TKT-01, TKT-04..05, SEL-01..03, FIN-01..05 (21)
- **Phase 47** (backend/data — copy/template engine, eligibility resolver, safe archive): CFG-04, TKT-02..03, REUSE-01..04, LIFE-01..02 (9)
- **Phase 48** (admin UI — event setup, copy/template preview, lifecycle controls): ADM-01..03 (3)
- **Phase 49** (public flow — signup + track-payment generic selection/quote/edit, including optional extra-night and upgrade-across-stay selection): STAY-02, PUB-01..05 (6)
- **Phase 50** (allocation/integration — entitlement alignment, confirmation, canonical consumers): ALL-01..02 (2)
- **Phase 51** (verification — money integrity, legacy workflow, copy isolation, archive safety, security, bounded reads, hardcoded-branch audit): VER-01..03 (3)

Notes:

- CFG-04 and TKT-02/TKT-03 land in Phase 47 because their observable behavior is the shared server-side eligibility resolver (schema/rules shape lands in Phase 46). This matches the research split (rules tables in the schema phase, resolver in the copy/template phase).
- SEL-01/SEL-02 are owned by Phase 46 as the generalized selection-write contract (child-row schema + validators accepting only event-scoped option IDs/quantities); Phase 49 consumes the contract in the public flows.
- SET-03 (hotel workflow continues to work) and ADM-03 (Hotels/Allocation tabs usable) are owned by the phase that preserves the behavior (46 / 48); VER-02/VER-03 in Phase 51 prove them.

---

## Historical Milestones

- v4.0 established the event Overview, concise event shell, Finance and Accommodation workspaces, shared query states, responsive behavior, accessibility, and deep-link preservation.
- v5.0 established the accommodation catalog/config foundation, canonical accommodation finance, options-only signup, track-payment editing, paid-priority allocation, confirmation snapshots, and cross-surface validation.

_Requirements defined: 2026-08-06 for milestone v6.0_
