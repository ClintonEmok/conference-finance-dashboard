# Phase 46: Event-Owned Setup Schema, Generalized Pricing & Shared Contract — Pattern Map

**Mapped:** 2026-08-06
**Files analyzed (new/modified):** 16
**Analogs found:** 15 / 16 (1 verify-only file has no code change)

**Source of truth read:** `46-CONTEXT.md`, `.planning/ROADMAP.md` (Phase 46 section + v6.0 scope), `.planning/REQUIREMENTS.md` (SET-01..05, CFG-01..03/05, TKT-01, SEL-01/02, FIN-01..05), `.planning/research/ARCHITECTURE.md` (v6.0), `.planning/research/STACK.md`, `convex/_generated/ai/guidelines.md`, and the current source listed below.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `convex/schema.ts` (modify) | schema/config | CRUD | `convex/schema.ts` existing accommodation tables (lines 221-231, 573-653) | exact (self-analog) |
| `lib/domain/finance/accommodation-amounts.ts` (modify) | service (pure money) | transform | itself — `deriveAccommodationAmount` 214-327, `buildAccommodationPriceSnapshot` 172-204, `isCompleteAccommodationPriceSnapshot` 105-130 | exact (refactor point) |
| `lib/domain/finance/accommodation-pricing.ts` (new) | service (pure money, unit registry) | transform | `lib/domain/finance/accommodation-amounts.ts` + `lib/domain/finance/allocation-payment-state.ts` | role-match |
| `convex/accommodationContext.ts` (new, shared loader) | service (event-scoped resolver) | request-response (projection) | `convex/signupCatalog.ts:loadPublicSignupAccommodationContext` 379-526; `convex/finance.ts:loadEventAccommodationContexts` 109-227 | exact (merge target) |
| `convex/finance.ts` (modify) | service (canonical loader) | CRUD/transform | itself — `loadOrderAmountDueBreakdowns` 229-451 | exact (rewire internals) |
| `convex/accommodation.ts` (modify) | controller (admin mutations/queries) | request-response | itself — `getEventAccommodationConfig` 2638-2862, `touchEventAccommodationConfigVersion` 3157-3187, upserts 3189-3530, `resolveOrderAccommodationConfirmation` 3564-3683 | exact (extend) |
| `convex/signupCatalog.ts` (modify) | controller (public query) | request-response | itself — validators 21-31, public context 379-526, `resolvePublicSignupSelection` 577-707, quote 1006-1204 | exact (rewire) |
| `convex/signupSubmission.ts` (modify) | controller (public mutation) | CRUD (persist) | itself — selection insert 878-895, `buildRestorePayload` 173-302 | exact (extend) |
| `convex/publicTracking.ts` (modify) | controller (public edit mutation) | request-response | itself — validators 337-389, `updateAccommodation` 725-1146 | exact (generalize) |
| `lib/types/signup.ts` (modify) | config/types | — | itself — validators 32-63, `signupAccommodationSelectionValidator` 72-78 | exact (widen) |
| `lib/domain/signup/catalog.ts` (modify) | config/types | — | itself — `PublicSignupCatalogOption` (optionCode union) | exact (widen) |
| `convex/init.ts` (modify) | config (seed) | batch | itself — idempotent catalog seed loop 195-280 | exact (seed source) |
| `convex/events.ts` (verify-only) | controller | CRUD | itself — `ticketTypes` mutations 343-489 | no code change expected |
| `tests/finance/accommodation-amounts.test.ts` (extend) | test (pure) | — | itself — BASE_SELECTION/BASE_PRICING fixtures | exact |
| `tests/finance/accommodation-pricing.test.ts` (new) | test (pure, unit registry) | — | `tests/finance/accommodation-amounts.test.ts` | exact |
| `convex/accommodation-setup.handlers.test.ts` (new) | test (handler) | — | `convex/accommodation-catalog.handlers.test.ts` (fresh/withIdentity/createEvent) | exact |
| `convex/signup-catalog.test.ts`, `track-payment-edit.handlers.test.ts`, `signup-submission.test.ts`, `accommodation-catalog.handlers.test.ts` (extend) | test (handler) | — | themselves + `tests/convex/phase45-money-integrity.test.ts` (cross-surface matrix) | exact |

---

## Pattern Assignments

### `convex/schema.ts` (modify) — additive tables + indexes + widened unions

**Analog:** self. Existing accommodation schema is the template: `orderTicketSelections` child row (221-231), `eventAccommodationConfig` singleton (573-586), `eventAccommodationRates`/`Options`/`AgePricing` event-scoped rows (588-653), `orderAccommodationSelections` + Phase 44 confirmation contract (256-305), `orderAccommodationEditAudits` append-only (319-336).

