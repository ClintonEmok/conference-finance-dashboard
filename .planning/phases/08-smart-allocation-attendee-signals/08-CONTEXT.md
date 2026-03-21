# Phase 7 Context: Smart Allocation & Attendee Signals

## Why This Phase Exists

Phase 5 delivered assign/unassign flows and a usable room-allocation workspace, but accommodation decisions still depend mostly on operator memory and raw attendee review. The next step is turning Ticket Tailor attendee signals into durable, queryable accommodation data that the allocation workflow can actually use.

## Operational Need

- Gender should come from attendee custom questions and drive roommate compatibility.
- Location and remarks should be visible and filterable during accommodation decisions.
- Elderly attendees, attendees with disability or accessibility needs, and families with young children should be elevated for allocation priority.
- Same-order attendees should automatically stay linkable as a family or party, with room for future manual linking across separate orders.

## Current Foundation Already Present

- Ticket Tailor sync persists attendee-level records.
- Accommodation inventory and room assignment flows already exist.
- Ticket Tailor attendee enrichment has started with `customAnswers`, `genderType`, `ageGroup`, `ticketCategory`, `allocationPriority`, and family-group tables.
- The current implementation is SQLite-safe and should remain PostgreSQL-friendly.

## What Phase 7 Must Add

1. Normalize attendee signals so they are trustworthy and visible outside raw JSON.
2. Expose signal-aware filtering in attendee and accommodation workflows.
3. Add smart allocation proposals that respect family grouping, gender constraints, and priority accommodation cases.

## Non-Goals For This Phase

- Do not couple the work to Tikkie or payment-link automation.
- Do not require PostgreSQL-only JSON querying tricks.
- Do not force cross-order family editing in the first plan; leave a clean foundation for it.
