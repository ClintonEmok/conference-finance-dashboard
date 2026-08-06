---
phase: 40-canonical-finance-derivation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/domain/finance/accommodation-amounts.ts
  - tests/finance/accommodation-amounts.test.ts
  - convex/finance.ts
  - convex/signupSubmission.ts
  - convex/tikkie.ts
  - lib/domain/finance/tikkie-links.ts
  - convex/schema.ts
  - convex/publicTracking.ts
  - app/track-payment/page.tsx
  - tests/convex/finance-accommodation.test.ts
  - tests/finance/tikkie-links.test.ts
  - tests/convex/tikkie-matching.test.ts
autonomous: true
must_haves:
  truths:
    - "An order with accommodation selections has one canonical amount-due containing ticket, room-rate, superior-upgrade, and eligible-cot charges, and the per-attendee due map contains the same line amounts."
    - "An order with no accommodation selections, missing accommodation configuration, or legacy ticket data has a zero accommodation contribution and retains its previous ticket-only amount-due."
    - "Unconfirmed selections derive from the current event configuration, while confirmed selections use their stored price snapshot and do not change when the event rate or option price changes later."
    - "Public tracking, signup booking lookup, ledger/payment/reconciliation/reporting/attendee consumers, and Tikkie matching all consume the canonical loader rather than calculating accommodation money independently."
    - "Tikkie matching compares payments against canonical amount-due, while newly created Tikkie links carry a flexible amountMinor of 0 for installments and never derive, regenerate, or re-price from canonical amount-due."
    - "The track-payment Digital Receipt renders optional server-provided accommodation rows only when non-zero lines exist; the browser never sums or derives money."
  artifacts:
    - path: "lib/domain/finance/accommodation-amounts.ts"
      provides: "Pure, minor-unit accommodation pricing and snapshot derivation for per-attendee lines"
      contains: "coveredNights"
    - path: "tests/finance/accommodation-amounts.test.ts"
      provides: "Unit coverage for the locked pricing formula, zero/missing inputs, eligibility, and snapshot immutability"
      contains: "upgrade"
    - path: "convex/finance.ts"
      provides: "Batch canonical amount-due loader folding accommodation into order and attendee breakdowns"
      contains: "loadOrderAmountDueBreakdowns"
    - path: "convex/schema.ts"
      provides: "Additive confirmation/config-version and immutable accommodation price-snapshot fields on selection rows"
      contains: "configVersion"
    - path: "convex/signupSubmission.ts"
      provides: "Booking-reference response using canonical amount-due plus optional server-derived receipt lines"
      contains: "accommodationLines"
    - path: "convex/tikkie.ts"
      provides: "Order-scoped Tikkie creation guard that accepts and stores the flexible zero amount"
      contains: "amountMinor"
    - path: "lib/domain/finance/tikkie-links.ts"
      provides: "Tikkie creation orchestration that validates and sends the flexible zero amount"
      contains: "normalizeAmountMinor"
    - path: "app/track-payment/page.tsx"
      provides: "Digital Receipt rendering for optional accommodation lines without client-side totals"
      contains: "accommodationLines"
    - path: "tests/convex/finance-accommodation.test.ts"
      provides: "Convex integration coverage for legacy, live-config, and confirmed-snapshot totals"
      contains: "getByBookingRef"
    - path: "tests/finance/tikkie-links.test.ts"
      provides: "Creation coverage proving order-scoped links retain flexible amountMinor 0"
      contains: "amountMinor: 0"
    - path: "tests/convex/tikkie-matching.test.ts"
      provides: "Matching coverage proving canonical amount-due remains authoritative"
      contains: "amountDueMinor"
  key_links:
    - from: "convex/finance.ts"
      to: "lib/domain/finance/accommodation-amounts.ts"
      via: "loadOrderAmountDueBreakdowns resolves config/maps and calls the pure helper for each selection"
      pattern: "deriveAccommodation"
    - from: "convex/signupSubmission.ts"
      to: "convex/finance.ts"
      via: "getByBookingRef reads amountDueMinor and receipt lines from loadOrderAmountDueBreakdowns"
      pattern: "loadOrderAmountDueBreakdowns"
    - from: "convex/publicTracking.ts"
      to: "convex/finance.ts"
      via: "canonical payment due remains the source for tracking balance and progress"
      pattern: "amountDueBreakdownsByOrderId"
    - from: "convex/tikkie.ts"
      to: "convex/finance.ts"
      via: "autoMatchTikkiePayments compares candidate payments against canonical amount-due from the loader"
      pattern: "loadOrderAmountDueBreakdowns"
    - from: "app/track-payment/page.tsx"
      to: "convex/signupSubmission.ts"
      via: "renders optional server-provided accommodationLines using formatMoney only"
      pattern: "accommodationLines"
    - from: "convex/schema.ts"
      to: "lib/domain/finance/accommodation-amounts.ts"
      via: "Phase 44 can persist confirmedAt, configVersion, and the helper's immutable priceSnapshot"
      pattern: "priceSnapshot"
