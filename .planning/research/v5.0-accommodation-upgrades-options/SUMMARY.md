# Project Research Summary

**Project:** Conference Finance Dashboard — v5.0 "Accommodation Upgrades & Options"
**Domain:** Church conference finance system (Convex + Next.js) — priced accommodation catalog, buyer-selects-options/admin-assigns-rooms, booking-ref permalink re-pricing, paid-priority allocation
**Researched:** 2026-08-05
**Confidence:** HIGH (codebase-grounded across all four research files)

## Executive Summary

This is a **finance-trust-first conference management app**: every surface (public tracking, order ledger, payments, reconciliation, reports, allocation) must agree on money. v5.0 turns accommodation from a preference-capture + drag-drop self-assignment flow into a **priced, option-driven catalog**: reusable categories/options/age-bands defined once, event-scoped rates, buyers pick priced options at signup (admin assigns final rooms), and a durable `/track-payment/[bookingRef]` permalink lets buyers change options *before admin confirmation* with automatic re-pricing. The milestone's core promise is that accommodation charges flow into the canonical amount-due so Paid/Outstanding/Reconciliation stay correct.

**The recommended approach requires no new runtime stack.** All four research files converge on the same validated stack (Next.js 16, React 19, Convex 1.34, Clerk 7, shadcn/ui + radix, Tailwind 4, zod, vitest). The work is: (1) an **additive Convex schema** (reusable catalog tables + event-scoped config tables + per-attendee order selection rows — no destructive migrations), (2) a **single canonical derivation choke point** — extend `convex/finance.ts → loadOrderAmountDueBreakdowns` + a pure `lib/domain/finance/accommodation-amounts.ts` helper so every consumer updates automatically with zero consumer changes, (3) a server-page permalink modeled on the existing `/signup/success/[bookingRef]`, and (4) two shadcn components (`checkbox`, `radio-group`). The single highest-leverage integration is extending the canonical amount-due loader once; the single biggest architectural rule is **never recompute money in the UI**.

**The key risks are all money-integrity and access-control risks**, and the research files give a coherent prevention story: (a) **retroactive re-pricing** — live-rate reads would silently re-price confirmed orders; the reconciled position is *live derivation for unconfirmed orders, snapshot at confirmation* (with a `configVersion` boundary), never price snapshots during the pending window; (b) **diverging amount sources** — reconciliation/revenue/auto-match must all migrate to the canonical loader; `orders.totalAmountMinor`'s meaning must be decided explicitly; (c) **stale Tikkie payment links** after re-price break exact-amount auto-match — expire/regenerate links on re-price; (d) **the permalink is the app's first public write** — the booking ref alone (a patterned, non-cryptographic hash) must not authorize edits; gate by booker-email match/edit-token, add rate limiting, idempotent replace-style mutation, and a `confirmedAt` server-side write-guard; (e) **paid-priority allocation** must key on a derived tri-state per-attendee paid-set (never `order.status`, which is unset for internal orders, and never an even-split ledger once per-attendee accommodation charges exist).

## Key Findings

### Recommended Stack

No new runtime libraries. All capabilities are achievable with the installed stack; the "stack work" concentrates in the Convex data layer and a pure finance domain module. Verified against installed versions (`node_modules`) and current docs via Context7.

