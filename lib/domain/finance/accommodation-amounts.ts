/**
 * Pure accommodation pricing contract.
 *
 * This module is the single source of accommodation money math. It never
 * imports Convex, never reads the database, and never formats display
 * values. The canonical finance loader (`convex/finance.ts`) resolves event
 * config/rates/options into the typed inputs below and calls
 * `deriveAccommodationAmount` per selection; the confirmation flow persists
 * the snapshot produced by `buildAccommodationPriceSnapshot` when confirming
 * a selection.
 *
 * Locked formula (per attendee, minor units):
 *   coveredNights  = ticket.accommodationIncluded ? eventBaseNights : 0
 *   totalNights    = buyer-chosen nights
 *   baseCharge     = max(0, totalNights - coveredNights) * baseRate
 *   optionCharge   = Σ per selected option: pricePerUnit × quantity × nights
 *   amountDue      = tickets + baseCharge + optionCharge
 *
 * Options are data-driven: every enabled event option is a priced, per-unit
 * line. There is no hardcoded option code (no superior_upgrade/cot branches)
 * and no age-band eligibility gate. `kind`/`unit` remain typed at the schema
 * boundary; the charge math here is unit × quantity × nights for the supported
 * per_night unit and price × quantity for per_person.
 *
 * Breakfast is always included and carries no charge. Zero rates are valid
 * (€0 prices stay €0 and simply produce no receipt line). Malformed,
 * negative, fractional or missing money/night inputs normalize to safe
 * non-negative values so a broken selection contributes €0 rather than NaN.
 *
 * Legacy compatibility: confirmed rows persisted before the option-line model
 * carried boolean decision fields (`upgradeSelected`, `cotSelected`,
 * `categoryIsSuperior`, and the resolved upgrade/cot per-night rates). Those
 * snapshots remain valid historical data and are priced through the legacy
 * branch below; new confirmations always write the option-lines shape.
 */

export const ACCOMMODATION_LINE_LABELS = {
  accommodation: "Accommodation",
} as const

export type AccommodationOptionSelection = {
  optionKey: string
  quantity: number
  nights: number
}

export type ResolvedAccommodationOption = {
  optionKey: string
  label: string
  pricePerUnitMinor: number
}

export type AccommodationSelectionInput = {
  attendeeId: string
  categoryCode?: string | null
  occupancy?: string | null
  nightCount?: number | null
  /** Data-driven option selections (optionKey + quantity + nights). */
  optionSelections?: AccommodationOptionSelection[] | null
}

export type AccommodationPricingInput = {
  /** Resolved per-person-per-night rate for the selected category/occupancy. */
  baseRatePerNightMinor?: number | null
  /** All enabled event options resolved to typed per-unit prices. */
  options?: ResolvedAccommodationOption[] | null
  /** The attendee's ticket type `accommodationIncluded` flag (absent = false). */
  ticketAccommodationIncluded?: boolean | null
  /** The event's base night count (`eventAccommodationConfig.nightCount`). */
  eventBaseNights?: number | null
}

export type AccommodationOptionLine = {
  optionKey: string
  label: string
  pricePerUnitMinor: number
  quantity: number
  nights: number
  chargeMinor: number
}

/**
 * Immutable pricing state persisted on a confirmed selection. The loader uses
 * snapshot inputs instead of live rates for confirmed rows so a later rate
 * edit never re-prices them.
 *
 * New confirmations persist `optionLines` — a self-contained list of resolved
 * option charges — plus the base rate and nights. Legacy confirmed rows carry
 * the older boolean decision fields instead and remain readable through the
 * compatibility branch in `deriveAccommodationAmount`.
 */
export type AccommodationPriceSnapshot = {
  baseRatePerNightMinor: number
  totalNights: number
  coveredNights: number
  /** New shape: resolved per-option charges (fully self-contained). */
  optionLines?: AccommodationOptionLine[]
  /** Legacy shape (v5 confirmed rows only): resolved decision fields. */
  upgradeRatePerNightMinor?: number
  cotRatePerNightMinor?: number
  categoryIsSuperior?: boolean
  upgradeSelected?: boolean
  cotSelected?: boolean
}

