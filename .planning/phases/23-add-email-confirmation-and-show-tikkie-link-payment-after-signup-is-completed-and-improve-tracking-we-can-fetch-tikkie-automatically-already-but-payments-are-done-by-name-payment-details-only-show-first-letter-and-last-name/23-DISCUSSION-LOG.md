# Phase 23: Add email confirmation and show tikkie link (payment) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-31
**Phase:** 23-add-email-confirmation-and-show-tikkie-link-payment-after-signup-is-completed-and-improve-tracking-we-can-fetch-tikkie-automatically-already-but-payments-are-done-by-name-payment-details-only-show-first-letter-and-last-name
**Areas discussed:** Email confirmation, Tikkie link presentation, Payment tracking improvements, Success page enhancement

---

## Email Confirmation

| Option                    | Description                                                              | Selected |
| ------------------------- | ------------------------------------------------------------------------ | -------- |
| Immediately (synchronous) | Email sent during submission request — user waits                        |          |
| Async via queue           | Submission returns instantly, email sent via Convex action in background | ✓        |
| Batch/windowed            | Collect signups and send periodic batches                                |          |

**User's choice:** Async via queue
**Notes:** User wants good UX with instant submission return, background processing acceptable

---

| Option            | Description                          | Selected |
| ----------------- | ------------------------------------ | -------- |
| Resend            | Modern email API, generous free tier | ✓        |
| Postmark          | Reliable, excellent deliverability   |          |
| SendGrid          | Established player                   |          |
| AWS SES           | Low cost, more setup                 |          |
| Existing provider | Already configured elsewhere         |          |

**User's choice:** Resend
**Notes:** Chosen for generous free tier and modern API

---

| Option        | Description                                                   | Selected |
| ------------- | ------------------------------------------------------------- | -------- |
| Minimal       | Just booking reference and basic message                      |          |
| Standard      | Booking ref, event details, attendee summary                  |          |
| Comprehensive | Standard + payment link, accommodation, manage link, calendar | ✓        |

**User's choice:** Comprehensive
**Notes:** Include everything helpful: booking ref, event details, attendee summary, Tikkie link/QR, accommodation, manage booking link, add-to-calendar

---

| Option                        | Description                              | Selected |
| ----------------------------- | ---------------------------------------- | -------- |
| HTML with rich styling        | Branded, professional look               |          |
| Plain text with HTML fallback | Accessible, simple                       |          |
| Hybrid responsive             | Responsive HTML that degrades gracefully | ✓        |

**User's choice:** Hybrid responsive
**Notes:** Best of both worlds — works everywhere

---

## Tikkie Link Presentation

| Option            | Description                        | Selected |
| ----------------- | ---------------------------------- | -------- |
| Success page only | Shown immediately after submission |          |
| Email only        | Link sent in email only            |          |
| Both locations    | Success page + email               | ✓        |

**User's choice:** Both locations
**Notes:** Users can pay immediately or reference email later

---

| Option                    | Description                                     | Selected |
| ------------------------- | ----------------------------------------------- | -------- |
| Auto-create on submission | Link generated automatically                    |          |
| Deferred (manual)         | Operator creates later                          |          |
| Hybrid                    | Attempt auto-create, fallback gracefully        |          |
| Manual beforehand         | Operator creates event link before signup opens | ✓        |

**User's choice:** Manual beforehand (operator creates event-level link before signup opens)
**Notes:** Clarified that operator creates event-level link beforehand, not per-submission

---

| Option                       | Description                                | Selected |
| ---------------------------- | ------------------------------------------ | -------- |
| Shared event link            | One link for all signups                   | ✓        |
| Amount-preset per submission | New link per signup with pre-filled amount |          |
| Dynamic amount entry         | User enters amount                         |          |

**User's choice:** Shared event link
**Notes:** Reuse existing event-level Tikkie link infrastructure

---

| Option   | Description                                     | Selected |
| -------- | ----------------------------------------------- | -------- |
| Minimal  | Just link/QR                                    | ✓        |
| Guided   | Link + instructions with amount and booking ref |          |
| Detailed | Guided + breakdown, due date, tracking          |          |