**Core technologies:**
- **Convex 1.34.0**: data layer for catalog/config/selection tables, reactive queries, `.withIndex()` + bounded `.take()` correctness pattern — already the backend; no feature gap
- **Next.js 16.1.7**: `/track-payment/[bookingRef]` dynamic route — copy the existing `/signup/success/[bookingRef]` server-page pattern (`fetchQuery` from `convex/nextjs`); `params` is a `Promise` (await in server pages)
- **React 19.2.4**: option-selection UI + re-pricing reactivity — Convex `useQuery`/`useMutation` means config-change re-pricing is server-side recompute + automatic re-render; no state library
- **Clerk 7.0.7**: admin "Upgrades & Options" tab auth only; permalink stays public (no auth) — consistent with current `/track-payment`
- **shadcn/ui + radix-ui 4.x/1.4.3**: add only `checkbox` and `radio-group` via `npx shadcn@latest add checkbox radio-group`
- **zod 4.3.6**: client-side validation for options step + permalink edit form — reuse existing `components/signup/validation/*` pattern
- **vitest 4.1.0**: `*.test.ts` siblings for every pure pricing function — how "money never drifts" is enforced
- **@tanstack/react-query 5.95.2 / Tailwind 4.2.1 / date-fns 4.1.0**: no change (date-fns only if age bands derive from birthdate)

**New Convex tables (all additive; integer minor-unit money everywhere):** `accommodationCategories`, `accommodationOptions` (kind: upgrade|cot|resource), `accommodationAgeBands` (reusable catalog) + `eventAccommodationConfig` (event-scoped rates/availability, join table keyed by eventId) + `orderAccommodationSelections` (per-attendee selection snapshot storing *references*, not prices) + extend `accommodationRoomTypes` with optional `description`. Pricing model: **derived, not copied** — `eventAccommodationConfig.priceMinor` overrides catalog default (fallback chain: event config → default); re-pricing on config change is automatic at read time for pending orders. Explicit per-age-band price rows are recommended over hidden multiplier math.

**Do NOT use:** decimal/float money (integer minor units is the invariant), form libraries, Redux/zustand/jotai, new payment SDKs (Tikkie already integrated), server-side sessions for the permalink, vector search, or a separate API layer.

### Expected Features

The milestone forms one coherent model: **accommodation becomes priced line items on the canonical order, and allocation becomes payment-aware.** Buyer picks options → selections persisted → canonical amount-due extended → permalink re-prices pre-confirmation → admin confirms and assigns rooms → allocation highlights paid attendees.

**Must have (table stakes, P1 launch set):**
- Buyers see a live price for every option at selection time (no surprise totals)
- Rate matrix: category × occupancy, per-person-per-night, event-scoped with catalog defaults
- Upgrade priced as a visible delta; cot option gated by age-band eligibility with its own inventory count
- Availability derived from physical room counts × capacity (no separate availability counter)
- Config changes at the booking-ref permalink with re-priced total, gated "before admin confirmation"
- Payment status drives allocation priority (paid highlighted, unpaid grayed)
- Accommodation charges feed canonical amount-due (Paid/Outstanding/Reconciliation stay correct)
- Admin confirmation gates final room assignment (buyer self-assignment at signup is *retired*)

**Should have (differentiators):**
- Booking-ref permalink with self-service config changes before confirmation (ahead of Eventbrite/Pretix, which only allow attendee-info edits)
- Reusable accommodation catalog across events (categories/room types/options/age bands defined once)
- Ticket-driven room eligibility (SEED-002 — `ticketTypes.roomTypeId` already exists in schema)
- Paid-priority allocation with visual states, reusing existing `getRoomAllocationBoard`/`generateAllocationProposal`
- Optional age-band capture (only when cot/children selected); "breakfast included" + descriptive copy

**Defer (v5.1 / v6+):**
- SEED-002 full signup-gating wiring (v5.1 tightening pass once catalog is stable)
- Inventory-exhausted "request/waitlist/pending" capture (v5.1); breakfast/category copy polish (v5.1)
- Roommate matching marketplace, multi-night pricing, inline card payment, admin price overrides, tax/discount engine (v6+ — all deliberately out of scope)

**Anti-features (do NOT build):** buyer drag-drop self-assignment at signup (conflicts with admin-assigns + paid-priority), real-time room-level inventory holds/locking, multi-night date-range rates, freeform per-order admin overrides (breaks canonical derivation), inline payment capture (breaks Tikkie matching model).

### Architecture Approach