/**
 * Fail-closed completeness guard for a persisted snapshot. The canonical
 * loader throws for any confirmed row whose `priceSnapshot` does not pass this
 * check instead of silently re-pricing it from the current config.
 *
 * A snapshot is complete when it is either a complete legacy v5 shape (base
 * rate + nights + the resolved boolean decision fields) or a complete
 * option-line shape whose every line is fully resolved.
 */
export function isCompleteAccommodationPriceSnapshot(
  value: unknown
): value is AccommodationPriceSnapshot {
  if (!value || typeof value !== "object") {
    return false
  }
  const snapshot = value as Record<string, unknown>
  const baseComplete =
    typeof snapshot.baseRatePerNightMinor === "number" &&
    Number.isFinite(snapshot.baseRatePerNightMinor) &&
    typeof snapshot.totalNights === "number" &&
    Number.isFinite(snapshot.totalNights) &&
    typeof snapshot.coveredNights === "number" &&
    Number.isFinite(snapshot.coveredNights)

  if (!baseComplete) {
    return false
  }

  if (Array.isArray(snapshot.optionLines)) {
    return snapshot.optionLines.every((line) => {
      if (!line || typeof line !== "object") {
        return false
      }
      const resolved = line as Record<string, unknown>
      return (
        typeof resolved.optionKey === "string" &&
        typeof resolved.label === "string" &&
        typeof resolved.pricePerUnitMinor === "number" &&
        Number.isFinite(resolved.pricePerUnitMinor) &&
        typeof resolved.quantity === "number" &&
        Number.isFinite(resolved.quantity) &&
        typeof resolved.nights === "number" &&
        Number.isFinite(resolved.nights) &&
        typeof resolved.chargeMinor === "number" &&
        Number.isFinite(resolved.chargeMinor)
      )
    })
  }

  // Legacy v5 shape: the resolved decision fields are present.
  return (
    typeof snapshot.upgradeRatePerNightMinor === "number" &&
    Number.isFinite(snapshot.upgradeRatePerNightMinor) &&
    typeof snapshot.cotRatePerNightMinor === "number" &&
    Number.isFinite(snapshot.cotRatePerNightMinor) &&
    typeof snapshot.categoryIsSuperior === "boolean" &&
    typeof snapshot.upgradeSelected === "boolean" &&
    typeof snapshot.cotSelected === "boolean"
  )
}

export type AccommodationReceiptLine = {
  kind: "accommodation" | "option"
  optionKey?: string
  label: string
  nights: number
  quantity?: number
  ratePerNightMinor: number
  chargeMinor: number
}

export type AccommodationAmountResult = {
  /** Total accommodation due for the attendee selection, in minor units. */
  totalMinor: number
  /** Non-zero receipt lines only (base accommodation + selected options). */
  lines: AccommodationReceiptLine[]
  /** Live-derived snapshot for the same selection (confirmation persistence). */
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
 * live-resolution rules as `deriveAccommodationAmount`, so the confirmation
 * flow can persist the resolved rates/nights without duplicating money math.
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

  const resolvedOptions = resolveSelectedOptions(selection, pricing)

  return {
    baseRatePerNightMinor: normalizeMinorUnits(
      pricing.baseRatePerNightMinor
    ),
    totalNights: normalizeNights(selection.nightCount),
    coveredNights,
    optionLines: resolvedOptions.map((resolved) => ({
      optionKey: resolved.optionKey,
      label: resolved.label,
      pricePerUnitMinor: resolved.pricePerUnitMinor,
      quantity: resolved.quantity,
      nights: resolved.nights,
      chargeMinor: deriveOptionChargeMinor(resolved),
    })),
  }
}

type ResolvedSelectedOption = {
  optionKey: string
  label: string
  pricePerUnitMinor: number
  quantity: number
  nights: number
  unit: "per_night" | "per_person"
}

