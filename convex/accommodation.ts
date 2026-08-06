import { internalMutation, query, mutation } from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import { requireIdentity } from "./auth"
import {
  buildAccommodationPriceSnapshot,
  isCompleteAccommodationPriceSnapshot,
  type AccommodationPriceSnapshot,
} from "../lib/domain/finance/accommodation-amounts"
import {
  loadOrderAmountDueBreakdowns,
  loadOrderAttendeePaymentBreakdowns,
} from "./finance"

type DocTables = {
  accommodationHotels: Doc<"accommodationHotels">
  accommodationRoomTypes: Doc<"accommodationRoomTypes">
  accommodationRooms: Doc<"accommodationRooms">
  orderAttendees: Doc<"orderAttendees">
  ticketTailorAttendees: Doc<"ticketTailorAttendees">
}

function normalizeDocId<TableName extends keyof DocTables>(
  ctx: {
    db: {
      normalizeId: <T extends keyof DocTables>(
        tableName: T,
        id: string
      ) => Id<T> | null
    }
  },
  tableName: TableName,
  id: string,
  errorMessage: string
) {
  const normalizedId = ctx.db.normalizeId(tableName, id)

  if (!normalizedId) {
    throw new Error(errorMessage)
  }

  return normalizedId
}

async function getAccommodationHotelByStringId(ctx: any, hotelId: string) {
  const normalizedHotelId = ctx.db.normalizeId("accommodationHotels", hotelId)
  return normalizedHotelId
    ? await ctx.db.get("accommodationHotels", normalizedHotelId)
    : null
}

async function getAccommodationRoomByStringId(ctx: any, roomId: string) {
  const normalizedRoomId = ctx.db.normalizeId("accommodationRooms", roomId)
  return normalizedRoomId
    ? await ctx.db.get("accommodationRooms", normalizedRoomId)
    : null
}

async function getAccommodationRoomTypeByStringId(
  ctx: any,
  roomTypeId: string
) {
  const normalizedRoomTypeId = ctx.db.normalizeId(
    "accommodationRoomTypes",
    roomTypeId
  )
  return normalizedRoomTypeId
    ? await ctx.db.get("accommodationRoomTypes", normalizedRoomTypeId)
    : null
}

async function getAttendeeByStringId(ctx: any, attendeeId: string) {
  const normalizedAttendeeId = ctx.db.normalizeId("orderAttendees", attendeeId)
  return normalizedAttendeeId
    ? await ctx.db.get("orderAttendees", normalizedAttendeeId)
    : null
}

function normalizeOptionalString(
  value: string | null | undefined
): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function getAttendeeLocation(customAnswers: unknown): string | null {
  if (!customAnswers || typeof customAnswers !== "object") {
    return null
  }

  const location = (customAnswers as { location?: unknown }).location
  return typeof location === "string" ? normalizeOptionalString(location) : null
}

function hasPriorityAttendee(
  allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null | undefined
): boolean {
  return allocationPriority === "CRITICAL" || allocationPriority === "HIGH"
}

/**
 * Normalizes lowercase gender values (from core orderAttendees.gender) to uppercase display values.
 * Core table stores lowercase ("male"|"female"|"mixed"|"unknown"), TT extension stores uppercase ("MALE"|"FEMALE"|"MIXED"|"UNKNOWN").
 */
function normalizeGender(
  gender: "male" | "female" | "mixed" | "unknown"
): "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" {
  const mapping: Record<string, "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"> = {
    male: "MALE",
    female: "FEMALE",
    mixed: "MIXED",
    unknown: "UNKNOWN",
  }
  return mapping[gender] ?? "UNKNOWN"
}

function allocationPriorityRank(
  priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null | undefined
): number {
  const ranks: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 1,
    NORMAL: 2,
    LOW: 3,
  }
  return ranks[priority ?? "NORMAL"] ?? 2
}

/**
 * Primary allocation rank (Phase 44): paid first, partial second, unpaid
 * last. A missing/unknown projection sorts after unpaid so a neutral attendee
 * is never silently promoted ahead of a real state.
 */
function paymentStateRank(
  state: "paid" | "partial" | "unpaid" | null | undefined
): number {
  const ranks: Record<string, number> = {
    paid: 0,
    partial: 1,
    unpaid: 2,
  }
  return state ? (ranks[state] ?? 3) : 3
}

export function attendeeMatchesSignalFilters(input: {
  attendee: {
    customAnswers?: unknown
    genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
    allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
  }
  attendeeFamilyGroupId: string | null
  filters: {
    genderType?: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"
    familyGroupId?: string
    location?: string
    allocationPriority?: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
    hasPriority?: boolean
  }
}): boolean {
  if (
    input.filters.genderType &&
    input.attendee.genderType !== input.filters.genderType
  ) {
    return false
  }

  if (
    input.filters.familyGroupId &&
    input.attendeeFamilyGroupId !== input.filters.familyGroupId
  ) {
    return false
  }

  const normalizedLocationFilter = normalizeOptionalString(
    input.filters.location
  )
  if (normalizedLocationFilter) {
    const attendeeLocation = getAttendeeLocation(input.attendee.customAnswers)
    if (
      !attendeeLocation ||
      attendeeLocation.toLowerCase() !== normalizedLocationFilter.toLowerCase()
    ) {
      return false
    }
  }

  if (
    input.filters.allocationPriority &&
    input.attendee.allocationPriority !== input.filters.allocationPriority
  ) {
    return false
  }

  if (
    input.filters.hasPriority !== undefined &&
    hasPriorityAttendee(input.attendee.allocationPriority ?? null) !==
      input.filters.hasPriority
  ) {
    return false
  }

  return true
}

export function hasFamilySignal(input: {
  attendeeId: string
  orderId: string | null
  attendeeFamilyGroupId: string | null
  attendeeCountByOrderId: Map<string, number>
}): boolean {
  if (input.attendeeFamilyGroupId) {
    return true
  }

  return (
    (input.attendeeCountByOrderId.get(input.orderId ?? input.attendeeId) ?? 0) >
    1
  )
}

export const recalculateRoomOccupancy = internalMutation({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    const roomId = normalizeDocId(
      ctx,
      "accommodationRooms",
      args.roomId,
      "Room not found"
    )
    const room = await ctx.db.get("accommodationRooms", roomId)

    if (!room) {
      throw new Error("Room not found")
    }

    // Bounded: one room has limited occupants
    const occupants = await ctx.db
      .query("orderAttendees")
      .withIndex("by_assignedRoomId", (q) =>
        q.eq("assignedRoomId", args.roomId)
      )
      .take(100)

    await ctx.db.patch("accommodationRooms", roomId, {
      occupiedBeds: occupants.length,
    })

    return { ok: true, occupiedBeds: occupants.length }
  },
})

