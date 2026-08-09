# Pitfalls Research

**Domain:** Conference finance dashboard — adding configurable accommodation pricing/options, booking-reference permalink re-pricing, accommodation charges into canonical amount-due, and paid-priority allocation to an existing Convex/Next.js app with canonical finance semantics.
**Researched:** 2026-08-05
**Confidence:** HIGH (codebase-grounded — every pitfall verified against current source: `convex/finance.ts`, `convex/payments.ts`, `convex/publicTracking.ts`, `convex/signupSubmission.ts`, `convex/accommodation.ts`, `convex/schema.ts`, `lib/domain/finance/*`, `.planning/codebase/FINANCIAL_DATA_FLOW.md`)

## Executive Context (what the code actually does today)

- `orders.totalAmountMinor` is the **stored** total, but `submitSignupEnvelope` **never sets it** for internal orders — amount-due is *derived at read time* from `orderTicketSelections` × **live** `ticketTypes.priceMinor` (`finance.ts` `loadOrderAmountDueBreakdowns`; `signupSubmission.getByBookingRef` line ~839). Ticket Tailor orders get `totalAmountMinor` from the provider payload (tickets only — no accommodation).
- Paid status is **derived**, never stored: `isOrderAppliedPayment` + `deriveBalanceAmounts` compute paid/partial/overpaid from matched payments vs current amount-due. `orders.status` / `ticketTailorOrders.normalizedStatus` are provider-side and **never set for internal orders**.
- `publicTracking.getByBookingRef` is a **public, read-only** query; booking ref is the only credential. The milestone's "buyer edits config via permalink" is the app's **first public write**.
- Auto-match (`autoMatchPayments`, Tikkie) matches **payer name + exact amount** against amount-due; `tikkiePaymentLinks` store a fixed `amountMinor`.
- The allocation board (`getRoomAllocationBoard`) is **scoped to internal events only** and currently shows no payment flag.
- Attendee ledger (`attendees.ts`) **splits order outstanding evenly** across attendees; paid amounts are allocated by weight (`allocateMinorAmountByWeight`).

---

## Critical Pitfalls

### Pitfall 1: Reading live rate tables at query time instead of snapshotting prices

**What goes wrong:**
The moment an admin edits a rate in the Upgrades & Options tab, *every existing order's* amount-due silently changes — including orders already confirmed, already partially paid, or already reconciled. A buyer's permalink shows a new total with no explanation; finance totals move retroactively; a "paid" order flips to "partial" (or "overpaid") without any payment event.

**Why it happens:**
The codebase already does exactly this for tickets: `loadOrderAmountDueBreakdowns` and `signupSubmission.getByBookingRef` read `ticketTypes.priceMinor` live at query time. It is the path of least resistance to extend the same pattern to accommodation rates. `FINANCIAL_DATA_FLOW.md` even documents the *intent* that `totalAmountMinor` is authoritative — but nothing enforces it for internal orders, so the live-read pattern is the de-facto behavior.

