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

export const signupAccommodationOccupancyValidator = v.union(
  v.literal("single"),
  v.literal("shared"),
  v.literal("family")
)

export type SignupAccommodationOccupancy = "single" | "shared" | "family"

/**
 * The independent per-attendee night-before level of the simplified
 * accommodation contract. Omitted means no night-before stay. `standard`
 * prices one night at the Standard occupancy rate; `superior` adds the fixed
 * €10 premium to that same one-night line. It is fully independent of the
 * included-stay category and of the `superior_upgrade` add-on.
 */
export const signupAccommodationNightBeforeLevelValidator = v.union(
  v.literal("standard"),
  v.literal("superior")
)

export type SignupAccommodationNightBeforeLevel = "standard" | "superior"

export const signupAccommodationNightBeforeOccupancyValidator = v.union(
  v.literal("single"),
  v.literal("shared")
)

export type SignupAccommodationNightBeforeOccupancy = "single" | "shared"

/**
 * One selected accommodation option for an attendee. The client supplies only
 * the event option key, a quantity and the nights the option applies to —
 * prices, totals and eligibility are always resolved server-side.
 */
export const signupAccommodationOptionSelectionValidator = v.object({
  optionKey: v.string(),
  quantity: v.number(),
  nights: v.number(),
})

export type SignupAccommodationOptionSelection = {
  optionKey: string
  quantity: number
  nights: number
}

/**
 * One per-attendee accommodation preference carried by a public signup
 * submission. It contains exactly one attendee key, an occupancy literal, and
 * a list of selected option rows. Under the simplified contract the client
 * never supplies a category — the server resolves the included-stay category
 * (Standard) — so `categoryId` is optional legacy input that the resolver
 * rejects when it does not match the server-resolved included-stay category.
 * The optional `nightBeforeLevel` carries the independent one-night
 * night-before level; the optional `nights` is legacy total-stay input that
 * the resolver only accepts when it equals the derived total. It never
 * contains room IDs, slot IDs, dates, prices, totals, or snapshots — those
 * are server-resolved.
 */
export const signupAccommodationSelectionValidator = v.object({
  attendeeKey: v.string(),
  categoryId: v.optional(v.id("accommodationCategories")),
  occupancy: signupAccommodationOccupancyValidator,
  optionSelections: v.array(signupAccommodationOptionSelectionValidator),
  nightBeforeLevel: v.optional(signupAccommodationNightBeforeLevelValidator),
  nightBeforeOccupancy: v.optional(
    signupAccommodationNightBeforeOccupancyValidator
  ),
  nights: v.optional(v.number()),
})

export type SignupAccommodationSelection = {
  attendeeKey: string
  categoryId?: string
  occupancy: SignupAccommodationOccupancy
  optionSelections: SignupAccommodationOptionSelection[]
  /** Independent one-night night-before level; omitted = no night before. */
  nightBeforeLevel?: SignupAccommodationNightBeforeLevel
  /** Occupancy for the independent night-before stay; omitted uses main occupancy for legacy rows. */
  nightBeforeOccupancy?: SignupAccommodationNightBeforeOccupancy
  /** Legacy buyer-chosen total stay nights; omitted = configured base. */
  nights?: number
}

/**
 * Restore-payload shape for accommodation preferences. IDs are stringified
 * (like the other restore arrays) so a replayed restore payload round-trips.
 * `nights` is the resolved selected night count persisted on the order row.
 */
export type SignupAccommodationSelectionRestore = {
  attendeeKey: string
  categoryId?: string
  occupancy: SignupAccommodationOccupancy
  optionSelections: SignupAccommodationOptionSelection[]
  nightBeforeLevel?: SignupAccommodationNightBeforeLevel
  nightBeforeOccupancy?: SignupAccommodationNightBeforeOccupancy
  nights?: number
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
