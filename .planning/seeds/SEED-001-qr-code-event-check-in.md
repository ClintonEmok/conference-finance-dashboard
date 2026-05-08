---
id: SEED-001
status: dormant
planted: 2026-03-31
planted_during: v2.0 - Attendee Signup + Accommodation Self-Assignment
trigger_when: next major version
scope: Medium
---

# SEED-001: QR Code Event Check-in System

## Idea Summary

A check-in system for events based on QR codes. QR codes are generated per attendee for streamlined event day tracking.

## Why This Matters

This solves the problem of tracking attendees on the day of the event. Currently, there's no automated way to verify attendee presence at the event venue, which makes it difficult to:

- Confirm who actually attended vs. who registered
- Manage capacity and safety protocols
- Follow up with no-shows vs. actual attendees
- Generate accurate attendance reports

## When to Surface

**Trigger:** next major version

This seed should be presented during `/gsd-new-milestone` when the milestone scope matches any of these conditions:

- Event day operations and logistics features
- Attendee management enhancements
- Mobile/onsite operator tools
- Real-time event tracking capabilities

## Scope Estimate

**Medium** — A phase or two — needs planning

This involves:

- QR code generation and storage per attendee
- Mobile-friendly check-in interface for operators
- Real-time attendance tracking dashboard
- Integration with existing attendee data model
- Potential offline capability for unreliable venue internet

## Breadcrumbs

Related code and decisions found in the current codebase:

- `.planning/STATE.md` - Current milestone context with attendee signup and accommodation features
- `.planning/ROADMAP.md` - Project roadmap for planning integration
- `convex/` - Attendee mutations and queries (search: attendee, checkIn)
- `app/dashboard/attendees/` - Existing attendee detail and list views
- Phase 22 context - Attendee grouping and room assignment features

## Notes

Considerations for implementation:

- QR codes should be unique and non-guessable (UUID-based or similar)
- Should support both digital (phone screen) and printed QR codes
- May need operator mobile app or web interface optimized for tablets/phones
- Could integrate with existing accommodation assignment data for room check-in verification
- Consider privacy implications and data retention policies for check-in timestamps
