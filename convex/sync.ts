// convex/sync.ts
// Backward-compatible re-exports from domain modules
// All functions preserved - now organized by domain concern

// Events
export {
  getTicketTailorEventByProviderId,
} from "./sync/events"

// Orders
export {
  getTicketTailorOrderByProviderId,
} from "./sync/orders"

// Attendees
export {
  getTicketTailorAttendeesByOrderId,
  internalGetTicketTailorAttendeesByOrderId,
} from "./sync/attendees"

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
  internalGetAmountDueByOrderIds,
  internalGetAttendeesByOrder,
  internalGetTikkiePaymentLinks,
  internalMarkTikkiePaymentLinkChecked,
} from "./sync/internal"
