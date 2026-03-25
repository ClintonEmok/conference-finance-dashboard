---
phase: 12
slug: migrate-auth-to-convex
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-25
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                            |
| ---------------------- | ------------------------------------------------ |
| **Framework**          | vitest                                           |
| **Config file**        | `vitest.config.ts`                               |
| **Quick run command**  | `npm test -- tests/auth/*.test.ts`               |
| **Full suite command** | `npm test && npm run typecheck && npm run build` |
| **Estimated runtime**  | ~45-90 seconds                                   |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- tests/auth/*.test.ts`
- **After every plan wave:** Run `npm test && npm run typecheck && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement                                    | Test Type   | Automated Command                                                         | File Exists | Status     |
| -------- | ---- | ---- | ---------------------------------------------- | ----------- | ------------------------------------------------------------------------- | ----------- | ---------- |
| 12-01-01 | 01   | 1    | Convex auth schema/runtime active              | integration | `npm run typecheck`                                                       | ✅          | ⬜ pending |
| 12-01-02 | 01   | 1    | Auth route contract preserved                  | integration | `npm test -- tests/auth/*.test.ts`                                        | ❌ W0       | ⬜ pending |
| 12-02-01 | 02   | 2    | Protected routes and session checks still work | integration | `npm test -- tests/auth/*.test.ts tests/ticket-tailor/sync-route.test.ts` | ❌ W0       | ⬜ pending |
| 12-02-02 | 02   | 2    | Prisma fully removed without regressions       | build       | `npm test && npm run typecheck && npm run build`                          | ✅          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `tests/auth/convex-auth-contract.test.ts` — covers auth route/session contract after Convex cutover
- [ ] `tests/auth/middleware-session.test.ts` — covers signed-out redirect and signed-in pass-through behavior

---

## Manual-Only Verifications

| Behavior                         | Requirement                | Why Manual                               | Test Instructions                                                                   |
| -------------------------------- | -------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Login/signup/logout browser flow | Session contract preserved | Cookie + redirect UX spans client/server | Run app, create account, sign in, refresh `/dashboard`, sign out, confirm redirects |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
