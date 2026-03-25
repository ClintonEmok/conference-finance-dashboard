# Phase 12: migrate auth to convex - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 12-migrate-auth-to-convex
**Areas discussed:** Adapter strategy, Session handling, Migration cutover, Auth route updates

---

## Adapter Strategy

| Option                     | Description                                                         | Selected |
| -------------------------- | ------------------------------------------------------------------- | -------- |
| better-convex/auth adapter | Official integration from installed package, handles schema mapping | ✓        |
| Custom Convex functions    | Full control, matches existing pattern, more code                   |          |
| Hybrid approach            | Adapter for core auth, custom functions for edge cases              |          |

**User's choice:** better-convex/auth adapter (Recommended)
**Notes:** Use official integration since the package is already installed and Convex schema has matching auth tables.

---

## Session Handling

| Option                    | Description                                                      | Selected |
| ------------------------- | ---------------------------------------------------------------- | -------- |
| HTTP-based (keep current) | Cookie auth, no real-time invalidation, simple migration         | ✓        |
| Convex real-time          | Instant logout across tabs/devices, more complexity              |          |
| Hybrid                    | HTTP for auth routes, Convex query for optional real-time checks |          |

**User's choice:** HTTP-based (keep current) (Recommended)
**Notes:** Keep existing 7-day expiry, 1-day update age. No real-time subscriptions needed.

---

## Migration Cutover

| Option             | Description                                                     | Selected |
| ------------------ | --------------------------------------------------------------- | -------- |
| Clean break        | Remove Prisma entirely, single backend, test before deploying   | ✓        |
| Parallel operation | Keep Prisma as fallback, verify Convex auth works first         |          |
| Staged rollout     | Convex for new sessions, Prisma for existing, gradual migration |          |

**User's choice:** Clean break (Recommended)
**Notes:** Delete prisma/schema.prisma, lib/prisma.ts, and SQLite database after verification.

---

## Auth Route Updates

| Option                  | Description                                                | Selected |
| ----------------------- | ---------------------------------------------------------- | -------- |
| Update lib/auth.ts only | Change adapter, auth API stays same, minimal route changes |          |
| Rewrite auth routes     | Clean slate, optimized for Convex patterns                 | ✓        |
| Incremental             | Update adapter first, verify, then update routes if needed |          |

**User's choice:** Rewrite auth routes
**Notes:** Clean slate approach for auth route handlers.

---

## Agent's Discretion

- Specific better-convex/auth configuration options
- How to handle existing SQLite users (migration script vs fresh start)
- Exact route handler implementation

## Deferred Ideas

- Real-time session subscriptions — future phase if needed
- User migration from production SQLite — separate migration step
