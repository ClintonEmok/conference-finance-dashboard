# Phase 46: Event-Owned Setup Schema, Generalized Pricing & Shared Contract — Research

**Researched:** 2026-08-06
**Domain:** Convex schema evolution, event-owned configuration modeling, pure money math generalization, shared server projections, legacy compatibility
**Confidence:** HIGH (codebase-grounded; Convex schema-evolution + mutation-atomicity re-verified via Context7 2026-08-06)

## Summary

Phase 46 inverts the v5.0 live-catalog accommodation contract into an additive event-owned contract without touching application UI. The v5.0 code (verified in source) has exactly four hardcoded-code surfaces that must become data: the literal union validators (`accommodationCategories.code`, `accommodationOptions.code`/`kind`/`unit`, `ageBandCode` in 4+ places), the two option-code branches in `convex/finance.ts` (`loadEventAccommodationContexts`) and `convex/signupCatalog.ts` (`loadPublicSignupAccommodationContext`), the confirmation resolver in `convex/accommodation.ts` (`resolveOrderAccommodationConfirmation`), and the named-boolean formula in `lib/domain/finance/accommodation-amounts.ts` (`categoryCode === "superior"`, `upgradeSelected`, `cotSelected`). Two duplicate event-config resolvers already exist and must collapse into one shared `loadEventOwnedAccommodationContext`.

The standard approach, consistent with all four research files and re-verified here: **widen, don't migrate** — widening a union validator to `v.string()` is non-destructive (existing literal values still validate; Context7 confirms Convex enforces schema consistency by evolving field types with unions, and all writes in one mutation are atomic). Add event-owned tables (`eventAccommodationSetup` as the single version boundary, `eventAccommodationCategories`, `eventAccommodationAgeBands`, `eventTicketAccommodationRules`, `orderAccommodationOptionSelections`) plus additive optional fields on existing tables (`eventAccommodationRates.eventCategoryId`, `eventAccommodationOptions` event-owned fields, `orderAccommodationSelections.eventCategoryId`, snapshot `optionLines`). Refactor the pure pricing module into a **unit-keyed handler registry** (`per_night` × nights × quantity; `per_person` × quantity) returning data-driven receipt lines, extend the fail-closed snapshot guard to accept **both** the v5 boolean shape and the v6 `optionLines` shape, and dual-read `setupMode: legacy_global | event_owned | uninitialized` with per-event materialization. No new runtime dependencies.

**Primary recommendation:** Land schema → pure engine → shared loader → finance rewiring → confirmation/materialization → public contract widening as one typecheck-green unit with handler + pure-domain tests per unit type, gated by `npx convex codegen` + `npx convex dev --once` + the full three-config test matrix staying green with zero UI change (SET-05 / FIN-05 regression proof).

## Standard Stack

