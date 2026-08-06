# Project Research Summary

**Project:** Conference Finance Dashboard
**Milestone:** v6.0 "Dynamic Event Accommodation"
**Domain:** Church conference finance — event-owned accommodation configuration, explicit copy/template reuse, dynamic data-driven options/pricing/ticket eligibility, signup/track-payment/allocation consumption of one event-scoped contract (brownfield, established Next.js 16 + React 19 + Convex + Clerk + shadcn/ui codebase)
**Researched:** 2026-08-06
**Confidence:** HIGH for stack/current-state findings (all verified against `node_modules` and source); HIGH codebase-grounded for features/pitfalls; MEDIUM for a handful of target-state design decisions (unit vocabulary, template storage, ticket-rules table shape) flagged for plan-time confirmation

## Executive Summary

v6.0 completes the inversion v5.0 started. v5.0 built a two-layer accommodation model — a **live global reusable catalog** (`accommodationCategories`, `accommodationOptions`, `accommodationAgeBands`) referenced by event-scoped config rows — with hardcoded option codes (`superior_upgrade` | `cot`), fixed category codes (`standard|superior|family`), four locked age bands, and boolean selection flags (`upgradeSelected`/`cotSelected`). v6.0 makes the **commercial configuration event-owned** (deep-copied per event, evolving independently), removes every hardcoded code from schema, domain, and UI, makes options/units/eligibility/ticket rules **data-driven**, and reuses setup between events only through **explicit copy/template actions**. The reusable hotel → physical-room → room-type → capacity inventory workflow is **preserved untouched** as the shared inventory foundation (locked decision).

The recommended approach, consistent across all four research files: **no new runtime dependencies and no platform changes**. Everything is achievable with the installed, production-validated stack (Convex 1.34.0, Next.js 16.1.7, React 19.2.4, Clerk 7.0.7, shadcn/ui 4.0.8, zod 4.3.6, vitest 4.1.0 + convex-test). The work is a "relax + generalize" of v5.0's own implementation: widen literal union validators to `v.string()` (non-destructive schema evolution, verified via Context7), add event-owned tables + a copy/template engine as **one atomic Convex mutation per action**, refactor the pure pricing module into a **data-driven line-item engine** priced from resolved option rows (never from client-side codes), and render all admin/public surfaces **exclusively from server contracts**. The single money choke point (`convex/finance.ts → loadOrderAmountDueBreakdowns → lib/domain/finance/accommodation-amounts.ts`) and the immutable confirmation snapshot stay authoritative — dynamic config must never create a second money or historical-pricing source.

The three highest risks, all addressed in the backend/data phase with dedicated test gates: (1) **copy/template isolation failure** — a shallow copy that shares row IDs with its source would recreate the live-coupling anti-goal; prevention is a deep copy of every event-owned row under the target `eventId` with a bidirectional isolation test. (2) **money-integrity regression during the pricing generalization** — the two hardcoded option branches must become a pure unit-driven line-item engine, unit-tested per unit type, with the fail-closed snapshot completeness guard *extended* (accepting both legacy boolean and new line-item shapes) rather than loosened. (3) **"configured but never rendered"** — the most likely "looks done but isn't" outcome is an admin creating a third option that the signup step and track-payment editor never render because they still do `option.optionCode === "superior_upgrade"` lookups; the fix is a server display contract with generic rendering and a third-option UAT.

## Key Findings

### Recommended Stack

No stack changes. All milestone capabilities are covered by the installed stack, and the v5.0 team already proved the required patterns (server-owned contracts, atomic multi-table mutations, handler-level test harness, workspace tab UX). The real work is schema/domain generalization plus new copy/template mutations — no new libraries, no microservice, no workflow engine, no Convex components beyond the existing resend one.