export const getRoomAllocationBoard = query({
  args: {
    eventId: v.optional(v.string()),
    hotelId: v.optional(v.string()),
    roomTypeId: v.optional(v.string()),
    genderType: v.optional(
      v.union(
        v.literal("MALE"),
        v.literal("FEMALE"),
        v.literal("MIXED"),
        v.literal("UNKNOWN")
      )
    ),
    familyGroupId: v.optional(v.string()),
    location: v.optional(v.string()),
    allocationPriority: v.optional(
      v.union(
        v.literal("CRITICAL"),
        v.literal("HIGH"),
        v.literal("NORMAL"),
        v.literal("LOW")
      )
    ),
    hasPriority: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const eventId = args.eventId

    // Get provider event IDs for this canonical event via eventSources
    let providerEventIds: string[] = []
    let eventSourceMap = new Map<string, string>() // providerEventId -> canonical eventId

    if (eventId) {
      const eventSources = await ctx.db
        .query("eventSources")
        .withIndex("by_eventId", (q) =>
          q.eq("eventId", eventId as Id<"events">)
        )
        .take(50)

      for (const source of eventSources) {
        providerEventIds.push(source.externalEventId)
        eventSourceMap.set(source.externalEventId, eventId)
      }

      // Also check if there's a direct provider event ID match (backward compat)
      const providerEvent = await ctx.db
        .query("ticketTailorEvents")
        .withIndex("providerEventId", (q) => q.eq("providerEventId", eventId))
        .first()

      if (providerEvent && !providerEventIds.includes(eventId)) {
        providerEventIds.push(eventId)
        eventSourceMap.set(eventId, eventId)
      }
    }

    const scopedHotelIds = eventId
      ? (
          await ctx.db
            .query("accommodationEventHotels")
            .withIndex("eventId_hotelId", (q) => q.eq("eventId", eventId))
            .take(200)
        ).map((eh) => eh.hotelId)
      : null

    const [
      events,
      canonicalEvents,
      hotels,
      roomTypes,
      rooms,
      allOrderAttendees,
      familyMembers,
      accommodationSlotDocs,
      allOrders,
    ] = await Promise.all([
      ctx.db.query("ticketTailorEvents").take(200),
      ctx.db.query("events").take(200),
      ctx.db.query("accommodationHotels").take(200),
      ctx.db.query("accommodationRoomTypes").take(100),
      ctx.db.query("accommodationRooms").take(500),
      ctx.db.query("orderAttendees").take(2000),
      ctx.db.query("attendeeFamilyMembers").take(2000),
      ctx.db.query("accommodationSlots").take(1000),
      eventId
        ? ctx.db
            .query("orders")
            .withIndex("by_eventId", (q) =>
              q.eq("eventId", eventId as Id<"events">)
            )
            .take(500)
        : ctx.db.query("orders").take(500),
    ])

    const normalizedLocationFilter = normalizeOptionalString(args.location)

    const internalCanonicalEvents = canonicalEvents.filter(
      (event) => event.primarySourceKind === "internal"
    )
    const internalEventIds = new Set(
      internalCanonicalEvents.map((event) => String(event._id))
    )
    const scopedOrders = allOrders.filter((order) =>
      internalEventIds.has(String(order.eventId))
    )

    // Build order lookup for event scoping
    const orderById = new Map(scopedOrders.map((o) => [o._id as string, o]))

    // Filter attendees to those belonging to scoped orders
    const scopedAttendees = allOrderAttendees.filter((a) => {
      const order = orderById.get(a.orderId as string)
      if (!order) return false
      if (eventId && order.eventId !== eventId) return false
      return true
    })

    // --- Canonical payment-state projection (Phase 44) ---
    // Group the scoped attendees by order once and load the canonical
    // per-attendee payment breakdown exactly once for the scoped order set.
    // The board never reads orders.status and never queries payments inside
    // the attendee mapping loops below; rows consume the precomputed map.
    const attendeeIdsByOrderId = new Map<string, string[]>()
    for (const attendee of scopedAttendees) {
      const orderKey = String(attendee.orderId)
      const attendeeIds = attendeeIdsByOrderId.get(orderKey) ?? []
      attendeeIds.push(String(attendee._id))
      attendeeIdsByOrderId.set(orderKey, attendeeIds)
    }

    const dueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      ctx,
      scopedOrders
    )
    const paymentById = await loadOrderAttendeePaymentBreakdowns({
      ctx,
      orders: scopedOrders,
      dueBreakdownsByOrderId,
      attendeeIdsByOrderId,
    })

    const attendeeFamilyGroupByAttendeeId = new Map<string, string>()
    for (const familyMember of familyMembers) {
      if (!attendeeFamilyGroupByAttendeeId.has(familyMember.attendeeId)) {
        attendeeFamilyGroupByAttendeeId.set(
          familyMember.attendeeId,
          familyMember.familyGroupId
        )
      }
    }

    const attendeeCountByOrderId = new Map<string, number>()
    for (const attendee of scopedAttendees) {
      attendeeCountByOrderId.set(
        attendee.orderId as string,
        (attendeeCountByOrderId.get(attendee.orderId as string) ?? 0) + 1
      )
    }

    // Build pending assignments by room early so room mapping can read it safely.
    const pendingAssignmentsByRoom = new Map<
      string,
      Array<{
        assignmentId: string
        attendeeId: string
        attendeeName: string | null
        attendeeEmail: string | null
        assignmentIntent: "assign" | "skip"
        sortOrder: number
      }>
    >()

    const filteredRooms = rooms.filter((room) => {
      if (scopedHotelIds && !scopedHotelIds.includes(room.hotelId as string))
        return false
      if (args.hotelId && room.hotelId !== args.hotelId) return false
      if (args.roomTypeId && room.roomTypeId !== args.roomTypeId) return false
      return true
    })

    const unassignedAttendees = scopedAttendees.filter((a) => {
      if (a.assignedRoomId) return false
      const attendeeFamilyGroupId =
        attendeeFamilyGroupByAttendeeId.get(a._id) ?? null

      const genderType =
        a.gender === "male"
          ? "MALE"
          : a.gender === "female"
            ? "FEMALE"
            : a.gender === "mixed"
              ? "MIXED"
              : "UNKNOWN"

      if (args.genderType && genderType !== args.genderType) return false
      if (args.familyGroupId && attendeeFamilyGroupId !== args.familyGroupId)
        return false

      const normalizedLocation = normalizeOptionalString(a.location)
      if (
        normalizedLocationFilter &&
        (!normalizedLocation ||
          normalizedLocation.toLowerCase() !==
            normalizedLocationFilter.toLowerCase())
      )
        return false

      if (
        args.allocationPriority &&
        a.allocationPriority !== args.allocationPriority
      )
        return false

      if (
        args.hasPriority !== undefined &&
        hasPriorityAttendee(a.allocationPriority ?? null) !== args.hasPriority
      )
        return false

      return true
    })

    const hotelMap = new Map(hotels.map((h) => [h._id as string, h]))
    const roomTypeMap = new Map(roomTypes.map((rt) => [rt._id as string, rt]))
    const roomById = new Map(rooms.map((room) => [room._id as string, room]))

    // Build mapping from canonical eventId to event info
    const canonicalEventById = new Map(
      internalCanonicalEvents.map((e) => [e._id as string, e])
    )

    const attendeesByRoom: Record<string, typeof scopedAttendees> = {}
    for (const attendee of scopedAttendees) {
      if (attendee.assignedRoomId) {
        if (!attendeesByRoom[attendee.assignedRoomId]) {
          attendeesByRoom[attendee.assignedRoomId] = []
        }
        attendeesByRoom[attendee.assignedRoomId].push(attendee)
      }
    }

    const mappedRooms = filteredRooms.map((room) => {
      const hotel = hotelMap.get(room.hotelId as string)
      const roomType = roomTypeMap.get(room.roomTypeId as string)
      const occupants = (attendeesByRoom[room._id] ?? []).map((a) => {
        const order = orderById.get(a.orderId as string)
        const canonicalEvent = order
          ? canonicalEventById.get(order.eventId as string)
          : null
        const payment = paymentById.get(String(a._id))
        return {
          attendeeId: a._id,
          orderId: order?._id ?? null,
          attendeeName: a.name ?? null,
          attendeeEmail: a.email ?? null,
          providerOrderId: order?.providerOrderId ?? null,
          providerEventId: order?.providerEventId ?? null,
          eventId: canonicalEvent?._id ?? null,
          eventName: canonicalEvent?.title ?? null,
          ticketTypeLabel: null,
          paymentState: payment?.paymentState ?? null,
          amountDueMinor: payment?.amountDueMinor ?? null,
          paidAmountMinor: payment?.paidAmountMinor ?? null,
        }
      })
      const occupiedBeds = occupants.length
      const availableBeds = Math.max(0, room.capacity - occupiedBeds)
      const availability =
        occupiedBeds === 0
          ? "empty"
          : occupiedBeds >= room.capacity
            ? "full"
            : "available"

      return {
        id: room._id,
        label: room.label,
        capacity: room.capacity,
        occupiedBeds,
        availableBeds,
        availability,
        notes: room.notes ?? null,
        hotel: hotel
          ? { id: hotel._id, name: hotel.name, city: hotel.city ?? null }
          : undefined,
        roomType: roomType
          ? {
              id: roomType._id,
              label: roomType.label,
              defaultCapacity: roomType.defaultCapacity,
            }
          : undefined,
        occupants,
        pendingAssignments: pendingAssignmentsByRoom.get(room._id) ?? [],
      }
    })

    const mappedUnassignedAttendees = unassignedAttendees.map((a) => {
      const order = orderById.get(a.orderId as string)
      const canonicalEvent = order
        ? canonicalEventById.get(order.eventId as string)
        : null
      const attendeeFamilyGroupId =
        attendeeFamilyGroupByAttendeeId.get(a._id) ?? null
      const payment = paymentById.get(String(a._id))
      return {
        attendeeId: a._id,
        orderId: order?._id ?? null,
        attendeeName: a.name ?? null,
        attendeeEmail: a.email ?? null,
        providerOrderId: order?.providerOrderId ?? null,
        providerEventId: order?.providerEventId ?? null,
        eventId: canonicalEvent?._id ?? null,
        eventName: canonicalEvent?.title ?? null,
        ticketTypeLabel: null,
        allocatedRoomTypeId: (a.allocatedRoomTypeId as string) ?? null,
        genderType:
          a.gender === "male"
            ? "MALE"
            : a.gender === "female"
              ? "FEMALE"
              : a.gender === "mixed"
                ? "MIXED"
                : "UNKNOWN",
        allocationPriority: a.allocationPriority ?? null,
        location: a.location ?? null,
        remarks: null,
        roommatePreference: a.roommatePreference ?? null,
        roommateAvoid: a.roommateAvoid ?? null,
        hasFamily: hasFamilySignal({
          attendeeId: a._id,
          orderId: order?._id ?? null,
          attendeeFamilyGroupId,
          attendeeCountByOrderId,
        }),
        paymentState: payment?.paymentState ?? null,
        amountDueMinor: payment?.amountDueMinor ?? null,
        paidAmountMinor: payment?.paidAmountMinor ?? null,
      }
    })

    // Paid-first ordering (Phase 44): payment state is the primary rank, then
    // the existing allocation priority, then stable group/name/id tie-breakers.
    mappedUnassignedAttendees.sort((a, b) => {
      const aPaymentRank = paymentStateRank(a.paymentState)
      const bPaymentRank = paymentStateRank(b.paymentState)
      if (aPaymentRank !== bPaymentRank) return aPaymentRank - bPaymentRank

      const aPriorityRank = allocationPriorityRank(a.allocationPriority)
      const bPriorityRank = allocationPriorityRank(b.allocationPriority)
      if (aPriorityRank !== bPriorityRank) return aPriorityRank - bPriorityRank

      const orderComparison = (a.orderId ?? "").localeCompare(b.orderId ?? "")
      if (orderComparison !== 0) return orderComparison

      const nameComparison = (a.attendeeName ?? "").localeCompare(
        b.attendeeName ?? ""
      )
      if (nameComparison !== 0) return nameComparison

      return a.attendeeId.localeCompare(b.attendeeId)
    })

    // --- Canonical submission queue rows ---
    const submissionIds = scopedOrders.map((s) => s._id)

    const [orderAttendeesList, orderAssignmentsList] = submissionIds.length
      ? await Promise.all([
          Promise.all(
            submissionIds.map((sid) =>
              ctx.db
                .query("orderAttendees")
                .withIndex("by_orderId", (q) =>
                  q.eq("orderId", sid as Id<"orders">)
                )
                .take(100)
            )
          ).then((results) => results.flat()),
          Promise.all(
            submissionIds.map((sid) =>
              ctx.db
                .query("orderAssignments")
                .withIndex("by_orderId", (q) =>
                  q.eq("orderId", sid as Id<"orders">)
                )
                .take(100)
            )
          ).then((results) => results.flat()),
        ])
      : [[], []]

    // orderById already declared above

    const slotById = new Map(
      accommodationSlotDocs.map((s) => [s._id as string, s])
    )

    // Build mapping from slotId to roomId
    const slotIdToRoomId = new Map<string, string>()
    for (const slot of accommodationSlotDocs) {
      slotIdToRoomId.set(slot._id as string, slot.roomId as string)
    }

    const attendeeById = new Map(
      orderAttendeesList.map((attendee) => [attendee._id as string, attendee])
    )

    const buyerSuggestions = orderAssignmentsList
      .filter((assignment) => {
        const assignmentAny = assignment as { status?: string }
        return !assignmentAny.status || assignmentAny.status === "pending"
      })
      .map((assignment) => {
        const roomId = slotIdToRoomId.get(assignment.slotId as string)
        const room = roomId ? roomById.get(roomId) : null
        const hotel = room ? hotelMap.get(room.hotelId as string) : null
        const attendee = attendeeById.get(assignment.attendeeId as string)
        const payment = paymentById.get(String(assignment.attendeeId))

        return {
          assignmentId: assignment._id as string,
          attendeeId: assignment.attendeeId as string,
          attendeeName: attendee?.name ?? null,
          attendeeEmail: attendee?.email ?? null,
          roomId: room?._id ?? null,
          roomLabel: room?.label ?? null,
          hotelName: hotel?.name ?? null,
          assignmentIntent: assignment.assignmentIntent,
          sortOrder: assignment.sortOrder,
          paymentState: payment?.paymentState ?? null,
          amountDueMinor: payment?.amountDueMinor ?? null,
          paidAmountMinor: payment?.paidAmountMinor ?? null,
        }
      })
      .sort((a, b) => {
        if ((a.roomLabel ?? "") !== (b.roomLabel ?? "")) {
          return (a.roomLabel ?? "").localeCompare(b.roomLabel ?? "")
        }

        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder
        }

        return (a.attendeeName ?? "").localeCompare(b.attendeeName ?? "")
      })

    // Filter pending assignments: assignmentIntent="assign" and (status is undefined/pending)
    for (const assignment of orderAssignmentsList) {
      const assignmentAny = assignment as any
      const isPending =
        assignment.assignmentIntent === "assign" &&
        (!assignmentAny.status || assignmentAny.status === "pending")

      if (!isPending) continue

      const roomId = slotIdToRoomId.get(assignment.slotId as string)
      if (!roomId) continue

      const attendee = await ctx.db.get(
        "orderAttendees",
        assignment.attendeeId as Id<"orderAttendees">
      )

      const pendingAssignment = {
        assignmentId: assignment._id as string,
        attendeeId: assignment.attendeeId as string,
        attendeeName: attendee?.name ?? null,
        attendeeEmail: attendee?.email ?? null,
        assignmentIntent: assignment.assignmentIntent,
        sortOrder: assignment.sortOrder,
      }

      const existing = pendingAssignmentsByRoom.get(roomId) ?? []
      existing.push(pendingAssignment)
      pendingAssignmentsByRoom.set(roomId, existing)
    }

    const assignmentByAttendeeId = new Map<
      string,
      (typeof orderAssignmentsList)[number]
    >()
    for (const assignment of orderAssignmentsList) {
      assignmentByAttendeeId.set(assignment.attendeeId as string, assignment)
    }

    const submissionQueueRows = orderAttendeesList.map((attendee) => {
      const order = orderById.get(attendee.orderId as string)
      const assignment = assignmentByAttendeeId.get(attendee._id as string)
      const payment = paymentById.get(String(attendee._id))

      let unresolved = false
      let unresolvedReason: string | null = null

      if (!assignment) {
        unresolved = true
        unresolvedReason = "no_assignment_record"
      } else if (assignment.assignmentIntent === "skip") {
        unresolved = true
        unresolvedReason = "skipped_intent"
      } else if (assignment.assignmentIntent === "assign") {
        const slot = slotById.get(assignment.slotId as string)
        if (!slot || !slot.isAssignable) {
          unresolved = true
          unresolvedReason = "slot_not_assignable"
        }
      }

      const genderType = normalizeGender(attendee.gender)

      return {
        attendeeId: `internal-${order?._id ?? "unknown"}-${attendee.attendeeKey}`,
        attendeeName: attendee.name,
        attendeeEmail: attendee.email ?? null,
        source: "internal" as const,
        submissionId: order?._id ?? null,
        bookingRef: order?.bookingRef ?? null,
        submissionNotes: order?.notes ?? null,
        assignmentIntent: assignment?.assignmentIntent ?? null,
        slotId: assignment?.slotId ?? null,
        roommatePreference: attendee.roommatePreference || null,
        roommateAvoid: attendee.roommateAvoid || null,
        dietaryRestrictions: attendee.dietaryRestrictions || null,
        bookerName: order?.bookerName ?? null,
        genderType,
        location: attendee.location || null,
        unresolved,
        unresolvedReason,
        submittedAt: order?.submittedAt ?? null,
        sortOrder: attendee.sortOrder,
        allocationPriority: attendee.allocationPriority ?? null,
        paymentState: payment?.paymentState ?? null,
        amountDueMinor: payment?.amountDueMinor ?? null,
        paidAmountMinor: payment?.paidAmountMinor ?? null,
      }
    })

    const assignedSlotHotelIds = new Set<string>()
    for (const row of submissionQueueRows) {
      if (row.slotId) {
        const slot = slotById.get(row.slotId as string)
        if (slot) {
          assignedSlotHotelIds.add(slot.hotelId as string)
        }
      }
    }

    const missingSlotHotelIds = [...assignedSlotHotelIds].filter(
      (id) => !hotelMap.has(id)
    )
    if (missingSlotHotelIds.length > 0) {
      const extraHotels = await Promise.all(
        missingSlotHotelIds.map((id) =>
          ctx.db.get("accommodationHotels", id as Id<"accommodationHotels">)
        )
      )
      for (const hotel of extraHotels) {
        if (hotel) {
          hotelMap.set(hotel._id as string, hotel)
        }
      }
    }

    // Sort: payment state first (paid/partial/unpaid), then allocation
    // priority (CRITICAL before LOW), then unresolved, then submittedAt,
    // then attendeeId (stable existing tie-breakers preserved).
    submissionQueueRows.sort((a, b) => {
      const aPaymentRank = paymentStateRank(a.paymentState)
      const bPaymentRank = paymentStateRank(b.paymentState)
      if (aPaymentRank !== bPaymentRank) return aPaymentRank - bPaymentRank

      const aPriorityRank = allocationPriorityRank(a.allocationPriority)
      const bPriorityRank = allocationPriorityRank(b.allocationPriority)
      if (aPriorityRank !== bPriorityRank) return aPriorityRank - bPriorityRank

      if (a.unresolved !== b.unresolved) return a.unresolved ? -1 : 1
      const aTime = a.submittedAt ?? 0
      const bTime = b.submittedAt ?? 0
      if (aTime !== bTime) return aTime - bTime
      return a.attendeeId.localeCompare(b.attendeeId)
    })

    const eventHotels = await ctx.db.query("accommodationEventHotels").take(200)
    const eventHotelsByEvent: Record<string, string[]> = {}
    for (const eh of eventHotels) {
      if (!eventHotelsByEvent[eh.eventId]) {
        eventHotelsByEvent[eh.eventId] = []
      }
      eventHotelsByEvent[eh.eventId].push(eh.hotelId)
    }

    return {
      generatedAt: new Date().toISOString(),
      filters: {
        eventId: eventId ?? null,
        search: null,
        hotelId: args.hotelId ?? null,
        roomTypeId: args.roomTypeId ?? null,
        availability: "all" as const,
        genderType: args.genderType ?? null,
        familyGroupId: args.familyGroupId ?? null,
        location: normalizedLocationFilter,
        allocationPriority: args.allocationPriority ?? null,
        hasPriority: args.hasPriority ?? null,
      },
      availableEvents: canonicalEvents
        .filter(
          (e) => e.accommodationEnabled && e.primarySourceKind === "internal"
        )
        .map((e) => ({
          eventId: e._id,
          slug: e.slug,
          name: e.title,
          startsAt: e.startsAt,
        })),
      hotels: hotels
        .filter(
          (h) => !scopedHotelIds || scopedHotelIds.includes(h._id as string)
        )
        .map((h) => ({
          id: h._id,
          name: h.name,
          assignedEventIds: eventHotelsByEvent[h._id] ?? [],
        })),
      roomTypes: roomTypes.map((rt) => ({
        id: rt._id,
        label: rt.label,
        defaultCapacity: rt.defaultCapacity,
      })),
      rooms: mappedRooms,
      buyerSuggestions,
      unassignedAttendees: mappedUnassignedAttendees,
      submissionQueueRows,
      summary: {
        totalRooms: mappedRooms.length,
        emptyRooms: mappedRooms.filter((r) => r.availability === "empty")
          .length,
        availableRooms: mappedRooms.filter(
          (r) => r.availability === "available"
        ).length,
        fullRooms: mappedRooms.filter((r) => r.availability === "full").length,
        totalBeds: mappedRooms.reduce((sum, r) => sum + r.capacity, 0),
        occupiedBeds: mappedRooms.reduce((sum, r) => sum + r.occupiedBeds, 0),
        availableBeds: mappedRooms.reduce((sum, r) => sum + r.availableBeds, 0),
        unassignedAttendeesCount: mappedUnassignedAttendees.length,
      },
    }
  },
})

