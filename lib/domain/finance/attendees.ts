import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"
import { buildMatchedTotalsByProviderOrderId } from "@/lib/domain/finance/matched-payments"

export type AttendeeLedgerFilters = {
  eventId?: string | null
  from?: Date | string | null
  to?: Date | string | null
  search?: string | null
  page?: number
  pageSize?: number
}

export type CanonicalOrderStatus = "paid" | "refunded" | "cancelled" | "pending"

export type AttendeeLedgerRow = {
  attendeeId: string
  providerAttendeeId: string | null
  providerIssuedTicketId: string | null
  providerOrderId: string
  providerEventId: string
  eventName: string | null
  attendeeName: string | null
  attendeeEmail: string | null
  ticketTypeLabel: string | null
  normalizedStatus: CanonicalOrderStatus
  totalAmountMinor: number
  outstandingAmountMinor: number
  genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
  location: string | null
  remarks: string | null
  allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
  priorityReason: string | null
  ageGroup: string | null
  ticketCategory: string | null
  roomStatus:
    | {
        status: "assigned"
        roomLabel: string
        hotelName: string
        roomTypeLabel: string
      }
    | {
        status: "unassigned"
        roomLabel: null
        hotelName: null
        roomTypeLabel: null
      }
  orderedAt: string | null
}

export type AttendeeLedgerResult = {
  generatedAt: string
  filters: {
    eventId: string | null
    from: string
    to: string
    search: string | null
    page: number
    pageSize: number
  }
  availableEvents: Array<{
    providerEventId: string
    name: string | null
  }>
  page: {
    number: number
    size: number
    totalRows: number
    totalPages: number
  }
  rows: AttendeeLedgerRow[]
}

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 200