function resolveSelectedOptions(
  selection: AccommodationSelectionInput,
  pricing: AccommodationPricingInput
): ResolvedSelectedOption[] {
  const selections = Array.isArray(selection.optionSelections)
    ? selection.optionSelections
    : []
  const optionByKey = new Map<string, ResolvedAccommodationOption>()
  for (const option of Array.isArray(pricing.options) ? pricing.options : []) {
    optionByKey.set(option.optionKey, option)
  }

  const resolved: ResolvedSelectedOption[] = []
  for (const selected of selections) {
    const option = optionByKey.get(selected.optionKey)
    if (!option) {
      continue
    }
    resolved.push({
      optionKey: selected.optionKey,
      label: option.label,
      pricePerUnitMinor: normalizeMinorUnits(option.pricePerUnitMinor),
      quantity: Math.max(0, Math.floor(selected.quantity ?? 0)),
      nights: normalizeNights(selected.nights),
      // All supported options are per_night in this model; the unit is
      // resolved at the schema boundary.
      unit: "per_night",
    })
  }
  return resolved
}

/**
 * Charges one resolved option by its unit semantics. `per_night` is price ×
 * quantity × nights; `per_person` is price × quantity. The charge is always a
 * non-negative integer in minor units.
 */
export function deriveOptionChargeMinor(option: {
  pricePerUnitMinor: number
  quantity: number
  nights: number
  unit?: "per_night" | "per_person"
}): number {
  const pricePerUnitMinor = normalizeMinorUnits(option.pricePerUnitMinor)
  const quantity = Math.max(0, Math.floor(option.quantity ?? 0))
  if (option.unit === "per_person") {
    return pricePerUnitMinor * quantity
  }
  const nights = normalizeNights(option.nights)
  return pricePerUnitMinor * quantity * nights
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

  let optionChargeMinor = 0

  if (usesSnapshot && Array.isArray(snapshot.optionLines)) {
    // New snapshot shape: price exclusively from the persisted option lines.
    for (const line of snapshot.optionLines) {
      const chargeMinor = normalizeMinorUnits(line.chargeMinor)
      optionChargeMinor += chargeMinor
      if (chargeMinor > 0) {
        lines.push({
          kind: "option",
          optionKey: line.optionKey,
          label: line.label,
          nights: normalizeNights(line.nights),
          quantity: Math.max(0, Math.floor(line.quantity ?? 0)),
          ratePerNightMinor: normalizeMinorUnits(line.pricePerUnitMinor),
          chargeMinor,
        })
      }
    }
  } else if (usesSnapshot) {
    // Legacy v5 snapshot shape: reproduce the resolved upgrade/cot charges
    // from the persisted decision fields (never from live config).
    const upgradeSelected =
      snapshot.upgradeSelected === true && !(snapshot.categoryIsSuperior === true)
    const upgradeChargeMinor = upgradeSelected
      ? totalNights * normalizeMinorUnits(snapshot.upgradeRatePerNightMinor)
      : 0
    const cotChargeMinor = snapshot.cotSelected === true
      ? totalNights * normalizeMinorUnits(snapshot.cotRatePerNightMinor)
      : 0
    optionChargeMinor += upgradeChargeMinor + cotChargeMinor
    if (upgradeChargeMinor > 0) {
      lines.push({
        kind: "option",
        optionKey: "superior_upgrade",
        label: "Superior upgrade",
        nights: totalNights,
        ratePerNightMinor: normalizeMinorUnits(snapshot.upgradeRatePerNightMinor),
        chargeMinor: upgradeChargeMinor,
      })
    }
    if (cotChargeMinor > 0) {
      lines.push({
        kind: "option",
        optionKey: "cot",
        label: "Cot",
        nights: totalNights,
        ratePerNightMinor: normalizeMinorUnits(snapshot.cotRatePerNightMinor),
        chargeMinor: cotChargeMinor,
      })
    }
  } else {
    // Live resolution: price each selected option against the event-owned
    // option set, ignoring any option that is no longer enabled.
    for (const resolved of resolveSelectedOptions(selection, pricing)) {
      const chargeMinor = deriveOptionChargeMinor(resolved)
      optionChargeMinor += chargeMinor
      if (chargeMinor > 0) {
        lines.push({
          kind: "option",
          optionKey: resolved.optionKey,
          label: resolved.label,
          nights: resolved.nights,
          quantity: resolved.quantity,
          ratePerNightMinor: resolved.pricePerUnitMinor,
          chargeMinor,
        })
      }
    }
  }

  return {
    totalMinor: baseChargeMinor + optionChargeMinor,
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
