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

/**
 * The locked age-band code union shared by the public signup contract. Codes,
 * labels and bounds are event-configured catalog data — the UI and submission
 * rules never hardcode a specific band such as under_3.
 */
export const signupAgeBandCodeValidator = v.union(
  v.literal("under_3"),
  v.literal("3_11"),
  v.literal("12_17"),
  v.literal("18_plus")
)

export type SignupAgeBandCode = "under_3" | "3_11" | "12_17" | "18_plus"

export const signupAccommodationOccupancyValidator = v.union(
  v.literal("single"),
  v.literal("shared"),
  v.literal("family")
)

export type SignupAccommodationOccupancy = "single" | "shared" | "family"

/**
 * One per-attendee accommodation preference carried by a public signup
 * submission. It contains exactly one attendee key, a category ID, an
 * occupancy literal, the superior/cot flags, and an optional age-band code.
 * It never contains room IDs, slot IDs, dates, night counts, prices, totals,
 * or snapshots — those are server-resolved.
 */
export const signupAccommodationSelectionValidator = v.object({
  attendeeKey: v.string(),
  categoryId: v.id("accommodationCategories"),
  occupancy: signupAccommodationOccupancyValidator,
  upgradeSelected: v.boolean(),
  cotSelected: v.boolean(),
  ageBandCode: v.optional(signupAgeBandCodeValidator),
})

export type SignupAccommodationSelection = {
  attendeeKey: string
  categoryId: string
  occupancy: SignupAccommodationOccupancy
  upgradeSelected: boolean
  cotSelected: boolean
  ageBandCode?: SignupAgeBandCode
}

/**
 * Restore-payload shape for accommodation preferences. IDs are stringified
 * (like the other restore arrays) so a replayed restore payload round-trips.
 */
export type SignupAccommodationSelectionRestore = {
  attendeeKey: string
  categoryId: string
  occupancy: SignupAccommodationOccupancy
  upgradeSelected: boolean
  cotSelected: boolean
  ageBandCode?: string
}

export type SignupSubmissionEnvelope = {
  eventId: string
  source: SignupSource
  idempotencyKey: string
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
    phone?: string
    gender: SignupGender
    location?: string
    dietaryRestrictions?: string
    roommatePreference?: string
    roommateAvoid?: string
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
  accommodationSelections: SignupAccommodationSelection[]
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
  accommodationSelections: SignupAccommodationSelectionRestore[]
}

export const signupSubmissionErrorCodeValues = [
  "CAPACITY_EXCEEDED",
  "TICKET_UNAVAILABLE",
  "ASSIGNMENT_UNAVAILABLE",
  "SUBMISSION_CONFLICT",
  "CAPTCHA_REQUIRED",
] as const

export type SignupSubmissionErrorCode =
  (typeof signupSubmissionErrorCodeValues)[number]
