import { query, type QueryCtx } from "./_generated/server"
import { v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import { loadOrderAmountDueBreakdowns } from "./finance"
import { requireIdentity } from "./auth"
import {
  allocateReportPaymentsByAttendee,
  buildRegionDetailReport,
  buildStakeholderReport,
  type LocationGroup,
  type RegionDetailAttendee,
  type RegionDetailOrderGroup,
  type RegionDetailReport,
  type ReportView,
  type StakeholderReport,
} from "@/lib/domain/finance/stakeholder-report"
import {
  deriveBalanceAmounts,
  isOrderAppliedPayment,
} from "@/lib/domain/finance/amounts"
import { lookupReportShareByToken, type ReportShareDoc } from "./reportShares"
import { loadOrderAttendeesWithExtensions } from "./provider_boundary"

function normalizeLabel(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : ""
  return trimmed || null
}

function normalizeRegion(value: string | null | undefined) {
  return normalizeLabel(value)?.toLowerCase() ?? null
}

function normalizeLocationLabel(value: string | null | undefined) {
  return normalizeLabel(value)
}

function matchesRegion(value: string | null | undefined, region: string) {
  const normalizedValue = normalizeRegion(value)
  return normalizedValue === normalizeRegion(region)
}

function normalizeGenderLabel(value: Doc<"orderAttendees">["gender"] | null) {
  if (value === "male") return "MALE" as const
  if (value === "female") return "FEMALE" as const
  if (value === "mixed") return "MIXED" as const
  return "UNKNOWN" as const
}

function formatTicketTypeLabel(value: string | null | undefined) {
  const trimmed = normalizeLabel(value)
  return trimmed ?? "Unspecified ticket"
}

function buildTicketTypeSummary(parts: Array<{ label: string; quantity: number }>) {
  if (parts.length === 0) {
    return null
  }

  return parts
    .sort((left, right) => right.quantity - left.quantity || left.label.localeCompare(right.label))
    .map(({ label, quantity }) => (quantity > 1 ? `${label} × ${quantity}` : label))
    .join(", ")
}

type ReportRow = Parameters<typeof buildStakeholderReport>[0]["rows"][number]

type SharedEventReportData = {
  rows: ReportRow[]
  orderGroups: RegionDetailOrderGroup[]
  locationGroups: LocationGroup[]
}

async function loadOrdersForEvent(
  ctx: Pick<QueryCtx, "db">,
  eventId: Id<"events">
) {
  const orders: Doc<"orders">[] = []

  for await (const order of ctx.db
    .query("orders")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .order("desc")) {
    orders.push(order)
  }

  return orders
}

async function loadOrderTicketTypeResolution(
  ctx: Pick<QueryCtx, "db">,
  orderId: Id<"orders">
) {
  const selections = await ctx.db
    .query("orderTicketSelections")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
    .take(100)

  if (selections.length === 0) {
    return {
      ticketTypeSummary: null as string | null,
      ticketTypeLabelByAttendeeId: new Map<string, string>(),
    }
  }

  const ticketTypeIds = Array.from(
    new Set(selections.map((selection) => String(selection.ticketTypeId)))
  )
  const ticketTypes = await Promise.all(
    ticketTypeIds.map((id) => ctx.db.get("ticketTypes", id as Id<"ticketTypes">))
  )

  const ticketTypeLabelById = new Map<string, string>()
  for (const ticketType of ticketTypes) {
    if (!ticketType) continue
    ticketTypeLabelById.set(String(ticketType._id), formatTicketTypeLabel(ticketType.label))
  }

  const ticketTypeLabelByAttendeeId = new Map<string, string>()
  const summaryByLabel = new Map<string, { label: string; quantity: number }>()

  for (const selection of selections) {
    const label = formatTicketTypeLabel(
      ticketTypeLabelById.get(String(selection.ticketTypeId))
    )
    const quantity = Number.isFinite(selection.quantity) && selection.quantity > 0
      ? selection.quantity
      : 1

    const attendeeKey = String(selection.attendeeId)
    const existingLabel = ticketTypeLabelByAttendeeId.get(attendeeKey)
    const formatted = quantity > 1 ? `${label} × ${quantity}` : label
    ticketTypeLabelByAttendeeId.set(
      attendeeKey,
      existingLabel ? `${existingLabel} · ${formatted}` : formatted
    )

    const summaryKey = label.toLowerCase()
    const existingSummary = summaryByLabel.get(summaryKey)
    if (existingSummary) {
      existingSummary.quantity += quantity
    } else {
      summaryByLabel.set(summaryKey, { label, quantity })
    }
  }

  return {
    ticketTypeSummary: buildTicketTypeSummary(Array.from(summaryByLabel.values())),
    ticketTypeLabelByAttendeeId,
  }
}

async function batchLoadPaymentsByOrderId(
  ctx: Pick<QueryCtx, "db">,
  orders: Doc<"orders">[]
): Promise<Map<string, Doc<"payments">[]>> {
  const paymentsByOrderId = new Map<string, Doc<"payments">[]>()
  const paymentArrays = await Promise.all(
    orders.map((order) =>
      ctx.db
        .query("payments")
        .withIndex("orderId", (q) => q.eq("orderId", String(order._id)))
        .take(100)
    )
  )
  for (let i = 0; i < orders.length; i++) {
    const orderId = String(orders[i]._id)
    paymentsByOrderId.set(orderId, paymentArrays[i])
  }
  return paymentsByOrderId
}

async function loadRegionOrderGroups(
  ctx: Pick<QueryCtx, "db">,
  orders: Doc<"orders">[],
  region?: string | null
): Promise<RegionDetailOrderGroup[]> {
  const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(ctx, orders)
  const groups: RegionDetailOrderGroup[] = []

  const paymentsByOrderId = await batchLoadPaymentsByOrderId(ctx, orders)

  for (const order of orders) {
    const amountDueBreakdown = amountDueBreakdownsByOrderId.get(String(order._id))
    if (!amountDueBreakdown) {
      continue
    }

    const attendeesWithExtensions = await loadOrderAttendeesWithExtensions(ctx as QueryCtx, order._id)
    const matchingAttendees = region
      ? attendeesWithExtensions.filter((attendee) =>
          matchesRegion(attendee.location ?? null, region)
        )
      : attendeesWithExtensions

    if (matchingAttendees.length === 0) {
      continue
    }

    const payments = paymentsByOrderId.get(String(order._id)) ?? []

    const ticketTypeResolution = await loadOrderTicketTypeResolution(ctx, order._id)

    const totalPaidMinor = payments
      .filter((payment) => isOrderAppliedPayment(payment))
      .reduce((sum, payment) => sum + payment.amountMinor, 0)

    const paidByAttendeeId = allocateReportPaymentsByAttendee({
      totalPaidMinor,
      attendeeWeights: attendeesWithExtensions.map((attendee) => ({
        attendeeId: String(attendee._id),
        weightMinor: amountDueBreakdown.amountDueByAttendeeId.get(String(attendee._id)) ?? 0,
      })),
    })

    const attendees: RegionDetailOrderGroup["attendees"] = []
    let groupAmountDueMinor = 0
    let groupPaidMinor = 0
    let groupOutstandingMinor = 0
    let groupOverpaidMinor = 0

    for (const attendee of matchingAttendees) {
      const amountDueMinor =
        amountDueBreakdown.amountDueByAttendeeId.get(String(attendee._id)) ?? 0
      const paidMinor = paidByAttendeeId.get(String(attendee._id)) ?? 0
      const balance = deriveBalanceAmounts(amountDueMinor, paidMinor)
      const ticketTypeLabel =
        ticketTypeResolution.ticketTypeLabelByAttendeeId.get(String(attendee._id)) ??
        attendee.ticketTypeLabel ??
        null

      attendees.push({
        name: attendee.name,
        email: attendee.email ?? null,
        ticketTypeLabel,
        location: normalizeLocationLabel(attendee.location),
        amountDueMinor: balance.amountDueMinor,
        paidMinor: balance.appliedAmountMinor,
        outstandingMinor: balance.outstandingAmountMinor,
        overpaidMinor: balance.donationAmountMinor,
      })

      groupAmountDueMinor += balance.amountDueMinor
      groupPaidMinor += balance.paidAmountMinor
      groupOutstandingMinor += balance.outstandingAmountMinor
      groupOverpaidMinor += balance.donationAmountMinor
    }

    groups.push({
      orderId: String(order._id),
      bookingRef: order.bookingRef ?? null,
      providerOrderId: order.providerOrderId ?? null,
      orderStatus: order.status ?? "pending",
      orderedAt: new Date(
        order.submittedAt ?? order.orderedAt ?? order._creationTime
      ).toISOString(),
      bookerName: order.bookerName ?? null,
      bookerEmail: order.bookerEmail ?? null,
      ticketTypeSummary: ticketTypeResolution.ticketTypeSummary,
      amountDueMinor: groupAmountDueMinor,
      paidMinor: groupPaidMinor,
      outstandingMinor: groupOutstandingMinor,
      overpaidMinor: groupOverpaidMinor,
      attendeeCount: attendees.length,
      attendees,
    })
  }

  return groups
}

async function buildSharedEventReportData(
  ctx: Pick<QueryCtx, "db">,
  event: Doc<"events">
): Promise<SharedEventReportData> {
  const orders = await loadOrdersForEvent(ctx, event._id)
  const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(ctx, orders)
  const paymentsByOrderId = await batchLoadPaymentsByOrderId(ctx, orders)

  const rows: ReportRow[] = []
  const orderGroups: RegionDetailOrderGroup[] = []
  const locationGroupsByKey = new Map<string, LocationGroup>()

  for (const order of orders) {
    const amountDueBreakdown = amountDueBreakdownsByOrderId.get(String(order._id))
    if (!amountDueBreakdown) {
      continue
    }

    const attendeesWithExtensions = await loadOrderAttendeesWithExtensions(ctx as QueryCtx, order._id)
    const ticketTypeResolution = await loadOrderTicketTypeResolution(ctx, order._id)
    const payments = paymentsByOrderId.get(String(order._id)) ?? []

    const totalPaidMinor = payments
       .filter((payment) => isOrderAppliedPayment(payment))
      .reduce((sum, payment) => sum + payment.amountMinor, 0)

    if (attendeesWithExtensions.length === 0) {
      rows.push({
        location: null,
        genderType: null,
        ticketTypeLabel: null,
        amountDueMinor: amountDueBreakdown.amountDueMinor ?? 0,
         paidAmountMinor: deriveBalanceAmounts(
           amountDueBreakdown.amountDueMinor,
           totalPaidMinor
         ).appliedAmountMinor,
        createdAt: new Date(order._creationTime).toISOString(),
      })
      continue
    }

    const paidByAttendeeId = allocateReportPaymentsByAttendee({
      totalPaidMinor,
      attendeeWeights: attendeesWithExtensions.map((attendee) => ({
        attendeeId: String(attendee._id),
        weightMinor: amountDueBreakdown.amountDueByAttendeeId.get(String(attendee._id)) ?? 0,
      })),
    })

    const attendees: RegionDetailOrderGroup["attendees"] = []
    let groupAmountDueMinor = 0
    let groupPaidMinor = 0
    let groupOutstandingMinor = 0
    let groupOverpaidMinor = 0

    for (const attendee of attendeesWithExtensions) {
      const amountDueMinor =
        amountDueBreakdown.amountDueByAttendeeId.get(String(attendee._id)) ?? 0
      const paidMinor = paidByAttendeeId.get(String(attendee._id)) ?? 0
      const balance = deriveBalanceAmounts(amountDueMinor, paidMinor)
      const ticketTypeLabel =
        ticketTypeResolution.ticketTypeLabelByAttendeeId.get(String(attendee._id)) ??
        attendee.ticketTypeLabel ??
        null
      const location = normalizeLocationLabel(attendee.location)

      const attendeeReportRow = {
        name: attendee.name,
        email: attendee.email ?? null,
        ticketTypeLabel,
        location,
        amountDueMinor: balance.amountDueMinor,
        paidMinor: balance.paidAmountMinor,
        outstandingMinor: balance.outstandingAmountMinor,
        overpaidMinor: balance.donationAmountMinor,
      }

      rows.push({
        location,
        genderType: normalizeGenderLabel(attendee.gender),
        ticketTypeLabel,
        amountDueMinor: balance.amountDueMinor,
        paidAmountMinor: balance.paidAmountMinor,
        createdAt: new Date(order._creationTime).toISOString(),
      })

      attendees.push(attendeeReportRow)
      groupAmountDueMinor += balance.amountDueMinor
      groupPaidMinor += balance.paidAmountMinor
      groupOutstandingMinor += balance.outstandingAmountMinor
      groupOverpaidMinor += balance.donationAmountMinor

      const locationKey = (location ?? "Unknown location").toLowerCase()
      let locationGroup = locationGroupsByKey.get(locationKey)
      if (!locationGroup) {
        locationGroup = {
          location: location ?? "Unknown location",
          attendeeCount: 0,
          amountDueMinor: 0,
          paidMinor: 0,
          outstandingMinor: 0,
          overpaidMinor: 0,
          attendees: [],
        }
        locationGroupsByKey.set(locationKey, locationGroup)
      }

      locationGroup.attendeeCount += 1
      locationGroup.amountDueMinor += balance.amountDueMinor
      locationGroup.paidMinor += balance.paidAmountMinor
      locationGroup.outstandingMinor += balance.outstandingAmountMinor
      locationGroup.overpaidMinor += balance.donationAmountMinor
      locationGroup.attendees.push(attendeeReportRow)
    }

    orderGroups.push({
      orderId: String(order._id),
      bookingRef: order.bookingRef ?? null,
      providerOrderId: order.providerOrderId ?? null,
      orderStatus: order.status ?? "pending",
      orderedAt: new Date(order.submittedAt ?? order.orderedAt ?? order._creationTime).toISOString(),
      bookerName: order.bookerName ?? null,
      bookerEmail: order.bookerEmail ?? null,
      ticketTypeSummary: ticketTypeResolution.ticketTypeSummary,
      amountDueMinor: groupAmountDueMinor,
      paidMinor: groupPaidMinor,
      outstandingMinor: groupOutstandingMinor,
      overpaidMinor: groupOverpaidMinor,
      attendeeCount: attendees.length,
      attendees,
    })
  }

  return {
    rows,
    orderGroups,
    locationGroups: Array.from(locationGroupsByKey.values()).sort((left, right) =>
      left.location.localeCompare(right.location)
    ),
  }
}

async function buildAggregateReport(
  ctx: Pick<QueryCtx, "db">,
  event: Doc<"events">
): Promise<StakeholderReport> {
  const orders = await loadOrdersForEvent(ctx, event._id)
  const rows = await buildReportRows(ctx, orders)

  return buildStakeholderReport({
    generatedAt: new Date().toISOString(),
    event: {
      id: String(event._id),
      slug: event.slug,
      title: event.title,
      startsAt: event.startsAt,
      currency: event.currency,
    },
    rows,
  })
}

async function buildRegionReport(
  ctx: Pick<QueryCtx, "db">,
  event: Doc<"events">,
  region: string
) {
  const orders = await loadOrdersForEvent(ctx, event._id)
  const orderGroups = await loadRegionOrderGroups(ctx, orders, region)

  return buildRegionDetailReport({
    generatedAt: new Date().toISOString(),
    event: {
      id: String(event._id),
      slug: event.slug,
      title: event.title,
      startsAt: event.startsAt,
      currency: event.currency,
    },
    region,
    orderGroups,
  })
}

async function buildAttendeesReport(
  ctx: Pick<QueryCtx, "db">,
  event: Doc<"events">
) {
  const orders = await loadOrdersForEvent(ctx, event._id)
  const orderGroups = await loadRegionOrderGroups(ctx, orders)

  return buildRegionDetailReport({
    generatedAt: new Date().toISOString(),
    event: {
      id: String(event._id),
      slug: event.slug,
      title: event.title,
      startsAt: event.startsAt,
      currency: event.currency,
    },
    region: "All attendees",
    orderGroups,
  })
}

async function buildLocationGroups(
  ctx: Pick<QueryCtx, "db">,
  event: Doc<"events">
): Promise<LocationGroup[]> {
  const { locationGroups } = await buildSharedEventReportData(ctx, event)
  return locationGroups
}

async function buildReportRows(
  ctx: Pick<QueryCtx, "db">,
  orders: Doc<"orders">[]
) {
  const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(ctx, orders)

  const rows: Array<{
    location: string | null
    genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
    ticketTypeLabel: string | null
    amountDueMinor: number
    paidAmountMinor: number
    createdAt: string
  }> = []

  const paymentsByOrderId = await batchLoadPaymentsByOrderId(ctx, orders)

  for (const order of orders) {
    const amountDueBreakdown = amountDueBreakdownsByOrderId.get(String(order._id))
    if (!amountDueBreakdown) {
      continue
    }

    const attendeesWithExtensions = await loadOrderAttendeesWithExtensions(ctx as QueryCtx, order._id)
    const ticketTypeResolution = await loadOrderTicketTypeResolution(ctx, order._id)

    const payments = paymentsByOrderId.get(String(order._id)) ?? []

     const totalPaidMinor = payments
       .filter((payment) => isOrderAppliedPayment(payment))
      .reduce((sum, payment) => sum + payment.amountMinor, 0)

    if (attendeesWithExtensions.length === 0) {
      rows.push({
        location: null,
        genderType: null,
        ticketTypeLabel: null,
        amountDueMinor: amountDueBreakdown.amountDueMinor ?? 0,
         paidAmountMinor: deriveBalanceAmounts(
           amountDueBreakdown.amountDueMinor,
           totalPaidMinor
         ).appliedAmountMinor,
        createdAt: new Date(order._creationTime).toISOString(),
      })
      continue
    }

    const paidByAttendeeId = allocateReportPaymentsByAttendee({
      totalPaidMinor,
      attendeeWeights: attendeesWithExtensions.map((attendee) => ({
        attendeeId: String(attendee._id),
        weightMinor: amountDueBreakdown.amountDueByAttendeeId.get(String(attendee._id)) ?? 0,
      })),
    })

    for (const attendee of attendeesWithExtensions) {
      const amountDueMinor =
        amountDueBreakdown.amountDueByAttendeeId.get(String(attendee._id)) ?? 0
      const paidAmountMinor = paidByAttendeeId.get(String(attendee._id)) ?? 0
      const balance = deriveBalanceAmounts(amountDueMinor, paidAmountMinor)

      rows.push({
        location: normalizeLocationLabel(attendee.location),
        genderType: normalizeGenderLabel(attendee.gender),
        ticketTypeLabel:
          ticketTypeResolution.ticketTypeLabelByAttendeeId.get(String(attendee._id)) ??
          attendee.ticketTypeLabel ??
          null,
        amountDueMinor: balance.amountDueMinor,
        paidAmountMinor: balance.paidAmountMinor,
        createdAt: new Date(order._creationTime).toISOString(),
      })
    }
  }

  return rows
}

async function getReportShareOrThrow(
  ctx: Pick<QueryCtx, "db">,
  token: string
) {
  const share: ReportShareDoc | null = await lookupReportShareByToken(ctx, token)
  if (!share) {
    return null
  }

  const event = await ctx.db.get(share.eventId)
  if (!event) {
    return null
  }

  return { share, event }
}

export async function buildReportForToken(
  ctx: Pick<QueryCtx, "db">,
  token: string
): Promise<ReportView | null> {
  const payload = await getReportShareOrThrow(ctx, token)
  if (!payload) {
    return null
  }

  if (payload.share.region) {
    return {
      kind: "region",
      report: await buildRegionReport(ctx, payload.event, payload.share.region),
    }
  }

  return {
    kind: "attendees",
    report: await buildAttendeesReport(ctx, payload.event),
  }
}

export const getReportByToken = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    return await buildReportForToken(ctx, args.token)
  },
})

