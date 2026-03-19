import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"

import type { CanonicalOrderStatus } from "@/lib/domain/finance/order-ledger"

export type AttendeeLedgerFilters = {
  eventId?: string | null
  from?: Date | string | null
  to?: Date | string | null
  search?: string | null
  page?: number
  pageSize?: number
}

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
  roomStatus: "unassigned"
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

function parseDate(value: Date | string | null | undefined, field: "from" | "to") {
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
  const from = parseDate(filters.from, "from") ?? new Date(to.getTime() - 29 * DAY_MS)

  if (from.getTime() > to.getTime()) {
    throw new Error("Invalid date range. 'from' must be less than or equal to 'to'.")
  }

  return { from, to }
}

function normalizePagination(page?: number, pageSize?: number) {
  const safePage = Number.isFinite(page) ? Math.max(DEFAULT_PAGE, Math.floor(page as number)) : DEFAULT_PAGE
  const safePageSize = Number.isFinite(pageSize)
    ? Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(pageSize as number)))
    : DEFAULT_PAGE_SIZE

  return {
    page: safePage,
    pageSize: safePageSize,
  }
}

function deriveOutstandingAmount(
  status: CanonicalOrderStatus,
  totalAmountMinor: number,
  attendeeCount: number,
) {
  if (status !== "pending" && status !== "cancelled") {
    return 0
  }

  return Math.max(0, Math.round(totalAmountMinor / Math.max(attendeeCount, 1)))
}

export async function getAttendeeLedger(
  filters: AttendeeLedgerFilters = {},
): Promise<AttendeeLedgerResult> {
  const eventId = typeof filters.eventId === "string" && filters.eventId.trim() ? filters.eventId.trim() : null
  const search = typeof filters.search === "string" && filters.search.trim() ? filters.search.trim() : null
  const { from, to } = normalizeRange(filters)
  const { page, pageSize } = normalizePagination(filters.page, filters.pageSize)

  const whereClause: Prisma.TicketTailorAttendeeWhereInput = {
    order: {
      is: {
        orderedAt: {
          gte: from,
          lte: to,
        },
      },
    },
    ...(eventId ? { providerEventId: eventId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { ticketTypeLabel: { contains: search } },
            { providerIssuedTicketId: { contains: search } },
            { providerOrderId: { contains: search } },
            {
              event: {
                is: {
                  name: { contains: search },
                },
              },
            },
          ],
        }
      : {}),
  }

  const [totalRows, attendees] = await Promise.all([
    prisma.ticketTailorAttendee.count({ where: whereClause }),
    prisma.ticketTailorAttendee.findMany({
      where: whereClause,
      include: {
        event: {
          select: {
            name: true,
          },
        },
        order: {
          select: {
            normalizedStatus: true,
            totalAmountMinor: true,
            orderedAt: true,
            attendees: {
              select: {
                id: true,
              },
            },
          },
        },
      },
      orderBy: [{ order: { orderedAt: "desc" } }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))

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
    page: {
      number: page,
      size: pageSize,
      totalRows,
      totalPages,
    },
    rows: attendees.map((attendee) => {
      const totalAmountMinor = attendee.order.totalAmountMinor ?? 0
      const normalizedStatus = attendee.order.normalizedStatus as CanonicalOrderStatus

      return {
        attendeeId: attendee.id,
        providerAttendeeId: attendee.providerAttendeeId,
        providerIssuedTicketId: attendee.providerIssuedTicketId,
        providerOrderId: attendee.providerOrderId,
        providerEventId: attendee.providerEventId,
        eventName: attendee.event?.name ?? null,
        attendeeName: attendee.name ?? null,
        attendeeEmail: attendee.email ?? null,
        ticketTypeLabel: attendee.ticketTypeLabel ?? null,
        normalizedStatus,
        totalAmountMinor,
        outstandingAmountMinor: deriveOutstandingAmount(
          normalizedStatus,
          totalAmountMinor,
          attendee.order.attendees.length,
        ),
        roomStatus: "unassigned",
        orderedAt: attendee.order.orderedAt ? attendee.order.orderedAt.toISOString() : null,
      }
    }),
  }
}
