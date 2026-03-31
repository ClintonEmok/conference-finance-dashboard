/**
 * Privacy utilities for masking personal names in payment displays.
 *
 * Purpose: Protect privacy by showing only first initial + last name in
 * operator-facing payment views, while keeping full names in data stores
 * for reconciliation accuracy.
 *
 * Format: "J. Smith" from "John Smith"
 */

/**
 * Masks a full name to show only first initial + last name.
 *
 * - "John Smith" → "J. Smith"
 * - "Mary Jane Watson" → "M. Watson"
 * - "O'Connor" → "O'Connor" (single names unchanged)
 * - "" → ""
 * - "  John   Smith  " → "J. Smith" (extra whitespace trimmed)
 */
export function maskName(fullName: string): string {
  const trimmed = fullName.trim()
  if (!trimmed) return ""

  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    return parts[0]
  }

  const firstInitial = parts[0][0]?.toUpperCase() || ""
  const lastName = parts[parts.length - 1]

  return `${firstInitial}. ${lastName}`
}

/**
 * Masks a payment payer name for display.
 * Separate function for semantic clarity — callers know this is
 * specifically for payment context masking.
 */
export function maskPaymentPayer(name: string): string {
  return maskName(name)
}
