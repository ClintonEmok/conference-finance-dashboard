import {
  allocateMinorAmountByWeight,
  deriveBalanceAmounts,
} from "@/lib/domain/finance/amounts"

export type ReportBalanceState = "settled" | "outstanding" | "overpaid"

export type ReportInputRow = {
  location: string | null
  genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
  ticketTypeLabel: string | null
  amountDueMinor: number
  paidAmountMinor: number
  createdAt: string
}

export type ReportSliceRow = {
  label: string
  count: number
  amountDueMinor: number
  paidMinor: number
  outstandingMinor: number
  overpaidMinor: number
}

export type RegionDetailAttendee = {
  name: string
  email: string | null
  ticketTypeLabel: string | null
  location: string | null
  amountDueMinor: number
  paidMinor: number
  outstandingMinor: number
  overpaidMinor: number
}

export type RegionDetailOrderGroup = {
  orderId: string
  bookingRef: string | null
  providerOrderId: string | null
  orderStatus: "paid" | "refunded" | "cancelled" | "pending"
  orderedAt: string
  bookerName: string | null
  bookerEmail: string | null
  ticketTypeSummary: string | null
  amountDueMinor: number
  paidMinor: number
  outstandingMinor: number
  overpaidMinor: number
  attendeeCount: number
  attendees: RegionDetailAttendee[]
}

export type RegionDetailRow = RegionDetailAttendee & {
  orderId: string
  bookingRef: string | null
  providerOrderId: string | null
  orderStatus: "paid" | "refunded" | "cancelled" | "pending"
  orderedAt: string
  attendeeName: string
  attendeeEmail: string | null
  bookerName?: string | null
  bookerEmail?: string | null
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
    byTicketType: ReportSliceRow[]
    byBalanceState: Array<ReportSliceRow & { state: ReportBalanceState }>
  }
}

export type RegionDetailReport = {
  generatedAt: string
  event: StakeholderReport["event"]
  region: string
  totals: StakeholderReport["totals"]
  orderGroups: RegionDetailOrderGroup[]
}

export type LocationGroup = {
  location: string
  attendeeCount: number
  amountDueMinor: number
  paidMinor: number
  outstandingMinor: number
  overpaidMinor: number
  attendees: RegionDetailAttendee[]
}

export type RegionDetailReportLike = {
  generatedAt: string
  event: StakeholderReport["event"]
  region: string
  totals: StakeholderReport["totals"]
  orderGroups?: RegionDetailOrderGroup[]
  rows?: RegionDetailRow[]
}

export type ReportView =
  | { kind: "aggregate"; report: StakeholderReport }
  | { kind: "region"; report: RegionDetailReport }
  | { kind: "attendees"; report: RegionDetailReport }

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
  existing.paidMinor += balance.paidAmountMinor
  existing.outstandingMinor += balance.outstandingAmountMinor
  existing.overpaidMinor += balance.donationAmountMinor

  buckets.set(key, existing)
}

function normalizeTicketTypeLabel(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : ""
  return trimmed || "Unspecified ticket"
}

function summarizeTicketTypeLabels(attendees: RegionDetailAttendee[]) {
  const counts = new Map<string, { label: string; count: number }>()

  for (const attendee of attendees) {
    const label = normalizeTicketTypeLabel(attendee.ticketTypeLabel)
    const key = label.toLowerCase()
    const existing = counts.get(key)

    if (existing) {
      existing.count += 1
    } else {
      counts.set(key, { label, count: 1 })
    }
  }

  const parts = Array.from(counts.values())
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .map(({ label, count }) => (count > 1 ? `${label} × ${count}` : label))

  return parts.length > 0 ? parts.join(", ") : null
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
  const byTicketType = new Map<string, ReportSliceRow>()
  const byBalanceState = new Map<
    ReportBalanceState,
    ReportSliceRow & { state: ReportBalanceState }
  >([
    ["settled", { ...createSliceRow("Settled"), state: "settled" }],
    ["outstanding", { ...createSliceRow("Outstanding"), state: "outstanding" }],
    ["overpaid", { ...createSliceRow("Donation"), state: "overpaid" }],
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
    totals.paidMinor += balance.paidAmountMinor
    totals.outstandingMinor += balance.outstandingAmountMinor
    totals.overpaidMinor += balance.donationAmountMinor

    pushReportRow(
      byLocation,
      normalizeLabel(row.location, "Unknown location"),
      row
    )
    pushReportRow(byGender, formatGenderLabel(row.genderType), row)
    pushReportRow(byTicketType, normalizeTicketTypeLabel(row.ticketTypeLabel), row)

    const balanceSlice = byBalanceState.get(balanceState)
    if (balanceSlice) {
      balanceSlice.count += 1
      balanceSlice.amountDueMinor += balance.amountDueMinor
      balanceSlice.paidMinor += balance.paidAmountMinor
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
      byTicketType: sortSlices(Array.from(byTicketType.values())),
      byBalanceState: Array.from(byBalanceState.values()),
    },
  }
}

export function buildRegionDetailReport(params: {
  generatedAt: string
  event: StakeholderReport["event"]
  region: string
  orderGroups: RegionDetailOrderGroup[]
}): RegionDetailReport {
  let attendeeCount = 0
  const totals = {
    rows: 0,
    amountDueMinor: 0,
    paidMinor: 0,
    outstandingMinor: 0,
    overpaidMinor: 0,
  }

  for (const group of params.orderGroups) {
    attendeeCount += group.attendeeCount
    totals.rows += group.attendeeCount
    totals.amountDueMinor += group.amountDueMinor
    totals.paidMinor += group.paidMinor
    totals.outstandingMinor += group.outstandingMinor
    totals.overpaidMinor += group.overpaidMinor
  }

  return {
    generatedAt: params.generatedAt,
    event: params.event,
    region: params.region,
    totals,
    orderGroups: params.orderGroups,
  }
}

export function getRegionOrderGroups(report: RegionDetailReportLike) {
  if (report.orderGroups) {
    return report.orderGroups
  }

  const groups = new Map<string, RegionDetailOrderGroup>()

  for (const row of report.rows ?? []) {
    const existing = groups.get(row.orderId)
    const balance = deriveBalanceAmounts(row.amountDueMinor, row.paidMinor)

    if (existing) {
      existing.attendeeCount += 1
      existing.amountDueMinor += balance.amountDueMinor
      existing.paidMinor += balance.paidAmountMinor
      existing.outstandingMinor += balance.outstandingAmountMinor
      existing.overpaidMinor += balance.donationAmountMinor
      existing.attendees.push({
        name: row.attendeeName,
        email: row.attendeeEmail,
        ticketTypeLabel: row.ticketTypeLabel,
        location: row.location,
        amountDueMinor: balance.amountDueMinor,
        paidMinor: balance.paidAmountMinor,
        outstandingMinor: balance.outstandingAmountMinor,
        overpaidMinor: balance.donationAmountMinor,
      })
      continue
    }

    groups.set(row.orderId, {
      orderId: row.orderId,
      bookingRef: row.bookingRef,
      providerOrderId: row.providerOrderId,
      orderStatus: row.orderStatus,
      orderedAt: row.orderedAt,
      bookerName: row.bookerName ?? null,
      bookerEmail: row.bookerEmail ?? null,
      ticketTypeSummary: null,
      amountDueMinor: balance.amountDueMinor,
      paidMinor: balance.paidAmountMinor,
      outstandingMinor: balance.outstandingAmountMinor,
      overpaidMinor: balance.donationAmountMinor,
      attendeeCount: 1,
      attendees: [
        {
          name: row.attendeeName,
          email: row.attendeeEmail,
          ticketTypeLabel: row.ticketTypeLabel,
          location: row.location,
          amountDueMinor: balance.amountDueMinor,
          paidMinor: balance.paidAmountMinor,
          outstandingMinor: balance.outstandingAmountMinor,
          overpaidMinor: balance.donationAmountMinor,
        },
      ],
    })
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    ticketTypeSummary: summarizeTicketTypeLabels(group.attendees),
  }))
}

