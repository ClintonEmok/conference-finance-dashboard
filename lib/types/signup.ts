import { v } from "convex/values"

export const ticketUnavailableReasonValidator = v.union(
  v.literal("sold_out"),
  v.literal("disabled"),
  v.literal("hidden"),
  v.literal("not_on_sale")
)

export type TicketUnavailableReason =
  | "sold_out"
  | "disabled"
  | "hidden"
  | "not_on_sale"

export const accommodationIneligibilityReasonValidator = v.union(
  v.literal("accommodation_disabled"),
  v.literal("no_assignable_inventory"),
  v.literal("event_closed")
)

export type AccommodationIneligibilityReason =
  | "accommodation_disabled"
  | "no_assignable_inventory"
  | "event_closed"
