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