function escapeCsvCell(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) {
    return ""
  }

  const raw = String(value)
  if (raw.includes(",") || raw.includes("\n") || raw.includes('"')) {
    return `"${raw.replace(/"/g, '""')}"`
  }

  return raw
}

function csvLine(values: Array<string | number | boolean | null | undefined>) {
  return values.map((value) => escapeCsvCell(value)).join(",")
}

export function buildReportCsv(report: ReportView) {
  if (report.kind === "region" || report.kind === "attendees") {
    const orderGroups = getRegionOrderGroups(report.report)
    const headers = [
      "orderId",
      "bookingRef",
      "providerOrderId",
      "orderStatus",
      "orderedAt",
      "bookerName",
      "bookerEmail",
      "ticketTypeSummary",
      "attendeeName",
      "attendeeEmail",
      "location",
      "ticketTypeLabel",
      "amountDueMinor",
      "paidMinor",
      "donationMinor",
      "outstandingMinor",
    ]

    const lines = [headers.join(",")]

    for (const group of orderGroups) {
      for (const attendee of group.attendees) {
        lines.push(
          csvLine([
            group.orderId,
            group.bookingRef,
            group.providerOrderId,
            group.orderStatus,
            group.orderedAt,
            group.bookerName,
            group.bookerEmail,
            group.ticketTypeSummary,
            attendee.name,
            attendee.email,
            attendee.location,
            attendee.ticketTypeLabel,
            attendee.amountDueMinor,
            attendee.paidMinor,
            attendee.overpaidMinor,
            attendee.outstandingMinor,
          ])
        )
      }
    }

    return `${lines.join("\n")}\n`
  }

  const headers = [
    "section",
    "label",
    "count",
    "amountDueMinor",
    "paidMinor",
    "outstandingMinor",
    "overpaidMinor",
  ]

  const lines = [headers.join(",")]
  const reportData = report.report

  lines.push(
    csvLine([
      "totals",
      "All",
      reportData.totals.rows,
      reportData.totals.amountDueMinor,
      reportData.totals.paidMinor,
      reportData.totals.outstandingMinor,
      reportData.totals.overpaidMinor,
    ])
  )

  for (const row of reportData.slices.byLocation) {
    lines.push(
      csvLine([
        "byLocation",
        row.label,
        row.count,
        row.amountDueMinor,
        row.paidMinor,
        row.outstandingMinor,
        row.overpaidMinor,
      ])
    )
  }

  for (const row of reportData.slices.byGender) {
    lines.push(
      csvLine([
        "byGender",
        row.label,
        row.count,
        row.amountDueMinor,
        row.paidMinor,
        row.outstandingMinor,
        row.overpaidMinor,
      ])
    )
  }

  for (const row of reportData.slices.byTicketType) {
    lines.push(
      csvLine([
        "byTicketType",
        row.label,
        row.count,
        row.amountDueMinor,
        row.paidMinor,
        row.outstandingMinor,
        row.overpaidMinor,
      ])
    )
  }

  for (const row of reportData.slices.byBalanceState) {
    lines.push(
      csvLine([
        "byBalanceState",
        row.label,
        row.count,
        row.amountDueMinor,
        row.paidMinor,
        row.outstandingMinor,
        row.overpaidMinor,
      ])
    )
  }

  return `${lines.join("\n")}\n`
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
