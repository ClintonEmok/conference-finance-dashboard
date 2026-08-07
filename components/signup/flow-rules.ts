import type { PublicSignupCatalogEvent } from "@/lib/domain/signup/catalog"
import type {
  AccommodationSelectionDraft,
  AttendeeDraft,
} from "@/components/signup/state"

/**
 * The options step offers choices only when the event exposes configured
 * accommodation under the simplified contract: a stay config plus
 * server-resolved night-before rates. When unconfigured, the step shows an
 * honest message and the buyer submits without accommodation preferences.
 */
export function eventHasConfiguredAccommodation(
  event: PublicSignupCatalogEvent
): boolean {
  return Boolean(event.accommodation.config) &&
    event.accommodation.nightBefore !== null
}

/**
 * Whether the buyer's draft preference is complete enough to quote and
 * submit: only the occupancy is required (the included stay is always
 * Standard and server-resolved; options and the night-before level are
 * optional). The server performs the authoritative validation.
 */
export function attendeeHasCompleteAccommodationSelection(
  attendee: AttendeeDraft,
  selections: Record<string, AccommodationSelectionDraft>
): boolean {
  const selection = selections[attendee.attendeeKey]
  return Boolean(selection?.occupancy)
}

export function allAttendeesHaveAccommodationSelections(
  attendees: AttendeeDraft[],
  selections: Record<string, AccommodationSelectionDraft>
): boolean {
  return attendees.every((attendee) =>
    attendeeHasCompleteAccommodationSelection(attendee, selections)
  )
}
