# Phase 11: Use Supabase - Research

**Researched:** 2026-03-25
**Status:** Research complete

## Domain: Supabase Migration from SQLite/Prisma

### What is Supabase?

Supabase is an open-source Firebase alternative that provides:

- PostgreSQL database (hosted or self-hosted)
- Built-in Auth (email, social, magic links)
- Auto-generated APIs (PostgREST)
- Edge Functions (Deno/TypeScript)
- Real-time subscriptions
- Storage

### Key Architectural Decisions

#### 1. Database Migration Approach

**Option A: Prisma with Supabase PostgreSQL provider**

- Keep existing Prisma ORM layer
- Switch datasource provider from `sqlite` to `postgresql`
- Use `npx prisma db push` or migrations to sync schema
- **Pros:** Minimal code changes, keeps existing patterns
- **Cons:** Doesn't leverage Supabase features directly

**Option B: Direct Supabase Client (postgrest-js)**

- Replace Prisma with Supabase's JavaScript client
- Write raw SQL queries via Supabase RPC
- **Pros:** Full Supabase feature access, smaller bundle
- **Cons:** Major refactoring, lose Prisma type safety

**Recommendation:** Option A (Prisma with Supabase) — aligns with D-01 in context

#### 2. Auth Migration from Better Auth

**Current state:** Project uses Better Auth with SQLite
**Target:** Supabase Auth

Migration approaches:

1. **Parallel auth period:** Run both Auth systems, migrate users gradually
2. **Big bang migration:** Create Supabase Auth users, map to existing records
3. **Keep Better Auth:** Use Supabase only for DB, keep existing auth

**Recommendation:** Big bang with user mapping (D-04, D-06) — Supabase Auth is well-documented

#### 3. Environment Configuration

Required env vars:

```
DATABASE_URL=postgresql://user:pass@host:5432/db
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx (server-only)
```

Existing `.env` structure needs:

- Replace SQLite URL with PostgreSQL URL
- Add Supabase-specific vars

### Implementation Roadmap

#### Phase 11 Scope (per CONTEXT.md):

1. **Set up Supabase project**
   - Create Supabase project (supabase.com)
   - Get connection string and API keys
   - Configure IP allowlist (if needed)

2. **Migrate Prisma schema**
   - Update `prisma/schema.prisma`: datasource provider to `postgresql`
   - Run `npx prisma db push` to create tables in Supabase
   - Seed initial data if needed

3. **Migrate Authentication**
   - Set up Supabase Auth configuration
   - Create user migration script (map existing users)
   - Update auth client initialization

4. **Verify backend services**
   - Test all API routes with new database
   - Verify auth flow end-to-end
   - Check integration points (Ticket Tailor, Tikkie)

### Technical Considerations

#### Connection Pooling

Supabase uses PgBouncer for connection pooling:

- Serverless functions need connection pooling
- Use `pool_mode=transaction` for Next.js API routes
- Consider using Supabase's connection string with pooling

#### Migration Strategy

1. **Backup:** Export current SQLite data
2. **Schema push:** `npx prisma db push` to Supabase
3. **Data migration:** Export from SQLite, import to Supabase
4. **Verify:** Check data integrity
5. **Switch:** Update DATABASE_URL to Supabase

#### Auth Considerations

- Supabase Auth uses different user IDs than Better Auth
- Need to map/translate user IDs in database
- Session management via httpOnly cookies (D-05)
- Consider using Supabase's built-in MFA if needed

### Common Pitfalls

1. **Connection pool exhaustion:** Next.js API routes create many connections
   - Fix: Use connection pooler, set `pool=true` in connection string

2. **Auth token expiry:** Supabase tokens have configurable expiry
   - Fix: Set appropriate `access_token` and `refresh_token` expiry

3. **Missing migrations:** Prisma migrations may fail on first push
   - Fix: Use `prisma db push --force-reset` for fresh start

4. **Row Level Security:** Supabase uses RLS by default
   - Fix: Configure RLS policies or disable for internal tools

### Files to Modify

Based on CONTEXT.md:

- `prisma/schema.prisma` — Update datasource provider
- `src/lib/db.ts` — Update database client initialization
- `src/lib/auth.ts` — Migrate from Better Auth to Supabase Auth
- `.env` — Add Supabase configuration
- `.env.example` — Document new env vars
- API routes in `app/api/` — Update to use Supabase client

### Testing Strategy

1. **Unit tests:** Update test database configuration
2. **Integration tests:** Run against Supabase test project
3. **E2E tests:** Verify auth flow end-to-end
4. **Manual testing:** Full operator workflow verification

---

## Validation Architecture

### Verification Approach

Since this is a migration phase, verification focuses on:

1. **Schema integrity:** All tables and relationships preserved
2. **Data integrity:** Records match between old and new DB
3. **Auth continuity:** Users can log in with existing credentials (mapped)
4. **API functionality:** All endpoints work with new database

### Verification Methods

1. **Database:**
   - Compare table counts between SQLite and Supabase
   - Verify foreign key relationships
   - Check data types match

2. **Auth:**
   - Test login with existing user (via migration mapping)
   - Test new user registration
   - Verify session persistence

3. **API:**
   - Run existing test suite against Supabase
   - Manually verify key workflows

### Rollback Plan

- Keep SQLite connection string in `.env.backup`
- Document rollback steps in migration guide
- Test rollback before production switch
