import { v } from "convex/values"
import { query, type QueryCtx, type MutationCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import {
  accommodationIneligibilityReasonValidator,
  ticketUnavailableReasonValidator,
  signupAgeBandCodeValidator,
  signupAccommodationOccupancyValidator,
} from "../lib/types/signup"
import type { TicketUnavailableReason } from "../lib/types/signup"
import { deriveAccommodationAmount } from "../lib/domain/finance/accommodation-amounts"

const PUBLIC_EVENT_LIMIT = 50
const EVENT_TICKET_LIMIT = 100
const EVENT_ASSIGNABLE_SLOT_LIMIT = 200
const EVENT_SOURCE_LIMIT = 5
const EVENT_RATE_LIMIT = 200
const EVENT_OPTION_LIMIT = 100
const EVENT_AGE_PRICING_LIMIT = 50

const categoryCodeValidator = v.union(
  v.literal("standard"),
  v.literal("superior"),
  v.literal("family")
)
const optionCodeValidator = v.union(
  v.literal("superior_upgrade"),
  v.literal("cot")
)
const ageBandCodeValidator = signupAgeBandCodeValidator
const occupancyValidator = signupAccommodationOccupancyValidator

const publicSignupTicketValidator = v.object({
  ticketTypeId: v.id("ticketTypes"),
  label: v.string(),
  priceMinor: v.number(),
  selectable: v.boolean(),
  reason: v.union(ticketUnavailableReasonValidator, v.null()),
  roomTypeId: v.optional(v.id("accommodationRoomTypes")),
  roomTypeCategoryId: v.optional(v.id("accommodationCategories")),
  roomTypeCategoryCode: v.optional(categoryCodeValidator),
})

const publicSignupAccommodationSlotValidator = v.object({
  slotId: v.id("accommodationSlots"),
  roomLabel: v.string(),
  roomTypeLabel: v.string(),
  assignable: v.boolean(),
})

const publicSignupAccommodationConfigValidator = v.object({
  baseCheckInAt: v.number(),
  baseCheckOutAt: v.number(),
  nightCount: v.number(),
  breakfastIncluded: v.boolean(),
})

const publicSignupAccommodationRateValidator = v.object({
  occupancy: occupancyValidator,
  pricePerPersonMinor: v.number(),
})

const publicSignupActiveCategoryValidator = v.object({
  categoryId: v.id("accommodationCategories"),
  code: categoryCodeValidator,
  label: v.string(),
  rates: v.array(publicSignupAccommodationRateValidator),
})

const publicSignupOptionValidator = v.object({
  optionCode: optionCodeValidator,
  label: v.string(),
  priceMinor: v.number(),
  eligibilityAgeBandCode: v.union(ageBandCodeValidator, v.null()),
})

const publicSignupAgeBandValidator = v.object({
  code: ageBandCodeValidator,
  label: v.string(),
  minAge: v.number(),
  maxAge: v.union(v.number(), v.null()),
})

const publicSignupCatalogEventValidator = v.object({
  eventId: v.id("events"),
  slug: v.string(),
  title: v.string(),
  startsAt: v.number(),
  endsAt: v.optional(v.number()),
  timezone: v.string(),
  currency: v.string(),
  defaultRoomTypeId: v.optional(v.id("accommodationRoomTypes")),
  source: v.object({
    kind: v.union(v.literal("integration"), v.literal("internal")),
    provider: v.union(v.string(), v.null()),
    externalEventId: v.union(v.string(), v.null()),
  }),
  tickets: v.array(publicSignupTicketValidator),
  accommodation: v.object({
    eligible: v.boolean(),
    reason: v.union(accommodationIneligibilityReasonValidator, v.null()),
    // Legacy slot contract preserved for compatibility; the options-only
    // client never uses slots as a selection source.
    slots: v.array(publicSignupAccommodationSlotValidator),
    config: v.union(publicSignupAccommodationConfigValidator, v.null()),
    activeCategories: v.array(publicSignupActiveCategoryValidator),
    options: v.array(publicSignupOptionValidator),
    ageBands: v.array(publicSignupAgeBandValidator),
  }),
})

const publicSignupReceiptLineValidator = v.object({
  kind: v.union(
    v.literal("accommodation"),
    v.literal("superior_upgrade"),
    v.literal("cot")
  ),
  label: v.string(),
  nights: v.number(),
  ratePerNightMinor: v.number(),
  chargeMinor: v.number(),
})

const publicSignupQuoteAttendeeValidator = v.object({
  attendeeKey: v.string(),
  ticketTypeId: v.id("ticketTypes"),
  categoryId: v.optional(v.id("accommodationCategories")),
  occupancy: v.optional(occupancyValidator),
  upgradeSelected: v.optional(v.boolean()),
  cotSelected: v.optional(v.boolean()),
  ageBandCode: v.optional(ageBandCodeValidator),
})

const publicSignupQuoteAttendeeResultValidator = v.object({
  attendeeKey: v.string(),
  ticketTypeId: v.id("ticketTypes"),
  ticketLabel: v.string(),
  ticketPriceMinor: v.number(),
  categoryId: v.optional(v.id("accommodationCategories")),
  categoryCode: v.optional(categoryCodeValidator),
  categoryLabel: v.optional(v.string()),
  occupancy: v.optional(occupancyValidator),
  upgradeSelected: v.boolean(),
  cotSelected: v.boolean(),
  ageBandCode: v.optional(ageBandCodeValidator),
  accommodationTotalMinor: v.number(),
  amountDueMinor: v.number(),
  lines: v.array(publicSignupReceiptLineValidator),
})

const publicSignupAccommodationQuoteValidator = v.object({
  eventId: v.id("events"),
  currency: v.string(),
  breakfastIncluded: v.boolean(),
  ticketTotalMinor: v.number(),
  accommodationTotalMinor: v.number(),
  totalDueMinor: v.number(),
  attendees: v.array(publicSignupQuoteAttendeeResultValidator),
})

function mapTicket(
  ticket: Doc<"ticketTypes">,
  roomTypeCategoryById: Map<
    string,
    {
      categoryId: Id<"accommodationCategories"> | null
      categoryCode: "standard" | "superior" | "family" | null
    }
  >
) {
  const selectableByState = ticket.availabilityState === "selectable"
  // CR-08: a ticket whose soldCount has reached its configured maxQuantity is
  // sold out regardless of its availability state — the UI must never
  // advertise a ticket the submission path will reject.
  const soldOutByCapacity =
    ticket.maxQuantity !== undefined &&
    (ticket.soldCount ?? 0) >= ticket.maxQuantity
  const selectable =
    selectableByState &&
    ticket.isActive &&
    ticket.visibility === "public" &&
    !soldOutByCapacity

  const roomTypeCategory = ticket.roomTypeId
    ? roomTypeCategoryById.get(String(ticket.roomTypeId)) ?? null
    : null

  if (selectable) {
    return {
      ticketTypeId: ticket._id,
      label: ticket.label,
      priceMinor: ticket.priceMinor,
      selectable: true,
      reason: null,
      roomTypeId: ticket.roomTypeId ?? undefined,
      roomTypeCategoryId: roomTypeCategory?.categoryId ?? undefined,
      roomTypeCategoryCode: roomTypeCategory?.categoryCode ?? undefined,
    }
  }

  const reason =
    normalizeTicketUnavailableReason(ticket.unavailableReason) ??
    (soldOutByCapacity
      ? "sold_out"
      : ticket.visibility === "hidden"
        ? "hidden"
        : ticket.isActive
          ? "not_on_sale"
          : "disabled")

  return {
    ticketTypeId: ticket._id,
    label: ticket.label,
    priceMinor: ticket.priceMinor,
    selectable: false,
    reason,
    roomTypeId: ticket.roomTypeId ?? undefined,
    roomTypeCategoryId: roomTypeCategory?.categoryId ?? undefined,
    roomTypeCategoryCode: roomTypeCategory?.categoryCode ?? undefined,
  }
}

function normalizeTicketUnavailableReason(
  value: string | undefined
): TicketUnavailableReason | null {
  if (
    value === "sold_out" ||
    value === "disabled" ||
    value === "hidden" ||
    value === "not_on_sale"
  ) {
    return value
  }

  return null
}

/**
 * Shared aggregate capacity rule used by the public quote AND the submission
 * mutation (CR-08/CR-10). A ticket is exceeded when the total number of
 * places requested for it — repeated `ticketTypeId` values in one request
 * count their full quantity — plus its current `soldCount` exceeds the
 * configured `maxQuantity`. Tickets without a `maxQuantity` are never
 * capacity-constrained. `soldCount ?? 0` is a capacity read (a ticket with no
 * counter recorded has sold zero places), not a fabricated display zero.
 */
export function isTicketCapacityExceeded(input: {
  ticket: {
    soldCount?: number
    maxQuantity?: number
  }
  requestedCount: number
}): boolean {
  const { ticket, requestedCount } = input
  if (ticket.maxQuantity === undefined) {
    return false
  }
  return (ticket.soldCount ?? 0) + requestedCount > ticket.maxQuantity
}

async function getAssignableSlotSummaries(
  ctx: QueryCtx,
  eventId: Doc<"events">["_id"]
) {
  const assignableSlots = await ctx.db
    .query("accommodationSlots")
    .withIndex("by_eventId_and_isAssignable", (q) =>
      q.eq("eventId", eventId).eq("isAssignable", true)
    )
    .take(EVENT_ASSIGNABLE_SLOT_LIMIT)

  // Group slots by room and filter out rooms with any occupied slots
  const slotsByRoom = new Map<
    Id<"accommodationRooms">,
    typeof assignableSlots
  >()
  for (const slot of assignableSlots) {
    if (!slotsByRoom.has(slot.roomId)) {
      slotsByRoom.set(slot.roomId, [])
    }
    slotsByRoom.get(slot.roomId)!.push(slot)
  }

  // Only include rooms where ALL slots are available (no partial occupancy)
  const fullyAvailableRoomIds = new Set<Id<"accommodationRooms">>()
  for (const [roomId, roomSlots] of slotsByRoom) {
    let hasOccupiedSlot = false
    for (const slot of roomSlots) {
      const existingAssignments = await ctx.db
        .query("orderAssignments")
        .withIndex("by_slotId", (q) => q.eq("slotId", slot._id))
        .take(1)

      const isOccupied = existingAssignments.some(
        (a) => a.assignmentIntent === "assign"
      )

      if (isOccupied) {
        hasOccupiedSlot = true
        break
      }
    }

    if (!hasOccupiedSlot) {
      fullyAvailableRoomIds.add(roomId)
    }
  }

  // Get all slots from fully available rooms
  const availableSlots = assignableSlots.filter((slot) =>
    fullyAvailableRoomIds.has(slot.roomId)
  )

  if (availableSlots.length === 0) {
    return {
      eligible: false as const,
      reason: "no_assignable_inventory" as const,
      slots: [],
    }
  }

  const roomIds = Array.from(new Set(availableSlots.map((slot) => slot.roomId)))
  const roomDocs = await Promise.all(
    roomIds.map((roomId) => ctx.db.get(roomId))
  )
  const rooms = roomDocs.filter(
    (room): room is NonNullable<typeof room> => room !== null
  )

  const roomById = new Map(rooms.map((room) => [room._id, room]))

  const roomTypeIds = Array.from(new Set(rooms.map((room) => room.roomTypeId)))
  const roomTypeDocs = await Promise.all(
    roomTypeIds.map((roomTypeId) => {
      const normalizedId = ctx.db.normalizeId(
        "accommodationRoomTypes",
        roomTypeId
      )
      return normalizedId
        ? ctx.db.get("accommodationRoomTypes", normalizedId)
        : null
    })
  )
  const roomTypes = roomTypeDocs.filter(
    (roomType): roomType is NonNullable<typeof roomType> => roomType !== null
  )
  const roomTypeById = new Map(
    roomTypes.map((roomType) => [String(roomType._id), roomType])
  )

  const slots = availableSlots.map((slot) => {
    const room = roomById.get(slot.roomId)
    const roomType = room ? roomTypeById.get(room.roomTypeId) : null

    return {
      slotId: slot._id,
      roomLabel: room?.label ?? slot.slotLabel,
      roomTypeLabel: roomType?.label ?? "Unknown room type",
      assignable: slot.isAssignable,
    }
  })

  return {
    eligible: true as const,
    reason: null,
    slots,
  }
}

/**
 * Resolves the event-scoped accommodation configuration for a public signup
 * consumer (catalog or quote). Event-configured choices are derived from the
 * same rows the canonical finance loader and the admin confirmation use:
 * eventAccommodationConfig, eventAccommodationRates,
 * eventAccommodationOptions (enabled only) and eventAccommodationAgePricing.
 * Catalog labels/codes are resolved through per-ID reads so a category/option
 * beyond a catalog listing limit never silently drops.
 */
export async function loadPublicSignupAccommodationContext(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">
): Promise<PublicSignupAccommodationContext> {
  const [event, configRow, rateRows, eventOptionRows, agePricingRows] =
    await Promise.all([
      ctx.db.get(eventId),
      ctx.db
        .query("eventAccommodationConfig")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .unique(),
      ctx.db
        .query("eventAccommodationRates")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(EVENT_RATE_LIMIT),
      ctx.db
        .query("eventAccommodationOptions")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(EVENT_OPTION_LIMIT),
      ctx.db
        .query("eventAccommodationAgePricing")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(EVENT_AGE_PRICING_LIMIT),
    ])

  const ratesByKey = new Map<string, number>()
  const activeCategoryIds = new Set<string>()
  for (const rate of rateRows) {
    ratesByKey.set(
      `${String(rate.categoryId)}:${rate.occupancy}`,
      rate.pricePerPersonMinor
    )
    activeCategoryIds.add(String(rate.categoryId))
  }

  const enabledOptionRows = eventOptionRows.filter((row) => row.enabled)
  const optionIds = new Set(
    enabledOptionRows.map((row) => String(row.optionId))
  )
  const optionDefinitions = await Promise.all(
    Array.from(optionIds).map((optionId) =>
      ctx.db.get("accommodationOptions", optionId as Id<"accommodationOptions">)
    )
  )
  const optionCodeById = new Map<string, string>()
  const optionLabelByCode = new Map<string, string>()
  for (const definition of optionDefinitions) {
    if (definition) {
      optionCodeById.set(String(definition._id), definition.code)
      optionLabelByCode.set(definition.code, definition.label)
    }
  }

  let superiorUpgradePriceMinor: number | null = null
  let cotPriceMinor: number | null = null
  let cotEligibilityAgeBandCode: string | null = null
  for (const row of enabledOptionRows) {
    const code = optionCodeById.get(String(row.optionId))
    if (code === "superior_upgrade") {
      superiorUpgradePriceMinor = row.priceMinor
    } else if (code === "cot") {
      cotPriceMinor = row.priceMinor
      cotEligibilityAgeBandCode = row.eligibilityAgeBandCode ?? null
    }
  }

  const categoryDocs = await Promise.all(
    Array.from(activeCategoryIds).map((categoryId) =>
      ctx.db.get(
        "accommodationCategories",
        categoryId as Id<"accommodationCategories">
      )
    )
  )
  const categoryById = new Map<
    string,
    { code: string; label: string }
  >()
  for (const category of categoryDocs) {
    if (category) {
      categoryById.set(String(category._id), {
        code: category.code,
        label: category.label,
      })
    }
  }

  // The set of age bands valid for THIS event comes from its configured
  // age-pricing rows — bands are event-scoped catalog data, never constants.
  const eventAgeBandCodes = new Set(
    agePricingRows.map((row) => row.ageBandCode)
  )
  // Resolve every event-configured code by its indexed catalog lookup and
  // fail closed when any definition is missing (WR-03). A partial age-band
  // set would silently hide an event-configured band from the edit UI while
  // the resolver still accepts the code.
  const ageBandDocs: Array<Doc<"accommodationAgeBands">> = []
  for (const code of Array.from(eventAgeBandCodes)) {
    const band = await ctx.db
      .query("accommodationAgeBands")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first()
    if (!band) {
      throw new Error(
        `Event age band '${code}' is configured by age pricing but missing from the age-band catalog.`
      )
    }
    ageBandDocs.push(band)
  }
  const ageBands = ageBandDocs
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((band) => ({
      code: band.code,
      label: band.label,
      minAge: band.minAge,
      maxAge: band.maxAge ?? null,
    }))

  // An event only exposes configured accommodation when it is enabled at the
  // event level AND has a stay config AND at least one active rate category.
  // The event flag is authoritative: stale config/rate rows must never make a
  // disabled event look sellable (CR-01).
  const hasConfiguredAccommodation =
    event?.accommodationEnabled === true &&
    configRow !== null &&
    activeCategoryIds.size > 0

  return {
    hasConfiguredAccommodation,
    config: configRow
      ? {
          baseCheckInAt: configRow.baseCheckInAt,
          baseCheckOutAt: configRow.baseCheckOutAt,
          nightCount: configRow.nightCount,
          breakfastIncluded: configRow.breakfastIncluded,
        }
      : null,
    ratesByKey,
    categoryById,
    activeCategoryIds,
    eventAgeBandCodes,
    ageBands,
    optionLabelByCode,
    superiorUpgradePriceMinor,
    cotPriceMinor,
    cotEligibilityAgeBandCode,
  }
}

export type PublicSignupAccommodationContext = {
  hasConfiguredAccommodation: boolean
  config: {
    baseCheckInAt: number
    baseCheckOutAt: number
    nightCount: number
    breakfastIncluded: boolean
  } | null
  ratesByKey: Map<string, number>
  categoryById: Map<string, { code: string; label: string }>
  activeCategoryIds: Set<string>
  eventAgeBandCodes: Set<string>
  ageBands: Array<{
    code: "under_3" | "3_11" | "12_17" | "18_plus"
    label: string
    minAge: number
    maxAge: number | null
  }>
  optionLabelByCode: Map<string, string>
  superiorUpgradePriceMinor: number | null
  cotPriceMinor: number | null
  cotEligibilityAgeBandCode: string | null
}

export type PublicSignupSelectionResolved = {
  categoryId: string | null
  categoryCode: string | null
  categoryLabel: string | null
  occupancy: "single" | "shared" | "family" | null
  upgradeSelected: boolean
  cotSelected: boolean
  ageBandCode: string | null
  baseRatePerNightMinor: number | null
  superiorUpgradePriceMinor: number | null
  cotPriceMinor: number | null
  cotEligibilityAgeBandCode: string | null
  nightCount: number | null
  breakfastIncluded: boolean
}

/**
 * Validates one public signup accommodation preference against the event's
 * configuration and the attendee's ticket entitlement. Both the quote query
 * and the submission mutation resolve through this single rule set so the
 * browser can never become the authority for eligibility, dates, nights or
 * money. Throws a deterministic `QUOTE_INVALID:` error for stale/invalid
 * combinations; the submission mutation re-maps that marker to its structured
 * conflict error.
 */
export function resolvePublicSignupSelection(input: {
  context: PublicSignupAccommodationContext
  selection: {
    categoryId?: string | null
    occupancy?: string | null
    upgradeSelected?: boolean | null
    cotSelected?: boolean | null
    ageBandCode?: string | null
  }
  /**
   * The category of `ticketTypes.roomTypeId` for the attendee's ticket, or
   * null when the ticket is unconstrained (any active event category).
   */
  ticketCategoryId: string | null
}): PublicSignupSelectionResolved {
  const { context, selection, ticketCategoryId } = input
  const upgradeSelected = selection.upgradeSelected === true
  const cotSelected = selection.cotSelected === true
  const ageBandCode = selection.ageBandCode?.trim() || null

  if (!context.hasConfiguredAccommodation) {
    if (selection.categoryId || selection.occupancy || ageBandCode) {
      throw new Error(
        "QUOTE_INVALID: This event does not offer configured accommodation options."
      )
    }
    if (upgradeSelected || cotSelected) {
      throw new Error(
        "QUOTE_INVALID: This event does not offer configured accommodation options."
      )
    }
    return {
      categoryId: null,
      categoryCode: null,
      categoryLabel: null,
      occupancy: null,
      upgradeSelected: false,
      cotSelected: false,
      ageBandCode: null,
      baseRatePerNightMinor: null,
      superiorUpgradePriceMinor: null,
      cotPriceMinor: null,
      cotEligibilityAgeBandCode: null,
      nightCount: null,
      breakfastIncluded: false,
    }
  }

  const categoryId = selection.categoryId ? String(selection.categoryId) : null
  const occupancy = selection.occupancy ?? null

  if (!categoryId || !occupancy) {
    throw new Error(
      "QUOTE_INVALID: A category and occupancy are required when accommodation is configured."
    )
  }
  if (
    occupancy !== "single" &&
    occupancy !== "shared" &&
    occupancy !== "family"
  ) {
    throw new Error("QUOTE_INVALID: Unknown accommodation occupancy.")
  }
  if (!context.activeCategoryIds.has(categoryId)) {
    throw new Error(
      "QUOTE_INVALID: The selected accommodation category is not offered for this event."
    )
  }
  if (ticketCategoryId && ticketCategoryId !== categoryId) {
    throw new Error(
      "QUOTE_INVALID: The selected accommodation category is not allowed for this ticket."
    )
  }

  const baseRatePerNightMinor = context.ratesByKey.get(
    `${categoryId}:${occupancy}`
  )
  if (baseRatePerNightMinor === undefined) {
    throw new Error(
      "QUOTE_INVALID: No rate is configured for the selected category and occupancy."
    )
  }

  const category = context.categoryById.get(categoryId)
  if (!category) {
    throw new Error(
      "QUOTE_INVALID: The selected accommodation category is unknown."
    )
  }

  if (ageBandCode && !context.eventAgeBandCodes.has(ageBandCode)) {
    throw new Error(
      "QUOTE_INVALID: The selected age band is not configured for this event."
    )
  }
  if (upgradeSelected && context.superiorUpgradePriceMinor === null) {
    throw new Error(
      "QUOTE_INVALID: The superior upgrade is not enabled for this event."
    )
  }
  if (cotSelected) {
    if (context.cotPriceMinor === null) {
      throw new Error("QUOTE_INVALID: Cots are not enabled for this event.")
    }
    if (
      !ageBandCode ||
      context.cotEligibilityAgeBandCode === null ||
      ageBandCode !== context.cotEligibilityAgeBandCode
    ) {
      throw new Error(
        "QUOTE_INVALID: A cot is only available for the age band configured for this event."
      )
    }
  }

  return {
    categoryId,
    categoryCode: category.code,
    categoryLabel: category.label,
    occupancy: occupancy as "single" | "shared" | "family",
    upgradeSelected,
    cotSelected,
    ageBandCode,
    baseRatePerNightMinor,
    superiorUpgradePriceMinor: context.superiorUpgradePriceMinor,
    cotPriceMinor: context.cotPriceMinor,
    cotEligibilityAgeBandCode: context.cotEligibilityAgeBandCode,
    nightCount: context.config?.nightCount ?? null,
    breakfastIncluded: context.config?.breakfastIncluded ?? false,
  }
}

/**
 * Resolves the ticket entitlement category for every ticket referenced by a
 * public quote request: `ticketTypes.roomTypeId` → room type → category.
 *
 * The result is a three-state map so a dangling constrained room type can be
 * distinguished from a genuinely unconstrained ticket (CR-02):
 * - `{ categoryId }` — the ticket's room type resolved to a catalog category;
 * - `undefined` — the ticket has no roomTypeId and is truly unconstrained;
 * - `null` — the ticket has a roomTypeId that cannot be resolved (missing
 *   room type or missing category); callers MUST reject this state.
 */
export async function resolveTicketCategoryById(
  ctx: QueryCtx | MutationCtx,
  ticketById: Map<string, Doc<"ticketTypes">>
): Promise<Map<string, { categoryId: string } | null | undefined>> {
  const roomTypeIds = new Set<string>()
  for (const ticket of ticketById.values()) {
    if (ticket.roomTypeId) {
      roomTypeIds.add(String(ticket.roomTypeId))
    }
  }
  const roomTypes = await Promise.all(
    Array.from(roomTypeIds).map((roomTypeId) =>
      ctx.db.get(
        "accommodationRoomTypes",
        roomTypeId as Id<"accommodationRoomTypes">
      )
    )
  )
  const roomTypeCategoryById = new Map<string, { categoryId: string }>()
  for (const roomType of roomTypes) {
    if (roomType?.categoryId) {
      roomTypeCategoryById.set(String(roomType._id), {
        categoryId: String(roomType.categoryId),
      })
    }
  }
  const ticketCategoryById = new Map<
    string,
    { categoryId: string } | null | undefined
  >()
  for (const [ticketId, ticket] of ticketById) {
    if (!ticket.roomTypeId) {
      // Intentionally unconstrained: any active event category is allowed.
      ticketCategoryById.set(ticketId, undefined)
      continue
    }
    const resolved = roomTypeCategoryById.get(String(ticket.roomTypeId))
    // A present roomTypeId that does not resolve fails closed (null) so the
    // caller rejects the selection instead of silently treating it as
    // unconstrained.
    ticketCategoryById.set(
      ticketId,
      resolved ? { categoryId: resolved.categoryId } : null
    )
  }
  return ticketCategoryById
}

export const getPublicSignupCatalog = query({
  args: {},
  returns: v.array(publicSignupCatalogEventValidator),
  handler: async (ctx) => {
    const openEvents = await ctx.db
      .query("events")
      .withIndex("by_signup_visibility", (q) =>
        q.eq("isPublished", true).eq("isSignupOpen", true)
      )
      .take(PUBLIC_EVENT_LIMIT)

    const orderedEvents = [...openEvents].sort((a, b) => {
      if (a.startsAt !== b.startsAt) {
        return a.startsAt - b.startsAt
      }

      return a.title.localeCompare(b.title)
    })

    return await Promise.all(
      orderedEvents.map(async (event) => {
        const eventSources = await ctx.db
          .query("eventSources")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .take(EVENT_SOURCE_LIMIT)
        const primarySource =
          eventSources.find(
            (source) => source.provider === event.primarySourceProvider
          ) ??
          eventSources[0] ??
          null

        const ticketTypes = await ctx.db
          .query("ticketTypes")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .take(EVENT_TICKET_LIMIT)

        // Resolve ticket entitlement (ticketTypes.roomTypeId → room type →
        // catalog category) so the client renders ticket-constrained category
        // eligibility without ever seeing a physical room choice.
        const roomTypeIds = Array.from(
          new Set(
            ticketTypes
              .map((ticket) => ticket.roomTypeId)
              .filter(
                (id): id is Id<"accommodationRoomTypes"> => id !== undefined
              )
          )
        )
        const roomTypeDocs = await Promise.all(
          roomTypeIds.map((roomTypeId) =>
            ctx.db.get("accommodationRoomTypes", roomTypeId)
          )
        )
        const referencedCategoryIds = new Set<string>()
        for (const roomType of roomTypeDocs) {
          if (roomType?.categoryId) {
            referencedCategoryIds.add(String(roomType.categoryId))
          }
        }
        const categoryDocs = await Promise.all(
          Array.from(referencedCategoryIds).map((categoryId) =>
            ctx.db.get(
              "accommodationCategories",
              categoryId as Id<"accommodationCategories">
            )
          )
        )
        const categoryById = new Map(
          categoryDocs
            .filter(
              (category): category is NonNullable<typeof category> =>
                category !== null
            )
            .map((category) => [String(category._id), category])
        )
        const roomTypeCategoryById = new Map<
          string,
          {
            categoryId: Id<"accommodationCategories"> | null
            categoryCode: "standard" | "superior" | "family" | null
          }
        >()
        for (const roomType of roomTypeDocs) {
          if (!roomType) {
            continue
          }
          const category = roomType.categoryId
            ? categoryById.get(String(roomType.categoryId))
            : null
          roomTypeCategoryById.set(String(roomType._id), {
            categoryId: (roomType.categoryId
              ? (String(roomType.categoryId) as Id<"accommodationCategories">)
              : null) as Id<"accommodationCategories"> | null,
            categoryCode: (category?.code ??
              null) as "standard" | "superior" | "family" | null,
          })
        }

        const tickets = ticketTypes
          .slice()
          .sort((left, right) => {
            const leftSort = left.sortOrder ?? left._creationTime
            const rightSort = right.sortOrder ?? right._creationTime

            if (leftSort !== rightSort) {
              return leftSort - rightSort
            }

            return left.label.localeCompare(right.label)
          })
          .map((ticket) => mapTicket(ticket, roomTypeCategoryById))

        const accommodation = !event.accommodationEnabled
          ? {
              eligible: false,
              reason: "accommodation_disabled" as const,
              slots: [],
            }
          : !event.isSignupOpen
            ? {
                eligible: false,
                reason: "event_closed" as const,
                slots: [],
              }
            : await getAssignableSlotSummaries(ctx, event._id)

        const accommodationContract =
          await loadPublicSignupAccommodationContext(ctx, event._id)

        // Options-only choices are exposed only when the event-level flag,
        // stay config, and rate rows all agree (CR-01). A disabled or stale
        // configuration yields empty choices so the client can never render
        // or submit a preference the server would reject.
        const hasConfiguredChoices = accommodationContract.hasConfiguredAccommodation

        const activeCategories = hasConfiguredChoices
          ? Array.from(accommodationContract.activeCategoryIds).map(
              (categoryId) => {
                const category =
                  accommodationContract.categoryById.get(categoryId)
                const rates = Array.from(
                  accommodationContract.ratesByKey.entries()
                )
                  .filter(([key]) => key.startsWith(`${categoryId}:`))
                  .map(([key, pricePerPersonMinor]) => ({
                    occupancy: key.split(":")[1] as
                      | "single"
                      | "shared"
                      | "family",
                    pricePerPersonMinor,
                  }))
                return {
                  categoryId: categoryId as Id<"accommodationCategories">,
                  code: (category?.code ?? "standard") as
                    | "standard"
                    | "superior"
                    | "family",
                  label: category?.label ?? "Unknown category",
                  rates,
                }
              }
            )
          : []

        const options: Array<{
          optionCode: "superior_upgrade" | "cot"
          label: string
          priceMinor: number
          eligibilityAgeBandCode:
            | "under_3"
            | "3_11"
            | "12_17"
            | "18_plus"
            | null
        }> = []
        if (
          hasConfiguredChoices &&
          accommodationContract.superiorUpgradePriceMinor !== null
        ) {
          options.push({
            optionCode: "superior_upgrade",
            label:
              accommodationContract.optionLabelByCode.get(
                "superior_upgrade"
              ) ?? "Superior upgrade",
            priceMinor: accommodationContract.superiorUpgradePriceMinor,
            eligibilityAgeBandCode: null,
          })
        }
        if (
          hasConfiguredChoices &&
          accommodationContract.cotPriceMinor !== null
        ) {
          options.push({
            optionCode: "cot",
            label:
              accommodationContract.optionLabelByCode.get("cot") ?? "Cot",
            priceMinor: accommodationContract.cotPriceMinor,
            eligibilityAgeBandCode:
              (accommodationContract.cotEligibilityAgeBandCode ?? null) as
                | "under_3"
                | "3_11"
                | "12_17"
                | "18_plus"
                | null,
          })
        }

        return {
          eventId: event._id,
          slug: event.slug,
          title: event.title,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          timezone: event.timezone,
          currency: event.currency,
          defaultRoomTypeId: event.defaultRoomTypeId ?? undefined,
          source: {
            kind: event.primarySourceKind,
            provider:
              event.primarySourceProvider ?? primarySource?.provider ?? null,
            externalEventId: primarySource?.externalEventId ?? null,
          },
          tickets,
          accommodation: {
            ...accommodation,
            config: hasConfiguredChoices ? accommodationContract.config : null,
            activeCategories,
            options,
            ageBands: hasConfiguredChoices ? accommodationContract.ageBands : [],
          },
        }
      })
    )
  },
})

export const getPublicSignupAccommodationQuote = query({
  args: {
    eventId: v.id("events"),
    attendees: v.array(publicSignupQuoteAttendeeValidator),
  },
  returns: publicSignupAccommodationQuoteValidator,
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event) {
      throw new Error("QUOTE_INVALID: Event not found.")
    }
    if (!event.isPublished || !event.isSignupOpen) {
      throw new Error("QUOTE_INVALID: Signup is currently closed for this event.")
    }
    if (args.attendees.length === 0) {
      throw new Error("QUOTE_INVALID: At least one attendee is required.")
    }

    const seenAttendeeKeys = new Set<string>()
    for (const attendee of args.attendees) {
      if (seenAttendeeKeys.has(attendee.attendeeKey)) {
        throw new Error(
          `QUOTE_INVALID: Duplicate attendee key '${attendee.attendeeKey}'.`
        )
      }
      seenAttendeeKeys.add(attendee.attendeeKey)
    }

    const ticketTypeIds = new Set(
      args.attendees.map((attendee) => attendee.ticketTypeId)
    )
    const ticketTypeDocs = await Promise.all(
      Array.from(ticketTypeIds).map((ticketTypeId) =>
        ctx.db.get("ticketTypes", ticketTypeId)
      )
    )
    const ticketById = new Map<string, Doc<"ticketTypes">>()
    for (const ticketType of ticketTypeDocs) {
      if (ticketType) {
        ticketById.set(String(ticketType._id), ticketType)
      }
    }
    const ticketCategoryById = await resolveTicketCategoryById(
      ctx,
      ticketById
    )

    const context = await loadPublicSignupAccommodationContext(
      ctx,
      args.eventId
    )

    // CR-10: aggregate the number of attendees requesting each ticket so a
    // ticket referenced by multiple attendees counts its full quantity
    // against maxQuantity — not just whether its soldCount is already full.
    const requestedCountByTicket = new Map<string, number>()
    for (const attendee of args.attendees) {
      const ticketTypeId = String(attendee.ticketTypeId)
      requestedCountByTicket.set(
        ticketTypeId,
        (requestedCountByTicket.get(ticketTypeId) ?? 0) + 1
      )
    }

    let ticketTotalMinor = 0
    let accommodationTotalMinor = 0

    const attendeeResults = args.attendees.map((attendee) => {
      const ticket = ticketById.get(String(attendee.ticketTypeId))
      if (!ticket) {
        throw new Error(
          "QUOTE_INVALID: Selected ticket type does not belong to this event."
        )
      }
      if (ticket.eventId !== args.eventId) {
        throw new Error(
          "QUOTE_INVALID: Selected ticket type does not belong to this event."
        )
      }
      if (
        ticket.availabilityState !== "selectable" ||
        !ticket.isActive ||
        ticket.visibility !== "public"
      ) {
        throw new Error(
          "QUOTE_INVALID: Selected ticket type is no longer selectable."
        )
      }

      // CR-08/CR-10: the quote uses the same aggregate capacity rule as the
      // submission path, so a ticket that is already full — or that would be
      // oversold by the number of attendees requesting it in this quote —
      // can never be quoted as if it were still available.
      if (
        isTicketCapacityExceeded({
          ticket,
          requestedCount:
            requestedCountByTicket.get(String(attendee.ticketTypeId)) ?? 1,
        })
      ) {
        throw new Error(
          "QUOTE_INVALID: Selected ticket type has reached its maximum quantity."
        )
      }

      // A present but unresolvable ticketTypes.roomTypeId fails closed
      // (CR-02): the ticket must never be treated as unconstrained.
      const ticketEntitlement = ticketCategoryById.get(
        String(attendee.ticketTypeId)
      )
      if (ticketEntitlement === null) {
        throw new Error(
          "QUOTE_INVALID: The selected ticket's room type is no longer available."
        )
      }
      const ticketCategoryId = ticketEntitlement?.categoryId ?? null

      const resolved = resolvePublicSignupSelection({
        context,
        selection: {
          categoryId: attendee.categoryId
            ? String(attendee.categoryId)
            : null,
          occupancy: attendee.occupancy ?? null,
          upgradeSelected: attendee.upgradeSelected ?? false,
          cotSelected: attendee.cotSelected ?? false,
          ageBandCode: attendee.ageBandCode ?? null,
        },
        ticketCategoryId,
      })

      // The buyer never chooses nights in this phase: the quote prices the
      // event-configured base stay only.
      const nightCount = resolved.nightCount ?? 0
      const result = deriveAccommodationAmount({
        selection: {
          attendeeId: attendee.attendeeKey,
          categoryCode: resolved.categoryCode,
          occupancy: resolved.occupancy,
          upgradeSelected: resolved.upgradeSelected,
          cotSelected: resolved.cotSelected,
          ageBandCode: resolved.ageBandCode,
          nightCount,
        },
        pricing: {
          baseRatePerNightMinor: resolved.baseRatePerNightMinor,
          superiorUpgradePriceMinor: resolved.superiorUpgradePriceMinor,
          cotPriceMinor: resolved.cotPriceMinor,
          cotEligibilityAgeBandCode: resolved.cotEligibilityAgeBandCode,
          ticketAccommodationIncluded: ticket.accommodationIncluded === true,
          eventBaseNights: nightCount,
        },
      })

      ticketTotalMinor += ticket.priceMinor
      accommodationTotalMinor += result.totalMinor

      return {
        attendeeKey: attendee.attendeeKey,
        ticketTypeId: attendee.ticketTypeId,
        ticketLabel: ticket.label,
        ticketPriceMinor: ticket.priceMinor,
        categoryId: resolved.categoryId
          ? (resolved.categoryId as Id<"accommodationCategories">)
          : undefined,
        categoryCode: resolved.categoryCode
          ? (resolved.categoryCode as
              | "standard"
              | "superior"
              | "family")
          : undefined,
        categoryLabel: resolved.categoryLabel ?? undefined,
        occupancy: resolved.occupancy ?? undefined,
        upgradeSelected: resolved.upgradeSelected,
        cotSelected: resolved.cotSelected,
        ageBandCode: resolved.ageBandCode
          ? (resolved.ageBandCode as
              | "under_3"
              | "3_11"
              | "12_17"
              | "18_plus")
          : undefined,
        accommodationTotalMinor: result.totalMinor,
        amountDueMinor: ticket.priceMinor + result.totalMinor,
        lines: result.lines,
      }
    })

    return {
      eventId: args.eventId,
      currency: event.currency,
      breakfastIncluded: context.config?.breakfastIncluded ?? false,
      ticketTotalMinor,
      accommodationTotalMinor,
      totalDueMinor: ticketTotalMinor + accommodationTotalMinor,
      attendees: attendeeResults,
    }
  },
})
