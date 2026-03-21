---
phase: 07-complete-tikkie-integration
plan: 02
subsystem: payments
tags: [tikkie, webhook, subscription, api, testing]

# Dependency graph
requires:
  - phase: 06-tikkie-integration
    provides: Tikkie client with createPaymentRequest, getPaymentRequest, and webhook handling
provides:
  - Guarded subscription setup endpoint at POST /api/admin/tikkie/subscription
  - subscribePaymentRequestNotifications client function with typed input/output
  - Config validation for TIKKIE_SUBSCRIPTION_SETUP_ENABLED and TIKKIE_WEBHOOK_CALLBACK_URL
  - Test coverage proving disabled-by-default behavior
affects: [phase-8-smart-allocation, webhook-automation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Explicit feature flag pattern: subscription setup disabled by default until explicitly enabled"
    - "Config-first guard: validate setup toggle and callback URL before processing requests"

key-files:
  created:
    - app/api/admin/tikkie/subscription/route.ts
    - tests/tikkie/subscription-route.test.ts
  modified:
    - lib/integrations/tikkie/client.ts
    - lib/integrations/tikkie/config.ts
    - .env.example

key-decisions:
  - "Subscription setup is disabled by default to prevent accidental production activation"
  - "Route validates both the setup flag AND callback URL before attempting provider API call"
  - "Test coverage verifies each guard path: 401 (no session), 403 (disabled), 400 (no callback), 201 (success), 500 (invalid config), 502 (provider errors)"

patterns-established:
  - "Feature flag pattern: TIKKIE_SUBSCRIPTION_SETUP_ENABLED controls admin route availability"
  - "Callback URL validation: TIKKIE_WEBHOOK_CALLBACK_URL required when setup is enabled"

# Metrics
duration: 63min
completed: 2026-03-21
---

# Phase 7 Plan 2: Add guarded subscription setup path for payment request notifications

**Guarded admin endpoint for Tikkie webhook subscription provisioning with disabled-by-default safety**

## Performance

- **Duration:** 63 min
- **Started:** 2026-03-21T17:18:42Z
- **Completed:** 2026-03-21T18:21:47Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Created typed `subscribePaymentRequestNotifications` client function for POST /paymentrequestssubscription
- Extended `getTikkieConfig` to parse and validate `TIKKIE_SUBSCRIPTION_SETUP_ENABLED` and `TIKKIE_WEBHOOK_CALLBACK_URL`
- Built protected admin route with 401/403/400/500/502 error handling and 201 success response
- Added test coverage proving disabled-by-default semantics and all error paths
- Documented new env vars in .env.example with safe defaults (disabled)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend Tikkie client/config for subscription provisioning** - `5353a18` (feat)
2. **Task 2: Build protected admin route for on-demand subscription setup** - `84444c1` (feat)
3. **Task 3: Add route-level tests for disabled-by-default and safe success semantics** - `5e3e271` (test)

**Plan metadata:** committed in phase execution

## Files Created/Modified

- `lib/integrations/tikkie/client.ts` - Added `subscribePaymentRequestNotifications` function with typed input/output
- `lib/integrations/tikkie/config.ts` - Extended config to handle subscription setup toggles and callback URL validation
- `.env.example` - Added `TIKKIE_SUBSCRIPTION_SETUP_ENABLED` and `TIKKIE_WEBHOOK_CALLBACK_URL` with safe defaults
- `app/api/admin/tikkie/subscription/route.ts` - Created protected POST endpoint with auth guard and config validation
- `tests/tikkie/subscription-route.test.ts` - Created 7 tests covering all route branches

## Decisions Made

- Disabled subscription setup by default to prevent accidental production activation
- Config validation happens before auth check to provide clear error messages
- Provider errors mapped to actionable 502 responses with specific guidance

## Deviations from Plan

**1. [Rule 3 - Blocking] Added optional request parameter to route function**

- **Found during:** Task 3 (test creation)
- **Issue:** TypeScript expected 0 arguments but test passed Request object
- **Fix:** Added unused `_request: Request` parameter to match TypeScript expectations
- **Files modified:** app/api/admin/tikkie/subscription/route.ts
- **Verification:** Typecheck and tests pass
- **Committed in:** 5e3e271 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (blocking issue)
**Impact on plan:** Minor TypeScript fix necessary for type correctness. No impact on functionality.

## Issues Encountered

- None - all planned work completed as specified

## User Setup Required

None - the subscription setup requires explicit opt-in via environment variables before use. No automatic configuration.

## Next Phase Readiness

- Phase 7 complete - both plans (07-01 and 07-02) finished
- Tikkie integration now has:
  - Provider-authoritative refresh via GET payment request (07-01)
  - Guarded subscription setup path (07-02)
- Ready for Phase 8 (Smart Allocation & Attendee Signals)

---

_Phase: 07-complete-tikkie-integration_
_Completed: 2026-03-21_
