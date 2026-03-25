# Phase 11: Use Supabase - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Integrate Supabase as the backend-as-a-service platform, migrating from the current SQLite + Prisma setup to Supabase (PostgreSQL, Auth, and optional Edge Functions). This phase establishes Supabase as the primary backend infrastructure for the conference finance dashboard.

**In scope:**

- Set up Supabase project and PostgreSQL database
- Migrate existing Prisma schema to Supabase
- Migrate or transition authentication to Supabase Auth
- Deploy and verify backend services

**Out of scope for this phase:**

- Migrating existing production data (handled in follow-up migration step)
- Edge Functions (future phase if needed)
- Real-time subscriptions (future phase)

</domain>

<decisions>
## Implementation Decisions

### Database migration approach

- **D-01:** Use Prisma with Supabase PostgreSQL provider — keep Prisma as the ORM layer but switch datasource to Supabase PostgreSQL
- **D-02:** Use Supabase native migrations for schema changes alongside Prisma migrations for consistency
- **D-03:** Keep environment-driven database configuration (already established in project)

### Auth strategy

- **D-04:** Migrate from Better Auth to Supabase Auth — leverage Supabase's built-in auth for user management
- **D-05:** Use Supabase session management with httpOnly cookies for security
- **D-06:** Map existing user records to Supabase Auth users during migration

### Data migration

- **D-07:** Use pg_dump/restore or Prisma's `npx prisma db push` with seed data for initial migration
- **D-08:** Maintain SQLite as fallback during transition for rollback capability
- **D-09:** Preserve all existing Prisma models — just switch the datasource provider

### Integration points

- **D-10:** Keep Ticket Tailor and Tikkie integration adapters in `lib/integrations/` — they remain external
- **D-11:** Update DATABASE_URL and add Supabase-related env vars to `.env` template
- **D-12:** Keep API routes in `app/api/` but update database client initialization

</decisions>

<canonical_refs>

## Canonical References

### Project constraints

- `PROJECT.md` — Requires Next.js 16 + React 19 + shadcn/ui stack
- `PROJECT.md` — Must use Ticket Tailor as ticket/order source of truth
- `PROJECT.md` — Must use Tikkie for payment links

### Technical references

- No external specs for Supabase integration yet — this phase establishes the foundation

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- Prisma schema (`prisma/schema.prisma`) — All existing models will be migrated, just changing datasource
- Better Auth setup (`src/lib/auth.ts`) — Needs migration to Supabase Auth
- Integration adapters in `lib/integrations/ticket-tailor/*` and `lib/integrations/tikkie/*` — remain unchanged

### Established Patterns

- Environment-driven database config already exists via `DATABASE_URL` in `.env`
- Server-first data access pattern via Prisma in API routes
- Auth via Better Auth with middleware protection

### Integration Points

- Database client: `prisma` singleton in `src/lib/db.ts` (or similar)
- Auth: Better Auth in `src/lib/auth.ts`
- API routes in `app/api/` use the above clients

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard Supabase migration approach using Prisma with PostgreSQL provider.

</specifics>

<deferred>
## Deferred Ideas

- Edge Functions deployment — future phase if server-side logic needs to move out of Next.js
- Real-time subscriptions for live updates — future phase
- Production data migration — follow-up migration step after Supabase is live

</deferred>

---

_Phase: 11-use-supabase_
_Context gathered: 2026-03-25_
