import { v } from "convex/values"
import { query, type QueryCtx, type MutationCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import {
  accommodationIneligibilityReasonValidator,
  ticketUnavailableReasonValidator,
  signupAccommodationOccupancyValidator,
  signupAccommodationOptionSelectionValidator,
  signupAccommodationNightBeforeLevelValidator,
  signupAccommodationNightBeforeOccupancyValidator,
} from "../lib/types/signup"
import type { TicketUnavailableReason } from "../lib/types/signup"
import {
  deriveAccommodationAmount,
  NIGHT_BEFORE_SUPERIOR_PREMIUM_MINOR,
  type AccommodationOptionUnit,
} from "../lib/domain/finance/accommodation-amounts"

const PUBLIC_EVENT_LIMIT = 50
const EVENT_TICKET_LIMIT = 100
const EVENT_ASSIGNABLE_SLOT_LIMIT = 200
const EVENT_SOURCE_LIMIT = 5
const EVENT_RATE_LIMIT = 200
const EVENT_OPTION_LIMIT = 100

/**
 * The event option key of the included-stay Superior upgrade add-on. It is a
 * regular enabled event option (€10/person/night for exactly the configured
 * included base nights) and is never an authority field — the server enforces
 * the quantity/nights shape for this key.
 */
export const SUPERIOR_UPGRADE_OPTION_KEY = "superior_upgrade"

const categoryCodeValidator = v.union(
  v.literal("standard"),
  v.literal("superior"),
  v.literal("family")
)
const occupancyValidator = signupAccommodationOccupancyValidator

const publicSignupTicketValidator = v.object({
  ticketTypeId: v.id("ticketTypes"),
  label: v.string(),
  priceMinor: v.number(),
  selectable: v.boolean(),
  reason: v.union(ticketUnavailableReasonValidator, v.null()),
  accommodationIncluded: v.optional(v.boolean()),
  roomTypeId: v.optional(v.id("accommodationRoomTypes")),
  roomTypeCategoryId: v.optional(v.id("accommodationCategories")),
  roomTypeCategoryCode: v.optional(categoryCodeValidator),
  occupancy: v.optional(occupancyValidator),
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

/**
 * Server-resolved night-before display rates (minor units per person for
 * exactly one night), derived from the event's included-stay (Standard)
 * category rates plus the fixed Superior premium. The client renders these
 * copy-only; the server remains the charge authority.
 */
const publicSignupNightBeforeRatesValidator = v.object({
  standard: v.object({
    single: v.number(),
    shared: v.number(),
  }),
  superior: v.object({
    single: v.number(),
    shared: v.number(),
  }),
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
  optionKey: v.string(),
  label: v.string(),
  priceMinor: v.number(),
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
    // Server-resolved display rates for the independent night-before choice
    // (copy only — the server stays the charge authority).
    nightBefore: v.union(publicSignupNightBeforeRatesValidator, v.null()),
  }),
})

const publicSignupReceiptLineValidator = v.object({
  kind: v.union(v.literal("accommodation"), v.literal("option")),
  optionKey: v.optional(v.string()),
  label: v.string(),
  nights: v.number(),
  quantity: v.optional(v.number()),
  ratePerNightMinor: v.number(),
  chargeMinor: v.number(),
})

const publicSignupQuoteAttendeeValidator = v.object({
  attendeeKey: v.string(),
  ticketTypeId: v.id("ticketTypes"),
  // Legacy optional category input; the resolver rejects any value that does
  // not match the server-resolved included-stay category.
  categoryId: v.optional(v.id("accommodationCategories")),
  occupancy: v.optional(occupancyValidator),
  optionSelections: v.array(signupAccommodationOptionSelectionValidator),
  nightBeforeLevel: v.optional(signupAccommodationNightBeforeLevelValidator),
  nightBeforeOccupancy: v.optional(
    signupAccommodationNightBeforeOccupancyValidator
  ),
  // Legacy optional total-nights input; the resolver only accepts the
  // derived total (base, or base + 1 when a night-before level is present).
  nights: v.optional(v.number()),
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
  nightBeforeLevel: v.optional(signupAccommodationNightBeforeLevelValidator),
  nightBeforeOccupancy: v.optional(
    signupAccommodationNightBeforeOccupancyValidator
  ),
  accommodationIncluded: v.boolean(),
  baseNights: v.number(),
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
      occupancy: "single" | "shared"
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
      accommodationIncluded: ticket.accommodationIncluded === true,
      roomTypeId: ticket.roomTypeId ?? undefined,
      roomTypeCategoryId: roomTypeCategory?.categoryId ?? undefined,
      roomTypeCategoryCode: roomTypeCategory?.categoryCode ?? undefined,
      occupancy: roomTypeCategory?.occupancy,
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
    accommodationIncluded: ticket.accommodationIncluded === true,
    roomTypeId: ticket.roomTypeId ?? undefined,
    roomTypeCategoryId: roomTypeCategory?.categoryId ?? undefined,
    roomTypeCategoryCode: roomTypeCategory?.categoryCode ?? undefined,
    occupancy: roomTypeCategory?.occupancy,
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
 * eventAccommodationConfig, eventAccommodationRates and the enabled
 * eventAccommodationOptions. Catalog labels/codes are resolved through
 * per-ID reads so a category/option beyond a catalog listing limit never
 * silently drops.
 */
export async function loadPublicSignupAccommodationContext(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">
): Promise<PublicSignupAccommodationContext> {
  const [event, configRow, rateRows, eventOptionRows] = await Promise.all([
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
  const optionKeyById = new Map<string, string>()
  const optionLabelByKey = new Map<string, string>()
  const optionUnitByKey = new Map<string, AccommodationOptionUnit>()
  for (const definition of optionDefinitions) {
    if (definition) {
      optionKeyById.set(String(definition._id), definition.code)
      optionLabelByKey.set(definition.code, definition.label)
      optionUnitByKey.set(definition.code, definition.unit)
    }
  }

  const optionsByKey = new Map<
    string,
    { label: string; priceMinor: number; unit: AccommodationOptionUnit }
  >()
  for (const row of enabledOptionRows) {
    const key = optionKeyById.get(String(row.optionId))
    if (!key) {
      continue
    }
    const unit = optionUnitByKey.get(key)
    // The schema requires `unit` on every accommodation option definition; an
    // option without a resolvable unit must never be offered or priced (the
    // charge formula would be unknowable). Missing unit fails closed.
    if (!unit) {
      throw new Error(
        `Accommodation option '${key}' (${String(row.optionId)}) has no resolvable unit; refusing to offer it.`
      )
    }
    optionsByKey.set(key, {
      label: optionLabelByKey.get(key) ?? key,
      priceMinor: row.priceMinor,
      unit,
    })
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
          defaultCategoryId: configRow.defaultCategoryId
            ? String(configRow.defaultCategoryId)
            : null,
        }
      : null,
    ratesByKey,
    categoryById,
    activeCategoryIds,
    optionsByKey,
  }
}

export type PublicSignupAccommodationContext = {
  hasConfiguredAccommodation: boolean
  config: {
    baseCheckInAt: number
    baseCheckOutAt: number
    nightCount: number
    breakfastIncluded: boolean
    /** Event-configured included-stay category id (stringified) or null. */
    defaultCategoryId: string | null
  } | null
  ratesByKey: Map<string, number>
  categoryById: Map<string, { code: string; label: string }>
  activeCategoryIds: Set<string>
  optionsByKey: Map<
    string,
    { label: string; priceMinor: number; unit: AccommodationOptionUnit }
  >
}

export type PublicSignupNightBeforeRates = {
  standard: { single: number; shared: number }
  superior: { single: number; shared: number }
}

/**
 * Resolves the event's included-stay category for the simplified contract.
 * The buyer never chooses a category; the server resolves it through the
 * existing config/ticket fallback chain: the event's configured
 * `defaultCategoryId` first (the divine event is configured to Standard),
 * then the active category with code `standard`, then any remaining active
 * category. Returns null when the event has no resolvable included-stay
 * category (callers fail closed). Ticket `roomTypeId` metadata is untouched
 * and remains admin-allocation-only — it never changes the buyer's included
 * stay.
 */
export function resolveIncludedStayCategory(
  context: PublicSignupAccommodationContext
): {
  categoryId: string
  code: "standard" | "superior" | "family"
  label: string
} | null {
  const preferredId = context.config?.defaultCategoryId
  if (
    preferredId &&
    context.activeCategoryIds.has(preferredId) &&
    context.categoryById.has(preferredId)
  ) {
    const category = context.categoryById.get(preferredId)!
    return {
      categoryId: preferredId,
      code: (category.code === "standard" ||
      category.code === "superior" ||
      category.code === "family"
        ? category.code
        : "standard") as "standard" | "superior" | "family",
      label: category.label,
    }
  }

  for (const categoryId of context.activeCategoryIds) {
    const category = context.categoryById.get(categoryId)
    if (category?.code === "standard") {
      return {
        categoryId,
        code: "standard",
        label: category.label,
      }
    }
  }

  const fallbackId = Array.from(context.activeCategoryIds)[0]
  if (fallbackId) {
    const category = context.categoryById.get(fallbackId)
    if (category) {
      return {
        categoryId: fallbackId,
        code: (category.code === "standard" ||
        category.code === "superior" ||
        category.code === "family"
          ? category.code
          : "standard") as "standard" | "superior" | "family",
        label: category.label,
      }
    }
  }

  return null
}

/**
 * Resolves the server-priced night-before display rates from the included
 * (Standard) category's occupancy rates plus the fixed Superior premium.
 * Returns null when the included-stay category is missing either the single
 * or shared rate, so the client never fabricates €90/€60/€100/€70 locally.
 */
export function resolveNightBeforeDisplayRates(
  context: PublicSignupAccommodationContext,
  includedCategoryId: string | null
): PublicSignupNightBeforeRates | null {
  if (!includedCategoryId) {
    return null
  }
  const singleRate = context.ratesByKey.get(`${includedCategoryId}:single`)
  const sharedRate = context.ratesByKey.get(`${includedCategoryId}:shared`)
  if (singleRate === undefined || sharedRate === undefined) {
    return null
  }
  return {
    standard: {
      single: singleRate,
      shared: sharedRate,
    },
    superior: {
      single: singleRate + NIGHT_BEFORE_SUPERIOR_PREMIUM_MINOR,
      shared: sharedRate + NIGHT_BEFORE_SUPERIOR_PREMIUM_MINOR,
    },
  }
}

export type PublicSignupSelectionResolved = {
  categoryId: string | null
  categoryCode: string | null
  categoryLabel: string | null
  occupancy: "single" | "shared" | null
  baseRatePerNightMinor: number | null
  options: Array<{
    optionKey: string
    label: string
    pricePerUnitMinor: number
    quantity: number
    nights: number
    unit: AccommodationOptionUnit
  }>
  /** The configured base stay night count for the event. */
  baseNights: number | null
  /** The derived total stay nights (base, or base + 1 with a night before). */
  nightCount: number | null
  /** The validated independent night-before level (null = none). */
  nightBeforeLevel: "standard" | "superior" | null
  /** The occupancy used to price the independent night-before stay. */
  nightBeforeOccupancy: "single" | "shared" | null
  nightBeforeRatePerNightMinor: number | null
  breakfastIncluded: boolean
}

/**
 * Validates one public signup accommodation preference against the event's
 * configuration and the attendee's ticket entitlement. Both the quote query
 * and the submission mutation resolve through this single rule set so the
 * browser can never become the authority for eligibility, dates, nights,
 * night-before level, upgrade shape, or money. Throws a deterministic
 * `QUOTE_INVALID:` error for stale/invalid combinations; the submission
 * mutation re-maps that marker to its structured conflict error.
 *
 * Simplified contract rules:
 * - The included-stay category is always server-resolved (`defaultCategoryId`
 *   → code `standard` → first active). A supplied client `categoryId` is
 *   legacy input accepted only when it matches the resolved category —
 *   anything else is a category-dependent payload and is rejected.
 * - Occupancy is required and limited to single/shared for new selections.
 * - `nightBeforeLevel` is optional and must be a valid level; the derived
 *   total night count is base (none) or base + 1 (any level).
 * - A legacy `nights` value is accepted only when it equals the derived total.
 * - Options must be enabled event options without duplicates; the
 *   `superior_upgrade` upgrade is restricted to exactly one attendee and the
 *   configured included base nights.
 */
export function resolvePublicSignupSelection(input: {
  context: PublicSignupAccommodationContext
  selection: {
    categoryId?: string | null
    occupancy?: string | null
    optionSelections?: Array<{
      optionKey: string
      quantity: number
      nights: number
    }> | null
    nightBeforeLevel?: "standard" | "superior" | null
    nightBeforeOccupancy?: "single" | "shared" | null
    nights?: number | null
  }
}): PublicSignupSelectionResolved {
  const { context, selection } = input
  const optionSelections = Array.isArray(selection.optionSelections)
    ? selection.optionSelections
    : []

  if (!context.hasConfiguredAccommodation) {
    if (
      selection.categoryId ||
      selection.occupancy ||
      optionSelections.length > 0 ||
      selection.nightBeforeLevel != null ||
      selection.nightBeforeOccupancy != null ||
      selection.nights != null
    ) {
      throw new Error(
        "QUOTE_INVALID: This event does not offer configured accommodation options."
      )
    }
    return {
      categoryId: null,
      categoryCode: null,
      categoryLabel: null,
      occupancy: null,
      baseRatePerNightMinor: null,
      options: [],
      baseNights: null,
      nightCount: null,
      nightBeforeLevel: null,
      nightBeforeOccupancy: null,
      nightBeforeRatePerNightMinor: null,
      breakfastIncluded: false,
    }
  }

  const occupancy = selection.occupancy ?? null
  if (!occupancy) {
    throw new Error(
      "QUOTE_INVALID: An occupancy is required when accommodation is configured."
    )
  }
  if (occupancy !== "single" && occupancy !== "shared") {
    throw new Error(
      "QUOTE_INVALID: Only single and shared occupancy are offered for the included stay."
    )
  }

  // The included-stay category is server-resolved; the client never chooses
  // it. A legacy categoryId is accepted only when it matches the resolved
  // category — any other value is a category-dependent payload.
  const includedCategory = resolveIncludedStayCategory(context)
  if (!includedCategory) {
    throw new Error(
      "QUOTE_INVALID: The included accommodation category is not configured for this event."
    )
  }
  if (selection.categoryId) {
    const clientCategoryId = String(selection.categoryId)
    if (clientCategoryId !== includedCategory.categoryId) {
      throw new Error(
        "QUOTE_INVALID: The included stay is offered as one room category; the selected category is not available."
      )
    }
  }

  const baseRatePerNightMinor = context.ratesByKey.get(
    `${includedCategory.categoryId}:${occupancy}`
  )
  if (baseRatePerNightMinor === undefined) {
    throw new Error(
      "QUOTE_INVALID: No rate is configured for the included category and occupancy."
    )
  }

  const baseNights = context.config?.nightCount ?? 0

  // Night-before level: optional, must be a valid level, and exactly one
  // night (derived total = base + 1). A legacy `nights` value is only
  // accepted when it agrees with the derived total.
  const nightBeforeLevel = selection.nightBeforeLevel ?? null
  const nightBeforeOccupancy = nightBeforeLevel
    ? (selection.nightBeforeOccupancy ?? occupancy)
    : null
  if (selection.nightBeforeOccupancy && !nightBeforeLevel) {
    throw new Error(
      "QUOTE_INVALID: Night-before occupancy requires a night-before stay."
    )
  }
  const nightBeforeRatePerNightMinor = nightBeforeOccupancy
    ? context.ratesByKey.get(
        `${includedCategory.categoryId}:${nightBeforeOccupancy}`
      ) ?? null
    : null
  if (nightBeforeLevel && nightBeforeRatePerNightMinor === null) {
    throw new Error(
      "QUOTE_INVALID: No rate is configured for the night-before occupancy."
    )
  }
  const derivedTotalNights = baseNights + (nightBeforeLevel ? 1 : 0)
  if (
    selection.nights !== undefined &&
    selection.nights !== null &&
    selection.nights !== derivedTotalNights
  ) {
    throw new Error(
      "QUOTE_INVALID: The selected total nights are not part of the simplified accommodation contract."
    )
  }

  // Every selected option must be a key in the event's enabled option set.
  // Unknown/disabled/duplicate keys fail closed; quantity and nights are
  // normalized by the pricing engine. The `superior_upgrade` included-stay
  // upgrade is restricted to exactly one attendee for exactly the configured
  // included base nights (arbitrary quantities/nights are rejected).
  const resolvedOptions: PublicSignupSelectionResolved["options"] = []
  const seenKeys = new Set<string>()
  for (const selected of optionSelections) {
    const option = context.optionsByKey.get(selected.optionKey)
    if (!option) {
      throw new Error(
        `QUOTE_INVALID: The selected accommodation option '${selected.optionKey}' is not enabled for this event.`
      )
    }
    if (seenKeys.has(selected.optionKey)) {
      throw new Error(
        `QUOTE_INVALID: The accommodation option '${selected.optionKey}' was selected more than once.`
      )
    }
    seenKeys.add(selected.optionKey)
    const quantity = Math.max(0, Math.floor(selected.quantity ?? 0))
    const nights = Math.max(0, Math.floor(selected.nights ?? 0))
    if (selected.optionKey === SUPERIOR_UPGRADE_OPTION_KEY) {
      if (quantity !== 1 || nights !== baseNights) {
        throw new Error(
          "QUOTE_INVALID: The included-stay Superior upgrade applies to exactly one attendee for the included base nights."
        )
      }
    }
    resolvedOptions.push({
      optionKey: selected.optionKey,
      label: option.label,
      pricePerUnitMinor: option.priceMinor,
      quantity,
      nights,
      unit: option.unit,
    })
  }

  return {
    categoryId: includedCategory.categoryId,
    categoryCode: includedCategory.code,
    categoryLabel: includedCategory.label,
    occupancy: occupancy as "single" | "shared",
    baseRatePerNightMinor,
    options: resolvedOptions,
    baseNights,
    nightCount: derivedTotalNights,
    nightBeforeLevel,
    nightBeforeOccupancy,
    nightBeforeRatePerNightMinor,
    breakfastIncluded: context.config?.breakfastIncluded ?? false,
  }
}

/**
 * Resolves the ticket entitlement for every ticket referenced by a public
 * quote request: `ticketTypes.roomTypeId` → room type → category and
 * occupancy. Room capacity is the ticket authority for Single vs Shared.
 *
 * The result is a three-state map so a dangling constrained room type can be
 * distinguished from a genuinely unconstrained ticket (CR-02):
 * - `{ categoryId, occupancy }` — the ticket's room type resolved to a
 *   catalog category and occupancy;
 * - `undefined` — the ticket has no roomTypeId and is truly unconstrained;
 * - `null` — the ticket has a roomTypeId that cannot be resolved (missing
 *   room type or missing category); callers MUST reject this state.
 */
export async function resolveTicketCategoryById(
  ctx: QueryCtx | MutationCtx,
  ticketById: Map<string, Doc<"ticketTypes">>
): Promise<
  Map<
    string,
    { categoryId: string; occupancy: "single" | "shared" } | null | undefined
  >
> {
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
  const roomTypeCategoryById = new Map<
    string,
    { categoryId: string; occupancy: "single" | "shared" }
  >()
  for (const roomType of roomTypes) {
    if (roomType?.categoryId) {
      roomTypeCategoryById.set(String(roomType._id), {
        categoryId: String(roomType.categoryId),
        occupancy: roomType.defaultCapacity === 1 ? "single" : "shared",
      })
    }
  }
  const ticketCategoryById = new Map<
    string,
    { categoryId: string; occupancy: "single" | "shared" } | null | undefined
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
      resolved
        ? { categoryId: resolved.categoryId, occupancy: resolved.occupancy }
        : null
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
            occupancy: "single" | "shared"
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
            occupancy: roomType.defaultCapacity === 1 ? "single" : "shared",
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
          optionKey: string
          label: string
          priceMinor: number
        }> = []
        if (hasConfiguredChoices) {
          for (const [optionKey, option] of accommodationContract.optionsByKey) {
            options.push({
              optionKey,
              label: option.label,
              priceMinor: option.priceMinor,
            })
          }
          options.sort((left, right) =>
            left.label.localeCompare(right.label)
          )
        }

        // Server-resolved night-before display rates from the included
        // (Standard) category occupancy rates plus the fixed Superior
        // premium. Copy only — the charge authority stays server-side.
        const includedCategory = hasConfiguredChoices
          ? resolveIncludedStayCategory(accommodationContract)
          : null
        const nightBefore = hasConfiguredChoices
          ? resolveNightBeforeDisplayRates(
              accommodationContract,
              includedCategory?.categoryId ?? null
            )
          : null

        // The public config contract exposes only the four buyer-facing stay
        // fields; the internal defaultCategoryId is never surfaced.
        const publicConfig =
          hasConfiguredChoices && accommodationContract.config
            ? {
                baseCheckInAt: accommodationContract.config.baseCheckInAt,
                baseCheckOutAt: accommodationContract.config.baseCheckOutAt,
                nightCount: accommodationContract.config.nightCount,
                breakfastIncluded:
                  accommodationContract.config.breakfastIncluded,
              }
            : null

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
            config: publicConfig,
            activeCategories,
            options,
            nightBefore,
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
      if (
        ticketEntitlement?.occupancy &&
        attendee.occupancy &&
        attendee.occupancy !== ticketEntitlement.occupancy
      ) {
        throw new Error(
          "QUOTE_INVALID: Occupancy is determined by the selected ticket."
        )
      }

      const resolved = resolvePublicSignupSelection({
        context,
        selection: {
          categoryId: attendee.categoryId
            ? String(attendee.categoryId)
            : null,
          occupancy: ticketEntitlement?.occupancy ?? attendee.occupancy ?? null,
          optionSelections: attendee.optionSelections,
          nightBeforeLevel: attendee.nightBeforeLevel ?? null,
          nightBeforeOccupancy: attendee.nightBeforeOccupancy ?? null,
          nights: attendee.nights,
        },
      })

      // The server-derived total nights (base, or base + 1 with a
      // night-before) drive the charge: `deriveAccommodationAmount` prices
      // the selected total nights against the ticket-covered base nights, so
      // an included-ticket attendee with a night-before is charged exactly
      // one server-priced night (plus the fixed Superior premium line when
      // the level is `superior`).
      const nightCount = resolved.nightCount ?? 0
      const eventBaseNights = resolved.baseNights ?? 0
      const result = deriveAccommodationAmount({
        selection: {
          attendeeId: attendee.attendeeKey,
          categoryCode: resolved.categoryCode,
          occupancy: resolved.occupancy,
          nightCount,
          nightBeforeLevel: resolved.nightBeforeLevel,
          nightBeforeOccupancy: resolved.nightBeforeOccupancy,
          optionSelections: resolved.options,
        },
        pricing: {
          baseRatePerNightMinor: resolved.baseRatePerNightMinor,
          options: resolved.options.map((option) => ({
            optionKey: option.optionKey,
            label: option.label,
            pricePerUnitMinor: option.pricePerUnitMinor,
            unit: option.unit,
          })),
          ticketAccommodationIncluded: ticket.accommodationIncluded === true,
          eventBaseNights,
          nightBeforeRatePerNightMinor: resolved.nightBeforeRatePerNightMinor,
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
        nightBeforeLevel: resolved.nightBeforeLevel ?? undefined,
        nightBeforeOccupancy: resolved.nightBeforeOccupancy ?? undefined,
        accommodationIncluded: ticket.accommodationIncluded === true,
        baseNights: eventBaseNights,
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
