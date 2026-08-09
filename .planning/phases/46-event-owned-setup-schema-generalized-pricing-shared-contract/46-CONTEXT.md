# Phase 46: Event-Owned Setup Schema, Generalized Pricing & Shared Contract - Context

**Gathered:** 2026-08-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the v5.0 live-catalog accommodation contract with an additive event-owned setup contract and a generalized server-side pricing/selection contract. This phase covers schema, domain pricing, shared event configuration projection, the single version boundary, legacy compatibility, and the event-owned portion of SEED-002. It must not change application UI. Copy/template mutations, eligibility enforcement, archive/delete behavior, and all UI work belong to later phases.

</domain>

<decisions>
## Implementation Decisions

### Event-Owned Boundary
- Commercial configuration is owned by the event: categories, rates, options, age bands, age pricing, ticket accommodation rules, and option eligibility.
- The event-owned stay contract may be disabled entirely or may include a configurable base window (commonly the night before the event), night count and breakfast policy, plus optional extended-stay availability before and/or after the event with limits. All consumers use the resolved stay contract.
- Stay inclusion and stay choice are separate: a ticket may cover the configured base nights, while an attendee may select an enabled extra night before and/or after the event; only non-covered nights are charged.
- Hotels, physical rooms, room types, capacity, event-to-hotel links, slots, and placement records remain shared inventory infrastructure and are referenced, not commercially redefined.
- Global catalog rows may remain seed/template origins, but signup, track-payment, finance, confirmation, reporting, payments, and allocation must not read them as live event configuration.

### Version Boundary
- Add `eventAccommodationSetup` as the single event-level setup/provenance/version row.
- `eventAccommodationSetup.updatedAt` is the only configuration version token used for pending-order impact and confirmation snapshots.
- Every event-owned configuration mutation advances that token atomically with its data write; no second independent version boundary is introduced.
- Existing `eventAccommodationConfig` remains the stay-window owner during compatibility, but its old timestamp cannot become a second pricing boundary.

### Pricing Units
- v6.0 supports the typed option vocabulary: `per_night`, `per_person`, and `per_person_per_night`.
- `per_night` charges the resolved option price against the applicable stay nights; `per_person` charges once per eligible attendee/quantity; `per_person_per_night` charges per eligible attendee/quantity across each applicable selected night.
- `per_stay` and `flat` remain future extensions and must not be accepted as unhandled free strings.
- The pure pricing engine uses a handler registry keyed by the typed unit and returns data-driven receipt lines.

### Ticket Entitlements (SEED-002)
- Use an event-owned `eventTicketAccommodationRules` table as the consumption source of truth.
- Seed each event rule from the existing `ticketTypes.roomTypeId` and `accommodationIncluded` values without breaking the provider/ticket schema.
- `accommodationIncluded` is financially meaningful: included tickets cover the configured base accommodation nights; non-included tickets pay the base rate; options/upgrades remain separate charges.
- Ticket rules may include selected option keys for covered base nights. A higher-tier option not listed as included is charged across all selected nights, including covered base nights; extra nights also incur the base accommodation charge.
- Buyer-selected extension inputs are bounded stay choices, not client authority over computed night count or price; the server validates them against the event policy and derives the final nights, charge, and snapshot.
- The rule shape supports the current single entitlement and event-side allowed category/type mapping; multi-room-type `ticketTypes.roomTypeIds` remains out of scope.
- Eligibility enforcement itself is Phase 47, but Phase 46 owns the schema, seed/materialization shape, and shared contract fields.

### Standard/Superior Data Model
- Standard and Superior remain recognizable to admins and buyers through event-owned category data and an explicit data relationship such as `isSuperior` or an upgrade target.
- No pricing or UI behavior may compare a literal category code such as `categoryCode === "superior"`.
- The generalized option engine must not recreate the old named `superior_upgrade` branch.

### Selection And Snapshot Compatibility
- Add a child collection for generic option selections with event-scoped option identity and quantity; do not move dynamic selections into an unbounded array on the base selection row.
- New selection writes accept only event-scoped option identifiers and quantities. They never accept price, amount, nights, eligibility, or snapshot authority fields.
- Keep legacy `upgradeSelected` and `cotSelected` fields readable during the transition; new writes use generic child rows and may dual-write only where an existing consumer requires it.
- Extend the confirmation snapshot with fully resolved option lines while accepting the complete v5 boolean snapshot shape. Never weaken the fail-closed completeness guard.

