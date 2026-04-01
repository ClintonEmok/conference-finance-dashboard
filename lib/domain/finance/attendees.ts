import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"
import { buildMatchedTotalsByProviderOrderId } from "@/lib/domain/finance/matched-payments"
import {
  allocateMinorAmountByWeight,
  deriveBalanceAmounts,
} from "@/lib/domain/finance/amounts"

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
  orderId: string
  providerAttendeeId: string | null
  providerIssuedTicketId: string | null
  providerOrderId: string | null
  eventId: string
  eventSlug: string
  eventTitle: string
  attendeeName: string | null
  attendeeEmail: string | null
  ticketTypeLabel: string | null
  normalizedStatus: CanonicalOrderStatus
  amountDueMinor: number
  totalAmountMinor: number
  paidAmountMinor: number
  outstandingAmountMinor: number
  overpaidAmountMinor: number
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
    eventId: string
    slug: string
    title: string
    startsAt: string
    currency: string
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
  orderId: string
  name: string
  email: string | null
  gender: "male" | "female" | "mixed" | "unknown"
  location: string | null
  assignedRoomId: string | null
  allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
  priorityReason: string | null
  ticketTypeLabel: string | null
  amountDueMinor: number
  orderProviderOrderId: string | null
  orderEventId: string | null
  orderStatus: string | null
  orderTotalAmountMinor: number | null
  orderAmountDueMinor: number | null
  orderSubmittedAt: number | null
  orderOrderedAt: number | null
}

type ConvexOrder = {
  _id: string
  providerOrderId: string
  eventId: string
  normalizedStatus: CanonicalOrderStatus | null
  totalAmountMinor: number | null
  orderedAt: number | null
  submittedAt: number | null
}

type ConvexEvent = {
  eventId: string
  slug: string
  title: string | null
  startsAt: number | null
  currency: string | null
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

  const [allAttendees, availableEvents, allRooms, allHotels, allRoomTypes] =
    (await Promise.all([
      convexQuery(api.attendees.getAttendeesWithTickets, {
        eventId: eventId ?? undefined,
      }),
      convexQuery(api.events.getEventsForLedger, {}),
      convexQuery(api.accommodation.getRooms, {}),
      convexQuery(api.accommodation.getHotels, {}),
      convexQuery(api.accommodation.getRoomTypes, {}),
    ])) as [
      ConvexAttendee[],
      ConvexEvent[],
      ConvexRoom[],
      ConvexHotel[],
      ConvexRoomType[],
    ]

  const eventMap = new Map(availableEvents.map((e) => [e.eventId, e]))
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
    const orderTime = a.orderOrderedAt ?? a.orderSubmittedAt ?? null
    if (!orderTime) return false
    return orderTime >= fromTime && orderTime <= toTime
  })

  if (search) {
    const searchLower = search.toLowerCase()
    filteredAttendees = filteredAttendees.filter(
      (a) =>
        a.name?.toLowerCase().includes(searchLower) ||
        a.email?.toLowerCase().includes(searchLower) ||
        a.ticketTypeLabel?.toLowerCase().includes(searchLower)
    )
  }

  const matchedTotalsByProviderOrderId =
    await buildMatchedTotalsByProviderOrderId(
      filteredAttendees.map((attendee) => ({
        providerOrderId: attendee.orderProviderOrderId ?? null,
        orderId: attendee.orderId,
      }))
    )

  const totalRows = filteredAttendees.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const paginatedAttendees = filteredAttendees.slice(
    (page - 1) * pageSize,
    page * pageSize
  )

  const balancesByAttendeeId = new Map<
    string,
    {
      paidAmountMinor: number
      outstandingAmountMinor: number
      overpaidAmountMinor: number
    }
  >()

  const attendeesByOrderId = new Map<string, typeof filteredAttendees>()
  for (const attendee of filteredAttendees) {
    const existing = attendeesByOrderId.get(attendee.orderId) ?? []
    existing.push(attendee)
    attendeesByOrderId.set(attendee.orderId, existing)
  }

  for (const [orderId, attendeesForOrder] of attendeesByOrderId.entries()) {
    const providerOrderId =
      attendeesForOrder[0]?.orderProviderOrderId ?? orderId
    const orderPaidAmountMinor =
      matchedTotalsByProviderOrderId.get(providerOrderId) ?? 0
    const paidAmountByAttendeeId = allocateMinorAmountByWeight(
      orderPaidAmountMinor,
      attendeesForOrder.map((attendee) => ({
        id: attendee._id,
        weightMinor: attendee.amountDueMinor,
      }))
    )

    for (const attendee of attendeesForOrder) {
      balancesByAttendeeId.set(
        attendee._id,
        deriveBalanceAmounts(
          attendee.amountDueMinor,
          paidAmountByAttendeeId.get(attendee._id) ?? 0
        )
      )
    }
  }

  const rows: AttendeeLedgerRow[] = paginatedAttendees.map((attendee) => {
    const eventId = attendee.orderEventId
    const event = eventId ? eventMap.get(eventId) : undefined
    const room = attendee.assignedRoomId
      ? roomMap.get(attendee.assignedRoomId)
      : null
    const hotel = room ? hotelMap.get(room.hotelId) : null
    const roomType = room ? roomTypeMap.get(room.roomTypeId) : null

    const totalAmountMinor = attendee.orderTotalAmountMinor ?? 0
    const amountDueMinor = attendee.amountDueMinor
    const normalizedStatus = (attendee.orderStatus ??
      "pending") as CanonicalOrderStatus
    const balance =
      balancesByAttendeeId.get(attendee._id) ??
      deriveBalanceAmounts(amountDueMinor, 0)

    return {
      attendeeId: attendee._id,
      orderId: attendee.orderId,
      providerAttendeeId: null,
      providerIssuedTicketId: null,
      providerOrderId: attendee.orderProviderOrderId ?? null,
      eventId: eventId ?? "",
      eventSlug: event?.slug ?? "",
      eventTitle: event?.title ?? "",
      attendeeName: attendee.name,
      attendeeEmail: attendee.email ?? null,
      ticketTypeLabel: attendee.ticketTypeLabel ?? null,
      normalizedStatus,
      amountDueMinor,
      totalAmountMinor,
      paidAmountMinor: balance.paidAmountMinor,
      outstandingAmountMinor: balance.outstandingAmountMinor,
      overpaidAmountMinor: balance.overpaidAmountMinor,
      genderType: attendee.gender
        ? (attendee.gender.toUpperCase() as AttendeeLedgerRow["genderType"])
        : null,
      location: attendee.location ?? null,
      remarks: null,
      allocationPriority: attendee.allocationPriority ?? "NORMAL",
      priorityReason: attendee.priorityReason,
      ageGroup: null,
      ticketCategory: null,
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
      orderedAt: attendee.orderOrderedAt
        ? new Date(attendee.orderOrderedAt).toISOString()
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
      eventId: e.eventId,
      slug: e.slug,
      title: e.title ?? "",
      startsAt: e.startsAt ? new Date(e.startsAt).toISOString() : "",
      currency: e.currency ?? "",
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
