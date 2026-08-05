/**
 * Pure guard for the Upgrades & Options pending-impact response.
 *
 * The pending fields are required parts of the server response. A partial or
 * older backend payload must surface as an error state — never as a
 * fabricated "no pending orders"/"signup has not started" zero state
 * (no-fake-zero rule). Counts must be finite non-negative integers and every
 * pending row must carry exactly the fields the UI renders.
 */
export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

type PendingResponseRecord = {
  pendingOrderCount: unknown
  pendingOrders: unknown
  hasAccommodationSelections: unknown
}

export function hasCompletePendingResponse(data: unknown): boolean {
  if (!data || typeof data !== "object") return false
  const record = data as PendingResponseRecord
  if (
    !isNonNegativeInteger(record.pendingOrderCount) ||
    !Array.isArray(record.pendingOrders) ||
    typeof record.hasAccommodationSelections !== "boolean"
  ) {
    return false
  }
  return record.pendingOrders.every((row) => {
    if (!row || typeof row !== "object") return false
    const pending = row as Record<string, unknown>
    return (
      typeof pending.orderId === "string" &&
      (typeof pending.bookingRef === "string" || pending.bookingRef === null) &&
      (typeof pending.bookerName === "string" || pending.bookerName === null) &&
      isNonNegativeInteger(pending.selectionCount)
    )
  })
}
