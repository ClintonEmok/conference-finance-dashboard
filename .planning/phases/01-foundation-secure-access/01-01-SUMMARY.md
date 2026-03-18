---
phase: 01-foundation-secure-access
plan: 01
subsystem: auth
tags: [nextjs, better-auth, magic-link, prisma, sqlite, middleware]

# Dependency graph
requires:
  - phase: project-bootstrap
    provides: Next.js 16 App Router and shadcn baseline
provides:
  - Better Auth magic-link backend and App Router auth endpoints
  - Protected dashboard routes with callbackUrl-preserving login redirects
  - Protected API contract returning explicit 401 UNAUTHORIZED JSON
affects: [phase-02-ticket-data-reliability, phase-03-finance-visibility]

# Tech tracking
tech-stack:
  added: [better-auth, '@better-auth/prisma-adapter', prisma, '@prisma/client']
  patterns:
    - Server-authoritative session checks using auth.api.getSession in protected layouts/routes
    - Middleware cookie check for optimistic auth redirects
    - SQLite-first Prisma schema kept provider-switch friendly via env-driven DATABASE_URL

key-files:
  created:
    - app/api/auth/[...all]/route.ts
    - app/login/page.tsx
    - app/login/login-form.tsx
    - app/dashboard/layout.tsx
    - app/dashboard/page.tsx
    - app/api/protected/ping/route.ts
    - lib/auth.ts
    - lib/auth-client.ts
    - lib/prisma.ts
    - prisma/schema.prisma
    - prisma/migrations/20260318175357_init_auth/migration.sql
  modified:
    - package.json
    - bun.lockb

key-decisions:
  - "Use Better Auth with Prisma adapter and SQLite for local dev while keeping env/provider path for later Postgres cutover."
  - "Use middleware for redirect UX and server-side layout checks for authoritative protection."
  - "Use explicit 401 JSON contract on protected API routes with UNAUTHORIZED error code."

patterns-established:
  - "Auth guard pattern: middleware redirect + layout getSession check."
  - "Operational auth API errors are structured as { error: { code, message } }."

# Metrics
duration: 31min
completed: 2026-03-18
---

# Phase 1 Plan 01: Magic-Link Auth and Protected Access Summary

**Better Auth magic-link authentication with Prisma-backed sessions, callback-preserving dashboard protection, and explicit protected API unauthorized responses.**

## Performance

- **Duration:** 31 min
- **Started:** 2026-03-18T17:50:01Z
- **Completed:** 2026-03-18T18:02:04Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments
- Implemented Better Auth server config and Next.js App Router auth handlers.
- Added login and dashboard session guardrails with callbackUrl-aware redirect flow.
- Added protected API reference endpoint with required 401 `UNAUTHORIZED` JSON contract.

## Task Commits

1. **Task 1: Set up Better Auth magic-link backend for App Router** - `7e0e880` (feat)
2. **Task 2: Implement login flow + route protection with callbackUrl redirecting** - `e6495ac` (feat)
3. **Task 3: Enforce protected API unauth behavior for server actions/routes** - `e79ef9a` (feat)

## Files Created/Modified
- `lib/auth.ts` - Better Auth configuration with magic-link plugin and rolling 7-day session
- `app/api/auth/[...all]/route.ts` - GET/POST Better Auth App Router handlers
- `middleware.ts` - redirect rules for `/dashboard` and `/login` with callback handling
- `app/login/page.tsx`, `app/login/login-form.tsx` - magic-link request UI + submit flow
- `app/dashboard/layout.tsx` - server session gate and logout server action
- `app/api/protected/ping/route.ts` - required 401/200 protected API contract
- `prisma/schema.prisma`, `prisma/migrations/...` - local SQLite auth schema and migration

## Decisions Made
- Used Prisma + SQLite locally for fast setup, while keeping `DATABASE_URL` and adapter provider strategy migration-friendly.
- Added development-safe fallback for auth URL/secret to keep build and local checks running without immediate secret provisioning.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma 7 blocked by local Node runtime constraints**
- **Found during:** Task 1
- **Issue:** `prisma@7` preinstall failed due unsupported Node version in this environment.
- **Fix:** Pinned `prisma` and `@prisma/client` to `6.19.0` and completed migration/generation.
- **Files modified:** `package.json`, `bun.lockb`
- **Verification:** `npx prisma migrate dev` succeeded and generated client.
- **Committed in:** `7e0e880`

**2. [Rule 3 - Blocking] Build failed when auth env vars were absent**
- **Found during:** Task 2 verification
- **Issue:** App build crashed on missing `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET`.
- **Fix:** Added local-development fallbacks with warnings in `lib/auth.ts`.
- **Files modified:** `lib/auth.ts`
- **Verification:** `npm run build` completed successfully.
- **Committed in:** `e6495ac`

**3. [Rule 1 - Bug] Login route prerender failed due client search param usage**
- **Found during:** Task 2 verification
- **Issue:** `useSearchParams` without suspense boundary caused prerender error for `/login`.
- **Fix:** Split page into server `page.tsx` + client `login-form.tsx`; resolved callback on server.
- **Files modified:** `app/login/page.tsx`, `app/login/login-form.tsx`
- **Verification:** `npm run build` passed.
- **Committed in:** `e6495ac`

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All fixes were required to keep implementation functional and verifiable in local environment.

## Issues Encountered
- Existing lint warning in baseline `app/layout.tsx` (`Geist` unused) persists; non-blocking and outside plan scope.

## User Setup Required

External services require manual configuration via local env vars (see required env section in execution report).

## Next Phase Readiness
- Auth/session foundation is complete and ready for integration-aware phase work.
- Provider auth modes and sandbox/test endpoint choices should be confirmed before deeper Ticket Tailor/Tikkie workflows.

---
*Phase: 01-foundation-secure-access*
*Completed: 2026-03-18*
