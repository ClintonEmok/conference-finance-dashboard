type PortfolioRowLike = {
  eventId: string
  eventSlug: string
  eventTitle: string | null
  amountDueMinor?: number | null
  totalAmountMinor?: number | null
  outstandingMinor?: number | null
}

export type PortfolioMetrics = {
  expectedMinor: number
  collectedMinor: number
  outstandingMinor: number
}

export type PortfolioEventSummary = PortfolioMetrics & {
  eventId: string
  eventSlug: string
  eventTitle: string
  rowCount: number
}

function toSafeMinor(value: number | null | undefined) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0
}

export function derivePortfolioMetrics(
  row: PortfolioRowLike
): PortfolioMetrics {
  const expectedMinor = toSafeMinor(row.amountDueMinor ?? row.totalAmountMinor)
  const outstandingMinor = Math.min(
    expectedMinor,
    toSafeMinor(row.outstandingMinor)
  )

  return {
    expectedMinor,
    outstandingMinor,
    collectedMinor: Math.max(0, expectedMinor - outstandingMinor),
  }
}

export function summarizePortfolioRows(rows: PortfolioRowLike[]) {
  return rows.reduce<PortfolioMetrics>(
    (totals, row) => {
      const metrics = derivePortfolioMetrics(row)

      totals.expectedMinor += metrics.expectedMinor
      totals.collectedMinor += metrics.collectedMinor
      totals.outstandingMinor += metrics.outstandingMinor

      return totals
    },
    {
      expectedMinor: 0,
      collectedMinor: 0,
      outstandingMinor: 0,
    }
  )
}

export function buildPortfolioEventSummaries(rows: PortfolioRowLike[]) {
  const summaries = new Map<string, PortfolioEventSummary>()

  for (const row of rows) {
    const metrics = derivePortfolioMetrics(row)
    const existing = summaries.get(row.eventId)

    if (!existing) {
      summaries.set(row.eventId, {
        eventId: row.eventId,
        eventSlug: row.eventSlug,
        eventTitle: row.eventTitle?.trim() || row.eventSlug,
        rowCount: 1,
        ...metrics,
      })
      continue
    }

    existing.rowCount += 1
    existing.expectedMinor += metrics.expectedMinor
    existing.collectedMinor += metrics.collectedMinor
    existing.outstandingMinor += metrics.outstandingMinor

    if (existing.eventTitle === existing.eventSlug && row.eventTitle?.trim()) {
      existing.eventTitle = row.eventTitle.trim()
    }
  }

  return Array.from(summaries.values()).sort(
    (left, right) => right.expectedMinor - left.expectedMinor
  )
}