No stack changes (verified in `node_modules` and STACK.md). All Phase 46 work uses the installed stack.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | 1.34.0 | Schema (additive tables/fields, widened unions), atomic multi-table mutations, reactive contracts | Backend is Convex; widening validators + additive tables verified safe via Context7; single-mutation atomicity verified |
| convex/values `v` | (with convex) | Validators: `v.id`, `v.string`, typed unions, discriminated union for snapshot | Only validator API; keep `occupancy`/`unit`/`rateType` as typed unions |
| vitest + convex-test + @edge-runtime/vm | 4.1.0 / 0.0.52 / 5.0.0 | Pure-domain node tests + handler tests | Existing three-config matrix (`vitest.config.ts`, `vitest.convex.config.ts`, `vitest.components.config.ts`); no additions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/domain/finance/amounts.ts` | — | `deriveOrderAmountBreakdown` (ticket money) | Leave unchanged; only the accommodation slice shifts |
| `convex/_generated/ai/guidelines.md` | — | Bounded reads, indexed iteration, validator discipline | Follow for every new loader/mutation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Widen union validators to `v.string()` | New parallel tables + migrate references | Widening is non-destructive and keeps legacy rows readable; parallel tables force a migration + dual-write window for no benefit — reject |
| Additive optional `eventCategoryId`/`eventCategoryKey` on existing rows | Full rekey of `eventAccommodationRates`/`orderAccommodationSelections` | Full rekey breaks SET-05 legacy rows; additive optional field keeps both shapes |
| In-place additive event-owned fields on `eventAccommodationOptions` | A second `eventAccommodationOptionDefinitions` table | A second table recreates the duplicate-resolver anti-pattern (PITFALLS #14); one table, two shapes, one loader |
| Child rows `orderAccommodationOptionSelections` | Array field on the selection row | Convex guidelines: child collections live in their own tables (1MB doc limit, rewrite cost) — child table is the established convention (`orderTicketSelections`) |
| `eventOptionKey` (string, stable per event) on child rows | `eventOptionId` (row id) | Key survives row replacement/archive and matches ARCHITECTURE recommendation; id dangles if the row is replaced |

**Installation:** none. No new dependencies (Out Of Scope: new runtime dependencies).

## Architecture Patterns

### Recommended Project Structure (Phase 46 target)
```
convex/
├── schema.ts                          # NEW tables + widened unions + snapshot optionLines validator
├── eventAccommodationContext.ts       # NEW: loadEventOwnedAccommodationContext (the ONE shared loader)
├── accommodation.ts                   # setup init/materialization, event-owned upserts, version boundary,
│                                      #   confirmation resolver reads child rows + setup.updatedAt
├── finance.ts                         # loadEventAccommodationContexts internals -> shared loader (keep public signature)
├── signupCatalog.ts                   # loadPublicSignupAccommodationContext -> shared loader; data-driven options
├── signupSubmission.ts                # generalized selection write (optionSelections[]), legacy boolean dual-write
├── publicTracking.ts                  # edit validators accept eventOptionKey+quantity; updateAccommodation child rows
lib/
├── domain/finance/accommodation-amounts.ts   # unit-keyed pricing registry, generic lines, dual-shape snapshot guard
├── types/signup.ts                    # widened selection validator + optionSelections field
└── domain/signup/catalog.ts           # PublicSignupCatalogOption becomes data-driven (key/label/unit/price)
```

### Pattern 1: One shared event-owned loader, one money module
`loadEventOwnedAccommodationContext(ctx, eventId)` is the single resolver for finance, signup catalog/quote/submission, confirmation, and (Phase 47+) admin/copy. It returns a typed contract that includes `setupMode`, the effective `versionToken` (setup row `updatedAt` when present, else `eventAccommodationConfig.updatedAt`), stay config, event-owned (or legacy-resolved) categories/rates/options/age bands/age pricing/ticket rules, and a **legacy bridge** that converts legacy boolean selections (`upgradeSelected`/`cotSelected`) into the same resolved-option shape the new engine prices. No consumer re-derives config shape. `lib/domain/finance/accommodation-amounts.ts` remains the only money math.
**Why:** PITFALLS #14 — three consumers already re-derive event config; today there are already two resolvers (finance + signup).

### Pattern 2: Single version boundary on `eventAccommodationSetup.updatedAt`
- New table `eventAccommodationSetup` (one row per event): `eventId` (indexed, singleton via `.unique()`), `setupMode` (`legacy_global` | `event_owned` | `uninitialized`), `copiedFromEventId?`, `copiedFromTemplateId?`, `copiedAt?`, `updatedAt`.
- `nextConfigVersion(previous)` (existing helper in `convex/accommodation.ts`, monotonic `max(Date.now(), prev+1)`) is reused; `touchEventAccommodationConfigVersion` becomes `touchEventAccommodationSetupVersion` — advance `eventAccommodationSetup.updatedAt` **in the same mutation** as every event-owned write; lazily create the setup row in `legacy_global` mode on first write.
- `resolveOrderAccommodationConfirmation` records `configVersion` from the **effective** token (setup row when present, else config row), never a second field.
**Why:** CONTEXT lock — "every event-owned configuration mutation advances that token atomically with its data write; no second independent version boundary"; `eventAccommodationConfig.updatedAt` stays the stay-window owner during compatibility only (PITFALLS #10).

### Pattern 3: Event-owned commercial rows vs referenced physical inventory
Everything that prices or is seen by the buyer is event-owned (categories, options, age bands, rates, age pricing, ticket rules); everything physical stays referenced (hotels, rooms, room types, `eventAccommodationResources.roomTypeId`). Consequence: `accommodationRoomTypes.categoryId` becomes a seed hint only — the event-owned category is the join key for pricing (PITFALLS #1, #2). Event-scoped mutations never write `accommodationCategories`/`accommodationOptions`/`accommodationAgeBands` (those stay name-and-shape seed origins).

### Pattern 4: Child collections in their own tables
`orderAccommodationOptionSelections(selectionId, orderId, attendeeId, eventOptionKey, quantity, sortOrder)` mirrors `orderTicketSelections`. New selection writes persist these rows; legacy `upgradeSelected`/`cotSelected` booleans stay readable and are dual-written only where an existing consumer requires round-tripping (CONTEXT lock).

### Pattern 5: Fail-closed dual-shape snapshot guard
`isCompleteAccommodationPriceSnapshot` accepts **both** the v5 boolean shape (existing fields, read-only compat branch) and the v6 shape (adds fully-resolved `optionLines`); every persisted line must be complete (label + unit + pricePerUnitMinor + quantity + chargeMinor). Never make fields optional to fit new options (PITFALLS #9, #12).

### Anti-Patterns to Avoid
- **Hardcoded option/category/age-band code branches anywhere in schema, domain, or loaders** — the four current sites (`finance.ts` Phase C, `signupCatalog.ts`, `accommodation.ts` confirmation, pure module) are exactly what this phase removes; a new branch recreates `LOCKED_OPTION_SEMANTICS`.
- **A third config resolver** — any new admin/copy read that rebuilds the event context independently (PITFALLS #14).
- **`.take(n)` caps on per-event config** — use `for await` bounded iteration like the finance loader already does; `getEventAccommodationConfig`'s `.take(200/100/50)` caps silently truncate dynamic config (PITFALLS #15).
- **Client money/night/eligibility args** — selection writes accept only `{ eventOptionKey, quantity }`; prices, nights, and eligibility are server-resolved in the same transaction (PITFALLS #8; SEL-02).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Widening literal unions | A backfill/migration | Plain schema edit (`v.union(...)` → `v.string()`) + codegen | Convex tracks type evolution as unions; existing literal values still validate (Context7 verified) |
| Atomic multi-table materialization/version bump | Separate mutations or an action | One `mutation` with all `ctx.db.insert/patch` calls | All DB writes in one mutation are atomic (Context7 verified); separate calls introduce race windows |
| Bounded per-event config reads | `.take(N)` magic caps | `for await` async iteration | Caps silently truncate dynamic rows (PITFALLS #15); the finance loader already models this |
| Authoritative pending-order/count derivation | Count from a bounded list | Full indexed async iteration for the count, bounded list only for display | Existing `PENDING_ORDERS_DISPLAY_LIMIT` pattern must be preserved, not shortcut |
| Snapshot completeness | Loosened optional fields | Extended dual-shape guard | Incomplete snapshots pricing as €0 is the finance-corruption failure (PITFALLS #9) |
| Money math by unit | A switch on free strings | Typed union + pure handler registry keyed by unit | A typo silently zeroes a charge; `unit`/`rateType` stay typed unions (STACK.md invariant) |

**Key insight:** every Phase 46 "generalization" has a proven v5.0 precedent in this repo (atomic upsert mutations touching a version boundary, bounded async iteration, child tables, fail-closed loaders, typed validators). The work is *relax + generalize*, not new machinery.

## Common Pitfalls

### Pitfall 1: Legacy event silently re-prices or fails after the loader collapse
**What goes wrong:** `loadEventAccommodationContexts` (finance) and `loadPublicSignupAccommodationContext` (signup) are replaced by the shared loader; a legacy event (no setup row) with global-referenced rows must produce **byte-identical** pricing inputs or every Phase 45 money-matrix test fails and existing orders change.
**Why it happens:** The shared loader must branch on `setupMode`; the legacy branch is easy to get subtly wrong (e.g. dropping the cot-eligibility band, changing rate key format `${categoryId}:${occupancy}`).
**How to avoid:** Keep the legacy branch a literal copy of today's resolution (same rate key format, same enabled-option filtering, same age-band fail-closed lookup). Add a parity test: legacy fixture → assert shared-loader output equals the old resolver's output for the same rows.
**Warning signs:** Existing `tests/convex/finance-accommodation.test.ts` / `tests/finance/phase45-money-integrity.test.ts` fail after the refactor.

### Pitfall 2: Two version boundaries
**What goes wrong:** Both `eventAccommodationSetup.updatedAt` and `eventAccommodationConfig.updatedAt` get bumped, so a confirmation snapshot can record an ambiguous `configVersion`.
**Why it happens:** Existing upserts call `touchEventAccommodationConfigVersion`; adding setup-row touches without removing the old call in the same mutation.
**How to avoid:** One helper (`touchEventAccommodationSetupVersion`) per write; confirmations read the **effective** token from the shared loader. Never bump config.updatedAt as a *pricing* boundary after this phase.
**Warning signs:** Two `updatedAt` patches in one mutation; confirmation resolver reads a token from a different row than the loader exposes.

### Pitfall 3: Snapshot guard loosened or v5 shape rejected
**What goes wrong:** Existing confirmed rows (v5 boolean shape) fail `isCompleteAccommodationPriceSnapshot` after the optionLines extension, or the guard is relaxed so incomplete v6 snapshots price as €0.
**Why it happens:** The guard is a hand-written predicate; adding `optionLines` without a legacy branch breaks every Phase 44/45 confirmed fixture.
**How to avoid:** Guard = `isLegacyComplete(v5 fields) || isCompleteWithOptionLines(v5 fields + fully resolved optionLines)`. Add the legacy-boolean-snapshot fixture test first.
**Warning signs:** `convex/accommodation-paid-priority.handlers.test.ts` confirmed-row tests fail.

### Pitfall 4: `per_person` priced like `per_night` (or vice versa)
**What goes wrong:** A `per_person` option is multiplied by nights, or a `per_night` option ignores quantity.
**Why it happens:** The old formula is `price × totalNights` for both built-ins; the generalization path of least resistance keeps one multiplier.
**How to avoid:** The pure engine's per-unit handler registry is the only place unit math exists: `per_night → price × nights × quantity`; `per_person → price × quantity`. Unit-test each unit type with a third arbitrary option and a non-default age band (CONTEXT "Specific Ideas").
**Warning signs:** No test named per-unit; a receipt line shows `nights` for a `per_person` option.

### Pitfall 5: Option ID/key accepted without event-scope validation
**What goes wrong:** A selection write accepts an `eventOptionKey` from another event or a disabled/archived option and prices it (PITFALLS #8).
**Why it happens:** Dynamic option sets can't be validated against two known constants; validation must query the event's enabled option keys.
**How to avoid:** In the same transaction as the write, validate every `eventOptionKey` against the event-owned enabled options from the shared loader; reject with a typed error. Never accept price/nights/eligibility args.
**Warning signs:** Any `v.number()` money arg in a selection validator; cross-event option key prices into an order.

### Pitfall 6: `categoryCode === "superior"` survives in the pure module
**What goes wrong:** The string compare stays in `buildAccommodationPriceSnapshot`/`deriveAccommodationAmount`, so a data-driven "Superior" category with a different key can never be recognized and the milestone's no-hardcoded-branch rule is violated.
**Why it happens:** `categoryIsSuperior` is baked into the snapshot and formula; removing it requires the loader to resolve `isSuperior` from the event category row.
**How to avoid:** The loader resolves the selected category's `isSuperior` flag (event-owned data) and passes it into pricing inputs; the pure module never compares a code string. Snapshot keeps `categoryIsSuperior` only as a persisted decision for the legacy shape.
**Warning signs:** Grep finds `"superior"` literal comparisons in `lib/domain/finance/`.

## Code Examples

### Verified current pattern: bounded async iteration (finance loader)
```typescript
// convex/finance.ts (lines ~135-147) — the pattern every new loader must keep.
const rateRows: EventAccommodationRateDoc[] = []
for await (const row of ctx.db
  .query("eventAccommodationRates")
  .withIndex("by_eventId", (q) => q.eq("eventId", eventId))) {
  rateRows.push(row as EventAccommodationRateDoc)
}
```
*(Never replace with `.take(100)` for per-event config rows.)*

### Verified current pattern: monotonic version boundary
```typescript
// convex/accommodation.ts (lines ~3141-3145) — reuse for setup-row bumps.
function nextConfigVersion(previousUpdatedAt: number | null | undefined): number {
  return Math.max(Date.now(), (previousUpdatedAt ?? 0) + 1)
}
```

### Target pattern: discriminated-union snapshot validator (schema)
```typescript
// convex/schema.ts — extend the existing priceSnapshot validator (additive).
priceSnapshot: v.optional(
  v.union(
    // v5 legacy boolean shape (existing object validator, unchanged)
    v.object({ baseRatePerNightMinor: v.number(), /* ...existing fields... */ }),
    // v6 shape: v5 fields + fully-resolved data-driven option lines
    v.object({
      baseRatePerNightMinor: v.number(),
      upgradeRatePerNightMinor: v.number(),
      cotRatePerNightMinor: v.number(),
      totalNights: v.number(),
      coveredNights: v.number(),
      categoryIsSuperior: v.optional(v.boolean()),
      upgradeSelected: v.optional(v.boolean()),
      cotSelected: v.optional(v.boolean()),
      ageBandCode: v.optional(v.string()),
      cotEligibilityAgeBandCode: v.optional(v.union(v.string(), v.null())),
      optionLines: v.array(
        v.object({
          optionKey: v.string(),
          label: v.string(),
          unit: v.union(v.literal("per_night"), v.literal("per_person")),
          pricePerUnitMinor: v.number(),
          quantity: v.number(),
          nights: v.number(),
          chargeMinor: v.number(),
        })
      ),
    })
  )
)
```

### Target pattern: pure unit-keyed engine (lib/domain/finance/accommodation-amounts.ts)
```typescript
export type ResolvedOptionCharge = {
  optionKey: string
  label: string
  unit: "per_night" | "per_person"
  pricePerUnitMinor: number
  quantity: number
  nights: number // resolved applicable nights (totalNights for per_night; 1 for per_person)
}

