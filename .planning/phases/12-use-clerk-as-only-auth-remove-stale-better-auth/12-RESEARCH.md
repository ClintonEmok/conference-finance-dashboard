# Phase 12 Research — Use Clerk as the Only Auth System

**Date:** 2026-03-26
**Discovery level:** 2 — standard research
**Why:** The auth provider is already chosen, but this phase changes the app’s server auth model, protected-route behavior, Convex auth bridge, and cleanup boundaries.

## Question

What does the codebase need in order to replace Better Auth completely with Clerk, keep protected dashboard/API behavior intact, and make Convex use Clerk identity tokens?

## Current State

- Clerk shell wiring already exists from quick task `260326-163`:
  - `proxy.ts` exists but currently does not protect routes.
  - `app/layout.tsx` already wraps the app in `ClerkProvider`.
  - `app/page.tsx` already uses Clerk UI primitives.
- Better Auth still powers the actual protected experience:
  - `app/dashboard/layout.tsx` and `app/dashboard/integrations/page.tsx` call `auth.api.getSession(...)` from `@/lib/auth`.
  - 40+ protected API routes still import `@/lib/auth` and call `auth.api.getSession(...)`.
  - `app/login/page.tsx`, `app/login/login-form.tsx`, `app/api/auth/[...all]/route.ts`, `lib/auth.ts`, and `lib/auth-client.ts` are Better Auth-specific.
- Convex auth wiring is incomplete:
  - `convex/auth.config.ts` exists with Clerk issuer config.
  - `lib/convex/client.tsx` still uses plain `ConvexProvider`, so authenticated Clerk tokens are not sent to Convex.

## Documentation Findings

### Clerk (Context7: `/clerk/clerk-docs`)

Current Next.js App Router guidance:

1. Use `clerkMiddleware()` from `@clerk/nextjs/server` in `proxy.ts`.
2. Protect routes with `createRouteMatcher()` + `await auth.protect()`.
3. Use `auth()` in server components and route handlers for auth state.
4. Use `currentUser()` only when user profile fields are needed.
5. Keep `ClerkProvider` inside `<body>`.
6. `Show` is current; `SignedIn`/`SignedOut` are deprecated.

Relevant example pattern:

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect()
})
```

Relevant server-side access pattern:

```ts
import { auth, currentUser } from "@clerk/nextjs/server"

const { isAuthenticated, redirectToSignIn, userId } = await auth()
if (!isAuthenticated) return redirectToSignIn()
const user = await currentUser()
```

### Convex (Context7: `/websites/convex_dev`)

Current Clerk integration guidance:

1. Use `ConvexProviderWithClerk` from `convex/react-clerk` instead of plain `ConvexProvider` when Clerk auth is active.
2. Pass Clerk’s `useAuth` hook to the Convex provider.
3. Keep `convex/auth.config.ts` with:
   - `domain: process.env.CLERK_JWT_ISSUER_DOMAIN!`
   - `applicationID: "convex"`
4. Clerk must have a JWT template for Convex, and Convex must know the issuer domain.

Relevant client pattern:

```tsx
"use client"

import { ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { useAuth } from "@clerk/nextjs"
```

## Recommended Migration Shape

### 1. Establish one shared Clerk auth layer for server code

Create a small internal auth helper module that centralizes:

- unauthenticated API response contract:
  ```json
  { "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }
  ```
- page-level sign-in redirects with explicit `returnBackUrl`
- current user email lookup for `DashboardShell`

Why: 40+ protected route handlers already share one auth pattern; replacing that pattern once prevents drift.

### 2. Protect dashboard pages with Clerk middleware, not Better Auth redirects

Use `createRouteMatcher(["/dashboard(.*)"])` in `proxy.ts` and `await auth.protect()`.

Why: this restores fast route protection at the middleware layer while keeping Clerk on the supported App Router path.

### 3. Move page and route-handler checks to `auth()`

Replace `auth.api.getSession({ headers: await headers() })` with Clerk helpers.

Use cases:

- Server components/pages: `auth()` + `currentUser()` when email is needed.
- Route handlers: `auth()` only; user profile lookup is unnecessary unless a route needs display info.

### 4. Switch Convex client auth from anonymous to Clerk-aware

Update `lib/convex/client.tsx` to use `ConvexProviderWithClerk` with Clerk `useAuth`.

Why: without this, Convex functions using `ctx.auth.getUserIdentity()` still see anonymous traffic even if the Next.js app is signed in with Clerk.

### 5. Keep public webhook routes public

Do **not** protect these with Clerk:

- `app/api/webhooks/tikkie/route.ts`
- `app/api/webhooks/ticket-tailor/route.ts`

These are provider-to-provider callbacks, not operator-facing routes.

### 6. Remove Better Auth only after imports are gone

Delete Better Auth files and remove packages only after the codebase no longer imports:

- `@/lib/auth`
- `@/lib/auth-client`
- `better-auth`
- `better-auth/next-js`
- `better-auth/react`

This prevents mid-migration type/build failures.

## Cleanup Boundaries

### In scope

- Replace Better Auth runtime usage with Clerk.
- Replace Better Auth-protected dashboard/API guards with Clerk equivalents.
- Enable authenticated Convex requests through Clerk.
- Remove stale Better Auth files and packages once unused.

### Out of scope

- Full Clerk organizations/roles model.
- Re-modeling authorization beyond current “signed-in finance admin app” behavior.
- Broad Prisma history cleanup in `prisma/` migrations/schema.
- Public webhook auth redesign.

## Risks / Common Failure Modes

1. **Route protection gap**
   - Risk: leaving `proxy.ts` as a no-op means signed-out users can still hit dashboard pages until server code redirects.
   - Mitigation: protect `/dashboard(.*)` in middleware.

2. **Convex remains anonymous**
   - Risk: app pages sign in with Clerk, but Convex requests still use plain `ConvexProvider`.
   - Mitigation: switch to `ConvexProviderWithClerk`.

3. **Protected API contract drift**
   - Risk: swapping auth helper route-by-route changes 401 payloads.
   - Mitigation: centralize the unauthorized JSON contract in one helper.

4. **Breaking cleanup order**
   - Risk: removing Better Auth packages before all route/page imports move off them.
   - Mitigation: cleanup is the final execution wave.

5. **Dashboard sign-in redirect regressions**
   - Risk: stale `/login` redirects survive after Better Auth removal.
   - Mitigation: replace `/login` references with Clerk sign-in redirects or a compatibility redirect page.

## Validation Architecture

### Fast checks after each task

- `npm run typecheck`
- `npm test -- tests/ticket-tailor/sync-route.test.ts tests/tikkie/subscription-route.test.ts tests/tikkie/tikkie-links.test.ts`

### Full phase checks

- `npm run build`
- `npm run typecheck`
- `npm test`
- `grep -R "better-auth\|auth.api.getSession\|@/lib/auth-client" app lib tests package.json`

### Manual checks required

1. Open `/` signed out and verify Clerk sign-in/sign-up UI still works.
2. Attempt `/dashboard` signed out and verify Clerk redirects to sign-in.
3. Sign in and verify dashboard loads with user email shown.
4. Log out and verify dashboard becomes inaccessible again.

## Planning Implications

- The phase should be split into four plans:
  1. Clerk/Convex auth foundation
  2. Dashboard route + login/logout UX migration
  3. Protected API route migration + test updates
  4. Better Auth cleanup + end-to-end human verification
- Best dependency graph:
  - Wave 1: foundation
  - Wave 2: dashboard UX and API migration in parallel
  - Wave 3: cleanup + verification
