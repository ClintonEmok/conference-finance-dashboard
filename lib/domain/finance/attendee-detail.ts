import { prisma } from "@/lib/prisma"
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
      hotelName: string
      roomTypeLabel: string
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

  const attendee = await prisma.ticketTailorAttendee.findUnique({
    where: {
      id: normalizedAttendeeId,
    },
    include: {
      event: {
        select: {
          id: true,
          name: true,
        },
      },
      order: {
        include: {
          tikkiePaymentLinks: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            include: {
              transitionEvents: {
                orderBy: [{ createdAt: "desc" }],
              },
            },
          },
        },
      },
      assignedRoom: {
        include: {
          hotel: {
            select: {
              name: true,
            },
          },
          roomType: {
            select: {
              label: true,
            },
          },
        },
      },
      familyGroupMember: {
        include: {
          familyGroup: {
            include: {
              members: {
                select: {
                  attendeeId: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!attendee) {
    throw new Error("Attendee not found.")
  }

  const totalAmountMinor = attendee.order.totalAmountMinor ?? 0
  const paidAmountMinor = derivePaidAmount(
    totalAmountMinor,
    attendee.order.tikkiePaymentLinks
  )
  const outstandingAmountMinor = deriveOutstandingAmount({
    normalizedStatus: attendee.order.normalizedStatus,
    totalAmountMinor,
    paidAmountMinor,
  })

  const paymentHistory = attendee.order.tikkiePaymentLinks.flatMap((link) => [
    {
      id: `link-${link.id}`,
      type: "payment-link" as const,
      title: `Payment link ${link.paymentRequestToken}`,
      status: link.status,
      amountMinor: link.amountMinor,
      happenedAt: link.createdAt.toISOString(),
      note: link.description,
      url: link.paymentRequestUrl,
    },
    ...link.transitionEvents.map((event) => ({
      id: `transition-${event.id}`,
      type: "status-transition" as const,
      title: `${event.fromStatus} -> ${event.toStatus}`,
      status: event.toStatus,
      amountMinor: link.amountMinor,
      happenedAt: event.createdAt.toISOString(),
      note: event.reason ?? event.providerStatus,
      url: null,
    })),
  ])

  paymentHistory.sort((left, right) =>
    right.happenedAt.localeCompare(left.happenedAt)
  )

  const tikkieLinks = attendee.order.tikkiePaymentLinks.map((link) => {
    const mapped = mapTikkiePaymentLink(link)

    return {
      ...mapped,
      checkState: deriveTikkieLinkCheckState({
        status: mapped.status,
        providerLastCheckedAt: mapped.providerLastCheckedAt,
      }),
    }
  })

  const latestLink = tikkieLinks[0] ?? null
  const templateMatch = await matchTemplateForAttendee({
    id: attendee.id,
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

  // Build template fallback info (what would be used if override is cleared)
  let templateFallback: AttendeeDetail["tikkie"]["templateFallback"] = null
  if (attendee.ticketTypeLabel && attendee.ticketTypeLabel.trim()) {
    const templateMatchWithoutOverride = await matchTemplateForAttendee({
      id: attendee.id,
      eventId: attendee.eventId,
      orderId: attendee.orderId,
      providerOrderId: attendee.providerOrderId,
      providerEventId: attendee.providerEventId,
      ticketTypeLabel: attendee.ticketTypeLabel,
      tikkieAmountOverrideMinor: null, // Check without override to show fallback
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

  const listEndpoint = `/api/dashboard/tikkie-links?providerOrderId=${encodeURIComponent(attendee.order.providerOrderId)}`

  const roomStatus: RoomStatus = attendee.assignedRoom
    ? {
        status: "assigned",
        roomLabel: attendee.assignedRoom.label,
        hotelName: attendee.assignedRoom.hotel.name,
        roomTypeLabel: attendee.assignedRoom.roomType.label,
      }
    : {
        status: "unassigned",
        roomLabel: null,
        hotelName: null,
        roomTypeLabel: null,
      }

  return {
    attendee: {
      id: attendee.id,
      name: attendee.name ?? null,
      email: attendee.email ?? null,
      ticketTypeLabel: attendee.ticketTypeLabel ?? null,
      ticketStatus: attendee.ticketStatus ?? null,
      checkedInAt: attendee.checkedInAt
        ? attendee.checkedInAt.toISOString()
        : null,
      providerIssuedTicketId: attendee.providerIssuedTicketId ?? null,
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
      allocationPriority: attendee.allocationPriority,
      priorityReason: attendee.priorityReason,
      ageGroup: attendee.ageGroup,
      ticketCategory: attendee.ticketCategory,
    },
    familyGroup: attendee.familyGroupMember
      ? {
          groupId: attendee.familyGroupMember.familyGroup.id,
          label: attendee.familyGroupMember.familyGroup.label,
          memberCount: attendee.familyGroupMember.familyGroup.members.length,
          isPrimary:
            attendee.familyGroupMember.familyGroup.primaryAttendeeId ===
            attendee.id,
        }
      : null,
    event: {
      id: attendee.event.id,
      name: attendee.event.name ?? null,
    },
    order: {
      id: attendee.order.id,
      providerOrderId: attendee.order.providerOrderId,
      providerEventId: attendee.order.providerEventId,
      buyerName: attendee.order.buyerName ?? null,
      buyerEmail: attendee.order.buyerEmail ?? null,
      normalizedStatus: attendee.order.normalizedStatus,
      orderedAt: attendee.order.orderedAt
        ? attendee.order.orderedAt.toISOString()
        : null,
      totalAmountMinor,
    },
    finance: {
      outstandingAmountMinor,
      paidAmountMinor,
      installmentProgress: {
        totalLinks: attendee.order.tikkiePaymentLinks.length,
        paidLinks: attendee.order.tikkiePaymentLinks.filter(
          (link) => link.status === "paid"
        ).length,
        openLinks: attendee.order.tikkiePaymentLinks.filter(
          (link) => link.status === "created"
        ).length,
        expiredLinks: attendee.order.tikkiePaymentLinks.filter(
          (link) => link.status === "expired"
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
        updateOverrideEndpoint: `/api/dashboard/attendees/${attendee.id}`,
      },
    },
    paymentHistory,
    roomStatus,
  }
}
