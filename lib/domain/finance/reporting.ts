import { api } from "@/lib/convex/api"
import { convexQuery } from "@/lib/convex/server"
import {
  allocateMinorAmountByWeight,
  deriveBalanceAmounts,
} from "@/lib/domain/finance/amounts"
import { listStandaloneDonations } from "@/lib/domain/finance/standalone-donations"
import type { Id } from "@/convex/_generated/dataModel"

export type RevenueTrendGranularity = "day"

export type RevenueOverviewFilters = {
  eventId?: string | null
  from?: Date | string | null
  to?: Date | string | null
  trendGranularity?: RevenueTrendGranularity
}

type CanonicalStatus = "paid" | "refunded" | "cancelled" | "pending"

export type RevenueOverview = {
  generatedAt: string
  appliedFilters: {
    eventId: string | null
    from: string
    to: string
    trendGranularity: RevenueTrendGranularity
  }
  availableEvents: Array<{
    eventId: string
    slug: string
    title: string | null
    startsAt: number | null
    currency: string | null
  }>
  donations: Array<{
    orderId: string | null
    providerOrderId: string | null
    eventSlug: string
    eventTitle: string | null
    buyerName: string | null
    buyerEmail: string | null
    orderedAt: string | null
    amountDueMinor: number
    matchedAmountMinor: number
    donationMinor: number
    currency: string | null
    type: "overpayment" | "standalone"
  }>
  totals: {
    orderValueMinor: number
    paidMinor: number
    refundedMinor: number
    netMinor: number
    overpaidMinor: number
    standaloneDonationMinor: number
  }
  statusCounts: Record<CanonicalStatus, number>
  trend: Array<{
    bucket: string
    eventLabel: string
    orderValueMinor: number
    paidMinor: number
    refundedMinor: number
    netMinor: number
    overpaidMinor: number
    orderCount: number
  }>
}

const DAY_MS = 24 * 60 * 60 * 1000

