# Phase 11: Use Better Convex - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate backend from SQLite/Prisma to Better Convex. Better Convex combines Better Auth (already in use!) with Convex ORM - giving you Prisma-like database access with type-safe cRPC. All code stays in the repo.

**In scope:**

- Set up Better Convex project
- Convert existing Prisma schema to Better Convex ORM schema
- Replace all Prisma queries with Better Convex functions
- Keep existing Better Auth (already implemented!) - just swap DB layer from Prisma to Convex
- Deploy and verify backend services

**Out of scope for this phase:**

- Migrating existing production data (handled in follow-up migration step)
- Real-time subscriptions (built into Convex, use in future phases)

</domain>

<decisions>
## Implementation Decisions

### Database migration approach

- **D-01:** Use Better Convex — replaces Prisma with Convex ORM + keeps Better Auth
- **D-02:** Keep all code in the repo — no external BaaS dashboard needed
- **D-03:** Use Convex's hosted PostgreSQL — data hosted but managed via code

### Auth strategy

- **D-04:** Keep Better Auth — already implemented, just change DB from Prisma to Convex
- **D-05:** Use Better Auth session management with httpOnly cookies for security
- **D-06:** No user migration needed — keep existing users in new Convex backend

### Data migration

- **D-07:** Convert Prisma models to Better Convex schema using `better-convex/orm`
- **D-08:** Replace all Prisma queries with Better Convex cRPC procedures
- **D-09:** Remove Prisma dependency entirely after migration

### Integration points

- **D-10:** Keep Ticket Tailor and Tikkie integration adapters in `lib/integrations/` — they remain external
- **D-11:** Add Convex env vars to `.env` template (NEXT_PUBLIC_CONVEX_URL, etc.)
- **D-12:** Update API routes to use Better Convex procedures instead of Prisma

</decisions>

<canonical_refs>

## Canonical References

### Project constraints

- `PROJECT.md` — Requires Next.js 16 + React 19 + shadcn/ui stack
- `PROJECT.md` — Must use Ticket Tailor as ticket/order source of truth
- `PROJECT.md` — Must use Tikkie for payment links

### Technical references

- Better Convex docs: https://www.better-convex.com/docs/quickstart
- Convex docs: https://docs.convex.dev
- Better Auth (current): `lib/auth.ts`, `lib/auth-client.ts`

</canonical_refs>

\n## Existing Code Insights

### Reusable Assets

- Existing models in `prisma/schema.prisma` — will be converted to Better Convex schema
- Better Auth setup (`lib/auth.ts`, `lib/auth-client.ts`) — KEEP, just change DB layer
- Integration adapters in `lib/integrations/ticket-tailor/*` and `lib/integrations/tikkie/*` — remain unchanged

### Established Patterns

- Server-first data access pattern via Prisma in API routes — will be replaced with Better Convex procedures
- Auth via Better Auth with middleware protection — STAYS, just swap DB backend

### Integration Points

- Database: Replace `prisma` singleton with Better Convex ORM
- Auth: Keep Better Auth (no changes needed!)
- API routes in `app/api/` will be replaced by Better Convex procedures (backend) + client calls (frontend)

</code_context>

<specifics>
## Specific Ideas

- All code stays in repo - Convex provides hosted PostgreSQL but management is via code
- Better Convex functions replace Prisma queries - simpler, less boilerplate
- Keep existing Better Auth - just swap the DB backend from Prisma to Convex
- Real-time subscriptions built-in for future phases

</specifics>

<deferred>
## Deferred Ideas

- Real-time subscriptions for live updates — Better Convex has this built-in, enable in future phase
- Production data migration — follow-up after Better Convex is live

</deferred>

---

_Phase: 11-use-convex_
_Context gathered: 2026-03-25_
