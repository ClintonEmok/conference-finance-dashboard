# Stack Research

**Domain:** Canonical internal orders/payables foundation for a brownfield conference finance system
**Researched:** 2026-04-01
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology               | Version | Purpose                                                                            | Why Recommended                                                                                                                                                                                         |
| ------------------------ | ------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Convex                   | 1.34.1  | Canonical runtime store for orders, attendees, payments, payables, and allocations | Keep the existing backend. Convex already owns the app's transactional boundary, typed IDs, and contract surface. The milestone needs schema tightening and additive tables, not a platform change.     |
| `@convex-dev/migrations` | 0.3.3   | Brownfield-safe backfills and schema cutovers                                      | Recommended addition. Convex validates existing documents on schema push, so additive + batched migrations are the safest path for widening fields, backfilling IDs, and later narrowing legacy fields. |
| TypeScript               | 5.9.x   | Domain invariants at the contract layer                                            | Keep modeling with strict validators and discriminated unions. This milestone benefits more from explicit financial types than from extra runtime libraries.                                            |

### Supporting Libraries

| Library                  | Version | Purpose                                    | When to Use                                                                                                                                                                                  |
| ------------------------ | ------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convex-test`            | 0.0.46  | Convex mutation/query regression tests     | Add for migration-sensitive invariants: order totals, payable derivation, allocation sums, and provider-to-core dual-write tests.                                                            |
| `@edge-runtime/vm`       | 5.0.0   | Test environment for Convex function tests | Add with `convex-test`; project guidelines explicitly recommend it for Convex tests.                                                                                                         |
| No new money/ORM library | —       | Keep financial modeling simple             | Do not add `decimal.js`, Prisma, Drizzle, or a second persistence layer for this milestone. Amounts are already integer minor units; correctness comes from schema shape, not extra tooling. |

### Development Tools

| Tool                                         | Purpose                                 | Notes                                                                                                                    |
| -------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npx convex dev` / `npx convex deploy`       | Schema push and runtime validation      | Important because modified schemas validate existing documents; do not treat widening/narrowing as a single-step change. |
| `npx convex run convex/migrations.ts:runAll` | Controlled migration execution          | Run after additive deploys to backfill canonical IDs/rows before switching reads.                                        |
| Vitest + edge-runtime                        | Contract and migration regression tests | Update Convex tests to use `environment: "edge-runtime"` for function-level coverage.                                    |

## Recommended Schema / Modeling Changes

Keep the existing app stack. Add the minimum schema needed so core tables, not provider tables, become the runtime source of truth.

### 1) Add a canonical `payables` table

Use `payables` as the atomic charge ledger.

Recommended fields:

- `orderId: v.id("orders")`
- `eventId: v.id("events")`
- `attendeeId: v.optional(v.id("orderAttendees"))`
- `kind: v.union(v.literal("ticket"), v.literal("accommodation"), v.literal("fee"), v.literal("discount"), v.literal("manual_adjustment"), v.literal("refund"))`
- `source: v.union(v.literal("internal_signup"), v.literal("ticket_tailor_sync"), v.literal("operator_manual"), v.literal("migration"))`
- `description: v.string()`
- `currency: v.string()`
- `quantity: v.number()`
- `unitAmountMinor: v.number()`
- `amountMinor: v.number()`
- `isVoided: v.boolean()`
- `voidedAt: v.optional(v.number())`
- optional provenance refs such as `ticketSelectionId`, `assignmentId`, or `sourceKey`

Indexes:

- `by_orderId`
- `by_attendeeId`
- `by_eventId`
- `by_orderId_and_kind`

Why: order totals and attendee balances should come from summed payable rows, not from mixed provider payload fields or evenly-split heuristics.

### 2) Add a canonical `paymentAllocations` table

Stop treating `payments.orderId` as the full reconciliation model.

Recommended fields:

- `paymentId: v.id("payments")`
- `orderId: v.id("orders")`
- `payableId: v.optional(v.id("payables"))`
- `attendeeId: v.optional(v.id("orderAttendees"))`
- `amountMinor: v.number()`
- `allocatedAt: v.number()`
- `allocationSource: v.union(v.literal("auto"), v.literal("manual"), v.literal("migration"))`
- `allocatedBy: v.optional(v.string())`
- `notes: v.optional(v.string())`

Indexes:

- `by_paymentId`
- `by_orderId`
- `by_payableId`
- `by_attendeeId`

Why: this supports partial payments, split allocations, overpayments, and auditability. It also makes reconciliation deterministic: `outstanding = payables - allocations`.

### 3) Tighten `payments` instead of expanding it into a ledger

Keep `payments` as the receipt/inflow table, but make it canonical and typed.

Recommended changes:

- Add `currency: v.string()`
- Widen toward `orderId: v.optional(v.id("orders"))` via migration, not direct replacement of the current string field
- Keep `source` + `sourceId` as the provider receipt identity
- Treat allocation state as derived from `paymentAllocations`, not from `payments.status` alone

Why: one payment can legitimately map to many payables; the allocation join table should hold that truth.

### 4) Add a provider-to-canonical ticket mapping table

The current gap is not events or orders; it is ticket-type normalization.

Recommended table: `ticketTypeSources` or `ticketTypeProviderMappings`

Suggested fields:

