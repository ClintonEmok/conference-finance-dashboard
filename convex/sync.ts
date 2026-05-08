// convex/sync.ts
// Backward-compatible re-exports from domain modules
// All functions preserved - now organized by domain concern

// Sync runs
export {
  getSyncRuns,
  getSyncRunById,
  getLatestSyncRun,
  startSyncRun,
  updateSyncRun,
  completeSyncRun,
  internalStartSyncRun,
  internalCompleteSyncRun,
} from "./sync/runs"

// Events
export {
  upsertTicketTailorEvent,
  getTicketTailorEventByProviderId,
  internalUpsertTicketTailorEvent,
} from "./sync/events"

// Orders
export {
  upsertTicketTailorOrder,
  getTicketTailorOrderByProviderId,
  archiveMissingOrdersForEvent,
  internalUpsertTicketTailorOrder,
  internalArchiveMissingOrdersForEvent,
} from "./sync/orders"

// Attendees
export {
  upsertTicketTailorAttendee,
  getTicketTailorAttendeesByOrderId,
  internalUpsertTicketTailorAttendee,
  internalGetTicketTailorAttendeesByOrderId,
} from "./sync/attendees"

// Webhooks
export {
  getWebhookEvents,
  processWebhookEvent,
  createWebhookEvent,
  getWebhookEventByProviderId,
  getWebhookEventById,
  updateWebhookEvent,
  getPendingWebhookEvents,
} from "./sync/webhooks"

// Families
export {
  createAttendeeFamilyGroup,
  getAttendeeFamilyGroupByPrimaryId,
  addAttendeeToFamilyGroup,
  getFamilyMembersByGroupId,
  internalCreateAttendeeFamilyGroup,
  internalAddAttendeeToFamilyGroup,
  internalGetAttendeeFamilyGroupByPrimaryId,
  internalGetFamilyMembersByGroupId,
} from "./sync/families"

// Internal utilities (for actions/cron)
export {
  internalGetUnassignedPayments,
  internalGetPaidOrders,
  internalGetAttendeesByOrder,
  internalGetTikkiePaymentLinks,
} from "./sync/internal"
