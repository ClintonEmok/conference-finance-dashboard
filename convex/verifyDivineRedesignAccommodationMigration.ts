import { v } from "convex/values"
import { internalQuery } from "./_generated/server"
import type { Doc } from "./_generated/dataModel"

/**
 * Read-only, event-scoped verification query for the `divine-redesign`
 * accommodation migration (Steps 0-3). Run with:
 *
 *   npx convex run verifyDivineRedesignAccommodationMigration --args '{}'
 *
 * Returns the event ID and bounded counts for the event's tickets (with the
 * locked price/anchor invariant detail per label), catalog categories and
 * room types, room/cot resources, rates, event options, stay config, event
 * accommodation preferences, converted legacy assignments, linked hotels,
 * physical rooms and slots, and the presence of the two old legacy hotels.
 *
 * Invariant detail deliberately excludes attendee PII (counts only) and
 * never mutates data.
 */

const DEFAULT_SLUG = "divine-redesign"

const OLD_HOTEL_NAMES = ["Holiday Inn Express", "Ibis Styles Almere"] as const

const TICKET_LIMIT = 100
const CATEGORY_LIMIT = 100
const ROOM_TYPE_LIMIT = 200
const RESOURCE_LIMIT = 200
const RATE_LIMIT = 200
const EVENT_OPTION_LIMIT = 100
const ORDER_LIMIT = 200
const ORDER_CHILD_LIMIT = 1000
const HOTEL_LINK_LIMIT = 50
const ROOM_LIMIT = 4000
const SLOT_LIMIT = 4000

