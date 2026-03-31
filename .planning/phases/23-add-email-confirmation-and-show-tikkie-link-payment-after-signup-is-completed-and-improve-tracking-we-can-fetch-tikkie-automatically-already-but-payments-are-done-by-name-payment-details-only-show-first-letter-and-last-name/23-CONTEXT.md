# Phase 23: Add email confirmation and show tikkie link (payment) - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Add email confirmation to signup submissions and display Tikkie payment links after signup completion. Improve payment tracking with privacy-aware name matching (first letter + last name display). This phase enhances the post-signup user experience while the existing Tikkie event-level link infrastructure (Phase 14-15) is used as the payment mechanism.

</domain>

<decisions>
## Implementation Decisions

### Email Confirmation

- **D-01:** Send confirmation emails asynchronously via queue (background processing via Convex action) — submission returns instantly, email sent in background with retry logic
- **D-02:** Use Resend as the email infrastructure provider (generous free tier, good deliverability)
- **D-03:** Email content is comprehensive: booking reference, event details (name, date, location), attendee list summary, Tikkie payment link/QR code, accommodation summary, "manage booking" link, and add-to-calendar buttons
- **D-04:** Email format is hybrid responsive — responsive HTML that degrades gracefully to plain text

### Tikkie Link Presentation

- **D-05:** Display Tikkie link on both the success page (immediate) AND in the confirmation email (persistent reference)
- **D-06:** Use existing event-level Tikkie links — operator creates these manually beforehand via dashboard
- **D-07:** Shared event link strategy — one Tikkie link per event that all signups use (operator reconciles payments manually)
- **D-08:** Minimal payment guidance on success page — just the link/QR code since Tikkie uses open amounts (users decide their payment amount)

### Payment Tracking & Privacy

- **D-09:** Strict privacy for payment details — always display "J. Smith" format (first letter + last name) in all views
- **D-10:** No payment status shown to users in this phase — deferred to future phase with detailed ledger user portal
- **D-11:** Continue with name-only matching for auto-matching payments, BUT extend matching scope to include attendee names (not just booker name)
- **D-12:** Account number from Tikkie is noted but not used for matching (not collected anywhere in signup flow currently)

### Success Page Enhancement

- **D-13:** Multiple equal primary actions — pay now, view booking details, and share booking ref presented as equal options
- **D-14:** Permanent shareable URL — `/signup/success/BK-20250331-ABC123` format accessible anytime
- **D-15:** Expandable sections layout — collapsed by default: tickets, attendees, rooms, payment sections that user can expand to review
- **D-16:** Core functionality only — no add-to-calendar, print view, or edit window in this phase

### the agent's Discretion

- Exact Resend integration pattern (direct API vs webhooks)
- Email template styling details within hybrid responsive approach
- Expandable section animations and micro-interactions
- URL structure for permanent success page (exact slug format)
- Error handling for async email failures (retry strategy, dead letter handling)

</decisions>

<specifics>
## Specific Ideas

- Success page should feel like a proper booking confirmation, not just a "thanks" message
- Open amount Tikkie links work better for church events where people may pay partial amounts or donations on top
- Privacy masking (J. Smith) is important for church community trust — payment details shouldn't expose full names publicly
- Attendees paying for themselves (not just booker) is common — matching needs to check all attendee names
- Booking reference should be prominent and copy-friendly on success page

</specifics>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Dependencies

- `.planning/phases/22-redesign-signup-ux-for-family-ticket-allocation-with-attendee-grouping-and-room-bedslot-allocation-ui/22-CONTEXT.md` — Current signup flow structure and step order (tickets → attendees → rooms → review)
- `.planning/phases/19-public-multi-step-signup-experience/19-CONTEXT.md` — Signup submission behavior, restore payload, and success state decisions
- `.planning/phases/15-event-level-tikkie-ui-attendee-tikkie-cleanup/15-CONTEXT.md` — Event-level Tikkie link infrastructure and UI patterns
- `.planning/phases/14-event-level-tikkie-payment-tracking/` — Backend Tikkie implementation (referenced in 15-CONTEXT)

### Implementation References

- `components/signup/steps/ReviewSubmitStep.tsx` — Current success page implementation to enhance
- `app/api/signup/submit/route.ts` — Submission endpoint returning `{submissionId, bookingRef, submittedAt}`
- `convex/signupSubmission.ts` — Submission mutation and data structure
- `convex/schema.ts` — `submissions`, `submissionAttendees` tables with bookerEmail, attendee emails
- `convex/tikkie.ts` — Event-level Tikkie link queries and mutations
- `components/dashboard/event-tikkie-section.tsx` — Event Tikkie UI reference
- `lib/domain/finance/tikkie-event-links.ts` — `createEventTikkieLink()` for event-level links

