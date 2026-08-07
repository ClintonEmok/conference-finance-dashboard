import type {
  SignupGender,
  SignupSource,
  TicketUnavailableReason,
} from "@/lib/types/signup"

export const SIGNUP_STEP_ORDER = [
  "tickets",
  "buyer",
  "attendees",
  "accommodation",
  "review",
] as const

export type SignupStep = (typeof SIGNUP_STEP_ORDER)[number]

export type TicketSelectionDraft = {
  ticketTypeId: string
  label: string
  priceMinor: number
  quantity: number
  selectable: boolean
  reason: TicketUnavailableReason | null
  roomTypeId?: string
  roomTypeCategoryId?: string
  occupancy?: AccommodationOccupancy
}

export type AttendeeDraft = {
  attendeeKey: string
  ticketTypeId: string
  ticketLabel: string
  name: string
  email: string
  phone: string
  gender: SignupGender | ""
  location: string
  dietaryRestrictions: string
  roommatePreference: string
}

export type AccommodationOccupancy = "single" | "shared" | "family"

export type AccommodationOptionSelectionDraft = {
  optionKey: string
  quantity: number
  nights: number
}

/**
 * One attendee's options-only accommodation preference, keyed by the stable
 * attendee key in `SignupDraft.accommodationSelections`. Under the simplified
 * contract the ticket supplies occupancy, while the buyer chooses zero or more
 * configured options (each with a quantity and nights) and an independent
 * one-night `nightBeforeLevel` (omitted = no night before). The legacy
 * occupancy field remains in drafts so restored historical state can still be
 * normalized, but it is no longer buyer-editable.
 */
export type AccommodationSelectionDraft = {
  occupancy: AccommodationOccupancy | ""
  optionSelections: AccommodationOptionSelectionDraft[]
  /** Independent one-night night-before level; omitted = no night before. */
  nightBeforeLevel?: "standard" | "superior"
}

export type SignupDraft = {
  eventId: string
  source: SignupSource
  step: SignupStep
  ticketSelections: TicketSelectionDraft[]
  attendees: AttendeeDraft[]
  accommodationSelections: Record<string, AccommodationSelectionDraft>
  notes: string
  booker: {
    name: string
    email: string
    phone: string
  }
}

export function createInitialSignupDraft(
  eventId: string,
  source: SignupSource
): SignupDraft {
  return {
    eventId,
    source,
    step: "tickets",
    ticketSelections: [],
    attendees: [],
    accommodationSelections: {},
    notes: "",
    booker: {
      name: "",
      email: "",
      phone: "",
    },
  }
}

export function deriveAttendeeDraftsFromTicketSelections(
  ticketSelections: TicketSelectionDraft[],
  previousAttendees: AttendeeDraft[] = []
) {
  const previousByKey = new Map(
    previousAttendees.map((attendee) => [attendee.attendeeKey, attendee])
  )
  const next: AttendeeDraft[] = []

  for (const ticket of ticketSelections) {
    for (let index = 0; index < ticket.quantity; index += 1) {
      const attendeeKey = `${ticket.ticketTypeId}-${index + 1}`
      const previous = previousByKey.get(attendeeKey)

      next.push(
        previous ?? {
          attendeeKey,
          ticketTypeId: ticket.ticketTypeId,
          ticketLabel: ticket.label,
          name: "",
          email: "",
          phone: "",
          gender: "",
          location: "",
          dietaryRestrictions: "",
          roommatePreference: "",
        }
      )
    }
  }

  return next
}

/**
 * Keeps only the accommodation selections whose stable attendee key survives
 * a ticket-quantity change. Attendee keys embed the ticket type
 * (`${ticketTypeId}-${index + 1}`), so a changed ticket type produces new
 * keys and the old attendee's incompatible category/occupancy/options are
 * dropped automatically, while surviving attendees keep their selections.
 */
export function pruneAccommodationSelectionsForAttendees(
  previous: Record<string, AccommodationSelectionDraft>,
  nextAttendees: AttendeeDraft[]
): Record<string, AccommodationSelectionDraft> {
  const next: Record<string, AccommodationSelectionDraft> = {}
  for (const attendee of nextAttendees) {
    const prior = previous[attendee.attendeeKey]
    if (prior) {
      next[attendee.attendeeKey] = prior
    }
  }
  return next
}

export function invalidateDownstreamForTicketChange(
  draft: SignupDraft,
  nextTicketSelections: TicketSelectionDraft[]
): SignupDraft {
  const nextAttendees = deriveAttendeeDraftsFromTicketSelections(
    nextTicketSelections,
    draft.attendees
  )

  return {
    ...draft,
    step: "tickets",
    ticketSelections: nextTicketSelections,
    attendees: nextAttendees,
    accommodationSelections: pruneAccommodationSelectionsForAttendees(
      draft.accommodationSelections,
      nextAttendees
    ),
  }
}