### Legacy Materialization
- Use per-event materialization on first explicit admin setup/save or setup initialization rather than a global backfill.
- Support `legacy_global`, `event_owned`, and `uninitialized` setup modes so existing events can continue to resolve safely until they are materialized.
- Do not rewrite historical orders, confirmed snapshots, payments, assignments, or provider records.

### Invariants
- Canonical amount-due remains `loadOrderAmountDueBreakdowns` backed by the pure accommodation domain module.
- All consumers use one shared `loadEventOwnedAccommodationContext` projection; no third resolver is added.
- Physical room availability remains derived from room count × capacity and stays separate from commercial category pricing.
- Server-side pricing and event scoping remain authoritative; UI changes are explicitly deferred.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `convex/schema.ts` defineTable and index patterns for accommodation catalog/config, order selections, tickets, audits, and event-scoped reads.
- `convex/finance.ts:loadOrderAmountDueBreakdowns` as the canonical amount-due choke point.
- `lib/domain/finance/accommodation-amounts.ts` as the pure pricing and snapshot refactor point.
- `convex/signupCatalog.ts` shared public context/resolver path and `convex/publicTracking.ts` server-side edit contract.
- Existing `eventAccommodationConfig.updatedAt` version-touch pattern, confirmation resolver, `orderAccommodationEditAudits`, and idempotency patterns.
- `convex/_generated/ai/guidelines.md` for bounded Convex reads, indexed iteration, atomic mutations, and required codegen/deploy validation.

### Established Patterns
- Minor-unit integer money values and pure domain derivation.
- Additive Convex schema evolution with optional fields/tables and explicit indexes.
- Child tables for attendee/order collections (`orderTicketSelections`, assignments, audit rows).
- Convex handler tests with `convex-test`, node tests for pure modules, and component tests in the existing three-config matrix.
- Typed hooks and public/admin contract projections rather than direct table reads from UI.

### Integration Points
- `convex/schema.ts`: event-owned setup/category/option/age-band/rule tables, generic option selection rows, and snapshot validator changes.
- `convex/accommodation.ts`: setup initialization/materialization, event-owned contract reads, config writes, version advancement, and generalized confirmation inputs.
- `convex/finance.ts`: replace duplicate event context internals with the shared event-owned loader while retaining canonical due/paid projections.
- `convex/signupCatalog.ts` and `convex/signupSubmission.ts`: consume the widened event contract while preserving legacy signup compatibility.
- `convex/publicTracking.ts`: accept the generalized selection contract without changing its public security boundary.
- `lib/domain/finance/accommodation-amounts.ts`: remove named option/category branches and produce generic unit-based lines/snapshots.
- Existing hotel/room/room-type/slot/allocation modules: preserve behavior and only consume the new shared contract where required.

</code_context>

<specifics>
## Specific Ideas

- Keep the new contract explicit about commercial rows versus referenced physical inventory; this distinction is the central v6.0 design rule.
- Make the pricing engine's resolved input and output types self-contained enough that a confirmed snapshot can be read without live option rows.
- Use server-returned pending-order counts and setup version tokens rather than adding client calculations.
- Add handler and pure-domain fixtures before any UI phase consumes the widened types.
- Test a third arbitrary option and a non-default age band at the contract/domain layer even though the UI is deferred.

</specifics>

<deferred>
## Deferred Ideas

- Copy-from-event and named template mutations, provenance audits, idempotency/OCC behavior, and physical-inventory copy UX — Phase 47.
- Shared eligibility rejection behavior and reference-safe archive/delete — Phase 47.
- Admin Setup UI, copy/template preview, tab rename, provider mapping presentation, and responsive/accessibility work — Phase 48.
- Generic signup and track-payment rendering, legacy `slots` coexistence cutoff, and mid-signup invalidation UX — Phase 49.
- Allocation board enforcement policy beyond the shared contract — Phase 50.
- Any application UI change in this phase.

</deferred>
