# v4.0 Project Research Summary

## Key Findings

- The existing stack is sufficient; this is a brownfield information-architecture and composition change.
- The event layout and existing Convex hooks are the strongest integration seams.
- The highest-value change is an actionable Overview plus quieter Finance and Accommodation workspaces.
- Main risks are duplicate navigation, unbounded reads, finance recalculation, broken deep links, and mobile/accessibility regressions.

## Roadmap Implications

1. Lock navigation and route ownership first.
2. Build Overview from bounded existing contracts.
3. Consolidate workspaces while preserving behavior and links.
4. Finish with shared states, responsive/accessibility hardening, and regression verification.
