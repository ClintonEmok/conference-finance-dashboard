# Pitfalls Research

**Domain:** Brownfield canonical order/payment/payable migration for an internal conference finance system
**Researched:** 2026-04-01
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Dual runtime truth that never actually converges

**What goes wrong:**
The app “adds” canonical `orders`, `payments`, and future payable tables, but runtime reads still join provider tables (`ticketTailor*`) for visibility, status, attendee, and finance behavior. Teams think they migrated, but production logic still depends on provider-shaped rows.

**Why it happens:**
Brownfield work favors additive changes. It is easy to backfill canonical tables while leaving old read paths in place “temporarily,” then keep shipping on the mixed model.

**How to avoid:**

- Define a hard runtime contract: after cutover, finance/ops reads may only use canonical internal tables.
- Treat provider tables as ingest + mapping only.
- Inventory every read path before migration and classify it as: canonical, provider-boundary-only, or forbidden.
- Add explicit cutover gates and delete/ban mixed joins in dashboard query paths.

**Warning signs:**

- Order screens still merge `orders` with `ticketTailorOrders` for status/visibility.
- Reconciliation output still keys on `providerOrderId` because canonical facts are incomplete.
- “Temporary” adapter logic keeps expanding sprint after sprint.

**Phase to address:**
Phase 1 — Runtime truth audit and canonical contract definition.

---

### Pitfall 2: Mixed identifier semantics (`Id<"orders">`, provider IDs, free strings) corrupt matching

**What goes wrong:**
Payments, attendees, links, and reconciliation rows point at the same conceptual order using different identifier types. This causes silent mismatches, duplicate joins, failed lookups, and unsafe manual fixes.

**Why it happens:**
Provider integrations arrive first, canonical tables arrive later, and string fields survive because they are convenient during transition.

**How to avoid:**

- Pick one canonical join key for runtime relations: internal `Id<"orders">`.
- Keep provider IDs only in boundary/mapping tables.
- Add explicit mapping tables or fields for provider references; do not overload `orderId` to mean both provider and internal identity.
- Backfill and validate all existing references before tightening schema.

**Warning signs:**

- A field named `orderId` is typed as `string` in some tables and `Id<"orders">` elsewhere.
- Code regularly calls `normalizeId("orders", value)` because the source type is ambiguous.
- Operators say “some payments attach, some don’t” after resyncs.

**Phase to address:**
Phase 1 — Identity model and schema normalization plan.

---

### Pitfall 3: Canonical totals/payables are backfilled without one deterministic formula

**What goes wrong:**
Order totals, attendee obligations, outstanding balance, and payable rows are derived differently across signup, sync, dashboard, and reconciliation code. The same order can show different amounts in different screens.

**Why it happens:**
Brownfield systems often have “helpful” local calculations, null-to-zero fallbacks, provider amount copies, and ad hoc exclusions/refunds that drift over time.

**How to avoid:**

- Write a single canonical formula spec for order total, paid total, outstanding total, and attendee payable allocation.
- Distinguish `unknown`, `zero`, `waived`, `refunded`, and `cancelled`; never collapse them into `0`.
- Version the derivation rules if historic orders need grandfathered behavior.
- Validate canonical outputs against real production samples before cutover.

**Warning signs:**

- `?? 0` appears in finance derivation paths for amount fields with business meaning.
- Refunds/cancellations only change status, not monetary treatment.
- Operators reconcile by “knowing which screen is right.”

**Phase to address:**
Phase 2 — Canonical finance rules and payable derivation.

---

### Pitfall 4: Unsafe backfill that rewrites production-shaped data without replayability

**What goes wrong:**
Migration code patches live rows in-place without dry runs, progress tracking, resumability, or before/after checks. If the job fails midway, the team no longer knows which rows are trustworthy.

**Why it happens:**
Teams underestimate brownfield data quality and assume a one-shot script is enough.

**How to avoid:**

- Use online, batched, resumable migrations.
- Run dry-run previews first and capture counts by case.
- Preserve source payloads and write migration metadata/audit markers.
- Follow widen → backfill → validate → narrow, not “flip schema and pray.”

