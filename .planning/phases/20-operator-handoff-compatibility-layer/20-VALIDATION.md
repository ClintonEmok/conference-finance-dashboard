---
phase: 20
slug: operator-handoff-compatibility-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                           |
| ---------------------- | ------------------------------- |
| **Framework**          | vitest                          |
| **Config file**        | `vitest.config.ts`              |
| **Quick run command**  | `npm run test -- accommodation` |
| **Full suite command** | `npm run test`                  |
| **Estimated runtime**  | ~120 seconds                    |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- accommodation`
- **After every plan wave:** Run `npm run typecheck`
- **Before `/gsd-verify-work`:** `npm run test` must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type                | Automated Command               | File Exists | Status     |
| -------- | ---- | ---- | ----------- | ------------------------ | ------------------------------- | ----------- | ---------- |
| 20-01-01 | 01   | 1    | OPS-01      | type + integration shape | `npm run typecheck`             | ✅          | ⬜ pending |
| 20-01-02 | 01   | 1    | OPS-01      | route contract           | `npm run test -- accommodation` | ✅          | ⬜ pending |
| 20-02-01 | 02   | 2    | OPS-01      | UI contract              | `npm run typecheck`             | ✅          | ⬜ pending |
| 20-02-02 | 02   | 2    | OPS-02      | adapter compatibility    | `npm run test -- dashboard`     | ❌ W0       | ⬜ pending |
| 20-03-01 | 03   | 3    | OPS-01      | route/domain regression  | `npm run test -- accommodation` | ✅          | ⬜ pending |
| 20-03-02 | 03   | 3    | OPS-02      | compatibility regression | `npm run test -- dashboard`     | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `app/api/dashboard/accommodation/assignments/route.test.ts` — route coverage for mixed-source board payload and unresolved queue ordering
- [ ] `lib/domain/finance/order-ledger.test.ts` — source-agnostic available-event adapter coverage for integration + internal events
- [ ] `lib/domain/finance/attendees.test.ts` — mixed-source event filter/read compatibility checks

---

## Manual-Only Verifications

| Behavior                                                                  | Requirement | Why Manual                             | Test Instructions                                                                                                                                                           |
| ------------------------------------------------------------------------- | ----------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Submission-first handoff panel readability in operator room allocation UI | OPS-01      | Visual hierarchy + interaction density | 1) Run app locally 2) Submit sample signup 3) Open `/dashboard/accommodation` 4) Confirm unresolved queue appears first and detail side panel shows booking + rooming notes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
