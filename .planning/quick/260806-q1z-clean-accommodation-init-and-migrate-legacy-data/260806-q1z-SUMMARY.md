---
phase: quick-260806-q1z-clean-accommodation-init-and-migrate-legacy-data
plan: 260806-q1z
status: complete
subsystem: accommodation
tags: [convex, accommodation, seed, migration, dev]

requires:
  - phase: 878f738 (prune v5 complexity to generic option accommodation)
    provides: event-owned option model, child selection rows, superior-as-rate, removed age-band tables
provides:
  - Reusable accommodation catalog-only seed (categories, cot option, room types with real counts).
  - Idempotent reconciliation that removes the obsolete superior_upgrade option and legacy eligibilityAgeBandCode on re-run.
  - Dev deployment acoustic-tiger-876 migrated without touching the existing event's stay/rates/resources.
  - Handler test locking the catalog-only + stale-cleanup contract.
affects: [accommodation, seed/init, dev data]

tech-stack:
  added: []
  patterns:
    - Bounded indexed iteration + in-memory maps for idempotent catalog upsert (init).
    - Single-scan stale-row reconciliation (delete references before the catalog row).
    - convex-test edge-runtime handler suite for seed contract.

key-files:
  created:
    - convex/accommodation-init.handlers.test.ts
  modified:
    - convex/init.ts
    - convex/_generated/api.d.ts (regenerated)
---

## Summary

Cleaned up the accommodation seed and migrated the already-deployed legacy data on `feat/simple-accommodation-dashboard`.

**Before:** `convex/init.ts` auto-configured every accommodation-enabled event with a forced night-before stay, hardcoded rates, the cot option, and room/cot resources — behavior the v6 milestone explicitly rejected (accommodation is optional and event-owned). The dev deployment (`acoustic-tiger-876`) still carried pre-v6 rows from the old seed: a `superior_upgrade` catalog option and its event-option row, `eligibilityAgeBandCode: "under_3"` on the cot event option, and a cot catalog description still referencing the removed age-band model.

**After:**

- **Catalog-only seed** — `convex/init.ts` seeds only the reusable catalog: categories (standard/superior/family), the cot option (generic description, no age-band wording), and the ten room types with the real physical counts/capacities. It never creates an event's accommodation config.
- **Idempotent reconciliation** — re-running the seed removes any `superior_upgrade` catalog option, deletes event options referencing it (references before the catalog row), and clears `eligibilityAgeBandCode` on every event option. Orders, selections, snapshots, payments, assignments, and the existing event's stay/rates/resources are untouched.
- **Dev deployment migrated** — ran init against `acoustic-tiger-876`: removed 1 `superior_upgrade` catalog row + 1 event-option row, cleared 1 `eligibilityAgeBandCode`. Verified by read-back: catalog options = `["cot"]`, cot event option carries `eligibilityAgeBandCode: null`, and the existing event still has its config (night-before, `nightCount: 1`), 4 rates, and 11 resources.
- **Regression coverage** — `convex/accommodation-init.handlers.test.ts` (edge-runtime, convex-test) proves the catalog-only contract, stale-row removal, `eligibilityAgeBandCode` clearing, untouched existing config, and idempotency.

### Work Done

1. Rewrote `convex/init.ts` as a catalog-only seeder with an idempotent stale-option cleanup phase (single-scan event-option read; delete references before the catalog row; patch legacy `eligibilityAgeBandCode` to undefined).
2. Verified no `superior_upgrade` locked-semantics entry remained in `convex/accommodation.ts` (already removed by the prune; no change needed).
3. Added `convex/accommodation-init.handlers.test.ts` with two tests: (a) init seeds the reusable catalog and reconciles stale pre-v6 data while leaving the existing event config/rates/resources untouched; (b) re-running init is idempotent.
4. Ran the migration against the dev deployment and verified the resulting data state.

### Verification

- `npx convex codegen` — pass
- `npx convex dev --once` — pass (functions ready)
- `npm run typecheck` — pass
- `npm test` — 62 files / 440 tests passed (5 skipped)
- `npx vitest run --config vitest.convex.config.ts` — 7 files / 111 tests passed
- `npx vitest run --config vitest.components.config.ts` — 67 files / 484 tests passed (5 skipped)
- `npm run build` — compiled successfully
- Migration on `acoustic-tiger-876`: `npx convex run init '{}'` returned `{ categories: 3, options: 1, roomTypes: 10, removedSuperiorUpgradeCatalog: 1, removedSuperiorUpgradeEventOptions: 1, clearedEligibilityAgeBand: 1 }`; read-back confirmed `cot` only, no `eligibilityAgeBandCode`, existing event config/rates/resources unchanged.

### Follow-ups (not in this task)

- The existing dev event still has the old night-before config and `allowExtendedStayBefore: true`; it was left intact per scope (admins can adjust or reconfigure per event).
- Future new events get no accommodation until an admin configures it (optional, event-owned).
