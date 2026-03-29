import { v } from "convex/values"

export const signupSourceValidator = v.union(
  v.literal("integration"),
  v.literal("internal")
)

export type SignupSource = "integration" | "internal"

export const signupGenderValidator = v.union(
  v.literal("male"),
  v.literal("female"),
  v.literal("mixed"),
  v.literal("unknown")
)

export type SignupGender = "male" | "female" | "mixed" | "unknown"

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

export type SignupSubmissionEnvelope = {
  eventId: string
  source: SignupSource
  idempotencyKey: string
  payloadFingerprint: string
  honeypotSeen: boolean
  notes?: string
  booker: {
    name: string
    email: string
    phone?: string
  }
  attendees: Array<{
    attendeeKey: string
    name: string
    email?: string
    phone: string
    gender: SignupGender
    location: string
    dietaryRestrictions: string
    roommatePreference: string
    roommateAvoid: string
  }>
  ticketSelections: Array<{
    attendeeKey: string
    ticketTypeId: string
    quantity: 1
  }>
  assignments: Array<{
    attendeeKey: string
    slotId: string
    assignmentIntent: "assign" | "skip"
  }>
}

export type SignupSubmissionResult = {
  submissionId: string
  bookingRef: string
  submittedAt: string
  restorePayload?: SignupSubmissionRestorePayload
}

export type SignupSubmissionRestorePayload = {
  eventId: string
  source: SignupSource
  notes?: string
  booker: {
    name: string
    email: string
    phone?: string
  }
  attendees: SignupSubmissionEnvelope["attendees"]
  ticketSelections: SignupSubmissionEnvelope["ticketSelections"]
  assignments: SignupSubmissionEnvelope["assignments"]
}

export const signupSubmissionErrorCodeValues = [
  "CAPACITY_EXCEEDED",
  "TICKET_UNAVAILABLE",
  "ASSIGNMENT_UNAVAILABLE",
  "SUBMISSION_CONFLICT",
] as const

export type SignupSubmissionErrorCode =
  (typeof signupSubmissionErrorCodeValues)[number]