- `ticketTypeId: v.id("ticketTypes")`
- `provider: v.string()`
- `providerEventId: v.string()`
- `providerTicketTypeId: v.string()`
- `providerLabel: v.optional(v.string())`

Indexes:

- `by_provider_and_providerEventId_and_providerTicketTypeId`
- `by_ticketTypeId`

Why: Ticket Tailor attendees currently rely on label copies. A real mapping boundary lets sync create canonical `orderTicketSelections` and `payables` without runtime reads from `ticketTailorAttendees`.

### 5) Keep `orders` as the root aggregate; do not add `bookings`

Recommended `orders` changes are small:

- preserve `orders` as the parent aggregate
- keep `totalAmountMinor` only as a cached summary if needed
- derive canonical totals from `payables`
- add summary fields only if they are updated in the same transaction as payable writes

Why: a second root concept (`bookings`) adds churn without solving the milestone problem.

## Brownfield Integration Points

### Ticket Tailor

- Keep `ticketTailorOrders` and `ticketTailorAttendees` as raw ingest + mapping boundary tables.
- Sync should dual-write canonical rows: `orders`, `orderAttendees`, `orderTicketSelections`, `payables`.
- Runtime dashboard queries should stop depending on provider tables for visibility, attendee financials, and reconciliation.

### Tikkie / manual payments

- Keep `payments` as the canonical receipt table for all inflows, regardless of source.
- Change manual assignment and auto-match flows to create `paymentAllocations` rows, not just patch `payments.orderId`.
- Preserve `sourceId` as the stable provider receipt key.

### Migration approach

Use widen → backfill → dual-write → cut read path → narrow:

1. Additive tables/fields only
2. Backfill canonical IDs and payable/allocation rows with `@convex-dev/migrations`
3. Dual-write provider sync + operator mutations into old and new shapes
4. Flip runtime queries to canonical tables
5. Remove or demote legacy fields after production validation

## Installation

```bash
# Supporting runtime/tooling
npm install @convex-dev/migrations

# Dev dependencies
npm install -D convex-test @edge-runtime/vm
```

## Alternatives Considered

| Recommended                                           | Alternative                                                    | When to Use Alternative                                                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `payables` + `paymentAllocations`                     | Keep using `orders.totalAmountMinor` + `payments.orderId` only | Only for a very small app with no partial payments, no attendee-level balances, and no audit requirements. That is not this system anymore. |
| `@convex-dev/migrations`                              | Ad hoc one-off internal mutations                              | Acceptable for a tiny backfill, but weaker for staged brownfield rollouts where schema validation can fail on existing docs.                |
| Keep Ticket Tailor tables as secondary ingest/mapping | Build a generic provider abstraction layer now                 | Only if a second order provider is actively being added in the same milestone. Otherwise it is premature abstraction.                       |

## What NOT to Use

| Avoid                                                                               | Why                                                                                                           | Use Instead                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| New ORM / sidecar SQL store                                                         | Splits the source of truth during a milestone whose whole purpose is to establish one canonical runtime model | Keep Convex as the only operational store                                              |
| Runtime reads from `ticketTailorOrders` / `ticketTailorAttendees` for finance truth | Preserves the current ambiguity and provider leakage                                                          | Read from `orders`, `orderAttendees`, `payables`, `payments`, and `paymentAllocations` |
| Even-split attendee balances or provider-payload amount derivation                  | Not auditable and breaks when ticket mixes, discounts, or partial payments exist                              | Derive balances from canonical payable rows and explicit allocations                   |
| New `bookings` root table                                                           | Renames the problem instead of solving it; increases migration scope                                          | Keep `orders` as the root aggregate                                                    |

## Stack Patterns by Variant

**If you need the safest brownfield rollout:**

- Add `payables`, `paymentAllocations`, and ticket-type provider mappings first
- Keep legacy fields read-compatible during backfill
- Because Convex validates existing docs on schema changes

**If you need a minimal first cut:**

- Allow `paymentAllocations.payableId` to be optional and allocate at order-level first
- Still create `payables` from day one
- Because order-level reconciliation can go live before attendee-level allocation is fully polished

## Version Compatibility

| Package A            | Compatible With                          | Notes                                                                      |
| -------------------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| `convex@1.34.1`      | `@convex-dev/migrations@0.3.3`           | Migrations component installs via `convex/convex.config.ts` `app.use(...)` |
| `convex-test@0.0.46` | `vitest@4.1.x`, `@edge-runtime/vm@5.0.0` | Use `environment: "edge-runtime"` for Convex function tests                |

## Sources

- `/websites/convex_dev` — Convex schema definition, indexes, and schema validation behavior
- `/get-convex/migrations` — official component install/configuration and stateful migration workflow
- `convex/_generated/ai/guidelines.md` — project-local Convex rules for schema, indexes, and testing
- `package.json` — existing stack in this repo
- `convex/schema.ts`, `convex/orders.ts`, `convex/payments.ts`, `convex/sync/orders.ts` — current brownfield constraints and current leakage points
- npm registry (`npm view convex version`, `npm view @convex-dev/migrations version`, `npm view convex-test version`, `npm view @edge-runtime/vm version`) — current package versions checked on 2026-04-01

---

_Stack research for: canonical orders foundation_
_Researched: 2026-04-01_
