/**
 * Pure accommodation pricing contract (Phase 40).
 *
 * This module is the single source of accommodation money math. It never
 * imports Convex, never reads the database, and never formats display
 * values. The canonical finance loader (`convex/finance.ts`) resolves event
 * config/rates/options into the typed inputs below and calls
 * `deriveAccommodationAmount` per selection; Phase 44 persists the snapshot
 * produced by `buildAccommodationPriceSnapshot` when confirming a selection.
 *
 * Locked formula (per attendee, minor units):
 *   coveredNights  = ticket.accommodationIncluded ? eventBaseNights : 0
 *   totalNights    = buyer-chosen nights
 *   baseCharge     = max(0, totalNights - coveredNights) * baseRate
 *   upgradeCharge  = upgradePrice * totalNights   (only when the selected
 *                   rate is not already the superior rate)
 *   cotCharge      = cotPrice * totalNights       (only when cot is selected
 *                   and the attendee is in the under_3 age band)
 *   amountDue      = tickets + baseCharge + upgradeCharge + cotCharge
 *
 * Breakfast is always included and carries no charge. Zero rates are valid
 * (€0 prices stay €0 and simply produce no receipt line). Malformed,
 * negative, fractional or missing money/night inputs normalize to safe
 * non-negative values so a broken selection contributes €0 rather than NaN.
 */

export const ACCOMMODATION_LINE_LABELS = {
  accommodation: "Accommodation",
  superiorUpgrade: "Superior upgrade",
  cot: "Cot",
} as const

export type AccommodationAgeBandCode =
  | "under_3"
  | "3_11"
  | "12_17"
  | "18_plus"

export type AccommodationSelectionInput = {
  attendeeId: string
  categoryCode?: string | null
  occupancy?: string | null
  upgradeSelected?: boolean | null
  cotSelected?: boolean | null
  ageBandCode?: AccommodationAgeBandCode | string | null
  nightCount?: number | null
}

export type AccommodationPricingInput = {
  /** Resolved per-person-per-night rate for the selected category/occupancy. */
  baseRatePerNightMinor?: number | null
  /** Resolved per-night price of the enabled superior_upgrade option. */
  superiorUpgradePriceMinor?: number | null
  /** Resolved per-night price of the enabled cot option. */
  cotPriceMinor?: number | null
  /** The attendee's ticket type `accommodationIncluded` flag (absent = false). */
  ticketAccommodationIncluded?: boolean | null
  /** The event's base night count (`eventAccommodationConfig.nightCount`). */
  eventBaseNights?: number | null
}

/**
 * Immutable pricing state persisted on a confirmed selection. Phase 44 writes
 * `confirmedAt`, `configVersion = eventAccommodationConfig.updatedAt` and this
 * snapshot atomically; the loader uses snapshot inputs instead of live rates
 * for confirmed rows so a later rate edit never re-prices them.
 */
export type AccommodationPriceSnapshot = {
  baseRatePerNightMinor: number
  upgradeRatePerNightMinor: number
  cotRatePerNightMinor: number
  totalNights: number
  coveredNights: number
}

export type AccommodationReceiptLine = {
  kind: "accommodation" | "superior_upgrade" | "cot"
  label: string
  nights: number
  ratePerNightMinor: number
  chargeMinor: number
}

export type AccommodationAmountResult = {
  /** Total accommodation due for the attendee selection, in minor units. */
  totalMinor: number
  /** Non-zero receipt lines only (`Accommodation`, `Superior upgrade`, `Cot`). */
  lines: AccommodationReceiptLine[]
  /** Live-derived snapshot for the same selection (Phase 44 persistence). */
  snapshot: AccommodationPriceSnapshot
}

function normalizeMinorUnits(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.floor(value))
}

function normalizeNights(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.floor(value))
}

function normalizeBoolean(value: boolean | null | undefined): boolean {
  return value === true
}

/**
 * Builds the immutable price snapshot for a selection using the exact same
 * live-resolution rules as `deriveAccommodationAmount`, so Phase 44 can
 * persist the resolved rates/nights without duplicating money math.
 */
