---
phase: 13
slug: rebuild-convex-mutation-and-api-layer-from-clean-contracts
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-03-26
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Framework**          | vitest                                                                                                                                                                                                       |
| **Config file**        | `vitest.config.ts`                                                                                                                                                                                           |
| **Quick run command**  | `npx convex codegen && npm run typecheck && npm test -- tests/ticket-tailor/sync-route.test.ts tests/tikkie/tikkie-links.test.ts tests/tikkie/subscription-route.test.ts tests/tikkie/webhook-route.test.ts` |
| **Full suite command** | `npx convex codegen && npm run build && npm run typecheck && npm test`                                                                                                                                       |
| **Estimated runtime**  | ~90 seconds                                                                                                                                                                                                  |

---

## Sampling Rate

- **After every task commit:** Run `npx convex codegen && npm run typecheck && npm test -- tests/ticket-tailor/sync-route.test.ts tests/tikkie/tikkie-links.test.ts tests/tikkie/subscription-route.test.ts tests/tikkie/webhook-route.test.ts`
- **After every plan wave:** Run `npx convex codegen && npm run build && npm run typecheck && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement                              | Test Type                  | Automated Command                                                                                                                               | File Exists        | Status                                                                             |
| -------- | ---- | ---- | ---------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------- | ---------- |
| 13-01-01 | 01   | 1    | Canonical Convex layout                  | codegen + typecheck        | `npx convex codegen && npm run typecheck`                                                                                                       | ✅                 | ⬜ pending                                                                         |
| 13-01-02 | 01   | 1    | Typed Clerk-aware server bridge          | typecheck + grep           | `npm run typecheck && rg "runConvexQuery                                                                                                        | runConvexMutation  | @/convex/\_generated/api" lib/convex`                                              | ✅                                                     | ⬜ pending |
| 13-02-01 | 02   | 2    | Orders/reporting bounded query contracts | typecheck + grep           | `npm run typecheck && rg "paginationOptsValidator                                                                                               | withIndex          | returns:" convex/orders.ts convex/events.ts`                                       | ✅                                                     | ⬜ pending |
| 13-02-02 | 02   | 2    | Orders/reporting route migration         | typecheck + grep           | `npm run typecheck && rg "api\.orders                                                                                                           | api\.events        | runConvexQuery" lib/domain/finance app/api`                                        | ✅                                                     | ⬜ pending |
| 13-03-01 | 03   | 2    | Attendee/accommodation contract rebuild  | typecheck + grep           | `npm run typecheck && rg "internalMutation                                                                                                      | internalQuery      | withIndex                                                                          | returns:" convex/attendees.ts convex/accommodation.ts` | ✅         | ⬜ pending |
| 13-03-02 | 03   | 2    | Attendee/accommodation route migration   | typecheck + grep           | `npm run typecheck && rg "api\.attendees                                                                                                        | api\.accommodation | runConvex" lib/domain app/api/dashboard/attendees app/api/dashboard/accommodation` | ✅                                                     | ⬜ pending |
| 13-04-01 | 04   | 2    | Payments/Tikkie contract rebuild         | typecheck + targeted tests | `npm run typecheck && npm test -- tests/tikkie/tikkie-links.test.ts tests/tikkie/subscription-route.test.ts tests/tikkie/webhook-route.test.ts` | ✅                 | ⬜ pending                                                                         |
| 13-04-02 | 04   | 2    | Payments/Tikkie route migration          | typecheck + targeted tests | `npm run typecheck && npm test -- tests/tikkie/tikkie-links.test.ts tests/tikkie/subscription-route.test.ts tests/tikkie/webhook-route.test.ts` | ✅                 | ⬜ pending                                                                         |
| 13-05-01 | 05   | 3    | Sync/webhook internal contract cleanup   | typecheck + targeted tests | `npm run typecheck && npm test -- tests/ticket-tailor/sync-route.test.ts tests/ticket-tailor/client.test.ts`                                    | ✅                 | ⬜ pending                                                                         |
| 13-05-02 | 05   | 3    | Legacy bridge removal + full regression  | full suite + grep          | `npx convex codegen && npm run build && npm run typecheck && npm test && rg "@/convex/functions/\_generated                                     | convexQuery\(\"    | convexMutation\(\"" lib app convex`                                                | ✅                                                     | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
