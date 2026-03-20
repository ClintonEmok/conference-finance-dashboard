# Phase 6: tikkie integration - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Tikkie payment-link generation and payment-state tracking into the existing finance workflow. This phase covers operator-facing link creation, status visibility, and share/follow-up behavior inside the current dashboard surfaces. It does not reopen broader MVP navigation or add automated reminder systems.

</domain>

<decisions>
## Implementation Decisions

### Link entry points
- Tikkie link actions should exist in both `Outstanding balances` and attendee detail.
- `Outstanding balances` is the primary place to generate links.
- Attendee detail acts as the secondary place for history, visibility, and follow-up context.
- In `Outstanding balances`, `Generate Tikkie link` should be a direct row action, not hidden in a menu or moved into a side panel.

### Link creation behavior
- Link generation should open a prefilled confirmation modal before creation.
- The modal should allow editing of `amount`, `expiry date`, and `description/reference`.
- The modal should stay lightweight and operational, not expand into a full workflow form.

### Payment status visibility
- Show row-level link status directly in the existing finance surfaces.
- Show recency metadata (`last checked` / timestamp) so operators can trust what they are seeing.
- Add a subtle stale badge after a threshold rather than using heavy warning banners.

### Share and follow-up actions
- Operators should be able to copy the latest link and open it directly.
- The default UI should show the latest link first.
- Prior links should be available through expandable history rather than full inline history.

### Claude's Discretion
- Exact stale threshold and badge wording.
- Exact modal layout and component composition.
- Exact placement of expandable history affordance as long as latest-link-first stays true.

</decisions>

<specifics>
## Specific Ideas

- Keep the Tikkie workflow anchored in the current operator loop: outstanding balances first, attendee detail second.
- The confirmation step should feel like a quick operator review, not a separate wizard.
- Status trust matters more than decorative UI — operators need to know if a link is still actionable.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/dashboard/reconciliation/page.tsx`: already contains row-level Tikkie link actions and status UI patterns.
- `app/dashboard/attendees/[attendeeId]/page.tsx`: already exposes attendee-level Tikkie history and payment context.
- `app/api/dashboard/tikkie-links/route.ts`: existing protected route for create/list/refresh behavior.
- `lib/domain/finance/tikkie-links.ts`: existing domain layer for Tikkie link persistence and status refresh logic.

### Established Patterns
- Protected dashboard routes use `auth.api.getSession({ headers })` and explicit `401` JSON contracts.
- Finance views already prefer operator-visible row actions, clear badges, and scoped context over hidden workflows.
- "Outstanding balances" is the established user-facing replacement for older reconciliation wording.

### Integration Points
- Primary operator trigger path starts in `app/dashboard/reconciliation/page.tsx`.
- Secondary visibility and follow-up path connects through `app/dashboard/attendees/[attendeeId]/page.tsx`.
- Tikkie server behavior should continue through `app/api/dashboard/tikkie-links/route.ts` and `lib/domain/finance/tikkie-links.ts`.

</code_context>

<deferred>
## Deferred Ideas

- Automated reminders remain out of scope for this phase.
- Broader collection automation beyond manual operator-controlled Tikkie workflows remains out of scope.
- Operational hardening beyond what is needed for trustworthy link state should stay in later work.

</deferred>

---

*Phase: 06-tikkie-integration*
*Context gathered: 2026-03-20*