**Warning signs:**

- Migration plan has no dry run, no resume cursor, and no rollback story.
- Team intends to “just patch everything once in production.”
- Existing rows already violate the intended schema.

**Phase to address:**
Phase 3 — Backfill/migration execution safety.

---

### Pitfall 5: Payment matching is treated as certainty when it is only heuristic

**What goes wrong:**
Name+amount matching, attendee-name fallbacks, or provider reference guesses are written as authoritative matches. Incorrect auto-links then poison balances, dunning, and finance reporting.

**Why it happens:**
Brownfield systems often start with incomplete payment metadata, so heuristics feel like the fastest way to “clean up” old data.

**How to avoid:**

- Separate `observed payment`, `candidate match`, and `confirmed assignment` as different states.
- Require stronger evidence for auto-match (stable provider token/reference, payment link token, exact order mapping, or operator review queue).
- Record why a payment was matched and by which rule.
- Keep ambiguity first-class; ambiguous is better than wrong.

**Warning signs:**

- Auto-match logic uses only payer name + exact amount.
- No audit field explains why a payment is linked.
- Unassign/reassign operations do not recalculate downstream balances deterministically.

**Phase to address:**
Phase 2 — Matching model and reconciliation invariants.

---

### Pitfall 6: Provider events are processed as ordered, unique facts

**What goes wrong:**
Webhook/sync handlers assume provider deliveries are unique and ordered. Duplicate or out-of-order events then create duplicate rows, stale regressions, or invalid status transitions.

**Why it happens:**
Teams model provider events like database changes instead of unreliable external deliveries.

**How to avoid:**

- Make ingest idempotent on provider event/object identity.
- Store raw event history separately from canonical state.
- Apply monotonic transition rules: a stale provider event should not overwrite a newer canonical fact.
- Design recovery by replaying raw events into mapping logic.

**Warning signs:**

- Webhook handlers overwrite canonical rows directly from latest payload.
- Duplicate deliveries change business counts.
- There is no event receipt log or processed-event key.

**Phase to address:**
Phase 4 — Provider boundary hardening and replay-safe ingest.

---

### Pitfall 7: Hidden downstream dependencies on legacy provider fields break after cutover

**What goes wrong:**
Finance cutover succeeds in core queries, but accommodation, exports, email, filters, or admin workflows still depend on provider-only fields like provider order IDs, archived flags, or raw attendee extension data.

**Why it happens:**
Teams audit primary ledger screens but miss secondary operational paths.

**How to avoid:**

- Run a dependency audit across UI hooks, exports, actions, cron jobs, derived domain helpers, and admin tools.
- Introduce canonical read models for downstream consumers before deleting provider joins.
- Add “legacy dependency” checks in review for all finance/ops queries.

**Warning signs:**

- Non-finance modules still import provider-specific hooks or types for runtime behavior.
- Cutover plan only mentions dashboard pages, not emails/exports/ops.
- Provider archive/visibility flags still control whether canonical orders are shown.

**Phase to address:**
Phase 1 — Dependency inventory; Phase 5 — final cutover verification.

---

### Pitfall 8: No auditable money movement trail after migration

**What goes wrong:**
The system can show current balances but cannot explain how it got there. Manual payment assignments, reversals, refund handling, and payable adjustments leave no durable audit trail.

**Why it happens:**
Migration work focuses on “current correctness,” not finance explainability.

**How to avoid:**

- Store immutable payment observations and explicit assignment/adjustment events.
- Preserve source payloads, timestamps, actor, rule, and reason fields.
- Make every balance derivable from historical rows, not just current patched state.
- Add before/after snapshots for operator-driven overrides where needed.

**Warning signs:**

- A manual fix only patches the current row.
- Reconciliation cannot answer “why does this order show this balance?”
- Refunds and unassignments overwrite prior data instead of appending history.

