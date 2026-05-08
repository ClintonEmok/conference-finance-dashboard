# Phase 16: fix-tikkie-sync-mapping-and-reconciliation-outstanding-flow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `16-CONTEXT.md`; this log preserves alternatives considered.

**Date:** 2026-03-26
**Phase:** 16-fix-tikkie-sync-mapping-and-reconciliation-outstanding-flow
**Areas discussed:** Field mapping, Sync link selection, Idempotency & migration, Operator sync feedback

---

## Field mapping

| Option              | Description                                                               | Selected |
| ------------------- | ------------------------------------------------------------------------- | -------- |
| paymentToken        | Use provider-unique payment id from provider schema as canonical identity | ✓        |
| paymentRequestToken | One id per link; cannot uniquely identify multiple payments               |          |
| Composite key       | Store `paymentRequestToken:paymentToken`                                  |          |

**User's choice:** `paymentToken`
**Notes:** Canonical `sourceId` for Tikkie rows should be provider payment token.

| Option              | Description                                                                        | Selected |
| ------------------- | ---------------------------------------------------------------------------------- | -------- |
| Map `counterParty*` | `counterPartyName -> payerName`, `counterPartyAccountNumber -> payerAccountNumber` | ✓        |
| Keep current names  | Expect `payerName/payerAccountNumber` from provider payload                        |          |
| Strict required     | Reject payment if payer name missing                                               |          |

**User's choice:** Map `counterParty*`
**Notes:** Keep fallback behavior only when provider omits optional values.

| Option                                | Description                                       | Selected |
| ------------------------------------- | ------------------------------------------------- | -------- |
| paymentDateTime then created fallback | Prefer runtime field if present                   |          |
| createdDateTime                       | Use documented provider `Payment.createdDateTime` | ✓        |
| Ingest time                           | Use local `Date.now()` at sync time               |          |

**User's choice:** `createdDateTime`
**Notes:** Provider-documented timestamp is canonical.

| Option               | Description                                         | Selected |
| -------------------- | --------------------------------------------------- | -------- |
| amountInCents strict | Require finite integer >= 0; skip invalid row + log | ✓        |
| Coerce loosely       | Coerce invalid values to number/0                   |          |
| Fail whole sync      | Abort run on one invalid row                        |          |

**User's choice:** Strict `amountInCents`
**Notes:** Favor data correctness and explicit row-level mapping errors.

---

## Sync link selection

| Option                | Description                                | Selected |
| --------------------- | ------------------------------------------ | -------- |
| All non-expired links | Scan `created` + `paid`; exclude `expired` | ✓        |
| Only paid links       | Current behavior                           |          |
| Only created links    | Open links only                            |          |

**User's choice:** All non-expired links
**Notes:** Avoid missing newly-paid payments due to stale local status.

| Option            | Description                                    | Selected |
| ----------------- | ---------------------------------------------- | -------- |
| Event-level only  | Sync active event-level Tikkie flow            | ✓        |
| All link types    | Include legacy per-order/per-attendee links    |          |
| Configurable mode | Event-level default with include-legacy toggle |          |

**User's choice:** Event-level only
**Notes:** Preserve Phase 15 direction.

| Option                    | Description                | Selected |
| ------------------------- | -------------------------- | -------- |
| Recent-first capped batch | Bounded per-run processing | ✓        |
| Scan all every run        | Unbounded full scan        |          |
| Manual date range         | Operator-picked window     |          |

**User's choice:** Recent-first capped batch
**Notes:** Keep runs bounded and repeatable.

| Option                   | Description               | Selected |
| ------------------------ | ------------------------- | -------- |
| Success with zero counts | `200` + `linksScanned: 0` | ✓        |
| Warning state            | Soft warning only         |          |
| Treat as error           | No links becomes failure  |          |

**User's choice:** Success with zero counts
**Notes:** No in-scope links is valid operational outcome.

---

## Idempotency & migration

| Option                           | Description                    | Selected |
| -------------------------------- | ------------------------------ | -------- |
| Global paymentToken              | Canonical dedupe/upsert key    | ✓        |
| paymentRequestToken+paymentToken | Composite dedupe key           |          |
| Legacy sourceId rules            | Keep mixed historical behavior |          |

**User's choice:** Global `paymentToken`
**Notes:** Single canonical identity for payment-level idempotency.

| Option                     | Description                           | Selected |
| -------------------------- | ------------------------------------- | -------- |
| One-time cleanup migration | Backfill/fix legacy rows              | ✓        |
| Forward-fix only           | Leave old rows unchanged              |          |
| Soft-ignore old rows       | Exclude legacy rows from calculations |          |

**User's choice:** One-time cleanup migration
**Notes:** Correct existing data instead of carrying inconsistent history.

| Option               | Description                                 | Selected |
| -------------------- | ------------------------------------------- | -------- |
| Patch mutable fields | Update non-identity fields on re-seen token | ✓        |
| Keep first-write     | Ignore subsequent differences               |          |
| Flag conflict error  | Treat differences as hard conflicts         |          |

**User's choice:** Patch mutable fields
**Notes:** Preserve identity while allowing provider-authoritative field correction.

| Option              | Description                                | Selected |
| ------------------- | ------------------------------------------ | -------- |
| Run migration first | Cleanup before/with corrected sync rollout | ✓        |
| Run migration after | Correct new writes first, backfill later   |          |
| Manual trigger only | Ship utility, run ad hoc                   |          |

**User's choice:** Run migration first
**Notes:** Immediate reconciliation consistency is required.

---

## Operator sync feedback

| Option                | Description                       | Selected |
| --------------------- | --------------------------------- | -------- |
| Inline status + toast | In-page summary + transient toast | ✓        |
| Toast only            | Ephemeral feedback only           |          |
| Console/log only      | No operator-visible feedback      |          |

**User's choice:** Inline status + toast
**Notes:** Eliminate ambiguous "sync did nothing" perception.

| Option              | Description                                          | Selected |
| ------------------- | ---------------------------------------------------- | -------- |
| Full run summary    | Show scanned/fetched/new/existing/match/error counts | ✓        |
| Simple success/fail | Minimal state only                                   |          |
| Debug-heavy         | Per-link/per-payment verbose details                 |          |

**User's choice:** Full run summary
**Notes:** Operators need actionable detail without raw debug noise.

| Option                | Description                            | Selected |
| --------------------- | -------------------------------------- | -------- |
| Partial success state | Mixed success/failure shown explicitly | ✓        |
| Hard failure          | Any error means total failure          |          |
| Silent success        | Hide partial failures                  |          |

**User's choice:** Partial success state
**Notes:** Preserve successful work visibility while surfacing issues.

| Option                    | Description                              | Selected |
| ------------------------- | ---------------------------------------- | -------- |
| Auto-refresh summary/list | Update reconciliation data automatically | ✓        |
| Manual refresh required   | Operator refreshes after message         |          |
| Full page reload          | Reload whole page                        |          |

**User's choice:** Auto-refresh summary/list
**Notes:** Keep operator in-flow and avoid context loss.

---

## the agent's Discretion

- Exact UX copy for toasts and inline run-state labels.
- Exact cap size for per-run recent-first sync.
- Exact migration execution mechanics (while preserving migration-first rollout).

## Deferred Ideas

None.
