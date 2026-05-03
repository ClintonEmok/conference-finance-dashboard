# Phase 30: Shareable Reporting Link - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Stakeholders can open a tokenized, read-only report link that surfaces aggregated finance slices only. The page must support event-level reporting summaries such as grouping by location and gender, and it must make overpayments and balance states visible without exposing raw attendee or order rows.

This phase is a reporting surface, not a new finance model. It depends on canonical money data already being trustworthy enough to drive read-only summaries.

RPT-03 is in scope.

</domain>

<decisions>
## Implementation Decisions

### D-01: Access model
- The public surface uses a tokenized route: `/reports/[token]`
- Tokens are read-only and can be revoked
- The token resolves to one report scope, usually a single event

### D-02: Data contract
- The report returns aggregated slices only
- Required slices include location, gender, and balance state / overpayment visibility
- No row-level attendee, order, or payment payloads are exposed to the public page

### D-03: Share entrypoint
- Event-scoped dashboard pages expose a simple share action
- The dashboard action copies or opens the report link for the current event context

### D-04: Safety boundary
- The report should reuse canonical finance data and existing public-access patterns
- Public report access must not depend on the authenticated dashboard shell

### Agent's Discretion
- Whether the share token is stored as a dedicated Convex table or encoded/hashed in an existing table
- Whether the public report is powered by a Next route handler, Convex query, or both
- Exact grouping labels for location, as long as the output remains aggregated and stakeholder-friendly

</decisions>

<canonical_refs>
## Canonical References

### Requirements
- `.planning/REQUIREMENTS.md` — `RPT-03` requires canonical reporting slices by event, payable state, allocation state, and balance state

### Existing pages
- `app/dashboard/financial/page.tsx` — internal financial overview and collections drilldown
- `app/dashboard/events/[slug]/overview/page.tsx` — event-level overview with existing grouping controls and attendee/reconciliation data

### Public-access pattern
- `convex/publicTracking.ts` — existing public, token-like lookup pattern for shareable read-only state

### API patterns
- `app/api/dashboard/revenue/route.ts` — authenticated dashboard API shape
- `app/api/dashboard/reconciliation/route.ts` — authenticated dashboard API shape for read-only summaries
- `app/api/dashboard/orders/export/route.ts` — authenticated export route shape

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `requireApiUser()` for authenticated dashboard access
- `formatMoney()` and existing shadcn UI primitives for summary cards and tables
- Existing finance loaders in `lib/domain/finance/*`

### Established Patterns
- Event-scoped dashboards already derive `slug` from route params and `eventId` from Convex
- Read-only dashboard APIs already pass filtered summary payloads rather than raw tables
- Public Tracking currently shows that tokenized public lookup can work without the dashboard shell

### Integration Points
- A public report route can be added beside the dashboard without changing the authenticated shell
- The event overview page is the best place to launch sharing because it already has event context
- Canonical aggregations should come from the same internal finance readers used elsewhere

</code_context>

<specifics>
## Specific Ideas

- Keep the report visually compact enough for stakeholder forwarding and mobile viewing
- Use a clear no-data / expired-token state rather than redirecting to auth
- Make overpayments obvious in the report summary, not hidden in a detail table

</specifics>

<deferred>
## Deferred Ideas

- Per-attendee drilldown from the public report
- Exporting the public report as CSV or PDF
- Report notes/provenance editing
- Multiple share links per event with different scopes
- Expiring links by default

</deferred>
