---
phase: 23-add-email-confirmation-and-show-tikkie-link-payment-after-signup-is-completed-and-improve-tracking-we-can-fetch-tikkie-automatically-already-but-payments-are-done-by-name-payment-details-only-show-first-letter-and-last-name
plan: 01
type: execute
subsystem: email

tags:
  - resend
  - email
  - convex-component
  - react-email

requires:
  - phase: 18-schema-canonical-contracts
    provides: submissions table, submissionAttendees table, accommodationSlots table

provides:
  - Resend email infrastructure via @convex-dev/resend component
  - sentEmails table for audit logging
  - React email template for signup confirmations
  - Convex internalAction for sending emails with automatic queuing and retry

tech-stack:
  added:
    - @convex-dev/resend@latest
    - @react-email/components
    - @react-email/render

key-files:
  created:
    - convex/convex.config.ts
    - convex/emailActions.ts
    - convex/emailMutations.ts
    - convex/emailQueries.ts
    - lib/email/templates/signup-confirmation.tsx
    - lib/email/templates/index.ts
  modified:
    - convex/schema.ts
    - .env.example

duration: 25min
completed: 2026-03-31
---

# Phase 23 Plan 01: Setup Resend Email Infrastructure

**Resend email infrastructure using @convex-dev/resend component with React Email templates and Convex actions for async signup confirmation emails**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-31T08:58:21Z
- **Completed:** 2026-03-31T09:23:21Z
- **Tasks:** 4/4
- **Files modified:** 9

## Accomplishments

1. **Installed and configured @convex-dev/resend component** - Email sending infrastructure with automatic queuing and retry
2. **Added sentEmails table to schema** - Audit logging for sent emails with by_bookingRef index
3. **Created React email template** - Signup confirmation email with booking details and Tikkie payment section
4. **Built Convex email action** - internalAction using Resend component with proper error handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Install and configure @convex-dev/resend component** - `e30ba91` (chore)
2. **Task 2: Create email schema tables for audit logging** - `e8030cb` (feat)
3. **Task 3: Create React email template for signup confirmation** - `29e1258` (feat)
4. **Task 4: Create Convex action for sending emails** - `80502af` (feat)

## Files Created/Modified

- `convex/convex.config.ts` - Convex app config with resend component registration
- `convex/emailActions.ts` - Email sending internalAction using Resend component
- `convex/emailMutations.ts` - logSentEmail internalMutation for audit logging
- `convex/emailQueries.ts` - getEmailStatus query for checking email status
- `lib/email/templates/signup-confirmation.tsx` - React Email template component
- `lib/email/templates/index.ts` - Template exports
- `convex/schema.ts` - Added sentEmails table definition
- `.env.example` - Added RESEND\_\* environment variables
- `package.json` - Added @convex-dev/resend, @react-email/components, @react-email/render

## Decisions Made

- **Split email functions by runtime:** Actions (use node) in emailActions.ts, mutations/queries in separate files to avoid mixing runtimes in one file
- **Component handles failed emails internally:** No need for separate failedEmails table - Resend component has built-in retry and error handling
- **Return emailId directly:** Resend sendEmail returns the email ID string, not an object with status/error fields
- **Use returns validator:** Added explicit v.object returns validator to sendSignupConfirmation for type safety

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

1. **Type generation delay:** Initial TypeScript errors because convex/\_generated/api.d.ts didn't have resend component types yet. Fixed by running `npx convex dev --once` to regenerate types.

2. **Runtime separation:** Guidelines reminded us that "use node" actions cannot coexist with queries/mutations in the same file. Created separate emailActions.ts, emailMutations.ts, and emailQueries.ts files.

## Next Phase Readiness

- Email infrastructure ready for integration with signup submission flow
- Component handles automatic queuing, retry logic, and rate limiting
- Schema has sentEmails table for audit trail
- React Email template renders correctly with booking details and Tikkie section

**Next step:** Integrate email sending into signup submission flow (Plan 23-02)

---

_Phase: 23-add-email-confirmation-and-show-tikkie-link-payment-after-signup-is-completed-and-improve-tracking-we-can-fetch-tikkie-automatically-already-but-payments-are-done-by-name-payment-details-only-show-first-letter-and-last-name_
_Completed: 2026-03-31_
