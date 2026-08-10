import { v } from "convex/values"
import { internalMutation } from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { assertProductionDeployment } from "../lib/domain/legacy/production-deployment-guard"

/**
 * Guarded, operator-run Koningshof accommodation inventory migration for the
 * `divine-redesign` production event (Step 3 of the accommodation cutover).
 * Run with:
 *
 *   npx convex run applyKoningshofAccommodationInventory \
 *     --args '{"slug":"divine-redesign","authorize":true,"allowedDeploymentUrl":"https://grateful-pelican-605.convex.cloud"}'
 *
 * The locked counts exceed a single safe Convex transaction, so the migration
 * is bounded and resumable: every invocation re-checks the deployment guard,
 * processes a bounded batch, and returns `done: false` while work remains.
 * The operator re-runs the same command until it reports `done: true`; every
 * stage is a stable-key upsert, so a re-run never duplicates rooms, slots,
 * links, or resources.
 *
 * Stages:
 * 1. Ensure the Koningshof hotel (`NH Eindhoven Conference Centre Koningshof`,
 *    city `Veldhoven`) and its event link exist once.
 * 2. Upsert the eleven event resources (ten locked room resources + the cot
 *    resource) from the locked counts and remove stale room resources that
 *    reference non-locked room types.
 * 3. Materialize physical rooms from the room-resource counts and mixed,
 *    assignable slots (one per room bed) with deterministic labels and
 *    stable-key checks. New IDs never come from the old hotel's physical rows.
 * 4. Before ANY old-inventory deletion, collect the old Holiday Inn Express /
 *    Ibis Styles Almere hotel, room, and slot IDs and fail closed when any
 *    `orderAssignments.slotId` still references one of those old slots
 *    (excluding converted audit rows) — leaving old inventory intact and
 *    reporting the blocking assignment IDs.
 * 5. Only after the complete new inventory exists and the preflight is clear,
 *    delete old slots, old rooms, old event-hotel links, and the two old
 *    hotel rows in bounded batches. Deletion is scoped to the two named
 *    legacy hotels and this event — never a row of another event/hotel.
 *
 * Safety (shared production-deployment guard):
 * - Requires `authorize: true` AND an exactly-matching, explicitly allowed
 *   production deployment URL (`allowedDeploymentUrl`), compared to the
 *   detected `CONVEX_SITE_URL` as a deployment slug — no prefix/suffix
 *   matching, no selector or environment fallback. The guard fails closed
 *   BEFORE any database read or write.
 * - This mutation replaces legacy inventory; rehearse on the sanitized
 *   preview first.
 */

const DEFAULT_SLUG = "divine-redesign"

const HOTEL_NAME = "NH Eindhoven Conference Centre Koningshof"
const HOTEL_CITY = "Veldhoven"
const HOTEL_ADDRESS = "Locht 117, 5504 RM Veldhoven, Netherlands"
const HOTEL_NOTES = "NH Koningshof hotel inventory for Divine Conference."

const ROOM_LABEL_PREFIX = "Koningshof"

const OLD_HOTEL_NAMES = ["Holiday Inn Express", "Ibis Styles Almere"] as const

const COT_RESOURCE_COUNT = 10

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

const ROOM_BATCH = 200
const SLOT_BATCH = 200
const STALE_RESOURCE_BATCH = 100
const DELETE_SLOT_BATCH = 200
const DELETE_ROOM_BATCH = 100
const DELETE_LINK_BATCH = 20
const DELETE_HOTEL_BATCH = 5

