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
 *   totalNights    = buyer-chosen nights (base + 1 when a night-before level
 *                    is selected; the resolver derives and persists this)
 *   baseCharge     = main charged nights * main-stay rate
 *   nightBefore    = selected night-before occupancy rate × one night
 *   optionCharge   = Σ per selected option: pricePerUnit × quantity × nights
 *                    (+ the fixed €10 Superior night-before premium line)
 *   amountDue      = tickets + baseCharge + optionCharge
 *
 * Simplified contract (v6 buyer surfaces): the included stay is always the
 * event's resolved included-stay category (Standard for the divine event),
 * priced at that category's occupancy rate. `nightBeforeLevel` and
 * `nightBeforeOccupancy` price the independent one-night night-before stay:
 * the base charge covers one night at the selected Standard occupancy rate,
 * and a `superior` level adds exactly one
 * €10/person/night premium line. The premium is never derived from client
 * input — it is a constant of this module shared by quote, catalog display
 * rates, confirmation snapshots, and the canonical loader.
 *
 * Options are data-driven: every enabled event option is a priced, per-unit
 * line. There is no hardcoded cot branch and no age-band eligibility gate.
 * `kind`/`unit` remain typed at the schema boundary; the charge math here is
 * unit × quantity × nights for the supported per_night unit and price ×
 * quantity for per_person. `superior_upgrade` is a regular enabled event
 * option (€10/person/night for the included base nights); the only option
 * key treated specially in this module is the derived night-before premium.
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

/**
 * The fixed €10/person/night premium applied to the one independent
 * night-before line when the buyer chooses the Superior night-before level.
 * The base night-before line is always priced at the Standard occupancy rate
 * (resolved from the event's included-stay category rates); Superior adds
 * exactly this premium for exactly one night. This constant is the canonical
 * source for both the pure pricing engine and the server quote/catalog
 * display rates, so the client never derives €100/€70 locally.
 */
export const NIGHT_BEFORE_SUPERIOR_PREMIUM_MINOR = 1000

export const NIGHT_BEFORE_SUPERIOR_LINE_KEY = "night_before_superior"
export const NIGHT_BEFORE_SUPERIOR_LINE_LABEL = "Night before · Superior"

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
  /**
   * Simplified contract: the independent one-night stay before the event.
   * `standard` charges one night at the Standard occupancy rate; `superior`
   * adds the fixed €10 premium to that same one-night line. Omitted/null
   * means no night-before stay. This never changes the included-stay
   * category, and the included-stay Superior upgrade never implies it.
   */
  nightBeforeLevel?: "standard" | "superior" | null
  /** Independent occupancy for the one-night night-before stay. */
  nightBeforeOccupancy?: "single" | "shared" | null
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
  /** Resolved rate for the independent night-before occupancy. */
  nightBeforeRatePerNightMinor?: number | null
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
  /** New shape: independent night-before base rate and charged night count. */
  nightBeforeRatePerNightMinor?: number
  nightBeforeNights?: number
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

  const resolvedOptions = [
    ...resolveSelectedOptions(selection, pricing),
    ...resolveNightBeforePremium(selection),
  ]

  const nightBeforeNights = selection.nightBeforeLevel ? 1 : 0

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
    ...(nightBeforeNights > 0
      ? {
          nightBeforeRatePerNightMinor: normalizeMinorUnits(
            pricing.nightBeforeRatePerNightMinor ?? pricing.baseRatePerNightMinor
          ),
          nightBeforeNights,
        }
      : {}),
  }
}

/**
 * The derived Superior night-before premium line: exactly one night at the
 * fixed €10 premium, only when the independent night-before level is
 * `superior`. It is produced identically by the snapshot builder and the live
 * derivation so confirmation persistence and live pricing can never disagree.
 * The Standard night-before line itself is the base accommodation charge
 * (one charged night at the Standard occupancy rate).
 */
function resolveNightBeforePremium(
  selection: AccommodationSelectionInput
): ResolvedSelectedOption[] {
  if (selection.nightBeforeLevel !== "superior") {
    return []
  }
  return [
    {
      optionKey: NIGHT_BEFORE_SUPERIOR_LINE_KEY,
      label: NIGHT_BEFORE_SUPERIOR_LINE_LABEL,
      pricePerUnitMinor: NIGHT_BEFORE_SUPERIOR_PREMIUM_MINOR,
      quantity: 1,
      nights: 1,
      unit: "per_night",
    },
  ]
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

  const nightBeforeNights = usesSnapshot
    ? Math.min(
        totalNights,
        normalizeNights(snapshot.nightBeforeNights)
      )
    : selection.nightBeforeLevel
      ? Math.min(1, totalNights)
      : 0
  const mainChargedNights = Math.max(
    0,
    totalNights - coveredNights - nightBeforeNights
  )
  const nightBeforeRatePerNightMinor = usesSnapshot
    ? normalizeMinorUnits(
        snapshot.nightBeforeRatePerNightMinor ?? baseRatePerNightMinor
      )
    : normalizeMinorUnits(
        pricing.nightBeforeRatePerNightMinor ?? baseRatePerNightMinor
      )
  const baseChargeMinor = mainChargedNights * baseRatePerNightMinor
  const nightBeforeChargeMinor = nightBeforeNights * nightBeforeRatePerNightMinor

  const lines: AccommodationReceiptLine[] = []

  if (baseChargeMinor > 0) {
    lines.push({
      kind: "accommodation",
      label: ACCOMMODATION_LINE_LABELS.accommodation,
      nights: mainChargedNights,
      ratePerNightMinor: baseRatePerNightMinor,
      chargeMinor: baseChargeMinor,
    })
  }

  if (nightBeforeChargeMinor > 0) {
    lines.push({
      kind: "accommodation",
      label: ACCOMMODATION_LINE_LABELS.accommodation,
      nights: nightBeforeNights,
      ratePerNightMinor: nightBeforeRatePerNightMinor,
      chargeMinor: nightBeforeChargeMinor,
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
    // option set, ignoring any option that is no longer enabled, plus the
    // derived Superior night-before premium line (a `superior` level adds the
    // fixed €10 to the one-night line whose Standard-rate base charge is the
    // accommodation line above).
    for (const resolved of [
      ...resolveSelectedOptions(selection, pricing),
      ...resolveNightBeforePremium(selection),
    ]) {
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
    totalMinor: baseChargeMinor + nightBeforeChargeMinor + optionChargeMinor,
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
