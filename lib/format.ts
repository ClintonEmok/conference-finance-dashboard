/**
 * Centralised money formatting for minor-unit (cent) amounts.
 *
 * All finance code stores amounts as integer cents (amountMinor).
 * This helper converts to a human-readable EUR string with consistent
 * sign, grouping, and fraction digits.
 */

const EUR_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Format a minor-unit (cent) amount as a EUR display string.
 *
 * @param minor – Amount in cents (e.g. 1250 → "€12.50").
 */
export function formatMoney(minor: number): string {
  return EUR_FORMATTER.format(minor / 100)
}
