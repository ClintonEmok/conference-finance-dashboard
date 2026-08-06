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
              upgradeSelected: attendee.upgradeSelected ?? false,
              cotSelected: attendee.cotSelected ?? false,
              ...(attendee.ageBandCode
                ? {
                    ageBandCode: attendee.ageBandCode as PublicSignupQuoteAgeBandCode,
                  }
                : {}),
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