**User's choice:** Minimal
**Notes:** Open amount Tikkie means users decide payment amount themselves

---

## Payment Tracking Improvements

| Option            | Description                                | Selected |
| ----------------- | ------------------------------------------ | -------- |
| Strict privacy    | Always "J. Smith" format                   | ✓        |
| Context-aware     | Privacy for general, full name for finance |          |
| Full transparency | Full names everywhere                      |          |

**User's choice:** Strict privacy
**Notes:** "J. Smith" format everywhere for church community trust

---

| Option          | Description                   | Selected |
| --------------- | ----------------------------- | -------- |
| None            | No payment status shown       | ✓        |
| Basic status    | Pending/received indicator    |          |
| Detailed ledger | Each payment with date/amount |          |

**User's choice:** None for now
**Notes:** Deferred detailed ledger to future phase (user portal page)

---

| Option             | Description                | Selected |
| ------------------ | -------------------------- | -------- |
| Name + amount      | Both required              |          |
| Name + booking ref | Parse ref from description |          |
| Hybrid scoring     | Weighted match             |          |
| Keep current       | Name only                  | ✓        |

**User's choice:** Keep current (name only)
**Notes:** User clarified no access to booking ref in payment data, only name and account number available

---

| Option                         | Description          | Selected |
| ------------------------------ | -------------------- | -------- |
| Name only (current)            | Normalize payer name | ✓        |
| Name + account number          | Match both fields    |          |
| Account number primary         | Use account as key   |          |
| Name with account verification | Account to confirm   |          |

**User's choice:** Name only BUT extend to attendee names (not just booker)
**Notes:** Important insight: attendees paying for themselves is common, matching should check all attendee names in submission, not just booker name

---

## Success Page Enhancement

| Option           | Description                | Selected |
| ---------------- | -------------------------- | -------- |
| Pay now          | Prominent payment CTA      |          |
| View booking     | Show booking details       |          |
| Done/Exit        | Simple completion          |          |
| Multiple actions | Pay, view, share as equals | ✓        |

**User's choice:** Multiple actions
**Notes:** Present pay, view details, and share as equal options

---

| Option                      | Description                       | Selected |
| --------------------------- | --------------------------------- | -------- |
| No — transient only         | Only immediately after submission |          |
| Yes — permanent booking ref | Shareable anytime                 | ✓        |
| Yes — with expiration       | Limited time access               |          |

**User's choice:** Yes — permanent booking ref
**Notes:** `/signup/success/BK-...` accessible anytime

---

| Option              | Description                 | Selected |
| ------------------- | --------------------------- | -------- |
| Compact card        | Booking ref, count, QR only |          |
| Full summary        | All details visible         |          |
| Expandable sections | Collapsed by default        | ✓        |

**User's choice:** Expandable sections
**Notes:** Cleaner initial view, user expands what they want to review

---

| Option                  | Description        | Selected |
| ----------------------- | ------------------ | -------- |
| Add to calendar + share | Useful extras      |          |
| Share + print view      | Practical features |          |
| Just the core           | No extras          | ✓        |

**User's choice:** Just the core
**Notes:** Keep focused — expandable sections and payment, defer extras

---

## the agent's Discretion

Areas where user deferred to agent:

- Exact Resend integration pattern (direct API vs webhooks)
- Email template styling details within hybrid responsive approach
- Expandable section animations and micro-interactions
- URL structure for permanent success page (exact slug format)
- Error handling for async email failures (retry strategy, dead letter handling)

---

## Deferred Ideas

Ideas noted for future phases:

1. **Detailed payment ledger user portal** — Public page to check payment status and matched payments
2. **Add to calendar feature** — .ics file generation
3. **Share booking functionality** — Copy link for family coordination
4. **Edit submission window** — Time-limited edit capability
5. **Print-friendly view** — Printer-friendly confirmation
6. **Payment status notifications** — Email updates on matched payments
7. **Account number matching** — Use Tikkie account numbers (requires schema changes)

---

_Discussion completed: 2026-03-31_
