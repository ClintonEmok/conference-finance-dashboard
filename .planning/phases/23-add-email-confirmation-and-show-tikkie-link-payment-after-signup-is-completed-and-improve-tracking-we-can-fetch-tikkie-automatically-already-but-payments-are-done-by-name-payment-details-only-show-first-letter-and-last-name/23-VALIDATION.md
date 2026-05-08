---
phase: 23
slug: add-email-confirmation-and-show-tikkie-link-payment-after-signup-is-completed-and-improve-tracking-we-can-fetch-tikkie-automatically-already-but-payments-are-done-by-name-payment-details-only-show-first-letter-and-last-name
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                |
| ---------------------- | -------------------- |
| **Framework**          | vitest + convex-test |
| **Config file**        | `vitest.config.ts`   |
| **Quick run command**  | `npm test -- --run`  |
| **Full suite command** | `npm test`           |
| **Estimated runtime**  | ~15 seconds          |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement              | Test Type   | Automated Command                      | File Exists | Status     |
| -------- | ---- | ---- | ------------------------ | ----------- | -------------------------------------- | ----------- | ---------- |
| 23-01-01 | 01   | 1    | Email Resend integration | integration | `npm test -- email.test.ts`            | ❌ W0       | ⬜ pending |
| 23-01-02 | 01   | 1    | Email template render    | unit        | `npm test -- email-template.test.ts`   | ❌ W0       | ⬜ pending |
| 23-01-03 | 01   | 1    | Email action handler     | integration | `npm test -- email-action.test.ts`     | ❌ W0       | ⬜ pending |
| 23-02-01 | 02   | 1    | Success page route       | e2e         | `npm run test:e2e -- success-page`     | ❌ W0       | ⬜ pending |
| 23-02-02 | 02   | 1    | Booking ref query        | integration | `npm test -- submission-query.test.ts` | ❌ W0       | ⬜ pending |
| 23-02-03 | 02   | 1    | Expandable sections UI   | unit        | `npm test -- success-ui.test.ts`       | ❌ W0       | ⬜ pending |
| 23-03-01 | 03   | 1    | Tikkie link display      | unit        | `npm test -- tikkie-display.test.ts`   | ❌ W0       | ⬜ pending |
| 23-03-02 | 03   | 1    | QR code generation       | unit        | `npm test -- qr-code.test.ts`          | ❌ W0       | ⬜ pending |
| 23-04-01 | 04   | 1    | Name masking utility     | unit        | `npm test -- privacy.test.ts`          | ❌ W0       | ⬜ pending |
| 23-04-02 | 04   | 1    | Attendee name matching   | integration | `npm test -- payment-matching.test.ts` | ❌ W0       | ⬜ pending |
| 23-04-03 | 04   | 1    | Privacy masking in UI    | e2e         | `npm run test:e2e -- privacy`          | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `convex/email.test.ts` — Email sending tests
- [ ] `lib/email/templates/__tests__/signup-confirmation.test.tsx` — Template render tests
- [ ] `lib/utils/__tests__/privacy.test.ts` — Name masking tests
- [ ] `lib/domain/finance/__tests__/tikkie-matching.test.ts` — Payment matching tests

---

## Manual-Only Verifications

| Behavior                    | Requirement | Why Manual         | Test Instructions                    |
| --------------------------- | ----------- | ------------------ | ------------------------------------ |
| Email deliverability        | D-01        | Provider dependent | Send test email, check inbox/spam    |
| Tikkie link opens correctly | D-05        | External service   | Click link, verify Tikkie page loads |
| QR code scans correctly     | D-05        | Device dependent   | Scan with phone camera, verify opens |
| Responsive email rendering  | D-04        | Visual check       | View in Gmail, Outlook, Apple Mail   |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-03-31
