"use client"

import { useMemo } from "react"
import { useQuery, useQueries, type RequestForQueries } from "convex/react"
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
  /** Legacy optional category input; the server resolves the included stay. */
  categoryId?: string
  occupancy?: "single" | "shared" | "family"
  optionSelections?: Array<{
    optionKey: string
    quantity: number
    nights: number
  }>
  /** Independent one-night night-before level; omitted = no night before. */
  nightBeforeLevel?: "standard" | "superior"
  /** Independent occupancy for the one-night night-before stay. */
  nightBeforeOccupancy?: "single" | "shared"
  /** Legacy buyer-chosen total stay nights; omitted = configured base. */
  nights?: number
}

export type PublicSignupQuoteLine = {
  kind: "accommodation" | "option"
  optionKey?: string
  label: string
  nights: number
  quantity?: number
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
    /** Independent one-night night-before level (omitted = none). */
    nightBeforeLevel?: "standard" | "superior"
    nightBeforeOccupancy?: "single" | "shared"
    /** Whether the ticket price covers the event's base accommodation stay. */
    accommodationIncluded: boolean
    /** Event base-stay night count priced for this attendee. */
    baseNights: number
    accommodationTotalMinor: number
    amountDueMinor: number
    lines: PublicSignupQuoteLine[]
  }>
}

/**
 * Server-backed live accommodation quote for the options-only signup flow.
 * The hook forwards only attendee keys, ticket IDs, option selections, and
 * the buyer-chosen total nights — never prices, dates, room IDs, slot IDs or
 * totals. When the event has no configured accommodation or the selection set
 * is not yet complete, the caller passes `null` and no query is issued.
 *
 * Unlike `useQuery`, this wrapper reads through `useQueries`, so a stale or
 * invalid selection surfaces as an `Error` value instead of throwing during
 * render (CR-06). The caller converts that to the `{status: "error"}`
 * render state, keeps the draft, and prompts the user to correct it — the
 * QUOTE_INVALID failure can no longer replace the whole signup page with an
 * error boundary.
 */
export function usePublicSignupAccommodationQuote(
  eventId: string | undefined,
  attendees: PublicSignupQuoteAttendeeArg[] | null
): PublicSignupAccommodationQuote | undefined | Error {
  const skip = !eventId || !attendees
  const queries = useMemo<RequestForQueries>(() => {
    if (skip) {
      return {} as RequestForQueries
    }
    return {
      quote: {
        query: api.signupCatalog.getPublicSignupAccommodationQuote,
        args: {
          eventId: eventId as Id<"events">,
          attendees: (attendees as PublicSignupQuoteAttendeeArg[]).map(
            (attendee) => ({
              attendeeKey: attendee.attendeeKey,
              ticketTypeId: attendee.ticketTypeId as Id<"ticketTypes">,
              ...(attendee.categoryId
                ? {
                    categoryId: attendee.categoryId as Id<"accommodationCategories">,
                  }
                : {}),
              ...(attendee.occupancy ? { occupancy: attendee.occupancy } : {}),
              ...(attendee.nightBeforeLevel
                ? { nightBeforeLevel: attendee.nightBeforeLevel }
                : {}),
              ...(attendee.nightBeforeOccupancy
                ? { nightBeforeOccupancy: attendee.nightBeforeOccupancy }
                : {}),
              ...(attendee.nights !== undefined
                ? { nights: attendee.nights }
                : {}),
              optionSelections: attendee.optionSelections ?? [],
            })
          ),
        },
      },
    }
  }, [skip, eventId, attendees])
  const results = useQueries(queries)
  return results["quote"] as PublicSignupAccommodationQuote | undefined | Error
}

/**
 * Render state for the live quote in the review step and the signup summary.
 * `incomplete` means accommodation is configured but not every attendee has a
 * category+occupancy yet; `loading` covers in-flight refreshes (a previous
 * quote is never rendered as if current); `error` carries the server message
 * and blocks submission until a fresh valid quote exists.
 */
export type PublicSignupQuoteRenderState =
  | { status: "unconfigured" }
  | { status: "incomplete" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; quote: PublicSignupAccommodationQuote }