**Imports pattern** (lines 1-2):
```typescript
import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
```

**Additive table pattern to copy** (e.g. `eventAccommodationAgePricing` 638-653):
```typescript
eventAccommodationAgePricing: defineTable(
  v.object({
    eventId: v.id("events"),
    ageBandCode: ageBandCodeValidator,
    rateType: v.union(v.literal("free"), v.literal("full"), v.literal("percent"), v.literal("flat")),
    value: v.number(),
    sortOrder: v.number(),
  })
)
  .index("by_eventId", ["eventId"])
  .index("by_eventId_and_ageBandCode", ["eventId", "ageBandCode"]),
```

**Child-row template to copy for `orderAccommodationOptionSelections`** (lines 221-231):
```typescript
orderTicketSelections: defineTable(
  v.object({
    orderId: v.id("orders"),
    attendeeId: v.id("orderAttendees"),
    ticketTypeId: v.id("ticketTypes"),
    quantity: v.number(),
    sortOrder: v.number(),
  })
)
  .index("by_orderId", ["orderId"])
  .index("by_ticketTypeId", ["ticketTypeId"]),
```

**What to preserve:**
- Typed FKs everywhere (`v.id("events")`, `v.id(...)`); do NOT repeat the string-ID anti-pattern of `accommodationEventHotels` (485-486) / `accommodationRooms` (561-562) — research ARCHITECTURE.md:167 calls this out explicitly.
- Index naming `by_eventId_and_field`; guideline: all index fields in the name, queried in the same order.
- New tables get at minimum `.index("by_eventId", ["eventId"])`; `eventAccommodationSetup` gets `by_eventId` (singleton lookup with `.unique()`); categories/age bands additionally `by_eventId_and_key`; ticket rules `by_eventId` + `by_eventId_and_ticketTypeId`; child rows `by_selectionId` + `by_orderId`.
- Optional fields (`v.optional(...)`) for additive evolution — never remove an existing field.
- Bounded arrays only — `v.array()` with a bounded object (research: `allowedCategoryKeys` bounded array); the guidelines forbid unbounded arrays in docs (guidelines.md:157).

**What to generalize:**
- Widen the hardcoded unions to data: `accommodationCategories.code` (520-524) and `accommodationOptions.code` (535) stay as legacy validators for template rows, but new event-owned tables carry free-string `key`. Keep `occupancy` (592-596), `unit` (543), `rateType` (642-647) as **typed unions** — they stay typed, only the *naming* unions widen.
- `eventAccommodationConfig` (573-586): keep as stay-window owner; `updatedAt` stops being the pricing boundary (see Shared Patterns → Version Boundary).
- `eventAccommodationRates` (588-606): `categoryId` rekeyed from `accommodationCategories` → `eventAccommodationCategories`; keep the composite index shape `by_eventId_and_categoryId_and_occupancy`.
- `orderAccommodationSelections.priceSnapshot` (285-300): extend with optional data-driven `optionLines`; keep v5 fields required.

**Validation:** `ageBandCodeValidator` at top of file (9-14) — the shared union; the event-owned age bands must NOT use it as the key validator (they take free `key` + `minAge`/`maxAge`), but legacy rows keep it.

---

### `lib/domain/finance/accommodation-amounts.ts` (modify) — generalized line-item engine

**Analog:** self. This is the documented refactor point (CONTEXT "Reusable Assets", STACK.md:61).

**Imports/guard pattern** (105-130) — fail-closed completeness guard, must accept BOTH v5 and v6 shapes:
```typescript
export function isCompleteAccommodationPriceSnapshot(
  value: unknown
): value is AccommodationPriceSnapshot {
  if (!value || typeof value !== "object") return false
  const snapshot = value as Record<string, unknown>
  return (
    typeof snapshot.baseRatePerNightMinor === "number" && Number.isFinite(...) &&
    ... // v5 required fields stay required
    // v6: optionLines is OPTIONAL — a v5 snapshot without it must still pass
  )
}
```

**Snapshot self-containment pattern** (79-98 + 172-204): the snapshot records every decision the formula depends on, so confirmed rows price exclusively from the snapshot. Generalize: add data-driven `optionLines: Array<{ key, label, unit, quantity, chargeMinor }>` resolved at confirmation.

**Live-vs-snapshot branch pattern** (214-241): `usesSnapshot` picks resolved rates/nights from the snapshot, else live inputs. Preserve this exactly; the generalized engine routes each resolved option through the unit handler registry instead of the `upgradeSelected`/`cotSelected` branches (295-313).