**Core technologies:**
- **Convex 1.34.0**: data layer — event-owned setup rows, copy/template mutations (all writes in one mutation are atomic, verified via Context7), widened validators (tracked as unions, non-destructive), reactive contracts. No feature gap.
- **Next.js 16.1.7**: data-driven admin workspace tabs + public signup/track-payment rendering; async `params`/`searchParams` pattern already established (`app/track-payment/[bookingRef]/page.tsx`).
- **React 19.2.4**: Convex `useQuery`/`useMutation` reactivity re-renders copied/edited setup automatically; no state library.
- **Clerk 7.0.7**: admin-only boundary (`requireIdentity`) for setup/copy/template mutations; public signup/track-payment stays public.
- **shadcn/ui + radix-ui 4.0.8/1.4.3**: all needed primitives already installed (dialog, select, table, tabs, sheet, dropdown-menu, alert, badge) — unlike v5.0, no new components required.
- **zod 4.3.6**: client-side validation for dynamic config/copy forms, reusing the existing `components/signup/validation/*` pattern.
- **vitest 4.1.0 + convex-test 0.0.52 + @edge-runtime/vm 5.0.0**: three-config test matrix already covers pure domain, handler-level, and component tests — no additions.
- **@tanstack/react-query 5.95.2 / Tailwind 4.2.1 / date-fns 4.1.0 / @dnd-kit/react 0.3.2**: unchanged; do **not** add drag-drop for new setup/copy flows (buyer self-assignment retired in v5.0).

**The concrete stack work** (dependency-ordered): widen hardcoded unions in `convex/schema.ts` (`accommodationCategories.code`, `accommodationOptions.code`/`kind`, `ageBandCode`; keep `occupancy`, `unit`, `rateType` as **typed unions** — money math must never switch on free strings); move `LOCKED_OPTION_SEMANTICS`/`LOCKED_AGE_BAND_BOUNDS` from code to seed data; add event-owned setup/ticket-rules tables + copy audit; refactor `lib/domain/finance/accommodation-amounts.ts` from named-boolean formula (`categoryIsSuperior`, `upgradeSelected`, `cotSelected`) to a **resolved option-list pricing engine**; extend `AccommodationPriceSnapshot` with data-driven `optionLines`; extend `getPublicSignupCatalog`/`resolvePublicSignupSelection` as the entitlement choke points; one atomic mutation per copy action with idempotency + append-only audit. Run `npx convex codegen` + `npx convex dev --once` after every Convex change (AGENTS.md).

### Expected Features

Feature research splits the milestone into: preserved inventory workflow (table stakes), event-owned commercial setup (the core change), copy/template reuse (the differentiator), and aligned consumption surfaces (signup, track-payment, snapshots, finance, allocation). Full detail in `.planning/research/FEATURES.md`.

**Must have (table stakes, P1):**
- Event-owned setup model: rules, rate matrix, age bands + pricing, generic dynamic options (label, description, unit, price in minor units, eligibility, optional per-option availability), resources, ticket entitlements — all as independent event-owned rows.
- Generic dynamic options with units (`per_night`/`per_person`/... — exact vocabulary is a phase decision) and eligibility; hardcoded `superior_upgrade`/`cot`/category/band codes and boolean selection flags removed end-to-end.
- Canonical finance generalization: pure module prices generic unit-based options; loader + per-attendee maps stay correct; confirmed snapshots remain the single historical money authority.
- Event-owned ticket entitlements (SEED-002): per-ticket → allowed room categories/types, enforced in signup **and** allocation.
- Copy/template actions: explicit, ID-remapped, order-data-free; independent evolution after copy.
- Public signup consumption: data-driven cards, server-quoted, entitlement-gated, generic `option + quantity` selections persisted.
- Track-payment edits + confirmation snapshots: permalink edits against the event-owned contract; `confirmedAt` guard; generalized snapshot shape (legacy shape stays valid).
- Safe archive/delete: reference-checked soft archive; archived rows never affect finance or new signup quotes.

**Should have (differentiators / P2):**
- Template library management (save/name/list/update/delete) — copy-from-event first, named template store after.
- Pending-impact preview polish ("N pending orders will re-price") extended to all dynamic config changes.
- Standard/Superior preserved as recognizable data-driven pricing groups (label + `isSuperior`/upgrade relation in data, not `categoryCode === "superior"`).

