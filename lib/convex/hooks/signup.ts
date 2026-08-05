"use client"

import { useQuery } from "convex/react"
import { api } from "@/lib/convex/api"
import type { Id } from "@/convex/_generated/dataModel"
import { normalizePublicSignupCatalog } from "@/lib/domain/signup/catalog"

export function usePublicSignupCatalogRaw() {
  return useQuery(api.signupCatalog.getPublicSignupCatalog, {})
}

export function usePublicSignupCatalog() {
  const catalog = usePublicSignupCatalogRaw()
  return normalizePublicSignupCatalog(catalog)
}

export type PublicSignupQuoteAttendeeArg = {
  attendeeKey: string
  ticketTypeId: string
  categoryId?: string
  occupancy?: "single" | "shared" | "family"
  upgradeSelected?: boolean
  cotSelected?: boolean
  ageBandCode?: string
}

const signupAgeBandCodeValues = [
  "under_3",
  "3_11",
  "12_17",
  "18_plus",
] as const

export type PublicSignupQuoteAgeBandCode =
  (typeof signupAgeBandCodeValues)[number]

export type PublicSignupQuoteLine = {
  kind: "accommodation" | "superior_upgrade" | "cot"
  label: string
  nights: number
  ratePerNightMinor: number
  chargeMinor: number
}

export type PublicSignupAccommodationQuote = {
  eventId: string
  currency: string
  breakfastIncluded: boolean
  ticketTotalMinor: number
  accommodationTotalMinor: number
  totalDueMinor: number
  attendees: Array<{
    attendeeKey: string
    ticketTypeId: string
    ticketLabel: string
    ticketPriceMinor: number
    categoryId?: string
    categoryCode?: string
    categoryLabel?: string
    occupancy?: "single" | "shared" | "family"
    upgradeSelected: boolean
    cotSelected: boolean
    ageBandCode?: string
    accommodationTotalMinor: number
    amountDueMinor: number
    lines: PublicSignupQuoteLine[]
  }>
}

/**
 * Server-backed live accommodation quote for the options-only signup flow.
 * The hook forwards only attendee keys, ticket IDs and option selections —
 * never prices, dates, nights, room IDs, slot IDs or totals. When the event
 * has no configured accommodation or the selection set is not yet complete,
 * the caller passes `null` and no query is issued.
 */
export function usePublicSignupAccommodationQuote(
  eventId: string | undefined,
  attendees: PublicSignupQuoteAttendeeArg[] | null
) {
  return useQuery(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    eventId && attendees
      ? {
          eventId: eventId as Id<"events">,
          attendees: attendees.map((attendee) => ({
            attendeeKey: attendee.attendeeKey,
            ticketTypeId: attendee.ticketTypeId as Id<"ticketTypes">,
            ...(attendee.categoryId
              ? {
                  categoryId: attendee.categoryId as Id<"accommodationCategories">,
                }
              : {}),
            ...(attendee.occupancy ? { occupancy: attendee.occupancy } : {}),
            upgradeSelected: attendee.upgradeSelected ?? false,
            cotSelected: attendee.cotSelected ?? false,
            ...(attendee.ageBandCode
              ? {
                  ageBandCode: attendee.ageBandCode as PublicSignupQuoteAgeBandCode,
                }
              : {}),
          })),
        }
      : "skip"
  )
}