**What to preserve:**
- Pure module: no Convex imports, no DB reads, no display formatting (header comment 1-10).
- Minor-unit normalization helpers `normalizeMinorUnits`/`normalizeNights`/`normalizeBoolean` (149-165).
- Zero-rate lines omitted; `totalMinor` = sum of lines (283-316).
- `buildAccommodationPriceSnapshot` used by Phase 44 confirmation and by the loader for unconfirmed rows (320-325) — keep the "snapshot is never rebuilt from live pricing for confirmed rows" rule.

**What to generalize (the named-branch removal):**
- Remove `categoryIsSuperior: ... === "superior"` (line 196) and the `categoryCode === "superior"` decision at line 253.
- Remove the `superior_upgrade`/`cot` named charge blocks (295-313). Replace with iteration over a **resolved option list** (each: `key`, `label`, `unit`, `priceMinor`, `quantity`, `nightBasis`).
- `AccommodationReceiptLine` (132-138) gains `unit` + `quantity`; `kind` becomes the option `key` (free string) or `"accommodation"` for the base line — never a closed union.
- Locked vocabulary: `per_night` and `per_person` handled; `per_stay`/`per_person_per_night`/`flat` must be **rejected as unhandled**, not silently treated as free strings (CONTEXT "Pricing Units").

**Error handling:** malformed money/nights normalize to safe 0 (never NaN — comment 22-24). Fail-closed behavior lives in the *loader*, not here.

---

### `lib/domain/finance/accommodation-pricing.ts` (new) — unit-handler registry

**Analog:** `lib/domain/finance/allocation-payment-state.ts` (small pure module with typed inputs/outputs, no Convex) + the pure-module conventions of `accommodation-amounts.ts`.

**Core pattern to build** (CONTEXT "Pricing Units"): a handler registry keyed by the typed unit union:
```typescript
export const PRICING_UNIT = {
  per_night: "per_night",
  per_person: "per_person",
} as const
export type PricingUnit = (typeof PRICING_UNIT)[keyof typeof PRICING_UNIT]

type UnitHandler = (input: {
  priceMinor: number
  quantity: number
  nightBasis: number // per_night → applicable stay nights; per_person → 1
}) => number

const unitHandlers: Record<PricingUnit, UnitHandler> = {
  per_night: ({ priceMinor, quantity, nightBasis }) => priceMinor * quantity * nightBasis,
  per_person: ({ priceMinor, quantity }) => priceMinor * quantity,
}
```
- Charge always in minor units, `Math.floor`-normalized, non-negative (copy `normalizeMinorUnits`).
- **Preserve:** pure module, typed unions only, no free strings in money math (ROADMAP planning decision, ARCHITECTURE.md:331).
- **Reject:** any unit outside the registry throws (never an unhandled free string that prices as €0).
- Return type must be self-contained enough to be persisted into the snapshot `optionLines` without live option rows (CONTEXT "Specific Ideas").
- Percent rate-type rounding: follow the codebase `allocateMinorAmountByWeight` convention (ARCHITECTURE.md:335) if percent age pricing is wired (it is `eventAccommodationAgePricing.rateType` — currently unconsumed; Phase 46 may wire it).

---

### `convex/accommodationContext.ts` (new) — shared `loadEventOwnedAccommodationContext`

**Analog:** merge of `convex/signupCatalog.ts:loadPublicSignupAccommodationContext` (379-526) and `convex/finance.ts:loadEventAccommodationContexts` (109-227). This is the mandated collapse of the two duplicate resolvers (ARCHITECTURE.md:17, Anti-Pattern 3) into exactly one shared projection (CONTEXT "Invariants": "no third resolver is added").

**Imports pattern** (finance.ts 1-17):
```typescript
import type { Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import type { Doc } from "./_generated/dataModel"
```

**Core loader pattern to preserve (finance.ts 109-151):**
- Per-event indexed reads via `Promise.all` + `for await` bounded async iteration (never truncated `.take()` for authoritative sets) — comment at 118-120.
- Singleton config via `.unique()` (130-133) — throws on duplicate rows, null only for legitimately-missing row. Do NOT swallow this into a €0 fallback (comment 125-129).
- Catalog-reference batch/cache phase (157-178): collect distinct referenced IDs, `Promise.all(ctx.db.get(...))` once, build maps. Preserve the "never read a global row per event" discipline.
- Fail closed on missing referenced definitions (signupCatalog 476-487: throws when an event-configured age band is missing).