---

<objective>
Make accommodation option charges part of the one canonical order amount-due contract while preserving live pre-confirmation pricing and immutable post-confirmation pricing.

Purpose: Paid, Outstanding, reconciliation, reports, attendee detail, public tracking, and payment matching must agree when Phase 42 starts creating `orderAccommodationSelections`. This phase establishes the pure pricing contract and read-time wiring now, including the schema shape that Phase 44's assignment-confirm flow will populate, without building signup option creation, permalink editing, or the Phase 44 confirmation UI.
Output: A tested pure accommodation amount module, a batched canonical finance loader with the duplicate booking lookup removed, a confirmation snapshot contract, canonical Tikkie matching with flexible zero-amount link creation, and the minimal Digital Receipt line rendering required by the approved UI contract.
</objective>

<execution_context>
@~/.opencode/get-shit-done/workflows/execute-plan.md
@~/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/STATE.md
@.planning/phases/40-canonical-finance-derivation/40-CONTEXT.md
@.planning/phases/40-canonical-finance-derivation/40-UI-SPEC.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
@.planning/phases/39-accommodation-catalog-event-config-schema/39-01-SUMMARY.md
@convex/_generated/ai/guidelines.md
@convex/schema.ts
@convex/finance.ts
@convex/signupSubmission.ts
@convex/orders.ts
@convex/publicTracking.ts
@convex/tikkie.ts
@lib/domain/finance/amounts.ts
@app/track-payment/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement and unit-test the pure accommodation pricing contract</name>
  <files>lib/domain/finance/accommodation-amounts.ts, tests/finance/accommodation-amounts.test.ts</files>
  <action> Create a Convex-independent pure module with typed minor-unit inputs and outputs for per-attendee accommodation lines. Implement exactly the locked formula: `coveredNights = ticket.accommodationIncluded ? eventBaseNights : 0`; `totalNights = buyer-chosen nights`; `baseCharge = max(0, totalNights - coveredNights) * baseRate`; `upgradeCharge = upgradePrice * totalNights`; `cotCharge = cotPrice * totalNights`. Normalize malformed/negative/non-integer money and night inputs to safe non-negative minor-unit values, preserve valid €0 rates, and return total accommodation due, attendee attribution, and non-zero receipt lines (`Accommodation`, `Superior upgrade`, `Cot`) with nights, rate-per-night, and charge. Resolve the superior-upgrade selection as one representation of the superior rate: do not add an upgrade line when the selected rate is already superior; cot contributes only when `cotSelected` and `ageBandCode === "under_3"`; breakfast has no charge. Make the helper config-version-aware by accepting an optional immutable snapshot; confirmed rows must use snapshot inputs rather than live rates, while unconfirmed rows use current inputs. Export a snapshot builder using the same pure calculation so Phase 44 can persist the resolved base/upgrade/cot rates, total/covered nights, and `configVersion` without duplicating money math. Do not import Convex, read the database, or put any display calculation in this module.</action>
  <verify>Run `npm test -- --run tests/finance/accommodation-amounts.test.ts`. The tests must cover: ticket-inclusive and non-inclusive stays; extra nights and stays shorter than covered nights; standard plus upgrade without double-charging a superior rate; cot accepted only for under-3; €0 base/upgrade/cot rates; missing config/rate/selection data contributing €0; per-attendee accumulation; and a confirmed snapshot remaining unchanged after live config values are changed.</verify>
  <done>`lib/domain/finance/accommodation-amounts.ts` is a pure, independently testable source of all accommodation money and exposes enough line/snapshot data for server payloads and Phase 44 confirmation; the focused unit suite passes for every locked formula edge case.</done>
</task>

