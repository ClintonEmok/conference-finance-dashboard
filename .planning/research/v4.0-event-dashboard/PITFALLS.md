# v4.0 Research: Pitfalls

- Avoid duplicate sidebar chrome by keeping navigation ownership in the event layout.
- Avoid unbounded Overview reads; use bounded summaries and indexed/paginated queries.
- Avoid finance mismatches by reusing canonical totals, payables, and allocation contracts.
- Avoid Convex state inconsistencies with shared loading/error/empty patterns.
- Preserve deep links or provide explicit redirects when consolidating routes.
- Test narrow widths for tab lists, tables, drawers, and mobile sidebar behavior.
- Preserve semantic headings, keyboard focus, active states, and non-color status cues.
- Run Convex codegen and one-shot validation after any Convex change.