**What to generalize:**
- Replace the hardcoded code branches (finance.ts 207-213; signupCatalog.ts 435-443) with the event-owned option rows themselves (each row is the resolved option: `key`, `label`, `kind`, `unit`, `priceMinor`, `eligibilityRule`, `enabled`, `sortOrder`).
- Add `setupMode` dual-read (CONTEXT "Legacy Materialization"): `legacy_global` → resolve global references exactly as the v5 path does today; `event_owned` → event rows only, global refs ignored; `uninitialized` → no config. The legacy_global path must reproduce today's `categoryId`→code and `optionId`→code joins so existing events resolve identically (SET-05).
- Expose the version token: `setup.updatedAt` (see Version Boundary) — every consumer reads the same token from this one projection (SET-04).
- Bounded + event-scoped only; research says per-event rows are small (categories < 10, options < 20, bands < 5, rates < 30 — ARCHITECTURE.md:321).

**Placement constraint (checked):** must NOT import `convex/signupCatalog.ts` or `convex/accommodation.ts`; `finance.ts` currently imports only `lib/domain/*` + `_generated` (verified lines 1-17), `accommodation.ts` already imports `./finance` (line 14), `signupSubmission.ts` imports `./finance` (line 5). A new leaf module avoids any cycle and is importable by finance, signupCatalog, publicTracking, signupSubmission, accommodation.

---

### `convex/finance.ts` (modify) — canonical loader rewired

**Analog:** self.

**Preserve exactly:**
- `loadOrderAmountDueBreakdowns` (229-451) remains the single amount-due choke point (CONTEXT "Invariants").
- Fail-closed confirmation check (368-382): confirmed row without finite `confirmedAt`/`configVersion`/complete snapshot throws — NEVER re-prices or drops as €0. Extend the guard to accept both v5 and v6 snapshot shapes without weakening it (FIN-05).
- `isConfirmed` = field presence (360), confirmed rows price exclusively from `priceSnapshot` (384, 407-428), unconfirmed rows price live.
- Legacy €0 fallback for unconfirmed rows on a missing-config event (390-395 `canPrice`).
- Bounded async iteration for all selection/payment reads (241-246, 301-311, 461-463).

**What to generalize:**
- Delete `loadEventAccommodationContexts` (109-227) and call `loadEventOwnedAccommodationContext` instead (321).
- Batch-read `orderAccommodationOptionSelections` child rows per order (same pattern as 301-311) and pass them into the generalized `deriveAccommodationAmount` resolved-option input.
- `OrderAccommodationSelectionDoc` local type (45-57) keeps the loader typed before/after codegen — extend it with child option rows.
- `ratesByKey` key shape (198) changes when rates rekey to event categories — the `legacy_global` path must still resolve global-ID keys for existing orders.

---

### `convex/accommodation.ts` (modify) — setup init/materialization, version boundary, generalized writes

**Analog:** self.

**Singleton version touch to generalize** (3157-3187 + `nextConfigVersion` 3141-3145):
```typescript
function nextConfigVersion(previousUpdatedAt: number | null | undefined): number {
  return Math.max(Date.now(), (previousUpdatedAt ?? 0) + 1)
}
async function touchEventAccommodationConfigVersion(ctx: MutationCtx, eventId: Id<"events">) {
  const existing = await ctx.db.query("eventAccommodationConfig")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId)).unique()
  if (existing) {
    await ctx.db.patch("eventAccommodationConfig", existing._id, {
      updatedAt: nextConfigVersion(existing.updatedAt),
    })
    return
  }
  // lazy singleton init from the locked initial stay window
  const event = await getEventOrThrow(ctx, eventId)
  const window = deriveInitialStayWindow(event.startsAt)
  await ctx.db.insert("eventAccommodationConfig", { ..., updatedAt: nextConfigVersion(null) })
}
```
**Preserve:** strictly-monotonic version (`Math.max(Date.now(), prev + 1)`), lazy singleton init on first write, atomic with the data write, never touches orders/selections/totals/payments (comment 3147-3156).

**Generalize:** the boundary token moves to `eventAccommodationSetup.updatedAt`. Every one of the 8 call sites (3313, 3317, 3390, 3402, 3445, 3449, 3516, 3526) must advance the setup row instead — one shared `touchEventAccommodationSetupVersion(ctx, eventId)` that also initializes the setup row (`setupMode: "uninitialized"` until first explicit save; provenance fields nullable). Keep `eventAccommodationConfig.updatedAt` as a stay-window write timestamp only — it must NOT become a second pricing boundary (CONTEXT "Version Boundary").

