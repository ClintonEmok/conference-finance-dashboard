# Phase 1: Foundation & Secure Access - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish baseline authenticated access and integration configuration for the finance dashboard. This phase covers sign-in/session behavior and safe Ticket Tailor/Tikkie configuration visibility, but does not include ticket sync workflows or payment-link operations.

</domain>

<decisions>
## Implementation Decisions

### Access scope for v1
- Authenticated user accounts are required to access finance routes.
- For internal v1 operations, all authenticated users are treated as finance users.
- No per-admin authorization layer in this phase.

### Account model and revocation
- Keep account model simple with no role system in Phase 1.
- If a finance access toggle is present in data, revocation is manual via DB update.
- Do not build role management UI in this phase.

### Login and session behavior
- Use email magic-link authentication.
- Session duration is 7 days with rolling renewal.
- Include visible one-click logout in dashboard header.
- After successful login, redirect users to the last attempted protected route.

### Unauthenticated and denied behavior
- Unauthenticated page access redirects to login.
- Unauthenticated API/server action access returns `401` JSON with a clear error code.
- Denied/auth messaging uses neutral operational tone.

### Integration configuration UX
- Ticket Tailor and Tikkie credentials are managed via environment variables only in Phase 1.
- Tikkie configuration uses `TIKKIE_API_KEY` and `TIKKIE_APP_TOKEN` (no IBAN env required in this phase).
- Missing/invalid config should soft-fail: app remains usable while integrations are marked not configured.
- Show integration config status in an internal `/dashboard/integrations` status panel.
- Runtime validation includes presence checks, basic format checks, and provider connectivity ping.

### Claude's Discretion
- Exact auth library/provider implementation details consistent with Next.js App Router.
- Concrete UI structure/styling for login and integration status pages.
- Exact validation error copy while preserving neutral operational tone.

</decisions>

<specifics>
## Specific Ideas

- Keep initial internal workflow practical: user accounts first, granular authorization later.
- "Webhook + API" ingestion strategy is expected for Ticket Tailor in later phases (webhook trigger, API verification/backfill), but implementation remains out of scope for Phase 1.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/ui/button.tsx`: ready for auth and integration settings actions.
- `components/theme-provider.tsx`: existing app-level provider pattern to follow for global concerns.
- `lib/utils.ts`: shared `cn` utility for consistent class composition.

### Established Patterns
- Next.js App Router baseline with `app/layout.tsx` and `app/page.tsx` only; no auth or route-guard implementation yet.
- shadcn/ui styling foundation is in place and should be reused for all new surfaces.

### Integration Points
- Add protected dashboard routes under `app/` with auth/session guardrails.
- Add integration config status surface at `/dashboard/integrations`.
- Add integration adapters and config validation entrypoints under `lib/integrations/ticket-tailor/*` and `lib/integrations/tikkie/*`.

</code_context>

<deferred>
## Deferred Ideas

- Fine-grained admin authorization (true admin vs non-admin restrictions) is deferred to a later phase.
- Role-based access control is deferred beyond Phase 1.

</deferred>

---

*Phase: 01-foundation-secure-access*
*Context gathered: 2026-03-18*
