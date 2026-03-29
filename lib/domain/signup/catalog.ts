import type {
  SignupAccommodationIneligibilityReason,
  SignupTicketUnavailableReason,
} from "@/lib/types/signup"

export type PublicSignupCatalogSlot = {
  slotId: string
  roomLabel: string
  roomTypeLabel: string
  assignable: boolean
}

export type PublicSignupCatalogItem = {
  eventId: string
  source: "integration" | "internal"
  sourceEventRef: string
  slug: string
  title: string
  startsAt: number
  currency: string
  tickets: Array<{
    ticketTypeId: string
    label: string
    priceMinor: number
    selectable: boolean
    reason: SignupTicketUnavailableReason | null
  }>
  accommodation: {
    eligible: boolean
    reason: SignupAccommodationIneligibilityReason | null
    slots: PublicSignupCatalogSlot[]
  }
}

export function normalizePublicSignupCatalog(
  catalog: PublicSignupCatalogItem[] | undefined | null
) {
  if (!catalog) {
    return [] as PublicSignupCatalogItem[]
  }

  return catalog.map((event) => ({
    ...event,
    tickets: event.tickets.map((ticket) => ({
      ...ticket,
      reason: ticket.reason ?? null,
    })),
    accommodation: {
      ...event.accommodation,
      reason: event.accommodation.reason ?? null,
      slots: event.accommodation.slots.map((slot) => ({
        ...slot,
        assignable: Boolean(slot.assignable),
      })),
    },
  }))
}
