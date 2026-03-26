---
phase: 12
slug: use-clerk-as-only-auth-remove-stale-better-auth
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-26
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**          | vitest                                                                                                                                              |
| **Config file**        | `vitest.config.ts`                                                                                                                                  |
| **Quick run command**  | `npm run typecheck && npm test -- tests/ticket-tailor/sync-route.test.ts tests/tikkie/subscription-route.test.ts tests/tikkie/tikkie-links.test.ts` |
| **Full suite command** | `npm run build && npm run typecheck && npm test`                                                                                                    |
| **Estimated runtime**  | ~45 seconds                                                                                                                                         |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck && npm test -- tests/ticket-tailor/sync-route.test.ts tests/tikkie/subscription-route.test.ts tests/tikkie/tikkie-links.test.ts`
- **After every plan wave:** Run `npm run build && npm run typecheck && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement                          | Test Type        | Automated Command                                                                                                              | File Exists | Status     |
| -------- | ---- | ---- | ------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------- | ---------- |
| 12-01-01 | 01   | 1    | PHASE-12 auth foundation             | integration      | `npm run typecheck`                                                                                                            | ✅          | ⬜ pending |
| 12-01-02 | 01   | 1    | PHASE-12 Convex auth bridge          | integration      | `npm run typecheck`                                                                                                            | ✅          | ⬜ pending |
| 12-02-01 | 02   | 2    | PHASE-12 dashboard protection        | integration      | `npm run typecheck`                                                                                                            | ✅          | ⬜ pending |
| 12-02-02 | 02   | 2    | PHASE-12 login/logout UX             | build            | `npm run build`                                                                                                                | ✅          | ⬜ pending |
| 12-03-01 | 03   | 2    | PHASE-12 protected API auth          | unit/integration | `npm test -- tests/ticket-tailor/sync-route.test.ts tests/tikkie/subscription-route.test.ts tests/tikkie/tikkie-links.test.ts` | ✅          | ⬜ pending |
| 12-03-02 | 03   | 2    | PHASE-12 route contract preservation | integration      | `npm run typecheck`                                                                                                            | ✅          | ⬜ pending |
| 12-04-01 | 04   | 3    | PHASE-12 stale auth cleanup          | build/search     | `npm run build && grep -R "better-auth\|auth.api.getSession\|@/lib/auth-client" app lib tests package.json`                    | ✅          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior                                                 | Requirement                   | Why Manual                                              | Test Instructions                                                                                         |
| -------------------------------------------------------- | ----------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Clerk sign-in flow redirects correctly from `/dashboard` | PHASE-12 dashboard protection | Hosted/modal Clerk sign-in requires browser interaction | Visit `/dashboard` signed out, confirm redirect/sign-in handoff, complete sign-in, verify dashboard loads |
| Logout returns the app to a signed-out state             | PHASE-12 login/logout UX      | Requires browser cookie/session state                   | Click logout from dashboard, then refresh `/dashboard` and confirm sign-in is required                    |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
