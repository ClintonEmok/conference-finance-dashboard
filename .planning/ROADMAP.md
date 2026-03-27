# Roadmap: Conference Finance Dashboard

## Milestones

- ✅ **v1.0 MVP** — shipped 2026-03-27 (archive: `.planning/milestones/v1.0-ROADMAP.md`, requirements: `.planning/milestones/v1.0-REQUIREMENTS.md`, audit: `.planning/milestones/v1.0-MILESTONE-AUDIT.md`)
- 🚧 **v2.0 Event Signup + Dual-Source Events** — planned

## Active Milestone: v2.0

**Objective:** Run conference registrations from either external integrations or internal tooling while preserving one consistent finance/reconciliation experience.

### Scope

- Public event listing + event detail + signup flow
- Internal event/ticket type/registration data model
- Source-aware admin controls for integration vs internal mode
- Source-agnostic event contracts for dashboard/finance reads
- Backward compatibility for existing Ticket Tailor and Tikkie workflows

### Out of Scope

- Multi-tenant/public attendee account management
- Full self-service attendee profile editing after signup
- Replacing provider integrations as source of truth for integration-backed events

## Phases

- [ ] **Phase 17: Dual-Source Event Signup Platform**

### Phase 17: Dual-Source Event Signup Platform

**Goal:** Launch an MVP public signup flow and support both integration-backed and internal event operations without breaking current finance workflows.
**Depends on:** Completed v1.0 baseline
**Requirements:** ES-01, ES-02, ES-03, ES-04, ES-05

Plans:

- [ ] 17-01-PLAN.md — Schema + Convex contracts for internal events, ticket types, and registrations
- [ ] 17-02-PLAN.md — Public `/events` listing, event detail, and signup submission flow
- [ ] 17-03-PLAN.md — Admin source selector + unified dashboard event read model and compatibility checks