**Confirmation boundary to rewire** (resolveOrderAccommodationConfirmation 3580-3589):
```typescript
const config = await ctx.db.query("eventAccommodationConfig")
  .withIndex("by_eventId", (q) => q.eq("eventId", eventId)).unique()
if (!config) { throw new Error("Event accommodation configuration is required before confirming an order") }
const configVersion = config.updatedAt
```
Change `configVersion` source to the setup row (`eventAccommodationSetup.updatedAt`); keep the "config required before confirming" throw. Historical confirmed rows keep their old `configVersion` value (historical data, never rewritten — CONTEXT "Do not rewrite historical orders").

**Admin contract analog** (`getEventAccommodationConfig` 2638-2862) — the model for the new `getEventOwnedAccommodationSetup`: bounded per-event projection, per-ID reference resolution (2676-2740), exact pending-order count via full indexed `for await` scan with a bounded display list `PENDING_ORDERS_DISPLAY_LIMIT = 50` (2371, 2770-2803), `hasAccommodationSelections` distinguishes empty vs all-confirmed (2761-2763).

**What to preserve:** `requireIdentity(ctx)` on every read/write (2639-2641), `getEventOrThrow` (2603-2612), `isNonNegativePrice` (2422-2424), `deriveNightCount` (2431-2439), `deriveInitialStayWindow` (2446-2457), upsert-per-facet shape (3189-3530), patch-vs-insert with `.first()` lookups on composite indexes (3300-3318).

**What to generalize (hardcoded-code removal):**
- `LOCKED_OPTION_SEMANTICS` (2938-2947) and `LOCKED_AGE_BAND_BOUNDS` (2567-2575) move from code constants to seed data (ROADMAP Phase 46 scope). `isValidOptionSemantics` (2949-2959) and `isValidAgeBandBounds` (2581-2595) become seed-time validators only, not write-time gates for event rows.
- `isCotEligibilityValid` (2535-2543) hardcodes `optionCode === "cot"` — replace with data-driven eligibility (`eligibilityRule` on the event option row).
- The option-code union validators (2378-2381) widen to `v.string()` keys for event-owned rows; `occupancyValidator`/`optionUnitValidator`/`agePricingRateTypeValidator` (2388-2411) stay typed.
- Per-event materialization: new internal/private helper that seeds event-owned rows (categories/options/age bands/rates/age pricing) from global references + seeds `eventTicketAccommodationRules` from `ticketTypes` — triggered on first explicit admin save/setup init (CONTEXT "Legacy Materialization"; NO global backfill).

---

### `convex/signupCatalog.ts` (modify) — shared-context consumer + widened public contract

**Analog:** self.

**Preserve:**
- The public contract discipline: `getPublicSignupCatalog` (768-1006) and `getPublicSignupAccommodationQuote` (1006-1204) return server-owned resolved data; quote reuses `deriveAccommodationAmount` (1140-1158).
- Shared resolver `resolvePublicSignupSelection` (577-707) — single validation rule set with deterministic `QUOTE_INVALID:` markers that `updateAccommodation` re-maps (publicTracking 1016-1025). This is the pattern Phase 47's eligibility resolver will follow; Phase 46 only widens its inputs.
- Fail-closed ticket entitlement: `resolveTicketCategoryById` three-state map (720-766) — `undefined` unconstrained, `null` dangling → reject, `{categoryId}` allowed. In `event_owned` mode this join re-derives from event category rows; in `legacy_global` it stays the global `roomTypeId → roomType.categoryId` path.
- Legacy `slots` block (102-104 comment) preserved; the "no client money" rule (comment 1137-1138).

**Generalize:**
- Replace `loadPublicSignupAccommodationContext` body (379-526) with a call to `loadEventOwnedAccommodationContext`; keep the derived `PublicSignupAccommodationContext` shape for callers where possible, adding the data-driven option list and version token.
- Widen `optionCodeValidator` (26-29), `categoryCodeValidator` (21-25), `publicSignupOptionValidator` (70-75), `publicSignupQuoteAttendeeValidator` (124-132): options become `{ key, label, unit, priceMinor, eligibility }`; selection args become `optionSelections: [{ key, quantity }]` — accept only event-scoped option identifiers + quantities, reject monetary/night/eligibility args (SEL-02, CONTEXT "Selection And Snapshot Compatibility").
- Receipt line validator (112-122) widens `kind` to a free string + adds `unit`/`quantity`.
- The quote must price a **third arbitrary option and a non-default age band** — prove it in tests even though the UI is deferred (CONTEXT "Specific Ideas").

---

### `convex/signupSubmission.ts` (modify) — child-row persistence + restore payload

**Analog:** self.

**Selection insert to extend** (878-895): currently one `orderAccommodationSelections` row per attendee with the two booleans. Add child-row writes to `orderAccommodationOptionSelections` (one row per selected option: `selectionId`, `optionKey`, `quantity`, `sortOrder`) inside the same atomic mutation. Keep the boolean dual-write ONLY where an existing consumer reads it (CONTEXT: "may dual-write only where an existing consumer requires it").

