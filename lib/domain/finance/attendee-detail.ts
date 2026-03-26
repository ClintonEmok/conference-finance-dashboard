import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"
import { buildMatchedTotalsByProviderOrderId } from "@/lib/domain/finance/matched-payments"
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

type PaymentMatchStatus =
  | "auto_matched"
  | "manual_assignment"
  | "ambiguous"
  | "unassigned"

type PaymentSource = "tikkie" | "bank_transfer" | "cash"

type PaymentRecord = {
  _id: string
  amountMinor: number
  paidAt: number
  orderId?: string | null
  status?: PaymentMatchStatus | null
  source: PaymentSource
  payerName: string
  reference?: string | null
  notes?: string | null
  matchedAt?: number | null
  _creationTime: number
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
    overpaidAmountMinor: number
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
    type: "payment-link" | "status-transition" | "assigned-payment"
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

  const [event, order, paymentLinks, allPayments, assignedRoomData] =
    await Promise.all([
      convexQuery(api.events.getEventById, { eventId: attendee.eventId }),
      convexQuery(api.orders.getOrderById, { orderId: attendee.orderId }),
      convexQuery(api.tikkie.getPaymentLinksByOrderId, {
        orderId: attendee.orderId,
      }),
      convexQuery(api.payments.getPayments, {}),
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
  const matchedTotalsByProviderOrderId =
    await buildMatchedTotalsByProviderOrderId([
      {
        providerOrderId: order.providerOrderId,
      },
    ])
  const paidAmountMinor = Math.max(
    0,
    matchedTotalsByProviderOrderId.get(order.providerOrderId) ?? 0
  )
  const overpaidAmountMinor = Math.max(0, paidAmountMinor - totalAmountMinor)
  const outstandingAmountMinor = deriveOutstandingAmount({
    normalizedStatus: order.normalizedStatus,
    totalAmountMinor,
    paidAmountMinor,
  })

  const paymentHistoryFromTikkie = paymentLinks.flatMap(
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

  const assignedPayments: PaymentRecord[] = []
  const legacyLookupCache = new Map<string, string | null>()

  for (const payment of (allPayments ?? []) as PaymentRecord[]) {
    if (
      !payment ||
      !Number.isFinite(payment.amountMinor) ||
      payment.amountMinor <= 0
    ) {
      continue
    }

    if (payment.status === "unassigned" || payment.status === "ambiguous") {
      continue
    }

    const rawOrderId =
      typeof payment.orderId === "string" ? payment.orderId.trim() : ""

    if (!rawOrderId) {
      continue
    }

    let providerOrderId: string | null = null

    if (rawOrderId === order.providerOrderId) {
      providerOrderId = rawOrderId
    } else if (rawOrderId === order._id) {
      providerOrderId = order.providerOrderId
    } else if (legacyLookupCache.has(rawOrderId)) {
      providerOrderId = legacyLookupCache.get(rawOrderId) ?? null
    } else {
      const legacyOrder = await convexQuery(api.orders.getOrderById, {
        orderId: rawOrderId,
      })

      const fallbackProviderOrderId =
        legacyOrder && typeof legacyOrder.providerOrderId === "string"
          ? legacyOrder.providerOrderId.trim()
          : ""

      providerOrderId = fallbackProviderOrderId || null
      legacyLookupCache.set(rawOrderId, providerOrderId)
    }

    if (providerOrderId !== order.providerOrderId) {
      continue
    }

    assignedPayments.push(payment)
  }

  const paymentHistoryFromAssignments = assignedPayments.map((payment) => {
    const sourceLabel =
      payment.source === "bank_transfer"
        ? "Bank transfer"
        : payment.source === "cash"
          ? "Cash"
          : "Tikkie"

    const noteParts = [
      payment.payerName,
      payment.reference,
      payment.notes,
    ].filter(
      (part): part is string =>
        typeof part === "string" && part.trim().length > 0
    )

    return {
      id: `payment-${payment._id}`,
      type: "assigned-payment" as const,
      title: `${sourceLabel} payment assigned`,
      status: payment.status ?? "manual_assignment",
      amountMinor: payment.amountMinor,
      happenedAt: new Date(
        payment.paidAt ?? payment._creationTime
      ).toISOString(),
      note: noteParts.length > 0 ? noteParts.join(" • ") : null,
      url: null,
    }
  })

  const paymentHistory = [
    ...paymentHistoryFromAssignments,
    ...paymentHistoryFromTikkie,
  ]

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
      overpaidAmountMinor,
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
