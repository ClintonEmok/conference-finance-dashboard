export type SignupTicketUnavailableReason =
  | "sold_out"
  | "disabled"
  | "hidden"
  | "not_on_sale"

export type SignupAccommodationIneligibilityReason =
  | "accommodation_disabled"
  | "no_assignable_inventory"
  | "event_closed"

export type SignupSubmissionEnvelope = {
  signupEventId: string
  source: "integration" | "internal"
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
    fullName: string
    email: string
    gender: "male" | "female" | "mixed" | "unknown"
    location: string
    dietaryRestrictions: string
    roommatePreference: string
    roommateAvoid: string
    phone: string
  }>
  ticketSelections: Array<{
    ticketTypeId: string
    quantity: number
    attendeeKey?: string
  }>
  assignments: Array<{
    attendeeKey: string
    slotId: string
  }>
}

export type SignupSubmissionResult = {
  submissionId: string
  bookingRef: string
  submittedAt: string
}

export type SignupSubmissionErrorCode =
  | "INVALID_SUBMISSION"
  | "CAPACITY_EXCEEDED"
  | "TICKET_UNAVAILABLE"
  | "ASSIGNMENT_UNAVAILABLE"
  | "SUBMISSION_CONFLICT"
  | "HONEYPOT_TRIGGERED"
