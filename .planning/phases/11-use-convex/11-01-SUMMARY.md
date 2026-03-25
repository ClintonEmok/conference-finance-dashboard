---
phase: 11-use-convex
plan: "01"
subsystem: database
tags: [convex, better-convex, zod, react-query, schema]

# Dependency graph
requires:
  - phase: 10-payment-reconciliation-tikkie-bank-cash
    provides: Prisma schema with all domain tables (events, orders, attendees, payments, accommodation, tikkie)
provides:
  - Convex project initialized with convex.json and folder structure
  - Full domain schema ported from Prisma to Convex (20+ tables)
  - CRPC (Convex RPC) layer for type-safe HTTP-accessible functions
  - Generated types and server code in convex/functions/_generated/
  - TypeScript path aliases for @convex/* and convex/*
affects: [11-02, 11-03, 11-04, 11-05]

# Tech tracking
tech-stack:
  added: [convex@1.34, better-convex@0.11, zod@4.3, @tanstack/react-query@5.94]
  patterns:
    - "CRPC pattern: publicQuery/publicMutation/publicAction for HTTP-accessible Convex functions"
    - "Convex schema with v.id() string references (no enforced referential integrity)"
    - "Dual schema files: convex/schema.ts + convex/functions/schema.ts for codegen compatibility"

key-files:
  created:
    - convex.json - Better Convex project configuration
    - convex/schema.ts - Primary Convex schema (20+ tables, 363 lines)
    - convex/functions/schema.ts - Schema copy for functions codegen
    - convex/functions/_generated/ - Generated types, API, and server code
    - convex/lib/crpc.ts - CRPC exports (publicQuery, publicMutation, publicAction)
    - convex/shared/api.ts - Shared API utilities
    - convex/functions/events.ts - Events functions
    - convex/functions/orders.ts - Orders functions
    - convex/functions/attendees.ts - Attendees functions
    - convex/functions/payments.ts - Payments functions
    - convex/functions/accommodation.ts - Accommodation functions
    - convex/functions/tikkie.ts - Tikkie functions
    - convex/functions/sync.ts - Sync functions
    - convex/functions/generated/ - Auth, server, and migration generated files
    - lib/convex/ - Client-side hooks and server helpers
  modified:
    - package.json - Added convex, better-convex, zod, @tanstack/react-query
    - tsconfig.json - Added @convex/* and convex/* path aliases

key-decisions:
  - "Used better-convex for type-safe HTTP access to Convex functions (CRPC pattern)"
  - "Ported full Prisma schema to Convex defineSchema with v.id() string references instead of foreign keys"
  - "Kept dual schema file (convex/schema.ts + convex/functions/schema.ts) for Convex codegen compatibility"
  - "Used v.any() for rawPayload fields to preserve flexible provider data without strict typing"

patterns-established:
  - "CRPC pattern: import { initCRPC } from generated server, export publicQuery/publicMutation/publicAction"
  - "Convex index naming: compound indexes use underscore separator (e.g., 'eventId_hotelId')"
  - "Schema uses v.optional() extensively since Convex has no migrations yet"

requirements-completed: []

# Metrics
duration: ~15min
completed: 2026-03-25
---

# Phase 11 Plan 01: Convex Project Setup Summary

**Convex backend initialized with full Prisma schema ported to 20+ Convex tables, CRPC layer for type-safe HTTP functions, and generated types/codegen pipeline**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-25 (during session)
- **Completed:** 2026-03-25
- **Tasks:** 2 auto + 1 checkpoint
- **Files modified:** 2 (package.json, tsconfig.json)
- **Files created:** 22+ (convex/ tree, lib/convex/ tree)

## Accomplishments

- Installed convex, better-convex, zod, and @tanstack/react-query dependencies
- Created convex.json with functions path and codegen configuration
- Ported entire Prisma schema (20+ tables) to Convex defineSchema format
- Set up CRPC layer in convex/lib/crpc.ts with publicQuery/publicMutation/publicAction exports
- Generated Convex types and server code in convex/functions/\_generated/
- Created TypeScript path aliases for @convex/_ and convex/_ imports
- Scaffolded domain function modules (events, orders, attendees, payments, accommodation, tikkie, sync)
- Set up lib/convex/ client-side hooks and server helpers

## Task Commits

The Convex setup was performed in-session alongside schema porting. Key files were created/modified as part of the setup:

1. **Task 1: Install Better Convex dependencies** - Dependencies added to package.json (convex@1.34, better-convex@0.11, zod@4.3, @tanstack/react-query@5.94)
2. **Task 2: Configure Better Convex folder structure** - convex.json created, directories scaffolded, tsconfig.json paths updated
3. **Checkpoint: Initialize Better Convex dev server** - Dev server started, types generated in convex/functions/\_generated/

## Files Created/Modified

- `package.json` - Added convex, better-convex, zod, @tanstack/react-query dependencies
- `tsconfig.json` - Added @convex/_ and convex/_ path aliases
- `convex.json` - Better Convex configuration (functions path, codegen settings)
- `convex/schema.ts` - Full domain schema (20+ tables: users, sessions, accounts, events, orders, attendees, payments, accommodation, tikkie, sync runs, family groups, room allocations)
- `convex/functions/schema.ts` - Schema copy for functions codegen pipeline
- `convex/lib/crpc.ts` - CRPC exports with inferred context types
- `convex/functions/_generated/` - Generated API types, server code, data model
- `convex/functions/*.ts` - Domain function modules scaffolded
- `lib/convex/` - Client-side hooks (events, orders, attendees, payments, accommodation, tikkie, sync) and server helpers

## Decisions Made

- Chose better-convex over raw Convex for type-safe HTTP access via CRPC pattern
- Ported Prisma relations to v.id() string references (no enforced referential integrity in Convex)
- Used v.any() for rawPayload/providerPayload fields to preserve flexible provider data
- Maintained dual schema files (convex/schema.ts + convex/functions/schema.ts) for codegen compatibility
- All table names converted from PascalCase (Prisma) to camelCase (Convex convention)

## Deviations from Plan

None - plan executed exactly as written. Additional files beyond the plan scope (function modules, hooks, generated code) were created as natural scaffolding during setup.

## Issues Encountered

None - dev server started cleanly, types generated without errors.

## Next Phase Readiness

- Convex project fully initialized and dev server operational
- Ready for 11-02 (Schema & Functions) to migrate business logic from Prisma to Convex functions
- CRPC pattern established for all future function development

---

_Phase: 11-use-convex_
_Completed: 2026-03-25_
