import { v } from "convex/values"
import { internalMutation } from "./_generated/server"

const HOTEL_NAME = "NH Eindhoven Conference Centre Koningshof"
const HOTEL_CITY = "Veldhoven"
const HOTEL_ADDRESS = "Locht 117, 5504 RM Veldhoven, Netherlands"

const ROOM_RESOURCES = [
  { label: "Standard Single", count: 95 },
  { label: "Standard Double King", count: 61 },
  { label: "Standard Double Queen", count: 29 },
  { label: "Standard Double Twin", count: 60 },
  { label: "Standard Twin (separate beds)", count: 21 },
  { label: "Superior Single", count: 15 },
  { label: "Superior Double King", count: 33 },
  { label: "Superior Double Twin", count: 50 },
  { label: "Family Room Double King", count: 4 },
  { label: "Family Room Double Twin", count: 6 },
] as const

/**
 * Idempotently registers NH Koningshof as Divine Conference's hotel and
 * applies the hotel-provided sellable room/cot limits. Physical hotel and
 * room-type rows remain reusable inventory; event resources define what this
 * event may sell.
 */
export default internalMutation({
  args: {
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const slug = args.slug ?? "divine-conference"
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()

    if (!event) {
      throw new Error(`Event with slug '${slug}' not found`)
    }

    let hotel = await ctx.db
      .query("accommodationHotels")
      .withIndex("name", (q) => q.eq("name", HOTEL_NAME))
      .first()

    let hotelCreated = 0
    let hotelUpdated = 0
    if (!hotel) {
      const hotelId = await ctx.db.insert("accommodationHotels", {
        name: HOTEL_NAME,
        city: HOTEL_CITY,
        address: HOTEL_ADDRESS,
        notes: "NH Koningshof hotel inventory for Divine Conference.",
      })
      hotel = await ctx.db.get("accommodationHotels", hotelId)
      hotelCreated = 1
    } else if (
      hotel.city !== HOTEL_CITY ||
      hotel.address !== HOTEL_ADDRESS
    ) {
      await ctx.db.patch("accommodationHotels", hotel._id, {
        city: HOTEL_CITY,
        address: HOTEL_ADDRESS,
      })
      hotel = await ctx.db.get("accommodationHotels", hotel._id)
      hotelUpdated = 1
    }

    if (!hotel) {
      throw new Error("Failed to create or load NH Koningshof")
    }

    const eventId = event._id
    const hotelId = String(hotel._id)
    const eventIdString = String(eventId)
    const existingHotelLink = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", eventIdString).eq("hotelId", hotelId)
      )
      .first()

    let eventHotelLinked = 0
    if (!existingHotelLink) {
      await ctx.db.insert("accommodationEventHotels", {
        eventId: eventIdString,
        hotelId,
      })
      eventHotelLinked = 1
    }

    const roomTypes = await ctx.db.query("accommodationRoomTypes").take(100)
    const roomTypeByLabel = new Map(roomTypes.map((roomType) => [roomType.label, roomType]))
    const existingResources = await ctx.db
      .query("eventAccommodationResources")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .take(100)

    let resourcesCreated = 0
    let resourcesUpdated = 0

    for (const resource of ROOM_RESOURCES) {
      const roomType = roomTypeByLabel.get(resource.label)
      if (!roomType) {
        throw new Error(`Room type '${resource.label}' not found`)
      }

      if (roomType.count !== resource.count) {
        await ctx.db.patch("accommodationRoomTypes", roomType._id, {
          count: resource.count,
        })
      }

      const existing = existingResources.find(
        (row) =>
          row.kind === "room" &&
          String(row.roomTypeId) === String(roomType._id)
      )

      if (existing) {
        if (existing.count !== resource.count) {
          await ctx.db.patch("eventAccommodationResources", existing._id, {
            count: resource.count,
          })
          resourcesUpdated += 1
        }
      } else {
        await ctx.db.insert("eventAccommodationResources", {
          eventId,
          kind: "room",
          roomTypeId: roomType._id,
          count: resource.count,
        })
        resourcesCreated += 1
      }
    }

    const existingCot = existingResources.find(
      (row) => row.kind === "cot" && row.roomTypeId === undefined
    )
    if (existingCot) {
      if (existingCot.count !== 10) {
        await ctx.db.patch("eventAccommodationResources", existingCot._id, {
          count: 10,
        })
        resourcesUpdated += 1
      }
    } else {
      await ctx.db.insert("eventAccommodationResources", {
        eventId,
        kind: "cot",
        count: 10,
      })
      resourcesCreated += 1
    }

    return {
      slug,
      eventId: String(eventId),
      hotelId,
      hotelCreated,
      hotelUpdated,
      eventHotelLinked,
      roomResources: ROOM_RESOURCES.length,
      cotResourceCount: 10,
      resourcesCreated,
      resourcesUpdated,
    }
  },
})