This milestone **does not introduce a new subsystem**. It adds one order-scoped record type, a two-layer catalog/config model, and three behavioral changes to existing surfaces. Layered: **Catalog (global, reusable)** → **Event Config (event-scoped rates/availability/enabled options)** → **Order Layer (per-attendee preference selections, mutable until confirmation)** → **Canonical Finance (the single loader)** → consumers (publicTracking, orders ledger, payments, reports, attendees, allocation, Tikkie links). Preferences (`orderAccommodationSelections`) and placement (`orderAssignments`/`assignedRoomId`) are **separate records** and must stay separate.

**Major components:**
1. **Catalog layer** — `accommodationCategories`, `accommodationOptionDefinitions` (kind discriminator incl. age bands), extended `accommodationRoomTypes` (categoryId, description, sortOrder, isActive)
2. **Event config layer** — `accommodationEventConfig` (toggles/policy), `accommodationEventRoomTypeRates` (baseRateMinor, availability per room type), `accommodationEventOptions` (priceMinor, enabled per option) — separate row-per-entity tables, **never nested arrays on one doc** (1MB Convex cap)
3. **Order layer** — `orderAccommodationSelections` (per-attendee, `assignmentState`, `confirmedAt/By`) + child rows `orderAccommodationOptionSelections` (more robust than a bounded array; matches the `orderTicketSelections`/`orderAssignments` child-row precedent)
4. **Canonical finance** — extend `loadOrderAmountDueBreakdowns` (batch event-config loads, per-attendee `amountDueByAttendeeId` map) + pure `deriveOrderAmountBreakdown`; delete the duplicate inline `reduce` total in `signupSubmission.getByBookingRef` (~lines 850-854)
5. **Track payment permalink** — new `app/track-payment/[bookingRef]` (old page becomes lookup/redirect), public `updateOrderAccommodationSelections` mutation, admin `confirmOrderAccommodationSelections` (locks edits + regenerates Tikkie link)
6. **Admin config + allocation** — "Upgrades & Options" workspace tab (third tab beside hotels/allocation); `getRoomAllocationBoard` joins canonical totals via `loadOrderAmountDueBreakdowns` + `loadMatchedPaymentTotalsByOrderId` (reuse, never re-implement payment math)

**Key patterns:** single canonical derivation choke point; preferences vs placement as separate records; dynamic derivation with no price snapshots during the pending window; event-scoped batch reads (no N+1). **Anti-patterns:** price snapshots in selection rows, config arrays in one doc, reusing slots to mean options, UI/duplicate money math, Tikkie link amount ≠ canonical amount-due.

### Critical Pitfalls

Top pitfalls from PITFALLS.md (all codebase-grounded, HIGH confidence), with the research-recommended prevention:

