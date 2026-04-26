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
