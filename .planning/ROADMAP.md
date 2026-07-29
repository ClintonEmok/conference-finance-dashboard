# Roadmap: Conference Finance Dashboard

## Overview

v4.0 improves the protected event-scoped dashboard without changing canonical finance semantics. It starts with information architecture, turns the event home into an actionable Overview, consolidates Finance and Accommodation workflows, then hardens shared states, responsive behavior, accessibility, and regression coverage.

## Milestones

- ✅ **v1.0 MVP** — shipped 2026-03-27
- ✅ **v2.0 Attendee Signup + Accommodation Self-Assignment** — groundwork delivered in phases 18-25
- ✅ **v3.0 Canonical Orders Foundation** — canonical runtime and finance groundwork delivered in phases 26-33
- 🚧 **v4.0 Event Dashboard UX Overhaul** — initialized 2026-07-29

## Active Milestone: v4.0 Event Dashboard UX Overhaul

**Objective:** Turn the event-scoped dashboard into a stats-led operational home with concise navigation and coherent Finance and Accommodation workspaces.

### Scope

- Event Overview information architecture and bounded operational stats
- One concise event sidebar and clear event context
- Finance workspace for Orders, Payments, Donations, and Reconciliation
- Accommodation workspace for Hotels and Allocation
- Shared query states, responsive behavior, accessibility, settings/share placement, and regression verification

### Out Of Scope

- New public signup UX
- Ticket Tailor/provider schema redesign
- New finance formulas or canonical data model changes
- Cross-event analytics or multi-tenant support

## Phases

- [ ] **Phase 34: Event Dashboard Information Architecture** - Establish the final event home, sidebar structure, route ownership, and Settings placement.
- [ ] **Phase 35: Actionable Event Overview** - Build the stats-led event home and action-oriented operational summary from bounded existing contracts.
- [ ] **Phase 36: Finance And Accommodation Workspaces** - Consolidate related routes into tabbed workspaces while preserving behavior and deep links.
- [ ] **Phase 37: Shared Dashboard Quality** - Standardize query states, responsive layouts, keyboard behavior, and accessibility across migrated surfaces.
- [ ] **Phase 38: UX Regression And Human Verification** - Verify route integrity, data consistency, mobile/desktop behavior, and visual coherence.

---

### Phase 34: Event Dashboard Information Architecture

**Goal:** Admins see one clear event-scoped navigation model and a deliberate Overview entry point at every event depth.

**Depends on:** v3.0 event shell

**Requirements:** UX-01, UX-02, UX-03, QUAL-04

**Success Criteria:**

1. The event home route renders as the Overview entry point rather than a link directory.
2. The event sidebar contains the agreed concise sections with stable active-state behavior.
3. Event identity, switcher, status, and primary event actions remain clear without duplicate chrome.
4. Settings owns event-level share/configuration actions while primary navigation stays operational.
5. Existing event deep links remain reachable or have explicit safe redirects.

**Plans:** TBD

---

### Phase 35: Actionable Event Overview

**Goal:** The Overview gives finance and operations admins a fast, trustworthy read on the selected event and its next actions.

**Depends on:** Phase 34

**Requirements:** OPS-01, OPS-02

**Success Criteria:**

1. Overview shows bounded event-scoped metrics for attendance, orders/tickets, money status, and accommodation.
2. Metric values reuse existing canonical contracts and agree with their corresponding detail surfaces.
3. The page highlights actionable exceptions with direct links to the relevant workflow.
4. The Overview remains useful for empty or early-stage events without fabricated values.

**Plans:** TBD

---

### Phase 36: Finance And Accommodation Workspaces

**Goal:** Related finance and accommodation operations share context through accessible tabbed workspaces without losing existing behavior.

**Depends on:** Phase 34

**Requirements:** FINUX-01, FINUX-02, ACCUX-01, ACCUX-02

**Success Criteria:**

1. Finance provides accessible navigation for Orders, Payments, Donations, and Reconciliation under one event-scoped workspace.
2. Accommodation provides accessible navigation for Hotels and Allocation under one event-scoped workspace.
3. Existing filters, mutations, canonical money semantics, and event scoping continue to work.
4. Existing useful deep links remain valid or redirect predictably to the corresponding workspace tab.

**Plans:** TBD

---

### Phase 37: Shared Dashboard Quality

**Goal:** Event-scoped pages behave consistently across loading, errors, empty data, keyboard navigation, and viewport sizes.

**Depends on:** Phases 35-36

**Requirements:** QUAL-01, QUAL-02, QUAL-03

**Success Criteria:**

1. Shared query-state components or patterns cover loading, error, empty, and populated states across migrated surfaces.
2. Primary workflows are usable on narrow mobile widths and desktop without horizontal overflow or hidden critical actions.
3. Sidebar, tabs, tables, status indicators, and action controls are keyboard-accessible and semantically labeled.
4. Dashboard data reads remain bounded and do not duplicate expensive finance or accommodation queries.

**Plans:** TBD

---

### Phase 38: UX Regression And Human Verification

**Goal:** The redesigned event dashboard is verified as a coherent, data-correct experience across routes and devices.

**Depends on:** Phase 37

**Requirements:** OPS-03

**Success Criteria:**

1. Every primary event route has intentional loading, error, empty, and no-access behavior.
2. Overview metrics and action links are verified against source surfaces for representative events.
3. Desktop and mobile route walkthroughs confirm no duplicate shell, broken deep links, or inaccessible controls.
4. Automated tests, type checks, and Convex validation pass for the completed changes.

**Plans:** TBD

---

## Progress

| Phase | Goal | Requirements | Plans | Status |
| --- | --- | --- | --- | --- |
| 34 - Event Dashboard Information Architecture | Event home and navigation | UX-01, UX-02, UX-03, QUAL-04 | TBD | Not started |
| 35 - Actionable Event Overview | Stats-led operational home | OPS-01, OPS-02 | TBD | Not started |
| 36 - Finance And Accommodation Workspaces | Consolidated operational workspaces | FINUX-01, FINUX-02, ACCUX-01, ACCUX-02 | TBD | Not started |
| 37 - Shared Dashboard Quality | Shared states and responsive accessibility | QUAL-01, QUAL-02, QUAL-03 | TBD | Not started |
| 38 - UX Regression And Human Verification | Cross-route verification | OPS-03 | TBD | Not started |

**Totals:** 5 phases, 14 requirements mapped, 0 plans complete.
