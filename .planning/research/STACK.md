# Stack Research

**Project:** Conference Finance Dashboard — v6.0 "Dynamic Event Accommodation"
**Domain:** Flexible event-owned accommodation (reusable hotels/physical rooms, explicit copy/template reuse, dynamic ticket rules/options/pricing, detailed admin UX, signup/track-payment/allocation consumption) on an established Next.js 16 + React 19 + Convex + Clerk + shadcn/ui finance codebase
**Researched:** 2026-08-06
**Mode:** Ecosystem (brownfield stack-dimension analysis)
**Confidence:** HIGH (installed versions verified from `node_modules`; Convex APIs verified via Context7; all integration points read directly from source)

## Executive Finding

**No new runtime dependencies and no platform changes are required for v6.0.** Every capability in the milestone — event-owned accommodation setup, explicit copy/template reuse, dynamic ticket rules/room eligibility/options/pricing units, detailed admin UX, and signup/track-payment/allocation consumption of one event-scoped contract — is achievable with the installed, production-validated stack (Next.js 16.1.7, React 19.2.4, Convex 1.34.0, Clerk 7.0.7, shadcn/ui 4.0.8 + radix-ui, Tailwind 4.2.1, zod 4.3.6, vitest 4.1.0 + convex-test). This mirrors the v5.0 research conclusion, with one important difference: **v5.0 was mostly additive schema; v6.0 is mostly "relax + generalize" of v5.0's own implementation** (see §The Real Stack Work).

The stack work concentrates in three places, in dependency order:

1. **Convex schema + domain layer (backend/data phase):** widen the hardcoded union validators (`accommodationCategories.code`, `accommodationOptions.code`/`kind`/`unit`, `ageBandCode`, `occupancy`, `eventAccommodationAgePricing.rateType`) to data-driven values, add event-owned setup/copy tables (or an ownership flag + copy-record table), add dynamic ticket-rule/eligibility tables (SEED-002 `roomTypeIds` generalization), and refactor the pure pricing module into a **data-driven registry** so money math never hardcodes "superior"/"cot"/"under_3".
2. **Copy/template mutations (backend/data phase):** one atomic Convex mutation per copy action (`ctx.db.insert` loops, verified atomic), reusing the established idempotency + append-only-audit patterns. No workflow engine, no queue, no new infra.
3. **Data-driven admin/public UI (UI/flow phases):** render admin config forms, public signup cards, track-payment editor, and allocation surface **exclusively from server contracts** (`getEventAccommodationConfig`, `getPublicSignupCatalog`/`getPublicSignupAccommodationQuote`, `getTrackPaymentEditContext`, `getRoomAllocationBoard`) — no client-side option-code switches.

The single highest-leverage integration remains the canonical loader (`convex/finance.ts → loadOrderAmountDueBreakdowns` → `lib/domain/finance/accommodation-amounts.ts`); the single biggest rule remains **never compute or render money from client-side option codes** — money flows through the pure module and the loader only.

## Recommended Stack

### Core Technologies (unchanged — preserve, do not upgrade for feature access)