**Defer (v6.1+/v7+):**
- Multi-room-type `roomTypeIds` array on `ticketTypes` (capability is delivered event-side via ticket-rules rows; schema break not required).
- Waitlist/pending-intent capture on exhausted inventory; template versioning/update-propagation (rejected: violates independent evolution); bulk spreadsheet import; multi-night/date-range pricing; roommate matching; inline payment capture (breaks the Tikkie-link model).

### Architecture Approach

The architectural thesis is an **inversion**: the event owns a deep copy of its commercial setup; the global catalog becomes a seed/template library; physical inventory stays referenced because it is genuinely shared infrastructure. A copy/template engine materializes independent event-owned setups; a generalized pricing engine (kind × unit, data-driven receipt lines) replaces the two hardcoded branches; the confirmation snapshot and canonical finance loader remain the single money authority. Full detail in `.planning/research/ARCHITECTURE.md`.

**Major components:**
1. **Inventory layer (global, unchanged)** — `accommodationHotels`, `accommodationRooms`, `accommodationRoomTypes`, `accommodationEventHotels`, `accommodationSlots`; referenced (read-only) by event-owned resources and the allocation board.
2. **Template layer (global, seed-only)** — existing catalog tables treated as a library; optional `accommodationSetupTemplates` (named, versioned, typed snapshot); never read live by signup/finance.
3. **Event-owned setup layer (per event, v6.0 core)** — `eventAccommodationSetup` (provenance + single version boundary), event-owned categories/options/age bands/rates/age pricing/resources, `eventTicketAccommodationRules`; one loader `loadEventOwnedAccommodationContext` consumed by every surface.
4. **Copy/template engine** — `copyAccommodationSetup`/`saveAccommodationTemplate`; deep-copies commercial setup only; never copies stay window, orders, selections, snapshots, payments, audits, or assignments; records provenance.
5. **Canonical finance** — `loadOrderAmountDueBreakdowns` → pure pricing engine; snapshot authority for confirmed rows; unconfirmed rows price live from the shared event-owned loader.
6. **Public signup/permalink** — data-driven options from the event-owned loader; server-priced; one shared resolver for quote + submission + edit.
7. **Admin setup editor + Allocation** — Setup tab (data-driven editors, copy/template actions, ticket rules, pending impact); Hotels and Allocation tabs unchanged in behavior; allocation joins entitlements + canonical payment state.

Key patterns: **one event-owned config loader + one money module** (collapse the two existing duplicate resolvers — `loadPublicSignupAccommodationContext` and `loadEventAccommodationContexts`); **single version boundary** (one `updatedAt` token bumped atomically by every config write); **preferences vs placement remain separate records** (option selections vs `assignedRoomId`/`orderAssignments`); **child collections in their own tables** (`orderAccommodationOptionSelections` mirrors `orderTicketSelections`); **fail-closed loaders** and bounded async iteration for authoritative counts.

### Critical Pitfalls

Top 5 from `.planning/research/PITFALLS.md` (16 total, mapped to phases there):

1. **Copy/template isolation failure (shallow copy)** — a copy whose event-owned rows hold the source's row IDs re-creates live cross-event coupling; editing the copy re-prices the source. *Prevention:* deep copy of every event-owned row under the target `eventId`, global catalog IDs preserved (intentionally shared), labels/descriptions snapshotted into the copy, provenance recorded, bidirectional isolation test in verification.
2. **Server/client money authority breaks on the dynamic contract** — the old boolean payload was implicitly safe; a dynamic option list invites client-supplied `priceMinor`/quantity. *Prevention:* keep the v5.0 rule verbatim — server resolves every price from event config by option ID inside the mutation; validators reject monetary args; every option ID validated against the event's enabled set in the same transaction.
3. **Confirmed snapshots not extended for dynamic decisions** — keeping the fixed boolean snapshot shape silently drops dynamic lines on confirmed orders (re-pricing from live config) or loosens the fail-closed guard (€0 pricing). *Prevention:* generalize the snapshot to a self-contained line-item list with an *extended* completeness guard that requires every persisted line fully resolved; the guard must accept both the legacy boolean shape and the new shape.
4. **Ticket eligibility drift** — signup, track-payment edit, and allocation each re-derive "is this ticket allowed this choice" from different sources. *Prevention:* one server-side eligibility resolver (pure function) used by all three surfaces; `ticketTypes.roomTypeId` stays the ticket→room-type anchor; fail closed with an explicit reason when a room type's category is unset.
5. **Generic option rendering forgotten ("configured but never rendered")** — the most likely "looks done but isn't" outcome. *Prevention:* server returns a display contract per enabled option; UI renders all enabled options generically; selection payloads become `Array<{optionId, quantity?}>` validated server-side; third-option UAT.

