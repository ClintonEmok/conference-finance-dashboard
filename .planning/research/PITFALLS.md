# Pitfalls Research

**Domain:** Conference finance dashboard — v6.0 "Dynamic Event Accommodation": replacing hardcoded accommodation options and global-catalog assumptions with flexible event-owned configuration while preserving the reusable hotel and physical-room inventory foundation.
**Researched:** 2026-08-06
**Confidence:** HIGH (codebase-grounded — every pitfall verified against current source: `convex/schema.ts`, `convex/accommodation.ts`, `convex/signupCatalog.ts`, `convex/signupSubmission.ts`, `convex/finance.ts`, `convex/init.ts`, `lib/domain/finance/accommodation-amounts.ts`, `lib/domain/signup/catalog.ts`, `components/signup/steps/AccommodationOptionsStep.tsx`, `components/track-payment/TrackPaymentAccommodationEditor.tsx`, `.planning/PROJECT.md`, `.planning/features/dynamic-accommodation/README.md`, `.planning/seeds/SEED-002-ticket-room-eligibility.md`)

## Executive Context (what the code actually does today)

- **The "hardcoded" surface is a closed union spread across schema, server, and UI.** `convex/schema.ts` locks `accommodationCategories.code` to `"standard" | "superior" | "family"`, `accommodationOptions.code` to `"superior_upgrade" | "cot"`, `accommodationAgeBands.code` to `"under_3" | "3_11" | "12_17" | "18_plus"`, and `orderAccommodationSelections.ageBandCode` to the same union. The same unions are re-declared as `categoryCodeValidator` / `optionCodeValidator` / `ageBandCodeValidator` in `convex/accommodation.ts` (lines ~2373-2391) and `convex/signupCatalog.ts` (lines ~21-26). v6.0 must make these event-owned and dynamic without a destructive migration.
- **Pricing math is hardcoded to the two built-in options.** `lib/domain/finance/accommodation-amounts.ts` derives "superior upgrade" by string-comparing `categoryCode === "superior"` (`categoryIsSuperior`), names receipt lines `"Superior upgrade"` / `"Cot"` (`ACCOMMODATION_LINE_LABELS`), types line kinds as `"accommodation" | "superior_upgrade" | "cot"`, and persists a snapshot with hardcoded decision fields (`categoryIsSuperior`, `upgradeSelected`, `cotSelected`, `ageBandCode`, `cotEligibilityAgeBandCode`). `convex/finance.ts` (`loadEventAccommodationContexts`) resolves only the `"superior_upgrade"` and `"cot"` codes into prices; `convex/accommodation.ts` enforces `LOCKED_OPTION_SEMANTICS` (`cot`=addon/per_night, `superior_upgrade`=upgrade/per_night) and a `EVENT_OPTION_DEFAULT_PRICE_MINOR` of €10.
- **UI rendering is hardcoded to two cards.** `components/signup/steps/AccommodationOptionsStep.tsx` and `components/track-payment/TrackPaymentAccommodationEditor.tsx` look up options by code (`"superior_upgrade"`, `"cot"`) and render exactly two controls. A third event-configured option would never render.
- **Signup submission persists boolean preferences**, not option IDs: `convex/signupSubmission.ts` accepts `{ categoryId, occupancy, upgradeSelected, cotSelected }` per attendee — there is no `optionId` list. Dynamic options therefore need a generalized selection contract.
- **The two-layer model already exists and must be preserved:** global reusable tables (`accommodationHotels`, `accommodationRooms`, `accommodationRoomTypes`, `accommodationCategories`, `accommodationOptions`, `accommodationAgeBands`) plus event-scoped tables (`accommodationEventHotels`, `eventAccommodationConfig`, `eventAccommodationRates`, `eventAccommodationOptions`, `eventAccommodationResources`, `eventAccommodationAgePricing`). Reusable hotels/rooms/room-types stay the inventory foundation; what v6.0 changes is *which config is event-owned and how it is reused* (explicit copy/template).
- **Eligibility is single-room-type per ticket (SEED-002 deferred):** `ticketTypes.roomTypeId` (single optional ref) is resolved to a room type → category (`signupCatalog.ts` `roomTypeCategoryId` / `roomTypeCategoryCode`). Multi-room-type entitlement arrays were explicitly deferred from v5.0.
- **Confirmed orders are snapshot-priced and fail closed:** Phase 44 wrote `confirmedAt` + `configVersion` + a complete `priceSnapshot` on `orderAccommodationSelections`; `isCompleteAccommodationPriceSnapshot` makes the loader throw for a confirmed row without a complete snapshot rather than silently re-pricing.
- **Deletion guards exist only for hotel/room/room-type:** `deleteHotel` blocks hotels with assigned attendees, `deleteRoom` and `deleteRoomType` have analogous guards — but there are **no** delete/archive mutations for catalog categories, options, or age bands, and no archive state for event-owned config rows.

---

## Critical Pitfalls

Mistakes that cause rewrites, finance corruption, or silent data divergence.

### Pitfall 1: Data ownership confusion — event-owned config that reaches into global catalog rows

**What goes wrong:** The milestone's core promise is "event-owned configuration over reusable hotels and rooms." Teams routinely blur this by letting an event's admin UI *mutate* a global catalog row (rename a category/option/age band "for this event"), or by storing event-specific rates/eligibility on the global row instead of the event-scoped row. The result: one event's admin action silently re-prices or re-labels every other event that references the same catalog row — a live cross-event coupling that v6.0 explicitly exists to remove (PROJECT.md: "avoid live global configuration coupling").

**Why it happens:** The schema already keeps the two layers, but the *mutations* are permissive: `updateAccommodationCategory`, `updateAccommodationOption`, and `updateAccommodationAgeBand` accept only ID + label/description and have no event scope — an event-facing editor that reuses these to "tweak" a category will hit the global row. Also `convex/init.ts` seeds catalog rows by **code** (`categoryIdByCode`, `optionIdByCode`), so code strings feel like natural handles to mutate.