| Technology | Version (installed) | Purpose in v6.0 | Why Recommended |
|------------|---------|-----------------|-----------------|
| Convex | 1.34.0 | Data layer: event-owned setup rows, copy/template mutations, dynamic ticket rules/options, reactive contracts | Already the backend. All v6.0 mechanics verified current via Context7: widening validators is safe schema evolution (a type change is tracked as a union and data integrity is preserved), multi-table writes inside one mutation are atomic, `.withIndex()` + bounded `.take()` remains the correctness pattern. No feature gap. |
| Next.js | 16.1.7 | Data-driven admin workspace tabs + public signup/track-payment rendering | Dynamic segments and client components with Convex hooks already cover every route v6.0 touches; no new route classes needed. `params`/`searchParams` are Promises (await in server pages, `use()` in client components) — established in `app/track-payment/[bookingRef]/page.tsx`. |
| React | 19.2.4 | Data-driven option/rule/rate pickers, copy/template dialogs | Convex `useQuery`/`useMutation` reactivity means a copied/edited setup re-renders automatically. No state library. |
| Clerk | 7.0.7 | Admin-only auth boundary for setup/copy/template mutations | Existing `requireIdentity` + Clerk middleware boundary. Public signup/track-payment stays public (unchanged). |
| shadcn/ui + radix-ui | 4.0.8 CLI / 1.4.3 | Dialog/sheet/select/table/tabs for admin setup + copy UI | All needed primitives already installed (`components/ui/` has dialog, select, table, tabs, sheet, dropdown-menu, alert, badge). No new components required — unlike v5.0, which needed `checkbox`/`radio-group`. |
| Tailwind | 4.2.1 | Styling | Already in place; no change. |
| zod | 4.3.6 | Client-side validation for dynamic config/copy forms | Reuse the existing `components/signup/validation/*` pattern. No new form library. |
| @tanstack/react-query | 5.95.2 | API-route orchestration (already used) | No change. Convex hooks (`lib/convex/hooks/`) remain the frontend access boundary. |
| date-fns | 4.1.0 | Age/date math only if still needed | Already installed; age-band rules become data-driven in v6.0, so date math moves into a pure domain module if used at all. |
| @dnd-kit/react | 0.3.2 | (already installed) legacy drag-drop | Do **not** add drag-drop for the new setup/copy flows. Buyer self-assignment was retired in v5.0; keep allocation board as-is. |

### Development Tooling (unchanged)

| Tool | Purpose | Notes |
|------|---------|-------|
| `npx convex codegen` | Regenerate typed `_generated/` after every schema change | Required per AGENTS.md after any Convex change; v6.0 schema edits touch `_generated/dataModel` (widened unions widen generated types). |
| `npx convex dev --once` | Push schema + validate | Required per AGENTS.md. |
| vitest 4.1.0 (node env) | Pure domain tests (pricing registry, ticket rules, copy-plan projection) | `vitest.config.ts` (`tests/**`, `app/**`, `lib/**`); `vitest.components.config.ts` (adds `components/**/*.test.tsx` — established in Phase 43). |
| convex-test 0.0.52 + @edge-runtime/vm 5.0.0 | Handler-level tests for copy/template mutations, config contracts, quote/eligibility resolvers | `vitest.convex.config.ts` (`convex/**/*.test.ts`, `environment: "edge-runtime"`); precedent: `convex/accommodation-admin.handlers.test.ts`, `accommodation-catalog.handlers.test.ts`, `track-payment-edit.handlers.test.ts`. |
| `npx convex ai-files install` / project `convex/_generated/ai/guidelines.md` | Project-specific Convex API conventions | Followed in this research (validators, bounded `.take()`, no `.filter()`, single-mutation atomicity). |

## The Real Stack Work (v6.0 differs from v5.0 here)

v5.0 built the catalog on **locked literal code unions** that v6.0 must make human-manageable and data-driven. These are the concrete code locations (all verified in source) whose shape the roadmap must change:

### 1. Hardcoded-code inventory (relax in schema, generalize in domain)