Also critical: **data ownership confusion** (event-facing saves must never mutate global catalog rows — invariant: *global rows are name-and-shape only, every price/eligibility/enable flag lives in `eventAccommodation*` rows*); **room type vs category conflation** (categories price, room types hold physical inventory, `eventAccommodationResources` counts what an event sells — keep `deriveResourceSellableBeds` fail-closed); **stale config** (single version token on every config write; quote mismatch → re-query or "configuration changed" state); **deletion/archive of referenced rows** (archive, don't hard-delete; block deletion with the "Cannot delete with references" guard pattern); **bounded-read truncation** (`.take(100)`/`.take(200)` on dynamic per-event rows silently drops config — use `for await` bounded iteration, the pattern the finance loader already uses).

## Implications for Roadmap

All four research files converge on the same ordering: **backend/data phases first** (schema + domain generalization, then copy/template engine), **then UI phases** (admin, then public signup/track-payment, then allocation), **then cross-surface verification** — because the widened schema + pure-domain registry + contract changes must land as one typecheck-green unit before any UI can consume them, and because copy/template is a backend capability the admin UX merely invokes. The locked decision that UI phases stay separate from backend/data phases is respected below.

### Phase 1: Backend/Data — Event-owned setup schema + generalized pricing domain (incl. SEED-002 tables)
**Rationale:** Everything reads the event-owned contract, so the data model is the dependency root. Schema must land before copy (copy copies the new rows) and before pricing (money must derive correctly before any surface prices anything).
**Delivers:** Widened validators (`categories.code`, `options.code`/`kind`, `ageBandCode` → data; `occupancy`/`unit`/`rateType` stay typed unions); new event-owned tables (`eventAccommodationSetup` with provenance + single version boundary, event-owned categories/options/age bands, `eventTicketAccommodationRules` per SEED-002, `orderAccommodationOptionSelections` child rows, copy audit table); snapshot `optionLines` extension; **pure pricing engine refactor** (`deriveAccommodationAmount` prices a resolved option list by kind × unit, no named booleans); **shared event-owned loader** (`loadEventOwnedAccommodationContext`) collapsing the two duplicate resolvers; legacy dual-read stubs (setupMode: legacy_global → event_owned, per-event materialization).
**Addresses (FEATURES.md):** event-owned setup model, generic dynamic options, canonical finance generalization, SEED-002 ticket entitlements (schema side).
**Avoids (PITFALLS.md):** #1 (ownership confusion — event-scoped writes never touch global rows), #2 (room type vs category conflation), #6 (pricing units drift — unit-tested engine), #9 (snapshot not extended — dual-shape guard), #12 (legacy orders — additive, legacy shape stays valid), #15 (bounded-read truncation — `for await`).
**Gate:** `npx convex codegen` + `npm run typecheck` + full test matrix green with **zero UI change** (per AGENTS.md: `convex dev --once` after Convex changes).

### Phase 2: Backend/Data — Copy/template engine, eligibility resolver, safe archive
**Rationale:** Requires Phase 1's rows to copy and price; the mutation must be authoritative and auditable before any dialog invokes it.
**Delivers:** `copyAccommodationSetupFromEvent` (atomic deep copy under target `eventId`, idempotency key + fingerprint, `sourceRef` provenance, "setup exists" guard, copy audit rows); `saveAccommodationTemplate`/apply (if the roadmap scopes named templates — see flag); ticket-rule seeding from `ticketTypes.roomTypeId`/`accommodationIncluded`; **one server-side eligibility resolver** shared by catalog/quote/submission/edit/allocation; contract extensions (`getEventAccommodationConfig` gains copy-source/template options + preview; catalog/quote return dynamic rules); reference-checked soft archive/delete mutations.
**Addresses:** copy/template actions, safe archive/delete, SEED-002 enforcement logic.
**Avoids:** #3 (duplicate creation paths — one create contract, idempotent copy), #4 (isolation — deep copy + bidirectional test), #5 (eligibility drift — one resolver), #11 (deletion corruption — archive-only), #13 (provider mapping — explicit "unmapped" state).
**Gate:** convex-test suites (atomicity, idempotency, audit immutability, copy-then-edit isolation, widened-validator compat, archive reference integrity).

### Phase 3: UI — Admin setup UX (Setup tab + copy/template + ticket rules)
**Rationale:** Admin must configure event-owned setup before buyers see it; consumes the Phase 1-2 contracts. Backend contracts are locked by now.
**Delivers:** Data-driven generalization of `upgrades-options-config-form.tsx`/`upgrades-options-catalog.tsx` (codes/kinds/units editable in place, dynamic ticket rules table, age-band editor, rate grid); copy/template **dialog with mandatory preview** (source picker, what will be copied/remapped/reset, what already exists on target, confirm, audit status); pending-impact panel extended to all dynamic changes; archive controls; rendering exclusively from `getEventAccommodationConfig`/`getEventOwnedAccommodationSetup` (no client code switches).
**Addresses:** admin setup UX, copy/template actions, safe archive/delete (UI), pending-impact preview.
**Avoids:** #3/#4 (copy UX is wrapper over Phase 2 mutations), #10 (stale config — version token refresh), #16 (UX dead ends — preview step, honest empty/disabled/exhausted states).
**Gate:** component tests asserting contract-driven rendering (no `optionCode ===` lookups); preview-step UAT.

### Phase 4: UI — Public signup + track-payment consumption
**Rationale:** Buyers consume the event-owned contract the admin now controls; must share the Phase 2 eligibility resolver so quote, submission, and edit can never diverge.
**Delivers:** `AccommodationOptionsStep.tsx` rewritten to render generic data-driven cards from `getPublicSignupCatalog` (kind/unit/price/eligibility, option-agnostic); selection payloads become `Array<{optionId, quantity?}>` persisted via `orderAccommodationOptionSelections` child rows; generalized quote rendering (`getPublicSignupAccommodationQuote`); generalized `TrackPaymentAccommodationEditor` consuming the same resolver + child-row selections; legacy boolean dual-read during transition.
**Addresses:** public signup consumption, track-payment edits + confirmation snapshots.
**Avoids:** #5 (eligibility parity — shared resolver), #7 (generic rendering — third-option UAT), #8 (client money — server resolution, typed rejections), #16 (mid-signup invalidation — v5.0 cot-clearing rule generalized to any option).
**Gate:** quote + submission resolver parity tests (eligibility can't diverge), price-tamper + cross-event-option rejection tests, component tests.

### Phase 5: UI — Allocation alignment
**Rationale:** Depends on entitlements (Phase 2 resolver), payment state (unchanged), and the preserved room workflow; safe to land late.
**Delivers:** `getRoomAllocationBoard` joins the shared entitlement rule so an admin can never place a buyer into a category their ticket does not allow (mismatch warnings); paid-priority + entitlement-aligned assignment confirmed; physical placement machinery (`assignedRoomId`/`orderAssignments`) unchanged.
**Addresses:** allocation alignment (P2), SEED-002 on the board.
**Avoids:** #5 (eligibility parity on allocation), #2 (category/room-type separation preserved).
**Gate:** board entitlement-parity tests; paid-priority regression (Phase 41/44 patterns).

### Phase 6: Verification & cross-surface audit
**Rationale:** Mirrors v5.0 Phase 45 — closes the "looks done but isn't" checklist across every consumer.
**Delivers:** canonical money matrix across all consumers including new option lines; confirmed-order snapshot immutability across copy/template + config edits; legacy boolean-snapshot fixture parity; copy-isolation tests (bidirectional); archive reference-integrity tests; no-client-money static audit (extend `tests/finance/phase45-money-integrity.test.ts` to assert **no client-side option-code switches** remain); hardcoded-code sweep (no `"superior_upgrade"`/`"cot"`/`"under_3"` string branching in UI or domain); hotel/room workflow regression; human UAT.
**Addresses:** the milestone's "looks done but isn't" gate (FEATURES.md launch item 10).
**Avoids:** all PITFALLS #1-16 as regression gates.
**Gate:** full run matrix (node + convex + components + typecheck + build) plus the "Looks Done But Isn't" checklist.

### Phase Ordering Rationale

- **Schema/domain → copy → admin UI → public UI → allocation → verification**: each phase consumes the previous phase's locked contract; this is the dependency chain in all four research files (STACK §Implications, ARCHITECTURE §Roadmap Separation, PITFALLS §Pitfall-to-Phase Mapping, FEATURES §Feature Dependencies).
- **Risk-front-loading**: the two highest-risk items — the money-integrity refactor (option-list pricing) and copy-idempotency/isolation — both land in backend/data phases with dedicated test gates, before any UI exists to mask them.
- **UI/backend separation is a locked decision**: no UI change enters Phases 1-2; no backend contract change happens after Phase 2 (verification may only surface defects).
- **SEED-002 is included by default** (locked decision): ticket rules land in Phase 1 (tables) + Phase 2 (resolver) + Phases 3-5 (surfaces), rather than being deferred.

### Research Flags

Phases needing focused research/decisions during planning:
- **Phase 1:** exact `unit` vocabulary (`per_night`/`per_person` baseline; `per_stay` vs `per_person_per_night` vs `flat` candidates across research files) — must be locked before the pricing engine is written; which table owns the single version boundary (`eventAccommodationSetup.updatedAt` vs `eventAccommodationConfig.updatedAt`); ticket-rules shape (`eventTicketAccommodationRules` with `allowedCategoryKeys` array — recommended, delivers SEED-002 event-side without a `ticketTypes` schema break — vs optional `ticketTypes.roomTypeIds` array); `isSuperior` flag vs per-option delta model for Standard/Superior; percent rate-type rounding conventions (`allocateMinorAmountByWeight`).
- **Phase 2:** named template table (`accommodationSetupTemplates`) vs copy-from-event only (recommend: copy-from-event first; table is P2); copy idempotency + OCC conflict behavior ("setup exists" guard vs last-writer-wins); copy audit table shape.
- **Phase 3:** "Upgrades & Options" tab rename to "Accommodation Setup" and `?tab=upgrades-options` deep-link handling (recommend: keep query param, rename label); copy undoability (recommend audit-only, no eager revert).
- **Phase 4:** legacy `slots`-based signup coexistence remains an open v5.0 flag — dynamic rules must not force the legacy flow off before its migration window is decided.
- **Phase 5:** entitlement enforcement strength on the board (block vs warn) — align with SEED-002.

Phases with standard patterns (skip research-phase):
- **Phase 6:** pure verification; patterns proven in v5.0 Phase 45 (money matrix, static source audit, UAT checklist).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Installed versions verified from `node_modules`; Convex schema-evolution + mutation-atomicity verified via Context7; no new dependency identified |
| Features | HIGH (codebase) / MEDIUM (ecosystem) | Feature shapes grounded in locked PROJECT.md decisions and v5.0 execution records; niche domain has no authoritative external sources |
| Architecture | HIGH (current state) / MEDIUM (target state) | Every integration point read from source; the target-state design (event-owned boundary, template table, dynamic option model) is opinionated synthesis not yet stakeholder-validated |
| Pitfalls | HIGH | Every pitfall verified against current source; prevention mirrors v5.0's proven patterns |

**Overall confidence:** HIGH for what to build and in what order; MEDIUM for a small set of "how" decisions listed under Research Flags.

### Gaps to Address

- **Unit vocabulary** (per_stay vs per_person_per_night vs flat; FEATURES and ARCHITECTURE propose overlapping sets): resolve in Phase 1 planning before the pricing engine is written; keep the locked invariant — `unit` stays a typed domain union with a pure handler registry, never a free string.
- **Named template table vs copy-from-event only**: STACK recommends copy-first, ARCHITECTURE recommends a named table; defer the table to P2 unless a stakeholder requirement demands named presets in v6.0.
- **Ticket-rules table shape**: `eventTicketAccommodationRules.allowedCategoryKeys` (ARCHITECTURE) vs optional `ticketTypes.roomTypeIds` array (STACK alternative); both deliver SEED-002 — confirm which in Phase 1.
- **Single version boundary owner**: two candidate tables; invariant is one boundary, never two.
- **Per-event backfill vs materialize-on-first-save**: recommend per-event materialization; a global sweep risks re-pricing surprises.
- **Provider (Ticket Tailor) mapping surface**: unmapped provider ticket categories/age groups must be visible, not silently null; exact UI shape is a Phase 3 decision.
- **Transition window**: when legacy boolean fields and the `slots` block are finally removed — sequence after v6.0 verification, not during.

## Sources

### Primary (HIGH confidence)
- **Codebase (read directly, 2026-08-06):** `convex/schema.ts`, `convex/accommodation.ts` (validators, `LOCKED_OPTION_SEMANTICS`, `getEventAccommodationConfig`, delete guards), `convex/finance.ts` (`loadOrderAmountDueBreakdowns`, `loadEventAccommodationContexts`), `convex/signupCatalog.ts`, `convex/signupSubmission.ts`, `convex/publicTracking.ts`, `convex/events.ts`, `convex/init.ts`, `lib/domain/finance/accommodation-amounts.ts` (`categoryIsSuperior`, `ACCOMMODATION_LINE_LABELS`, `isCompleteAccommodationPriceSnapshot`), `lib/domain/signup/catalog.ts`, `lib/convex/hooks/accommodation.ts`, `components/dashboard/accommodation/*`, `components/signup/steps/AccommodationOptionsStep.tsx`, `components/track-payment/TrackPaymentAccommodationEditor.tsx`, `vitest.*.config.ts`, `convex/_generated/ai/guidelines.md`, installed `node_modules/*/package.json` versions.
- **Planning docs:** `.planning/PROJECT.md` (v6.0 goal + locked decisions), `.planning/features/dynamic-accommodation/README.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/seeds/SEED-002-ticket-room-eligibility.md`.
- **Context7 (HIGH):** `/llmstxt/convex_dev_llms-full_txt` — widening validators tracked as unions (non-destructive), batch-mutation atomicity, bounded `.take()`/no `.filter()`, `for await` iteration, audit logging, array bounds (8192), 1MB doc limit.
- **Convex official guidelines (HIGH):** `convex/_generated/ai/guidelines.md` — bounded reads, scheduler continuation for bulk writes.

### Secondary (MEDIUM confidence)
- **Archived v5.0 research (2026-08-05, HIGH codebase-grounded):** `.planning/research/v5.0-accommodation-upgrades-options/{FEATURES,ARCHITECTURE,PITFALLS,SUMMARY}.md` — snapshot/permalink/idempotency/paid-priority contracts carried forward.
- **Ecosystem comparison (MEDIUM/LOW, carried from v5.0):** Eventbrite Help, Pretix docs (official); Arrowhead CE (Cru), CampBrain (vendor pages) — no authoritative external source exists for this niche; codebase facts dominate.

---
*Research completed: 2026-08-06*
*Ready for roadmap: yes*