**Warning signs:**
- An event-facing save button calls a mutation that takes no `eventId`.
- Same label/code appears with different descriptions across events but shares one row.
- Editing category X in event A changes X's label in event B's admin tab or receipt lines.
- A query returns catalog rows via a table name that has no event-scoped sibling.

**Prevention:** Keep the invariant *"global rows are name-and-shape only; every price, eligibility, and enable flag lives in `eventAccommodation*` rows."* New dynamic config (inventory rules, entitlements, option definitions per event) gets event-owned tables; global catalog mutations stay a separate, clearly-labeled admin surface (v5.0 already splits these in the Upgrades & Options tab — preserve that split). Audit every new mutation: if it has no `eventId` filter and mutates a row that event config references, it is suspect. Name tables `event*` when they are event-owned and never let event-scoped writes touch `accommodationCategories`/`accommodationOptions`/`accommodationAgeBands`.

**Phase to address:** Phase 46 — Event-owned configuration schema + admin setup UX (schema review gate at plan time; enforced by mutation-shape tests).

---

### Pitfall 2: Room type vs category semantics conflation

**What goes wrong:** Two distinct concepts exist today: **categories** (`standard`/`superior`/`family` = pricing/upgrade tiers, `sortOrder`) and **room types** (leaf inventory items with `defaultCapacity`, `count`, `categoryId` — sellable beds = count × capacity). Dynamic event-owned configuration tempts admins (and the data model) to let a "room type" carry pricing or to let a "category" carry inventory. The moment a rate is keyed by room type instead of category, or a sellable-beds derivation reads category capacity instead of `roomType.defaultCapacity`, availability and pricing silently disagree with allocation. The existing code already *refuses* a capacity-1 fallback for room resources (`deriveResourceSellableBeds` throws) — that guard must survive generalization.

**Why it happens:** `ticketTypes.roomTypeId` makes eligibility flow *through* room types, while pricing flows *through* categories; when both become dynamic, it is easy to collapse them into one "accommodation option" concept and lose the physical-room inventory foundation.

**Warning signs:**
- A rate row keyed by `roomTypeId` instead of `categoryId`.
- A room-type editor that lets you change capacity or count and the event's sellable beds change without a resource row.
- Eligibility rules that reference categories while allocation references room types and they diverge.
- `deriveResourceSellableBeds` calls with a capacity fallback "so it doesn't throw."

**Prevention:** Lock the contract: *categories price, room types hold physical inventory, `eventAccommodationResources` counts what an event sells.* Dynamic "upgrade" targets must be defined as category→category upgrades (or an explicit upgrade relation), never as room types. Keep `deriveResourceSellableBeds` fail-closed. If v6.0 introduces dynamic option→resource kinds, map them through `eventAccommodationResources` semantics (room vs cot) rather than inventing a third inventory concept.

**Phase to address:** Phase 46 — Schema/data model (plus Phase F finance verification asserting price/inventory separation).

---

### Pitfall 3: Duplicate creation paths for the same logical entity

**What goes wrong:** v6.0 adds explicit copy/template actions *on top of* existing creation paths (`createAccommodationCategory`, `createAccommodationOption`, `createAccommodationAgeBand`, `createHotel` + `linkHotelToEvent`, `eventAccommodation*` mutations). If both "create fresh" and "create via template" (or "copy from event") are unguarded, the same logical setup can be created twice under different IDs with slightly different rows, and event config can end up referencing the wrong copy. Duplicate hotels already have a real-world precedent (two hotels with the same name in `accommodationHotels`, linked to different events) — the dynamic-config version multiplies this.

**Why it happens:** The existing quick task 260805-287 already preserved *both* the event-facing create flow and the legacy global inventory route; v6.0 keeps preserving legacy paths (PROJECT.md: "Preserve existing deep links") while adding template/copy entry points. Each new entry point is a new way to reach a create mutation.

**Warning signs:**
- Two mutations in the same codebase can create a category/option/rate with identical content but different origins.
- The admin UI has both "New option" and "Copy event X's options" and neither detects near-duplicates.
- Copying an event twice produces two template rows that both get used.
- Seed data (`init.ts`) and an admin-created row conflict on code/label.

**Prevention:** Route every creation through one validated create contract per entity; copy/template are *mutation wrappers* that call the same create logic with a `sourceEventId`/`templateId` tag (for audit + idempotency), not parallel implementations. Give every event-owned config row a `sourceRef` (templateId / copiedFromEventId / seeded) so duplicates are detectable and replay is idempotent (re-copying the same template is a no-op if rows already match). Reuse the existing `orderIdempotency` fingerprint pattern for copy actions.

**Phase to address:** Phase 46 — Copy/template reuse + admin setup UX (idempotent copy contract with `sourceRef`).

---

### Pitfall 4: Copy/template isolation failure — copied config shares live rows with its source