**Restore payload to extend** (`buildRestorePayload` 173-302): the idempotent restore path reads booleans at 291-302 and the validator at 75-84. Child rows MUST be included in the restore payload (and the validator widened) or an idempotent retry after the upgrade drops option selections and changes the price — a hidden-coupling trap.

**Preserve:** `throwSubmissionError` codes (122-127), idempotency via `orderIdempotency` (897-915), server-resolved stay timestamps/nightCount (891-893), `resolvedAccommodationSelections` server validation before insert (868-876).

---

### `convex/publicTracking.ts` (modify) — generalized edit contract

**Analog:** self.

**Edit validator block to widen** (337-389): `editOptionCodeValidator` (342-345), `editSelectionValidator` (382-389 with `upgradeSelected`/`cotSelected` required booleans). The generalized contract accepts `optionSelections: [{ optionKey, quantity }]` — event-scoped IDs and quantities only, never price/amount/nights/eligibility (SEL-02).

**Preserve the full security stack of `updateAccommodation` (725-1146):**
- Ownership + signature verification, honeypot, confirmedAt lock, idempotency-key replay with stored result (`orderAccommodationEditAudits` 1129-1142; requestDigest at 840-849).
- Cardinality contract: replacement must contain exactly one preference per existing attendee (920-944).
- Server-priced before/after via `loadOrderAmountDueBreakdowns` (1078-1082, 1115-1119).
- Selection digests (1043-1065) must now include child option rows or the no-op detection breaks.

**Generalize:** the replace-style patch (1097-1113) must atomically replace child rows (delete all + re-insert, or diff-replace) along with the base row patch; keep the confirmedAt lock so confirmed rows are never patched.

---

### `lib/types/signup.ts` + `lib/domain/signup/catalog.ts` (modify) — shared public types

**Analog:** self. `signupAccommodationSelectionValidator` (72-78) and `PublicSignupCatalogOption` (optionCode union) are the shared contract types consumed by signupCatalog, publicTracking, and the UI hooks — the single widening point. Preserve the "typed access boundary" pattern (STACK.md:85-88: `lib/convex/hooks/accommodation.ts` + `lib/domain/signup/catalog.ts`).

**Note:** `lib/types/signup.ts` already centralizes `signupAgeBandCodeValidator` / `signupAccommodationOccupancyValidator` (48-63) — reuse these; do NOT add a third validator source. The schema-level `ageBandCodeValidator` (schema.ts 9-14) and the accommodation.ts copy (2382-2387) are legacy duplicates — Phase 46 must not create more.

---

### `convex/init.ts` (modify) — seed-data home for locked semantics

**Analog:** self (195-280). The idempotent seed loop is the template for both (a) moving `LOCKED_OPTION_SEMANTICS`/`LOCKED_AGE_BAND_BOUNDS` into seed rows and (b) the per-event ticket-rule seeding materialization:
```typescript
const existingCategoryByCode = new Map(categoryRows.map((row) => [row.code, row]))
for (const category of CATEGORIES) {
  const existing = existingCategoryByCode.get(category.code)
  if (existing) { await ctx.db.patch(existing._id, insert) } else { await ctx.db.insert("accommodationCategories", insert) }
}
```
**Preserve:** insert-or-patch by key (idempotent, no duplicates), `Promise.all` initial bounded reads.

**Generalize:** `eventTicketAccommodationRules` seeding is per-event, on first explicit admin save (NOT a global backfill — CONTEXT). It mirrors `touchEventAccommodationConfigVersion`'s lazy-singleton-init shape: read `ticketTypes` by `eventId`, seed one rule row per ticket from `roomTypeId`/`accommodationIncluded` (schema 119-120), never breaking the provider/ticket schema (TKT-01, SEED-002). Multi-room-type `roomTypeIds` stays out of scope (CONTEXT).

---

### Tests

**Handler-test harness to copy** (`convex/accommodation-catalog.handlers.test.ts` 1-39):
```typescript
/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"
import { api } from "./_generated/api"
import schema from "./schema"
const modules = import.meta.glob("./**/*.ts")
function fresh() { return convexTest(schema, modules) }
const adminIdentity = { subject: "user_admin", name: "Admin", email: "admin@example.com" }
async function createEvent(t: TestConvexForDataModel<GenericDataModel>, startsAt = 1_750_000_000_000) { ... }
```
Preserve: `fresh()`, `withIdentity(adminIdentity)`, per-file seeded-event helpers, auth-rejection tests first (45-83). New `convex/accommodation-setup.handlers.test.ts` seeds the event-owned tables + ticket rules and asserts: setup-mode transitions, version-token advancement per write, legacy_global dual-read parity, child-row write/read, fail-closed snapshot guard for both shapes.