export const getHotels = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    // Bounded: small number of hotels
    return await ctx.db.query("accommodationHotels").take(200)
  },
})

export const getRoomTypesWithCount = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    // Bounded: small config tables
    const roomTypes = await ctx.db.query("accommodationRoomTypes").take(100)
    const rooms = await ctx.db.query("accommodationRooms").take(500)

    const roomsByType = rooms.reduce(
      (acc, room) => {
        if (!acc[room.roomTypeId]) acc[room.roomTypeId] = []
        acc[room.roomTypeId].push(room)
        return acc
      },
      {} as Record<string, typeof rooms>
    )

    return roomTypes.map((rt) => ({
      ...rt,
      roomCount: roomsByType[rt._id]?.length ?? 0,
    }))
  },
})

export const getRoomsWithDetails = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    // Bounded: config tables capped for inventory view
    const [rooms, hotels, roomTypes, attendees] = await Promise.all([
      ctx.db.query("accommodationRooms").take(500),
      ctx.db.query("accommodationHotels").take(200),
      ctx.db.query("accommodationRoomTypes").take(100),
      ctx.db.query("ticketTailorAttendees").take(2000),
    ])

    const hotelMap = new Map(hotels.map((h) => [h._id as string, h]))
    const roomTypeMap = new Map(roomTypes.map((rt) => [rt._id as string, rt]))

    const occupancyByRoom = new Map<string, number>()
    for (const attendee of attendees) {
      if (attendee.assignedRoomId) {
        occupancyByRoom.set(
          attendee.assignedRoomId,
          (occupancyByRoom.get(attendee.assignedRoomId) ?? 0) + 1
        )
      }
    }

    return rooms.map((room) => ({
      id: room._id,
      label: room.label,
      capacity: room.capacity,
      occupiedBeds: occupancyByRoom.get(room._id) ?? 0,
      notes: room.notes,
      hotel: hotelMap.get(room.hotelId as string),
      roomType: roomTypeMap.get(room.roomTypeId as string),
    }))
  },
})

export const listAccommodationInventory = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    // Bounded: config tables capped for inventory view
    const [canonicalEvents, hotels, roomTypes, rooms, attendees] =
      await Promise.all([
        ctx.db.query("events").take(200),
        ctx.db.query("accommodationHotels").take(200),
        ctx.db.query("accommodationRoomTypes").take(100),
        ctx.db.query("accommodationRooms").take(500),
        ctx.db.query("orderAttendees").take(2000),
      ])

    const eventHotels = await ctx.db.query("accommodationEventHotels").take(200)

    const eventHotelsByHotel = eventHotels.reduce(
      (acc, eh) => {
        if (!acc[eh.hotelId]) acc[eh.hotelId] = []
        acc[eh.hotelId].push(eh.eventId)
        return acc
      },
      {} as Record<string, string[]>
    )

    const roomsByHotel = rooms.reduce(
      (acc, room) => {
        if (!acc[room.hotelId]) acc[room.hotelId] = []
        acc[room.hotelId].push(room)
        return acc
      },
      {} as Record<string, typeof rooms>
    )

    const roomsByType = roomTypes.reduce(
      (acc, rt) => {
        acc[rt._id] = rooms.filter((r) => r.roomTypeId === rt._id)
        return acc
      },
      {} as Record<string, typeof rooms>
    )

    const roomTypeMap = new Map(roomTypes.map((rt) => [rt._id as string, rt]))
    const hotelMap = new Map(hotels.map((h) => [h._id as string, h]))

    const occupancyByRoom = new Map<string, number>()
    for (const attendee of attendees) {
      if (attendee.assignedRoomId) {
        occupancyByRoom.set(
          attendee.assignedRoomId,
          (occupancyByRoom.get(attendee.assignedRoomId) ?? 0) + 1
        )
      }
    }

    return {
      availableEvents: canonicalEvents
        .filter(
          (e) => e.accommodationEnabled && e.primarySourceKind === "internal"
        )
        .map((e) => ({
          eventId: e._id,
          slug: e.slug,
          name: e.title,
          startsAt: e.startsAt,
        })),
      hotels: hotels.map((hotel) => ({
        id: hotel._id,
        name: hotel.name,
        city: hotel.city ?? null,
        notes: hotel.notes ?? null,
        roomCount: roomsByHotel[hotel._id]?.length ?? 0,
        assignedEventIds: eventHotelsByHotel[hotel._id] ?? [],
      })),
      roomTypes: roomTypes.map((rt) => ({
        id: rt._id,
        label: rt.label,
        defaultCapacity: rt.defaultCapacity,
        notes: rt.notes ?? null,
        roomCount: roomsByType[rt._id]?.length ?? 0,
      })),
      rooms: rooms.map((room) => {
        const hotel = hotelMap.get(room.hotelId as string)
        const roomType = roomTypeMap.get(room.roomTypeId as string)
        const occupied = occupancyByRoom.get(room._id) ?? 0
        return {
          id: room._id,
          label: room.label,
          capacity: room.capacity,
          occupiedBeds: occupied,
          notes: room.notes,
          hotel: hotel ? { id: hotel._id, name: hotel.name } : undefined,
          roomType: roomType
            ? {
                id: roomType._id,
                label: roomType.label,
                defaultCapacity: roomType.defaultCapacity,
              }
            : undefined,
        }
      }),
      summary: {
        totalRooms: rooms.length,
        emptyRooms: rooms.filter((r) => (occupancyByRoom.get(r._id) ?? 0) === 0)
          .length,
        availableRooms: rooms.filter(
          (r) => (occupancyByRoom.get(r._id) ?? 0) < r.capacity
        ).length,
        fullRooms: rooms.filter(
          (r) => (occupancyByRoom.get(r._id) ?? 0) >= r.capacity
        ).length,
        unassignedAttendees: 0,
      },
    }
  },
})

export const getHotelById = query({
  args: { hotelId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    return await getAccommodationHotelByStringId(ctx, args.hotelId)
  },
})

export const getRooms = query({
  args: {
    hotelId: v.optional(v.string()),
    roomTypeId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    if (args.hotelId) {
      // Bounded: one hotel has limited rooms
      const rooms = await ctx.db
        .query("accommodationRooms")
        .withIndex("hotelId_label", (q) => q.eq("hotelId", args.hotelId!))
        .take(200)
      return rooms
    }
    // Bounded: capped for inventory view
    return await ctx.db.query("accommodationRooms").take(500)
  },
})

export const getRoomById = query({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    return await getAccommodationRoomByStringId(ctx, args.roomId)
  },
})

export const getRoomTypes = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    // Bounded: small config table
    return await ctx.db.query("accommodationRoomTypes").take(200)
  },
})

export const getRoomTypeById = query({
  args: { roomTypeId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    return await getAccommodationRoomTypeByStringId(ctx, args.roomTypeId)
  },
})

export const createHotel = mutation({
  args: {
    name: v.string(),
    city: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const id = await ctx.db.insert("accommodationHotels", args)
    return id
  },
})

export const createRoom = mutation({
  args: {
    hotelId: v.string(),
    roomTypeId: v.string(),
    label: v.string(),
    capacity: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const id = await ctx.db.insert("accommodationRooms", {
      ...args,
    })
    return id
  },
})

export const createRooms = mutation({
  args: {
    hotelId: v.string(),
    roomTypeId: v.string(),
    quantity: v.number(),
    labels: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    autoGenerateSlots: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const hotel = await getAccommodationHotelByStringId(ctx, args.hotelId)
    const roomType = await getAccommodationRoomTypeByStringId(
      ctx,
      args.roomTypeId
    )

    if (!hotel) throw new Error("Hotel not found")
    if (!roomType) throw new Error("Room type not found")

    const hotelCode =
      hotel.name
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .map((part: string) => part.slice(0, 2).toUpperCase())
        .join("")
        .slice(0, 6) || "HTL"

    const roomTypeCode =
      roomType.label
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .map((part: string) => part.slice(0, 2).toUpperCase())
        .join("")
        .slice(0, 6) || "RM"

    const existingRooms = await ctx.db
      .query("accommodationRooms")
      .withIndex("hotelId_label", (q) => q.eq("hotelId", args.hotelId))
      .take(200)

    const existingCount = existingRooms.length
    const createdIds: string[] = []

    for (let index = 0; index < args.quantity; index += 1) {
      const label =
        args.labels?.[index] ??
        `${hotelCode}-${roomTypeCode}-${String(existingCount + index + 1).padStart(3, "0")}`

      const id = await ctx.db.insert("accommodationRooms", {
        hotelId: args.hotelId,
        roomTypeId: args.roomTypeId,
        label,
        capacity: roomType.defaultCapacity,
        notes: args.notes,
      })
      createdIds.push(id)
    }

    // Auto-generate slots for linked events
    const shouldGenerateSlots = args.autoGenerateSlots !== false
    if (shouldGenerateSlots) {
      // Find all events linked to this hotel
      const linkedEvents = await ctx.db
        .query("accommodationEventHotels")
        .withIndex("hotelId", (q) => q.eq("hotelId", args.hotelId))
        .take(50)

      // Generate slots for each new room in each linked event
      for (const link of linkedEvents) {
        const eventId = link.eventId as Id<"events">

        for (const roomId of createdIds) {
          const room = await ctx.db.get(
            "accommodationRooms",
            roomId as Id<"accommodationRooms">
          )
          if (!room) continue

          const existingSlots = await ctx.db
            .query("accommodationSlots")
            .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
            .filter((q) =>
              q.eq(q.field("roomId"), roomId as Id<"accommodationRooms">)
            )
            .take(100)

          const startIndex = existingSlots.length
          const capacity = room.capacity

          for (let i = 0; i < capacity; i++) {
            const slotLabel = `${room.label}-Bed-${String(startIndex + i + 1).padStart(2, "0")}`

            await ctx.db.insert("accommodationSlots", {
              eventId,
              hotelId: args.hotelId as Id<"accommodationHotels">,
              roomId: roomId as Id<"accommodationRooms">,
              slotLabel,
              genderPolicy: "mixed",
              isAssignable: true,
              updatedAt: Date.now(),
            })
          }
        }
      }
    }

    return createdIds
  },
})

export const createRoomType = mutation({
  args: {
    label: v.string(),
    defaultCapacity: v.number(),
    notes: v.optional(v.string()),
    count: v.optional(v.number()),
    description: v.optional(v.string()),
    categoryId: v.optional(v.id("accommodationCategories")),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const label = args.label.trim()
    if (!label) {
      throw new Error("Room type label is required")
    }
    if (args.count !== undefined && !isNonNegativeInteger(args.count)) {
      throw new Error("count must be a non-negative integer")
    }
    if (
      !Number.isInteger(args.defaultCapacity) ||
      args.defaultCapacity < 1
    ) {
      throw new Error("defaultCapacity must be a positive integer")
    }
    if (args.categoryId !== undefined) {
      const category = await ctx.db.get(
        "accommodationCategories",
        args.categoryId
      )
      if (!category) {
        throw new Error("Category not found")
      }
    }
    const id = await ctx.db.insert("accommodationRoomTypes", {
      label,
      defaultCapacity: args.defaultCapacity,
      notes: normalizeOptionalString(args.notes) ?? undefined,
      count: args.count,
      description: normalizeOptionalString(args.description) ?? undefined,
      categoryId: args.categoryId,
    })
    return id
  },
})

