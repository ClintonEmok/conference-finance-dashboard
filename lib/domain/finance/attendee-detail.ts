import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"
import { matchTemplateForAttendee } from "@/lib/domain/finance/tikkie-templates"
import {
  buildTikkieGenerationDefaults,
  deriveTikkieLinkCheckState,
  mapTikkiePaymentLink,
  type TikkieLinkCheckState,
  type TikkiePaymentLinkDto,
} from "@/lib/domain/finance/tikkie-links"

type RoomStatus =
  | {
      status: "assigned"
      roomLabel: string
      hotelName: string | null
      roomTypeLabel: string | null
    }
  | {
      status: "unassigned"
      roomLabel: null
      hotelName: null
      roomTypeLabel: null
    }

export type AttendeeDetail = {
  attendee: {
    id: string
    name: string | null
    email: string | null
    ticketTypeLabel: string | null
    ticketStatus: string | null
    checkedInAt: string | null
    providerIssuedTicketId: string | null
    providerOrderId: string
    providerEventId: string
    tikkieAmountOverrideMinor: number | null
  }
  signals: {
    genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
    location: string | null
    remarks: string | null
    dietary: string | null
    roommatePreference: string | null
    allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
    priorityReason: string | null
    ageGroup: string | null
    ticketCategory: string | null
  }
  familyGroup: {
    groupId: string | null
    label: string | null
    memberCount: number
    isPrimary: boolean
  } | null
  event: {
    id: string
    name: string | null
  }
  order: {
    id: string
    providerOrderId: string
    providerEventId: string
    buyerName: string | null
    buyerEmail: string | null
    normalizedStatus: "paid" | "refunded" | "cancelled" | "pending"
    orderedAt: string | null
    totalAmountMinor: number
  }
  finance: {
    outstandingAmountMinor: number
    paidAmountMinor: number
    installmentProgress: {
      totalLinks: number
      paidLinks: number
      openLinks: number
      expiredLinks: number
    }
  }
  tikkie: {
    latestLink:
      | (TikkiePaymentLinkDto & { checkState: TikkieLinkCheckState })
      | null
    history: Array<TikkiePaymentLinkDto & { checkState: TikkieLinkCheckState }>
    providerLastCheckedAt: string | null
    latestLinkCheckState: TikkieLinkCheckState
    generationDefaults: {
      amountMinor: number
      expiryDate: string
      description: string
      referenceId: string
    }
    templateFallback: {
      hasTemplate: boolean
      source: "override" | "template" | "default"
      amountMinor: number | null
      description: string | null
    } | null
    actions: {
      createEndpoint: string
      listEndpoint: string
      refreshEndpoint: string
      updateOverrideEndpoint: string
    }
  }
  paymentHistory: Array<{
    id: string
    type: "payment-link" | "status-transition"
    title: string
    status: string
    amountMinor: number | null
    happenedAt: string
    note: string | null
    url: string | null
  }>
  roomStatus: RoomStatus
}

function normalizeAttendeeId(attendeeId: string) {
  const normalized = attendeeId.trim()

  if (!normalized) {
    throw new Error("Invalid 'attendeeId'. Value is required.")
  }

  return normalized
}

function derivePaidAmount(
  totalAmountMinor: number,
  links: Array<{ status: string; amountMinor: number }>
) {
  const paidAmount = links
    .filter((link) => link.status === "paid")
    .reduce((sum, link) => sum + link.amountMinor, 0)

  return Math.min(totalAmountMinor, paidAmount)
}

function deriveOutstandingAmount(params: {
  normalizedStatus: "paid" | "refunded" | "cancelled" | "pending"
  totalAmountMinor: number
  paidAmountMinor: number
}) {
  if (
    params.normalizedStatus === "paid" ||
    params.normalizedStatus === "refunded"
  ) {
    return 0
  }

  return Math.max(0, params.totalAmountMinor - params.paidAmountMinor)
}

