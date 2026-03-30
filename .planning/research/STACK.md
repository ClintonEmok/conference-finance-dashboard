# Technology Stack Research — v2.0 Signup Replan

**Project:** Conference Finance Dashboard
**Researched:** 2026-03-29
**Scope:** Non-admin multi-step signup + accommodation self-assignment

## Keep As-Is

No platform migration is required.

- Next.js 16 + React 19
- Convex backend contracts
- Clerk auth boundary for dashboard/operator routes
- shadcn/ui + Tailwind UI stack

## Recommended Additions (Only if missing)

- `react-hook-form`
- `@hookform/resolvers`
- `zod`
- `@convex-dev/rate-limiter`

These support robust form UX, shared validation ergonomics, and public-submit abuse controls.

## Backend Guardrail Requirements

- Keep Convex function validators strict on public boundaries
- Use indexed/bounded reads, avoid unbounded scans
- Keep submission writes in one mutation transaction
- Add rate limiting at mutation boundary for public submit paths

## UI/UX Implementation Notes

- Multi-step state can be handled with existing React patterns; no extra wizard framework is needed
- Existing shadcn primitives are sufficient for step content, form inputs, and validation messaging

## Not Required for v2.0

- CAPTCHA provider integration (defer unless abuse exceeds rate-limit/honeypot effectiveness)
- Public auth/account frameworks for attendees
- New analytics/error-tracking platform specifically for signup milestone

## Recommendation

Proceed with current stack and minimal additions; invest effort in contract correctness and guardrails rather than introducing new infrastructure.