**Phase to address:**
Phase 2 — Canonical ledger/payable design.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut                                                              | Immediate Benefit              | Long-term Cost                                   | When Acceptable                                             |
| --------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------ | ----------------------------------------------------------- |
| Keep `payments.orderId` as a free string during cutover               | Easier partial compatibility   | Permanent identifier ambiguity and broken joins  | Only as a temporary widened field with a dated removal plan |
| Compute balances in UI/domain helpers instead of one backend contract | Faster delivery for one screen | Divergent finance numbers across surfaces        | Never                                                       |
| Keep provider-derived visibility/status flags in runtime read model   | Avoids one more backfill       | Canonical model never becomes authoritative      | Only during measured dual-run with explicit end date        |
| Patch old rows in-place without migration metadata                    | Simple scripts                 | Impossible to resume, verify, or explain results | Never                                                       |
| Auto-match all “obvious” payments                                     | Shrinks manual queue fast      | Quietly wrong reporting and collections work     | Only when using strong provider references, never name-only |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration                           | Common Mistake                                                      | Correct Approach                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Ticket Tailor / provider order ingest | Treat provider order rows as canonical runtime facts                | Store raw provider facts, map them into canonical order state, and keep the provider model at the boundary |
| Ticket Tailor / webhook ingest        | Assume one delivery = one event = one state transition              | Deduplicate by provider event/object identity and replay safely                                            |
| Tikkie / payment ingest               | Match payments to orders purely by name and amount                  | Prefer payment-link token, reference, or explicit operator confirmation; persist match reason              |
| Any payment provider                  | Trust client callback timing instead of server-side event ingestion | Use provider webhooks/event logs as the durable payment observation channel                                |
| Any provider resync                   | Let stale sync payloads overwrite newer manual/canonical decisions  | Define precedence and monotonic transition rules                                                           |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap                                                                        | Symptoms                                         | Prevention                                                                 | When It Breaks                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Re-joining canonical rows with provider extensions on every dashboard query | Slow order/reconciliation pages, complex fan-out | Build canonical read paths and keep provider tables out of runtime queries | Usually before large events / multi-season history                    |
| Full-table backfill or sync passes inside one transaction                   | Failed mutations, partial jobs, retry storms     | Batch migrations and resumable jobs                                        | As soon as production-shaped data exceeds a few thousand rows         |
| Recomputing balances by scanning raw payments every request                 | Finance screens get slower as payments grow      | Persist normalized assignment state and bounded aggregates where needed    | Once orders have multiple payments and historic seasons remain online |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake                                                                             | Risk                                            | Prevention                                                              |
| ----------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| Exposing raw provider payloads broadly in admin/UI paths                            | Leaks payer/account data and provider internals | Keep raw payload access restricted; publish sanitized canonical views   |
| Allowing clients/operators to submit arbitrary foreign IDs for assignment authority | Unauthorized or accidental cross-order mutation | Resolve authority server-side and validate canonical IDs strictly       |
| Missing audit trail on manual finance overrides                                     | Insider error/fraud is hard to detect           | Record actor, timestamp, prior state, reason, and follow-up review path |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall                                                   | User Impact                                             | Better Approach                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Showing one “balance” number without confidence or source | Finance admins trust unstable figures                   | Surface canonical status, matched amount, ambiguous amount, and last sync/manual action separately |
| Hiding ambiguous payments to make dashboards look clean   | Operators miss real work and assume orders are settled  | Keep an explicit review queue for ambiguous/unassigned payments                                    |
| Reusing provider terms in canonical finance UX            | Confuses internal operators about what is authoritative | Use internal finance vocabulary consistently; show provider references as supporting metadata      |

## "Looks Done But Isn't" Checklist