| Location | Current (v5.0, hardcoded) | v6.0 direction | Stack mechanism |
|----------|---------------------------|----------------|-----------------|
| `convex/schema.ts` `accommodationCategories.code` | `v.union(standard\|superior\|family)` | event-owned, admin-manageable categories | Widen validator; add `isEventOwned`/`ownerEventId` or move to per-event rows (architecture decision, see Alternatives). |
| `convex/schema.ts` `accommodationOptions.code` + `kind` + `unit` | `v.union(superior_upgrade\|cot)`; `kind` `addon\|upgrade\|eligibility`; `unit` `per_night\|per_person` | data-driven options with admin-defined codes, kinds, units | Widen to `v.string()` (codes become labels/keys, not switch cases); keep `unit` as a domain enum unless "pricing units" must be user-defined too — recommend keeping `unit` as a **typed domain union** and the *registry* of supported units in `lib/domain`. |
| `convex/schema.ts` `ageBandCode` (4 places) | `v.union(under_3\|3_11\|12_17\|18_plus)` | dynamic age bands | Widen to `v.string()` keyed by id; `LOCKED_AGE_BAND_BOUNDS` in `convex/accommodation.ts` moves to seed data, not code. |
| `convex/schema.ts` `occupancy` | `v.union(single\|shared\|family)` | stays a fixed occupancy vocabulary (rooms/capacity semantics) | **Recommend keeping as typed union** — occupancy is a physical property of the established room workflow, not an arbitrary option. |
| `convex/schema.ts` `eventAccommodationAgePricing.rateType` | `v.union(free\|full\|percent\|flat)` | admin-manageable rate types | Keep the 4 known rate types as a typed union; the **handlers** become a registry in `lib/domain/finance` (pure functions keyed by rateType), so adding a rate type later is data+one handler, not a switch sprinkled through code. |
| `lib/domain/finance/accommodation-amounts.ts` | `categoryCode === "superior"`, `upgradeSelected`, `cotSelected`, `ageBandCode` semantics baked into the formula | derive per-option charges from **event config rows** (option × unit × rate), not from named booleans | Refactor `deriveAccommodationAmount` to price from a **resolved option list** (each option: id, unit, priceMinor, eligibility) instead of the three named fields; `AccommodationPriceSnapshot` gains the resolved option lines. This is the biggest domain refactor and must be fully unit-tested before UI touches it. |
| `convex/accommodation.ts` `LOCKED_OPTION_SEMANTICS` (line ~2938) | `superior_upgrade → { kind: "upgrade", unit: "per_night" }` | seeded defaults, not locked constants | Move to seed/migration data; code reads `kind`/`unit` from rows. |
| `convex/signupCatalog.ts` ticket entitlement | `ticketTypes.roomTypeId` (single FK) | dynamic ticket rules (SEED-002 `roomTypeIds` array or eligibility rows) | Additive: either add optional `roomTypeIds: v.array(v.id("accommodationRoomTypes"))` to `ticketTypes` (guideline: bounded arrays are acceptable for a bounded FK set; a child table is the conservative alternative) or an `eventAccommodationTicketRules` table. Convex supports arrays up to 8192 — a room-type id list is well within bounds and simpler for the signup catalog resolver. |
| `components/dashboard/accommodation/upgrades-options-*` | renders `option.code`, `option.kind`, `option.unit` strings | render from contract fields; admin edits codes/kinds/units in place | No new component library; forms are zod-validated client forms posting to existing upsert mutations. |

**Convex schema-evolution mechanics (verified via Context7):** adding tables and optional fields is always safe; modifying a field type is tracked by Convex as a union (e.g., `v.union(v.number(), v.string())`), preserving data integrity — so **widening a literal union to `v.string()` is non-destructive for existing rows** (existing literal values still validate). `npx convex codegen` will widen the generated `_generated/dataModel` types, and the code locations above must be updated in the same change set (they typecheck against the widened types only after the domain refactor). Do not attempt to *narrow* any validator.

### 2. Copy/template reuse — pure Convex, no new infra