export const assignRoomToAttendee = mutation({
  args: {
    attendeeId: v.string(),
    roomId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const roomId = normalizeDocId(
      ctx,
      "accommodationRooms",
      args.roomId,
      "Room not found"
    )
    const attendeeId = normalizeDocId(
      ctx,
      "orderAttendees",
      args.attendeeId,
      "Attendee not found"
    )
    const room = await ctx.db.get("accommodationRooms", roomId)
    if (!room) throw new Error("Room not found")

    const attendee = await ctx.db.get("orderAttendees", attendeeId)
    if (!attendee) throw new Error("Attendee not found")

    const eventHotelLinks = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("hotelId", (q) => q.eq("hotelId", room.hotelId as string))
      .take(20)

    if (eventHotelLinks.length > 0) {
      // Look up the canonical event for this attendee via their order
      const order = await ctx.db.get("orders", attendee.orderId)
      const eventId = order?.eventId

      if (eventId) {
        const eventHasHotel = eventHotelLinks.some(
          (eh) => eh.eventId === eventId
        )
        if (!eventHasHotel) {
          throw new Error("Room hotel is not enabled for this event")
        }
      }
    }

    const occupiedCount = await ctx.db
      .query("orderAttendees")
      .withIndex("by_assignedRoomId", (q) =>
        q.eq("assignedRoomId", args.roomId)
      )
      .take(room.capacity + 1)

    if (occupiedCount.length >= room.capacity) {
      throw new Error("Room is already full")
    }

    // Phase 44 lock boundary: the first assignment for an order with
    // unconfirmed options-only selections persists the accommodation
    // confirmation snapshot atomically with the assignment write. Legacy
    // orders with no selection rows skip cleanly.
    await persistOrderAccommodationConfirmation(ctx, attendee.orderId)

    await ctx.db.patch("orderAttendees", attendeeId, {
      assignedRoomId: args.roomId,
    })

    return args.attendeeId
  },
})

export const assignAttendeeToRoom = mutation({
  args: {
    attendeeId: v.string(),
    roomId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const roomId = normalizeDocId(
      ctx,
      "accommodationRooms",
      args.roomId,
      "Room not found"
    )
    const attendeeId = normalizeDocId(
      ctx,
      "orderAttendees",
      args.attendeeId,
      "Attendee not found"
    )
    const room = await ctx.db.get("accommodationRooms", roomId)
    if (!room) throw new Error("Room not found")

    const attendee = await ctx.db.get("orderAttendees", attendeeId)
    if (!attendee) throw new Error("Attendee not found")

    if (attendee.assignedRoomId === args.roomId) {
      throw new Error("Attendee already assigned to this room")
    }

    const eventHotelLinks = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("hotelId", (q) => q.eq("hotelId", room.hotelId as string))
      .take(20)

    if (eventHotelLinks.length > 0) {
      // Look up the canonical event for this attendee via their order
      const order = await ctx.db.get("orders", attendee.orderId)
      const eventId = order?.eventId

      if (eventId) {
        const eventHasHotel = eventHotelLinks.some(
          (eh) => eh.eventId === eventId
        )
        if (!eventHasHotel) {
          throw new Error("Room hotel is not enabled for this event")
        }
      }
    }

    const occupiedCount = await ctx.db
      .query("orderAttendees")
      .withIndex("by_assignedRoomId", (q) =>
        q.eq("assignedRoomId", args.roomId)
      )
      .take(room.capacity + 1)

    if (occupiedCount.length >= room.capacity) {
      throw new Error("Room is already full")
    }

    // Phase 44 lock boundary: first assignment for an order with unconfirmed
    // options-only selections persists the confirmation snapshot atomically
    // with the assignment write; legacy orders skip cleanly.
    await persistOrderAccommodationConfirmation(ctx, attendee.orderId)

    await ctx.db.patch("orderAttendees", attendeeId, {
      assignedRoomId: args.roomId,
    })

    return { ok: true }
  },
})

export const unassignRoomFromAttendee = mutation({
  args: {
    attendeeId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const attendeeId = normalizeDocId(
      ctx,
      "orderAttendees",
      args.attendeeId,
      "Attendee not found or not assigned to any room"
    )
    const attendee = await ctx.db.get("orderAttendees", attendeeId)
    if (!attendee || !attendee.assignedRoomId) return { ok: true }

    await ctx.db.patch("orderAttendees", attendeeId, {
      assignedRoomId: undefined,
    })

    return { ok: true }
  },
})

export const unassignAttendeeFromRoom = mutation({
  args: {
    attendeeId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const attendeeId = normalizeDocId(
      ctx,
      "orderAttendees",
      args.attendeeId,
      "Attendee not found or not assigned to any room"
    )
    const attendee = await ctx.db.get("orderAttendees", attendeeId)
    if (!attendee || !attendee.assignedRoomId) {
      throw new Error("Attendee not found or not assigned to any room")
    }

    await ctx.db.patch("orderAttendees", attendeeId, {
      assignedRoomId: undefined,
    })

    return { ok: true }
  },
})

export const getEventHotels = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    // Bounded: one event links to limited hotels
    const eventHotels = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) => q.eq("eventId", args.eventId))
      .take(50)

    const hotels = await Promise.all(
      eventHotels.map((eh) => getAccommodationHotelByStringId(ctx, eh.hotelId))
    )

    return hotels.filter(Boolean)
  },
})

/**
 * Link a hotel to an event with optional automatic slot generation.
 * Supports both canonical eventId and eventProviderEventId for flexibility.
 */
export const linkHotelToEvent = mutation({
  args: {
    eventId: v.optional(v.string()),
    eventProviderEventId: v.optional(v.string()),
    hotelId: v.id("accommodationHotels"),
    autoGenerateSlots: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    // Resolve eventId from either direct ID or provider event ID
    let canonicalEventId: string

    if (args.eventId) {
      canonicalEventId = args.eventId
    } else if (args.eventProviderEventId) {
      // Look up canonical event via eventSources
      const eventSource = await ctx.db
        .query("eventSources")
        .withIndex("by_provider_and_externalEventId", (q) =>
          q
            .eq("provider", "tickettailor")
            .eq("externalEventId", args.eventProviderEventId as string)
        )
        .first()

      if (eventSource) {
        canonicalEventId = eventSource.eventId as string
      } else {
        // Fallback: try to find by direct ID match (slug)
        const event = await ctx.db
          .query("events")
          .withIndex("by_slug", (q) =>
            q.eq("slug", args.eventProviderEventId as string)
          )
          .first()

        if (!event) {
          throw new Error("Event not found")
        }
        canonicalEventId = event._id as string
      }
    } else {
      throw new Error("Either eventId or eventProviderEventId must be provided")
    }

    // Verify event exists
    const event = await ctx.db.get("events", canonicalEventId as Id<"events">)
    if (!event) {
      throw new Error("Event not found")
    }

    // Verify hotel exists
    const hotel = await ctx.db.get("accommodationHotels", args.hotelId)
    if (!hotel) {
      throw new Error("Hotel not found")
    }

    // Check for existing link
    const existing = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", canonicalEventId).eq("hotelId", args.hotelId as string)
      )
      .first()

    if (existing) {
      return {
        linkId: existing._id,
        eventId: canonicalEventId,
        hotelId: args.hotelId,
        slotsGenerated: 0,
        alreadyLinked: true,
      }
    }

    // Create the link
    const linkId = await ctx.db.insert("accommodationEventHotels", {
      eventId: canonicalEventId,
      hotelId: args.hotelId as string,
    })

    // Auto-generate slots if requested (default: true)
    let slotsGenerated = 0
    const shouldGenerateSlots = args.autoGenerateSlots !== false

    if (shouldGenerateSlots) {
      // Get all rooms for this hotel
      const rooms = await ctx.db
        .query("accommodationRooms")
        .withIndex("hotelId_label", (q) =>
          q.eq("hotelId", args.hotelId as string)
        )
        .take(100)

      // Generate slots for each room
      for (const room of rooms) {
        const existingSlots = await ctx.db
          .query("accommodationSlots")
          .withIndex("by_eventId", (q) =>
            q.eq("eventId", canonicalEventId as Id<"events">)
          )
          .filter((q) => q.eq(q.field("roomId"), room._id))
          .take(100)

        const startIndex = existingSlots.length
        const capacity = room.capacity

        for (let i = 0; i < capacity; i++) {
          const slotLabel = `${room.label}-Bed-${String(startIndex + i + 1).padStart(2, "0")}`

          await ctx.db.insert("accommodationSlots", {
            eventId: canonicalEventId as Id<"events">,
            hotelId: args.hotelId,
            roomId: room._id,
            slotLabel,
            genderPolicy: "mixed", // Default to mixed, can be changed later
            isAssignable: true,
            updatedAt: Date.now(),
          })
          slotsGenerated++
        }
      }
    }

    return {
      linkId,
      eventId: canonicalEventId,
      hotelId: args.hotelId,
      slotsGenerated,
      alreadyLinked: false,
    }
  },
})

export const unlinkHotelFromEvent = mutation({
  args: {
    eventId: v.string(),
    hotelId: v.id("accommodationHotels"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const link = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", args.eventId).eq("hotelId", args.hotelId)
      )
      .first()

    if (link) {
      await ctx.db.delete("accommodationEventHotels", link._id)
    }

    return { ok: true }
  },
})

export const updateHotel = mutation({
  args: {
    hotelId: v.string(),
    name: v.optional(v.string()),
    city: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const { hotelId, ...data } = args
    const normalizedHotelId = normalizeDocId(
      ctx,
      "accommodationHotels",
      hotelId,
      "Hotel not found"
    )
    await ctx.db.patch("accommodationHotels", normalizedHotelId, data)
    return await ctx.db.get("accommodationHotels", normalizedHotelId)
  },
})

export const deleteHotel = mutation({
  args: { hotelId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const hotelId = normalizeDocId(
      ctx,
      "accommodationHotels",
      args.hotelId,
      "Hotel not found"
    )

    const rooms = await ctx.db
      .query("accommodationRooms")
      .withIndex("hotelId_label", (q) => q.eq("hotelId", args.hotelId))
      .take(200)

    for (const room of rooms) {
      const assignedAttendee = await ctx.db
        .query("orderAttendees")
        .withIndex("by_assignedRoomId", (q) => q.eq("assignedRoomId", room._id))
        .first()

      if (assignedAttendee) {
        throw new Error("Cannot delete hotel with assigned attendees")
      }
    }

    const eventHotels = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("hotelId", (q) => q.eq("hotelId", args.hotelId))
      .take(50)

    for (const room of rooms) {
      await ctx.db.delete("accommodationRooms", room._id)
    }

    for (const eventHotel of eventHotels) {
      await ctx.db.delete("accommodationEventHotels", eventHotel._id)
    }

    await ctx.db.delete("accommodationHotels", hotelId)
    return { ok: true }
  },
})

export const updateRoomLabel = mutation({
  args: {
    roomId: v.string(),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const roomId = normalizeDocId(
      ctx,
      "accommodationRooms",
      args.roomId,
      "Room not found"
    )
    await ctx.db.patch("accommodationRooms", roomId, {
      label: args.label,
    })
    return await ctx.db.get("accommodationRooms", roomId)
  },
})

export const deleteRoom = mutation({
  args: { roomId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const roomId = normalizeDocId(
      ctx,
      "accommodationRooms",
      args.roomId,
      "Room not found"
    )
    const room = await ctx.db.get("accommodationRooms", roomId)
    if (!room) throw new Error("Room not found")

    const attendees = await ctx.db
      .query("orderAttendees")
      .withIndex("by_assignedRoomId", (q) =>
        q.eq("assignedRoomId", args.roomId)
      )
      .take(room.capacity + 1)

    if (attendees.length > 0) {
      throw new Error("Cannot delete room with assigned attendees")
    }

    await ctx.db.delete("accommodationRooms", roomId)
    return { ok: true }
  },
})

export const updateRoomType = mutation({
  args: {
    roomTypeId: v.string(),
    label: v.optional(v.string()),
    defaultCapacity: v.optional(v.number()),
    notes: v.optional(v.string()),
    count: v.optional(v.number()),
    description: v.optional(v.string()),
    categoryId: v.optional(v.id("accommodationCategories")),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const { roomTypeId, count, description, categoryId, ...rest } = args
    const normalizedRoomTypeId = normalizeDocId(
      ctx,
      "accommodationRoomTypes",
      roomTypeId,
      "Room type not found"
    )
    if (count !== undefined && !isNonNegativeInteger(count)) {
      throw new Error("count must be a non-negative integer")
    }
    if (
      args.defaultCapacity !== undefined &&
      (!Number.isInteger(args.defaultCapacity) || args.defaultCapacity < 1)
    ) {
      throw new Error("defaultCapacity must be a positive integer")
    }
    if (categoryId !== undefined) {
      const category = await ctx.db.get("accommodationCategories", categoryId)
      if (!category) {
        throw new Error("Category not found")
      }
    }
    const data: Partial<Doc<"accommodationRoomTypes">> = { ...rest }
    if (count !== undefined) {
      data.count = count
    }
    if (description !== undefined) {
      data.description = normalizeOptionalString(description) ?? undefined
    }
    if (categoryId !== undefined) {
      data.categoryId = categoryId
    }
    await ctx.db.patch("accommodationRoomTypes", normalizedRoomTypeId, data)
    return await ctx.db.get("accommodationRoomTypes", normalizedRoomTypeId)
  },
})

export const deleteRoomType = mutation({
  args: { roomTypeId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    // Bounded: one room type has limited rooms
    const rooms = await ctx.db
      .query("accommodationRooms")
      .withIndex("roomTypeId", (q) => q.eq("roomTypeId", args.roomTypeId))
      .take(200)

    if (rooms.length > 0) {
      throw new Error("Cannot delete room type with existing rooms")
    }

    const roomTypeId = normalizeDocId(
      ctx,
      "accommodationRoomTypes",
      args.roomTypeId,
      "Room type not found"
    )
    await ctx.db.delete("accommodationRoomTypes", roomTypeId)
    return { ok: true }
  },
})

export const getEventByProviderId = query({
  args: { providerEventId: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const event = await ctx.db
      .query("ticketTailorEvents")
      .withIndex("providerEventId", (q) =>
        q.eq("providerEventId", args.providerEventId)
      )
      .first()
    return event
  },
})

