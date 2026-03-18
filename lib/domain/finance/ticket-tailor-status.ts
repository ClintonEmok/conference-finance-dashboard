export type TicketTailorOrderStatus = "paid" | "refunded" | "cancelled" | "pending"

export type TicketTailorStatusNormalizationResult = {
  normalizedStatus: TicketTailorOrderStatus
  note: string | null
  usedFallback: boolean
}

const paidStatuses = new Set([
  "paid",
  "completed",
  "complete",
  "succeeded",
  "success",
  "captured",
  "confirmed",
])

const refundedStatuses = new Set([
  "refunded",
  "refund",
  "partially_refunded",
  "partial_refund",
  "charge_refunded",
])

const cancelledStatuses = new Set([
  "cancelled",
  "canceled",
  "voided",
  "revoked",
])

const pendingStatuses = new Set([
  "pending",
  "awaiting_payment",
  "unpaid",
  "open",
  "processing",
  "authorized",
  "incomplete",
])

function normalizeSignal(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_")
}

export function normalizeTicketTailorStatus(
  ...providerSignals: Array<string | null | undefined>
): TicketTailorStatusNormalizationResult {
  for (const signal of providerSignals) {
    if (!signal) {
      continue
    }

    const normalized = normalizeSignal(signal)

    if (refundedStatuses.has(normalized)) {
      return { normalizedStatus: "refunded", note: null, usedFallback: false }
    }

    if (cancelledStatuses.has(normalized)) {
      return { normalizedStatus: "cancelled", note: null, usedFallback: false }
    }

    if (paidStatuses.has(normalized)) {
      return { normalizedStatus: "paid", note: null, usedFallback: false }
    }

    if (pendingStatuses.has(normalized)) {
      return { normalizedStatus: "pending", note: null, usedFallback: false }
    }
  }

  const rawInput = providerSignals.find((value) => typeof value === "string" && value.trim().length > 0)

  return {
    normalizedStatus: "pending",
    note: rawInput
      ? `Unknown provider status \"${rawInput}\" mapped to pending`
      : "Missing provider status mapped to pending",
    usedFallback: true,
  }
}