function parseDate(
  value: Date | string | null | undefined,
  field: "from" | "to"
) {
  if (!value) {
    return null
  }

  const parsed = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid '${field}' date. Provide an ISO-8601 date string.`)
  }

  return parsed
}

function normalizeRange(filters: AttendeeLedgerFilters) {
  const now = new Date()
  const to = parseDate(filters.to, "to") ?? now
  const from =
    parseDate(filters.from, "from") ?? new Date(to.getTime() - 29 * DAY_MS)

  if (from.getTime() > to.getTime()) {
    throw new Error(
      "Invalid date range. 'from' must be less than or equal to 'to'."
    )
  }

  return { from, to }
}

function normalizePagination(page?: number, pageSize?: number) {
  const safePage = Number.isFinite(page)
    ? Math.max(DEFAULT_PAGE, Math.floor(page as number))
    : DEFAULT_PAGE
  const safePageSize = Number.isFinite(pageSize)
    ? Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(pageSize as number)))
    : DEFAULT_PAGE_SIZE

  return {
    page: safePage,
    pageSize: safePageSize,
  }
}

function deriveOrderOutstandingAmount(
  status: CanonicalOrderStatus,
  totalAmountMinor: number,
  matchedAmountMinor: number
) {
  if (status !== "pending" && status !== "cancelled") {
    return 0
  }

  return Math.max(0, totalAmountMinor - matchedAmountMinor)
}

function deriveAttendeeOutstandingAmount(
  orderOutstandingAmountMinor: number,
  attendeeCount: number,
  attendeePosition: number
) {
  if (orderOutstandingAmountMinor <= 0) {
    return 0
  }

  const safeAttendeeCount = Math.max(attendeeCount, 1)
  const safeAttendeePosition = Math.max(attendeePosition, 0)
  const baseAmount = Math.floor(orderOutstandingAmountMinor / safeAttendeeCount)
  const remainder = orderOutstandingAmountMinor % safeAttendeeCount

  return baseAmount + (safeAttendeePosition < remainder ? 1 : 0)
}

type ConvexAttendee = {
  _id: string
  providerAttendeeId: string | null
  providerIssuedTicketId: string | null
  providerOrderId: string
  providerEventId: string
  eventId: string
  orderId: string
  name: string | null
  email: string | null
  ticketTypeLabel: string | null
  genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
  allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
  priorityReason: string | null
  ageGroup: string | null
  ticketCategory: string | null
  assignedRoomId: string | null
  customAnswers: unknown | null
}

type ConvexOrder = {
  _id: string
  providerOrderId: string
  providerEventId: string
  eventId: string
  normalizedStatus: CanonicalOrderStatus | null
  totalAmountMinor: number | null
  orderedAt: number | null
}

type ConvexEvent = {
  _id: string
  providerEventId: string
  name: string | null
}

type ConvexRoom = {
  _id: string
  label: string
  hotelId: string
  roomTypeId: string
}

type ConvexHotel = {
  _id: string
  name: string
}

type ConvexRoomType = {
  _id: string
  label: string
}

export async function getAttendeeLedger(
  filters: AttendeeLedgerFilters = {}
): Promise<AttendeeLedgerResult> {
  const eventId =
    typeof filters.eventId === "string" && filters.eventId.trim()
      ? filters.eventId.trim()
      : null
  const search =
    typeof filters.search === "string" && filters.search.trim()
      ? filters.search.trim()
      : null
  const { from, to } = normalizeRange(filters)
  const { page, pageSize } = normalizePagination(filters.page, filters.pageSize)

  const [
    allAttendees,
    availableEvents,
    allOrders,
    allRooms,
    allHotels,
    allRoomTypes,
  ] = (await Promise.all([
    convexQuery(api.attendees.getAttendees, {
      eventId: eventId ?? undefined,
    }),
    convexQuery(api.events.getEvents, {}),
    convexQuery(api.orders.getOrders, {}),
    convexQuery(api.accommodation.getRooms, {}),
    convexQuery(api.accommodation.getHotels, {}),
    convexQuery(api.accommodation.getRoomTypes, {}),
  ])) as [
    ConvexAttendee[],
    ConvexEvent[],
    ConvexOrder[],
    ConvexRoom[],
    ConvexHotel[],
    ConvexRoomType[],
  ]

  const orderMap = new Map(allOrders.map((o) => [o._id, o]))
  const eventMap = new Map(availableEvents.map((e) => [e.providerEventId, e]))
  const roomMap = new Map(allRooms.map((r) => [r._id, r]))
  const hotelMap = new Map(allHotels.map((h) => [h._id, h]))
  const roomTypeMap = new Map(allRoomTypes.map((rt) => [rt._id, rt]))

  const attendeeIdsByOrderId = new Map<string, string[]>()
  for (const attendee of allAttendees) {
    const existingIds = attendeeIdsByOrderId.get(attendee.orderId) ?? []
    existingIds.push(attendee._id)
    attendeeIdsByOrderId.set(attendee.orderId, existingIds)
  }

  const attendeePositionByOrderId = new Map<string, Map<string, number>>()
  for (const [orderId, attendeeIds] of attendeeIdsByOrderId.entries()) {
    const sortedIds = [...attendeeIds].sort((left, right) =>
      left.localeCompare(right)
    )
    attendeeIdsByOrderId.set(orderId, sortedIds)
    attendeePositionByOrderId.set(
      orderId,
      new Map(sortedIds.map((attendeeId, index) => [attendeeId, index]))
    )
  }

  const fromTime = from.getTime()
  const toTime = to.getTime()

  let filteredAttendees = allAttendees.filter((a) => {
    const order = orderMap.get(a.orderId)
    if (!order?.orderedAt) return false
    const orderTime = order.orderedAt
    return orderTime >= fromTime && orderTime <= toTime
  })

  if (search) {
    const searchLower = search.toLowerCase()
    filteredAttendees = filteredAttendees.filter(
      (a) =>
        a.name?.toLowerCase().includes(searchLower) ||
        a.email?.toLowerCase().includes(searchLower) ||
        a.ticketTypeLabel?.toLowerCase().includes(searchLower) ||
        a.providerOrderId.toLowerCase().includes(searchLower)
    )
  }

  const matchedTotalsByProviderOrderId =
    await buildMatchedTotalsByProviderOrderId(
      filteredAttendees.map((attendee) => ({
        providerOrderId:
          orderMap.get(attendee.orderId)?.providerOrderId ??
          attendee.providerOrderId,
      }))
    )

  const totalRows = filteredAttendees.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const paginatedAttendees = filteredAttendees.slice(
    (page - 1) * pageSize,
    page * pageSize
  )

  const rows: AttendeeLedgerRow[] = paginatedAttendees.map((attendee) => {
    const order = orderMap.get(attendee.orderId)
    const event = eventMap.get(attendee.providerEventId)
    const room = attendee.assignedRoomId
      ? roomMap.get(attendee.assignedRoomId)
      : null
    const hotel = room ? hotelMap.get(room.hotelId) : null
    const roomType = room ? roomTypeMap.get(room.roomTypeId) : null

    const totalAmountMinor = order?.totalAmountMinor ?? 0
    const normalizedStatus = (order?.normalizedStatus ??
      "pending") as CanonicalOrderStatus
    const attendeeIds = attendeeIdsByOrderId.get(attendee.orderId) ?? []
    const attendeeCount = attendeeIds.length
    const attendeePosition =
      attendeePositionByOrderId.get(attendee.orderId)?.get(attendee._id) ?? 0
    const providerOrderId = order?.providerOrderId ?? attendee.providerOrderId
    const matchedAmountMinor =
      matchedTotalsByProviderOrderId.get(providerOrderId) ?? 0
    const orderOutstandingAmountMinor = deriveOrderOutstandingAmount(
      normalizedStatus,
      totalAmountMinor,
      matchedAmountMinor
    )

    return {
      attendeeId: attendee._id,
      providerAttendeeId: attendee.providerAttendeeId,
      providerIssuedTicketId: attendee.providerIssuedTicketId,
      providerOrderId: attendee.providerOrderId,
      providerEventId: attendee.providerEventId,
      eventName: event?.name ?? null,
      attendeeName: attendee.name ?? null,
      attendeeEmail: attendee.email ?? null,
      ticketTypeLabel: attendee.ticketTypeLabel ?? null,
      normalizedStatus,
      totalAmountMinor,
      outstandingAmountMinor: deriveAttendeeOutstandingAmount(
        orderOutstandingAmountMinor,
        attendeeCount,
        attendeePosition
      ),
      genderType: attendee.genderType,
      location:
        (attendee.customAnswers as { location?: string } | null)?.location ??
        null,
      remarks:
        (attendee.customAnswers as { remarks?: string } | null)?.remarks ??
        null,
      allocationPriority: attendee.allocationPriority ?? "NORMAL",
      priorityReason: attendee.priorityReason,
      ageGroup: attendee.ageGroup,
      ticketCategory: attendee.ticketCategory,
      roomStatus:
        room && hotel && roomType
          ? {
              status: "assigned",
              roomLabel: room.label,
              hotelName: hotel.name,
              roomTypeLabel: roomType.label,
            }
          : {
              status: "unassigned",
              roomLabel: null,
              hotelName: null,
              roomTypeLabel: null,
            },
      orderedAt: order?.orderedAt
        ? new Date(order.orderedAt).toISOString()
        : null,
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      eventId,
      from: from.toISOString(),
      to: to.toISOString(),
      search,
      page,
      pageSize,
    },
    availableEvents: availableEvents.map((e) => ({
      providerEventId: e.providerEventId,
      name: e.name,
    })),
    page: {
      number: page,
      size: pageSize,
      totalRows,
      totalPages,
    },
    rows,
  }
}