/**
 * @deprecated Use linkHotelToEvent instead. This mutation will be removed in a future release.
 * The linkHotelToEvent mutation now supports eventProviderEventId and includes auto-slot generation.
 */
export const attachHotelToEventByProviderId = mutation({
  args: {
    eventProviderEventId: v.string(),
    hotelId: v.string(),
  },
  handler: async (ctx, args) => {
    console.warn(
      "[DEPRECATED] attachHotelToEventByProviderId is deprecated. Use linkHotelToEvent with autoGenerateSlots option."
    )
    await requireIdentity(ctx)

    // Look up canonical event via eventSources
    const eventSource = await ctx.db
      .query("eventSources")
      .withIndex("by_provider_and_externalEventId", (q) =>
        q
          .eq("provider", "tickettailor")
          .eq("externalEventId", args.eventProviderEventId)
      )
      .first()

    let canonicalEventId: string

    if (eventSource) {
      canonicalEventId = eventSource.eventId as string
    } else {
      // Fallback: try to find by direct ID match
      const event = await ctx.db
        .query("events")
        .withIndex("by_slug", (q) => q.eq("slug", args.eventProviderEventId))
        .first()

      if (!event) {
        throw new Error("Event not found")
      }
      canonicalEventId = event._id as string
    }

    const existing = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", canonicalEventId).eq("hotelId", args.hotelId)
      )
      .first()

    if (existing) {
      return existing._id
    }

    return await ctx.db.insert("accommodationEventHotels", {
      eventId: canonicalEventId,
      hotelId: args.hotelId,
    })
  },
})

export const detachHotelFromEventByProviderId = mutation({
  args: {
    eventProviderEventId: v.string(),
    hotelId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    // Look up canonical event via eventSources
    const eventSource = await ctx.db
      .query("eventSources")
      .withIndex("by_provider_and_externalEventId", (q) =>
        q
          .eq("provider", "tickettailor")
          .eq("externalEventId", args.eventProviderEventId)
      )
      .first()

    let canonicalEventId: string

    if (eventSource) {
      canonicalEventId = eventSource.eventId as string
    } else {
      // Fallback: try to find by direct ID match
      const event = await ctx.db
        .query("events")
        .withIndex("by_slug", (q) => q.eq("slug", args.eventProviderEventId))
        .first()

      if (!event) {
        // No event found, nothing to detach
        return { ok: true }
      }
      canonicalEventId = event._id as string
    }

    const link = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", canonicalEventId).eq("hotelId", args.hotelId)
      )
      .first()

    if (link) {
      await ctx.db.delete("accommodationEventHotels", link._id)
    }

    return { ok: true }
  },
})

export const generateSlotsForRoom = mutation({
  args: {
    eventId: v.id("events"),
    roomId: v.id("accommodationRooms"),
    genderPolicy: v.union(
      v.literal("male"),
      v.literal("female"),
      v.literal("mixed")
    ),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const room = await ctx.db.get("accommodationRooms", args.roomId)
    if (!room) {
      throw new Error("Room not found")
    }

    const hotel = await ctx.db.get(
      "accommodationHotels",
      room.hotelId as Id<"accommodationHotels">
    )
    if (!hotel) {
      throw new Error("Hotel not found")
    }

    const existingSlots = await ctx.db
      .query("accommodationSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .filter((q) => q.eq(q.field("roomId"), args.roomId))
      .take(100)

    const startIndex = existingSlots.length
    const capacity = room.capacity
    const createdIds: Id<"accommodationSlots">[] = []

    for (let i = 0; i < capacity; i++) {
      const slotLabel = `${room.label}-Bed-${String(startIndex + i + 1).padStart(2, "0")}`

      const id = await ctx.db.insert("accommodationSlots", {
        eventId: args.eventId,
        hotelId: room.hotelId as Id<"accommodationHotels">,
        roomId: args.roomId,
        slotLabel,
        genderPolicy: args.genderPolicy,
        isAssignable: true,
        updatedAt: Date.now(),
      })
      createdIds.push(id)
    }

    return {
      createdCount: createdIds.length,
      slotIds: createdIds,
      roomLabel: room.label,
      capacity,
    }
  },
})

export const getSlotsForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const slots = await ctx.db
      .query("accommodationSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500)

    const roomIds = [...new Set(slots.map((s) => s.roomId))]
    const hotelIds = [...new Set(slots.map((s) => s.hotelId))]

    const rooms = await Promise.all(
      roomIds.map((id) => ctx.db.get("accommodationRooms", id))
    )
    const hotels = await Promise.all(
      hotelIds.map((id) => ctx.db.get("accommodationHotels", id))
    )

    const roomById = new Map(rooms.filter(Boolean).map((r) => [r!._id, r!]))
    const hotelById = new Map(hotels.filter(Boolean).map((h) => [h!._id, h!]))

    return slots.map((slot) => ({
      id: slot._id,
      slotLabel: slot.slotLabel,
      genderPolicy: slot.genderPolicy,
      isAssignable: slot.isAssignable,
      ineligibilityReason: slot.ineligibilityReason,
      room: roomById.get(slot.roomId)
        ? {
            id: roomById.get(slot.roomId)!._id,
            label: roomById.get(slot.roomId)!.label,
            capacity: roomById.get(slot.roomId)!.capacity,
          }
        : null,
      hotel: hotelById.get(slot.hotelId)
        ? {
            id: hotelById.get(slot.hotelId)!._id,
            name: hotelById.get(slot.hotelId)!.name,
          }
        : null,
    }))
  },
})

export const getAccommodationSummaryForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const event = await ctx.db.get("events", args.eventId)
    if (!event) {
      throw new Error("Event not found")
    }

    const eventHotels = await ctx.db
      .query("accommodationEventHotels")
      .withIndex("eventId_hotelId", (q) =>
        q.eq("eventId", args.eventId as unknown as string)
      )
      .take(50)

    const slots = await ctx.db
      .query("accommodationSlots")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500)

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .take(500)

    const assignableSlots = slots.filter((s) => s.isAssignable)

    return {
      eventSlug: event.slug,
      eventTitle: event.title,
      hotelsLinked: eventHotels.length,
      totalSlots: slots.length,
      assignableSlots: assignableSlots.length,
      submissionsCount: orders.length,
    }
  },
})

/**
 * Confirm a pending buyer assignment and assign attendee to a room.
 * Allows admin to modify slot assignment if needed.
 * Returns alternative room suggestions if requested slot is full.
 */
export const confirmBuyerAssignment = mutation({
  args: {
    assignmentId: v.id("orderAssignments"),
    slotId: v.optional(v.id("accommodationSlots")),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    // Get the pending assignment
    const assignment = await ctx.db.get("orderAssignments", args.assignmentId)
    if (!assignment) {
      throw new Error("Assignment not found")
    }

    const assignmentStatus = assignment.status ?? "pending"
    if (assignmentStatus !== "pending") {
      throw new Error("Assignment is not pending")
    }

    // Get the order for context
    const order = await ctx.db.get("orders", assignment.orderId)
    if (!order) {
      throw new Error("Order not found")
    }

    // Determine which slot to use
    let targetSlotId = args.slotId || assignment.slotId
    if (!targetSlotId) {
      throw new Error("No slot specified for assignment")
    }

    // Get the target slot
    const slot = await ctx.db.get("accommodationSlots", targetSlotId)
    if (!slot) {
      throw new Error("Slot not found")
    }

    // Get the room to check capacity
    const room = await ctx.db.get("accommodationRooms", slot.roomId)
    if (!room) {
      throw new Error("Room not found")
    }

    // Count current occupants in this room
    const occupants = await ctx.db
      .query("orderAttendees")
      .withIndex("by_assignedRoomId", (q) =>
        q.eq("assignedRoomId", slot.roomId)
      )
      .take(room.capacity + 1)

    const occupantCount = occupants.length

    // Check if room has capacity
    if (occupantCount >= room.capacity) {
      // Room is full - find alternative rooms with capacity
      const allSlots = await ctx.db
        .query("accommodationSlots")
        .withIndex("by_eventId", (q) => q.eq("eventId", slot.eventId))
        .take(100)

      // Get rooms with available space
      const alternatives: Array<{
        slotId: string
        roomId: string
        roomLabel: string
        roomType: string
        capacity: number
        occupantCount: number
        availableSpots: number
      }> = []

      for (const altSlot of allSlots) {
        if (alternatives.length >= 10) break

        const altRoom = await ctx.db.get("accommodationRooms", altSlot.roomId)
        if (!altRoom) continue

        const altOccupants = await ctx.db
          .query("orderAttendees")
          .withIndex("by_assignedRoomId", (q) =>
            q.eq("assignedRoomId", altSlot.roomId)
          )
          .take(altRoom.capacity + 1)

        if (altOccupants.length < altRoom.capacity) {
          const roomType = await ctx.db.get(
            "accommodationRoomTypes",
            altRoom.roomTypeId as Id<"accommodationRoomTypes">
          )

          alternatives.push({
            slotId: altSlot._id,
            roomId: altSlot.roomId,
            roomLabel: altRoom.label,
            roomType: roomType?.label || "Unknown",
            capacity: altRoom.capacity,
            occupantCount: altOccupants.length,
            availableSpots: altRoom.capacity - altOccupants.length,
          })
        }
      }

      return {
        success: false,
        error: "ROOM_FULL",
        message: "The requested room is at full capacity",
        alternatives,
      }
    }

    // Phase 44 lock boundary: persisting the accommodation confirmation
    // happens after room/capacity validation but before the assignment write,
    // so a full room never locks the buyer's configuration. A resolver
    // failure aborts the whole transaction before any assignment patch.
    await persistOrderAccommodationConfirmation(ctx, order._id)

    // Get current user identity for confirmedBy
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Unauthorized")
    }

    // Update assignment status
    await ctx.db.patch(args.assignmentId, {
      status: "confirmed",
      confirmedAt: Date.now(),
      confirmedBy: identity.subject,
      slotId: targetSlotId,
    })

    // Assign the attendee to the room
    await ctx.db.patch("orderAttendees", assignment.attendeeId, {
      assignedRoomId: slot.roomId,
    })

    return {
      success: true,
      assignmentId: args.assignmentId,
      attendeeId: assignment.attendeeId,
      slotId: targetSlotId,
      roomId: slot.roomId,
    }
  },
})

/**
 * Remove (decline/reject) a pending buyer assignment without assigning.
 * Updates status to 'declined' and records who declined it.
 */
export const removeBuyerAssignment = mutation({
  args: {
    assignmentId: v.id("orderAssignments"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    // Get the pending assignment
    const assignment = await ctx.db.get("orderAssignments", args.assignmentId)
    if (!assignment) {
      throw new Error("Assignment not found")
    }

    const assignmentStatus = assignment.status ?? "pending"
    if (assignmentStatus !== "pending") {
      throw new Error("Assignment is not pending")
    }

    // Get current user identity for confirmedBy (we use confirmedBy to track who processed it)
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Unauthorized")
    }

    // Update assignment status to declined
    await ctx.db.patch(args.assignmentId, {
      status: "declined",
      confirmedAt: Date.now(),
      confirmedBy: identity.subject,
    })

    return {
      success: true,
      assignmentId: args.assignmentId,
      attendeeId: assignment.attendeeId,
    }
  },
})

// ---------------------------------------------------------------------------
// Phase 39: Accommodation catalog & event configuration
//
// Reusable catalog tables (categories, options, age bands) and event-scoped
// configuration (stay config, rates, options, resources, age pricing) with
// authenticated, bounded, validated reads and mutations. Purely additive:
// existing hotels/rooms/room-type/assignment exports above are preserved.
// ---------------------------------------------------------------------------

export const DAY_MS = 24 * 60 * 60 * 1000
export const EVENT_OPTION_DEFAULT_PRICE_MINOR = 1000 // €10

/**
 * The pending-order LIST returned to the admin UI is bounded for display
 * while `pendingOrderCount` stays exact (see getEventAccommodationConfig).
 */
export const PENDING_ORDERS_DISPLAY_LIMIT = 50

export const categoryCodeValidator = v.union(
  v.literal("standard"),
  v.literal("superior"),
  v.literal("family")
)
export const optionCodeValidator = v.string()
export const occupancyValidator = v.union(
  v.literal("single"),
  v.literal("shared"),
  v.literal("family")
)
export const resourceKindValidator = v.union(
  v.literal("room"),
  v.literal("cot")
)
export const optionKindValidator = v.union(
  v.literal("addon"),
  v.literal("upgrade"),
  v.literal("eligibility")
)
export const optionUnitValidator = v.union(
  v.literal("per_night"),
  v.literal("per_person")
)

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

/**
 * Minor-unit money must always be a whole number of the smallest currency
 * unit. Fractional values such as 1000.5 are not valid minor units and could
 * produce non-currency amounts in downstream billing, so they are rejected.
 */
