import { v } from "convex/values"
import { query, type QueryCtx } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import {
  accommodationIneligibilityReasonValidator,
  ticketUnavailableReasonValidator,
} from "../lib/types/signup"
import type { TicketUnavailableReason } from "../lib/types/signup"

const PUBLIC_EVENT_LIMIT = 50
const EVENT_TICKET_LIMIT = 100
const EVENT_ASSIGNABLE_SLOT_LIMIT = 200
const EVENT_SOURCE_LIMIT = 5

const publicSignupTicketValidator = v.object({
  ticketTypeId: v.id("ticketTypes"),
  label: v.string(),
  priceMinor: v.number(),
  selectable: v.boolean(),
  reason: v.union(ticketUnavailableReasonValidator, v.null()),
  roomTypeId: v.optional(v.id("accommodationRoomTypes")),
})

const publicSignupAccommodationSlotValidator = v.object({
  slotId: v.id("accommodationSlots"),
  roomLabel: v.string(),
  roomTypeLabel: v.string(),
  assignable: v.boolean(),
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
    slots: v.array(publicSignupAccommodationSlotValidator),
  }),
})

function mapTicket(ticket: Doc<"ticketTypes">) {
  const selectableByState = ticket.availabilityState === "selectable"
  const selectable =
    selectableByState && ticket.isActive && ticket.visibility === "public"

  if (selectable) {
    return {
      ticketTypeId: ticket._id,
      label: ticket.label,
      priceMinor: ticket.priceMinor,
      selectable: true,
      reason: null,
      roomTypeId: ticket.roomTypeId ?? undefined,
    }
  }

  const reason =
    normalizeTicketUnavailableReason(ticket.unavailableReason) ??
    (ticket.visibility === "hidden"
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
          .map(mapTicket)

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
          accommodation,
        }
      })
    )
  },
})