async function buildRegionAggregateReport(
  ctx: Pick<QueryCtx, "db">,
  event: Doc<"events">,
  region: string
): Promise<StakeholderReport> {
  const orders = await loadOrdersForEvent(ctx, event._id)
  const allRows = await buildReportRows(ctx, orders)

  const normalized = region.toLowerCase().trim()
  const rows = allRows.filter((r) => {
    const loc = r.location?.toLowerCase().trim() ?? ""
    return loc === normalized
  })

  return buildStakeholderReport({
    generatedAt: new Date().toISOString(),
    event: {
      id: String(event._id),
      slug: event.slug,
      title: event.title,
      startsAt: event.startsAt,
      currency: event.currency,
    },
    rows,
  })
}

export type FullReportView = {
  event: {
    id: string
    slug: string
    title: string
    startsAt: number
    currency: string
  }
  aggregate: StakeholderReport | null
  regionAggregate: StakeholderReport | null
  attendees: RegionDetailReport | null
  locationGroups: LocationGroup[] | null
}

export async function buildFullReportForToken(
  ctx: Pick<QueryCtx, "db">,
  token: string
): Promise<FullReportView | null> {
  const payload = await getReportShareOrThrow(ctx, token)
  if (!payload) return null

  let aggregate: StakeholderReport | null = null
  let regionAggregate: StakeholderReport | null = null
  let attendees: RegionDetailReport | null

  if (payload.share.region) {
    const [agg, att] = await Promise.all([
      buildRegionAggregateReport(ctx, payload.event, payload.share.region),
      buildRegionReport(ctx, payload.event, payload.share.region),
    ])
    regionAggregate = agg
    attendees = att
  } else {
    const shared = await buildSharedEventReportData(ctx, payload.event)
    aggregate = buildStakeholderReport({
      generatedAt: new Date().toISOString(),
      event: {
        id: String(payload.event._id),
        slug: payload.event.slug,
        title: payload.event.title,
        startsAt: payload.event.startsAt,
        currency: payload.event.currency,
      },
      rows: shared.rows,
    })

    attendees = buildRegionDetailReport({
      generatedAt: new Date().toISOString(),
      event: {
        id: String(payload.event._id),
        slug: payload.event.slug,
        title: payload.event.title,
        startsAt: payload.event.startsAt,
        currency: payload.event.currency,
      },
      region: "All attendees",
      orderGroups: shared.orderGroups,
    })

    return {
      event: {
        id: String(payload.event._id),
        slug: payload.event.slug,
        title: payload.event.title,
        startsAt: payload.event.startsAt,
        currency: payload.event.currency,
      },
      aggregate,
      regionAggregate,
      attendees,
      locationGroups: shared.locationGroups,
    }
  }

  return {
    event: {
      id: String(payload.event._id),
      slug: payload.event.slug,
      title: payload.event.title,
      startsAt: payload.event.startsAt,
      currency: payload.event.currency,
    },
    aggregate,
    regionAggregate,
    attendees,
    locationGroups: null,
  }
}

export const getFullReportByToken = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    return await buildFullReportForToken(ctx, args.token)
  },
})

export const getEventLocations = query({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)

    const orders = await loadOrdersForEvent(ctx, args.eventId)
    const locations = new Map<string, string>()

    for (const order of orders) {
      const attendees = await loadOrderAttendeesWithExtensions(ctx as QueryCtx, order._id)

      for (const attendee of attendees) {
        const value = normalizeLabel(attendee.location ?? null)
        if (!value) continue

        const key = value.toLowerCase()
        if (!locations.has(key)) {
          locations.set(key, value)
        }
      }
    }

    return Array.from(locations.values()).sort((left, right) =>
      left.localeCompare(right)
    )
  },
})
