---
phase: 17-fix-critical-code-review-issues
plan: "03"
subsystem: infra
tags: [rate-limiting, timeout, retry, fetch, integration-hardening]

requires:
  - phase: 17-02
    provides: Webhook signature verification and auth config fail-closed

provides:
  - Shared in-memory rate limiter applied to webhook, operator, and sync routes
  - AbortController-based timeout handling for both Tikkie and Ticket Tailor fetch clients
  - Bounded retry with exponential backoff for 5xx and transient network failures

affects:
  - Phase 18 (schema work — hardened transport layer for upstream integrations)
  - Any future integration clients (pattern reference for timeout + retry)

tech-stack:
  added: []
  patterns:
    - In-memory sliding-window rate limiter keyed by IP + route
    - AbortController timeout wrapper for fetch with clean timer cleanup
    - Bounded retry with exponential backoff for retry-safe methods only

key-files:
  created:
    - lib/rate-limit.ts
  modified:
    - lib/integrations/tikkie/client.ts
    - lib/integrations/ticket-tailor/client.ts
    - app/api/webhooks/tikkie/route.ts
    - app/api/webhooks/ticket-tailor/route.ts
    - app/api/dashboard/tikkie-links/route.ts
    - app/api/dashboard/tikkie-event-links/route.ts
    - app/api/dashboard/tikkie-event-links/auto-match/route.ts
    - app/api/ticket-tailor/sync/route.ts
    - app/api/jobs/tikkie/full-sync/route.ts

key-decisions:
  - "In-memory rate limiter suitable for single-instance deployments; swap backing store for Redis at multi-instance scale"
  - "Webhook routes use 120/min limit (external integrations), operator routes 60/min, sync jobs 10/min (expensive operations)"
  - "Tikkie retries only GET requests to avoid duplicate payment mutations; Ticket Tailor retries all (read-only API)"
  - "15s default timeout on both clients with env-var overrides for deployment-specific tuning"

patterns-established:
  - "Rate limiting: import enforceRateLimit from lib/rate-limit.ts, call before auth, check result for early return"
  - "Timeout: fetchWithTimeout helper wrapping AbortController + setTimeout with cleanup on both paths"
  - "Retry: maxAttempts = retrySafe ? maxRetries + 1 : 1, exponential backoff 500ms * attempt, bail on 4xx"

requirements-completed: []

duration: 15min
completed: 2026-03-29
---

# Phase 17 Plan 03: Transport-Level Integration Hardening Summary

**Shared rate limiting, fetch timeouts, and bounded retry for Tikkie and Ticket Tailor integration routes**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-29T00:47:00Z
- **Completed:** 2026-03-29T01:03:00Z
- **Tasks:** 3
- **Files modified:** 9 created/modified

## Accomplishments

- Created shared `lib/rate-limit.ts` with in-memory sliding-window rate limiter and applied it to all 7 target routes (webhooks, operator, sync)
- Added `AbortController`-based timeout handling to both Tikkie and Ticket Tailor fetch clients, reusing the pattern from `lib/integrations/status.ts`
- Added bounded retry behavior (max 2 retries, exponential backoff) for 5xx, 429, and transient network errors, with method-aware retry gating for Tikkie

## Task Commits

1. **Task 1: Shared rate limiting** - `7c84bb8` (feat)
2. **Task 2: Timeout handling** - `e3b6c8c` (feat)
3. **Task 3: Bounded retry behavior** - `5df86c1` (feat)

## Files Created/Modified

- `lib/rate-limit.ts` — Shared rate limiter (sliding window, IP-keyed, configurable limits)
- `lib/integrations/tikkie/client.ts` — Added fetchWithTimeout, retry logic, TIKKIE_FETCH_TIMEOUT_MS/TIKKIE_MAX_RETRIES env overrides
- `lib/integrations/ticket-tailor/client.ts` — Added fetchWithTimeout, retry logic, TICKET_TAILOR_FETCH_TIMEOUT_MS/TICKET_TAILOR_MAX_RETRIES env overrides
- `app/api/webhooks/tikkie/route.ts` — Rate limit (120/min)
- `app/api/webhooks/ticket-tailor/route.ts` — Rate limit (120/min)
- `app/api/dashboard/tikkie-links/route.ts` — Rate limit (60/min) on GET and POST
- `app/api/dashboard/tikkie-event-links/route.ts` — Rate limit (60/min) on GET, POST, PATCH
- `app/api/dashboard/tikkie-event-links/auto-match/route.ts` — Rate limit (60/min)
- `app/api/ticket-tailor/sync/route.ts` — Rate limit (10/min)
- `app/api/jobs/tikkie/full-sync/route.ts` — Rate limit (10/min)

## Decisions Made

- In-memory rate limiter suitable for single-instance (Vercel serverless) — Redis swap for multi-instance
- 15s fetch timeout default with env-var overrides per provider
- Tikkie: retry only GET to avoid duplicate payment creation mutations
- Ticket Tailor: retry all calls (read-only paginated API)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- Initial edit of tikkie/client.ts accidentally removed `asObject` and `firstErrorMessage` helper functions; restored them before typecheck. No runtime impact.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Transport layer hardened: routes are rate-limited, fetches can't hang forever, transient failures retry predictably
- Ready for 17-04 (or whichever plan is next in the phase)
- No RBAC changes introduced as required

---

_Phase: 17-fix-critical-code-review-issues_
_Completed: 2026-03-29_
