export const PAYMENT_REFERENCE_PREFIX = "PAYMENT-"
const PAYMENT_REFERENCE_MAX_LENGTH = 35

function hasPaymentReferencePrefix(value: string) {
  return (
    value.slice(0, PAYMENT_REFERENCE_PREFIX.length).toUpperCase() ===
    PAYMENT_REFERENCE_PREFIX
  )
}

export function formatPaymentReference(
  reference: string | null | undefined
): string | null {
  const normalized = typeof reference === "string" ? reference.trim() : ""

  if (!normalized) {
    return null
  }

  const rawReference = hasPaymentReferencePrefix(normalized)
    ? normalized.slice(PAYMENT_REFERENCE_PREFIX.length).trim()
    : normalized

  if (!rawReference) {
    return null
  }

  const availableLength =
    PAYMENT_REFERENCE_MAX_LENGTH - PAYMENT_REFERENCE_PREFIX.length
  return `${PAYMENT_REFERENCE_PREFIX}${rawReference.slice(0, availableLength)}`
}