export function buildAccommodationPriceSnapshot(input: {
  selection: AccommodationSelectionInput
  pricing: AccommodationPricingInput
}): AccommodationPriceSnapshot {
  const selection = input.selection ?? {}
  const pricing = input.pricing ?? {}

  const coveredNights = normalizeBoolean(pricing.ticketAccommodationIncluded)
    ? normalizeNights(pricing.eventBaseNights)
    : 0

  return {
    baseRatePerNightMinor: normalizeMinorUnits(
      pricing.baseRatePerNightMinor
    ),
    upgradeRatePerNightMinor: normalizeMinorUnits(
      pricing.superiorUpgradePriceMinor
    ),
    cotRatePerNightMinor: normalizeMinorUnits(pricing.cotPriceMinor),
    totalNights: normalizeNights(selection.nightCount),
    coveredNights,
  }
}

/**
 * Derives the per-attendee accommodation amount-due for one selection row.
 *
 * When `snapshot` is provided (a confirmed row), the snapshot's resolved
 * rates and nights replace the live pricing inputs — a confirmed order never
 * re-prices when the event rate or option price changes later. Unconfirmed
 * rows (no snapshot) always use the current pricing inputs.
 */
export function deriveAccommodationAmount(input: {
  selection: AccommodationSelectionInput
  pricing: AccommodationPricingInput
  snapshot?: AccommodationPriceSnapshot | null
}): AccommodationAmountResult {
  const selection = input.selection ?? {}
  const pricing = input.pricing ?? {}
  const usesSnapshot = Boolean(input.snapshot)

  const baseRatePerNightMinor = usesSnapshot
    ? normalizeMinorUnits(input.snapshot?.baseRatePerNightMinor)
    : normalizeMinorUnits(pricing.baseRatePerNightMinor)
  const upgradeRatePerNightMinor = usesSnapshot
    ? normalizeMinorUnits(input.snapshot?.upgradeRatePerNightMinor)
    : normalizeMinorUnits(pricing.superiorUpgradePriceMinor)
  const cotRatePerNightMinor = usesSnapshot
    ? normalizeMinorUnits(input.snapshot?.cotRatePerNightMinor)
    : normalizeMinorUnits(pricing.cotPriceMinor)

  const totalNights = usesSnapshot
    ? normalizeNights(input.snapshot?.totalNights)
    : normalizeNights(selection.nightCount)
  const coveredNights = usesSnapshot
    ? normalizeNights(input.snapshot?.coveredNights)
    : normalizeBoolean(pricing.ticketAccommodationIncluded)
      ? normalizeNights(pricing.eventBaseNights)
      : 0

  const chargedNights = Math.max(0, totalNights - coveredNights)
  const baseChargeMinor = chargedNights * baseRatePerNightMinor

  // The superior-upgrade selection is one representation of the superior
  // rate: when the selected category/occupancy rate already is the superior
  // rate, the base charge includes it and no separate upgrade line applies.
  const categoryIsSuperior =
    (selection.categoryCode ?? "").toLowerCase() === "superior"
  const upgradeChargeMinor =
    normalizeBoolean(selection.upgradeSelected) && !categoryIsSuperior
      ? totalNights * upgradeRatePerNightMinor
      : 0

  // Cot eligibility is locked to the under_3 age band.
  const cotEligible =
    (selection.ageBandCode ?? "").toLowerCase() === "under_3"
  const cotChargeMinor =
    normalizeBoolean(selection.cotSelected) && cotEligible
      ? totalNights * cotRatePerNightMinor
      : 0

  const lines: AccommodationReceiptLine[] = []

  if (baseChargeMinor > 0) {
    lines.push({
      kind: "accommodation",
      label: ACCOMMODATION_LINE_LABELS.accommodation,
      nights: chargedNights,
      ratePerNightMinor: baseRatePerNightMinor,
      chargeMinor: baseChargeMinor,
    })
  }

  if (upgradeChargeMinor > 0) {
    lines.push({
      kind: "superior_upgrade",
      label: ACCOMMODATION_LINE_LABELS.superiorUpgrade,
      nights: totalNights,
      ratePerNightMinor: upgradeRatePerNightMinor,
      chargeMinor: upgradeChargeMinor,
    })
  }

  if (cotChargeMinor > 0) {
    lines.push({
      kind: "cot",
      label: ACCOMMODATION_LINE_LABELS.cot,
      nights: totalNights,
      ratePerNightMinor: cotRatePerNightMinor,
      chargeMinor: cotChargeMinor,
    })
  }

  return {
    totalMinor: baseChargeMinor + upgradeChargeMinor + cotChargeMinor,
    lines,
    snapshot: buildAccommodationPriceSnapshot({
      selection,
      pricing,
    }),
  }
}
