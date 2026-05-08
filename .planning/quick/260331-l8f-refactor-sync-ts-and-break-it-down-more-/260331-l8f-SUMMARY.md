---
phase: "26"
plan: "01"
subsystem: "sync"
tags: ["convex", "refactor", "sync", "architecture"]
requires: []
provides:
  [
    "domain-organized-sync-modules",
    "backward-compatible-sync-exports",
    "clear-auth-boundaries",
  ]
affects: ["future-sync-operations", "cron-actions", "api-contracts"]
tech-stack:
  added: []
  patterns: ["domain-module-organization", "barrel-exports", "auth-boundaries"]
key-files:
  created:
    - "convex/sync/runs.ts"
    - "convex/sync/events.ts"
    - "convex/sync/orders.ts"
    - "convex/sync/attendees.ts"
    - "convex/sync/webhooks.ts"
    - "convex/sync/families.ts"
    - "convex/sync/internal.ts"
  modified:
    - "convex/sync.ts"
decisions:
  - id: "26-01-domain-modules"
    description: "Organize sync operations into domain-specific modules (runs, events, orders, attendees, webhooks, families, internal)"
  - id: "26-01-auth-boundaries"
    description: "Public mutations require requireIdentity(ctx); internal mutations run without auth for cron/action use"
  - id: "26-01-backward-compat"
    description: "Maintain full backward compatibility via barrel re-exports; all existing api.sync.* and internal.sync.* calls continue to work"
metrics:
  duration: "25 minutes"
  completed: "2026-03-31"
---

# Phase 26 Plan 01: Refactor sync.ts into Domain Modules

## Summary

Refactored the 1291-line `convex/sync.ts` monolithic file into 7 well-organized domain modules with clear separation of concerns and maintained full backward compatibility.

## One-Liner

Domain-organized sync modules with clear auth boundaries and backward-compatible barrel exports.

## What Was Changed

### Domain Modules Created

| File                       | Purpose                        | Functions                                                                                                                                                                                                                                                            |
| -------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convex/sync/runs.ts`      | Sync run operations            | getSyncRuns, getSyncRunById, getLatestSyncRun, startSyncRun, updateSyncRun, completeSyncRun, internalStartSyncRun, internalCompleteSyncRun                                                                                                                           |
| `convex/sync/events.ts`    | Event sync operations          | upsertTicketTailorEvent, getTicketTailorEventByProviderId, internalUpsertTicketTailorEvent                                                                                                                                                                           |
| `convex/sync/orders.ts`    | Order sync operations          | upsertTicketTailorOrder, archiveMissingOrdersForEvent, getTicketTailorOrderByProviderId, internalUpsertTicketTailorOrder, internalArchiveMissingOrdersForEvent                                                                                                       |
| `convex/sync/attendees.ts` | Attendee sync operations       | upsertTicketTailorAttendee, getTicketTailorAttendeesByOrderId, internalUpsertTicketTailorAttendee, internalGetTicketTailorAttendeesByOrderId                                                                                                                         |
| `convex/sync/webhooks.ts`  | Webhook event operations       | getWebhookEvents, getWebhookEventByProviderId, getWebhookEventById, getPendingWebhookEvents, processWebhookEvent, createWebhookEvent, updateWebhookEvent                                                                                                             |
| `convex/sync/families.ts`  | Family group operations        | createAttendeeFamilyGroup, addAttendeeToFamilyGroup, getAttendeeFamilyGroupByPrimaryId, getFamilyMembersByGroupId, internalCreateAttendeeFamilyGroup, internalAddAttendeeToFamilyGroup, internalGetAttendeeFamilyGroupByPrimaryId, internalGetFamilyMembersByGroupId |
| `convex/sync/internal.ts`  | Internal utilities for actions | internalGetUnassignedPayments, internalGetPaidOrders, internalGetAttendeesByOrder, internalGetTikkiePaymentLinks                                                                                                                                                     |

### Auth Boundaries

- **Public mutations**: All call `await requireIdentity(ctx)` as first statement
- **Public queries**: No auth required (as before)
- **Internal mutations/queries**: No auth - run as system-level operations for cron/actions

### Backward Compatibility

- `convex/sync.ts` now acts as a clean barrel file (~67 lines vs ~1291 lines)
- All existing imports work identically:
  - `api.sync.*` references continue to work
  - `internal.sync.*` references continue to work
  - Function signatures unchanged

## Commits

1. `7963f9c` - feat(26-01): create sync runs and events domain modules
2. `2981541` - feat(26-01): create remaining sync domain modules
3. `9cfe937` - refactor(26-01): convert sync.ts to re-export barrel

## Verification

- All domain modules compile without errors
- All imports resolve correctly
- All exports preserved from original sync.ts
- Auth boundaries correctly applied (public with auth, internal without)

## Deviations from Plan

None - plan executed exactly as written.

## Notes

The refactoring improves maintainability by:

- Separating concerns into logical domain modules
- Making it easier to find and modify specific sync operations
- Establishing clear patterns for future sync functionality
- Preserving all existing behavior and contracts