<task type="auto">
  <name>Task 2: Fold accommodation into the canonical loader and remove duplicate finance paths</name>
  <files>convex/finance.ts, convex/signupSubmission.ts, convex/tikkie.ts, lib/domain/finance/tikkie-links.ts, tests/finance/tikkie-links.test.ts, tests/convex/tikkie-matching.test.ts</files>
  <action>Extend `loadOrderAmountDueBreakdowns(ctx, orders)` without changing its public call shape. Keep ticket pricing on the existing `deriveOrderAmountBreakdown` path, then batch-load `orderAccommodationSelections` by indexed `orderId`, collect distinct event IDs, and load each event's `eventAccommodationConfig`, `eventAccommodationRates`, enabled option rows, option definitions, and category definitions into maps rather than issuing per-selection/N+1 reads. Resolve the configured superior-upgrade and cot prices and the selected category/occupancy rate, call the pure module from Task 1, merge accommodation charges into `amountDueMinor` and `amountDueByAttendeeId`, and expose server-derived non-zero accommodation receipt lines on the breakdown for the public booking response. Use snapshot fields when a selection is confirmed; use current event config when it is not confirmed. Missing config, missing selection rows, legacy orders, zero rates, and absent `ticketTypes.accommodationIncluded` must safely produce a €0 accommodation contribution. Preserve bounded `take`/indexed reads and do not use query `filter` or unbounded new collections.

In `signupSubmission.getByBookingRef`, import and call the canonical loader for the order, remove the inline tickets-only `reduce` total around lines 850-854, and add an optional `accommodationLines` response field populated only from the loader's server-derived non-zero lines. Ticket rows may still expose their unit prices for receipt display, but no total may be recomputed there. In the Tikkie matching path, replace the exact comparison against `order.totalAmountMinor` with the already-loaded canonical amount-due for each visible order; do not regenerate or expire open Tikkie links as part of this phase.

Cover the order Tikkie creation path end-to-end without consulting canonical amount-due. Change `lib/domain/finance/tikkie-links.ts` so `normalizeAmountMinor` accepts non-negative integers, with `0` explicitly representing a flexible installment link; `buildTikkieGenerationDefaults` and `createTikkiePaymentLink` must send `amountMinor: 0` to the provider and pass `0` to `api.tikkie.createPaymentLink`, regardless of outstanding, canonical, or client-supplied totals. Make `convex/tikkie.ts` defensively accept and record the flexible zero amount for order links, rejecting any non-zero direct-call value so no re-priced amount can be persisted. Add focused tests proving a created link accepts `amountMinor: 0` and that the provider request, mutation payload, and returned link retain 0; add matching coverage proving payment matching still compares against canonical amount-due. Tikkie links remain open requests: do not derive, regenerate, supersede, patch, or expire existing open links when configuration changes.</action>
  <verify>Run `npm run typecheck` and the focused finance tests, including `npm test -- --run tests/finance/tikkie-links.test.ts tests/convex/tikkie-matching.test.ts`. Inspect `convex/finance.ts` to confirm event config is batch-resolved and every accommodation amount reaches the returned order total and attendee map. Verify `signupSubmission.getByBookingRef` contains no tickets-only total `reduce`, its returned total agrees with the canonical loader, and the new lines are absent/empty for legacy orders. Verify the creation path does not call the canonical resolver: a flexible-link test with `amountMinor: 0` must assert the provider request, `createPaymentLink` mutation, and returned link all use 0, while matching tests assert canonical amount-due remains the comparison source. Verify `convex/tikkie.ts`, `convex/publicTracking.ts`, `convex/orders.ts`, `convex/payments.ts`, `convex/reports.ts`, `convex/attendees.ts`, and `convex/sync/internal.ts` either call the loader or consume its result rather than recomputing accommodation money. Confirm no code path regenerates, supersedes, patches, or expires an existing open Tikkie link.</verify>
  <done>One loader call returns ticket-plus-accommodation order and attendee due values for live or snapshot pricing; booking-reference tracking no longer diverges; Tikkie matching uses canonical due while newly created order links use and store flexible amount 0; canonical/client totals cannot determine a link amount; legacy empty-selection behavior is unchanged; and all existing loader consumers inherit the same amount without consumer-specific formulas, without changing existing open links.</done>
</task>