**How to avoid:**
- Store per-order **accommodation line items with snapshot unit prices** (a `orderAccommodationSelections` table with `priceMinor`, `optionId`, and a label/description copy — not just option IDs), mirroring `orderTicketSelections`.
- Add a `priceSnapshotVersion` (or `configVersion`) field on `orders`; confirm that the derived amount-due reads **snapshot prices for confirmed orders** and **live config only for unconfirmed orders** (the permalink's "re-price before admin confirmation" model).
- Keep the rule explicit: *prices are decided at confirmation; config edits after confirmation never change a confirmed order's amount-due*.

**Warning signs:**
- Amount-due changes for an order whose selections did not change.
- A unit test asserting `amountDue` from live config passes, but a test with a config edit *after* order creation flips the total.
- "Paid" → "partial" transitions with no payment activity in the payments log.

**Phase to address:** Schema (snapshot fields + line-item table) and Tracking (re-price writes snapshot at confirm). Verified in Finance + Verification.

---

### Pitfall 2: Two diverging amount sources — stored `totalAmountMinor` vs derived amount-due

**What goes wrong:**
Accommodation charges are added to the *derived* amount-due path (`loadOrderAmountDueBreakdowns` style), but reconciliation, revenue reporting, the order ledger, `getOrderPaymentStatus`, and `autoMatchPayments` read `orders.totalAmountMinor` (stored). Result: the dashboard and public tracking show the right total, but reconciliation/revenue silently under-count accommodation revenue, and auto-match compares payments against the wrong number.

**Why it happens:**
`FINANCIAL_DATA_FLOW.md` documents `totalAmountMinor` as the authoritative field, but the app already has two live consumers with different sources (TT orders: provider snapshot; internal orders: derived). Each new consumer picks whichever is convenient. There is no single "canonical amount-due" function that every finance consumer must call.

**How to avoid:**
- Introduce **one canonical aggregation function** (extend `loadOrderAmountDueBreakdowns`/`deriveOrderAmountBreakdown` to include accommodation line items, keeping the per-attendee map) and **migrate every finance consumer** to it: reconciliation reasons, revenue overview, order ledger, payment summary, auto-match, attendee ledger, public tracking. Add a lint/comment guard or a `// DEPRECATED — use loadOrderAmountDueBreakdowns` marker on raw `totalAmountMinor` reads.
- Decide explicitly what `orders.totalAmountMinor` means post-milestone: either (a) kept as the ticket-only provider snapshot (document that it is NOT the amount due), or (b) kept in sync by the same mutation that writes option changes. If (b), the stored value must be updated in the *same* transaction as the selections to avoid a window where the two disagree.

**Warning signs:**
- Reconciliation view and order detail disagree on the same order's outstanding.
- Revenue report totals change when an order's options change but no payment was recorded.
- Any new query sums `order.totalAmountMinor` directly.

**Phase to address:** Finance (canonical aggregation + consumer migration). Verified in Verification.

---

### Pitfall 3: Stale payment links and exact-amount auto-match after re-pricing

**What goes wrong:**
A buyer opens the permalink, the order re-prices upward, and the permalink still surfaces the **old Tikkie link amount** (`tikkiePaymentLinks.amountMinor`, returned as `tikkieAmountMinor` in `publicTracking`). The buyer pays the old amount. Auto-match (`autoMatchPayments`, Tikkie templates) matches payer name + **exact amount** against the *new* amount-due → no match → the payment sits `unassigned`/`ambiguous` while the order shows partial. Downward re-pricing after a link was created is worse: buyer pays the new amount, no link matches it either.

**Why it happens:**
Links are created once with a fixed amount and never invalidated on re-price; matching is exact-amount keyed, so any total change breaks the match contract.

**How to avoid:**
- On any re-price of an order with an existing order-level link: **expire/void the old link** (or mark it superseded) and generate a new link with the current amount — or, if regenerating is not possible in one step, make the permalink **stop showing the stale link** and show "amount changed — a new payment link is being generated" state.
- Extend matching to be tolerant of the *current* amount-due (match against derived amount-due, not a stored total; support multi-payment partial sums toward the due amount, since buyers now may pay ticket amount and accommodation amount in separate transactions).
- Consider matching by booking-ref/description in the link reference rather than amount alone.

**Warning signs:**
- A `tikkiePaymentLinks` row with `status: "created"` and `amountMinor` ≠ the order's current amount-due.
- UAT: pay old amount after a re-price → payment appears `unassigned`.
- `paymentCount` grows while `totalPaid` stays behind the current due.

**Phase to address:** Tracking (re-price invalidates/regenerates links) + Finance (matching tolerance). Verified in Verification.

---

### Pitfall 4: First public write mutation without an ownership gate

**What goes wrong:**
"Buyer edits options via `/track-payment/[bookingRef]`" adds the app's first **unauthenticated write**. The booking ref is the sole credential, and `buildBookingRef` uses a **non-cryptographic hash** (`BK-YYYYMMDD-` + 8 base-36 chars of a djb2-style `hashString`) — patterned, short, and derived from a client-supplied `idempotencyKey`. Anyone who obtains or guesses a ref can change a stranger's order options (raising their bill or stripping charges), read buyer email/phone (already returned by the public query), and churn finance totals. There is currently no rate limiting, no ownership verification, and no expiry on edit capability.

**Why it happens:**
The existing permalink is read-only and was treated as low-risk; adding a write to the same capability URL is a natural extension that looks like "just one more mutation." Booking refs are also embedded in confirmation emails and success pages, so they leak widely by design.

**How to avoid:**
- **Gate edits by ownership**, not by ref alone: require the caller to supply the order's booker email (or a per-order edit token issued at signup/confirmation) before any config-change mutation applies. Keep reads as-is (low risk) but do not let reads alone unlock writes.
- Reuse the existing `honeypotSeen` pattern on the public edit form; add server-side rate limiting and a per-order edit audit trail (`editedAt`, `editedByRef`/`source`).
- Never accept a `userId`/`orderId` as the auth credential — Convex guideline: derive authorization server-side; here the gate is *possession of ref + email match*, enforced inside the mutation.
- Consider an explicit `canEdit` window: only before `confirmedAt` (see Pitfall 8) — this both matches the product rule and shrinks the attack surface.

**Warning signs:**
- A config-change mutation whose args include no ownership proof beyond `bookingRef`.
- Public query returns `bookerEmail`/`bookerPhone` with no matching-input requirement and no rate limit.
- Security review: a mutation with no `requireIdentity` and no equivalent gate.

**Phase to address:** Tracking (ownership gate on the edit mutation). Verified in Verification (security checks).

---

### Pitfall 5: Re-pricing is not idempotent and has no config-version drift detection

**What goes wrong:**
Two failure modes: (1) a buyer double-submits the same option change (or the client retries) and the mutation applies the change **twice as a delta** — e.g., "+€10 upgrade" applied twice → order charged €20; (2) a buyer's edit and an admin's rate change interleave; the edit was computed against config v1 but committed against config v2, and nobody can detect that the committed price differs from what the buyer saw (the permalink's whole promise is "the price shown is the price owed").

**Why it happens:**
Delta-style mutations ("add upgrade charge") are natural to write and are *not* idempotent, unlike the signup path which has an `orderIdempotency` table. There is no `priceSnapshotVersion`/`configVersion` on orders, so the system cannot tell which config a price was computed against. Convex retries OCC-conflicted mutations automatically, which *amplifies* double-application of non-idempotent deltas.

**How to avoid:**
- Make the config-change mutation **replace the full target selection set** (compute the whole order's amount-due from the current config + requested option IDs) rather than applying deltas. Re-running with the same input is then a no-op.
- Add `priceSnapshotVersion`/`configVersion` on the order; the mutation records which version it priced against and rejects/staleness-warns if the config changed mid-edit (return "prices changed, please review" so the buyer re-confirms).
- Reuse the `orderIdempotency` pattern (event + key + fingerprint) for permalink edits so retries return the same result.

**Warning signs:**
- Same order's amount-due increases on repeated identical requests.
- Unit test: calling the re-price mutation twice with the same args changes the total twice.
- Two `orderAccommodationSelections` rows for the same attendee+option after one edit.

**Phase to address:** Tracking (idempotent replace-style mutation) + Schema (config-version field). Verified in Verification.

---

### Pitfall 6: Re-pricing after payments creates silent overpayment/donation and flips paid status

**What goes wrong:**
A buyer pays €150 (order was "paid"). They then remove a €50 option via the permalink. `deriveBalanceAmounts` now classifies €50 as an **overpayment donation** — the buyer is told "payment settled with donation" on the tracking page, but the church's finance team sees donation revenue that the buyer never intended to donate. Conversely, adding an option after payment flips a "paid" order to "partial" and the buyer is suddenly asked for more money with no context. Both cases change finance classification and reconciliation state **without any payment or refund event**, and the change is silent to finance.

**Why it happens:**
Paid/overpaid is purely derived (`deriveBalanceAmounts`), and overpayment auto-classifies as donation. There is no policy step (refund vs donate) and no audit trail tying the classification change to the re-price action.

**How to avoid:**
- On any re-price that would create an overpayment, **don't silently donate**: surface a "you've overpaid by €50 — contact the church for a refund or confirm it as a donation" decision, or at minimum record a `repriceNote`/audit row and flag the order in reconciliation with a distinct reason (e.g., `"reprice-overpayment"`).
- On upward re-price after payment, show the delta explicitly on the permalink ("Your order total increased by €20") and generate a new payment link (Pitfall 3) rather than just showing a bigger "remaining".
- Extend reconciliation reasons (`deriveReconciliation`) with re-price-specific flags so finance sees *why* an order changed.

**Warning signs:**
- `paymentStatus` transitions to "overpaid" with no `payments` row change in the same time window.
- Reconciliation shows donation amounts for orders the buyer never consciously donated to.

**Phase to address:** Finance (overpayment policy + reconciliation reason) + Tracking (delta surfacing). Verified in Verification.

---

### Pitfall 7: Per-attendee accommodation charges break the even-split attendee ledger

**What goes wrong:**
The attendee ledger (`attendees.ts` `deriveAttendeeOutstandingAmount`) splits order outstanding **evenly** across attendees, and paid amounts are allocated by weight (`allocateMinorAmountByWeight`). If accommodation charges are added only at order level, an order with one attendee who took a €40 superior upgrade and one who took nothing shows each attendee owing half of €40 (€20 each) — finance follow-up asks the wrong person for money, and per-attendee "paid" highlighting is wrong.

**Why it happens:**
`deriveOrderAmountBreakdown` already builds `amountDueByAttendeeId` from ticket selections, so the *capability* exists — but the attendee ledger and paid allocation were written against the even-split model and are separate consumers.

**How to avoid:**
- Extend `deriveOrderAmountBreakdown`'s `amountDueByAttendeeId` to include accommodation line items (each `orderAccommodationSelections` row is per-attendee, quantity 1 — mirror `orderTicketSelections`).
- Migrate the attendee ledger (`deriveAttendeeOutstandingAmount`) and paid-weight allocation to **use the per-attendee due map** when it exists, falling back to the even split only for orders with no per-attendee data.
- Keep `quantity = 1` semantics for accommodation lines (per-attendee rows, like tickets) — do not reuse `quantity` to mean beds or nights.

**Warning signs:**
- Attendee detail shows outstanding that doesn't match the sum of that attendee's ticket + option lines.
- Allocation highlight marks an attendee "paid" whose order-level payment was allocated across others.

**Phase to address:** Finance (per-attendee due + ledger migration). Verified in Allocation + Verification.

---

### Pitfall 8: No admin-confirmation / assignment write-guard on the permalink

**What goes wrong:**
The product rule is "configuration changes allowed **before admin confirmation**". If the mutation doesn't enforce a `confirmedAt`/locked state, a buyer can change options **after** the admin assigned rooms (changing the attendee's entitlement out from under the assignment) or after the order was confirmed/reconciled. The admin's allocation work silently drifts from the buyer's selections.

**Why it happens:**
UI-level disable (graying out the form) is easy; the server-side guard is one more check that gets forgotten. `orderAttendees.assignedRoomId` and `orderAssignments.status === "confirmed"` already exist and are natural lock signals but nothing reads them to block edits.

**How to avoid:**
- Store an explicit `confirmedAt`/`configLockedAt` on the order (set by the admin confirmation flow, and/or derived from `orderAssignments.status = "confirmed"` or `assignedRoomId` being set).
- Enforce in the **mutation**: if confirmed/locked (or any attendee has `assignedRoomId`/confirmed assignment), throw a "locked for changes — contact the church" error. The UI hides the edit affordance *and* the server rejects.
- Make the confirmation flow itself snapshot prices (Pitfall 1) so locking is the moment prices become final.

**Warning signs:**
- A config-change mutation that doesn't read `confirmedAt`/assignment state.
- Admin assigns a room; buyer then edits options and the admin board shows a mismatch with no warning.

**Phase to address:** Tracking (write-guard) + Allocation (confirm flow sets lock). Verified in Verification.

---

### Pitfall 9: Trusting client-supplied prices or unvalidated option IDs in the re-price mutation

**What goes wrong:**
If the permalink mutation accepts `priceMinor` or a computed total from the client, a buyer can set their own price (price tampering). If it accepts option IDs without verifying they belong to the event's current config, a stale/archived option ID can price an order against a deleted option (null/zero price → wrong amount-due, or dangling reference breaking reads).

**Why it happens:**
UI convenience — the client already fetched prices, so passing them back feels natural. The ticket flow has a guardrail (server validates `ticketTypeId` belongs to the event in `submitSignupEnvelope`) but no equivalent is specified for the new mutation.

**How to avoid:**
- The mutation accepts **only option IDs (and attendee keys)**, never amounts; the server re-reads the event's current config and computes the total itself, exactly like `submitSignupEnvelope` validates ticket types against `eventTicketTypes`.
- Validate each option ID against the event-scoped config; reject unknown/archived/disabled options with a typed error (`OPTION_UNAVAILABLE`, mirroring `TICKET_UNAVAILABLE`).
- Re-check option **availability** (cot/resource inventory) at edit time, not just at signup (see Pitfall 11).

**Warning signs:**
- Mutation args contain any monetary field.
- A stale option ID returns a 200 with a zero line instead of an error.

**Phase to address:** Tracking (server-side pricing) + Admin Config (option lifecycle). Verified in Verification.

---

### Pitfall 10: Catalog/event-config schema design mistakes — mixed scopes, nested arrays, string labels

**What goes wrong:**
Four classic schema traps for this milestone:
1. **Mixing reusable catalog and event-scoped config in one table** — the milestone explicitly separates "reusable catalog (categories, room types, options, age bands)" from "event-scoped configuration (rates, upgrade, cot, resources)". A single table with a nullable `eventId` leads to event-specific copies and config drift.
2. **Storing options as nested arrays on the event doc** — Convex docs cap at ~1 MB and every update rewrites the whole document; an `options: v.array(...)` field becomes a contention point and a scaling ceiling (guidelines: separate table with a foreign key).
3. **Referencing options by label string** — the codebase already carries this smell (`ticketTailorAttendees.ticketTypeLabel` string copies, `tikkiePaymentTemplates.ticketTypeLabel`); renaming an option retroactively rewrites history and breaks joins. Reference by ID, snapshot the label into the order line (Pitfall 1).
4. **Hard-deleting options/room types still referenced by orders** — `deleteRoomType` already guards on existing rooms; the equivalent guard must exist for options referenced by `orderAccommodationSelections`. Use archive/soft-delete (`isActive`, `archivedAt`) and keep serving snapshot data.

**Why it happens:**
These are the fastest ways to model a "small" catalog, and the codebase's own legacy (string labels) normalizes them.

**How to avoid:**
- Two-layer schema: `accommodationCatalog*` tables (shared) + event-scoped config tables (rates/availability) keyed by `eventId`, each with proper indexes (`by_eventId`, `by_optionId` etc. — index naming per Convex rules).
- Options/age bands/room types as **their own tables**; order selections as a **separate `orderAccommodationSelections` table** (per-attendee rows, FK to order, option ID, snapshot `priceMinor` + label, `sortOrder`).
- Soft-delete + validation that rejects selecting archived options; never `delete` a config row that is referenced by existing selections.

**Warning signs:**
- A config table with an optional `eventId` and rows shared across events.
- `v.array(v.object(...))` of options/rates inside `events` or an event-config doc.
- Any new join keyed on a human-editable label.

**Phase to address:** Schema (tables + indexes). Verified in Admin Config + Verification.

---

### Pitfall 11: Eligibility (SEED-002) and option availability drift between signup, edit, and allocation

**What goes wrong:**
Ticket-driven room eligibility reads `ticketTypes.roomTypeId` (currently snapshot into `orderAttendees.allocatedRoomTypeId` at signup) and option availability reads live config. If an admin changes `ticketType.roomTypeId` or availability **after** signup, the buyer's entitlement at allocation time differs from what they selected; if availability is only checked at signup, a cot/resource can be over-committed when buyers edit via the permalink. The existing signup capacity check (`submitSignupEnvelope` slot capacity loop) is already a read-then-write race — the option flow must not repeat it.

**Why it happens:**
Eligibility is stored on a live-mutable table; availability checks exist only on the submission path, and the new edit path is added without re-checking.

**How to avoid:**
- Decide and document the semantics: **eligibility/availability are evaluated at allocation time** (admin config wins) or **locked at confirmation** (buyer selection wins). Given the "admin does final assignment" model, evaluate against *current* config at allocation but *flag* attendees whose current entitlement differs from their selection at signup (a warning badge, not a silent re-grade).
- Re-run availability checks **inside the edit mutation** (Pitfall 9) and inside any admin allocation action against the same config-version the UI displayed.
- For capacity-sensitive options (cots, limited resources), count commitments atomically — in Convex, do the read+write in one mutation so concurrent edits can't over-commit (avoid replicating the existing racy slot-count pattern).

**Warning signs:**
- Allocation board silently assigns a room type the buyer never selected.
- Two concurrent permalink edits both claim the last cot.

**Phase to address:** Admin Config (eligibility semantics) + Signup + Tracking (re-check on edit). Verified in Allocation + Verification.

---

### Pitfall 12: Paid-priority allocation keyed on the wrong "paid" definition

**What goes wrong:**
"Paid names highlighted, unpaid grayed out" silently shows **everyone unpaid** if the highlight is keyed on `order.status`/`normalizedStatus`: those are provider fields and are **never set for internal orders** (the allocation board is internal-events-only, `accommodation.ts` filters `primarySourceKind === "internal"`). If instead it keys on exact paid-outstanding == 0, a partially-paid attendee falls into "unpaid" gray with no distinction, and an attendee whose order is fully paid *at order level* but whose per-attendee due was re-weighted (Pitfall 7) shows wrong.

**Why it happens:**
The app has multiple paid definitions (provider status, derived balance, exact match) and no single "is this attendee paid" helper; picking `order.status` is the most visible one.

**How to avoid:**
- Add one derived `isAttendeePaid` helper built on `deriveBalanceAmounts(perAttendeeDue, perAttendeePaid)` using the per-attendee maps from Pitfall 7, not on `order.status`.
- Surface **tri-state** in the allocation board: paid (highlighted) / partial (highlighted-dim with badge) / unpaid (grayed) — the requirement names two states, but "partial" will occur constantly with option charges split across payments.
- Precompute the paid-set **once per board load** (one pass over the scoped orders' breakdowns and matched totals), not per-attendee N+1 queries.

**Warning signs:**
- UAT on an internal event: every attendee is grayed despite payments existing.
- Allocation board latency grows linearly with attendee count (per-row payment lookup).

**Phase to address:** Allocation (paid-set derivation) + Finance (per-attendee paid helper). Verified in Verification.

---

### Pitfall 13: Bulk re-price exceeding Convex transaction limits (and eager rewrite of history)

**What goes wrong:**
An admin changes one rate and the system "helpfully" re-prices every affected order in one mutation. Convex mutations are transactions with read/write limits — a large event (hundreds of pending orders) blows the transaction, the mutation fails mid-way, and the admin sees an error with partial state. Even when it fits, eagerly rewriting all orders means every historical order is mutated on a routine config tweak.

**Why it happens:**
Eager recomputation is the obvious implementation; the lazy "compute from current config until confirmed, snapshot at confirmation" model (Pitfalls 1/5) avoids the write entirely.

**How to avoid:**
- Prefer **lazy pricing**: unconfirmed orders price from current config on read (with `configVersion` recorded), so an admin rate change needs **no** order writes at all; only the *confirmation* mutation writes the snapshot (one order).
- If eager re-pricing is ever required (e.g., a finance snapshot), batch it via `ctx.scheduler.runAfter` chains per Convex guidelines instead of one big mutation.
- Keep dashboard finance reads bounded and event-scoped as today (`take` limits, indexes).

**Warning signs:**
- An admin mutation iterating over all event orders and patching each.
- A unit test that edits a rate and asserts all orders' stored totals changed.

**Phase to address:** Admin Config (no eager rewrite) + Finance (lazy pricing). Verified in Verification (transactional tests).

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reuse the live `ticketTypes.priceMinor` read pattern for accommodation rates | Zero new snapshot code | Retroactive re-pricing of confirmed orders; finance totals move without events | Never — confirmed orders must be immutable (Pitfall 1) |
| Add accommodation charges only to the derived path and leave `totalAmountMinor` consumers alone | Small diff | Reconciliation/revenue silently under-count accommodation (Pitfall 2) | Never |
| Store option selection as an array on the order doc | One fewer table | 1 MB doc ceiling, full-doc rewrites, concurrent edit contention | Never — separate table per Convex guidelines |
| String-label references to options | Looks simple, joins by name | Renames rewrite history; broken joins (TT legacy smell) | Never — ID + snapshot label |
| Deltas in the edit mutation ("add €10") | Easy to write | Double-apply on retry/OCC; no drift detection (Pitfall 5) | Only with an idempotency record — prefer replace-style |
| Gate edits in the UI only (hide the form after confirm) | Ships fast | Buyer with a stale tab or crafted request edits a confirmed order (Pitfall 8) | Never — enforce in the mutation |
| Reuse the racy signup slot-capacity pattern for option availability | Consistency with existing code | Concurrent over-commit of cots/resources (Pitfall 11) | Never for capacity-bearing options |
| Pay-by-`order.status` for allocation highlight | One-liner | Internal orders all show unpaid (Pitfall 12) | Never |
| Eagerly re-price all orders on admin rate change | "Correct" totals everywhere | Transaction limit failures; history churn (Pitfall 13) | Only batched via scheduler, or never (prefer lazy) |

## Integration Gotchas

Common mistakes when connecting to external services and internal subsystems.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Tikkie payment links (`tikkiePaymentLinks`) | Re-price leaves `status: created` links with stale `amountMinor`; permalink keeps showing them | On re-price: expire/supersede order-level links and regenerate at the new amount, or stop surfacing stale links with a "amount changed" state (Pitfall 3) |
| Payment auto-match (`autoMatchPayments`, Tikkie templates) | Exact-amount matching against a stored total that no longer equals current amount-due | Match against the canonical derived amount-due; tolerate multiple payments summing to due; match by booking-ref/description where possible |
| Tikkie payment templates (`tikkiePaymentTemplates`, keyed by `ticketTypeLabel`) | Templates can't express accommodation options; buyers get links for ticket-only amounts | Generate links from the order's actual line items (tickets + options) rather than template lookups |
| Ticket Tailor sync (`sync/orders.ts`, `totalAmountMinor` from provider payload) | Treating provider total as the canonical amount-due for orders that now have local accommodation charges | Document `totalAmountMinor` as provider ticket total for TT orders; amount-due comes from the canonical aggregation (Pitfall 2) |
| Confirmation email (`internal.emailActions.sendSignupConfirmation`) | Static ticket-only amount/room list sent once; option changes after signup not reflected | Include option lines; consider a "your options changed" email (or at least make the permalink the source of truth) |
| Existing `/track-payment` page + emails sending `trackPaymentUrl` without a ref | New `/track-payment/[bookingRef]` breaks the old deep link/email flow | Preserve the old route (search-first page) or 302-redirect it to the permalink route (PROJECT.md constraint: preserve deep links) |
| `orderIdempotency` table | Only signup uses it; edit mutation is unprotected from retries | Reuse event+key+fingerprint pattern for permalink edits (Pitfall 5) |
| `sendSignupConfirmation`/`scheduler` calls inside the signup mutation | Failure is swallowed (`console.error`) — option-charge emails silently lost | Keep the pattern but treat missing/updated amounts as a known gap the permalink covers |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-attendee paid lookup in the allocation board loop | Board load time grows linearly with attendees; N+1 queries | Precompute the paid-set once from scoped orders' breakdowns + matched totals (Pitfall 12) | ~hundreds of attendees per event |
| `loadOrderAmountDueBreakdowns` per order inside loops (already in `autoMatchPayments`) | Auto-match/summary latency; reads many docs per order | Batch-load breakdowns for the full order list (function already supports this — keep using the batch form) | Already a smell at 500-order caps |
| Eager re-price of all orders in one mutation | Mutation fails with transaction limits; partial writes | Lazy pricing + snapshot-at-confirm; scheduler batching if ever needed (Pitfall 13) | A few hundred affected orders |
| Nested option arrays on the event config doc | Contention on every option write; doc bloat | Separate options/rates tables (Pitfall 10) | Dozens of options; concurrent admin edits |
| Unbounded `.collect()` in `signupSubmission.getByBookingRef` | Order with many attendees/selections grows read cost | Keep; current scale is small — but don't copy the `.collect()` pattern into new permalink queries; use bounded reads/indexes | Large orders (100+ attendees) |
| Live config read on every public tracking request | Amount-due recomputed per request | Cheap (single order); fine — but confirm confirmed orders read snapshots so the cost is bounded and the value stable | N/A if snapshots land |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Public config-change mutation gated only by a patterned, weakly-hashed booking ref (Pitfall 4) | Strangers edit strangers' orders (raise/lower bills); churn finance state | Ownership gate: require booker email match or per-order edit token server-side; rate limit; honeypot on the edit form; edit window closes at `confirmedAt` |
| Public tracking query returns `bookerEmail`/`bookerPhone` (today) and now unlocks writes | PII disclosure + capability leak combined | Keep reads but don't let reads authorize writes; if PII display is required, gate on email-input match |
| Client-supplied prices/amounts in the edit mutation (Pitfall 9) | Buyer sets own price | Server computes all amounts from option IDs + event config; validators reject monetary args |
| Option IDs accepted without event-scope validation | Stale/archived/other-event options priced in; dangling refs | Validate against the event's config; reject with typed `OPTION_UNAVAILABLE` |
| Edit allowed after admin confirmation/assignment (Pitfall 8) | Assignment/entitlement drift; invoice disputes | `confirmedAt`/lock write-guard in the mutation; not just UI hiding |
| No audit trail on public writes | Cannot answer "who changed what and when" | Per-order edit audit rows (before/after selection set, `editedAt`, origin) |
| Booking-ref enumeration via `getByEmailOrBookingRef` (email fallback returns latest order's tracking) | Email→order mapping leaks tracking to anyone who knows an email | Acceptable today (read-only); re-evaluate once writes exist — consider making the email path require the booking ref too |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Re-price silently changes the total on the permalink | Buyer distrust; payment for wrong amount | Show an explicit "your order total changed by +/− €X" notice with a review step before confirming the edit (Pitfall 6) |
| "Payment settled with donation" after a downward re-price | Buyer never intended to donate; finance sees phantom donations | Surface the overpayment decision (refund vs donation) instead of auto-donating |
| Paid/unpaid binary on the allocation board | Partially-paid attendees indistinguishable from unpaid | Tri-state: paid highlighted, partial highlighted-dim, unpaid grayed (Pitfall 12) |
| Option rename rewrites receipt text retroactively | Historical receipts/labels mismatch current catalog | Snapshot labels into order lines at confirmation (Pitfall 1) |
| Admin rate edit silently re-prices every pending order | Admin can't predict the blast radius | Show "N pending orders will re-price" preview in the Upgrades & Options tab before saving |
| Edit form disappears after confirmation with no explanation | Buyer thinks the system is broken | Keep the page but show a locked state with "contact the church to change your booking" (Pitfall 8) |
| Booking ref typed in lowercase / with spaces fails | Frustration at the door of every payment | Normalize consistently (`trim().toUpperCase()`) across old input page and new permalink route — already the pattern, keep it |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Re-pricing:** Calling the edit mutation twice with identical args must not change the total — verify with a unit test (Pitfall 5).
- [ ] **Stale Tikkie link:** After a re-price, an old `status: created` order link must be expired/superseded — check `tikkiePaymentLinks` state post-edit (Pitfall 3).
- [ ] **Snapshots:** Confirmed orders must NOT re-price when the admin later edits a rate — test edit-config-after-confirm (Pitfall 1).
- [ ] **Canonical aggregation:** Reconciliation, revenue, order ledger, payment summary, auto-match, attendee ledger, and public tracking all show the same amount-due — compare one order across all surfaces (Pitfall 2).
- [ ] **Ownership gate:** A config-change mutation with only a booking ref (no email/token) must be rejected — security test (Pitfall 4).
- [ ] **Internal-order paid status:** Allocation highlight on an internal event with a recorded payment must show paid — UAT (Pitfall 12).
- [ ] **Confirm lock:** After admin confirms/assigns, the edit mutation must throw — server-side test, not just UI (Pitfall 8).
- [ ] **Deep links:** The old `/track-payment` URL (emailed in earlier flows) still works or redirects (PROJECT.md constraint).
- [ ] **Per-attendee due:** Attendee detail outstanding equals that attendee's ticket + option lines — ledger test (Pitfall 7).
- [ ] **Overpayment policy:** Downward re-price after payment does not silently create a donation without surfacing it (Pitfall 6).
- [ ] **Option lifecycle:** Deleting/archiving an option referenced by existing selections is blocked or handled (Pitfall 10).
- [ ] **Availability re-check:** Edit path re-checks cot/resource capacity inside the mutation, atomically (Pitfall 11).

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Live-rate retroactive re-pricing (Pitfall 1) | HIGH — finance totals corrupted across many orders | Recompute confirmed orders from stored payment/snapshot history; rebuild line-item snapshots from the last confirmed state; reconcile donation misclassification |
| Stale payment links (Pitfall 3) | MEDIUM | Find unassigned/ambiguous payments matching old amounts; manually assign to orders; regenerate current links; patch amounts |
| Double-applied delta (Pitfall 5) | MEDIUM | Diff `orderAccommodationSelections` against the last audit row; remove duplicate lines; recompute due; refund/credit if over-collected |
| Phantom overpayment donation (Pitfall 6) | MEDIUM | Reclassify `donationKind` back to applied payment if refunded; or record an explicit refund payment — needs an admin action either way |
| Unauthorized edit via leaked ref (Pitfall 4) | HIGH | Audit rows identify the window; admin restores the selection set; if money moved, refund/charge via existing payment mutations; revoke edit capability (lock order) |
| Even-split ledger wrongness (Pitfall 7) | LOW–MEDIUM | Re-run ledger with per-attendee due map; no data fix needed, only recompute |
| Eager re-price partial write (Pitfall 13) | MEDIUM | Detect partial order patches (configVersion mismatch); complete via scheduler batch or revert to lazy model |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls. Phases: Schema, Admin Config, Signup, Tracking (permalink), Finance, Allocation, Verification.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Live rate reads / no snapshots | Schema (line-item + snapshot fields); Tracking (snapshot at confirm) | Finance + Verification: edit-config-after-confirm test; order amount immutable post-confirm |
| 2. Diverging amount sources | Finance (canonical `loadOrderAmountDueBreakdowns` extension + consumer migration) | Verification: same order compared across reconciliation/revenue/ledger/tracking |
| 3. Stale links + exact-match auto-match | Tracking (invalidate/regenerate links on re-price); Finance (match against derived due) | Verification: UAT pay-old-amount-after-reprice lands matched |
| 4. Ungated public write | Tracking (ownership gate: email/token + rate limit + honeypot + edit window) | Verification: security test — ref-only edit rejected |
| 5. Non-idempotent re-price / version drift | Tracking (replace-style mutation + idempotency); Schema (`priceSnapshotVersion`) | Verification: double-invoke unit test; version-mismatch test |
| 6. Re-price vs payments (overpayment/donation flip) | Finance (overpayment policy + reconciliation reason); Tracking (delta surfacing) | Verification: downward-reprice-after-payment UAT |
| 7. Even-split ledger vs per-attendee charges | Finance (per-attendee due map + ledger/paid-allocation migration) | Verification: attendee detail sum test |
| 8. Missing confirm/assignment write-guard | Tracking (mutation-level lock); Allocation (confirm flow sets `confirmedAt`) | Verification: edit-after-assign server rejection test |
| 9. Client prices / unvalidated option IDs | Tracking (server-side pricing); Admin Config (option lifecycle) | Verification: price-tamper test; unknown-option rejection test |
| 10. Schema design (mixed scope, nested arrays, string labels, hard deletes) | Schema (separate catalog/config/selection tables, ID refs, soft-delete) | Verification: schema review + delete-referenced-option test |
| 11. Eligibility/availability drift (SEED-002) | Admin Config (eligibility semantics); Signup + Tracking (re-check on edit) | Allocation + Verification: entitlement mismatch badge; capacity race test |
| 12. Paid-priority keyed on wrong definition | Allocation (derived tri-state paid-set); Finance (per-attendee paid helper) | Verification: internal-event UAT with recorded payment |
| 13. Bulk re-price transaction limits / eager history rewrite | Admin Config (no eager rewrite); Finance (lazy pricing) | Verification: rate-edit touches zero order docs pre-confirm |

## Sources

- **Codebase (HIGH confidence — read directly, 2026-08-05):** `convex/finance.ts`, `convex/payments.ts`, `convex/publicTracking.ts`, `convex/signupSubmission.ts`, `convex/accommodation.ts`, `convex/schema.ts`, `convex/_generated/ai/guidelines.md`, `lib/domain/finance/amounts.ts`, `lib/domain/finance/attendees.ts`, `lib/domain/finance/reconciliation.ts`, `lib/domain/finance/reporting.ts`, `.planning/codebase/FINANCIAL_DATA_FLOW.md`, `.planning/PROJECT.md`, `app/track-payment/page.tsx`
- **Convex official guidelines (HIGH):** `convex/_generated/ai/guidelines.md` — bounded reads, no `filter`, transaction limits, no unbounded arrays in docs, internal vs public functions, auth derivation.
- **Web (LOW confidence — general, non-authoritative):** DuckDuckGo searches for event-registration finance pitfalls (2026-08-05) returned only generic vendor marketing content; no authoritative external sources were found for this niche. All actionable findings above are grounded in the codebase itself, not web claims.
- **Known issue from prior analysis (MEDIUM):** `FINANCIAL_DATA_FLOW.md` (2026-04-01) documents the `totalAmountMinor` dual-path divergence and per-attendee even-split limitation that this milestone must resolve.

---
*Pitfalls research for: v5.0 Accommodation Upgrades & Options — subsequent milestone on an existing Convex/Next.js finance app.*
*Researched: 2026-08-05*