**What goes wrong:** "Explicit copy/template actions reuse accommodation setup between events without live global configuration coupling" (PROJECT.md). The classic failure is a **shallow copy**: the target event's config rows hold the *same IDs* as the source event's event-owned rows (or point at the source event's `eventAccommodation*` rows), so editing the copy re-prices/rewrites the source event, or editing the source silently changes the copy's quoted rates. This is the v6.0 equivalent of Pitfall 1 but between events rather than between layers.

**Why it happens:** Copy implementations naturally copy the *references* (categoryId, optionId, roomTypeId — which are correct, since catalog is global) and then lazily reuse the source's event-owned rows (`eventAccommodationRates` etc.) because they are keyed by `eventId` and are cheap to re-point.

**Warning signs:**
- A copy's `eventAccommodationConfig.eventId` resolves to the source event.
- Two events' configs share a row ID in any `eventAccommodation*` table.
- Editing a copied event's rate changes the source event's pending-order impact count.
- The copy UI shows "rates inherited from Event X" with no snapshot of values at copy time.

**Prevention:** Copy must be a **deep copy of every event-owned row** (config, rates, options, resources, age pricing, and new dynamic entities) under the target `eventId`, with **global catalog IDs preserved** (they are intentionally shared) and **labels/descriptions snapshotted into the copy** so a later global rename doesn't rewrite the copy's admin-facing text. Templates are themselves stored as a distinct artifact (rows with a `template` flag or a separate `accommodationTemplates` table), not as a live event. Add a verification test: mutate the copy → assert zero rows of the source event changed, and vice versa.

**Phase to address:** Phase 46 — Copy/template reuse (deep-copy contract + isolation test in Phase G verification).

---

### Pitfall 5: Ticket eligibility drift — the ticket's room entitlement stops matching signup, edit, and allocation

**What goes wrong:** Eligibility is ticket-driven (`ticketTypes.roomTypeId` → room type → category; SEED-002, with multi-room-type arrays deferred). When eligibility rules become dynamic and event-owned, three consumers — signup step, track-payment edit, allocation board — each re-derive "is this attendee's ticket allowed this accommodation choice?" from a different source. Signup uses `signupCatalog` resolved through `roomTypeId`; allocation uses the same ticket→room-type mapping but the admin board reads `ticketTypes` + `orderTicketSelections`; the permalink edit path re-checks eligibility only if someone remembers to. The result: a buyer selects an option at signup that allocation later rejects, or the edit permalink allows a change signup would have blocked.

**Why it happens:** v5.0 already had this drift surface (Pitfall 11 in the v5.0 research, addressed partially in Phase 42). v6.0 makes the *rules* configurable per event, which multiplies the number of places that must resolve the same rule — each a drift point.

**Warning signs:**
- Signup allows a category the allocation board flags as ineligible for that ticket.
- The permalink edit form offers options filtered by a different rule set than the signup step.
- A ticket's `roomTypeId` points at a room type whose `categoryId` is unset/null (see `accommodationRoomTypes.categoryId` is optional) — eligibility resolution returns "nothing allowed" or "everything allowed" inconsistently.
- Tests assert eligibility in only one of the three surfaces.

**Prevention:** Define **one server-side eligibility resolver** (pure function: `(ticketTypeId, eventId, choice) → allowed/denied + reason`) used by signup catalog, signup submission, track-payment edit, and allocation board. The resolver reads dynamic event rules from one table. `ticketTypes.roomTypeId` remains the ticket→room-type anchor; when its room type's `categoryId` is missing, fail closed with an explicit ineligibility reason rather than silently allowing all. If v6.0 lands the deferred multi-room-type entitlement, that is a schema change that must land *with* the resolver, never before it.

**Phase to address:** Phase 46 — Ticket rules & eligibility (single resolver) + Phase D signup + Phase E track-payment + Phase F allocation all import it.

---

### Pitfall 6: Pricing units and night-inclusion semantics drift when options become dynamic

**What goes wrong:** The pricing formula is hardcoded around three implicit assumptions: (a) the base rate is **per person per night**; (b) the built-in options are **per night** (`LOCKED_OPTION_SEMANTICS` enforces `per_night` for `cot` and `superior_upgrade`; the schema's `accommodationOptions.unit` already carries `per_night | per_person` but the *formula* ignores it); (c) "breakfast included" and "coveredNights = ticket.accommodationIncluded ? eventBaseNights : 0" are baked into `accommodation-amounts.ts`. Dynamic options with a different unit (`per_person`) or a different night-inclusion rule would be priced by the wrong math: a per-person option multiplied by nights, or an "includes first night" option ignored.

**Why it happens:** `deriveAccommodationAmount` takes scalar inputs (`superiorUpgradePriceMinor`, `cotPriceMinor`, `cotEligibilityAgeBandCode`) — it was built for exactly two options. The generalization path of least resistance is to keep passing scalars and special-case each new option code, recreating `LOCKED_OPTION_SEMANTICS` for every new option.

**Warning signs:**
- A new dynamic option's `unit` field (`per_person`) is accepted but the formula charges it per night.
- Receipt line labels fall back to the option's catalog `label` in one surface and the hardcoded `ACCOMMODATION_LINE_LABELS` in another.
- `categoryIsSuperior` string compare survives into the new model (a dynamic upgrade target won't be the literal code `"superior"`).
- Night count and `coveredNights` are derived in more than one place.

**Prevention:** Generalize `accommodation-amounts.ts` into a **line-item engine driven by the option's `unit` and an explicit per-option pricing rule** — the pure function receives `Array<{ optionId, code, kind, unit, priceMinor, eligibility, quantity, appliesToNights }>` and the category/occupancy rate; the engine multiplies `per_night` by nights and `per_person` by attendees, and computes `coveredNights` from the ticket flag exactly once. Keep `ACCOMMODATION_LINE_LABELS` only as default labels resolved at snapshot time (never at read time). Preserve the fail-closed snapshot completeness guard but extend it to a **list of per-line-item resolved decisions keyed by option/category ID** instead of booleans (`categoryIsSuperior`/`upgradeSelected`/`cotSelected` cannot represent arbitrary dynamic options).

**Phase to address:** Phase 46 — Schema (unit-carrying pricing contract) + Phase F finance (pure engine, unit-tested per unit type).

---

### Pitfall 7: Generic option rendering is forgotten — new event-owned options never appear in the UI

**What goes wrong:** v6.0's differentiator is "flexible dynamic options... data-driven admin/public cards without hardcoded option codes" (PROJECT.md). If the admin can create a third option but the signup step and track-payment editor still render exactly the two code-looked-up cards (today: `find(option => option.optionCode === "superior_upgrade")` and `"cot"`), the new option is a silent dead feature: it's configured, priced, even snapshotted — but buyers can never select it. This is the single most likely "looks done but isn't" outcome of the milestone.

**Why it happens:** `AccommodationOptionsStep.tsx` and `TrackPaymentAccommodationEditor.tsx` were written as two fixed cards with rich copy ("A cot is only available for attendees in the… age band"). Rendering N options requires a generic card contract (kind, unit, price, eligibility gating, description) and generic submit payloads — a real refactor, easy to defer.

**Warning signs:**
- The signup catalog type (`PublicSignupCatalogOption.optionCode`) still has a closed union.
- Any component `find`s an option by code before rendering.
- The signup selection payload is still `upgradeSelected`/`cotSelected` booleans rather than an option-ID list.
- Admin config tab can add an option that the "preview signup" shows nothing for.

**Prevention:** The server returns a **display contract** per enabled event option (`optionId`, `label`, `description`, `kind`, `unit`, `priceMinor`, `eligibilityAgeBandCode|null`, `enabled`) and the UI renders all enabled options generically, with eligibility-driven disable/enable states derived from the same server rule (no client-side code checks). Selection payloads become `Array<{ optionId, quantity? }>` validated server-side. Keep the existing option-specific UX (cot eligibility copy) as *content* driven by option `kind`/`eligibility` metadata, not as hardcoded branches.

**Phase to address:** Phase 46 — Signup dynamic consumption (+ Phase E track-payment editor sharing the same generic component).

---

### Pitfall 8: Server/client authority breaks on the new dynamic contract

**What goes wrong:** v5.0 hardened the permalink: server-side pricing only, client amounts rejected, ownership gate, idempotent replace-style edits. v6.0 generalizes selections from `{categoryId, occupancy, upgradeSelected, cotSelected}` to arbitrary option lists. The natural regression: the signup or edit mutation starts accepting client-computed option prices (or `priceMinor` per option), a client-supplied `quantity`, or option IDs without event-scope validation — re-introducing the exact vulnerability v5.0 closed (v5.0 PITFALLS Pitfall 9). Dynamic options make it worse because the set of valid IDs is no longer two known constants, so "validate against the known codes" is impossible — validation must query the event's config.

**Why it happens:** The old boolean selection payload was implicitly safe (booleans carry no money); a dynamic option list *looks* like it should carry prices ("so the server knows what to charge"), and the two-code validation shortcuts no longer work.

**Warning signs:**
- Any selection/option arg in a mutation validator is `v.number()` named `priceMinor` or `amount`.
- Option validation happens client-side only.
- An option ID from another event (or a deleted/archived option) passes validation and is priced.
- The quote displayed at signup and the amount persisted differ (client-computed total used anywhere).

**Prevention:** Keep the v5.0 rules verbatim: **the server resolves every price from the event's config by option ID inside the mutation**; validators accept only `optionId` (+ `quantity` if quantity ever exists), and reject monetary/digest args with typed errors. Every option ID is checked against the event's enabled-option set *in the same transaction* that writes the selection. Reuse the existing `orderIdempotency` pattern and the `orderAccommodationEditAudits` audit rows for the generalized payloads.

**Phase to address:** Phase 46 — Signup submission + Track-payment (Phase E) with a shared server-side option-resolution helper; security tests in Phase G.

---

### Pitfall 9: Confirmed snapshots are not extended for dynamic decisions

**What goes wrong:** Phase 44's snapshot is a fixed shape: `{ baseRatePerNightMinor, upgradeRatePerNightMinor, cotRatePerNightMinor, totalNights, coveredNights, categoryIsSuperior, upgradeSelected, cotSelected, ageBandCode, cotEligibilityAgeBandCode }`, and `isCompleteAccommodationPriceSnapshot` throws for confirmed rows that fail the shape check. If v6.0 adds dynamic options but keeps this fixed shape, one of two failures happens: (a) new options aren't snapshotted, so a confirmed order silently loses those lines on the next read (loader re-prices from live config, corrupting the "confirmed never re-prices" invariant), or (b) the snapshot shape is loosened to tolerate missing fields, weakening the fail-closed guard and letting incomplete snapshots price as €0.

**Why it happens:** The snapshot is the *single* place where dynamic configuration must become immutable at confirmation. Extending it is invasive (schema validator + completeness guard + pricing engine + confirmation writer all touch it), so teams loosen the guard instead of extending the model.

**Warning signs:**
- `isCompleteAccommodationPriceSnapshot` gets relaxed (fields become optional) instead of extended.
- A confirmed order's receipt lines change after an admin edits a dynamic option's price.
- The snapshot stores a list of option IDs but not their resolved unit prices/labels.
- Any surface recomputes a confirmed line from live `eventAccommodationOptions`.

**Prevention:** Generalize the snapshot to a **self-contained line-item list** `{ lines: Array<{ optionId | categoryKey, code, label, unit, pricePerUnitMinor, nights, quantity, chargeMinor }>, totalNights, coveredNights, configVersion }` with an **extended completeness guard that requires every persisted line to be fully resolved** (label + unit + price + quantity). The loader prices confirmed rows *exclusively* from the snapshot lines, never from live config, exactly as today — only the shape generalizes. Keep `configVersion = eventAccommodationConfig.updatedAt` as the boundary.

**Phase to address:** Phase 46 — Schema (snapshot shape) + Phase E track-payment/confirmation (writer) + Phase F finance (loader) + Phase G fail-closed tests.

---

### Pitfall 10: Stale config — consumers read an old version of the dynamic event config

**What goes wrong:** `eventAccommodationConfig.updatedAt` is the `configVersion` boundary, but v6.0 adds *more* event-owned rows (inventory rules, entitlement rules, option definitions). Every consumer (admin tab, signup catalog, track-payment quote, canonical finance loader, allocation board) reads config at different moments; without a consistent versioning/caching story, a buyer's signup quotes option X at €10 while the just-saved admin config says €12, or the pending-order impact count on the admin tab reads a stale config after a save. Stale Tikkie links after re-price (v5.0 Pitfall 3) are the financial expression of the same problem.

**Why it happens:** Config currently lives in ~6 `eventAccommodation*` tables all keyed by `eventId`; v6.0 adds more. There is no single "config document" whose `updatedAt` is atomically bumped, so readers cannot cheaply detect staleness, and the current `configVersion` is only written at confirmation (a point-in-time read, not a live-consistency mechanism).

**Warning signs:**
- A rate edit bumps `eventAccommodationConfig.updatedAt` but a new dynamic rules table has no timestamp and isn't part of `configVersion`.
- Signup catalog response and canonical loader disagree on the same option price within seconds.
- The admin "N pending orders will re-price" count doesn't change after a save until a hard refresh.
- `configVersion` is compared against only one table's `updatedAt`.

**Prevention:** Establish a **single config version token** (one `eventAccommodationConfigVersion` row, or a `configVersion` field bumped atomically by every event-config mutation) that *all* event-config mutations update in the same transaction as their table writes. Public quote responses carry the token; consumers that observe a mismatch re-query or show "configuration changed" state. Keep the confirmation-time `configVersion` snapshot semantics unchanged.

**Phase to address:** Phase 46 — Schema (version token) + Phase B admin UX (impact refresh) + Phase D/E (quote staleness handling).

---

### Pitfall 11: Deletion/archive of dynamic entities corrupts references and history

**What goes wrong:** Today only hotels/rooms/room-types have delete guards; catalog categories/options/age-bands have **no delete or archive mutations**, and event-owned config rows have none either. v6.0's "safe deletion/archive behavior" (features README) must decide what happens when: a category/option used by `eventAccommodationRates`/`eventAccommodationOptions` is deleted; an option referenced by a **confirmed** snapshot line is deleted; an age band used by `eventAccommodationAgePricing` or a cot eligibility rule is deleted; an option is deleted while unconfirmed orders carry selections for it (they must fail closed, not silently drop the line — v5.0's Pitfall 10 note already flagged this).

**Why it happens:** The catalog tables predate event-owned config; deletion was never designed for rows that snapshots reference. The temptation is to hard-delete the catalog row (cheap) and let live reads "resolve" it to null — which is exactly how receipt lines silently vanish and confirmed totals change.

**Warning signs:**
- A delete mutation exists for a table that snapshots or selections reference.
- Catalog "resolution" code does `if (!option) continue` (silently dropping referenced options — this pattern already exists in `convex/finance.ts` Phase B and `convex/accommodation.ts` line ~3711).
- Archive hides rows from new signups but existing selections still display the option with no "unavailable" state.
- Deleting an option leaves `eventAccommodationOptions` rows with dangling `optionId`.

**Prevention:** Use **archive (soft delete) for anything referenceable by selections/snapshots**: archived options/categories are excluded from *new* signup catalogs and admin pickers but remain resolvable for existing selections and confirmed snapshots (snapshots are self-contained anyway; the risk is only unconfirmed rows and label resolution). Block (or archive-with-reason) deletion of a catalog row referenced by any `eventAccommodation*` row. Never hard-delete a catalog row that has snapshot or selection references. The existing `deleteHotel`/`deleteRoomType` "Cannot delete with assigned attendees" guard is the pattern to replicate.

**Phase to address:** Phase 46 — Deletion/archive behavior + admin setup UX + Phase G reference-integrity tests.

---

### Pitfall 12: Legacy orders break under the new dynamic contract

**What goes wrong:** The codebase already distinguishes pre-Phase-42 orders (no `orderAccommodationSelections` rows) via `hasAccommodationSelections`. v6.0 adds more compatibility boundaries: orders confirmed under the *old* snapshot shape (booleans) must keep pricing when the snapshot shape generalizes; orders whose selections reference categories/options that dynamic rules no longer enable must not silently re-price or become unpriceable; internal vs Ticket-Tailor orders differ (`orders.totalAmountMinor` unset for internal, provider-derived for TT).

**Why it happens:** Schema generalization (Pitfall 9) and rule changes (Pitfall 5) naturally break assumptions encoded in old rows. The loader's existing "fail closed on incomplete snapshot" behavior is *correct* — the danger is migrating rows or loosening guards to make old orders "work" again.

**Warning signs:**
- A migration rewrites historical `orderAccommodationSelections` rows.
- Old confirmed rows suddenly price at €0 because the generalized completeness guard can't parse the old boolean shape (guard must accept *both* shapes or backfill intentionally).
- An unconfirmed legacy order has selections referencing a category deleted from the event's active set, and signup/edit paths throw untyped errors at the buyer.
- `hasAccommodationSelections`-style distinction is dropped and empty selection sets are treated as "no accommodation" instead of "pre-dynamic order."

**Prevention:** Treat old rows as **valid historical data, not migration targets**: the generalized snapshot guard accepts the legacy boolean shape as a valid persisted form (read-only compatibility branch), new writes use the generalized shape. Unconfirmed legacy rows keep the v5.0 pricing path (live resolution) — dynamic rules must include a **backward-compat resolution** for `categoryId`/occupancy-only selections (they map to the base rate with no option lines). Keep the "no selection rows" vs "all confirmed" vs "mixed" distinctions intact (admin UI depends on them today).

**Phase to address:** Phase 46 — Schema (compat branches) + Phase F finance loader + Phase G legacy-order fixture tests.

---

## Moderate Pitfalls

Mistakes that cause delays, trust erosion, or technical debt.

### Pitfall 13: Provider (Ticket Tailor) tickets drift from event-owned accommodation rules

**What goes wrong:** TT-synced tickets carry `ticketTypeLabel`, `ticketCategory`, `ageGroup` custom answers, and `ticketTypes.roomTypeId` may be set by sync or admin. Dynamic event-owned rules (entitlements, options, age bands) are resolved from event config + `ticketTypes`, but TT orders arrive via webhook/sync with provider labels that don't match event-configured rules — e.g., a provider ticket category "Family Pass" has no `roomTypeId` mapping, so eligibility resolution returns nothing/blank, or `accommodationIncluded` is unset and coveredNights is 0 for a ticket that actually includes a night.

**Why it happens:** `signupCatalog.ts` resolves ticket→room-type→category through `ticketTypes.roomTypeId`; provider sync (`sync/orders.ts`) maps provider fields onto `ticketTypes`/`ticketTailorAttendees` with heuristics (`normalizedFallbackCount`, custom answers). The mapping layer and the dynamic rule layer are separate and can disagree.

**Warning signs:**
- TT attendees have `ageGroup`/`ticketCategory` in `customAnswers`/`ticketTailorAttendees` that event age-band rules don't map to (only `under_3`/`3_11`/`12_17`/`18_plus` codes exist today).
- A provider ticket with no `roomTypeId` renders no accommodation eligibility and no reason.
- `accommodationIncluded` unset is treated as false while the provider product actually includes a night.
- TT orders never get `orderAccommodationSelections` rows and are invisible to pending-order impact.

**Prevention:** Make the **ticket→rule resolution explicit and auditable**: a per-event "ticket rule" table mapping ticket type (or provider ticket label) → room eligibility + accommodation-included + age-band mapping, seeded from `ticketTypes` and editable in the admin tab; provider `ageGroup`/`ticketCategory` values map through this table with a visible "unmapped" state instead of silent null. Never derive `accommodationIncluded` from provider payload absence — default to the event rule, and surface unmapped provider tickets in the admin tab.

**Phase to address:** Phase 46 — Ticket rules & eligibility (provider mapping surface in admin UX).

---

### Pitfall 14: Signup, track-payment, and allocation consume three different projections of the event config

**What goes wrong:** Signup quotes from `signupCatalog` (server), track-payment re-quotes from the canonical loader, allocation reads `eventAccommodationResources` + `ticketTypes`. When dynamic config grows, each projection is re-implemented and the projections diverge: signup offers an option the canonical loader doesn't price, allocation counts sellable beds differently from signup availability, and the admin tab's impact count disagrees with both. v5.0's hard-won "one canonical derivation" (finance) must extend to *config* derivation, not just money.

**Why it happens:** Each consumer was built against a different slice of the event-config tables (signup → `signupCatalog.ts` reads; finance → `loadEventAccommodationContexts`; allocation → `getEventAccommodationConfig` + resources). Dynamic rules add a third slice without a shared projection.

**Warning signs:**
- Three query functions each build an "event accommodation context" independently (there are already two: `signupCatalog.ts` and `finance.ts`).
- An option's `enabled` flag is checked in one consumer and not another.
- Sellable-bed totals differ between signup availability, allocation board, and admin tab.
- The admin's pending-order impact count uses a different selection definition than the track-payment edit lock.

**Prevention:** Extract **one server-side `loadEventAccommodationView(eventId)` projection** (or a shared internal helper) that all consumers call: config + rules + enabled options + resources + ticket mappings. Finance money math stays pure (`accommodation-amounts.ts`), but the *inputs* to it come from the shared projection. Allocation, signup, and track-payment never re-derive config shape themselves.

**Phase to address:** Phase 46 — shared projection (Schema/data layer) consumed by Phase D/E/F.

---

### Pitfall 15: Bounded Convex reads silently truncate the dynamic config

**What goes wrong:** `getEventAccommodationConfig` uses `.take(200)` for rates, `.take(100)` for options and resources, `.take(50)` for age pricing. v6.0's *dynamic* options/categories/rates per event make these caps plausible to hit (an event with 150 options or 250 rates). A `.take(100)` on options would silently drop the 101st enabled option from the admin tab and from signup — a config-created but never-offered option, with no error. The comment at line ~2676 shows the team already learned this lesson for *catalog* resolution (per-ID reads instead of bounded listings); the same lesson must extend to event-owned rows as they grow.

**Why it happens:** Bounded `.take()` is the Convex correctness pattern (guidelines: "ALWAYS return a bounded collection"), but caps chosen when an event had ~2 options become wrong when options are dynamic. The failure mode is silent truncation, which is worse than an error.

**Warning signs:**
- A dynamic feature's read caps are literal magic numbers with no coupling to the feature's real cardinality.
- A new per-event table uses `.take(n)` without a comment justifying n against growth.
- Admin tab shows fewer options than the database holds (spot-check count vs UI).
- Signup availability is derived from a truncated options list.

**Prevention:** For per-event config, prefer **bounded async iteration (`for await`)** like the finance loader already uses for rates/options — correct at any cardinality with no cap — or raise caps only where a real display bound exists (and return `count` alongside the bounded list, mirroring `pendingOrderCount`/`PENDING_ORDERS_DISPLAY_LIMIT`). Add a test asserting a config with N rows (N > any old cap) round-trips fully through the projection (Pitfall 14).

**Phase to address:** Phase 46 — shared projection (read bounds) + Phase G truncation test.

---

### Pitfall 16: UX dead ends — fresh events, disabled accommodation, and mid-signup changes

**What goes wrong:** The admin tab already handles "fresh event with no catalog rows" by returning the full catalog for initial creation (CR-05 note at line ~2742). Dynamic v6.0 multiplies the empty/unavailable states: an event with accommodation disabled (`events.accommodationEnabled`), an event with no enabled options (v5.0 "no-availability" behavior), a copied template that references archived catalog rows, an option disabled *while a buyer is mid-signup* (v5.0 already clears a selected cot when the eligibility band moves — the same rule must apply to *any* option that becomes ineligible/unavailable mid-flow), and an admin who copies a template and cannot tell what it contains before applying it.

**Why it happens:** Each new dynamic entity adds an empty state and a mid-flow invalidation state; teams handle the happy path and the two known empty states and skip the rest.

**Warning signs:**
- Copy/template UI applies a template with no preview of what it will create.
- Mid-signup, an option disappears with no explanation (v5.0 handles cot-ineligibility but not option-disabled).
- A fresh event's signup shows "no accommodation available" with no admin pointer to configure it.
- Disabled accommodation (`accommodationEnabled: false`) still surfaces accommodation copy in signup or admin tabs.
- No loading/error/empty states on the new dynamic cards (v4.0 QUAL-01 pattern must extend).

**Prevention:** Enumerate the empty/unavailable matrix explicitly (per dynamic entity: fresh, disabled, exhausted, ineligible, archived, mid-flow-invalidated) and give each a deliberate state — v4.0/v5.0 already set the pattern ("honest zero state", WR-01 cot-clearing rule). Copy/template actions require a **preview step** (what rows will be created, which archived references are skipped, which global catalog rows will be shared). Mid-signup invalidation for any dynamic option follows the existing cot rule: clear the selection, explain, allow re-selection.

**Phase to address:** Phase 46 — Admin setup UX (template preview) + Phase D signup (state matrix) + Phase G UX audit.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep the closed unions and add one new option code per need | Tiny diff | Every new option touches schema + validators + pricing + UI — the exact rigidity v6.0 exists to remove | Never in v6.0 |
| Special-case new options in `deriveAccommodationAmount` with extra scalar params | Reuses the proven formula | Formula becomes a switch on option codes; snapshots grow parallel boolean fields (Pitfall 6, 9) | Never — generalize to line items |
| Shallow-copy event config in copy/template | Fast to implement | Live cross-event coupling — the exact anti-goal (Pitfall 4) | Never |
| Hard-delete catalog rows and let reads `continue` past null refs | No guard code needed | Confirmed totals silently change; receipt lines vanish (Pitfall 11; the `if (!option) continue` pattern already exists at finance.ts ~183 / accommodation.ts ~3711) | Never for referenced rows |
| Re-derive the event config view per consumer | No shared refactor | Three projections drift (Pitfall 14) | Never — one projection |
| Keep boolean preferences (`upgradeSelected`/`cotSelected`) and add one boolean per new option | No payload change | N booleans, N validation branches; option lists can't express quantity (Pitfall 7) | Never in v6.0 |
| Store template as a normal event with a flag | One fewer table | Templates accidentally appear in event lists, signup, reports; copy mutates it (Pitfall 4) | Only with hard isolation tests; prefer a separate artifact |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Ticket Tailor sync (`sync/orders.ts`, `ticketTailorAttendees`) | Provider `ageGroup`/`ticketCategory`/custom answers bypass event age-band and option rules | Map provider fields through the per-event ticket-rule table with an explicit "unmapped" state (Pitfall 13) |
| Provider ticket `accommodationIncluded` | Absence of the flag treated as "not included" | Default from the event rule; surface unmapped provider tickets (Pitfall 13) |
| Canonical finance loader (`finance.ts` Phase A/B) | Option/category resolution silently skips deleted rows (`if (!definition) continue`) | Archive, don't delete; fail loudly if a referenced row is missing for a live selection (Pitfall 11) |
| Tikkie payment links | Dynamic re-price leaves stale links with old `amountMinor` | Carry forward the v5.0 rule: links are open flexible payment requests created at €0; on re-price, surface "amount changed" state; never silently mismatch (Pitfall 10) |
| Confirmation email (`sendSignupConfirmation`) | Static ticket-only amount sent once; dynamic option lines not included | Include the confirmed snapshot's line items; the permalink remains the source of truth |
| Legacy `/dashboard/accommodation/inventory` global route | New event-owned setup bypasses it; two hotel/room creation paths persist (Pitfall 3) | Keep the route per PROJECT.md deep-link constraint, but event-facing surfaces must use event-owned flows |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `.take(100)`/`.take(200)` on dynamic per-event config rows | Admin tab and signup silently omit options/rates past the cap (Pitfall 15) | Bounded async iteration for config; bounded list + exact count where a display bound is real | A few hundred dynamic options/rates per event |
| Per-consumer config projection (signup, finance, allocation, admin) | 3-4 near-identical event-config read functions each doing N queries; growth multiplies read cost | One shared `loadEventAccommodationView` projection (Pitfall 14) | As soon as dynamic rules exist |
| N+1 catalog resolution when resolving option definitions per event | Many `ctx.db.get` calls per event across consumers | Batch/cache referenced catalog rows once per projection (finance.ts Phase B already does this — reuse it) | Multi-event consumers |
| Unbounded `.collect()` on selections/orders in new dynamic queries | Read cost grows with attendees; transaction limits in mutations | Keep the existing `for await` bounded-iteration pattern; never copy legacy `.collect()` call sites | Large orders (100+ attendees) |
| Copy action duplicating all event rows in one mutation | Transaction limit failures; partial copies | Batch the deep copy via scheduler (`runAfter` continuation) or per-table bounded batches (Pitfall 4) | Events with many rates/options |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Client-supplied `priceMinor`/`amount`/quantity in dynamic selection payloads (Pitfall 8) | Buyer sets own price | Server resolves all money from event config by option ID; validators reject monetary args (v5.0 rule, keep it) |
| Option IDs accepted without event-scope validation | Cross-event or archived options priced into orders | Validate every option ID against the event's enabled set inside the same transaction as the write |
| Copy/template mutation without idempotency | Double-copy creates duplicate config rows and drift (Pitfall 3) | `sourceRef` + fingerprint pattern reused from `orderIdempotency` |
| Deleting a referenced catalog row (Pitfall 11) | Confirmed orders lose receipt lines; live reads underprice | Archive-only for referenced rows; block deletion with the "Cannot delete with references" guard pattern |
| Loosening `isCompleteAccommodationPriceSnapshot` to fit dynamic options (Pitfall 9) | Incomplete snapshots price as €0 silently | Extend the guard to the generalized line-item shape; never make fields optional without a valid persisted legacy branch |
| `configVersion` staleness accepted in quotes (Pitfall 10) | Buyer pays amount from an older config; admin impact count wrong | Version token on every config write; mismatch → re-query or explicit "configuration changed" state |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| New dynamic option configured but never rendered (Pitfall 7) | Admin "configured" it; buyers can never buy it — invisible dead feature | Generic data-driven cards from the server display contract; option-agnostic UI |
| Copy/template applied without preview (Pitfall 16) | Admin can't predict what will be created; archived references silently skipped | Mandatory preview step before applying a copy/template |
| Option disabled mid-signup with no explanation (Pitfall 16) | Buyer loses a selection and doesn't know why; distrust | Follow the v5.0 cot rule: clear + explain + allow re-selection |
| Fresh/disabled/exhausted events show bare "no accommodation" (Pitfall 16) | Admin doesn't know whether to configure, enable, or wait | Honest state copy with pointer to the config action (v4.0 QUAL-01 pattern) |
| Legacy confirmed orders re-priced after snapshot shape change (Pitfall 12) | Finance totals move without events; invoices disputed | Legacy snapshot shape remains valid (compat branch); never re-derive confirmed rows |
| Admin rate edit blast radius invisible in dynamic options (Pitfall 10) | Admin can't predict pending-order impact across more tables | "N pending orders will re-price" preview extended to all dynamic config changes |

## "Looks Done But Isn't" Checklist

- [ ] **Generic rendering:** Create a third enabled option in admin → it renders on signup and track-payment without code changes (Pitfall 7).
- [ ] **Copy isolation:** Mutate a copied event's rate → zero source-event rows change; mutate source → copy unchanged (Pitfall 4).
- [ ] **Snapshot generalization:** Confirm an order with a dynamic option → later edit that option's price → confirmed order unchanged; `isCompleteAccommodationPriceSnapshot` accepts the new shape (Pitfall 9).
- [ ] **Legacy compat:** A Phase-44-confirmed order (boolean snapshot) still prices identically after the schema change (Pitfall 12).
- [ ] **Server authority:** Selection payload with `priceMinor` or a cross-event option ID is rejected with a typed error (Pitfall 8).
- [ ] **Eligibility parity:** Signup, track-payment edit, and allocation board reject/allow the same ticket×option combinations (Pitfall 5, 14).
- [ ] **Unit correctness:** A `per_person` dynamic option charges per attendee, a `per_night` option per night, both visible in receipt lines (Pitfall 6).
- [ ] **Deletion safety:** Deleting a referenced category/option is blocked or archived; unconfirmed selections referencing it fail closed, not silent-drop (Pitfall 11).
- [ ] **Read bounds:** An event with 250 rates / 150 options round-trips fully through admin, signup, finance (Pitfall 15).
- [ ] **No dead ends:** Fresh event, disabled accommodation, exhausted inventory, archived option, mid-signup invalidation all have deliberate states (Pitfall 16).
- [ ] **Provider mapping:** Unmapped provider ticket categories/age groups are visible in the admin tab, not silently null (Pitfall 13).

## Pitfall-to-Phase Mapping

v6.0 phase clusters (Phase 46 breakdown is TBD at planning time; labels below are the logical phases the roadmap should produce):

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Data ownership confusion (event vs global) | 46 Schema (event-owned tables) + Admin setup UX | Mutation-shape tests: event-scoped writes never touch global catalog rows |
| 2. Room type vs category conflation | 46 Schema (categories price, room types hold inventory) | Finance verification: price × inventory separation invariant |
| 3. Duplicate creation paths | 46 Copy/template + Admin UX (one create contract, `sourceRef`) | Idempotent-copy test; duplicate detection |
| 4. Copy/template isolation | 46 Copy/template reuse (deep copy) | Isolation test: copy edit ≠ source edit (bidirectional) |
| 5. Ticket eligibility drift | 46 Ticket rules (one resolver) | Signup/edit/allocation parity tests (Pitfall 14 cross-check) |
| 6. Pricing units / night inclusion | 46 Schema (unit contract) + Finance (line-item engine) | Unit tests per `unit` type; coveredNights single-source test |
| 7. Generic option rendering | 46 Signup dynamic consumption + Track-payment shared component | Third-option UAT; no code-lookup rendering test |
| 8. Server/client authority | 46 Signup submission + Track-payment (server resolution) | Price-tamper + cross-event-option rejection tests |
| 9. Confirmed snapshots | 46 Schema (snapshot shape) + Finance (loader) | Edit-config-after-confirm test with dynamic option |
| 10. Stale config | 46 Schema (version token) + Admin/quote staleness | Config-version-mismatch re-query test |
| 11. Deletion/archive | 46 Deletion/archive + Admin UX | Reference-integrity test; fail-closed unconfirmed selections |
| 12. Legacy orders | 46 Schema (compat branch) + Finance loader | Legacy-boolean-snapshot fixture test |
| 13. Provider tickets | 46 Ticket rules (provider mapping surface) | Unmapped-provider-ticket visibility UAT |
| 14. Consumer projection divergence | 46 Shared projection (all consumers) | One-order-across-all-surfaces money/config parity test |
| 15. Bounded reads truncation | 46 Shared projection (read bounds) | N-rows-round-trip test (N > old caps) |
| 16. UX dead ends | 46 Admin UX (preview) + Signup (state matrix) | Empty/disabled/invalidated-state UAT walkthrough |

## Sources

- **Codebase (HIGH confidence — read directly, 2026-08-06):** `convex/schema.ts`, `convex/accommodation.ts` (validators, `LOCKED_OPTION_SEMANTICS`, `getEventAccommodationConfig`, catalog mutations, delete guards), `convex/finance.ts` (`loadEventAccommodationContexts`, `loadOrderAmountDueBreakdowns`), `convex/signupCatalog.ts`, `convex/signupSubmission.ts`, `convex/init.ts` (code-seeded catalog), `lib/domain/finance/accommodation-amounts.ts` (`categoryIsSuperior`, `ACCOMMODATION_LINE_LABELS`, `isCompleteAccommodationPriceSnapshot`), `lib/domain/signup/catalog.ts`, `components/signup/steps/AccommodationOptionsStep.tsx`, `components/track-payment/TrackPaymentAccommodationEditor.tsx`, `components/dashboard/accommodation/upgrades-options-config-form.tsx`, `.planning/PROJECT.md`, `.planning/features/dynamic-accommodation/README.md`, `.planning/seeds/SEED-002-ticket-room-eligibility.md`, `.planning/quick/260805-287-*` (event-owned hotel setup precedent)
- **Convex official guidelines (HIGH):** `convex/_generated/ai/guidelines.md` — bounded reads, no `.filter`, `for await` iteration, `.take(n)` caps, 1MB doc limits, scheduler continuation for bulk writes.
- **Prior research (HIGH, superseded at top level by this v6.0 file, preserved in git):** v5.0 PITFALLS.md (2026-08-05) — Pitfalls 1-13 (snapshots, stale links, ownership gate, idempotency, even-split ledger, confirm lock, client prices, schema design, eligibility drift, paid-priority, bulk re-price) whose prevention contracts v6.0 must carry forward.
- **Web (LOW confidence — general, non-authoritative):** no authoritative external sources were found for this niche; all actionable findings are grounded in the codebase, matching the v5.0 research approach.

---
*Pitfalls research for: v6.0 Dynamic Event Accommodation — replacing hardcoded accommodation options/global-catalog assumptions with event-owned configuration over the reusable hotel and physical-room inventory foundation.*
*Researched: 2026-08-06*