<task type="auto">
  <name>Task 3: Add the confirmation snapshot boundary, receipt payload/rendering, and full validation</name>
  <files>convex/schema.ts, convex/publicTracking.ts, app/track-payment/page.tsx, tests/convex/finance-accommodation.test.ts</files>
  <action>Extend `orderAccommodationSelections` additively with optional `confirmedAt`, optional numeric `configVersion`, and an optional fixed-shape `priceSnapshot` containing the resolved base rate, upgrade rate, cot rate, total nights, and covered nights. The Phase 44 assignment-confirm flow will atomically write `confirmedAt`, `configVersion = eventAccommodationConfig.updatedAt`, and the pure helper's snapshot on each confirmed selection; do not implement that confirm mutation or UI here. Make the loader's contract fail closed or surface a clear invalid-snapshot error if a row is marked confirmed without a complete snapshot, never silently re-price it from current config. Keep `orders.totalAmountMinor` as the existing order field and do not add an eager bulk re-price. Preserve the flexible-link rule: canonical derivation drives tracking balance/progress and matching only; newly created Tikkie links always carry amount 0, and never regenerate, supersede, or expire an existing open Tikkie link after a config change.

  Update both public tracking projections so the canonical `totalDueMinor` remains the balance/progress source; if a `tikkieAmountMinor` link amount is exposed, preserve the stored flexible 0 rather than substituting canonical amount-due, while the stored open link URL remains untouched. In `app/track-payment/page.tsx`, leave the Total metric bound to `tracking.payment.totalDueMinor` and add only optional Digital Receipt rows from `submission.accommodationLines`; reuse the exact ticket-row classes (`px-4 py-3 rounded-xl border border-border/30 bg-background/50`, `space-y-2`), server-provided labels, `nights × formatMoney(ratePerNightMinor)`, and no client-side sum or new empty state. Add Convex integration fixtures covering a legacy order with no selections, a live-config order whose total changes after a rate edit, and a confirmed order whose snapshot/configVersion keeps the total fixed after the same edit; assert public tracking and booking lookup expose the same canonical total and optional lines.</action>
  <verify>Run `npx convex codegen` and `npx convex dev --once` after all Convex/schema changes. Run `npm test -- --run tests/finance/accommodation-amounts.test.ts tests/convex/finance-accommodation.test.ts tests/finance/money-model.test.ts tests/finance/tikkie-links.test.ts tests/convex/tikkie-matching.test.ts`, then `npm test -- --run`, `npm run typecheck`, `npm run build`, and `git diff --check`. Review the UI diff at 320px and desktop widths to confirm no new layout, route, CTA, or UI money calculation; confirm creation tests prove a flexible 0 amount, matching tests prove canonical amount-due comparison, and no existing open Tikkie link is regenerated, superseded, patched, or expired.</verify>
  <done>The schema carries the Phase 44 confirmation contract without changing the Phase 39 selection semantics; live orders re-price and confirmed orders are immutable; public tracking and receipt rendering show canonical values and optional non-zero accommodation rows; Convex codegen/dev validation, focused tests, full tests, typecheck, build, and diff checks pass.</done>
</task>

</tasks>

<verification>
Run the pure accommodation unit tests, Convex integration tests, full Vitest suite, `npm run typecheck`, `npm run build`, `npx convex codegen`, `npx convex dev --once`, and `git diff --check`. Review the final diff against `40-CONTEXT.md` and `40-UI-SPEC.md`: the only UI rendering change is optional Digital Receipt accommodation rows; no UI or duplicate read computes money; empty/legacy selections contribute €0; all canonical consumers use the loader; and confirmed snapshots use `configVersion` rather than live event rates. Check that the open-link Tikkie decision is respected: tracking balance/progress and matching use canonical amount-due, created links use flexible amount 0, and no link is regenerated or expired here.
</verification>

<success_criteria>
FIN-01 through FIN-04 are satisfied: accommodation room, superior-upgrade, and eligible-cot charges flow through `loadOrderAmountDueBreakdowns` into order and attendee due maps; public tracking, ledger, payments, reconciliation, reports, attendee detail, sync, and Tikkie matching agree on canonical amount-due; newly created Tikkie links carry flexible amount 0 and never derive from or re-price against canonical amount-due; unconfirmed rows derive live and confirmed rows use an immutable `confirmedAt`/`configVersion` snapshot; the pure module is unit-tested; the signup duplicate total is gone; and the UI only renders server-provided values. Phase 44 has a defined snapshot shape to populate but its confirmation flow remains out of scope.
</success_criteria>

<output>
After completion, create `.planning/phases/40-canonical-finance-derivation/40-01-SUMMARY.md`
</output>
