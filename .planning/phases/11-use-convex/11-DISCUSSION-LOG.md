# Phase 11: Use Supabase - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-25
**Phase:** 11-use-supabase
**Areas discussed:** Database migration, Auth strategy, Data migration, Integration points

---

## Database migration approach

| Option                          | Description                                    | Selected |
| ------------------------------- | ---------------------------------------------- | -------- |
| Prisma with Supabase PostgreSQL | Keep Prisma ORM, switch datasource to Supabase | ✓        |
| Direct Supabase client          | Use Supabase JS client without Prisma          |          |
| Edge Functions only             | Migrate logic to Supabase Edge Functions       |          |

**User's choice:** Prisma with Supabase PostgreSQL (recommended default for existing Prisma project)
**Notes:** Maintains existing code patterns, minimizes refactoring

---

## Auth strategy

| Option                   | Description                                   | Selected |
| ------------------------ | --------------------------------------------- | -------- |
| Migrate to Supabase Auth | Use Supabase's built-in auth system           | ✓        |
| Keep Better Auth         | Continue using Better Auth alongside Supabase |          |
| Hybrid approach          | Use both during transition                    |          |

**User's choice:** Migrate to Supabase Auth (recommended default - native Supabase integration)
**Notes:** Leverages Supabase's built-in auth, cleaner integration

---

## Data migration

| Option               | Description                             | Selected |
| -------------------- | --------------------------------------- | -------- |
| Prisma push + seeds  | Use `npx prisma db push` with seed data | ✓        |
| pg_dump/restore      | Full PostgreSQL dump and restore        |          |
| Keep SQLite fallback | Maintain SQLite during transition       | ✓        |

**User's choice:** Prisma push + seeds with SQLite fallback for rollback (combination)
**Notes:** Safe migration path with rollback capability

---

## Integration points

| Option                 | Description                                     | Selected |
| ---------------------- | ----------------------------------------------- | -------- |
| Keep existing adapters | Ticket Tailor/Tikkie in lib/integrations remain | ✓        |
| Move to Edge Functions | Migrate integrations to Supabase Edge Functions |          |

**User's choice:** Keep existing adapters (recommended default - no need to change working integrations)
**Notes:** External integrations remain unchanged, only database and auth migrate

---

## the agent's Discretion

All decisions captured in CONTEXT.md represent recommended defaults based on:

- Existing Prisma setup → migrate, not rewrite
- Auth system → use native Supabase for cleaner integration
- Integration adapters → working code, no need to change
- Environment-driven config → preserved

---

## Deferred Ideas

- Edge Functions — mentioned as potential future phase
- Real-time subscriptions — noted for future consideration
- Production data migration — follow-up step after Supabase is live
