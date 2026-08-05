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
  /**
   * The age band eligible for the cot option, from the event's cot option
   * configuration (`eventAccommodationOptions.eligibilityAgeBandCode`).
   * Absent/null means cot is not eligible for this event.
   */
  cotEligibilityAgeBandCode?: string | null
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
 *
 * The snapshot is self-contained: it also records every selection decision the
 * formula depends on (`categoryIsSuperior`, `upgradeSelected`, `cotSelected`,
 * `ageBandCode`), so editing a confirmed row's live selection flags or
 * category can never add/remove an upgrade or cot charge after confirmation.
 */
export type AccommodationPriceSnapshot = {
  baseRatePerNightMinor: number
  upgradeRatePerNightMinor: number
  cotRatePerNightMinor: number
  totalNights: number
  coveredNights: number
  /** Resolved at confirmation: the selected category was the superior rate. */
  categoryIsSuperior: boolean
  /** Resolved at confirmation: the buyer had selected the superior upgrade. */
  upgradeSelected: boolean
  /** Resolved at confirmation: the buyer had selected a cot. */
  cotSelected: boolean
  /** Resolved at confirmation: the attendee's age band code (lowercased). */
  ageBandCode: string
  /**
   * The event's cot-eligibility age band resolved at confirmation. Cot
   * charges only apply when the attendee's age band matches this band.
   */
  cotEligibilityAgeBandCode: string | null
}

/**
 * Fail-closed completeness guard for a persisted snapshot. The canonical
 * loader throws for any confirmed row whose `priceSnapshot` does not pass this
 * check instead of silently re-pricing it from the current config.
 */
export function isCompleteAccommodationPriceSnapshot(
  value: unknown
): value is AccommodationPriceSnapshot {
  if (!value || typeof value !== "object") {
    return false
  }
  const snapshot = value as Record<string, unknown>
  return (
    typeof snapshot.baseRatePerNightMinor === "number" &&
    Number.isFinite(snapshot.baseRatePerNightMinor) &&
    typeof snapshot.upgradeRatePerNightMinor === "number" &&
    Number.isFinite(snapshot.upgradeRatePerNightMinor) &&
    typeof snapshot.cotRatePerNightMinor === "number" &&
    Number.isFinite(snapshot.cotRatePerNightMinor) &&
    typeof snapshot.totalNights === "number" &&
    Number.isFinite(snapshot.totalNights) &&
    typeof snapshot.coveredNights === "number" &&
    Number.isFinite(snapshot.coveredNights) &&
    typeof snapshot.categoryIsSuperior === "boolean" &&
    typeof snapshot.upgradeSelected === "boolean" &&
    typeof snapshot.cotSelected === "boolean" &&
    typeof snapshot.ageBandCode === "string" &&
    (snapshot.cotEligibilityAgeBandCode === null ||
      typeof snapshot.cotEligibilityAgeBandCode === "string")
  )
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
    // Resolve every selection decision the formula depends on so a confirmed
    // row is priced exclusively from the snapshot, never from live flags.
    categoryIsSuperior:
      (selection.categoryCode ?? "").toLowerCase() === "superior",
    upgradeSelected: normalizeBoolean(selection.upgradeSelected),
    cotSelected: normalizeBoolean(selection.cotSelected),
    ageBandCode: (selection.ageBandCode ?? "").toLowerCase(),
    cotEligibilityAgeBandCode: pricing.cotEligibilityAgeBandCode
      ? String(pricing.cotEligibilityAgeBandCode).toLowerCase()
      : null,
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
  const snapshot = input.snapshot ?? null
  const usesSnapshot = snapshot !== null

  const baseRatePerNightMinor = usesSnapshot
    ? normalizeMinorUnits(snapshot.baseRatePerNightMinor)
    : normalizeMinorUnits(pricing.baseRatePerNightMinor)
  const upgradeRatePerNightMinor = usesSnapshot
    ? normalizeMinorUnits(snapshot.upgradeRatePerNightMinor)
    : normalizeMinorUnits(pricing.superiorUpgradePriceMinor)
  const cotRatePerNightMinor = usesSnapshot
    ? normalizeMinorUnits(snapshot.cotRatePerNightMinor)
    : normalizeMinorUnits(pricing.cotPriceMinor)

  const totalNights = usesSnapshot
    ? normalizeNights(snapshot.totalNights)
    : normalizeNights(selection.nightCount)
  const coveredNights = usesSnapshot
    ? normalizeNights(snapshot.coveredNights)
    : normalizeBoolean(pricing.ticketAccommodationIncluded)
      ? normalizeNights(pricing.eventBaseNights)
      : 0

  const chargedNights = Math.max(0, totalNights - coveredNights)
  const baseChargeMinor = chargedNights * baseRatePerNightMinor

  // The superior-upgrade selection is one representation of the superior
  // rate: when the selected category/occupancy rate already is the superior
  // rate, the base charge includes it and no separate upgrade line applies.
  // For a confirmed row the decision comes from the persisted snapshot, so
  // changing the live category/flags later cannot re-price the row.
  const categoryIsSuperior = usesSnapshot
    ? snapshot.categoryIsSuperior === true
    : (selection.categoryCode ?? "").toLowerCase() === "superior"
  const upgradeSelected = usesSnapshot
    ? snapshot.upgradeSelected === true
    : normalizeBoolean(selection.upgradeSelected)
  const upgradeChargeMinor =
    upgradeSelected && !categoryIsSuperior
      ? totalNights * upgradeRatePerNightMinor
      : 0

  // Cot eligibility is resolved from the event's configured cot-eligibility
  // age band, never hardcoded — bands differ per event. A confirmed row uses
  // the band resolved at confirmation; an unconfirmed row uses the current
  // event config. When no band is configured, cot is not eligible.
  const cotEligibilityAgeBandCode = usesSnapshot
    ? snapshot.cotEligibilityAgeBandCode ?? null
    : pricing.cotEligibilityAgeBandCode
      ? String(pricing.cotEligibilityAgeBandCode).toLowerCase()
      : null
  const cotEligible =
    cotEligibilityAgeBandCode !== null &&
    (usesSnapshot
      ? snapshot.ageBandCode.toLowerCase()
      : (selection.ageBandCode ?? "").toLowerCase()) ===
      cotEligibilityAgeBandCode
  const cotSelected = usesSnapshot
    ? snapshot.cotSelected === true
    : normalizeBoolean(selection.cotSelected)
  const cotChargeMinor =
    cotSelected && cotEligible ? totalNights * cotRatePerNightMinor : 0

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
    // A confirmed row returns its persisted snapshot untouched — the snapshot
    // is never rebuilt from live pricing inputs.
    snapshot: usesSnapshot
      ? snapshot
      : buildAccommodationPriceSnapshot({
          selection,
          pricing,
        }),
  }
}
