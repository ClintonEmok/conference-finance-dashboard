import type {
  AccommodationIneligibilityReason,
  TicketUnavailableReason,
} from "@/lib/types/signup"

export type PublicSignupCatalogSlot = {
  slotId: string
  roomLabel: string
  roomTypeLabel: string
  assignable: boolean
}

export type PublicSignupCatalogEvent = {
  eventId: string
  slug: string
  title: string
  startsAt: number
  endsAt?: number
  timezone: string
  currency: string
  source: {
    kind: "integration" | "internal"
    provider: string | null
    externalEventId: string | null
  }
  defaultRoomTypeId?: string
  tickets: Array<{
    ticketTypeId: string
    label: string
    priceMinor: number
    selectable: boolean
    reason: TicketUnavailableReason | null
    roomTypeId?: string
  }>
  accommodation: {
    eligible: boolean
    reason: AccommodationIneligibilityReason | null
    slots: PublicSignupCatalogSlot[]
  }
}

export function normalizePublicSignupCatalog(
  catalog: PublicSignupCatalogEvent[] | undefined | null
) {
  if (!catalog) {
    return [] as PublicSignupCatalogEvent[]
  }

  return catalog.map((event) => ({
    ...event,
    source: {
      ...event.source,
      provider: event.source.provider ?? null,
      externalEventId: event.source.externalEventId ?? null,
    },
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