**Pure-domain fixtures to copy** (`tests/finance/accommodation-amounts.test.ts` 10-27): `BASE_SELECTION`/`BASE_PRICING` constants. Add the third arbitrary option (`{ key: "bike_rack", unit: "per_person", priceMinor: 2000 }`) and a non-default age band (CONTEXT "Specific Ideas") as new fixtures in the new `tests/finance/accommodation-pricing.test.ts` (pure node suite, `@/lib/domain/...` import alias).

**Cross-surface matrix to extend** (`tests/convex/phase45-money-integrity.test.ts`): local row-shape pinning (44-63 `AuditSeed`), `loadOrderAmountDueBreakdowns` invoked with a loader ctx (326-327), legacy/missing-config safety tests (788+). Extend for the new unit registry + child rows without weakening the legacy assertions (SET-05, FIN-05).

**Run matrix (STACK.md:117, AGENTS.md):**
```
npm test  +  npx vitest run --config vitest.convex.config.ts  +  npx vitest run --config vitest.components.config.ts
+  npm run typecheck  +  npm run build  +  npx convex codegen  +  npx convex dev --once
```
After ANY Convex code change run `npx convex codegen` and `npx convex dev --once` (AGENTS.md). Vitest environments: node for `lib/**` (vitest.config.ts), edge-runtime for `convex/**` (vitest.convex.config.ts), node for components (vitest.components.config.ts) — do not mix.

---

## Shared Patterns

### Authentication
**Source:** `convex/auth.ts:requireIdentity` + usage at `convex/accommodation.ts:2639-2641`.
**Apply to:** every admin query/mutation (`accommodation.ts`, new setup contract). Public queries/mutations (signupCatalog, publicTracking, signupSubmission) keep their existing token/ownership gates — never add `requireIdentity` to public surfaces.
```typescript
await requireIdentity(ctx)
```

### Single Version Boundary
**Source:** `convex/accommodation.ts:3141-3187` (`nextConfigVersion` + lazy singleton touch).
**Apply to:** every event-owned config write. Token = `eventAccommodationSetup.updatedAt` ONLY. `eventAccommodationConfig.updatedAt` stays a stay-window write timestamp but must never be read as a pricing boundary again; `resolveOrderAccommodationConfirmation` (3589) reads the setup row. Never introduce a second version field (ARCHITECTURE.md:262).

### Fail-Closed Snapshot Completeness
**Source:** `convex/finance.ts:368-382` + `lib/domain/finance/accommodation-amounts.ts:105-130`.
**Apply to:** confirmation, canonical loader, and the extended `optionLines` shape. Guard accepts v5 AND v6 shapes, throws on confirmed-without-complete-snapshot; never weakens.

### Bounded Event-Scoped Iteration
**Source:** `convex/finance.ts:118-120, 241-246, 304-308, 461-463`; `convex/accommodation.ts:2770-2803`.
**Apply to:** all new loaders/reads. `for await` over indexed queries (never truncated `.take()` for authoritative counts), `.unique()` for singletons, `Promise.all` batch for referenced IDs, event-scoped only. `PENDING_ORDERS_DISPLAY_LIMIT = 50` bounds only the display list, never the count.

### Legacy Dual-Read / Dual-Write
**Source:** `convex/signupCatalog.ts:102-104` (slots), `convex/finance.ts:390-395` (canPrice €0 fallback), restore payload `convex/signupSubmission.ts:291-302`.
**Apply to:** `setupMode: legacy_global | event_owned | uninitialized`; keep `upgradeSelected`/`cotSelected` readable + restore-payload round-trip; dual-write booleans only where an existing consumer requires it. Never rewrite historical orders/snapshots/payments (CONTEXT).

### Tests & Codegen Validation
**Source:** handler harness + three-config matrix (see Tests above).
**Apply to:** every new/edited module. `npx convex codegen` regenerates `_generated/dataModel.d.ts` — widened validators ripple to all consumers (STACK.md:104-107); the backend/data unit must land typecheck-green in one pass.

---

## Anti-Patterns & Hidden Coupling to Flag

