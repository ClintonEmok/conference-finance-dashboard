/**
 * Centralised money formatting for minor-unit (cent) amounts.
 *
 * All finance code stores amounts as integer cents (amountMinor).
 * This helper converts to a human-readable currency string with consistent
 * sign, grouping, and fraction digits. The currency comes from the server
 * (event.currency) so a non-EUR event never shows the wrong label (WR-04).
 */

const FORMATTER_CACHE = new Map<string, Intl.NumberFormat>()

function getFormatter(currency: string): Intl.NumberFormat {
  let formatter = FORMATTER_CACHE.get(currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    FORMATTER_CACHE.set(currency, formatter)
  }
  return formatter
}

/**
 * Format a minor-unit (cent) amount as a currency display string.
 *
 * @param minor – Amount in cents (e.g. 1250 → "€12.50").
 * @param currency – ISO 4217 currency code, defaults to "EUR".
 */
export function formatMoney(minor: number, currency: string = "EUR"): string {
  return getFormatter(currency).format(minor / 100)
}

/** The typed-amount parse outcomes. A `reason` is never a silent fallback. */
export type ParsedMinorUnitsInput =
  | { ok: true; amountMinor: number }
  | { ok: false; reason: "empty" | "malformed" | "non_positive" }

/**
 * `^[0-9]+([.,][0-9]{1,2})?$` — at least one integer digit, an optional
 * single decimal separator, and at most two fraction digits. A leading `-` or
 * `+` fails the grammar, so a negative surfaces as `malformed`; a string that
 * only parses to zero (`"0"`, `"0.00"`, `"00"`) is `non_positive`.
 */
const MINOR_UNITS_INPUT_PATTERN = /^[0-9]+([.,][0-9]{1,2})?$/

/**
 * Parses an operator-typed decimal amount into INTEGER MINOR UNITS.
 *
 * This is input conversion, not a money formula: no server figure is ever
 * computed here. Grammar: trim, then `^[0-9]+([.,][0-9]{1,2})?$` (a comma is
 * accepted as the decimal separator); integer part × 100 + fraction padded to
 * two digits. Zero and negatives are rejected (`non_positive`), anything that
 * fails the grammar is `malformed`, an empty/whitespace string is `empty`.
 *
 * Phase 58's allocation editor is the only caller. The two pre-existing
 * call-site parsers (`legacy-reconciliation-surface.tsx`,
 * `order-detail-surface.tsx`) are deliberately NOT migrated this phase.
 */
export function parseMinorUnitsInput(value: string): ParsedMinorUnitsInput {
  const trimmed = value.trim()
  if (trimmed === "") {
    return { ok: false, reason: "empty" }
  }

  if (!MINOR_UNITS_INPUT_PATTERN.test(trimmed)) {
    return { ok: false, reason: "malformed" }
  }

  const [whole, fraction = ""] = trimmed.split(/[,.]/)
  const amountMinor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))

  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    return { ok: false, reason: "non_positive" }
  }

  return { ok: true, amountMinor }
}
