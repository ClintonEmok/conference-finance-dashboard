# Phase 20: Operator Handoff + Compatibility Layer - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Ensure submitted signup data is immediately useful to operators and remains compatible with existing integration-backed finance workflows. This phase delivers operator-facing handoff/read behavior and source-agnostic compatibility updates for internal + integration events, without adding new product capabilities.

</domain>

<decisions>
## Implementation Decisions

### Operator rooming views

- **D-01:** Default operator handoff grouping should be booking/submission-first (not room-first).
- **D-02:** Attendee rooming and assignment notes should open in a side panel, not modal-only or inline-only.
- **D-03:** Unresolved assignment issues should surface in a priority queue before normal rows.

### Source-agnostic display

- **D-04:** Source labeling should be hidden by default in primary operator views and available in metadata/details.
- **D-05:** Mixed-source event/operator lists should use unified default sort/filter behavior.

### Compatibility safeguards

- **D-06:** Phase 20 must preserve compatibility outcomes required by roadmap success criteria, while exact operator-facing fallback semantics are left to Claude discretion.

### Handoff verification UX

- **D-07:** Phase 20 must include explicit operator-ready handoff verification cues, while exact presentation density and control pattern are left to Claude discretion.

### Claude's Discretion

- Whether operator submission detail defaults show beds + unassigned together as expanded rows or summary-first with quick expansion, as long as unresolved assignment state is immediately discoverable.
- How missing integration-style fields for internal events are rendered (normalized placeholders vs conditional section hiding), as long as the operator model remains source-agnostic and understandable.
- Freshness/partial-sync cue style (badge, warning, or status field), as long as stale state is visible and actionable.
- Compatibility guard behavior details when mappings are incomplete (explicit unknown vs guarded acknowledgement vs blocking) aligned to existing dashboard safety patterns.
- Handoff verification presentation shape (checklist/timeline/summary), CTA behavior for incomplete handoff, success signaling persistence, and default detail density.

</decisions>

<specifics>
## Specific Ideas

- Keep operator cognition focused on booking/submission continuity first, then assignment resolution.
- Keep source differences out of the primary reading flow unless operators intentionally inspect metadata.
- Prioritize queue-first visibility for unresolved rooming issues to reduce missed handoff gaps.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within Phase 20 scope.

</deferred>

---

_Phase: 20-operator-handoff-compatibility-layer_
_Context gathered: 2026-03-30_