1. **Live rate reads at query time re-price every order retroactively** (confirmed/paid/reconciled orders silently change; "paid" flips to "partial" with no payment event). *Avoid:* prices decided at confirmation — **live config for unconfirmed orders only, snapshot at confirmation** (`priceSnapshotVersion`/`configVersion` on the order; confirmed orders never re-price). This is the reconciled position across all three files (see Gaps).
2. **Two diverging amount sources** — derived amount-due vs stored `orders.totalAmountMinor`: reconciliation/revenue/auto-match silently under-count accommodation. *Avoid:* extend `loadOrderAmountDueBreakdowns` as the one canonical aggregation and **migrate every finance consumer**; decide explicitly what `totalAmountMinor` means post-milestone.
3. **Stale Tikkie links break exact-amount auto-match after re-pricing** — buyer pays old amount, match fails, payment sits `unassigned`. *Avoid:* on re-price, expire/supersede order-level links and regenerate at the current amount (or stop surfacing stale links with an "amount changed" state); match against derived amount-due with multi-payment tolerance.
4. **First public write without an ownership gate** — the booking ref is a patterned, non-cryptographic hash (`BK-` + djb2-derived base-36) and leaks via emails by design; ref-only edits let strangers change others' orders. *Avoid:* gate the edit mutation by booker-email match or per-order edit token (server-side), rate limit, honeypot on the edit form, per-order edit audit trail, and a `canEdit` window closing at `confirmedAt`.
5. **Re-pricing not idempotent / no config-version drift detection** — delta-style edits double-apply on retry/OCC-conflict; edits computed against config v1 commit against v2. *Avoid:* **replace-style mutation** (whole selection set), reuse the `orderIdempotency` pattern, record `configVersion` and staleness-warn ("prices changed, please review").
6. **Re-pricing after payments silently creates donations or flips paid status** — downward re-price auto-classifies the excess as donation (buyer never intended); upward re-price after payment asks for more with no context. *Avoid:* surface the overpayment decision (refund vs donate), show "your total increased by €X" with a new payment link, add re-price-specific reconciliation reasons.
7. **Per-attendee accommodation charges break the even-split attendee ledger** — one upgrade-taking attendee splits the cost across all. *Avoid:* extend `amountDueByAttendeeId` with per-attendee accommodation lines (quantity=1, like tickets) and migrate the ledger + paid-weight allocation to use it.
8. **No admin-confirmation write-guard** — UI-only disabling lets buyers edit after admin assigned rooms. *Avoid:* `confirmedAt`/lock enforced **in the mutation** (throw "locked for changes"), not just hidden in the UI.
9. **Trusting client-supplied prices / unvalidated option IDs** — *Avoid:* mutation accepts only option IDs + attendee keys; server re-reads event config and computes totals (mirror `submitSignupEnvelope`'s ticket validation); typed `OPTION_UNAVAILABLE` errors; availability re-checked atomically inside the edit mutation.
10. **Schema traps** — mixed catalog/event scopes in one table, nested option arrays, string-label references, hard-deleting referenced options. *Avoid:* two-layer tables with typed FKs, child tables, ID refs + label snapshots at confirmation, soft-delete/archive.
11. **Paid-priority keyed on the wrong "paid"** — `order.status`/`normalizedStatus` are never set for internal orders (allocation board is internal-events-only) → everyone grayed. *Avoid:* one derived `isAttendeePaid` helper on per-attendee due-vs-paid maps; **tri-state** (paid/partial/unpaid); precompute the paid-set once per board load.
12. **Bulk eager re-price exceeds Convex transaction limits and rewrites history** — *Avoid:* lazy pricing (unconfirmed orders price from current config on read, no writes; only confirmation writes the snapshot); scheduler-batched only if a finance snapshot is ever required.

**"Looks done but isn't" checklist (from research, for Verification):** double-invoke edit must not change total; stale `status: created` links expired post-edit; confirmed orders immutable after config edit; same order compared across all finance surfaces; ref-only edit rejected; internal-event allocation shows paid; edit-after-assign throws server-side; old `/track-payment` deep links still work; attendee detail outstanding equals that attendee's line items; no silent donation on downward re-price; archive-referenced-option blocked; availability re-checked atomically on edit.

## Implications for Roadmap

Based on combined research (ARCHITECTURE build order + PITFALLS phase mapping + FEATURES dependency graph), 7 phases in dependency order. Finance derivation must exist before selections are priced; admin config before signup can offer options; signup before the permalink can edit them; allocation last.

### Phase 1: Schema & Catalog Foundation
**Rationale:** Every other feature reads from the catalog + event-config data model (FEATURES dependency root). Pure additive schema = zero behavior risk; unblocks everything.
**Delivers:** New tables (categories, options, age bands, event config, order selections), extended `accommodationRoomTypes`, typed FKs, indexes, `npx convex codegen` + `npx convex dev --once`.
**Addresses:** FEATURES "reusable catalog data model" + "event-scoped configuration" (data half).
**Avoids:** Pitfall 10 (mixed scopes, nested arrays, string labels, hard deletes), Pitfall 13 (lazy-pricing shape). **Resolves** the table-naming/child-table discrepancy between STACK and ARCHITECTURE.

### Phase 2: Canonical Finance Derivation
**Rationale:** The single highest-leverage dependency (FEATURES: "extending it once keeps all surfaces correct"). Money must flow correctly before anything can be priced or displayed.
**Delivers:** Pure `lib/domain/finance/accommodation-amounts.ts` + extended `loadOrderAmountDueBreakdowns` (batch event-config loads, per-attendee map), delete inline total in `getByBookingRef`, migrate all finance consumers to the canonical loader, extend `tests/finance/money-model.test.ts`.
**Addresses:** "Accommodation charges feed canonical amount-due" — the milestone's core promise.
**Avoids:** Pitfall 2 (diverging amount sources), Pitfall 7 (even-split ledger). **Requires a decision:** snapshot mechanics at confirmation (see Research Flags).

### Phase 3: Admin "Upgrades & Options" Config Surface
**Rationale:** Public signup cannot offer priced options until admins can set rates/availability without code (FEATURES dependency note: config surface lands before/with signup).
**Delivers:** Third workspace tab (options/upgrades) — CRUD over catalog + event config: rates, upgrade delta, cot price/count, age bands, availability toggles, descriptions; soft-delete lifecycle.
**Addresses:** "Admin Upgrades & Options config surface" (P1).
**Avoids:** Pitfall 13 (no eager re-price — show "N pending orders will re-price" preview), Pitfall 10 (option lifecycle/archive). 

### Phase 4: Signup Catalog & Submission (Options Flow)
**Rationale:** Buyer flow depends on Phases 1–3; replaces the retired `RoomAssignmentStep` drag-drop with an options step.
**Delivers:** Options view in `signupCatalog`, `accommodationSelections` envelope in `submitSignupEnvelope` (validation order: attendees → tickets → accommodation → placement), selection inserts + restore payload, `ReviewSubmitStep` with live prices, email confirmation lists options.
**Addresses:** "Buyer selects options with live pricing" + "order accommodation selections persisted" (both P1).
**Avoids:** Pitfall 11 (availability re-checked in the mutation, atomically for capacity-bearing options; SEED-002 entitlement respected), Pitfall 9 (server-side validation of option IDs).
**Research flag:** SEED-002 signup gating — partial alignment here (single `ticketTypes.roomTypeId`: set ⇒ only that type, unset ⇒ all enabled); full multi-room-type array deferred.

### Phase 5: Track-Payment Permalink (Public Edit + Confirm)
**Rationale:** Depends on canonical derivation (Phase 2) and selections (Phase 4); the app's **first public write** — the most security-sensitive phase.
**Delivers:** `app/track-payment/[bookingRef]` server page (old page → lookup/redirect to preserve deep links), public `updateOrderAccommodationSelections` (replace-style, idempotent, ownership-gated), admin `confirmOrderAccommodationSelections` (locks edits, snapshots prices, regenerates Tikkie link from canonical total), delta surfacing + overpayment decision on the page.
**Addresses:** "Booking-ref permalink with config change + re-price" (P1).
**Avoids:** Pitfalls 1 (snapshot at confirm), 3 (stale Tikkie links), 4 (ownership gate), 5 (idempotency/version drift), 6 (overpayment policy), 8 (confirm write-guard), 9 (server-side pricing).
**Research flag:** **needs dedicated security planning** — gate design (email vs token), rate limiting, honeypot, audit trail; Tikkie regeneration timing decision.

### Phase 6: Allocation Paid-Priority + SEED-002 Alignment
**Rationale:** Depends on canonical totals (Phase 2) and payment state; last because it consumes everything.
**Delivers:** `getRoomAllocationBoard` joins `loadOrderAmountDueBreakdowns` + `loadMatchedPaymentTotalsByOrderId`; tri-state paid-set precomputed once per load; paid-first sorting of unassigned/queue; confirm flow sets the lock; entitlement-mismatch warning badges.
**Addresses:** "Paid-priority allocation" (P1) + SEED-002 alignment.
**Avoids:** Pitfall 12 (wrong "paid" definition — never `order.status`), Pitfall 7 (per-attendee due), Pitfall 8 (confirm flow sets lock), Pitfall 11 (flag-not-regrade semantics).

### Phase 7: Verification & Cross-Surface Audit
**Rationale:** PITFALLS mandates a verification phase for money-integrity and security claims — the "looks done but isn't" checklist.
**Delivers:** Cross-surface amount-due comparison (same order across reconciliation/revenue/ledger/tracking/auto-match), security tests (ref-only edit rejected, price-tamper rejected, edit-after-confirm throws), idempotency double-invoke test, config-edit-after-confirm immutability test, stale-link UAT, internal-event paid UAT, per-attendee ledger sum test.
**Avoids:** Every pitfall's verification gate; also the documented recovery strategies (PITFALLS §Recovery) if any regressions surface.

### Phase Ordering Rationale
- **Dependency-driven:** catalog/config → finance → admin config → signup → permalink → allocation. Money must be derivable before it can be priced or shown; the permalink edit requires both selections and canonical derivation.
- **Architecture-aligned:** phases follow the layer stack (Catalog → Event Config → Order → Canonical Finance) and each extends the existing choke points (`finance.ts` loader, `signupSubmission`, `accommodation.ts` board) rather than adding new subsystems.
- **Risk-front-loaded:** the two highest-risk items (money integrity in Phase 2, first public write in Phase 5) are explicitly scheduled with their pitfall preventions and verification gates; the milestone's finance promise is verified in Phase 7 before UAT.

### Research Flags

Phases needing deeper research during planning:
- **Phase 2:** the **live-derivation vs snapshot tension** must be resolved as a decision: STACK/ARCHITECTURE favor pure live derivation with `confirmedAt` boundary; PITFALLS Pitfall 1 requires per-line snapshot `priceMinor`/label at confirmation for confirmed orders. Recommended position: live for unconfirmed, snapshot at confirm — but the *mechanics* (per-line snapshot vs order-total snapshot, `configVersion` field placement) need a concrete decision.
- **Phase 5:** first **public write** — needs a security-focused research/design pass (ownership gate mechanism, rate limiting, honeypot reuse, edit audit rows, idempotency via `orderIdempotency`). Also the Tikkie link regeneration timing decision (creation-time vs confirmation-time).
- **Phase 6:** SEED-002 scope decision — single-field `ticketTypes.roomTypeId` alignment now vs the multi-room-type `roomTypeIds` schema change (defer).

Phases with standard patterns (skip research-phase):
- **Phase 1:** additive Convex schema + codegen is fully specified in STACK.md/ARCHITECTURE.md with verified APIs; well-documented Convex patterns.
- **Phase 3:** admin CRUD over existing workspace-tab pattern (`workspace-routes.ts`) — established.
- **Phase 7:** verification checklist fully enumerated in PITFALLS.md.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified from `node_modules`; APIs verified via Context7 (convex, next.js); codebase integration points read directly |
| Features | HIGH | Codebase facts direct; ecosystem patterns MEDIUM (vendor marketing pages: Arrowhead, CampBrain, Pretix docs HIGH, Eventbrite docs HIGH) |
| Architecture | HIGH | Integration points/data flow verified against 8 source files; MEDIUM on new-table naming/shape (design recommendation, not stakeholder-validated) |
| Pitfalls | HIGH | Every pitfall verified against current source; low web-source weight (niche domain, no authoritative external sources) — codebase-grounded |

**Overall confidence:** HIGH

### Gaps to Address

- **Snapshot mechanics at confirmation (live vs snapshot):** STACK/ARCHITECTURE (derive-at-read, `confirmedAt` boundary) vs PITFALLS (snapshot `priceMinor` + label per line at confirmation). Resolve during Phase 2 planning; the two-phase position (live pending, snapshot confirmed) satisfies both.
- **Table naming/shape discrepancy:** STACK names `accommodationOptions`/`eventAccommodationConfig`/`optionIds` array; ARCHITECTURE names `accommodationOptionDefinitions`/`accommodationEventConfig` + `accommodationEventRoomTypeRates` + child `orderAccommodationOptionSelections` table. Structural agreement is high (two-layer, per-attendee rows, typed FKs); reconcile names during Phase 1 — **prefer ARCHITECTURE's child-table shape** (matches `orderTicketSelections` precedent, better for admin adjustment/audit).
- **Age-band pricing semantics:** per-attendee option (assumed) vs occupancy-rate modifier — needs stakeholder confirmation during Phase 3.
- **Legacy slot-based signup coexistence:** options flow new/default, slot flow back-compat for events without config — decide the migration window during Phase 4.
- **`orders.totalAmountMinor` post-milestone meaning:** (a) ticket-only provider snapshot (documented NOT the amount-due) vs (b) kept in sync in the same transaction as selection writes — decide in Phase 2.
- **Tikkie regeneration timing:** creation-time derivation with regeneration on confirmation (recommended) — decide in Phase 5.

## Sources

### Primary (HIGH confidence)
- Codebase reads (all four research files, 2026-08-05): `convex/schema.ts`, `convex/finance.ts`, `convex/signupSubmission.ts`, `convex/signupCatalog.ts`, `convex/publicTracking.ts`, `convex/accommodation.ts`, `convex/payments.ts`, `convex/orders.ts`, `convex/reports.ts`, `convex/attendees.ts`, `convex/tikkie.ts`, `convex/emailActions.ts`, `lib/domain/finance/amounts.ts`, `lib/domain/finance/attendees.ts`, `lib/domain/finance/reconciliation.ts`, `lib/domain/finance/reporting.ts`, `lib/domain/finance/tikkie-templates.ts`, `lib/domain/accommodation/assignments.ts`, `lib/domain/signup/*`, `lib/convex/hooks/*`, `lib/types/signup.ts`, `components/signup/state.ts`, `components/signup/steps/*.tsx`, `app/track-payment/page.tsx`, `app/signup/success/[bookingRef]/page.tsx`, `lib/dashboard/workspace-routes.ts`
- `convex/_generated/ai/guidelines.md` — project-specific Convex API conventions (HIGH)
- Context7: `/llmstxt/convex_dev_llms-full_txt` (indexes, `.withIndex()`, `.take()`, `.paginate()`, validators); `/vercel/next.js` (async `params`, dynamic route segments) (HIGH)
- Installed versions from `node_modules/*/package.json`; latest from npm registry (HIGH)
- `.planning/PROJECT.md`, `.planning/seeds/SEED-002-ticket-room-eligibility.md`, `.planning/codebase/TABLE_RELATIONSHIPS.md`, `.planning/codebase/FINANCIAL_DATA_FLOW.md` (HIGH)
- Pretix product docs (add-on categories, quotas) and Eventbrite Help (order-edit limitations) (HIGH — official docs)

### Secondary (MEDIUM confidence)
- Arrowhead CE (Cru ministry) registration + housing vendor page — payment-before-reservation, one-room-per-paid-registrant, admin assignment, change windows (MEDIUM — vendor marketing)
- CampBrain conference-center inventory/charges page (MEDIUM)

### Tertiary (LOW confidence)
- Cvent/Passkey room-block page, RoomSync roommate matching — used only as anti-feature references (LOW)
- DuckDuckGo event-finance pitfall searches (2026-08-05) — generic marketing content only; no authoritative external sources for this niche (LOW, excluded from findings)

---
*Research completed: 2026-08-05*
*Ready for roadmap: yes*