- **Mechanism:** one `mutation` per action (`copyAccommodationSetupFromEvent` / `applyAccommodationTemplate`). Reads the source event's full setup (config, rates, options, resources, age pricing, ticket rules, and — per the locked decision — the reusable hotel/room/room-type links stay event-linked, not deep-copied) and inserts the target event's rows in the same transaction. Verified via Context7: **all DB writes in one mutation are atomic**; the existing `createRooms` mutation (loop of `ctx.db.insert`) is the in-repo precedent.
- **Idempotency + audit:** reuse the `orderIdempotency` pattern (key + fingerprint + expiry) and the append-only audit-row pattern from `orderAccommodationEditAudits` (server-valued fields, `by_*_and_*` indexes). A copy action needs its own audit table (e.g., `accommodationSetupCopyAudits` or a generic `accommodationSetupChangeAudits`) if the milestone requires a change log; `log.audit` from `convex/server` is also available but the project's established convention is table-based audit rows.
- **Template model:** a template is a **named snapshot of an event's setup** (a `accommodationSetupTemplates` table: `name`, `sourceEventId`, `snapshotAt`, `snapshot` as rows or a deep-copied row set) or simply "copy from another event". Recommending: **copy-from-event first** (no new table needed beyond a copy audit), templates table only if the roadmap wants named reusable presets — a phase decision, not a stack decision.
- **Transaction size:** a full setup copy is on the order of tens of rows (config 1 + rates ≤ ~50 + options ≤ ~20 + resources ≤ ~20 + age pricing ≤ ~10 + ticket rules ≤ ~10) — far below Convex transaction limits. No batching/scheduling needed (guideline: batch + `ctx.scheduler.runAfter(0, ...)` only if a single transaction would exceed limits — not the case here).
- **Concurrency:** OCC conflicts are natural; the copy mutation should read source rows, then write target rows — two simultaneous copies to the same event are idempotent-if-keyed (reuse idempotency key per copy action) or fail cleanly on a "setup already exists" guard (mirror the singleton `eventAccommodationConfig` initialization behavior in Phase 41).

### 3. Dynamic ticket rules / room eligibility / pricing units

- **Ticket rules:** extend `ticketTypes` (additive optional field `roomTypeIds: v.array(v.id("accommodationRoomTypes"))`) or add `eventAccommodationTicketRules` rows (eventId, ticketTypeId, allowed roomTypeIds / categoryIds / eligibility). The signup catalog resolver (`getPublicSignupCatalog`) and the quote resolver (`resolvePublicSignupSelection`) already centralize entitlement resolution — extend those two choke points, never add a second entitlement source.
- **Pricing units:** keep the `unit` vocabulary typed (`per_night` | `per_person`) but drive charge computation through a **pure registry** (`lib/domain/finance/` maps unit → handler). Adding a unit later = one new handler + seed row; the schema stays a typed union. Do not make `unit` a free string in the DB while money math depends on it — a typo would silently zero a charge.
- **Eligibility rules:** options already carry `eligibilityAgeBandCode` (v5.0) — generalize the *shape* of eligibility (e.g., an `eligibility` object with `ageBandCode?`, `ticketCategoryIds?`, `requiredOptionIds?`) in the event-option rows, and keep **evaluation in the server resolver** (Phase 42 pattern: quote + submission share one resolver so eligibility can never diverge).

### 4. Canonical finance / allocation contract — unchanged boundary

`loadOrderAmountDueBreakdowns` → `deriveAccommodationAmount` (now data-driven) remains the single money choke point; allocation continues to consume `loadOrderAmountDueBreakdowns` + `loadMatchedPaymentTotalsByOrderId` + the pure `allocation-payment-state.ts`. v6.0 **changes the pricing inputs** (option rows instead of named booleans), not the loader contract. Confirmed-row pricing must keep using the immutable `priceSnapshot` (now including resolved option lines) so copy/template edits never retroactively re-price confirmed orders.

## What to Reuse (already in the codebase — do not rebuild)

