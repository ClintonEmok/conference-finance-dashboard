# Project Research Summary

**Project:** Conference Finance Dashboard
**Domain:** Brownfield canonical orders, payables, and reconciliation foundation for an internal conference finance system
**Researched:** 2026-04-01
**Confidence:** HIGH

## Executive Summary

This project is not a greenfield finance build; it is a brownfield canonicalization effort inside an existing church conference operations system. The consistent conclusion across the research is that expert teams solve this kind of problem by making one internal model authoritative for runtime finance and operations, while demoting provider tables to ingest, mapping, and diagnostics. In this case, the product should continue using Convex as the sole operational store and make canonical internal tables—not `ticketTailor*` tables—the source of truth for order totals, attendee balances, payment application, and reconciliation.

The recommended approach is opinionated: keep `orders` as the aggregate root, add explicit canonical financial child tables, normalize payment identity toward internal order IDs, and migrate using widen → backfill → dual-write → cut over → narrow. The key enabling move is to stop inferring financial truth from mixed provider payloads and instead model it explicitly with canonical payable rows plus explicit payment allocation rows.

The main risks are also clear. The biggest failure mode is a “half migration” where canonical tables exist but runtime queries still leak provider reads, mixed identifier semantics, or heuristic-only payment matching. Mitigation should center on hard runtime contracts, deterministic finance formulas, resumable migration tooling, parity validation, and audit-friendly money movement records.

## Key Findings

### Recommended Stack

The stack recommendation is conservative by design: keep the existing Next.js + Convex architecture and strengthen the domain model rather than introducing new infrastructure. Convex remains the right transactional boundary, TypeScript remains the right place to encode invariants, and `@convex-dev/migrations` is the key addition because this milestone is mostly about safe brownfield schema evolution and replayable backfills.

The most important technical decision is to avoid adding a second persistence model or finance library. Amounts are already modeled as integer minor units, so correctness depends more on canonical table shape, validators, and migration discipline than on bringing in ORMs or decimal helpers.

**Core technologies:**

- **Convex 1.34.1:** canonical runtime store — preserves one operational source of truth and existing typed backend contracts.
- **`@convex-dev/migrations` 0.3.3:** staged brownfield migrations — safest way to backfill and narrow live Convex schemas.
- **TypeScript 5.9.x:** invariant modeling — supports strict validators and explicit financial domain types.
- **`convex-test` 0.0.46 + `@edge-runtime/vm` 5.0.0:** regression coverage — validates projector, migration, and reconciliation invariants during cutover.

### Expected Features

The research is aligned that this milestone’s MVP is trust, not breadth. The must-have outcome is a deterministic internal finance model that makes orders, attendee obligations, payment allocations, and reconciliation reasons computable from canonical records. Everything else is secondary.

**Must have (table stakes):**

- Canonical order runtime model — all finance and ops screens must read one internal truth.
- Deterministic order total formula — totals must be explainable and stable across screens.
- Canonical attendee payable model — attendee balances must stop using even-split heuristics.
- Explicit payment allocation model — partial, split, and overpayments must be auditable.
- Canonical reconciliation reasons — exception queues must explain what is wrong from internal facts.
- Backward-compatible cutover behavior — existing dashboard, sync, and ops flows must keep working during migration.

**Should have (competitive):**

- Explainable amount drilldown — total → payable → allocation traceability for operators.
- Shadow-read parity verification — compare legacy and canonical answers before full cutover.
- Allocation provenance / exception notes — safer manual finance workflows.
- Internal-first reporting slices — event/order/payable/allocation reporting once numbers are trusted.

**Defer (v2+):**

- Ticket Tailor/provider model redesign.
- Advanced allocation automation or writeoff policy work.
- Broader commerce UX like discounts/coupons/refunds expansion.

### Architecture Approach

Architecture research recommends a strict canonical-domain boundary: app surfaces write through existing Convex facades, domain helpers own pricing/payable/allocation rules, canonical tables store durable business truth, and provider tables stay outside runtime truth. The internal end state keeps `orders` and `orderAttendees` as aggregate roots while adding canonical financial child tables and migrating read models in vertical slices: finance first, then attendee follow-up, then accommodation.

