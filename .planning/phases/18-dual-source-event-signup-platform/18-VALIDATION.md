---
phase: 18
slug: dual-source-event-signup-platform
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-29
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                          |
| ---------------------- | ---------------------------------------------- |
| **Framework**          | vitest 4.x + TypeScript typecheck              |
| **Config file**        | `vitest.config.ts` (existing), `tsconfig.json` |
| **Quick run command**  | `npm run typecheck`                            |
| **Full suite command** | `npm run test`                                 |
| **Estimated runtime**  | ~60-120 seconds                                |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement    | Test Type           | Automated Command        | File Exists | Status     |
| -------- | ---- | ---- | -------------- | ------------------- | ------------------------ | ----------- | ---------- |
| 18-01-01 | 01   | 1    | DOM-01         | contract/type       | `npm run typecheck`      | ✅          | ⬜ pending |
| 18-01-02 | 01   | 1    | USF-02, USF-03 | query/contract      | `npm run typecheck`      | ✅          | ⬜ pending |
| 18-02-01 | 02   | 2    | DOM-02         | mutation            | `npm run test -- signup` | ✅          | ⬜ pending |
| 18-02-02 | 02   | 2    | USF-01         | route integration   | `npm run test -- signup` | ✅          | ⬜ pending |
| 18-03-01 | 03   | 3    | DOM-03         | transactional guard | `npm run test -- signup` | ✅          | ⬜ pending |
| 18-03-02 | 03   | 3    | USF-06         | abuse control       | `npm run test -- signup` | ✅          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior                                       | Requirement | Why Manual                                         | Test Instructions                                                                                           |
| ---------------------------------------------- | ----------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Public submit throttling copy is user-friendly | USF-06      | API tests validate status/shape but not UX clarity | Hit signup submit endpoint repeatedly from browser; confirm rate-limit response messaging is understandable |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-29
