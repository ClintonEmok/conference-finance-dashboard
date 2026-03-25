---
phase: 11-use-convex
plan: "02"
subsystem: database
tags: [convex, schema, prisma-migration, cRPC, better-convex]

requires:
  - phase: 11-use-convex
    provides: PostgreSQL migration from SQLite via plan 11-01
provides:
  - Convex schema with all 19 domain tables
  - cRPC builder for typed procedure definitions
  - Foundation for replacing Prisma queries with Better Convex
affects: [11-03, 11-04, 11-05]

tech-stack:
  added: [convex, convex/server, convex/values]
  patterns:
    [
      defineSchema + defineTable,
      v.object validators,
      composite indexes,
      v.union(v.literal()) for enums,
    ]

key-files:
  created:
    - convex/schema.ts
    - convex/lib/crpc.ts

key-decisions:
  - "Foreign keys are implicit using v.string() — relationships enforced at application level (no referential integrity)"
  - "Timestamps stored as numbers (milliseconds since epoch) instead of Date objects"
  - "JSON fields use v.any() for flexibility with rawPayload, customAnswers, providerPayload"
  - "Enum types use v.union(v.literal()) pattern instead of string literals"
  - "cRPC builder exports typed context helpers (QueryCtx, MutationCtx, ActionCtx) for procedure authoring"

requirements-completed: []

duration: completed
completed: 2026-03-25
---

# Phase 11 Plan 2: Convex Schema Conversion Summary

**Complete Prisma-to-Convex schema migration with 19 domain tables, composite indexes, and cRPC builder for typed procedure definitions**

## Performance

- **Duration:** Completed earlier this session
- **Completed:** 2026-03-25
- **Tasks:** 2

## Accomplishments

- Converted entire Prisma schema (19 models) to Convex defineSchema/defineTable format
- Auth tables (users, sessions, accounts, verifications) with appropriate indexes
- Ticket Tailor tables (webhookEvents, events, orders, attendees, syncRuns) with query-optimized indexes
- Accommodation tables (hotels, eventHotels, roomTypes, rooms) with hotel/room lookups
- Tikkie tables (paymentTemplates, paymentLinks, paymentLinkTransitions) with provider-order and status indexes
- Family group tables (attendeeFamilyGroups, attendeeFamilyMembers) with bidirectional indexes
- Payment and roomAllocation tables with source/status composite indexes
- cRPC builder with typed context exports for procedure authoring

## Files Created/Modified

- `convex/schema.ts` (363 lines) - All 19 domain tables with defineSchema, validators, and indexes
- `convex/lib/crpc.ts` (24 lines) - cRPC builder initialization and typed context helpers

## Decisions Made

- Foreign keys use `v.string()` instead of `v.id()` — no referential integrity, enforced at application level
- Timestamps as epoch numbers (not Date objects) — Convex-native format
- JSON fields (`rawPayload`, `customAnswers`, `providerPayload`) use `v.any()` for flexibility
- Enums use `v.union(v.literal())` pattern for type safety (normalizedStatus, genderType, allocationPriority, payment source/status)
- cRPC builder exports `QueryCtx`, `MutationCtx`, `ActionCtx`, and `GenericCtx` types for procedure authoring

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Schema is ready for 11-03 (Query Conversion) — all tables defined with proper indexes
- cRPC builder provides typed context for writing queries and mutations
- No blockers — ready to begin converting Prisma queries to Better Convex procedures

---

_Phase: 11-use-convex_
_Completed: 2026-03-25_
