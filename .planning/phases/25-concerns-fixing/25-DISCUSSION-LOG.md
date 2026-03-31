# Phase 25: Concerns fixing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-31
**Phase:** 25-concerns-fixing
**Areas discussed:** Fix prioritization strategy, Security remediation approach, Code quality remediation, Testing strategy

---

## Fix Prioritization Strategy

| Option                 | Description                                      | Selected |
| ---------------------- | ------------------------------------------------ | -------- |
| CRITICAL only          | Fix the 3 CRITICAL issues, plant seeds for rest  | ✓        |
| CRITICAL + HIGH        | Fix CRITICAL + HIGH issues (~8 fixes total)      |          |
| All severities         | Tackle everything including MEDIUM               |          |
| Grouped by impact area | Fix by area: security, data correctness, quality |          |

**User's choice:** CRITICAL only, and plant seeds using `/gsd-plant-seed` for what we aren't doing in this phase.
**Notes:** User wants focused scope — only CRITICAL issues. Deferred items should be planted as seeds for future phases.

## Security Remediation Approach

| Option                        | Description                                                                 | Selected |
| ----------------------------- | --------------------------------------------------------------------------- | -------- |
| Use existing auth pattern     | Follow Phase 17 pattern: import auth helper, add ctx.auth.getUserIdentity() | ✓        |
| Create shared auth middleware | Build reusable auth guard utility                                           |          |

**User's choice:** Use existing auth pattern (Recommended)
**Notes:** Consistency with Phase 17 approach preferred over new middleware.

| Option                         | Description                                                     | Selected |
| ------------------------------ | --------------------------------------------------------------- | -------- |
| Add env var + fix handler      | Add TICKET_TAILOR_WEBHOOK_SECRET to env, update webhook handler |          |
| Add env var only, keep polling | Add secret for future use, keep polling as primary              |          |

**User's choice:** Actually we don't need the secret since it runs internally
**Notes:** The CONCERNS.md finding about missing webhook secret is a false positive — the webhook handler runs internally, not as an external-facing endpoint.

| Option                     | Description                                                 | Selected |
| -------------------------- | ----------------------------------------------------------- | -------- |
| Delete unreachable code    | Remove 30+ lines of duplicated unreachable code             |          |
| Move to separate component | Extract dead code into a component for potential future use | ✓        |

**User's choice:** Move to separate component
**Notes:** Dead code should be preserved as a component, not deleted — user may need it later.

## Code Quality Remediation

| Option                  | Description                                                   | Selected |
| ----------------------- | ------------------------------------------------------------- | -------- |
| Extract logical modules | Split accommodation.ts into smaller modules by concern        |          |
| Leave for now           | Note as technical debt, don't refactor in CRITICAL-only phase | ✓        |

**User's choice:** Leave for now
**Notes:** Massive file refactoring is not CRITICAL — defer to future phase.

| Option                          | Description                                              | Selected |
| ------------------------------- | -------------------------------------------------------- | -------- |
| Delete prisma/ directory        | Remove prisma/ directory, SQLite DBs, and Prisma imports | ✓        |
| Archive and remove imports only | Keep prisma/ as backup but remove all imports            |          |

**User's choice:** Delete prisma/ directory (Recommended)
**Notes:** Convex migration is complete — Prisma remnants are fully removable.

| Option                       | Description                                                         | Selected |
| ---------------------------- | ------------------------------------------------------------------- | -------- |
| Consolidate to single client | Remove duplicate HTTP client in autoSync.ts, use existing client.ts | ✓        |
| Leave for now                | Note as technical debt, don't refactor in CRITICAL-only phase       |          |

**User's choice:** Consolidate to single client (Recommended)
**Notes:** Reduce duplication by removing autoSync's HTTP client, use lib/integrations/ticket-tailor/client.ts.

## Testing Strategy

| Option                    | Description                                   | Selected |
| ------------------------- | --------------------------------------------- | -------- |
| Delete stale Prisma tests | Remove test files mocking Prisma interfaces   | ✓        |
| Update to Convex mocks    | Rewrite tests to use Convex testing utilities |          |

**User's choice:** Delete stale Prisma tests (Recommended)
**Notes:** 868-line test file mocking non-existent interfaces provides false confidence — delete it.

| Option                        | Description                                            | Selected |
| ----------------------------- | ------------------------------------------------------ | -------- |
| Fix vitest env for components | Change vitest from 'node' to 'jsdom'                   |          |
| Leave for now                 | Note as technical debt, fix in dedicated testing phase | ✓        |

**User's choice:** Leave for now
**Notes:** vitest environment fix belongs in a dedicated testing phase, not this CRITICAL-only phase.

---

## the agent's Discretion

- Exact order of query auth guard implementation
- Component naming for extracted dead code
- Whether to add comments explaining why webhook secret is not needed

## Deferred Ideas

- No webhook replay protection for Tikkie (HIGH)
- Financial amounts accept negative values (HIGH)
- No audit trail for financial mutations (HIGH)
- Race condition in room assignment (HIGH)
- No Zod validation library (MEDIUM)
- `v.any()` on 13+ schema fields (MEDIUM)
- String IDs instead of `v.id()` (MEDIUM)
- Fragile name-only auto-match logic (MEDIUM)
- Massive file refactoring (structural)
- Missing error/loading boundaries (UX)
- No mobile hamburger menu (UX)
- Accessibility gaps (UX)
- Zero component tests (testing)
- Zero E2E tests (testing)
- vitest environment fix (testing)