function parseDateInput(
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

function toUtcDayBucket(value: Date) {
  const yyyy = value.getUTCFullYear()
  const mm = String(value.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(value.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function normalizeRange(filters: RevenueOverviewFilters) {
  const now = new Date()
  const requestedFrom = parseDateInput(filters.from, "from")
  const requestedTo = parseDateInput(filters.to, "to")

  const to = requestedTo ?? now
  const from = requestedFrom ?? new Date(to.getTime() - 29 * DAY_MS)

  if (from.getTime() > to.getTime()) {
    throw new Error(
      "Invalid date range. 'from' must be less than or equal to 'to'."
    )
  }

  return { from, to }
}

export async function getRevenueOverview(
  filters: RevenueOverviewFilters = {}
): Promise<RevenueOverview> {
  type RevenueOrderProjection = {
    providerOrderId: string
    orderId: string
    eventId: string
    eventSlug: string
    eventTitle: string | null
    normalizedStatus: CanonicalStatus
    amountDueMinor: number | null
    matchedAmountMinor: number | null
    totalAmountMinor: number | null
    currency: string | null
    orderedAt: string | null
    refundedAt: string | null
    buyerName: string | null
    buyerEmail: string | null
  }

  const eventId =
    typeof filters.eventId === "string" && filters.eventId.trim()
      ? filters.eventId.trim()
      : null
  const trendGranularity = filters.trendGranularity ?? "day"
  const { from, to } = normalizeRange(filters)

  const fromMs = from.getTime()
  const toMs = to.getTime()

  const [orders, availableEvents, standaloneDonations] = (await Promise.all([
    convexQuery(api.orders.getOrdersForReconciliation, {
      eventId: eventId ?? undefined,
      from: fromMs,
      to: toMs,
    }),
    convexQuery(api.events.getEventsForLedger, {}),
    listStandaloneDonations({
      eventId: eventId ? (eventId as Id<"events">) : undefined,
      from: fromMs,
      to: toMs,
    }),
  ])) as [
    RevenueOrderProjection[],
    Array<{
      eventId: string
      slug: string
      title: string | null
      startsAt: number | null
      currency: string | null
    }>,
    Awaited<ReturnType<typeof listStandaloneDonations>>,
  ]

  const statusCounts: Record<CanonicalStatus, number> = {
    paid: 0,
    refunded: 0,
    cancelled: 0,
    pending: 0,
  }

  for (const order of orders) {
    const key = order.normalizedStatus
    statusCounts[key] = (statusCounts[key] || 0) + 1
  }

  const trendMap = new Map<
    string,
    {
      orderValueMinor: number
      paidMinor: number
      refundedMinor: number
      netMinor: number
      overpaidMinor: number
      orderCount: number
      eventLabel: string
    }
  >()

  let orderValueMinor = 0
  let paidMinor = 0
  let refundedMinor = 0
  let overpaidMinor = 0
  let standaloneDonationMinor = 0
  const donations: RevenueOverview["donations"] = []

  for (const order of orders) {
    if (!order.orderedAt) {
      continue
    }

    const amountMinor = order.amountDueMinor ?? 0
    const bucket =
      trendGranularity === "day"
        ? toUtcDayBucket(new Date(order.orderedAt))
        : toUtcDayBucket(new Date(order.orderedAt))

    const current = trendMap.get(bucket) ?? {
      eventLabel: order.eventTitle?.trim() || order.eventSlug,
      orderValueMinor: 0,
      paidMinor: 0,
      refundedMinor: 0,
      netMinor: 0,
      overpaidMinor: 0,
      orderCount: 0,
    }

    current.orderValueMinor += amountMinor
    current.orderCount += 1

    const nextEventLabel = order.eventTitle?.trim() || order.eventSlug
    if (current.eventLabel !== nextEventLabel) {
      current.eventLabel = "Multiple events"
    }

    if (order.normalizedStatus === "paid") {
      current.paidMinor += amountMinor
      paidMinor += amountMinor
    }

    if (order.normalizedStatus === "refunded") {
      current.refundedMinor += amountMinor
      refundedMinor += amountMinor
    }

    const balance = deriveBalanceAmounts(amountMinor, order.matchedAmountMinor ?? 0)
    current.overpaidMinor += balance.donationAmountMinor
    overpaidMinor += balance.donationAmountMinor

    if (balance.donationAmountMinor > 0) {
      donations.push({
        orderId: order.orderId,
        providerOrderId: order.providerOrderId,
        eventSlug: order.eventSlug,
        eventTitle: order.eventTitle,
        buyerName: order.buyerName,
        buyerEmail: order.buyerEmail,
        orderedAt: order.orderedAt,
        amountDueMinor: balance.amountDueMinor,
        matchedAmountMinor: balance.paidAmountMinor,
        donationMinor: balance.donationAmountMinor,
        currency: order.currency,
        type: "overpayment",
      })
    }

    orderValueMinor += amountMinor
    trendMap.set(bucket, current)
  }

  // Add standalone donations to the donations array and totals
  for (const donation of standaloneDonations) {
    standaloneDonationMinor += donation.amountMinor
    paidMinor += donation.amountMinor

    const eventInfo = availableEvents.find((e) => e.eventId === donation.eventId)
    const bucket = toUtcDayBucket(new Date(donation.paidAt))
    const current = trendMap.get(bucket) ?? {
      eventLabel: eventInfo?.title?.trim() || eventInfo?.slug || "Standalone donations",
      orderValueMinor: 0,
      paidMinor: 0,
      refundedMinor: 0,
      netMinor: 0,
      overpaidMinor: 0,
      orderCount: 0,
    }

    current.paidMinor += donation.amountMinor

    const nextEventLabel = eventInfo?.title?.trim() || eventInfo?.slug || "Standalone donations"
    if (current.eventLabel !== nextEventLabel) {
      current.eventLabel = "Multiple events"
    }

    trendMap.set(bucket, current)

    donations.push({
      orderId: null,
      providerOrderId: null,
      eventSlug: eventInfo?.slug ?? "",
      eventTitle: eventInfo?.title ?? null,
      buyerName: donation.payerName,
      buyerEmail: null,
      orderedAt: new Date(donation.paidAt).toISOString(),
      amountDueMinor: 0,
      matchedAmountMinor: 0,
      donationMinor: donation.amountMinor,
      currency: eventInfo?.currency ?? null,
      type: "standalone",
    })
  }

  const trend = Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, values]) => ({
      bucket,
      ...values,
      netMinor: values.paidMinor - values.refundedMinor,
    }))

  donations.sort((left, right) => {
    if (right.donationMinor !== left.donationMinor) {
      return right.donationMinor - left.donationMinor
    }

    return (right.orderedAt ?? "").localeCompare(left.orderedAt ?? "")
  })

  const netMinor = paidMinor - refundedMinor

  return {
    generatedAt: new Date().toISOString(),
    appliedFilters: {
      eventId,
      from: from.toISOString(),
      to: to.toISOString(),
      trendGranularity,
    },
    availableEvents,
    donations,
    totals: {
      orderValueMinor,
      paidMinor,
      refundedMinor,
      netMinor,
      overpaidMinor,
      standaloneDonationMinor,
    },
    statusCounts,
    trend,
  }
}

export type ReportBalanceState = "settled" | "outstanding" | "overpaid"

export type ReportInputRow = {
  location: string | null
  genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
  amountDueMinor: number
  paidAmountMinor: number
}

export type ReportSliceRow = {
  label: string
  count: number
  amountDueMinor: number
  paidMinor: number
  outstandingMinor: number
  overpaidMinor: number
}

export type StakeholderReport = {
  generatedAt: string
  event: {
    id: string
    slug: string
    title: string
    startsAt: number
    currency: string
  }
  totals: {
    rows: number
    amountDueMinor: number
    paidMinor: number
    outstandingMinor: number
    overpaidMinor: number
  }
  slices: {
    byLocation: ReportSliceRow[]
    byGender: ReportSliceRow[]
    byBalanceState: Array<ReportSliceRow & { state: ReportBalanceState }>
  }
}

function normalizeLabel(value: string | null | undefined, fallback: string) {
  const trimmed = typeof value === "string" ? value.trim() : ""
  return trimmed || fallback
}

function formatGenderLabel(value: ReportInputRow["genderType"]) {
  if (value === "MALE") return "Male"
  if (value === "FEMALE") return "Female"
  if (value === "MIXED") return "Mixed"
  if (value === "UNKNOWN") return "Unspecified"
  return "Unspecified"
}

function classifyBalanceState(row: ReportInputRow): ReportBalanceState {
  const balance = deriveBalanceAmounts(row.amountDueMinor, row.paidAmountMinor)

  if (balance.donationAmountMinor > 0) return "overpaid"
  if (balance.outstandingAmountMinor > 0) return "outstanding"
  return "settled"
}

function createSliceRow(label: string) {
  return {
    label,
    count: 0,
    amountDueMinor: 0,
    paidMinor: 0,
    outstandingMinor: 0,
    overpaidMinor: 0,
  }
}

function pushReportRow(
  buckets: Map<string, ReportSliceRow>,
  label: string,
  row: ReportInputRow
) {
  const key = label.toLowerCase()
  const existing = buckets.get(key) ?? createSliceRow(label)
  const balance = deriveBalanceAmounts(row.amountDueMinor, row.paidAmountMinor)

  existing.count += 1
  existing.amountDueMinor += balance.amountDueMinor
    existing.paidMinor += balance.appliedAmountMinor
  existing.outstandingMinor += balance.outstandingAmountMinor
  existing.overpaidMinor += balance.donationAmountMinor

  buckets.set(key, existing)
}

function sortSlices(rows: ReportSliceRow[]) {
  return rows.sort((left, right) => {
    if (right.amountDueMinor !== left.amountDueMinor) {
      return right.amountDueMinor - left.amountDueMinor
    }

    if (right.count !== left.count) {
      return right.count - left.count
    }

    return left.label.localeCompare(right.label)
  })
}

export function buildStakeholderReport(params: {
  generatedAt: string
  event: StakeholderReport["event"]
  rows: ReportInputRow[]
}): StakeholderReport {
  const byLocation = new Map<string, ReportSliceRow>()
  const byGender = new Map<string, ReportSliceRow>()
  const byBalanceState = new Map<
    ReportBalanceState,
    ReportSliceRow & { state: ReportBalanceState }
  >([
    ["settled", { ...createSliceRow("Settled"), state: "settled" }],
    ["outstanding", { ...createSliceRow("Outstanding"), state: "outstanding" }],
    ["overpaid", { ...createSliceRow("Overpaid"), state: "overpaid" }],
  ])

  const totals = {
    rows: 0,
    amountDueMinor: 0,
    paidMinor: 0,
    outstandingMinor: 0,
    overpaidMinor: 0,
  }

  for (const row of params.rows) {
    const balance = deriveBalanceAmounts(row.amountDueMinor, row.paidAmountMinor)
    const balanceState = classifyBalanceState(row)

    totals.rows += 1
    totals.amountDueMinor += balance.amountDueMinor
    totals.paidMinor += balance.appliedAmountMinor
    totals.outstandingMinor += balance.outstandingAmountMinor
    totals.overpaidMinor += balance.donationAmountMinor

    pushReportRow(
      byLocation,
      normalizeLabel(row.location, "Unknown location"),
      row
    )
    pushReportRow(byGender, formatGenderLabel(row.genderType), row)

    const balanceSlice = byBalanceState.get(balanceState)
    if (balanceSlice) {
      balanceSlice.count += 1
      balanceSlice.amountDueMinor += balance.amountDueMinor
      balanceSlice.paidMinor += balance.appliedAmountMinor
      balanceSlice.outstandingMinor += balance.outstandingAmountMinor
      balanceSlice.overpaidMinor += balance.donationAmountMinor
    }
  }

  return {
    generatedAt: params.generatedAt,
    event: params.event,
    totals,
    slices: {
      byLocation: sortSlices(Array.from(byLocation.values())),
      byGender: sortSlices(Array.from(byGender.values())),
      byBalanceState: Array.from(byBalanceState.values()),
    },
  }
}

export function buildReportSharePath(token: string) {
  return `/reports/${token}`
}

export function buildReportShareUrl(origin: string, token: string) {
  return new URL(buildReportSharePath(token), origin).toString()
}

export function allocateReportPaymentsByAttendee(params: {
  totalPaidMinor: number
  attendeeWeights: Array<{ attendeeId: string; weightMinor: number }>
}) {
  return allocateMinorAmountByWeight(
    params.totalPaidMinor,
    params.attendeeWeights.map((weight) => ({
      id: weight.attendeeId,
      weightMinor: weight.weightMinor,
    }))
  )
}
