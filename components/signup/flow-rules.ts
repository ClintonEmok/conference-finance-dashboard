import type { PublicSignupCatalogEvent } from "@/lib/domain/signup/catalog"
import type {
  AccommodationSelectionDraft,
  AttendeeDraft,
} from "@/components/signup/state"

/**
 * The options step offers choices only when the event exposes configured
 * accommodation (a stay config plus at least one active rate category).
 * When unconfigured, the step shows an honest message and the buyer submits
 * without accommodation preferences.
 */
export function eventHasConfiguredAccommodation(
  event: PublicSignupCatalogEvent
): boolean {
  return Boolean(event.accommodation.config) &&
    event.accommodation.activeCategories.length > 0
}

export function attendeeHasCompleteAccommodationSelection(
  attendee: AttendeeDraft,
  selections: Record<string, AccommodationSelectionDraft>
): boolean {
  const selection = selections[attendee.attendeeKey]
  return Boolean(selection?.categoryId && selection?.occupancy)
}

export function allAttendeesHaveAccommodationSelections(
  attendees: AttendeeDraft[],
  selections: Record<string, AccommodationSelectionDraft>
): boolean {
  return attendees.every((attendee) =>
    attendeeHasCompleteAccommodationSelection(attendee, selections)
  )
}