function isNonNegativePrice(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

/**
 * Derives the night count for a stay window from its timestamps. The night
 * count is never hardcoded or client-supplied: it is always computed from the
 * configured check-in/check-out timestamps.
 */
export function deriveNightCount(checkInAt: number, checkOutAt: number): number {
  if (!Number.isFinite(checkInAt) || !Number.isFinite(checkOutAt)) {
    throw new Error("Invalid stay window: timestamps must be finite numbers")
  }
  if (checkOutAt <= checkInAt) {
    throw new Error("Invalid stay window: check-out must be after check-in")
  }
  return Math.max(1, Math.round((checkOutAt - checkInAt) / DAY_MS))
}

/**
 * The locked initial stay window for a newly initialized event config: one
 * night before the event (check-in the day before the event starts, check-out
 * on the event start day), so the initial derived nightCount is 1.
 */
export function deriveInitialStayWindow(eventStartsAt: number): {
  baseCheckInAt: number
  baseCheckOutAt: number
} {
  if (!Number.isFinite(eventStartsAt)) {
    throw new Error("Invalid event start time")
  }
  return {
    baseCheckInAt: eventStartsAt - DAY_MS,
    baseCheckOutAt: eventStartsAt,
  }
}

/**
 * Omitted upgrade/cot per-night prices default to €10 (1000 minor units).
 * Explicit €0 and any other supplied price are preserved.
 */
export function resolveEventOptionPriceMinor(
  priceMinor: number | null | undefined
): number {
  return priceMinor ?? EVENT_OPTION_DEFAULT_PRICE_MINOR
}

/**
 * Sellable beds for a room resource = physical count × room type
 * defaultCapacity. Room resources must reference a linked room type with a
 * positive-integer default capacity — there is deliberately no capacity-1
 * fallback for a room, because silently misrepresenting a multi-bed room
 * corrupts event availability. Cot resources count one bed per physical item.
 */
export function deriveResourceSellableBeds(input: {
  count: number
  kind: "room" | "cot"
  roomTypeDefaultCapacity?: number | null
}): number {
  if (input.kind === "room") {
    const capacity = input.roomTypeDefaultCapacity
    if (capacity === null || capacity === undefined) {
      throw new Error(
        "Room resources require a linked room type to derive sellable beds"
      )
    }
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error(
        "Room type defaultCapacity must be a positive integer to derive sellable beds"
      )
    }
    return input.count * capacity
  }
  // Cot resources count one bed per physical item.
  return input.count
}

/**
 * Active categories are derived solely from eventAccommodationRates rows:
 * a category is active for an event when at least one rate row exists for
 * that (eventId, categoryId). No separate active-categories list/flag exists.
 */
export function deriveActiveCategoryIds(
  rateRows: ReadonlyArray<{ categoryId: string }>
): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const row of rateRows) {
    if (!seen.has(row.categoryId)) {
      seen.add(row.categoryId)
      ids.push(row.categoryId)
    }
  }
  return ids
}

/**
 * Absent `ticketTypes.accommodationIncluded` is treated as false; only an
 * explicit true marks a ticket as covering the base stay nights.
 */
export function isAccommodationIncluded(ticket: {
  accommodationIncluded?: boolean | null
}): boolean {
  return ticket.accommodationIncluded === true
}

/**
 * Age-band bounds must be non-negative integers with maxAge (when defined)
 * greater than or equal to minAge. 18+ bands may omit maxAge.
 */
export function isValidAgeBandRange(
  minAge: number,
  maxAge: number | null | undefined
): boolean {
  if (!Number.isInteger(minAge) || minAge < 0) {
    return false
  }
  if (maxAge === null || maxAge === undefined) {
    return true
  }
  return Number.isInteger(maxAge) && maxAge >= minAge
}

function sortBySortOrder<T extends { sortOrder: number }>(
  rows: readonly T[]
): T[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder)
}

async function getEventOrThrow(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">
) {
  const event = await ctx.db.get("events", eventId)
  if (!event) {
    throw new Error("Event not found")
  }
  return event
}

async function getAccommodationCatalogData(ctx: QueryCtx | MutationCtx) {
  const [categories, options, roomTypes] = await Promise.all([
    ctx.db.query("accommodationCategories").take(50),
    ctx.db.query("accommodationOptions").take(50),
    ctx.db.query("accommodationRoomTypes").take(100),
  ])
  return { categories, options, roomTypes }
}

export const getAccommodationCatalog = query({
  args: {},
  handler: async (ctx) => {
    await requireIdentity(ctx)
    const catalog = await getAccommodationCatalogData(ctx)
    return {
      categories: sortBySortOrder(catalog.categories),
      options: catalog.options,
      roomTypes: catalog.roomTypes,
    }
  },
})

export const getEventAccommodationConfig = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const event = await ctx.db.get("events", args.eventId)
    if (!event) {
      throw new Error("Event not found")
    }

    const [
      configRow,
      rateRows,
      eventOptionRows,
      resourceRows,
    ] = await Promise.all([
      ctx.db
        .query("eventAccommodationConfig")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .unique(),
      ctx.db
        .query("eventAccommodationRates")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(200),
      ctx.db
        .query("eventAccommodationOptions")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(100),
      ctx.db
        .query("eventAccommodationResources")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(100),
    ])

    // Fetch every referenced catalog row by ID instead of relying on the
    // bounded catalog listing. A category, option or room type beyond the
    // 50/100-row limits would otherwise silently drop labels and corrupt
    // derived availability (e.g. a room resource falling back to a wrong
    // capacity). Referenced rows are few per event, so per-ID reads stay
    // bounded.
    const referencedCategoryIds = [
      ...new Set(rateRows.map((rate) => rate.categoryId as string)),
    ]
    const referencedOptionIds = [
      ...new Set(eventOptionRows.map((row) => row.optionId as string)),
    ]
    const referencedRoomTypeIds = [
      ...new Set(
        resourceRows
          .filter((row) => row.roomTypeId !== undefined)
          .map((row) => row.roomTypeId as string)
      ),
    ]
    const [referencedCategories, referencedOptions, referencedRoomTypes] =
      await Promise.all([
        Promise.all(
          referencedCategoryIds.map((id) =>
            ctx.db.get(
              "accommodationCategories",
              id as Id<"accommodationCategories">
            )
          )
        ),
        Promise.all(
          referencedOptionIds.map((id) =>
            ctx.db.get("accommodationOptions", id as Id<"accommodationOptions">)
          )
        ),
        Promise.all(
          referencedRoomTypeIds.map((id) =>
            ctx.db.get(
              "accommodationRoomTypes",
              id as Id<"accommodationRoomTypes">
            )
          )
        ),
      ])

    const categoryById = new Map(
      referencedCategories
        .filter((category): category is NonNullable<typeof category> => {
          return category !== null
        })
        .map((category) => [category._id, category])
    )
    const optionById = new Map(
      referencedOptions
        .filter((option): option is NonNullable<typeof option> => {
          return option !== null
        })
        .map((option) => [option._id, option])
    )
    const roomTypeById = new Map(
      referencedRoomTypes
        .filter((roomType): roomType is NonNullable<typeof roomType> => {
          return roomType !== null
        })
        .map((roomType) => [roomType._id, roomType])
    )

    // The full reusable catalog choices are returned alongside the event
    // configuration so the editor can render add/configure controls for an
    // event that has no rates, options, or resources yet (CR-05). A fresh
    // event must not dead-end on "no active categories" when the catalog is
    // seeded — the admin needs the catalog rows to create the first ones.
    const catalogData = await getAccommodationCatalogData(ctx)

    const activeCategoryIds = deriveActiveCategoryIds(rateRows)
    const activeCategories = activeCategoryIds
      .map((id) => categoryById.get(id as Id<"accommodationCategories">))
      .filter((category): category is NonNullable<typeof category> => {
        return category !== undefined
      })

    // Pending buyer impact: exact, event-scoped projection of orders that
    // carry at least one unconfirmed accommodation selection row. A confirmed
    // order (every row has `confirmedAt`) is never counted as pending, and an
    // order with no selection rows is not pending either (pre-Phase 42). The
    // count and list are server-derived; the UI never computes them.
    // `hasAccommodationSelections` distinguishes the pre-Phase-42 empty state
    // (no selection rows at all) from an all-confirmed event so the admin UI
    // can show the honest signup-empty copy instead of a fake zero state.
    //
    // The COUNT must never be derived from a bounded order fetch: capping the
    // order scan at N would silently drop pending orders beyond N and report
    // a lower repricing impact. The full indexed event order set is streamed
    // via bounded async iteration (never `.collect()`), while only a bounded
    // display list is returned to the admin UI.
    const pendingOrders: Array<{
      orderId: Id<"orders">
      bookingRef: string | null
      bookerName: string | null
      selectionCount: number
    }> = []
    let pendingOrderCount = 0
    let hasAccommodationSelections = false
    for await (const order of ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))) {
      let hasUnconfirmedRow = false
      let selectionCount = 0
      for await (const row of ctx.db
        .query("orderAccommodationSelections")
        .withIndex("by_orderId", (q) => q.eq("orderId", order._id))) {
        selectionCount += 1
        hasAccommodationSelections = true
        if (row.confirmedAt === undefined || row.confirmedAt === null) {
          hasUnconfirmedRow = true
        }
      }
      if (hasUnconfirmedRow) {
        pendingOrderCount += 1
        if (pendingOrders.length < PENDING_ORDERS_DISPLAY_LIMIT) {
          pendingOrders.push({
            orderId: order._id,
            bookingRef: order.bookingRef ?? null,
            bookerName: order.bookerName ?? null,
            selectionCount,
          })
        }
      }
    }

    const rates = rateRows.map((rate) => {
      const category = categoryById.get(rate.categoryId)
      return {
        ...rate,
        categoryCode: category?.code ?? null,
        categoryLabel: category?.label ?? null,
      }
    })

    const options = eventOptionRows.map((row) => {
      const option = optionById.get(row.optionId)
      return {
        ...row,
        optionCode: option?.code ?? null,
        optionLabel: option?.label ?? null,
        kind: option?.kind ?? null,
        unit: option?.unit ?? null,
      }
    })

    const resources = resourceRows.map((row) => {
      const roomType = row.roomTypeId
        ? roomTypeById.get(row.roomTypeId)
        : undefined
      return {
        ...row,
        roomTypeLabel: roomType?.label ?? null,
        sellableBeds: deriveResourceSellableBeds({
          count: row.count,
          kind: row.kind,
          roomTypeDefaultCapacity: roomType?.defaultCapacity ?? null,
        }),
      }
    })

    return {
      event: {
        eventId: event._id,
        slug: event.slug,
        title: event.title,
        startsAt: event.startsAt,
        timezone: event.timezone,
      },
      config: configRow ?? null,
      activeCategories,
      rates,
      options,
      resources,
      pendingOrders,
      pendingOrderCount,
      hasAccommodationSelections,
      catalogCategories: sortBySortOrder(catalogData.categories),
      catalogOptions: catalogData.options,
      catalogRoomTypes: catalogData.roomTypes,
    }
  },
})

export const createAccommodationCategory = mutation({
  args: {
    code: categoryCodeValidator,
    label: v.string(),
    description: v.optional(v.string()),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const label = args.label.trim()
    if (!label) {
      throw new Error("Category label is required")
    }
    if (!isNonNegativeInteger(args.sortOrder)) {
      throw new Error("sortOrder must be a non-negative integer")
    }
    const existing = await ctx.db
      .query("accommodationCategories")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first()
    if (existing) {
      throw new Error(`Category code "${args.code}" already exists`)
    }
    return await ctx.db.insert("accommodationCategories", {
      code: args.code,
      label,
      description: normalizeOptionalString(args.description) ?? undefined,
      sortOrder: args.sortOrder,
    })
  },
})

export const updateAccommodationCategory = mutation({
  args: {
    categoryId: v.id("accommodationCategories"),
    label: v.optional(v.string()),
    description: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const category = await ctx.db.get("accommodationCategories", args.categoryId)
    if (!category) {
      throw new Error("Category not found")
    }
    const patch: Partial<Doc<"accommodationCategories">> = {}
    if (args.label !== undefined) {
      const label = args.label.trim()
      if (!label) {
        throw new Error("Category label is required")
      }
      patch.label = label
    }
    if (args.description !== undefined) {
      patch.description = normalizeOptionalString(args.description) ?? undefined
    }
    if (args.sortOrder !== undefined) {
      if (!isNonNegativeInteger(args.sortOrder)) {
        throw new Error("sortOrder must be a non-negative integer")
      }
      patch.sortOrder = args.sortOrder
    }
    await ctx.db.patch("accommodationCategories", args.categoryId, patch)
    return await ctx.db.get("accommodationCategories", args.categoryId)
  },
})

/**
 * Locked catalog semantics for the built-in option codes. The event option
 * mutation always stores a per-unit price, so the cot code must be `per_night`
 * with the addon kind or the catalog would describe an option whose unit
 * disagrees with the pricing contract. Custom option codes are free-form.
 */
export const LOCKED_OPTION_SEMANTICS: Record<
  string,
  {
    kind: "addon" | "upgrade" | "eligibility"
    unit: "per_night" | "per_person"
  }
> = {
  cot: { kind: "addon", unit: "per_night" },
}

export function isValidOptionSemantics(input: {
  code: string
  kind: string
  unit: string
}): boolean {
  const locked = LOCKED_OPTION_SEMANTICS[input.code]
  if (!locked) {
    return true
  }
  return input.kind === locked.kind && input.unit === locked.unit
}

export const createAccommodationOption = mutation({
  args: {
    code: optionCodeValidator,
    label: v.string(),
    description: v.optional(v.string()),
    kind: optionKindValidator,
    unit: optionUnitValidator,
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const label = args.label.trim()
    if (!label) {
      throw new Error("Option label is required")
    }
    if (!isValidOptionSemantics({ code: args.code, kind: args.kind, unit: args.unit })) {
      const locked = LOCKED_OPTION_SEMANTICS[args.code]
      throw new Error(
        `Option code "${args.code}" requires kind "${locked?.kind}" and unit "${locked?.unit}"`
      )
    }
    const existing = await ctx.db
      .query("accommodationOptions")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first()
    if (existing) {
      throw new Error(`Option code "${args.code}" already exists`)
    }
    return await ctx.db.insert("accommodationOptions", {
      code: args.code,
      label,
      description: normalizeOptionalString(args.description) ?? undefined,
      kind: args.kind,
      unit: args.unit,
    })
  },
})