| Asset | Location | Reuse for |
|-------|----------|-----------|
| Typed Convex access boundary | `lib/convex/hooks/accommodation.ts`, `lib/convex/api.ts` | Add `useCopyAccommodationSetup`, `useEventAccommodationSetup` hooks alongside existing ones |
| Workspace tab pattern | `lib/dashboard/workspace-routes.ts` (`accommodationTabs`) | The detailed admin UX lives in the existing Accommodation workspace; add a "Setup" / "Copy" tab or dialog without new routing infra |
| Server-owned admin contract | `convex/accommodation.ts:getEventAccommodationConfig` (bounded projection, per-ID catalog resolution, pending-impact fields) | Model for the v6.0 setup contract incl. copy-preview (what will be copied, what already exists) |
| Server-owned public contract | `convex/signupCatalog.ts:getPublicSignupCatalog` + `getPublicSignupAccommodationQuote`; shared resolver `resolvePublicSignupSelection` | Signup/track-payment consumption of dynamic rules; quote must price from the new data-driven registry |
| Public-edit security stack | `lib/domain/track-payment/edit-token.ts`, `lib/rate-limit.ts`, honeypot, `orderAccommodationEditAudits`, replace-style idempotent mutation (`convex/publicTracking.ts:updateAccommodation`) | Template for copy/template mutation security (admin-only here, so ownership gate = `requireIdentity`, but idempotency + audit still apply) |
| Pure money module | `lib/domain/finance/accommodation-amounts.ts` | Refactor point (see §1) — keep it pure, keep `isCompleteAccommodationPriceSnapshot` fail-closed behavior |
| Admin config UI | `components/dashboard/accommodation/upgrades-options-config-form.tsx`, `upgrades-options-catalog.tsx` | Data-driven generalization of these editors; reuse zod validation + server-upsert pattern |
| Handler-level tests | `convex/accommodation-admin.handlers.test.ts`, `accommodation-catalog.handlers.test.ts`, `accommodation-paid-priority.handlers.test.ts`, `track-payment-edit.handlers.test.ts` | Test harness (convexTest + schema + `import.meta.glob`) for copy/template + widened-validator coverage |
| Convex component | `@convex-dev/resend` (only component) | Unchanged; do not add components unless a real need appears |

## Backend / Frontend Boundary Implications

- **Every value that can drift (money, availability, eligibility, pricing-unit math) is computed server-side.** The UI receives resolved lines/cards from contracts (`getEventAccommodationConfig`, `getPublicSignupCatalog`/`Quote`, `getTrackPaymentEditContext`, `getRoomAllocationBoard`). "Data-driven admin/public cards" means *the card shape is generated from the catalog response*, not that the client interprets codes.
- **Copy/template actions are mutations with server-side source reads** — the client passes only `sourceEventId`/`targetEventId` (+ optional overrides), never the row payloads; the mutation reads the source, validates, and inserts. This keeps the copy authoritative and auditable, and lets the same mutation power "copy from event" and "apply template".
- **Widened validators widen generated types**: `convex/codegen` output changes ripple to `signupCatalog.ts`, `accommodation.ts`, `publicTracking.ts`, and the pure module. The backend/data phase must land schema + domain refactor + contract changes **as one typecheck-green unit** before any UI phase begins (the UI phase then consumes the widened contract).
- **Admin UX for dynamic rules**: the detailed admin setup surface is a client form over `getEventAccommodationConfig` + upsert mutations — the existing pattern. New copy/template UI is a dialog (reuse `components/ui/dialog` + `select`); no new primitives.

## Test Tooling (no new tooling)

| Test layer | Runner/config | v6.0 coverage |
|------------|---------------|---------------|
| Pure domain (pricing registry, ticket-rule evaluation, eligibility, copy-plan projection) | vitest node (`vitest.config.ts`, `lib/**/*.test.ts`) | `lib/domain/finance/accommodation-amounts.test.ts` refactor; new `lib/domain/accommodation/` tests for ticket-rule + eligibility evaluation and copy-plan projection |
| Handler-level (copy/template mutations, widened contracts, quote/eligibility resolvers, loader wiring) | convex-test, edge-runtime (`vitest.convex.config.ts`, `convex/**/*.test.ts`) | new `convex/accommodation-setup-copy.handlers.test.ts` + extended catalog/admin/paid-priority suites; idempotency + audit-row assertions; OCC/conflict tests |
| Component-level (data-driven cards, admin setup form, copy dialog) | vitest node + `vitest.components.config.ts` (`components/**/*.test.tsx`) | extended from the Phase 43 precedent; assert rendering comes from contract fields, not code |
| Route-level (if copy goes through an API route) | vitest node (`app/**/*.test.ts`) | mirror `app/api/track-payment/[bookingRef]/route.test.ts` if an `app/api/dashboard/accommodation/copy` route is added (recommended: call the Convex mutation directly from the client via `useMutation`, matching the admin workspace pattern — no new API route needed) |
| Static source audit | existing `tests/finance/phase45-money-integrity.test.ts` style | extend to assert **no client-side option-code switches** remain (grep-audit tests) |

