import type {
  SignupGender,
  SignupSource,
  TicketUnavailableReason,
} from "@/lib/types/signup"

export const SIGNUP_STEP_ORDER = [
  "tickets",
  "rooms",
  "attendees",
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
  roommateAvoid: string
}

export type SignupDraft = {
  eventId: string
  source: SignupSource
  step: SignupStep
  ticketSelections: TicketSelectionDraft[]
  attendees: AttendeeDraft[]
  assignments: Record<string, string>
  acknowledgeRandomFill: boolean
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
    assignments: {},
    acknowledgeRandomFill: false,
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
          roommateAvoid: "",
        }
      )
    }
  }

  return next
}

export function invalidateDownstreamForTicketChange(
  draft: SignupDraft,
  nextTicketSelections: TicketSelectionDraft[]
): SignupDraft {
  return {
    ...draft,
    step: "tickets",
    ticketSelections: nextTicketSelections,
    attendees: deriveAttendeeDraftsFromTicketSelections(
      nextTicketSelections,
      draft.attendees
    ),
    assignments: {},
    acknowledgeRandomFill: false,
  }
}

export function invalidateDownstreamForRoomChange(
  draft: SignupDraft,
  nextAssignments: Record<string, string>
): SignupDraft {
  return {
    ...draft,
    assignments: nextAssignments,
    acknowledgeRandomFill: false,
  }
}