export const updateAccommodationOption = mutation({
  args: {
    optionId: v.id("accommodationOptions"),
    label: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const option = await ctx.db.get("accommodationOptions", args.optionId)
    if (!option) {
      throw new Error("Option not found")
    }
    const patch: Partial<Doc<"accommodationOptions">> = {}
    if (args.label !== undefined) {
      const label = args.label.trim()
      if (!label) {
        throw new Error("Option label is required")
      }
      patch.label = label
    }
    if (args.description !== undefined) {
      patch.description = normalizeOptionalString(args.description) ?? undefined
    }
    await ctx.db.patch("accommodationOptions", args.optionId, patch)
    return await ctx.db.get("accommodationOptions", args.optionId)
  },
})

/**
 * Extended-stay policy is stored as three booleans. `allowExtendedStayBoth`
 * must imply both directional flags, otherwise consumers would read a
 * contradictory policy ("both" while neither direction is allowed). This
 * normalizes the trio so `both` forces both directions to true.
 */
export function normalizeExtendedStayFlags(input: {
  allowExtendedStayBefore: boolean
  allowExtendedStayAfter: boolean
  allowExtendedStayBoth: boolean
}): {
  allowExtendedStayBefore: boolean
  allowExtendedStayAfter: boolean
  allowExtendedStayBoth: boolean
} {
  const { allowExtendedStayBoth } = input
  return {
    allowExtendedStayBefore:
      allowExtendedStayBoth || input.allowExtendedStayBefore,
    allowExtendedStayAfter: allowExtendedStayBoth || input.allowExtendedStayAfter,
    allowExtendedStayBoth,
  }
}

/**
 * Returns a strictly monotonic config version: `Date.now()` when there is no
 * previous version, or at least `previous + 1` so two successful writes in
 * the same millisecond can never share a version. The single version boundary
 * must strictly advance for a confirmation to record an unambiguous
 * `configVersion`.
 */
function nextConfigVersion(
  previousUpdatedAt: number | null | undefined
): number {
  return Math.max(Date.now(), (previousUpdatedAt ?? 0) + 1)
}

/**
 * Advances the single event accommodation config version boundary after an
 * event-scoped pricing/config write (rates, options, resources, age pricing).
 * The version lives on `eventAccommodationConfig.updatedAt` — there is
 * deliberately no second version field. When no config row exists yet (e.g.
 * an admin saves a rate before ever saving the stay window), the singleton is
 * initialized from the existing default one-night-before-event window so a
 * later confirmation always has a `configVersion` to record. This never
 * touches orders, selection rows, totals, or payment links.
 */
async function touchEventAccommodationConfigVersion(
  ctx: MutationCtx,
  eventId: Id<"events">
) {
  const existing = await ctx.db
    .query("eventAccommodationConfig")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .unique()

  if (existing) {
    await ctx.db.patch("eventAccommodationConfig", existing._id, {
      updatedAt: nextConfigVersion(existing.updatedAt),
    })
    return
  }

  const event = await getEventOrThrow(ctx, eventId)
  const window = deriveInitialStayWindow(event.startsAt)
  const nightCount = deriveNightCount(window.baseCheckInAt, window.baseCheckOutAt)
  await ctx.db.insert("eventAccommodationConfig", {
    eventId,
    baseCheckInAt: window.baseCheckInAt,
    baseCheckOutAt: window.baseCheckOutAt,
    allowExtendedStayBefore: false,
    allowExtendedStayAfter: false,
    allowExtendedStayBoth: false,
    breakfastIncluded: false,
    nightCount,
    updatedAt: nextConfigVersion(null),
  })
}

export const upsertEventAccommodationConfig = mutation({
  args: {
    eventId: v.id("events"),
    baseCheckInAt: v.optional(v.number()),
    baseCheckOutAt: v.optional(v.number()),
    allowExtendedStayBefore: v.optional(v.boolean()),
    allowExtendedStayAfter: v.optional(v.boolean()),
    allowExtendedStayBoth: v.optional(v.boolean()),
    defaultCategoryId: v.optional(v.id("accommodationCategories")),
    breakfastIncluded: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const event = await getEventOrThrow(ctx, args.eventId)
    if (
      (args.baseCheckInAt === undefined) !== (args.baseCheckOutAt === undefined)
    ) {
      throw new Error("Both baseCheckInAt and baseCheckOutAt are required")
    }
    if (args.defaultCategoryId !== undefined) {
      const category = await ctx.db.get(
        "accommodationCategories",
        args.defaultCategoryId
      )
      if (!category) {
        throw new Error("Category not found")
      }
    }

    const existing = await ctx.db
      .query("eventAccommodationConfig")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique()

    if (existing) {
      const baseCheckInAt = args.baseCheckInAt ?? existing.baseCheckInAt
      const baseCheckOutAt = args.baseCheckOutAt ?? existing.baseCheckOutAt
      const nightCount = deriveNightCount(baseCheckInAt, baseCheckOutAt)
      const extendedStay = normalizeExtendedStayFlags({
        allowExtendedStayBefore:
          args.allowExtendedStayBefore ?? existing.allowExtendedStayBefore,
        allowExtendedStayAfter:
          args.allowExtendedStayAfter ?? existing.allowExtendedStayAfter,
        allowExtendedStayBoth:
          args.allowExtendedStayBoth ?? existing.allowExtendedStayBoth,
      })
      await ctx.db.patch("eventAccommodationConfig", existing._id, {
        baseCheckInAt,
        baseCheckOutAt,
        allowExtendedStayBefore: extendedStay.allowExtendedStayBefore,
        allowExtendedStayAfter: extendedStay.allowExtendedStayAfter,
        allowExtendedStayBoth: extendedStay.allowExtendedStayBoth,
        defaultCategoryId:
          args.defaultCategoryId === undefined
            ? existing.defaultCategoryId
            : args.defaultCategoryId,
        breakfastIncluded: args.breakfastIncluded ?? existing.breakfastIncluded,
        nightCount,
        updatedAt: nextConfigVersion(existing.updatedAt),
      })
      return await ctx.db.get("eventAccommodationConfig", existing._id)
    }

    // Newly initialized: default to the locked initial one-night-before-event
    // window when no explicit timestamps are supplied.
    const window =
      args.baseCheckInAt !== undefined && args.baseCheckOutAt !== undefined
        ? {
            baseCheckInAt: args.baseCheckInAt,
            baseCheckOutAt: args.baseCheckOutAt,
          }
        : deriveInitialStayWindow(event.startsAt)
    const nightCount = deriveNightCount(window.baseCheckInAt, window.baseCheckOutAt)
    const extendedStay = normalizeExtendedStayFlags({
      allowExtendedStayBefore: args.allowExtendedStayBefore ?? false,
      allowExtendedStayAfter: args.allowExtendedStayAfter ?? false,
      allowExtendedStayBoth: args.allowExtendedStayBoth ?? false,
    })
    const id = await ctx.db.insert("eventAccommodationConfig", {
      eventId: args.eventId,
      baseCheckInAt: window.baseCheckInAt,
      baseCheckOutAt: window.baseCheckOutAt,
      allowExtendedStayBefore: extendedStay.allowExtendedStayBefore,
      allowExtendedStayAfter: extendedStay.allowExtendedStayAfter,
      allowExtendedStayBoth: extendedStay.allowExtendedStayBoth,
      defaultCategoryId: args.defaultCategoryId,
      breakfastIncluded: args.breakfastIncluded ?? false,
      nightCount,
      updatedAt: nextConfigVersion(null),
    })
    return await ctx.db.get("eventAccommodationConfig", id)
  },
})