// Handler registry keyed by the typed unit — the ONLY place unit math exists.
const UNIT_HANDLERS = {
  per_night: (o: ResolvedOptionCharge) => o.pricePerUnitMinor * o.nights * o.quantity,
  per_person: (o: ResolvedOptionCharge) => o.pricePerUnitMinor * o.quantity,
} as const satisfies Record<"per_night" | "per_person", (o: ResolvedOptionCharge) => number>

export function deriveOptionChargeMinor(option: ResolvedOptionCharge): number {
  return Math.max(0, UNIT_HANDLERS[option.unit](option))
}
```
*(Source shape: generalized from the verified current `deriveAccommodationAmount` in `lib/domain/finance/accommodation-amounts.ts`; unit handler registry per CONTEXT lock "the pure pricing engine uses a handler registry keyed by the typed unit".)*

## State of the Art

| Old Approach (v5.0) | Current Approach (Phase 46) | When Changed | Impact |
|---------------------|-----------------------------|--------------|--------|
| Live global catalog references (`eventAccommodationRates.categoryId` → global) | Event-owned rows (additive `eventCategoryId`/new tables) | Phase 46 | Global catalog becomes seed-only; no live coupling (SET-02) |
| Two duplicate event-config resolvers (finance + signup) | One `loadEventOwnedAccommodationContext` | Phase 46 | All consumers share one projection (SET-04, PITFALLS #14) |
| Version boundary on `eventAccommodationConfig.updatedAt` | `eventAccommodationSetup.updatedAt` (effective token) | Phase 46 | One version boundary for confirmations/pending-impact (CFG-05) |
| Named boolean pricing formula (`categoryIsSuperior`/`upgradeSelected`/`cotSelected`) | Unit-keyed line-item engine + data-driven `optionLines` | Phase 46 | Any configured option prices generically (FIN-01..03) |
| `LOCKED_OPTION_SEMANTICS` / `LOCKED_AGE_BAND_BOUNDS` in code | Seed data + event-owned rows | Phase 46 | Adding an option/band is data, not code (CFG-02/03) |
| `upgradeSelected`/`cotSelected` as the only selection shape | Child rows `orderAccommodationOptionSelections` (+ legacy dual-read) | Phase 46 | Generic option + quantity selections (SEL-01/02) |

**Deprecated/outdated:**
- `accommodationOptions.code`/`accommodationCategories.code`/`ageBandCode` literal unions — widen to `v.string()` (values remain valid legacy seed data).
- `LOCKED_OPTION_SEMANTICS` enforcement for event options — replaced by typed `kind`/`unit` unions validated on event-owned rows; the registry in the pure module owns unit math.
- `categoryCode === "superior"` branch in the pure module — replaced by the data-driven `isSuperior` flag resolved by the loader.

## Open Questions

1. **Upgrade-applicability data shape (`appliesToCategoryKey`)** — Phase 46 needs the generalized engine to price the legacy `superior_upgrade` semantics (charge upgrade when the selected category is not the superior category) without a code compare. We know: the loader must resolve which categories an upgrade applies to from data. Unclear: whether to add `appliesToCategoryKey: v.optional(v.string())` to the event option row now, or defer the upgrade-applies decision to Phase 47's eligibility resolver and let Phase 46 price only addon options generically. Recommendation: add the optional field on the event option row in Phase 46 (schema + seed shape), but keep the *enforcement/eligibility* decision in Phase 47; the Phase 46 loader resolves the legacy upgrade into a synthetic option only when the selected category matches the data (no literal code).
2. **Snapshot `optionLines` for legacy booleans** — legacy confirmed snapshots have no `optionLines`; the dual-shape guard covers them. Unclear: whether Phase 46 confirmation should *write* `optionLines` for legacy-boolean selections converted to synthetic options. Recommendation: yes — new confirmations always persist the v6 shape (fully resolved lines); only *existing* rows keep the v5 shape. This makes future consumers read one canonical line shape.
3. **`orderAccommodationSelections.categoryId` polymorphism** — in `event_owned` mode, selections must reference event categories. We recommend an additive optional `eventCategoryId` (typed `v.id("eventAccommodationCategories")`) alongside legacy `categoryId`. Unclear: whether Phase 46 should also keep `occupancy` untouched (yes — physical occupancy vocabulary stays typed) and how the loader disambiguates which id to price (answer: by `setupMode`). Low residual risk; locked by the additive constraint.

## Deferred to Phase 47 (explicit)

- `copyAccommodationSetupFromEvent` and named template mutations, provenance audits, idempotency/OCC behavior, physical-inventory copy UX (REUSE-01..04).
- The shared eligibility resolver's enforcement logic — CFG-04, TKT-02, TKT-03 (rules table + seeded shape land in Phase 46; rejection behavior is Phase 47).
- Reference-safe archive/delete mutations (LIFE-01/02).
- Any application UI change (Phase 48+), including the admin Setup tab, copy/template preview dialogs, and pending-impact UI.

## Exact Files / Functions / Types to Change

### `convex/schema.ts`
- **Widen (non-destructive):** `ageBandCodeValidator` (top-level, used by 4+ tables) → `v.string()`; `accommodationCategories.code` → `v.string()`; `accommodationOptions.code` → `v.string()`. Keep `accommodationOptions.kind`/`unit`, `occupancy`, `rateType`, `resourceKind` as typed unions.
- **New tables:** `eventAccommodationSetup` (eventId, setupMode union, copiedFromEventId?, copiedFromTemplateId?, copiedAt?, updatedAt; index `by_eventId`); `eventAccommodationCategories` (eventId, key, label, description?, isSuperior, sortOrder, enabled?; indexes `by_eventId`, `by_eventId_and_key`); `eventAccommodationAgeBands` (eventId, key, label, minAge, maxAge?, sortOrder; indexes `by_eventId`, `by_eventId_and_key`); `eventTicketAccommodationRules` (eventId, ticketTypeId, allowedCategoryKeys array, allowedOccupancies array, accommodationIncluded, includedNights?, updatedAt; indexes `by_eventId`, `by_eventId_and_ticketTypeId`); `orderAccommodationOptionSelections` (selectionId → orderAccommodationSelections, orderId, attendeeId, eventOptionKey, quantity, sortOrder; indexes `by_selectionId`, `by_orderId`).
- **Additive fields:** `eventAccommodationRates.eventCategoryId?` (typed `v.id("eventAccommodationCategories")`, index `by_eventId_and_eventCategoryId`); `eventAccommodationOptions` gains `key?`, `label?`, `description?`, `kind?` (typed union), `unit?` (typed union `per_night`/`per_person`), `eligibilityAgeBandKey?` (string), `appliesToCategoryKey?`, `sortOrder?` (index `by_eventId_and_key`); `eventAccommodationAgePricing.ageBandKey?` (string); `orderAccommodationSelections.eventCategoryId?` (typed) + snapshot validator extended to the dual-shape union with `optionLines`.
- **Keep:** `eventAccommodationConfig` (stay-window owner during compatibility).

### `lib/domain/finance/accommodation-amounts.ts` (pure engine refactor)
- `AccommodationPricingInput` gains `options: ResolvedOptionCharge[]` (+ keep legacy scalars for the legacy bridge); `AccommodationSelectionInput` gains `eventCategoryKey?`, `optionSelections?: Array<{ eventOptionKey, quantity }>`; `AccommodationReceiptLine` becomes generic (`kind: "accommodation" | "option"`, `optionKey?`, `unit?`, `quantity?`, `nights`, `ratePerNightMinor`, `chargeMinor`); `AccommodationPriceSnapshot` gains optional `optionLines`; new `UNIT_HANDLERS` registry + `deriveOptionChargeMinor`; `deriveAccommodationAmount`/`buildAccommodationPriceSnapshot` price from resolved options; `isCompleteAccommodationPriceSnapshot` extended dual-shape (legacy branch OR v6 with complete optionLines). Remove `categoryCode === "superior"` and named-boolean branches (legacy booleans map to synthetic options via the loader, not in the pure module).

### `convex/eventAccommodationContext.ts` (NEW)
- `loadEventOwnedAccommodationContext(ctx, eventId)` returning: `setupMode`, `versionToken`, config, event categories (or legacy global-resolved), rates by key (eventCategoryId:occupancy / categoryId:occupancy per mode), enabled options resolved (event-owned fields or global fallback), age bands, age pricing, `eventTicketAccommodationRules`, and the legacy bridge (boolean selections → synthetic `ResolvedOptionCharge[]`). All reads via bounded `for await` / per-ID indexed fetches; no `.take()` caps for config.

### `convex/finance.ts`
- Replace `loadEventAccommodationContexts` internals with the shared loader (keep exported `loadOrderAmountDueBreakdowns`, `loadOrderAttendeePaymentBreakdowns` signatures). Confirmed rows price exclusively from snapshot (now incl. `optionLines`); unconfirmed rows price live via shared loader; legacy confirmed rows still pass the dual-shape guard. `OrderAccommodationSelectionDoc` gains `eventCategoryId?`, and pricing input gains resolved options.

### `convex/accommodation.ts`
- `touchEventAccommodationConfigVersion` → setup-row version advance; new `initializeEventAccommodationSetup` mutation (per-event materialization from the event's own legacy global references: create event-owned categories/options/age bands/rates/age pricing + seed `eventTicketAccommodationRules` from `ticketTypes.roomTypeId`/`accommodationIncluded`, set `setupMode: "event_owned"`, record `updatedAt`). New `getEventOwnedAccommodationSetup` query. New event-owned upserts (category/option/age-band/rate/age-pricing/ticket-rule) writing event-owned rows + advancing the version boundary atomically. `resolveOrderAccommodationConfirmation`/`persistOrderAccommodationConfirmation`: read `configVersion` from the effective token, read child option selections, persist the v6 snapshot with `optionLines`, keep legacy-boolean rows valid. `LOCKED_OPTION_SEMANTICS`/`isValidOptionSemantics` retired from the event-option write path (kind/unit unions validated directly); `LOCKED_AGE_BAND_BOUNDS`/`isValidAgeBandBounds` stay only for legacy global-band writes (seed surface).

### `convex/signupCatalog.ts` + `lib/domain/signup/catalog.ts`
- `loadPublicSignupAccommodationContext` → shared loader; `PublicSignupCatalogOption` becomes data-driven (`eventOptionKey`, `label`, `description?`, `kind`, `unit`, `priceMinor`, `eligibilityAgeBandKey?`, `enabled`); `PublicSignupCatalogActiveCategory` gains `key`/`isSuperior` (event-owned) while keeping `code` for legacy events; widen `categoryCodeValidator`/`optionCodeValidator`/`ageBandCodeValidator` to `v.string()`. `resolvePublicSignupSelection` keeps its signature; quote output includes data-driven option lines.

### `lib/types/signup.ts` + `convex/signupSubmission.ts`
- `signupAccommodationSelectionValidator` gains optional `optionSelections: v.array(v.object({ eventOptionKey: v.string(), quantity: v.number() }))`; legacy `upgradeSelected`/`cotSelected` remain optional/readable. `submitSignupEnvelope` persists `orderAccommodationOptionSelections` child rows (per attendee), validates every `eventOptionKey` against the event's enabled options in the same transaction, dual-writes legacy booleans for existing consumers, includes child rows in restore payloads.

### `convex/publicTracking.ts`
- `editOptionCodeValidator` → `v.string()` (option key); `editSelectionValidator` gains `optionSelections?: Array<{ eventOptionKey: string; quantity: number }>`; `updateAccommodation` reads/writes child rows via the shared loader + same-transaction event-scope validation; legacy boolean rows dual-read; `getTrackPaymentEditContext` returns the event-owned choice sets + child-row selections.

### Tests (fixtures)
- **Extend** `tests/finance/accommodation-amounts.test.ts`: per-unit engine tests (`per_night`, `per_person`), a third arbitrary option (`bike_rack` addon), a non-default age band, snapshot dual-shape guard (v5 fixture valid, incomplete v6 throws).
- **New** `convex/accommodation-event-owned.handlers.test.ts`: setup init/materialization, version-boundary single-token assertions, event-owned option write + version bump, ticket-rule seeding from `ticketTypes`, cross-event option-key rejection, generalized confirmation writing v6 `optionLines`, legacy-boolean confirmation fixture still prices identically (FIN-05).
- **New/parity** loader test: shared-loader output equals old resolver output on a legacy fixture (SET-05).
- **Keep green (regression):** `convex/signup-submission.test.ts` (createConfiguredEvent fixture), `convex/track-payment-edit.handlers.test.ts`, `convex/accommodation-admin.handlers.test.ts`, `convex/accommodation-paid-priority.handlers.test.ts`, `tests/convex/finance-accommodation.test.ts`, `tests/convex/phase45-money-integrity.test.ts`.

## Convex Constraints (from `convex/_generated/ai/guidelines.md`, verified)

- Validators on **all** functions; typed FKs (`v.id`) on all new tables; no `v.any` for new contract fields.
- Widening unions is safe schema evolution; never narrow a validator; never loosen the snapshot guard.
- No `.filter()` in queries; index-first (`withIndex`) ordering must match index field order.
- Bounded reads: `for await` async iteration for per-event config; `.take()` only where a real display bound exists (with `count` returned); never `.collect().length` for counts.
- No unbounded arrays on documents — option selections are child rows (also the 8192-array and 1MB-doc limits).
- Multi-table writes in one mutation are atomic; batch + `ctx.scheduler.runAfter(0, ...)` only if a transaction would exceed limits (not the case here — a setup copy/materialization is tens of rows).
- After every Convex change: `npx convex codegen` and `npx convex dev --once` (AGENTS.md).

## Migration Risks (top, with mitigations)

1. **Finance regression on legacy events** — the loader collapse must be behavior-identical for `legacy_global` events. *Mitigate:* parity test + keep Phase 45 money matrix green.
2. **Version-boundary ambiguity** — setup row + config row both carrying `updatedAt`. *Mitigate:* single `touchEventAccommodationSetupVersion`; effective token from the shared loader; a test asserting exactly one token per event.
3. **Snapshot dual-shape breakage** — existing confirmed rows fail the extended guard. *Mitigate:* dual-shape guard with legacy branch first; legacy fixture test before v6 writer lands.
4. **`per_person` unit priced per night** — wrong unit math. *Mitigate:* unit handler registry + per-unit tests with a third option.
5. **Cross-event option identity accepted** — selection writes must validate `eventOptionKey` against the event's enabled set in the same transaction. *Mitigate:* handler test for cross-event key rejection (PITFALLS #8).
6. **Materialization races** — two admins initialize the same event's setup concurrently. *Mitigate:* `.unique()` singleton read + "already initialized" fail-closed guard (mirrors `eventAccommodationConfig` singleton behavior); idempotent re-run is Phase 47's copy concern.

## Verification Commands

```bash
npx convex codegen
npx convex dev --once
npm run typecheck
npm test                          # node suites (pure domain incl. new per-unit tests)
npx vitest run --config vitest.convex.config.ts     # handler suites (new event-owned + all regression)
npx vitest run --config vitest.components.config.ts # regression only — no UI change expected
npm run build
```
Plus the source audit grep (no `"superior_upgrade"`/`"cot"`/`"superior"`-code branches in domain/loaders; no `categoryCode === "superior"` in `lib/domain/finance/`).

## Sources

### Primary (HIGH confidence)
- Codebase read directly 2026-08-06: `convex/schema.ts`, `convex/accommodation.ts` (validators, `LOCKED_OPTION_SEMANTICS`, `LOCKED_AGE_BAND_BOUNDS`, `touchEventAccommodationConfigVersion`, `getEventAccommodationConfig`, `resolveOrderAccommodationConfirmation`, `persistOrderAccommodationConfirmation`, `confirmBuyerAssignment`), `convex/finance.ts` (`loadOrderAmountDueBreakdowns`, `loadEventAccommodationContexts`), `convex/signupCatalog.ts` (`loadPublicSignupAccommodationContext`, `resolvePublicSignupSelection`, `getPublicSignupCatalog`), `convex/signupSubmission.ts` (`submitSignupEnvelope`), `convex/publicTracking.ts` (`updateAccommodation`, edit validators), `lib/domain/finance/accommodation-amounts.ts`, `lib/domain/signup/catalog.ts`, `lib/types/signup.ts`, `convex/init.ts` (seeds), `lib/convex/hooks/accommodation.ts`, test files, `package.json`, `vitest.*.config.ts`.
- Context7 `/llmstxt/convex_dev_llms-full_txt` (queried 2026-08-06): schema evolution ("add new tables… evolve field types using union types while updating data to match the new format"), mutation atomicity ("all database operations within a single mutation are atomic and isolated").
- Planning docs: `.planning/46-CONTEXT.md`, `.planning/ROADMAP.md` (Phase 46), `.planning/REQUIREMENTS.md`, `.planning/PROJECT.md`.
- Prior research: `.planning/research/{SUMMARY,ARCHITECTURE,STACK,PITFALLS}.md` (2026-08-06), all codebase-verified.

### Secondary (MEDIUM confidence)
- Archived v5.0 research `.planning/research/v5.0-accommodation-upgrades-options/` — snapshot/permalink/idempotency/paid-priority contracts carried forward.

### Tertiary (LOW confidence)
- None used; every Phase 46 claim is codebase- or Context7-grounded. The `appliesToCategoryKey` shape (Open Question 1) is a synthesis flagged for plan-time confirmation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — installed versions verified in `node_modules`; Convex widening + atomicity re-verified via Context7 today.
- Architecture: HIGH (current state) / MEDIUM (target-state specifics) — every integration point read from source; unit vocabulary, version-boundary owner, ticket-rules shape, isSuperior-as-data, and materialization strategy are locked by CONTEXT; only `appliesToCategoryKey` and the legacy-boolean→synthetic-option mapping remain to confirm at plan time.
- Pitfalls: HIGH — every pitfall verified against current source and mapped to the phase's exact files.

**Research date:** 2026-08-06
**Valid until:** 2026-09-05 (30 days; stable stack — no fast-moving dependency involved)
