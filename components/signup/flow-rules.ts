import type { PublicSignupCatalogEvent } from "@/lib/domain/signup/catalog"
import type {
  AccommodationSelectionDraft,
  AttendeeDraft,
} from "@/components/signup/state"

/**
 * UI-only mirror of the server's bounded extended-stay allowance
 * (`MAX_EXTENDED_STAY_EXTRA_NIGHTS` in convex/signupCatalog.ts). The stepper
 * caps the buyer at base nights plus this many extra nights; the server stays
 * the authority and rejects anything beyond it.
 */
export const EXTENDED_STAY_MAX_EXTRA_NIGHTS = 7

/**
 * Resolves the effective total stay nights for an attendee's draft
 * accommodation selection: the buyer-chosen `nights` when present and
 * sane-looking, otherwise the event's configured base night count. The server
 * performs the authoritative validation; this only feeds the UI stepper and
 * quote args.
 */
export function resolveDraftNights(
  selection: AccommodationSelectionDraft | undefined,
  baseNights: number
): number {
  if (
    typeof selection?.nights === "number" &&
    Number.isFinite(selection.nights)
  ) {
    return Math.max(baseNights, Math.floor(selection.nights))
  }
  return baseNights
}

/**
 * Whether the event permits any extended stay beyond the configured base
 * nights (before, after, or both). Copy only — the server enforces the same
 * policy through `resolvePublicSignupSelection`.
 */
export function eventPermitsExtendedStay(
  event: PublicSignupCatalogEvent
): boolean {
  const config = event.accommodation.config
  return Boolean(
    config &&
      (config.allowExtendedStayBefore === true ||
        config.allowExtendedStayAfter === true ||
        config.allowExtendedStayBoth === true)
  )
}

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
