# v4.0 Research: Architecture

- Modify `app/dashboard/events/[slug]/layout.tsx` for authoritative event navigation.
- Make `app/dashboard/events/[slug]/page.tsx` the Overview surface.
- Consolidate existing event routes without rewriting their domain logic.
- Reuse `lib/convex/hooks/` and canonical finance contracts; presentation must not recalculate money.
- Add shared metric, action-list, query-state, and workspace-tab components only where repetition warrants extraction.
- Build in this order: information architecture, Overview, workspaces, shared quality, verification.
