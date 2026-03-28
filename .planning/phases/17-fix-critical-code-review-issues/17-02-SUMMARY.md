---
phase: 17-fix-critical-code-review-issues
plan: "02"
subsystem: security
tags: [webhooks, signature-verification, convex-auth, fail-closed]

requires:
  - phase: "17-01"
    provides: Convex auth guard hardening via shared requireIdentity helper

provides:
  - Webhook verifiers that fail closed on missing signing secrets
  - Explicit runtime validation of CLERK_JWT_ISSUER_DOMAIN in auth config
  - Regression tests for missing-secret, invalid-signature, and valid-signature cases

affects: webhook-processing, convex-auth, payment-tracking

tech-stack:
  added: []
  patterns: fail-closed-security, explicit-env-validation

key-files:
  created:
    - tests/tikkie/webhook-verify.test.ts
    - tests/ticket-tailor/webhook-route.test.ts
    - tests/ticket-tailor/webhook-verify.test.ts
  modified:
    - lib/integrations/tikkie/webhook.ts
    - lib/integrations/ticket-tailor/webhook.ts
    - convex/auth.config.ts
    - tests/tikkie/webhook-route.test.ts

key-decisions:
  - "Webhook verifiers return false (not true) when signing secret is absent — fail closed rather than skip verification silently"
  - "Convex auth.config.ts throws immediately at module load if CLERK_JWT_ISSUER_DOMAIN is missing, instead of relying on TypeScript non-null assertion"

patterns-established:
  - "Fail-closed webhook verification: missing/blank env vars should reject requests, not bypass checks"
  - "Explicit env validation with actionable error messages replacing TypeScript non-null assertions for critical config"

requirements-completed: []

duration: 13min
completed: 2026-03-28
---

# Phase 17 Plan 02: Webhook Signature Verification & Auth Config Fail-Closed Summary

**Webhook verifiers and Convex auth config now reject requests on misconfiguration instead of silently bypassing security checks**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-28T20:09:02Z
- **Completed:** 2026-03-28T20:21:35Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Both Tikkie and Ticket Tailor webhook verifiers now return `false` when their signing secret env vars are absent or blank, blocking unverified webhook processing
- Convex auth.config.ts replaced `process.env.CLERK_JWT_ISSUER_DOMAIN!` non-null assertion with an explicit runtime check that throws a descriptive error with setup instructions
- Added 23 regression tests across 4 test files covering missing-secret, invalid-signature, valid-signature, and tampered-payload scenarios
- Fixed pre-existing broken test (`tests/tikkie/webhook-route.test.ts` had no env setup and unmocked Convex imports)

## Task Commits

1. **Fix Tikkie webhook verifier** - `0134853` (fix)
   - `verifyTikkieWebhook` returns false on missing/blank `TIKKIE_WEBHOOK_SECRET`
   - Added `tests/tikkie/webhook-verify.test.ts` (7 tests)
   - Fixed `tests/tikkie/webhook-route.test.ts` (added env setup + Convex mocks)

2. **Fix Ticket Tailor webhook verifier** - `5cd7d9d` (fix)
   - `verifyTicketTailorWebhook` returns false on missing/blank `TICKET_TAILOR_WEBHOOK_SECRET`
   - Created `tests/ticket-tailor/webhook-route.test.ts` (4 tests)
   - Created `tests/ticket-tailor/webhook-verify.test.ts` (7 tests)

3. **Fix Convex auth config** - `34a3aa3` (fix)
   - Removed `!` non-null assertion from `process.env.CLERK_JWT_ISSUER_DOMAIN`
   - Added runtime check with descriptive error + Convex docs link

## Files Created/Modified

- `lib/integrations/tikkie/webhook.ts` - Changed `return true` to `return false` on missing secret
- `lib/integrations/ticket-tailor/webhook.ts` - Changed `return true` to `return false` on missing secret
- `convex/auth.config.ts` - Replaced non-null assertion with explicit runtime validation
- `tests/tikkie/webhook-route.test.ts` - Added env setup, Convex mocks, missing-secret test
- `tests/tikkie/webhook-verify.test.ts` - New: 7 direct unit tests for Tikkie verifier
- `tests/ticket-tailor/webhook-route.test.ts` - New: 4 route tests for Ticket Tailor webhook
- `tests/ticket-tailor/webhook-verify.test.ts` - New: 7 direct unit tests for Ticket Tailor verifier

## Decisions Made

- Both webhook verifiers now fail closed: missing env var → rejection, not bypass
- Auth config error includes actionable setup instructions and documentation link
- Existing broken test (missing env var) was fixed as a Rule 3 deviation rather than left broken

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing broken webhook-route.test.ts**

- **Found during:** Task 1 (Tikkie webhook verifier fix)
- **Issue:** `tests/tikkie/webhook-route.test.ts` was already broken — no `NEXT_PUBLIC_CONVEX_URL` env var setup and unmocked `convexQuery`/`fetchStoreTikkiePayments` imports caused module load failure
- **Fix:** Added `vi.hoisted` for env var setup, added mocks for Convex server and tikkie-event-payments modules
- **Files modified:** `tests/tikkie/webhook-route.test.ts`
- **Verification:** Test file passes (4 tests, all green)
- **Committed in:** 0134853 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Pre-existing broken test was fixed as part of Task 1. No scope creep — all fixes directly support the plan's fail-closed goal.

## Issues Encountered

None

## Next Phase Readiness

- Webhook security hardened: both Tikkie and Ticket Tailor fail closed on missing config
- Convex auth config has explicit validation replacing hidden non-null assertion
- Ready for 17-03 or next plan in the phase sequence

---

_Phase: 17-fix-critical-code-review-issues_
_Completed: 2026-03-28_
