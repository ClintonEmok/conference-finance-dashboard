# Phase 40: Canonical Finance Derivation - Context

**Gathered:** 2026-08-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Accommodation option charges (room rate, superior upgrade, cot) become part of the canonical order amount-due so Paid, Outstanding, and Reconciliation stay correct across every consumer. The derivation is live for unconfirmed orders and snapshotted at admin confirmation with a config-version boundary. The change is additive to the canonical finance loader — ticket pricing logic is untouched.

</domain>

<decisions>
## Implementation Decisions

### Accommodation Amount-Due Wiring
- Extend `loadOrderAmountDueBreakdowns` in `convex/finance.ts` to sum accommodation charges from `orderAccommodationSelections` via a **pure domain module** `lib/domain/finance/accommodation-amounts.ts`.
- Money is computed **only in the pure domain module**, covered by unit tests. No UI surface computes accommodation totals.
- Replace the duplicate inline total in `signupSubmission.getByBookingRef` (currently recomputes tickets-only total around lines 850-854) with the canonical loader so public tracking shows the accommodation-inclusive amount-due.

### Live-Derive vs Snapshot at Confirm
- Unconfirmed orders price **live** from current event config (rates, options, resources) — this supports the buyer config-change permalink (Phase 43).
- At **admin confirmation** (the assignment-confirm flow, Phase 44) the resolved amount is snapshotted with a `configVersion` boundary so confirmed orders never retroactively re-price when an admin later edits a rate.
- `configVersion` stores the resolved event-config version (e.g. `eventAccommodationConfig.updatedAt`) on the snapshot, so it is traceable which config produced the prices.

### Tikkie Payment Links (flexible by design)
- Tikkie links are **open, flexible payment requests**: the payer may pay any amount against them. This deliberately enables **installments** — a buyer can pay part now and more later against the same link.
- Tikkie link `amountMinor` is therefore **0 (flexible)** at creation, not derived from the canonical amount-due. No derivation, regeneration, or expiration of links is needed when configuration changes.
- The tracking page presents the canonical amount-due as the *balance/remaining target*; the Tikkie link itself stays flexible. The canonical total is what progress and Outstanding/Reconciliation use.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `convex/finance.ts` — `loadOrderAmountDueBreakdowns` (line 45) is the single canonical amount-due source consumed by publicTracking, orders, payments, reports, autoSync, attendee detail.
- `lib/domain/finance/amounts.ts` — minor-unit helpers; `deriveBalanceAmounts`, `deriveOrderAmountBreakdown`.
- `convex/orders.ts` — `getOrdersForReconciliation`, ledger reads; `getOrderWithAttendees`.
- `convex/signupSubmission.ts` — `getByBookingRef` inline tickets-only total (lines 850-854) to be replaced.
- `convex/tikkie.ts` — `createPaymentLink` stores `amountMinor`; links are flexible by design, amount set to 0 to allow installment payments. `lib/domain/finance/tikkie-links.ts` `normalizeAmountMinor` currently rejects 0 — allow 0 as the flexible-link amount.

### Established Patterns
- Minor-unit money everywhere; pure domain modules in `lib/domain/finance/` with vitest siblings.
- `loadOrderAmountDueBreakdowns` returns `{ amountDueMinor, amountDueByAttendeeId }`; consumers read `amountDueBreakdownsByOrderId.get(String(order._id))`.
- Phase 39 added `orderAccommodationSelections` (per-attendee: categoryId, occupancy, upgradeToSuperior, cot, ageBandCode?, checkInAt, checkOutAt, nightCount) — rows will be created in Phase 42; Phase 40 must handle the empty case.

### Integration Points
- `convex/finance.ts` — extend the loader to fold in accommodation.
- `lib/domain/finance/accommodation-amounts.ts` — new pure module computing accommodation amount-due per attendee/order from selections + event config (rates, options, base stay, ticket accommodationIncluded).
- `convex/signupSubmission.ts` — swap inline total for canonical loader.
- `convex/publicTracking.ts`, `convex/orders.ts`, `convex/payments.ts`, `convex/reports.ts` — consumers automatically pick up accommodation-inclusive totals via the loader; verify no consumer recomputes.

</code_context>

<specifics>
## Specific Ideas

- The pricing formula (per attendee): `coveredNights = ticket.accommodationIncluded ? eventBaseNights : 0`; `totalNights = buyer-chosen nights`; `baseCharge = max(0, totalNights − coveredNights) × baseRate`; `upgradeCharge = upgradePrice × totalNights`; `cotCharge = cotPrice × totalNights`. Amount-due = tickets + baseCharge + upgradeCharge + cotCharge.
- Upgrade is a selection (superior rate from rate table), never added on top of the superior rate. Cot eligible only for under-3. Breakfast included (no charge). Rate table supports €0.
- If no `orderAccommodationSelections` rows exist (legacy orders, or ticket-inclusive events with no add-ons), accommodation contribution is €0 — loader unchanged behavior.
- Tikkie links are flexible: creation amount is **0** so buyers can pay in installments; the canonical amount-due drives the tracking page balance, not the link amount.

</specifics>

<deferred>
## Deferred Ideas

- Actual order selection row creation — Phase 42 (signup) creates them; Phase 44 (allocation confirm) sets `confirmedAt`/snapshot.
- Permalink config-change edit surface — Phase 43.
- Multi-night-per-ticket bundles (one ticket covering 2 nights, another 4) — out of scope; stay is event-global.
- Refund/credit mechanics for downward re-prices — surfaced to buyer in Phase 43 (excess auto-donates per earlier decision).

</deferred>
