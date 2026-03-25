# Phase 12: migrate auth to convex - Research

**Date:** 2026-03-25
**Status:** Complete
**Discovery level:** 2 - Standard Research

## Question

What do we need to know to plan a safe migration from Prisma-backed Better Auth to Convex-backed Better Auth without changing the app's auth contract?

## Sources

- Context7 `/udecode/better-convex` — auth/server and nextjs setup docs
- Context7 `/better-auth/better-auth` — Next.js route handler and session configuration docs
- `node_modules/better-convex/dist/auth/index.d.ts`
- `node_modules/better-convex/dist/auth/nextjs/index.d.ts`
- `node_modules/better-convex/dist/auth/config/index.d.ts`
- `convex/functions/generated/auth.ts`
- `convex/schema.ts`
- `convex/functions/schema.ts`
- `lib/auth.ts`
- `app/api/auth/[...all]/route.ts`

## Key Findings

### 1. The current Convex schema is not adapter-ready yet

`better-convex/auth` is generated around singular Better Auth model names (`user`, `session`, `account`, `verification`) rather than this repo's current plural tables (`users`, `sessions`, `accounts`, `verifications`). The generated helper types in `node_modules/better-convex/dist/auth/index.d.ts` also reference `user` and `session` directly.

**Planning implication:** the phase must include an auth-table schema adjustment in both `convex/schema.ts` and `convex/functions/schema.ts`, plus codegen regeneration.

### 2. This repo already has the generated Better Convex auth runtime hook point

`convex/functions/generated/auth.ts` is present, but currently disabled with `missing_auth_file`. That means Better Convex expects a real auth definition file to exist in the Convex functions tree before codegen/runtime can activate auth.

**Planning implication:** create `convex/functions/auth.ts` and regenerate Better Convex code so generated auth exports become live instead of disabled.

### 3. Better Auth session settings can stay unchanged

Better Auth docs confirm the existing settings are valid:

- `session.expiresIn = 60 * 60 * 24 * 7`
- `session.updateAge = 60 * 60 * 24`
- `emailAndPassword.enabled = true`

**Planning implication:** preserve the current cookie/session contract and avoid UI or middleware churn.

### 4. The `/api/auth/[...all]` route can keep the same external endpoint

Better Auth Next.js docs still use `toNextJsHandler(auth)`. Better Convex docs also support a Next.js handler path. Either way, the external route contract can stay `/api/auth/[...all]`.

**Planning implication:** keep the endpoint stable and focus migration effort behind `lib/auth.ts` and Convex auth runtime wiring.

### 5. Prisma removal is safe only after auth regression coverage exists

Phase 11 intentionally left Prisma in place only for auth. Once auth switches to Convex, the remaining Prisma runtime files and packages become dead weight.

**Planning implication:** add targeted auth regression checks before deleting Prisma artifacts, then verify no runtime imports remain.

## Recommended Implementation Shape

### Standard stack

- `better-auth@1.5.x`
- `better-convex@0.11.x`
- existing Next.js App Router auth route
- existing Better Auth React client (`createAuthClient`) on the frontend
- existing middleware redirect model (`getSessionCookie` + `/login?callbackUrl=`)

### Architecture pattern

1. **Convex auth foundation**
   - Add `convex/functions/auth.ts`
   - Make auth tables adapter-compatible in both schema files
   - Regenerate Better Convex codegen outputs

2. **Server contract preservation**
   - Keep `lib/auth.ts` as the app-facing auth entrypoint
   - Keep `/api/auth/[...all]` stable
   - Keep `auth.api.getSession({ headers })` usable across server components and route handlers

3. **Safe cutover**
   - Add auth regression tests and/or focused route verification first
   - Remove Prisma package/runtime/files only after Convex-backed auth passes

## Don’t Hand-Roll

- Do **not** build custom user/session CRUD around Convex tables when `better-convex/auth` already provides the adapter/runtime path.
- Do **not** change login/signup/logout UI behavior unless the migration forces a contract change.
- Do **not** introduce real-time auth/session subscriptions in this phase.
- Do **not** keep a dual Prisma + Convex auth runtime after verification; the phase context explicitly chose a clean break.

## Common Pitfalls

1. **Plural auth tables**
   - Risk: adapter/runtime expects singular model names and generated helpers never line up with schema.
   - Guardrail: explicitly migrate auth tables to adapter-compatible names before codegen/verification.

2. **Disabled generated auth runtime**
   - Risk: `convex/functions/generated/auth.ts` continues exporting `createDisabledAuthRuntime`.
   - Guardrail: verify codegen output no longer contains `missing_auth_file` before wiring app code to it.

3. **Breaking `auth.api.getSession` consumers**
   - Risk: dozens of server routes/components depend on the current auth entrypoint contract.
   - Guardrail: preserve `lib/auth.ts` as the compatibility layer and regression-test at least one protected route and one dashboard server component path.

4. **Deleting Prisma too early**
   - Risk: build/test failures after removing dependencies reveal hidden auth coupling.
   - Guardrail: run auth-focused tests, full `npm test`, `npm run typecheck`, and `npm run build` after the cutover.

## Validation Architecture

### Required automated checks

- `npm test -- tests/auth/*.test.ts` once auth tests exist
- `npm test -- tests/ticket-tailor/sync-route.test.ts` to ensure the common `auth.api.getSession` mock pattern still works
- `npm run typecheck`
- `npm run build`

### Manual checks

- Sign up from `/login`
- Sign in from `/login`
- Visit `/dashboard` while signed out and confirm redirect to `/login?callbackUrl=%2Fdashboard`
- Sign out and confirm redirect back to `/login`
- Refresh `/dashboard` while signed in and confirm session persists

### Plan-level verification target

The phase is complete only when:

1. Auth requests are backed by Convex, not Prisma.
2. Existing login/signup/logout/session behavior still works.
3. No runtime Prisma dependency remains in app code or package dependencies.

## Planning Consequences

This phase should be split into **2 plans**:

1. **Foundation plan** — schema compatibility, Convex auth definition, generated runtime activation, app auth entrypoint wiring.
2. **Cutover plan** — regression coverage, Prisma removal, end-to-end verification.