### Project Standards

- `.planning/ROADMAP.md` — Phase 23 scope and dependencies
- `.planning/REQUIREMENTS.md` — v2.0 requirements baseline
- `.planning/STATE.md` — Current progress and active patterns
- `convex/_generated/ai/guidelines.md` — Convex constraints for background actions

### Email Infrastructure

- Resend API documentation: https://resend.com/docs — Use `@resend/node` or REST API for transactional emails

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **ReviewSubmitStep.tsx**: Current success page component showing basic booking ref card — extend with expandable sections and Tikkie link display
- **event-tikkie-section.tsx**: Event-level Tikkie UI pattern including link display, QR code generation, and copy-to-clipboard
- **submission-client.ts**: `submitSignupDraft()` function — submission flow entry point
- **Resend integration**: Not yet present — will need to add `@resend/node` package

### Established Patterns

- **Submission result structure**: Returns `{submissionId, bookingRef, submittedAt, restorePayload?}` — booking ref format is `BK-YYYYMMDD-XXXXXXXX`
- **Async Convex actions**: Pattern exists for cron jobs (autoSync.ts) — email sending should follow similar action pattern
- **Tikkie link retrieval**: `useEventPaymentLink()` hook and `/api/dashboard/tikkie-event-links` endpoint for fetching event links
- **Email storage**: Booker email stored in `submissions.bookerEmail`, attendee emails in `submissionAttendees.email`
- **Payment matching**: Currently in `convex/tikkie.ts` and related domain files — uses buyer name normalization

### Integration Points

- **Success page route**: Currently rendered inline in SignupFlowShell — needs new dedicated success page at `/signup/success/[bookingRef]`
- **Submission hook**: `submitSignupDraft()` in `components/signup/submission-client.ts` — needs to redirect to new success page with booking ref
- **Email trigger**: Add Convex action call after successful submission in `lib/domain/signup/submission.ts` or route handler
- **Tikkie link fetch**: Success page needs to fetch event-level Tikkie link via existing API/hooks
- **Payment matching**: Update auto-match logic in Tikkie domain to check attendee names in addition to booker name

### Key Data Structures

```typescript
// From ReviewSubmitStep.tsx
interface SignupSubmissionResult {
  submissionId: string
  bookingRef: string
  submittedAt: string
  restorePayload?: SignupDraft
}

// From convex/schema.ts
// submissions table: bookerName, bookerEmail, bookerPhone, bookingRef
// submissionAttendees table: name, email (optional), attendeeKey
```

### Files to Modify/Create

1. **New**: `app/signup/success/[bookingRef]/page.tsx` — Permanent success page with expandable sections
2. **Modify**: `components/signup/steps/ReviewSubmitStep.tsx` — Simplify to redirect to new success page
3. **Modify**: `components/signup/SignupFlowShell.tsx` — Redirect to success page after submission
4. **New**: `convex/email.ts` — Email sending action using Resend
5. **New**: `lib/email/templates/signup-confirmation.tsx` — Email template component
6. **Modify**: `lib/domain/finance/tikkie-event-payments.ts` or similar — Update matching logic to include attendee names
7. **Modify**: Components showing payment details — Apply "J. Smith" privacy masking

</code_context>

<deferred>
## Deferred Ideas

Ideas captured for future phases:

- **Detailed payment ledger user portal** — Public page where users can check their payment status and see matched payments (Phase 23 chose "none for now")
- **Add to calendar feature** — .ics file generation for event dates (Phase 23 chose "just the core")
- **Share booking functionality** — Copy link to share booking with family members
- **Edit submission window** — Allow users to edit their submission within a time limit (e.g., 15 minutes)
- **Print-friendly view** — Printer-friendly version of booking confirmation
- **Payment status notifications** — Email updates when payments are matched
- **Account number matching** — Use Tikkie account numbers for payment matching (requires schema changes to store account numbers)

</deferred>

---

_Phase: 23-add-email-confirmation-and-show-tikkie-link-payment-after-signup-is-completed-and-improve-tracking-we-can-fetch-tikkie-automatically-already-but-payments-are-done-by-name-payment-details-only-show-first-letter-and-last-name_
_Context gathered: 2026-03-31_