**Major components:**

1. **Canonical order aggregate** — owns orders, attendees, ticket selections, and assignments.
2. **Canonical financial obligation layer** — owns deterministic line items/payables instead of provider-derived totals.
3. **Canonical payment layer** — stores receipts and explicit allocations separately.
4. **Finance read models** — expose ledger, balances, and reconciliation from canonical tables only.
5. **Provider ingest boundary** — preserves raw provider payloads and mappings without defining runtime truth.

### Critical Pitfalls

The pitfalls research reinforces that the roadmap must prioritize migration safety and truth-model discipline over UI breadth. The biggest dangers are not technical novelty; they are brownfield slippage.

1. **Dual runtime truth** — prevent it by banning provider tables from post-cutover runtime finance/ops reads.
2. **Mixed identifier semantics** — normalize runtime joins around internal `Id<"orders">` and isolate provider IDs in mapping tables.
3. **Non-deterministic totals/payables** — define one canonical formula spec and validate it against real data before cutover.
4. **Unsafe backfills** — use dry-runnable, batched, resumable migrations with before/after counts.
5. **Heuristic payment certainty** — keep ambiguous matches explicit and persist allocation reasons instead of treating guesses as truth.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Runtime Truth Audit and Identity Normalization

**Rationale:** This must come first because every later table or query change depends on knowing which runtime paths still leak provider truth and which identifiers are canonical.
**Delivers:** Read-path inventory, canonical runtime contract, normalized `orderId` semantics for new writes, mapping plan for legacy/provider IDs.
**Addresses:** Canonical order runtime model, provider ingest/mapping boundary, backward-compatible cutover contract.
**Avoids:** Dual runtime truth, mixed identifier semantics, hidden downstream legacy dependencies.

### Phase 2: Canonical Finance Model and Formula Spec

**Rationale:** Order totals, attendee balances, and reconciliation cannot stabilize until the team defines one deterministic money model.
**Delivers:** New canonical financial tables (`payables` / `orderLineItems`, attendee payables, `paymentAllocations`), formula spec, invariants, payment-allocation semantics, audit fields.
**Uses:** Convex schema evolution, TypeScript validators, strict domain helpers.
**Implements:** Canonical financial obligation layer and canonical payment layer.

### Phase 3: Backfill, Migration Tooling, and Dual-Write Rollout

**Rationale:** Once the target model exists, the next dependency is replayable production-safe data migration rather than UI cutover.
**Delivers:** `@convex-dev/migrations` setup, batched backfills, migration metadata, parity fixtures, dual-write from signup/sync/payment paths.
**Addresses:** Explicit payment allocation facts, deterministic totals/payables, backward-compatible correctness during cutover.
**Avoids:** Unsafe backfill, stale legacy ambiguity, unexplainable money movement.

### Phase 4: Canonical Finance Read Cutover

**Rationale:** Finance should cut over before attendee/accommodation because it is the highest-risk trust boundary and the clearest payoff of the new model.
**Delivers:** Canonical ledger, canonical reconciliation reasons, dashboard finance/reconciliation routes and pages reading canonical tables only, shadow parity comparison where needed.
**Addresses:** Canonical runtime reads, reconciliation reason codes, explainable drilldown foundation.
**Avoids:** Non-deterministic balances, heuristic-only reconciliation, mixed provider joins.

### Phase 5: Attendee and Accommodation Read Cutover

**Rationale:** This follows finance because architecture research shows attendee/accommodation queries still depend on the same underlying canonical order and payable facts.
**Delivers:** Canonical attendee detail, follow-up, occupancy, and assignment views without direct `ticketTailor*` runtime reads.
**Addresses:** Full runtime cutover across ops surfaces, source-agnostic finance/ops behavior.
**Avoids:** Hidden downstream legacy dependencies and “one more screen” provider leakage.

### Phase 6: Validation, Reporting, and Post-Cutover Cleanup

