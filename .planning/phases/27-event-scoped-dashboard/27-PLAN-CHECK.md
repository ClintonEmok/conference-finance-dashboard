# Phase 27 Plan Check

**Verdict:** flag

## Bottom line

The plans cover the stated Phase 27 success criteria at a high level: `/dashboard` will hand off to the chooser, the chooser keeps the create/open paths visible, and the shell/layout work aims to make event scope obvious.

## What looks covered

- Event-first landing after login
- Existing event selection from the chooser
- New-event CTA from the chooser
- Slug-based event navigation
- Shared event switcher in global/scoped chrome

## Gaps / risky assumptions

1. **Active-event wiring is underspecified.**
   The switcher plan says it should show the current event when a slug is provided, but it does not say how the slug is sourced or passed in. That is a hidden dependency for both the global shell and scoped layout.

2. **The shell de-emphasis is not fully pinned down.**
   Task 2 inserts the switcher, but it does not explicitly say which global sections stay, which get softened/hidden, or how to avoid the shell still reading like the old broad command center.

3. **Chooser UX/IA is a bit loose.**
   The plan keeps the existing chooser surface, but it does not commit to the exact presentation for “focused,” “easy to open,” or recent/common-event prioritization. That may leave the page functional but not clearly event-first enough.

## Recommendation

Before execution, tighten the plan with one explicit note for the switcher API/slug source and one short UI decision for the chooser/shell hierarchy. No major re-scope is needed; this is mainly about removing ambiguity so implementation lands the intended event-scoped experience.