export const upsertEventAccommodationRate = mutation({
  args: {
    eventId: v.id("events"),
    categoryId: v.id("accommodationCategories"),
    occupancy: occupancyValidator,
    pricePerPersonMinor: v.number(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await getEventOrThrow(ctx, args.eventId)
    const category = await ctx.db.get("accommodationCategories", args.categoryId)
    if (!category) {
      throw new Error("Category not found")
    }
    if (!isNonNegativePrice(args.pricePerPersonMinor)) {
      throw new Error("pricePerPersonMinor must be a non-negative number")
    }
    const existing = await ctx.db
      .query("eventAccommodationRates")
      .withIndex("by_eventId_and_categoryId_and_occupancy", (q) =>
        q
          .eq("eventId", args.eventId)
          .eq("categoryId", args.categoryId)
          .eq("occupancy", args.occupancy)
      )
      .first()
    if (existing) {
      await ctx.db.patch("eventAccommodationRates", existing._id, {
        pricePerPersonMinor: args.pricePerPersonMinor,
      })
      await touchEventAccommodationConfigVersion(ctx, args.eventId)
      return await ctx.db.get("eventAccommodationRates", existing._id)
    }
    const id = await ctx.db.insert("eventAccommodationRates", args)
    await touchEventAccommodationConfigVersion(ctx, args.eventId)
    return await ctx.db.get("eventAccommodationRates", id)
  },
})

export const upsertEventAccommodationOption = mutation({
  args: {
    eventId: v.id("events"),
    optionId: v.id("accommodationOptions"),
    enabled: v.optional(v.boolean()),
    priceMinor: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await getEventOrThrow(ctx, args.eventId)
    const option = await ctx.db.get("accommodationOptions", args.optionId)
    if (!option) {
      throw new Error("Option not found")
    }
    if (args.priceMinor !== undefined && !isNonNegativePrice(args.priceMinor)) {
      throw new Error("priceMinor must be a non-negative number")
    }

    const existing = await ctx.db
      .query("eventAccommodationOptions")
      .withIndex("by_eventId_and_optionId", (q) =>
        q.eq("eventId", args.eventId).eq("optionId", args.optionId)
      )
      .first()

    if (existing) {
      await ctx.db.patch("eventAccommodationOptions", existing._id, {
        enabled: args.enabled ?? existing.enabled,
        priceMinor: args.priceMinor ?? existing.priceMinor,
        notes:
          args.notes === undefined
            ? existing.notes
            : normalizeOptionalString(args.notes) ?? undefined,
      })
      await touchEventAccommodationConfigVersion(ctx, args.eventId)
      return await ctx.db.get("eventAccommodationOptions", existing._id)
    }

    const id = await ctx.db.insert("eventAccommodationOptions", {
      eventId: args.eventId,
      optionId: args.optionId,
      enabled: args.enabled ?? false,
      priceMinor: resolveEventOptionPriceMinor(args.priceMinor),
      notes: normalizeOptionalString(args.notes) ?? undefined,
    })
    await touchEventAccommodationConfigVersion(ctx, args.eventId)
    return await ctx.db.get("eventAccommodationOptions", id)
  },
})

export const upsertEventAccommodationResource = mutation({
  args: {
    eventId: v.id("events"),
    kind: resourceKindValidator,
    roomTypeId: v.optional(v.id("accommodationRoomTypes")),
    count: v.number(),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await getEventOrThrow(ctx, args.eventId)
    if (!isNonNegativeInteger(args.count)) {
      throw new Error("count must be a non-negative integer")
    }
    if (args.kind === "cot" && args.roomTypeId !== undefined) {
      throw new Error("Cot resources cannot reference a room type")
    }
    if (args.kind === "room" && args.roomTypeId === undefined) {
      throw new Error("Room resources require a room type")
    }
    if (args.roomTypeId !== undefined) {
      const roomType = await ctx.db.get("accommodationRoomTypes", args.roomTypeId)
      if (!roomType) {
        throw new Error("Room type not found")
      }
    }
    const existing = await ctx.db
      .query("eventAccommodationResources")
      .withIndex("by_eventId_and_kind_and_roomTypeId", (q) =>
        q
          .eq("eventId", args.eventId)
          .eq("kind", args.kind)
          .eq("roomTypeId", args.roomTypeId ?? undefined)
      )
      .first()
    if (existing) {
      await ctx.db.patch("eventAccommodationResources", existing._id, {
        count: args.count,
      })
      await touchEventAccommodationConfigVersion(ctx, args.eventId)
      return await ctx.db.get("eventAccommodationResources", existing._id)
    }
    const id = await ctx.db.insert("eventAccommodationResources", args)
    await touchEventAccommodationConfigVersion(ctx, args.eventId)
    return await ctx.db.get("eventAccommodationResources", id)
  },
})

// ---------------------------------------------------------------------------
// Phase 41: Per-order accommodation configuration confirmation
//
// An explicit, authenticated confirmation persists the Phase 40 snapshot
// boundary (`confirmedAt` + `configVersion = eventAccommodationConfig.updatedAt`
// + the pure module's immutable `priceSnapshot`) on every unconfirmed
// `orderAccommodationSelections` row atomically. Confirmation accepts only an
// order ID — every rate, option price, category, night count and ticket
// inclusion flag is resolved server-side, and no client amount is ever
// accepted. Configuration saves never eagerly re-price or rewrite orders; the
// confirmation boundary is the only place selection rows are locked.
// ---------------------------------------------------------------------------

type SelectionConfirmationPatch = {
  selectionId: Id<"orderAccommodationSelections">
  confirmedAt: number
  configVersion: number
  priceSnapshot: AccommodationPriceSnapshot
}

/**
 * Resolves every unconfirmed accommodation selection of an order into a
 * Phase 40 snapshot patch using current server-side configuration. Throws for
 * missing config, an order with no selection rows, already-confirmed rows,
 * unknown selection references, or rows that cannot be priced from a complete
 * event configuration. Exported so Phase 44 assignment confirmation reuses
 * the exact snapshot-boundary code path instead of inventing a second one.
 */
export async function resolveOrderAccommodationConfirmation(
  ctx: MutationCtx,
  orderId: Id<"orders">
): Promise<{
  configVersion: number
  patches: SelectionConfirmationPatch[]
}> {
  const order = await ctx.db.get("orders", orderId)
  if (!order) {
    throw new Error("Order not found")
  }
  if (!order.eventId) {
    throw new Error("Order is not linked to an event")
  }
  const eventId = order.eventId

  const config = await ctx.db
    .query("eventAccommodationConfig")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .unique()
  if (!config) {
    throw new Error(
      "Event accommodation configuration is required before confirming an order"
    )
  }
  const configVersion = config.updatedAt

  // All selection rows through bounded async iteration — a fixed `.take(100)`
  // would silently truncate large orders and lock only part of the order.
  const selectionRows: Array<Doc<"orderAccommodationSelections">> = []
  for await (const row of ctx.db
    .query("orderAccommodationSelections")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))) {
    selectionRows.push(row)
  }
  if (selectionRows.length === 0) {
    throw new Error("Order has no accommodation selections to confirm")
  }
  for (const row of selectionRows) {
    if (row.confirmedAt !== undefined && row.confirmedAt !== null) {
      throw new Error(
        "Order already has confirmed accommodation selections"
      )
    }
  }

  // Attendee ticket selections: accommodationIncluded is resolved from the
  // attendee's ticket type (absent = false), exactly like the canonical
  // loader's live derivation. Fail-closed ownership checks: every attendee
  // must have at most one ticket selection row, and the referenced ticket
  // type must exist and belong to the order's event — a ticket type from a
  // different event must never influence this order's snapshot.
  const ticketTypeIdByAttendeeId = new Map<
    Id<"orderAttendees">,
    Id<"ticketTypes">
  >()
  for await (const ticketSelection of ctx.db
    .query("orderTicketSelections")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))) {
    // Fail closed: every ticket row must reference a real attendee of this
    // order, and each attendee may have at most one ticket selection row —
    // duplicates of the same ticket type are malformed and must never be
    // silently collapsed.
    const ticketAttendee = await ctx.db.get(
      "orderAttendees",
      ticketSelection.attendeeId
    )
    if (!ticketAttendee) {
      throw new Error("Ticket selection references an unknown attendee")
    }
    if (ticketAttendee.orderId !== orderId) {
      throw new Error("Ticket selection attendee does not belong to the order")
    }
    if (ticketTypeIdByAttendeeId.has(ticketSelection.attendeeId)) {
      throw new Error(
        "Attendee has more than one ticket selection and cannot be confirmed"
      )
    }
    ticketTypeIdByAttendeeId.set(
      ticketSelection.attendeeId,
      ticketSelection.ticketTypeId
    )
  }
  const ticketTypeIds = [...new Set(ticketTypeIdByAttendeeId.values())]
  const ticketTypes = await Promise.all(
    ticketTypeIds.map((ticketTypeId) => ctx.db.get("ticketTypes", ticketTypeId))
  )
  const ticketTypeById = new Map<
    string,
    Doc<"ticketTypes">
  >()
  for (const ticketType of ticketTypes) {
    if (!ticketType) continue
    ticketTypeById.set(String(ticketType._id), ticketType)
  }
  const ticketAccommodationIncludedByType = new Map<
    string,
    boolean
  >()
  for (const [, ticketTypeId] of ticketTypeIdByAttendeeId) {
    const ticketType = ticketTypeById.get(String(ticketTypeId))
    if (!ticketType) {
      throw new Error("Attendee references an unknown ticket type")
    }
    if (ticketType.eventId !== eventId) {
      throw new Error(
        "Attendee ticket type does not belong to the order's event"
      )
    }
    ticketAccommodationIncludedByType.set(
      String(ticketTypeId),
      ticketType.accommodationIncluded === true
    )
  }

  // Event rates keyed by `${categoryId}:${occupancy}` and enabled option
  // prices keyed by option code — the same resolution the canonical loader
  // uses, so a confirmed snapshot always matches live pricing at confirmation.
  const rateByKey = new Map<string, number>()
  for await (const rate of ctx.db
    .query("eventAccommodationRates")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))) {
    rateByKey.set(`${String(rate.categoryId)}:${rate.occupancy}`, rate.pricePerPersonMinor)
  }

  const eventOptionRows: Array<Doc<"eventAccommodationOptions">> = []
  for await (const optionRow of ctx.db
    .query("eventAccommodationOptions")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))) {
    eventOptionRows.push(optionRow)
  }
  const optionDefinitionById = new Map<string, Doc<"accommodationOptions">>()
  for (const optionRow of eventOptionRows) {
    const definition = await ctx.db.get(
      "accommodationOptions",
      optionRow.optionId
    )
    if (definition) {
      optionDefinitionById.set(String(optionRow.optionId), definition)
    }
  }
  // Enabled event options resolved to typed per-unit prices keyed by option
  // code — the same resolution the canonical loader uses, so a confirmed
  // snapshot always matches live pricing at confirmation.
  const optionsByKey = new Map<string, { label: string; priceMinor: number }>()
  for (const optionRow of eventOptionRows) {
    if (!optionRow.enabled) continue
    const definition = optionDefinitionById.get(String(optionRow.optionId))
    if (!definition) continue
    optionsByKey.set(definition.code, {
      label: definition.label,
      priceMinor: optionRow.priceMinor,
    })
  }

  const optionSelectionsBySelectionId = new Map<
    string,
    Array<{ optionKey: string; quantity: number; nights: number }>
  >()
  for await (const optionRow of ctx.db
    .query("orderAccommodationOptionSelections")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))) {
    const selectionId = String(optionRow.selectionId)
    const existing = optionSelectionsBySelectionId.get(selectionId) ?? []
    existing.push({
      optionKey: optionRow.optionKey,
      quantity: optionRow.quantity,
      nights: optionRow.nights,
    })
    optionSelectionsBySelectionId.set(selectionId, existing)
  }

  const patches: SelectionConfirmationPatch[] = []
  const confirmedAt = Date.now()

  for (const row of selectionRows) {
    if (!row.categoryId || !row.occupancy) {
      throw new Error(
        "Selection is missing a category or occupancy and cannot be priced"
      )
    }
    if (
      row.nightCount === undefined ||
      row.nightCount === null ||
      !Number.isInteger(row.nightCount) ||
      row.nightCount < 0
    ) {
      throw new Error(
        "Selection night count must be a non-negative integer"
      )
    }
    // Every attendee reference must resolve to a real attendee of this
    // order — a cross-order attendee ID must never be priced or locked.
    const attendee = await ctx.db.get("orderAttendees", row.attendeeId)
    if (!attendee) {
      throw new Error("Selection references an unknown attendee")
    }
    if (attendee.orderId !== orderId) {
      throw new Error("Selection attendee does not belong to the order")
    }
    const category = await ctx.db.get(
      "accommodationCategories",
      row.categoryId
    )
    if (!category) {
      throw new Error("Selection references an unknown category")
    }
    const baseRatePerNightMinor =
      rateByKey.get(`${String(row.categoryId)}:${row.occupancy}`) ?? null
    if (baseRatePerNightMinor === null) {
      throw new Error(
        "No rate is configured for the selected category and occupancy"
      )
    }

    // Every selected option must be a key in the event's enabled option set.
    // Unknown/disabled keys fail closed; quantity and nights are normalized.
    const selectedOptionKeys = optionSelectionsBySelectionId.get(String(row._id)) ?? []
    const seenKeys = new Set<string>()
    const resolvedOptions: Array<{
      optionKey: string
      label: string
      pricePerUnitMinor: number
      quantity: number
      nights: number
    }> = []
    for (const selected of selectedOptionKeys) {
      if (seenKeys.has(selected.optionKey)) {
        throw new Error(
          `Selection selects option '${selected.optionKey}' more than once`
        )
      }
      seenKeys.add(selected.optionKey)
      const option = optionsByKey.get(selected.optionKey)
      if (!option) {
        throw new Error(
          `Selected option '${selected.optionKey}' is not enabled for this event`
        )
      }
      if (!Number.isInteger(selected.quantity) || selected.quantity <= 0) {
        throw new Error(
          `Selected option '${selected.optionKey}' has an invalid quantity`
        )
      }
      if (!Number.isInteger(selected.nights) || selected.nights <= 0) {
        throw new Error(
          `Selected option '${selected.optionKey}' has an invalid night count`
        )
      }
      resolvedOptions.push({
        optionKey: selected.optionKey,
        label: option.label,
        pricePerUnitMinor: option.priceMinor,
        quantity: selected.quantity,
        nights: selected.nights,
      })
    }

    const attendeeTicketTypeId = ticketTypeIdByAttendeeId.get(row.attendeeId)
    if (attendeeTicketTypeId === undefined) {
      throw new Error(
        "Selection attendee has no ticket selection and cannot be confirmed"
      )
    }
    const ticketAccommodationIncluded =
      ticketAccommodationIncludedByType.get(String(attendeeTicketTypeId)) ??
      false

    const priceSnapshot = buildAccommodationPriceSnapshot({
      selection: {
        attendeeId: String(row.attendeeId),
        categoryCode: category.code,
        occupancy: row.occupancy,
        nightCount: row.nightCount,
        optionSelections: resolvedOptions,
      },
      pricing: {
        baseRatePerNightMinor,
        options: resolvedOptions,
        ticketAccommodationIncluded,
        eventBaseNights: config.nightCount,
      },
    })

    patches.push({
      selectionId: row._id,
      confirmedAt,
      configVersion,
      priceSnapshot,
    })
  }

  return { configVersion, patches }
}

/**
 * Assignment-confirmation boundary (Phase 44, D-08/D-09): persists the Phase
 * 41 `confirmedAt`/`configVersion`/`priceSnapshot` boundary through the shared
 * `resolveOrderAccommodationConfirmation` resolver in the SAME Convex
 * transaction as the assignment write that follows. Every admin assignment
 * entry point that can finalize a room placement calls this before patching
 * the attendee or assignment.
 *
 * Path decisions:
 *   - No selection rows        -> legacy order, skip cleanly (nothing to lock)
 *   - Every row already confirmed -> idempotent no-op; a repeat assignment is
 *                                   allowed to proceed without re-confirming
 *   - Mixed confirmed/unconfirmed -> fail closed; an order is never half-locked
 *   - None confirmed           -> resolve + patch all rows atomically
 *
 * The resolver keeps every rate, night, timestamp, and snapshot
 * server-resolved; this wrapper never accepts client money or confirmation
 * fields and never duplicates the snapshot formula.
 */
export async function persistOrderAccommodationConfirmation(
  ctx: MutationCtx,
  orderId: Id<"orders">
): Promise<void> {
  const selectionRows: Array<Doc<"orderAccommodationSelections">> = []
  for await (const row of ctx.db
    .query("orderAccommodationSelections")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))) {
    selectionRows.push(row)
  }

  if (selectionRows.length === 0) {
    // Legacy order with no options-only selection rows: existing assignment
    // behavior is preserved and nothing is locked.
    return
  }

  // Classify each row as completely unconfirmed, completely confirmed, or
  // malformed. A confirmed row is only complete when it carries a valid
  // positive `confirmedAt`, a positive finite `configVersion`, and a complete
  // price snapshot — matching the canonical finance loader's fail-closed
  // checks exactly (any `<= 0`/non-finite value is malformed).
  const isFullyConfirmed = (row: Doc<"orderAccommodationSelections">) =>
    typeof row.confirmedAt === "number" &&
    Number.isFinite(row.confirmedAt) &&
    row.confirmedAt > 0 &&
    typeof row.configVersion === "number" &&
    Number.isFinite(row.configVersion) &&
    row.configVersion > 0 &&
    row.priceSnapshot !== undefined &&
    row.priceSnapshot !== null &&
    isCompleteAccommodationPriceSnapshot(row.priceSnapshot)

  const isCompletelyUnconfirmed = (row: Doc<"orderAccommodationSelections">) =>
    (row.confirmedAt === undefined || row.confirmedAt === null) &&
    (row.configVersion === undefined || row.configVersion === null) &&
    row.priceSnapshot === undefined

  let confirmedCount = 0
  let malformedCount = 0
  for (const row of selectionRows) {
    if (isFullyConfirmed(row)) {
      confirmedCount += 1
    } else if (!isCompletelyUnconfirmed(row)) {
      // Partial fields (e.g. confirmedAt present without a complete
      // snapshot, or a snapshot without confirmedAt) are malformed.
      malformedCount += 1
    }
  }

  if (malformedCount > 0) {
    throw new Error(
      "Order has malformed accommodation confirmation state and cannot be assigned"
    )
  }
  if (confirmedCount === selectionRows.length) {
    // Already fully confirmed: repeat assignment is an idempotent no-op.
    return
  }
  if (confirmedCount > 0) {
    throw new Error(
      "Order has partially confirmed accommodation selections and cannot be assigned"
    )
  }

  const { patches } = await resolveOrderAccommodationConfirmation(ctx, orderId)
  for (const patch of patches) {
    await ctx.db.patch("orderAccommodationSelections", patch.selectionId, {
      confirmedAt: patch.confirmedAt,
      configVersion: patch.configVersion,
      priceSnapshot: patch.priceSnapshot,
    })
  }
}

export const confirmAccommodationOrderConfiguration = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const { configVersion, patches } = await resolveOrderAccommodationConfirmation(
      ctx,
      args.orderId
    )
    for (const patch of patches) {
      await ctx.db.patch(
        "orderAccommodationSelections",
        patch.selectionId,
        {
          confirmedAt: patch.confirmedAt,
          configVersion: patch.configVersion,
          priceSnapshot: patch.priceSnapshot,
        }
      )
    }
    return {
      orderId: args.orderId,
      configVersion,
      confirmedSelectionCount: patches.length,
    }
  },
})
