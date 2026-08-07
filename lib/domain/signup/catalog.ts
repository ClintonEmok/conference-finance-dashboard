import type {
  AccommodationIneligibilityReason,
  SignupAccommodationOccupancy,
  TicketUnavailableReason,
} from "@/lib/types/signup"

export type PublicSignupCatalogSlot = {
  slotId: string
  roomLabel: string
  roomTypeLabel: string
  assignable: boolean
}

export type PublicSignupCatalogAccommodationConfig = {
  baseCheckInAt: number
  baseCheckOutAt: number
  nightCount: number
  breakfastIncluded: boolean
}

export type PublicSignupCatalogActiveCategory = {
  categoryId: string
  code: "standard" | "superior" | "family"
  label: string
  rates: Array<{
    occupancy: SignupAccommodationOccupancy
    pricePerPersonMinor: number
  }>
}

export type PublicSignupCatalogOption = {
  optionKey: string
  label: string
  priceMinor: number
}

export type PublicSignupCatalogAccommodation = {
  eligible: boolean
  reason: AccommodationIneligibilityReason | null
  /**
   * Legacy slot-based contract preserved only for compatibility with
   * historical consumers. The options-only client must never use slots as a
   * selection source.
   */
  slots: PublicSignupCatalogSlot[]
  config: PublicSignupCatalogAccommodationConfig | null
  activeCategories: PublicSignupCatalogActiveCategory[]
  options: PublicSignupCatalogOption[]
}

export type PublicSignupCatalogTicket = {
  ticketTypeId: string
  label: string
  priceMinor: number
  selectable: boolean
  reason: TicketUnavailableReason | null
  /** Whether the ticket price covers the event's base accommodation stay. */
  accommodationIncluded?: boolean
  roomTypeId?: string
  /** Resolved ticket entitlement: the category of `ticketTypes.roomTypeId`. */
  roomTypeCategoryId?: string
  roomTypeCategoryCode?: string
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
  tickets: PublicSignupCatalogTicket[]
  accommodation: PublicSignupCatalogAccommodation
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
      accommodationIncluded: ticket.accommodationIncluded ?? undefined,
      roomTypeId: ticket.roomTypeId ?? undefined,
      roomTypeCategoryId: ticket.roomTypeCategoryId ?? undefined,
      roomTypeCategoryCode: ticket.roomTypeCategoryCode ?? undefined,
    })),
    accommodation: {
      ...event.accommodation,
      reason: event.accommodation.reason ?? null,
      slots: event.accommodation.slots.map((slot) => ({
        ...slot,
        assignable: Boolean(slot.assignable),
      })),
      config: event.accommodation.config ?? null,
      activeCategories: event.accommodation.activeCategories.map(
        (category) => ({
          ...category,
          rates: category.rates.map((rate) => ({
            ...rate,
            pricePerPersonMinor: Number(rate.pricePerPersonMinor) || 0,
          })),
        })
      ),
      options: event.accommodation.options.map((option) => ({
        ...option,
        priceMinor: Number(option.priceMinor) || 0,
      })),
    },
  }))
}