Run matrix (established): `npm test` (node suites) + `npx vitest run --config vitest.convex.config.ts` + `npx vitest run --config vitest.components.config.ts` + `npm run typecheck` + `npm run build` + `npx convex codegen` + `npx convex dev --once`.

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| New runtime libraries (state mgmt, forms, decimal/money libs, ORM, payment SDKs, drag-drop, CMS, workflow engine) | Every v6.0 capability is covered by the installed stack; each addition duplicates an established boundary (Convex hooks, zod + local state, integer minor units, Convex transactions, Tikkie, dnd-kit already present) | Installed stack |
| A separate microservice / API layer for copy/template | Copy is a bounded multi-table insert — one Convex mutation is atomic (verified); a service would break reactive reads and duplicate `accommodation.ts` | Single Convex mutation |
| Convex components (beyond existing resend) for copying/scheduling | Not needed: transaction fits limits; no background work | Direct mutation |
| `@convex-dev/migrations` / stateful migration backfill for the hardcoded-union relaxation | Widening validators is non-destructive without a data backfill; existing rows already satisfy the widened validator | Plain schema edit + codegen |
| Free-string `unit` / `rateType` in the DB while money math switches on them | A typo silently zeroes charges; money semantics must stay typed at the domain boundary | Typed union + pure handler registry in `lib/domain/finance` |
| Client-side interpretation of option codes to build admin/public cards | Violates the server-owned contract rule; duplicates v5.0's Phase 42 "one resolver" guarantee | Render from `getEventAccommodationConfig` / `getPublicSignupCatalog` response shapes |
| Re-introducing buyer room self-assignment or room-level inventory holds | Retired in v5.0 (locked decision); v6.0 keeps buyer-prefers/admin-assigns | Preferences vs placement records stay separate |
| New auth for copy/template (beyond Clerk admin boundary) | These are admin-only, event-scoped mutations; `requireIdentity` + event checks suffice (unlike the public track-payment write) | Existing Clerk boundary |

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Keep global reusable catalog tables + **copy rows into event-owned setup** (copy/template = deep copy + audit) | Live global configuration referenced by events (v5.0 model) | Never for v6.0 — locked decision: "copy/template reuse without live global configuration coupling"; a live link would make one event's edit change others |
| Deep-copy all setup rows per event (config, rates, options, resources, age pricing, ticket rules) | Event-owned rows referencing shared catalog rows (current v5.0 FKs) | If the roadmap wants admins to still share *option definitions* while pricing is per-event — but "event-owned" + "independent setup" points to full copies; **recommend full copies with the catalog tables retained as seed/template sources** |
| Add optional `roomTypeIds` array to `ticketTypes` for dynamic eligibility | Child table `eventAccommodationTicketRules` | Array is simpler and within Convex bounds for a bounded FK set; child table only if eligibility needs extra metadata (e.g., per-ticket occupancy or add-on constraints) — phase decision |
| `accommodationSetupTemplates` table for named presets | Copy-from-event only (no new table) | Add the templates table only if the roadmap requires named reusable presets independent of a live event; **start with copy-from-event** (template = any event's setup) |
| Price from a **resolved option list** in `deriveAccommodationAmount` (per-option rows) | Keep named boolean formula + widen codes | The boolean formula cannot express dynamic options (N options, arbitrary units); the option-list refactor is the only shape that satisfies "dynamic options, pricing units, eligibility rules" while staying pure and testable |
| Widen literal unions to `v.string()` codes | New parallel tables with `v.string()` codes + migrate references | Widening is non-destructive (verified) and keeps existing rows readable; parallel tables force a migration + dual-write window for no benefit |
| Call copy mutation directly from client via `useMutation` | New `app/api/dashboard/accommodation/copy` route | Direct Convex call matches the admin workspace pattern; add an API route only if an external consumer or admin-role proxy is required (none identified) |

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| convex@1.34.0 (installed) | next@16.1.7, @clerk/nextjs@7.0.7 | Current combination runs in production; schema evolution (widening validators, additive tables/fields) and single-mutation atomicity verified via Context7 against current Convex docs — no version bump needed. |
| next@16.1.7 | react@19.2.4 | Dynamic routes + client components already proven (`app/track-payment/[bookingRef]/page.tsx`); async `params` pattern established. |
| shadcn@4.0.8 CLI | radix-ui@1.4.3 | All UI primitives v6.0 needs are already installed; no `npx shadcn add` expected (contrast v5.0's checkbox/radio-group). |
| zod@4.3.6 | react@19.2.4 | Reuse for config/copy form schemas; note widened contract types mean zod schemas derive from `_generated/dataModel` types. |
| vitest@4.1.0 + convex-test@0.0.52 + @edge-runtime/vm@5.0.0 | — | Existing three-config matrix is the full test tooling; no additions. |

## Implications for Phase Structure (backend/data vs UI/flow)

The research supports a **backend/data phase first, then UI/flow phases**, because the widened schema + pure-domain registry + contract changes must be one typecheck-green unit before any UI can consume them, and because copy/template is a backend capability that the admin UX merely invokes.

**Backend/data phase(s) — deliver first:**
1. **Schema + domain generalization:** widen the hardcoded unions (`categories.code`, `options.code`, `options.kind`, `ageBandCode`; keep `occupancy`/`unit`/`rateType` typed), add optional `ticketTypes.roomTypeIds` (or ticket-rules rows), add event-owned setup markers + `accommodationSetupCopyAudits`; refactor `lib/domain/finance/accommodation-amounts.ts` to the resolved-option-list pricing model with snapshot extension; update `convex/accommodation.ts` (`LOCKED_OPTION_SEMANTICS`, `LOCKED_AGE_BAND_BOUNDS` → seed data), `signupCatalog.ts`, `publicTracking.ts`, `finance.ts` loader wiring. Gate: codegen + typecheck + full test matrix green with no UI change.
2. **Copy/template + dynamic-rules backend:** `copyAccommodationSetupFromEvent` (atomic deep copy, idempotency key, audit row, "setup exists" guard), template application if scoped, ticket-rule + eligibility evaluation in the shared resolver, contract extensions (`getEventAccommodationConfig` returns copy-source/template options + preview; catalog/quote return dynamic rules). Gate: convex-test suites (atomicity, idempotency, audit immutability, widened-validator compat, copy-then-edit isolation).

**UI/flow phase(s) — after the backend contract is locked:**
3. **Admin setup UX:** generalize `upgrades-options-config-form.tsx`/`upgrades-options-catalog.tsx` to data-driven codes/kinds/units + dynamic ticket rules; add copy/template dialog (source picker, preview, confirm, audit status) reusing `components/ui/dialog` + `select`; render exclusively from `getEventAccommodationConfig`. Gate: component tests asserting contract-driven rendering (no code switches).
4. **Public signup + track-payment consumption:** render option/rule cards and quotes from the widened `getPublicSignupCatalog`/`getPublicSignupAccommodationQuote`; track-payment editor prices from the same resolver. Gate: quote + submission resolver tests (eligibility can't diverge), component tests.
5. **Allocation + verification:** allocation continues to consume the canonical loader (unchanged boundary); verification extends the Phase 45 cross-surface money matrix + source-audit to the new pricing model (no client money, confirmed-order snapshot immutability across copy/template edits, no divergence).

**Phase ordering rationale:** schema + domain must precede copy/template (copy copies the new rows); copy/template must precede admin UX (the dialog invokes the mutation); admin config must precede public consumption (buyers see event-owned dynamic config); allocation/verification last (consumes everything). Risk-front-loading: the money-integrity refactor (option-list pricing) and the copy-idempotency guarantees are the two highest-risk items and both land in the backend/data phase with dedicated test gates.

**Research flags for phases:**
- **Backend/data phase 1:** decide copy semantics — full deep-copy rows vs event-owned rows referencing shared catalog (recommend full copies, catalog retained as seed source); decide `roomTypeIds` array vs child table for ticket rules; confirm `unit`/`rateType` remain typed unions with pure handler registries.
- **Backend/data phase 2:** copy idempotency + OCC conflict behavior ("setup exists" guard vs last-writer-wins); audit table shape; whether templates need a named table or copy-from-event suffices.
- **UI phase 3:** copy/template dialog UX (source picker preview — show what will be copied and what already exists on target); whether "copy" must be undoable (recommend audit-only, no eager revert).
- **UI phase 4:** legacy `slots`-based signup coexistence remains an open v5.0 flag (Phase 42) — v6.0 dynamic rules must not force the legacy flow off before its migration window is decided.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Installed versions verified from `node_modules`; Convex schema-evolution + mutation-atomicity guidance verified via Context7; no new dependency identified |
| Features | HIGH | Feature-shape conclusions grounded in the locked PROJECT.md decisions and v5.0 execution records; ecosystem comparison not needed (brownfield) |
| Architecture | HIGH | Every integration point (loader, resolvers, hooks, workspace tabs, audit pattern) read directly from source; data-model direction flagged as phase decisions |
| Pitfalls | HIGH | Hardcoded-code inventory verified line-by-line in schema/domain/UI; prevention mirrors v5.0's proven patterns (server-owned contracts, snapshot at confirm, one resolver) |

## Sources

- **Context7 (HIGH):** `/llmstxt/convex_dev_llms-full_txt` — schema philosophy (widening validators tracked as unions, safe additive changes), batch-mutation atomicity, bounded `.take()`/no `.filter()`, audit logging (`log.audit`), migration component existence, array bounds (8192), 1MB doc limit.
- **Installed versions (HIGH):** `node_modules/*/package.json` — next 16.1.7, react 19.2.4, convex 1.34.0, @clerk/nextjs 7.0.7, shadcn 4.0.8, radix-ui 1.4.3, tailwindcss 4.2.1, zod 4.3.6, @tanstack/react-query 5.95.2, vitest 4.1.0, convex-test 0.0.52, @edge-runtime/vm 5.0.0, @dnd-kit/react 0.3.2, date-fns 4.1.0, lucide-react 0.577.0, @react-email/render 2.0.4, @convex-dev/resend 0.2.3.
- **Codebase (HIGH — direct source):** `convex/schema.ts` (all catalog/config/selection tables + hardcoded unions), `convex/accommodation.ts` (`getEventAccommodationConfig`, `LOCKED_OPTION_SEMANTICS`, `LOCKED_AGE_BAND_BOUNDS`, upsert mutations, `confirmAccommodationOrderConfiguration`), `convex/finance.ts` (`loadOrderAmountDueBreakdowns`), `lib/domain/finance/accommodation-amounts.ts` (full pricing formula + snapshot), `convex/signupCatalog.ts` (ticket entitlement resolution), `convex/publicTracking.ts` (`getTrackPaymentEditContext`, `updateAccommodation`), `lib/convex/hooks/accommodation.ts`, `lib/dashboard/workspace-routes.ts`, `components/dashboard/accommodation/*`, `vitest.*.config.ts`, `convex/convex.config.ts`, `convex/_generated/ai/guidelines.md`, `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/research/*` (v5.0), `.planning/seeds/SEED-002`.
- **Project conventions (HIGH):** AGENTS.md (codegen + `dev --once` after Convex changes).

---
*Stack research for: Dynamic Event Accommodation (v6.0) — event-owned setup, copy/template reuse, dynamic ticket rules/options/pricing, data-driven admin + signup/track-payment/allocation consumption.*
*Researched: 2026-08-06*
