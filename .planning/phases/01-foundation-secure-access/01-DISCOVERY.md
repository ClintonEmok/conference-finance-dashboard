# Phase 1 Discovery: Foundation & Secure Access

**Date:** 2026-03-18  
**Discovery Level:** Level 2 (standard research)  
**Why Level 2:** New external auth library selection + App Router integration details for magic-link auth.

## Research Questions

1. What auth approach best fits Next.js App Router + email magic-link requirement?
2. How should route/API protection be implemented in Next.js 16?
3. What runtime/session patterns should plans enforce to avoid weak protection?

## Sources

- Context7: `/better-auth/better-auth`
- Context7: `/vercel/next.js/v16.1.6`

## Findings

### Auth library recommendation

Use **Better Auth** for Phase 1.

- Supports magic-link flow via plugin (`magicLink`) with explicit `sendMagicLink` callback.
- Provides Next.js App Router handler bridge via `toNextJsHandler(auth)`.
- Supports server-side session reads (`auth.api.getSession({ headers })`) for protected pages/routes.

### Route/API protection pattern

- Use App Router server guards for protected pages/layouts (authoritative check).
- Use middleware for optimistic redirect UX (unauthenticated -> login, login -> dashboard when session exists).
- For protected API/server actions, return explicit `401` JSON payloads for unauthenticated requests.

### Callback URL behavior

- Preserve requested destination via `callbackUrl` query parameter and send it into magic-link sign-in.
- On successful verification, redirect to callback URL (default `/dashboard`).

## Decision Applied to Planning

Phase 1 plans should implement:

1. Better Auth-based magic-link login + 7-day rolling session.
2. Protected dashboard/page + API access rules (redirect for pages, `401` JSON for API/actions).
3. Integration config runtime validation/status panel, with app soft-fail when integrations are not configured.
