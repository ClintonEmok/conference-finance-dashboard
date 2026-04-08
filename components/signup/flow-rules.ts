import type { PublicSignupCatalogEvent } from "@/lib/domain/signup/catalog"
import type { AttendeeDraft } from "@/components/signup/state"

export function shouldSkipRoomsStep(
  event: PublicSignupCatalogEvent,
  attendees: AttendeeDraft[]
) {
  if (!event.accommodation.eligible) {
    return false
  }

  if (attendees.length !== 1) {
    return false
  }

  const attendee = attendees[0]
  const ticket = event.tickets.find(
    (ticketType) => ticketType.ticketTypeId === attendee.ticketTypeId
  )

  return (ticket?.roomTypeId ?? event.defaultRoomTypeId) != null
}
