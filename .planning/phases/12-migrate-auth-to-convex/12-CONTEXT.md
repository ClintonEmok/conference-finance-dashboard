# Phase 12: migrate auth to convex - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate authentication from Prisma/SQLite to Convex. Currently auth uses better-auth with prismaAdapter, while all app data is on Convex (Phase 11). This phase creates a single backend — Convex for everything including auth.

**In scope:**

- Replace prismaAdapter with better-convex/auth adapter
- Rewrite auth route handlers
- Remove Prisma dependency entirely (schema, client, SQLite database)
- Verify login/logout/session flow works end-to-end

**Out of scope:**

- Real-time session subscriptions (future phase if needed)
- User migration from production SQLite (separate migration step)
- Multi-factor authentication

</domain>

<decisions>
## Implementation Decisions

### Adapter strategy

- **D-01:** Use `better-convex/auth` adapter (official integration from installed package)
- **D-02:** Adapter maps to existing Convex auth tables (users, sessions, accounts, verifications)

### Session handling

- **D-03:** Keep HTTP-based sessions (cookie auth with httpOnly cookies)
- **D-04:** No real-time session subscriptions — standard middleware checks
- **D-05:** Keep existing session config: 7-day expiry, 1-day update age

### Migration cutover

- **D-06:** Clean break — remove Prisma entirely after Convex auth verified
- **D-07:** Delete prisma/schema.prisma, lib/prisma.ts, and SQLite database file
- **D-08:** Test login/logout/session-check flow before removing Prisma

### Auth route updates

- **D-09:** Rewrite auth route handlers (clean slate approach)
- **D-10:** Update `lib/auth.ts` to use better-convex/auth config
- **D-11:** Auth API contract stays the same (same endpoints, same response shapes)

### the agent's Discretion

- Specific better-convex/auth configuration options
- How to handle existing SQLite users (migration script vs fresh start)
- Exact route handler implementation

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auth integration

- `node_modules/better-convex/dist/auth/config/index.d.ts` — better-convex auth config API
- `node_modules/better-convex/dist/auth/index.d.ts` — better-convex auth adapter API
- `lib/auth.ts` — current auth implementation (prismaAdapter)
- `app/api/auth/[...all]/route.ts` — current auth route handler

### Convex schema

- `convex/schema.ts` — has auth tables (users, sessions, accounts, verifications)

### Phase 11 context

- `.planning/phases/11-use-convex/11-CONTEXT.md` — decisions about Convex migration that affect auth

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `convex/schema.ts`: Auth tables already defined (users, sessions, accounts, verifications)
- `better-convex/auth`: Official adapter for better-auth → Convex
- `lib/auth.ts`: Current auth setup to migrate from

### Established Patterns

- All other data uses Convex HTTP queries via `lib/convex/server.ts` (convexQuery/convexMutation)
- API routes follow the pattern of auth check → Convex query → response
- Middleware in `middleware.ts` checks session validity

### Integration Points

- `lib/auth.ts` — exports `auth` instance used by all routes
- `app/api/auth/[...all]/route.ts` — better-auth HTTP handler
- `middleware.ts` — session validation for protected routes
- All API routes call `auth.api.getSession({ headers })` for auth checks

</code_context>

<specifics>
## Specific Ideas

- "Clean break — single backend, no confusion"
- Keep existing login page UI, just change backend
- Test thoroughly before removing Prisma

</specifics>

<deferred>
## Deferred Ideas

- Real-time session subscriptions — future phase if needed
- User migration from production SQLite — separate migration step

</deferred>

---

_Phase: 12-migrate-auth-to-convex_
_Context gathered: 2026-03-25_