1. **Four duplicate option-code union sites** — `schema.ts:535`, `accommodation.ts:2378-2381`, `signupCatalog.ts:26-29`, `publicTracking.ts:342-345`, plus a shared copy in `lib/domain/signup/catalog.ts`. Phase 46 must not add a fifth; the event-owned tables widen to free-string `key` and the consumer unions become the legacy-read path only.
2. **Hardcoded branch residue in two resolvers** — `finance.ts:207-213` and `signupCatalog.ts:435-443` (`code === "superior_upgrade"`/`"cot"`) and the pure module's `categoryCode === "superior"` (`accommodation-amounts.ts:196, 253`). All three must be gone by the end of Phase 46; if any survives, Phase 51's hardcoded-branch sweep (VER-03) will fail.
3. **`isCotEligibilityValid` hardcodes `optionCode === "cot"`** (`accommodation.ts:2535-2543`) — becomes data-driven eligibility on the event option row.
4. **Hidden coupling — `configVersion` source change.** Every existing confirmed row's `configVersion` was recorded as the old `eventAccommodationConfig.updatedAt` (Phase 44). Moving the boundary to `eventAccommodationSetup.updatedAt` is fine for NEW confirms, but the Phase 40 loader's fail-closed check (finance.ts:373-375) only validates "finite positive number" — do not add an equality check against the setup row or every historical confirm breaks. Historical `configVersion` values are opaque tokens.
5. **Hidden coupling — restore payload + selection digests.** If `buildRestorePayload` (`signupSubmission.ts:291-302`) and `digestAccommodationSelections` (`publicTracking.ts:1043-1065`) are not extended with child rows, idempotent retries and no-op detection silently diverge after Phase 46.
6. **Hidden coupling — `ratesByKey` key shape.** `finance.ts:198` and `signupCatalog.ts:407` key rates by `${globalCategoryId}:${occupancy}`. Rekeying `eventAccommodationRates.categoryId` to event categories changes these keys; the `legacy_global` path must preserve global-ID resolution or existing orders re-price.
7. **Anti-pattern — reading global catalog as live config.** `getAccommodationCatalogData` (`accommodation.ts:2614-2622`, `.take(50/100)`) is a seed/template source only. Any Phase 46 consumer that reads `accommodationCategories`/`accommodationOptions` at consumption time reproduces the exact v5 coupling the milestone exists to remove (ARCHITECTURE.md:15, Anti-Pattern 1).
8. **Anti-pattern — a third resolver or a second version field.** CONTEXT "Invariants" + ARCHITECTURE.md:262 forbid it; the shared projection and the setup-row token are the only ones.
9. **Scope tension to resolve at plan time:** ROADMAP Phase 46 scope lists a "copy audit table", but CONTEXT defers provenance audits to Phase 47. Recommend: land the additive table schema in Phase 46 (harmless), but no audit-write mutation until Phase 47 — avoids dead writes.
10. **`v.any()` payload fields** (`ticketTailorWebhookEvents.payload`, etc.) — do not use `v.any()` for the new typed snapshot/ticket-rule shapes; keep `optionLines` and rule rows fully typed (research: "typed snapshot, not an untyped JSON blob").

---

## No Analog Found

| File | Role | Data Flow | Reason / Source of Pattern |
|------|------|-----------|---------------------------|
| `convex/accommodationContext.ts` (new shared loader) | service | request-response | No single existing file does the whole job — it is a merge of two existing resolvers (finance.ts:109-227 + signupCatalog.ts:379-526); pattern sourced from both + ARCHITECTURE.md "Pattern 1" |
| `lib/domain/finance/accommodation-pricing.ts` (new unit registry) | service (pure) | transform | No unit-keyed handler registry exists yet; pattern sourced from CONTEXT "Pricing Units" + pure-module conventions of `accommodation-amounts.ts` / `allocation-payment-state.ts` |
| `convex/accommodation-setup.handlers.test.ts` (new) | test | — | No setup/materialization handler suite exists; harness copied from `accommodation-catalog.handlers.test.ts`, seed fixtures modeled on `tests/convex/phase45-money-integrity.test.ts` `AuditSeed` |

---

## Metadata

**Analog search scope:** `convex/` (schema.ts, accommodation.ts, finance.ts, signupCatalog.ts, signupSubmission.ts, publicTracking.ts, events.ts, init.ts, auth.ts, `_generated/ai/guidelines.md`), `lib/domain/finance/`, `lib/types/signup.ts`, `lib/domain/signup/catalog.ts`, `lib/convex/hooks/accommodation.ts`, `convex/*.test.ts`, `tests/finance/`, `tests/convex/`, vitest configs, `.planning/research/{ARCHITECTURE,STACK}.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, Phase 46 CONTEXT.
**Files scanned:** ~30 source/test/config files (read or grep-targeted; `accommodation.ts` 3962 lines read via targeted sections).
**Pattern extraction date:** 2026-08-06