export default internalMutation({
  args: {
    /** Event slug to migrate; defaults to the production divine-redesign. */
    slug: v.optional(v.string()),
    /** Explicit production write-authorization marker (required). */
    authorize: v.boolean(),
    /** Allowed production deployment URL for the deployment guard. */
    allowedDeploymentUrl: v.optional(v.string()),
  },
  returns: v.object({
    slug: v.string(),
    eventId: v.string(),
    hotelId: v.string(),
    hotelCreated: v.number(),
    hotelUpdated: v.number(),
    eventHotelLinked: v.number(),
    resourcesCreated: v.number(),
    resourcesUpdated: v.number(),
    staleResourcesRemoved: v.number(),
    staleResourcesRemaining: v.number(),
    roomsCreated: v.number(),
    slotsCreated: v.number(),
    roomsRemaining: v.number(),
    slotsRemaining: v.number(),
    oldSlotsDeleted: v.number(),
    oldRoomsDeleted: v.number(),
    oldLinksDeleted: v.number(),
    oldHotelsDeleted: v.number(),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    // Production-deployment guard: shared fail-closed check runs BEFORE any
    // database read/write (re-checked on every resumable invocation).
    assertProductionDeployment({
      authorize: args.authorize,
      allowedDeploymentUrl: args.allowedDeploymentUrl,
      operation: "Koningshof inventory migration",
    })

    const slug = args.slug?.trim() || DEFAULT_SLUG

    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()
    if (!event) {
      throw new Error(`Event with slug '${slug}' not found`)
    }

    // -------------------------------------------------------------------
    // Stage 1: Koningshof hotel + event link exist once.
    // -------------------------------------------------------------------
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
        notes: HOTEL_NOTES,
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

    let eventHotelLinked = 0
    const existingHotelLink = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", String(event._id)).eq("hotelId", String(hotel._id))
      )
      .take(2)
    if (!existingHotelLink[0]) {
      await ctx.db.insert("accommodationEventHotels", {
        eventId: String(event._id),
        hotelId: String(hotel._id),
      })
      eventHotelLinked = 1
    }

    // -------------------------------------------------------------------
    // Stage 2: locked room types must exist (Step 0/1 prerequisite), then
    // upsert the eleven event resources and remove stale room resources.
    // -------------------------------------------------------------------
    const lockedRoomTypes = new Map<string, Doc<"accommodationRoomTypes">>()
    for (const resource of ROOM_RESOURCES) {
      const roomType = await ctx.db
        .query("accommodationRoomTypes")
        .withIndex("label", (q) => q.eq("label", resource.label))
        .first()
      if (!roomType) {
        throw new Error(
          `ROOM_TYPE_MISSING: Room type '${resource.label}' not found; run the Step 0/1 migration first.`
        )
      }
      lockedRoomTypes.set(resource.label, roomType)
    }

    const existingResources = await ctx.db
      .query("eventAccommodationResources")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .take(200)
    const roomResourceByTypeId = new Map<
      string,
      Doc<"eventAccommodationResources">
    >()
    let existingCotResource: Doc<"eventAccommodationResources"> | null = null
    for (const row of existingResources) {
      if (row.kind === "room" && row.roomTypeId) {
        roomResourceByTypeId.set(String(row.roomTypeId), row)
      } else if (row.kind === "cot") {
        existingCotResource = row
      }
    }

    let resourcesCreated = 0
    let resourcesUpdated = 0
    for (const resource of ROOM_RESOURCES) {
      const roomType = lockedRoomTypes.get(resource.label)!
      const existing = roomResourceByTypeId.get(String(roomType._id))
      if (existing) {
        if (existing.count !== resource.count) {
          await ctx.db.patch("eventAccommodationResources", existing._id, {
            count: resource.count,
          })
          resourcesUpdated += 1
        }
      } else {
        await ctx.db.insert("eventAccommodationResources", {
          eventId: event._id,
          kind: "room",
          roomTypeId: roomType._id,
          count: resource.count,
        })
        resourcesCreated += 1
      }
    }
    if (existingCotResource) {
      if (existingCotResource.count !== COT_RESOURCE_COUNT) {
        await ctx.db.patch(
          "eventAccommodationResources",
          existingCotResource._id,
          { count: COT_RESOURCE_COUNT }
        )
        resourcesUpdated += 1
      }
    } else {
      await ctx.db.insert("eventAccommodationResources", {
        eventId: event._id,
        kind: "cot",
        count: COT_RESOURCE_COUNT,
      })
      resourcesCreated += 1
    }

    // Remove stale room resources (this event only) that reference room
    // types outside the locked set, so the event converges to the exact
    // locked resource counts.
    const lockedRoomTypeIds = new Set(
      Array.from(lockedRoomTypes.values()).map((roomType) =>
        String(roomType._id)
      )
    )
    let staleResourcesRemoved = 0
    let staleResourcesRemaining = 0
    const staleResources = existingResources.filter(
      (row) =>
        row.kind === "room" &&
        row.roomTypeId !== undefined &&
        !lockedRoomTypeIds.has(String(row.roomTypeId))
    )
    for (const row of staleResources) {
      if (staleResourcesRemoved < STALE_RESOURCE_BATCH) {
        await ctx.db.delete("eventAccommodationResources", row._id)
        staleResourcesRemoved += 1
      } else {
        staleResourcesRemaining += 1
      }
    }

    // -------------------------------------------------------------------
    // Stage 3: materialize rooms and mixed/assignable slots with
    // deterministic labels and stable-key checks (bounded batches).
    // -------------------------------------------------------------------
    const existingRooms = await ctx.db
      .query("accommodationRooms")
      .withIndex("hotelId_label", (q) => q.eq("hotelId", hotel._id))
      .take(2000)
    const existingRoomLabels = new Set(existingRooms.map((room) => room.label))

    let roomsCreated = 0
    let roomsRemaining = 0
    for (const resource of ROOM_RESOURCES) {
      const roomType = lockedRoomTypes.get(resource.label)!
      for (let index = 1; index <= resource.count; index += 1) {
        const label = `${ROOM_LABEL_PREFIX} ${resource.label} ${String(
          index
        ).padStart(3, "0")}`
        if (existingRoomLabels.has(label)) {
          continue
        }
        if (roomsCreated < ROOM_BATCH) {
          await ctx.db.insert("accommodationRooms", {
            hotelId: String(hotel._id),
            roomTypeId: String(roomType._id),
            label,
            capacity: roomType.defaultCapacity,
          })
          roomsCreated += 1
          existingRoomLabels.add(label)
        } else {
          roomsRemaining += 1
        }
      }
    }

    let slotsCreated = 0
    let slotsRemaining = 0
    if (roomsRemaining === 0) {
      const existingSlots = await ctx.db
        .query("accommodationSlots")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .take(4000)
      const existingSlotLabels = new Set(
        existingSlots.map((slot) => slot.slotLabel)
      )
      const roomTypeById = new Map(
        Array.from(lockedRoomTypes.values()).map((roomType) => [
          String(roomType._id),
          roomType,
        ])
      )
      for (const room of existingRooms) {
        const roomType = room.roomTypeId
          ? roomTypeById.get(String(room.roomTypeId))
          : undefined
        const capacity = roomType?.defaultCapacity ?? room.capacity ?? 1
        for (let bed = 1; bed <= capacity; bed += 1) {
          const label = `${room.label} - bed ${String(bed).padStart(2, "0")}`
          if (existingSlotLabels.has(label)) {
            continue
          }
          if (slotsCreated < SLOT_BATCH) {
            await ctx.db.insert("accommodationSlots", {
              eventId: event._id,
              hotelId: hotel._id,
              roomId: room._id,
              slotLabel: label,
              genderPolicy: "mixed",
              isAssignable: true,
              updatedAt: Date.now(),
            })
            slotsCreated += 1
            existingSlotLabels.add(label)
          } else {
            slotsRemaining += 1
          }
        }
      }
    }

    // -------------------------------------------------------------------
    // Stage 4/5: old-inventory preflight (fail closed on any reference) and
    // bounded deletion — only after the complete new inventory exists.
    // -------------------------------------------------------------------
    let oldSlotsDeleted = 0
    let oldRoomsDeleted = 0
    let oldLinksDeleted = 0
    let oldHotelsDeleted = 0

    const oldHotels: Array<Doc<"accommodationHotels">> = []
    for (const name of OLD_HOTEL_NAMES) {
      const hotelRow = await ctx.db
        .query("accommodationHotels")
        .withIndex("name", (q) => q.eq("name", name))
        .first()
      if (hotelRow) {
        oldHotels.push(hotelRow)
      }
    }
    const oldHotelIds = new Set(oldHotels.map((row) => String(row._id)))

    const oldRooms: Array<Doc<"accommodationRooms">> = []
    for (const oldHotel of oldHotels) {
      const rows = await ctx.db
        .query("accommodationRooms")
        .withIndex("hotelId_label", (q) => q.eq("hotelId", oldHotel._id))
        .take(4000)
      oldRooms.push(...rows)
    }
    const oldRoomIds = new Set(oldRooms.map((row) => String(row._id)))

    const eventSlots = await ctx.db
      .query("accommodationSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .take(4000)
    const oldSlots = eventSlots.filter(
      (slot) =>
        oldRoomIds.has(String(slot.roomId)) ||
        oldHotelIds.has(String(slot.hotelId))
    )

    const oldEventLinks = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", String(event._id))
      )
      .take(200)
    const oldLinksForOldHotels = oldEventLinks.filter((link) =>
      oldHotelIds.has(String(link.hotelId))
    )

    const newInventoryComplete =
      roomsRemaining === 0 && slotsRemaining === 0

    // The preflight + deletion run only in an invocation that performed NO
    // materialization: when the fail-closed preflight throws, the throw
    // rolls back the current transaction, so materialization done in the
    // same transaction must never be discarded. Deferred deletion keeps the
    // completed new inventory persisted and aborts before touching old rows.
    if (
      newInventoryComplete &&
      staleResourcesRemaining === 0 &&
      roomsCreated === 0 &&
      slotsCreated === 0
    ) {
      // Fail closed BEFORE deleting anything when any ACTIVE assignment
      // (pending/undefined/confirmed/declined) still references an old slot.
      // `converted` rows are inert audit rows (their rooming intent now lives
      // in the backfilled accommodation preferences) and deliberately do NOT
      // block the cleanup.
      const blockingAssignmentIds: Array<string> = []
      for (const slot of oldSlots) {
        const referencing = await ctx.db
          .query("orderAssignments")
          .withIndex("by_slotId", (q) => q.eq("slotId", slot._id))
          .take(100)
        for (const assignment of referencing) {
          if (assignment.status === "converted") {
            continue
          }
          blockingAssignmentIds.push(String(assignment._id))
          if (blockingAssignmentIds.length >= 100) {
            break
          }
        }
        if (blockingAssignmentIds.length >= 100) {
          break
        }
      }
      if (blockingAssignmentIds.length > 0) {
        throw new Error(
          `OLD_SLOT_REFERENCED: ${blockingAssignmentIds.length} assignment(s) still reference legacy inventory; refusing to delete old accommodation. Blocking assignment IDs: ${blockingAssignmentIds.join(", ")}`
        )
      }

      // Bounded deletion in dependency order: slots, rooms, links, hotels.
      if (oldSlots.length > 0) {
        for (const slot of oldSlots.slice(0, DELETE_SLOT_BATCH)) {
          await ctx.db.delete("accommodationSlots", slot._id)
        }
        oldSlotsDeleted = Math.min(oldSlots.length, DELETE_SLOT_BATCH)
      } else if (oldRooms.length > 0) {
        for (const room of oldRooms.slice(0, DELETE_ROOM_BATCH)) {
          await ctx.db.delete("accommodationRooms", room._id)
        }
        oldRoomsDeleted = Math.min(oldRooms.length, DELETE_ROOM_BATCH)
      } else if (oldLinksForOldHotels.length > 0) {
        for (const link of oldLinksForOldHotels.slice(0, DELETE_LINK_BATCH)) {
          await ctx.db.delete("accommodationEventHotels", link._id)
        }
        oldLinksDeleted = Math.min(
          oldLinksForOldHotels.length,
          DELETE_LINK_BATCH
        )
      } else if (oldHotels.length > 0) {
        for (const oldHotel of oldHotels.slice(0, DELETE_HOTEL_BATCH)) {
          await ctx.db.delete("accommodationHotels", oldHotel._id)
        }
        oldHotelsDeleted = Math.min(oldHotels.length, DELETE_HOTEL_BATCH)
      }
    }

    // Re-collect the event links after any deletion this invocation may have
    // performed so `done` reflects the true remaining state.
    const linksAfter = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", String(event._id))
      )
      .take(200)
    const oldLinksRemaining = linksAfter.filter((link) =>
      oldHotelIds.has(String(link.hotelId))
    ).length

    const oldHotelsRemaining = await (async () => {
      let remaining = 0
      for (const name of OLD_HOTEL_NAMES) {
        const row = await ctx.db
          .query("accommodationHotels")
          .withIndex("name", (q) => q.eq("name", name))
          .first()
        if (row) {
          remaining += 1
        }
      }
      return remaining
    })()

    const done =
      roomsRemaining === 0 &&
      slotsRemaining === 0 &&
      staleResourcesRemaining === 0 &&
      oldSlots.length - oldSlotsDeleted <= 0 &&
      oldRooms.length - oldRoomsDeleted <= 0 &&
      oldLinksRemaining === 0 &&
      oldHotelsRemaining === 0

    return {
      slug,
      eventId: String(event._id),
      hotelId: String(hotel._id),
      hotelCreated,
      hotelUpdated,
      eventHotelLinked,
      resourcesCreated,
      resourcesUpdated,
      staleResourcesRemoved,
      staleResourcesRemaining,
      roomsCreated,
      slotsCreated,
      roomsRemaining,
      slotsRemaining,
      oldSlotsDeleted,
      oldRoomsDeleted,
      oldLinksDeleted,
      oldHotelsDeleted,
      done,
    }
  },
})