- [ ] **Canonical orders cutover:** Verify no runtime finance/ops query still requires `ticketTailor*` rows to render correctly.
- [ ] **Identifier migration:** Verify every runtime foreign key to orders uses canonical internal IDs, not free strings or provider IDs.
- [ ] **Payable model:** Verify attendee/order payable totals reconcile to order totals for historic and current data.
- [ ] **Payment assignment:** Verify ambiguous, unmatched, reassigned, refunded, and duplicate payments all preserve audit history.
- [ ] **Migration safety:** Verify backfills are dry-runnable, resumable, and produce before/after counts by case.
- [ ] **Provider ingest:** Verify duplicate and out-of-order provider events do not regress canonical state.
- [ ] **Operational continuity:** Verify exports, accommodation, email, and drilldown screens still work after canonical-only cutover.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall                                | Recovery Cost | Recovery Steps                                                                                                                                                               |
| -------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dual runtime truth                     | HIGH          | Freeze new cutover work, inventory live mixed reads, route all runtime queries back through one canonical adapter, then remove mixed joins one surface at a time             |
| Mixed identifier semantics             | HIGH          | Create explicit mapping/backfill job, add validation reports for orphaned references, migrate consumers to canonical IDs, then narrow schema                                 |
| Wrong payment auto-matches             | MEDIUM-HIGH   | Unlink affected assignments, replay matching with stronger rules, recompute balances/payables, and review operator actions                                                   |
| Unsafe backfill                        | HIGH          | Stop writes if needed, snapshot current state, compare migrated vs source counts, repair in batches from preserved raw source data, rerun with resumable migration machinery |
| Out-of-order/duplicate provider events | MEDIUM        | Rebuild canonical projections from stored raw events or latest provider snapshot, then add idempotency + monotonic guards                                                    |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall                               | Prevention Phase                        | Verification                                                                                      |
| ------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Dual runtime truth                    | Phase 1 — audit + runtime contract      | Query inventory shows each finance/ops path is canonical, provider-boundary-only, or deleted      |
| Mixed identifier semantics            | Phase 1 — identity normalization        | No runtime `orderId` fields remain ambiguous; reference audit has zero unresolved joins           |
| Non-deterministic totals/payables     | Phase 2 — canonical finance formulas    | Golden dataset tests produce identical totals across dashboard, drilldown, and reconciliation     |
| Heuristic payment certainty           | Phase 2 — payment matching model        | Auto-match rules are explainable; ambiguous queue exists; sampled matches review cleanly          |
| Unsafe backfill                       | Phase 3 — migration execution           | Dry run, batch progress, resume, and before/after counts are all demonstrated                     |
| Provider ordering/idempotency errors  | Phase 4 — ingest hardening              | Duplicate/out-of-order replay tests leave canonical state unchanged or monotonic                  |
| Hidden downstream legacy dependencies | Phase 5 — cutover + compatibility sweep | Exports, accommodation, email, admin tools, and finance pages all pass canonical-only smoke tests |
| Missing audit trail                   | Phase 2 and Phase 5                     | Every manual or automatic finance mutation is explainable from persisted history                  |

## Sources

- **Internal project context (HIGH):** `.planning/PROJECT.md` — current milestone goals, known risk areas (`mixed payment.orderId semantics`, `null-to-zero masking`, lack of canonical attendee-payable model).
- **Current schema and runtime code (HIGH):** `convex/schema.ts`, `convex/orders.ts`, `convex/payments.ts`, `convex/sync/orders.ts`, `convex/sync/webhooks.ts`, `lib/domain/finance/reconciliation.ts`.
- **Convex official docs via Context7 (HIGH):** schema validation and safe changes (`https://docs.convex.dev/database/schemas`, `https://docs.convex.dev/production`), best practices on bounded queries and explicit table IDs (`https://docs.convex.dev/understanding/best-practices`), migrations component (`https://docs.convex.dev/database/writing-data`, `https://github.com/get-convex/migrations/blob/main/README.md`).
- **Stripe official docs via Context7 (MEDIUM for cross-provider integration guidance):** duplicate webhook handling (`https://docs.stripe.com/webhooks`), idempotent requests (`https://docs.stripe.com/api/idempotent_requests`), event ordering not guaranteed (`https://docs.stripe.com/event-destinations/eventbridge`).
- **Domain synthesis (MEDIUM):** Brownfield finance migration patterns inferred from the project’s current mixed-model architecture plus verified provider/migration guidance above.

---

_Pitfalls research for: Canonical Orders Foundation brownfield migration_
_Researched: 2026-04-01_