export default internalQuery({
  args: {
    /** Event slug to verify; defaults to the production divine-redesign. */
    slug: v.optional(v.string()),
  },
  returns: v.object({
    eventId: v.optional(v.string()),
    slug: v.string(),
    tickets: v.object({
      count: v.number(),
      byLabel: v.record(
        v.string(),
        v.object({
          priceMinor: v.number(),
          roomAnchor: v.optional(v.string()),
          accommodationIncluded: v.boolean(),
        })
      ),
    }),
    categories: v.number(),
    roomTypes: v.number(),
    roomResources: v.number(),
    cotResources: v.number(),
    rates: v.number(),
    eventOptions: v.number(),
    config: v.union(
      v.null(),
      v.object({
        baseCheckInAt: v.number(),
        baseCheckOutAt: v.number(),
        nightCount: v.number(),
        breakfastIncluded: v.boolean(),
        defaultCategoryCode: v.optional(v.string()),
      })
    ),
    preferences: v.number(),
    convertedAssignments: v.number(),
    linkedHotels: v.number(),
    rooms: v.number(),
    slots: v.number(),
    oldHotels: v.number(),
  }),
  handler: async (ctx, args) => {
    const slug = args.slug?.trim() || DEFAULT_SLUG

    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()

    const empty = {
      eventId: undefined,
      slug,
      tickets: { count: 0, byLabel: {} },
      categories: 0,
      roomTypes: 0,
      roomResources: 0,
      cotResources: 0,
      rates: 0,
      eventOptions: 0,
      config: null,
      preferences: 0,
      convertedAssignments: 0,
      linkedHotels: 0,
      rooms: 0,
      slots: 0,
      oldHotels: 0,
    }
    if (!event) {
      return empty
    }

    const ticketRows = await ctx.db
      .query("ticketTypes")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .take(TICKET_LIMIT)
    const sortedTickets = ticketRows
      .slice()
      .sort((a, b) => {
        const aSort = a.sortOrder ?? a._creationTime
        const bSort = b.sortOrder ?? b._creationTime
        if (aSort !== bSort) {
          return aSort - bSort
        }
        return a.label.localeCompare(b.label)
      })
    const roomTypeIds = Array.from(
      new Set(
        sortedTickets
          .map((ticket) => ticket.roomTypeId)
          .filter((id): id is NonNullable<typeof id> => id !== undefined)
      )
    )
    const roomTypeDocs = await Promise.all(
      roomTypeIds.map((roomTypeId) =>
        ctx.db.get("accommodationRoomTypes", roomTypeId)
      )
    )
    const roomTypeLabelById = new Map(
      roomTypeDocs
        .filter((roomType): roomType is NonNullable<typeof roomType> =>
          roomType !== null
        )
        .map((roomType) => [String(roomType._id), roomType.label])
    )
    const byLabel: Record<
      string,
      {
        priceMinor: number
        roomAnchor?: string
        accommodationIncluded: boolean
      }
    > = {}
    for (const ticket of sortedTickets) {
      byLabel[ticket.label] = {
        priceMinor: ticket.priceMinor,
        roomAnchor: ticket.roomTypeId
          ? roomTypeLabelById.get(String(ticket.roomTypeId))
          : undefined,
        accommodationIncluded: ticket.accommodationIncluded === true,
      }
    }

    let categories = 0
    for await (const _row of ctx.db.query("accommodationCategories")) {
      categories += 1
      if (categories >= CATEGORY_LIMIT) {
        break
      }
    }

    let roomTypes = 0
    for await (const _row of ctx.db.query("accommodationRoomTypes")) {
      roomTypes += 1
      if (roomTypes >= ROOM_TYPE_LIMIT) {
        break
      }
    }

    const resources = await ctx.db
      .query("eventAccommodationResources")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .take(RESOURCE_LIMIT)
    const roomResources = resources.filter(
      (row) => row.kind === "room"
    ).length
    const cotResources = resources.filter((row) => row.kind === "cot").length

    const rates = await ctx.db
      .query("eventAccommodationRates")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .take(RATE_LIMIT)

    const eventOptions = await ctx.db
      .query("eventAccommodationOptions")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .take(EVENT_OPTION_LIMIT)

    const configRow = await ctx.db
      .query("eventAccommodationConfig")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .unique()
    let config: {
      baseCheckInAt: number
      baseCheckOutAt: number
      nightCount: number
      breakfastIncluded: boolean
      defaultCategoryCode?: string
    } | null = null
    if (configRow) {
      const defaultCategory = configRow.defaultCategoryId
        ? await ctx.db.get(
            "accommodationCategories",
            configRow.defaultCategoryId
          )
        : null
      config = {
        baseCheckInAt: configRow.baseCheckInAt,
        baseCheckOutAt: configRow.baseCheckOutAt,
        nightCount: configRow.nightCount,
        breakfastIncluded: configRow.breakfastIncluded,
        defaultCategoryCode: defaultCategory?.code,
      }
    }

    let preferences = 0
    let convertedAssignments = 0
    const orderIds: Array<Doc<"orders">["_id"]> = []
    for await (const order of ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))) {
      orderIds.push(order._id)
      if (orderIds.length >= ORDER_LIMIT) {
        break
      }
    }
    for (const orderId of orderIds) {
      const selectionRows = await ctx.db
        .query("orderAccommodationSelections")
        .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
        .take(ORDER_CHILD_LIMIT)
      preferences += selectionRows.length
      const assignmentRows = await ctx.db
        .query("orderAssignments")
        .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
        .take(ORDER_CHILD_LIMIT)
      for (const assignment of assignmentRows) {
        if (assignment.status === "converted") {
          convertedAssignments += 1
        }
      }
    }

    const hotelLinks = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", String(event._id))
      )
      .take(HOTEL_LINK_LIMIT)
    const linkedHotelIds = Array.from(
      new Set(hotelLinks.map((link) => String(link.hotelId)))
    )

    let rooms = 0
    for (const hotelId of linkedHotelIds) {
      const hotelRooms = await ctx.db
        .query("accommodationRooms")
        .withIndex("hotelId_label", (q) => q.eq("hotelId", hotelId))
        .take(ROOM_LIMIT)
      rooms += hotelRooms.length
    }

    let slots = 0
    for await (const _row of ctx.db
      .query("accommodationSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))) {
      slots += 1
      if (slots >= SLOT_LIMIT) {
        break
      }
    }

    let oldHotels = 0
    for (const name of OLD_HOTEL_NAMES) {
      const rows = await ctx.db
        .query("accommodationHotels")
        .withIndex("name", (q) => q.eq("name", name))
        .take(2)
      oldHotels += rows.length
    }

    return {
      eventId: String(event._id),
      slug,
      tickets: { count: sortedTickets.length, byLabel },
      categories,
      roomTypes,
      roomResources,
      cotResources,
      rates: rates.length,
      eventOptions: eventOptions.length,
      config,
      preferences,
      convertedAssignments,
      linkedHotels: hotelLinks.length,
      rooms,
      slots,
      oldHotels,
    }
  },
})
