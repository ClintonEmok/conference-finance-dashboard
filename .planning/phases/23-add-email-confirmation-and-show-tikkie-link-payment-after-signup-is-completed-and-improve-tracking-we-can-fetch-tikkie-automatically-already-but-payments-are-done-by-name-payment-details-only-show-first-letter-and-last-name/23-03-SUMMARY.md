---
phase: 23-add-email-confirmation-and-show-tikkie-link-payment-after-signup-is-completed-and-improve-tracking-we-can-fetch-tikkie-automatically-already-but-payments-are-done-by-name-payment-details-only-show-first-letter-and-last-name
plan: 03
subsystem: payments
tags: [tikkie, qr-code, email, react-email, convex, success-page, qrcode.react]

# Dependency graph
requires:
  - phase: 23-02
    provides: Success page route, SuccessView component, ExpandableSection, Convex getByBookingRef query
provides:
  - TikkieSection component with QR code for success page
  - EmailTikkieSection component for confirmation emails
  - getEventPaymentLinkForSuccess Convex query for event-level Tikkie links
  - Fire-and-forget confirmation email trigger on signup submission
  - Tikkie link integrated into success page and email template
affects: [future payment tracking, user onboarding flow]

# Tech tracking
tech-stack:
  added: [qrcode.react]
  patterns:
    [
      QR code display for payment links,
      email-compatible React components,
      fire-and-forget async email trigger,
    ]

key-files:
  created:
    - components/signup/SuccessPage/TikkieSection.tsx
    - lib/email/templates/EmailTikkieSection.tsx
  modified:
    - components/signup/SuccessPage/SuccessView.tsx
    - components/signup/SuccessPage/index.ts
    - lib/email/templates/signup-confirmation.tsx
    - convex/tikkie.ts
    - app/signup/success/[bookingRef]/page.tsx
    - app/api/signup/submit/route.ts

key-decisions:
  - "Use qrcode.react over qrcode library for simpler React integration"
  - "Email Tikkie section uses Button component (no QR code in email)"
  - "Confirmation email triggered as fire-and-forget to not block submission response"

patterns-established:
  - "TikkieSection: QR code + copy button + Pay Now button pattern for payment links"
  - "EmailTikkieSection: Email-compatible payment section with Button and plain-text URL fallback"
  - "getEventPaymentLinkForSuccess: Latest-link-first pattern with typed eventId and clean return contract"

requirements-completed: []

# Metrics
duration: <1 min
completed: 2026-03-31
---

# Phase 23 Plan 03: Tikkie Payment Link on Success Page and Email Summary

**Tikkie payment link with QR code on signup success page and "Pay Now" button in confirmation emails, using qrcode.react and fire-and-forget email trigger**

## Performance

- **Duration:** <1 min (previously implemented)
- **Started:** 2026-03-31T11:36:31Z
- **Completed:** 2026-03-31T11:36:31Z
- **Tasks:** 5/5 (all previously committed)
- **Files modified:** 7

## Accomplishments

- TikkieSection component with QR code, copy-to-clipboard, and Pay Now button on success page
- EmailTikkieSection component integrated into signup confirmation email template
- getEventPaymentLinkForSuccess Convex query returns latest event Tikkie link with typed contract
- Success page fetches and displays Tikkie link via fetchQuery
- Signup submission route triggers fire-and-forget confirmation email with Tikkie URL

## Task Commits

Each task was committed atomically:

1. **Task 1: Install QR code generation library** - `60bbe76` (chore)
2. **Task 2: Create TikkieSection component** - `765585e` (feat)
3. **Task 3: Create EmailTikkieSection component** - `c4a3ff9` (feat)
4. **Task 4: Add Convex query for event Tikkie link** - `6443018` (feat)
5. **Task 5: Integrate Tikkie into success page and trigger email** - `6c1547e`, `9232385` (feat)

## Files Created/Modified

- `components/signup/SuccessPage/TikkieSection.tsx` - QR code display with copy button and Pay Now action
- `lib/email/templates/EmailTikkieSection.tsx` - Email-compatible Tikkie section with Button component
- `components/signup/SuccessPage/SuccessView.tsx` - Integrated TikkieSection component
- `components/signup/SuccessPage/index.ts` - Added TikkieSection export
- `lib/email/templates/signup-confirmation.tsx` - Uses EmailTikkieSection component
- `convex/tikkie.ts` - Added getEventPaymentLinkForSuccess query with typed returns
- `app/signup/success/[bookingRef]/page.tsx` - Fetches Tikkie link and passes to SuccessView
- `app/api/signup/submit/route.ts` - Triggers confirmation email with Tikkie URL (fire-and-forget)

## Decisions Made

- Used qrcode.react over qrcode library for simpler React integration (no canvas dependency)
- Email Tikkie section omits QR code (unreliable in email clients) and uses Button + plain-text URL fallback
- Confirmation email triggered as fire-and-forget to not block submission response; errors logged but don't affect user experience
- Followed "latest-link-first" pattern from Phase 06 decisions for getEventPaymentLinkForSuccess

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Tikkie payment link display complete on success page and in emails
- Ready for next phase 23-04 (privacy-aware payment name masking)
- All success criteria met: QR code displays, email includes Pay Now button, Convex query returns latest link, copy-to-clipboard works, graceful fallback for missing links

---

_Phase: 23-add-email-confirmation-and-show-tikkie-link-payment-after-signup-is-completed-and-improve-tracking-we-can-fetch-tikkie-automatically-already-but-payments-are-done-by-name-payment-details-only-show-first-letter-and-last-name_
_Completed: 2026-03-31_
