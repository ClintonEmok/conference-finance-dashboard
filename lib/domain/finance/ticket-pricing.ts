export type TicketPriceSnapshot = {
  basePriceMinor: number
  surchargeMinor: number
  unitPriceMinor: number
  pricedAt: number
  lateSurchargeEffectiveAt?: number
}

export type TicketPriceConfig = {
  priceMinor: number
  lateSurchargeMinor?: number | null
  lateSurchargeEffectiveAt?: number | null
}

function normalizeMinorUnits(value: number | null | undefined): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.floor(value ?? 0))
}

function normalizeTimestamp(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.floor(value)
}

/**
 * Resolve the immutable ticket price charged at one instant.
 *
 * The resolver intentionally treats malformed persisted configuration as a
 * zero surcharge. Mutation boundaries reject invalid operator input, while
 * this pure helper keeps historical/legacy reads deterministic and safe.
 */
export function resolveTicketPriceSnapshot(
  ticket: TicketPriceConfig,
  pricedAt: number
): TicketPriceSnapshot {
  const basePriceMinor = normalizeMinorUnits(ticket.priceMinor)
  const configuredSurchargeMinor = normalizeMinorUnits(ticket.lateSurchargeMinor)
  const effectiveAt = Number.isFinite(ticket.lateSurchargeEffectiveAt)
    ? Math.floor(ticket.lateSurchargeEffectiveAt as number)
    : undefined
  const normalizedPricedAt = normalizeTimestamp(pricedAt)
  const applies =
    configuredSurchargeMinor > 0 &&
    effectiveAt !== undefined &&
    normalizedPricedAt >= effectiveAt
  const surchargeMinor = applies ? configuredSurchargeMinor : 0

  return {
    basePriceMinor,
    surchargeMinor,
    unitPriceMinor: basePriceMinor + surchargeMinor,
    pricedAt: normalizedPricedAt,
    ...(applies ? { lateSurchargeEffectiveAt: effectiveAt } : {}),
  }
}
