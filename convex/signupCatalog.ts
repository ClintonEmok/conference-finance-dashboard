import { v } from "convex/values"
import { query, type QueryCtx } from "./_generated/server"
import type { Doc } from "./_generated/dataModel"

const PUBLIC_EVENT_LIMIT = 50
const EVENT_TICKET_LIMIT = 100
const EVENT_ASSIGNABLE_SLOT_LIMIT = 200

const ticketUnavailableReasonValidator = v.union(
  v.literal("sold_out"),
  v.literal("disabled"),
  v.literal("hidden"),
  v.literal("not_on_sale")
)

const accommodationIneligibilityReasonValidator = v.union(
  v.literal("accommodation_disabled"),
  v.literal("no_assignable_inventory"),
  v.literal("event_closed")
)

function isPresent<T>(value: T | null): value is T {
  return value !== null
}

function mapTicket(ticket: Doc<"signupTicketTypes">) {
  const selectableByState = ticket.availabilityState === "selectable"
  const selectable =
    selectableByState && ticket.isActive && ticket.visibility === "visible"

  if (selectable) {
    return {
      ticketTypeId: ticket._id,
      label: ticket.label,
      priceMinor: ticket.priceMinor,
      selectable: true,
      reason: null,
    }
  }

  const fallbackReason =
    ticket.unavailableReason ??
    (ticket.visibility === "hidden" ? "hidden" : "disabled")

  return {
    ticketTypeId: ticket._id,
    label: ticket.label,
    priceMinor: ticket.priceMinor,
    selectable: false,
    reason: fallbackReason,
  }
}

async function mapAssignableSlots(ctx: QueryCtx, signupEventId: string) {
  const assignableSlots = await ctx.db
    .query("signupAccommodationSlots")
    .withIndex("by_signupEventId_and_isAssignable", (q) =>
      q.eq("signupEventId", signupEventId).eq("isAssignable", true)
    )
    .take(EVENT_ASSIGNABLE_SLOT_LIMIT)

  if (assignableSlots.length === 0) {
    return {
      eligible: false as const,
      reason: "no_assignable_inventory" as const,
      slots: [],
    }
  }

  const roomDocs = await Promise.all(
    Array.from(new Set(assignableSlots.map((slot) => slot.roomId))).map(
      async (roomId) => {
        const normalizedId = ctx.db.normalizeId("accommodationRooms", roomId)
        if (!normalizedId) {
          return null
        }

        const room = await ctx.db.get("accommodationRooms", normalizedId)
        return room ?? null
      }
    )
  )

  const roomsById = new Map(
    roomDocs.filter(isPresent).map((room) => [String(room._id), room])
  )

  const roomTypeDocs = await Promise.all(
    Array.from(
      new Set(roomDocs.filter(isPresent).map((room) => room.roomTypeId))
    ).map(async (roomTypeId) => {
      const normalizedId = ctx.db.normalizeId(
        "accommodationRoomTypes",
        roomTypeId
      )
      if (!normalizedId) {
        return null
      }

      const roomType = await ctx.db.get("accommodationRoomTypes", normalizedId)
      return roomType ?? null
    })
  )

  const roomTypesById = new Map(
    roomTypeDocs
      .filter(isPresent)
      .map((roomType) => [String(roomType._id), roomType])
  )

  const slots = assignableSlots.map((slot) => {
    const room = roomsById.get(slot.roomId)
    const roomType = room ? (roomTypesById.get(room.roomTypeId) ?? null) : null

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
  returns: v.array(
    v.object({
      eventId: v.id("signupEvents"),
      source: v.union(v.literal("integration"), v.literal("internal")),
      sourceEventRef: v.string(),
      slug: v.string(),
      title: v.string(),
      startsAt: v.number(),
      currency: v.string(),
      tickets: v.array(
        v.object({
          ticketTypeId: v.id("signupTicketTypes"),
          label: v.string(),
          priceMinor: v.number(),
          selectable: v.boolean(),
          reason: v.union(ticketUnavailableReasonValidator, v.null()),
        })
      ),
      accommodation: v.object({
        eligible: v.boolean(),
        reason: v.union(accommodationIneligibilityReasonValidator, v.null()),
        slots: v.array(
          v.object({
            slotId: v.id("signupAccommodationSlots"),
            roomLabel: v.string(),
            roomTypeLabel: v.string(),
            assignable: v.boolean(),
          })
        ),
      }),
    })
  ),
  handler: async (ctx) => {
    const publishedOpenEvents = await ctx.db
      .query("signupEvents")
      .withIndex("by_isPublished_and_isSignupOpen", (q) =>
        q.eq("isPublished", true).eq("isSignupOpen", true)
      )
      .take(PUBLIC_EVENT_LIMIT)

    const orderedEvents = [...publishedOpenEvents].sort((a, b) => {
      if (a.startsAt !== b.startsAt) {
        return a.startsAt - b.startsAt
      }
      return a.title.localeCompare(b.title)
    })

    return await Promise.all(
      orderedEvents.map(async (event) => {
        const ticketTypes = await ctx.db
          .query("signupTicketTypes")
          .withIndex("by_signupEventId", (q) =>
            q.eq("signupEventId", event._id)
          )
          .take(EVENT_TICKET_LIMIT)

        const tickets = ticketTypes
          .map(mapTicket)
          .sort((a, b) => a.label.localeCompare(b.label))

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
            : await mapAssignableSlots(ctx, event._id)

        return {
          eventId: event._id,
          source: event.source,
          sourceEventRef: event.sourceEventRef,
          slug: event.slug,
          title: event.title,
          startsAt: event.startsAt,
          currency: event.currency,
          tickets,
          accommodation,
        }
      })
    )
  },
})