export async function getAttendeeDetail(
  attendeeId: string
): Promise<AttendeeDetail> {
  const normalizedAttendeeId = normalizeAttendeeId(attendeeId)

  const attendee = (await convexQuery(api.attendees.getAttendeeByStringId, {
    attendeeId: normalizedAttendeeId,
  })) as {
    _id: string
    name: string | null
    email: string | null
    ticketTypeLabel: string | null
    ticketStatus: string | null
    checkedInAt: number | null
    providerIssuedTicketId: string | null
    providerOrderId: string
    providerEventId: string
    eventId: string
    orderId: string
    assignedRoomId: string | null
    customAnswers: Record<string, unknown> | null
    genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
    allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
    priorityReason: string | null
    ageGroup: string | null
    ticketCategory: string | null
    tikkieAmountOverrideMinor: number | null
  } | null

  if (!attendee) {
    throw new Error("Attendee not found.")
  }

  const assignedRoomPromise = attendee.assignedRoomId
    ? convexQuery(api.accommodation.getRoomById, {
        roomId: attendee.assignedRoomId,
      })
    : Promise.resolve(null)

  const [event, order, paymentLinks, assignedRoomData] = await Promise.all([
    convexQuery(api.events.getEventById, { eventId: attendee.eventId }),
    convexQuery(api.orders.getOrderById, { orderId: attendee.orderId }),
    convexQuery(api.tikkie.getPaymentLinksByOrderId, {
      orderId: attendee.orderId,
    }),
    assignedRoomPromise,
  ])

  const [hotelData, roomTypeData] = await Promise.all([
    assignedRoomData
      ? convexQuery(api.accommodation.getHotelById, {
          hotelId: assignedRoomData.hotelId,
        })
      : Promise.resolve(null),
    assignedRoomData
      ? convexQuery(api.accommodation.getRoomTypeById, {
          roomTypeId: assignedRoomData.roomTypeId,
        })
      : Promise.resolve(null),
  ])

  const assignedRoom = assignedRoomData
  const hotel = hotelData
  const roomType = roomTypeData

  if (!order) {
    throw new Error("Order not found.")
  }

  if (!event) {
    throw new Error("Event not found.")
  }

  const totalAmountMinor = order.totalAmountMinor ?? 0
  const paidAmountMinor = derivePaidAmount(totalAmountMinor, paymentLinks)
  const outstandingAmountMinor = deriveOutstandingAmount({
    normalizedStatus: order.normalizedStatus,
    totalAmountMinor,
    paidAmountMinor,
  })

  const paymentHistory = paymentLinks.flatMap(
    (link: (typeof paymentLinks)[number]) => [
      {
        id: `link-${link._id}`,
        type: "payment-link" as const,
        title: `Payment link ${link.paymentRequestToken}`,
        status: link.status,
        amountMinor: link.amountMinor,
        happenedAt: new Date(link.createdAt).toISOString(),
        note: link.description,
        url: null,
      },
      ...link.transitionEvents.map(
        (event: (typeof link.transitionEvents)[number]) => ({
          id: `transition-${event._id}`,
          type: "status-transition" as const,
          title: `${event.fromStatus} -> ${event.toStatus}`,
          status: event.toStatus,
          amountMinor: link.amountMinor,
          happenedAt: new Date(event.createdAt).toISOString(),
          note: event.reason ?? event.providerStatus,
          url: null,
        })
      ),
    ]
  )

  paymentHistory.sort(
    (
      left: (typeof paymentHistory)[number],
      right: (typeof paymentHistory)[number]
    ) => right.happenedAt.localeCompare(left.happenedAt)
  )

  const tikkieLinks = paymentLinks.map(
    (link: (typeof paymentLinks)[number]) => {
      const mapped = mapTikkiePaymentLink({
        ...link,
        statusUpdatedAt: link.statusUpdatedAt,
        createdAt: link.createdAt,
      } as Parameters<typeof mapTikkiePaymentLink>[0])

      return {
        ...mapped,
        checkState: deriveTikkieLinkCheckState({
          status: mapped.status,
          providerLastCheckedAt: mapped.providerLastCheckedAt,
        }),
      }
    }
  )

  const latestLink = tikkieLinks[0] ?? null
  const templateMatch = await matchTemplateForAttendee({
    id: attendee._id,
    eventId: attendee.eventId,
    orderId: attendee.orderId,
    providerOrderId: attendee.providerOrderId,
    providerEventId: attendee.providerEventId,
    ticketTypeLabel: attendee.ticketTypeLabel,
    tikkieAmountOverrideMinor: attendee.tikkieAmountOverrideMinor,
  })
  const generationDefaults = {
    amountMinor: templateMatch.amountMinor,
    expiryDate: templateMatch.expiryDate,
    description: templateMatch.description,
    referenceId: templateMatch.referenceId,
  }

  let templateFallback: AttendeeDetail["tikkie"]["templateFallback"] = null
  if (attendee.ticketTypeLabel && attendee.ticketTypeLabel.trim()) {
    const templateMatchWithoutOverride = await matchTemplateForAttendee({
      id: attendee._id,
      eventId: attendee.eventId,
      orderId: attendee.orderId,
      providerOrderId: attendee.providerOrderId,
      providerEventId: attendee.providerEventId,
      ticketTypeLabel: attendee.ticketTypeLabel,
      tikkieAmountOverrideMinor: null,
    })
    if (templateMatchWithoutOverride.hasTemplate) {
      templateFallback = {
        hasTemplate: true,
        source: "template",
        amountMinor: templateMatchWithoutOverride.amountMinor,
        description: templateMatchWithoutOverride.description,
      }
    } else {
      templateFallback = {
        hasTemplate: false,
        source: templateMatchWithoutOverride.source,
        amountMinor: templateMatchWithoutOverride.amountMinor,
        description: templateMatchWithoutOverride.description,
      }
    }
  }

  const listEndpoint = `/api/dashboard/tikkie-links?providerOrderId=${encodeURIComponent(order.providerOrderId)}`

  const roomStatus: RoomStatus = assignedRoom
    ? {
        status: "assigned",
        roomLabel: assignedRoom.label,
        hotelName: hotel?.name ?? null,
        roomTypeLabel: roomType?.label ?? null,
      }
    : {
        status: "unassigned",
        roomLabel: null,
        hotelName: null,
        roomTypeLabel: null,
      }

  return {
    attendee: {
      id: attendee._id,
      name: attendee.name,
      email: attendee.email,
      ticketTypeLabel: attendee.ticketTypeLabel,
      ticketStatus: attendee.ticketStatus,
      checkedInAt: attendee.checkedInAt
        ? new Date(attendee.checkedInAt).toISOString()
        : null,
      providerIssuedTicketId: attendee.providerIssuedTicketId,
      providerOrderId: attendee.providerOrderId,
      providerEventId: attendee.providerEventId,
      tikkieAmountOverrideMinor: attendee.tikkieAmountOverrideMinor,
    },
    signals: {
      genderType: attendee.genderType,
      location:
        (attendee.customAnswers as { location?: string } | null)?.location ??
        null,
      remarks:
        (attendee.customAnswers as { remarks?: string } | null)?.remarks ??
        null,
      dietary:
        (attendee.customAnswers as { dietary?: string } | null)?.dietary ??
        null,
      roommatePreference:
        (attendee.customAnswers as { roommatePreference?: string } | null)
          ?.roommatePreference ?? null,
      allocationPriority: attendee.allocationPriority ?? "NORMAL",
      priorityReason: attendee.priorityReason,
      ageGroup: attendee.ageGroup,
      ticketCategory: attendee.ticketCategory,
    },
    familyGroup: null,
    event: {
      id: event._id,
      name: event.name,
    },
    order: {
      id: order._id,
      providerOrderId: order.providerOrderId,
      providerEventId: order.providerEventId,
      buyerName: order.buyerName,
      buyerEmail: order.buyerEmail,
      normalizedStatus: order.normalizedStatus,
      orderedAt: order.orderedAt
        ? new Date(order.orderedAt).toISOString()
        : null,
      totalAmountMinor,
    },
    finance: {
      outstandingAmountMinor,
      paidAmountMinor,
      installmentProgress: {
        totalLinks: paymentLinks.length,
        paidLinks: paymentLinks.filter(
          (link: (typeof paymentLinks)[number]) => link.status === "paid"
        ).length,
        openLinks: paymentLinks.filter(
          (link: (typeof paymentLinks)[number]) => link.status === "created"
        ).length,
        expiredLinks: paymentLinks.filter(
          (link: (typeof paymentLinks)[number]) => link.status === "expired"
        ).length,
      },
    },
    tikkie: {
      latestLink,
      history: tikkieLinks.slice(1),
      providerLastCheckedAt: latestLink?.providerLastCheckedAt ?? null,
      latestLinkCheckState: latestLink?.checkState ?? null,
      generationDefaults,
      templateFallback,
      actions: {
        createEndpoint: "/api/dashboard/tikkie-links",
        listEndpoint,
        refreshEndpoint: `${listEndpoint}&refresh=1`,
        updateOverrideEndpoint: `/api/dashboard/attendees/${attendee._id}`,
      },
    },
    paymentHistory,
    roomStatus,
  }
}