**Rationale:** Reporting and provider cleanup are valuable, but only after the runtime truth boundary is proven stable.
**Delivers:** Explainable amount drilldown, internal-first reporting slices, removal/narrowing of legacy fields, planning input for later provider-boundary redesign.
**Addresses:** P2 leverage features and deprecation of migration-era compatibility paths.
**Avoids:** Premature provider redesign and dashboard-specific denormalized finance fields.

### Phase Ordering Rationale

- Identity and runtime-contract work comes before schema expansion because mixed IDs and mixed truth would poison every backfill.
- Canonical formulas and allocation semantics come before read cutover because finance screens cannot be migrated safely without deterministic facts.
- Migration tooling is a dedicated phase because the research treats replayability, dry runs, and parity validation as first-class deliverables, not implementation details.
- Finance read models should cut over before attendee/accommodation because they are the primary business value and the cleanest place to validate canonical totals and allocations.
- Provider redesign is intentionally deferred; the recommended pattern is internal truth first, provider cleanup second.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 2:** attendee payable derivation and refund/cancellation treatment need rule-level validation against real historical edge cases.
- **Phase 3:** migration execution details need project-specific rollout planning, batching strategy, and parity instrumentation.
- **Phase 4:** payment matching and reconciliation thresholds may need focused research if current Tikkie/payment metadata is weak.
- **Phase 6:** provider-boundary redesign should get separate research rather than being folded into this milestone.

Phases with standard patterns (skip research-phase):

- **Phase 1:** runtime dependency audit and identifier normalization are well-understood brownfield cleanup patterns.
- **Phase 5:** once canonical finance tables exist, migrating attendee/accommodation reads is mostly codebase-specific implementation, not new domain research.

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                          |
| ------------ | ---------- | -------------------------------------------------------------------------------------------------------------- |
| Stack        | HIGH       | Strongly grounded in project-local code, Convex docs, package/version checks, and explicit migration guidance. |
| Features     | HIGH       | Clear convergence between project goals, existing pain points, and established brownfield finance patterns.    |
| Architecture | HIGH       | Well supported by current codebase boundaries and by Convex’s additive migration model.                        |
| Pitfalls     | HIGH       | Risks are concrete, recurring in the current codebase, and backed by official migration/provider guidance.     |

**Overall confidence:** HIGH

### Gaps to Address

- **Historic formula exceptions:** validate how refunds, cancellations, waived balances, and legacy TT-only rows should map into canonical payables before hard cutover.
- **Final table naming/shape:** `payables` vs `orderLineItems` + `attendeePayables` is directionally clear, but the exact persisted split should be locked during phase planning.
- **Payment auto-match confidence rules:** define the minimum evidence for automatic allocation vs operator review.
- **Parity tolerance policy:** decide which mismatches block release and which are acceptable legacy-data exceptions.
- **Downstream dependency inventory completeness:** confirm exports, emails, and admin utilities are included in the cutover audit, not just dashboard pages.

## Sources

### Primary (HIGH confidence)

- `.planning/PROJECT.md` — milestone goals, constraints, and active correctness risks.
- `.planning/codebase/FINANCIAL_DATA_FLOW.md` — current derivation and reconciliation behavior.
- `.planning/tickettailor-table-usage.md` — current provider leakage points and core/extension boundary.
- `convex/schema.ts`, `convex/orders.ts`, `convex/payments.ts`, `convex/attendees.ts`, `convex/accommodation.ts`, `convex/signupSubmission.ts` — implementation constraints and active query patterns.
- Convex docs / Context7 `/get-convex/migrations` — schema validation behavior, live-data migrations, and safe rollout patterns.
- `convex/_generated/ai/guidelines.md` — project-local Convex rules referenced by stack research.

### Secondary (MEDIUM confidence)

- `.planning/phases/24-canonical-orders-rewrite/24-CONTEXT.md` — prior codebase design decisions that still inform this milestone.
- Martin Fowler bounded context guidance — supports provider-boundary separation.
- Stripe invoice/webhook/idempotency docs — supports line-item, allocation, and provider-event handling patterns.

### Tertiary (LOW confidence)

- Cross-domain finance migration synthesis inferred from the current architecture — directionally strong, but still needs validation against project-specific historical data.

---

_Research completed: 2026-04-01_
_Ready for roadmap: yes_
