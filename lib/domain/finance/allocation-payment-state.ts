/**
 * Pure allocation payment-state contract (Phase 44).
 *
 * Turns the canonical finance loader's per-attendee due map plus an order's
 * matched applied-payment total into a complete tri-state breakdown for the
 * Allocation board. This module is deliberately dependency-free (aside from
 * the existing pure `allocateMinorAmountByWeight` helper), never reads the
 * database, never inspects `orders.status` or provider status, and never
 * formats display values — the board and UI consume these records as
 * server-owned data.
 *
 * Locked tri-state rules (CONTEXT D-03):
 *   - zero amount due            -> "paid"    (no canonical balance remains)
 *   - paid >= due                -> "paid"
 *   - positive paid below due    -> "partial"
 *   - zero paid against due      -> "unpaid"
 *
 * Locked allocation rule (CONTEXT D-04): an order's matched payment total is
 * distributed across its attendees by each attendee's canonical due weight
 * using `allocateMinorAmountByWeight`, so a recorded payment on an internal
 * order renders as paid even when the order/provider status stays pending.
 * Standalone/unassigned payments and order status never count.
 */

import { allocateMinorAmountByWeight } from "./amounts"

export type AllocationPaymentState = "paid" | "partial" | "unpaid"

export type AllocationAttendeePaymentBreakdown = {
  attendeeId: string
  amountDueMinor: number
  paidAmountMinor: number
  paymentState: AllocationPaymentState
}

function normalizeMinorAmount(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0
}

/**
 * Classifies one attendee from canonical due and paid minor-unit values.
 * Zero due is paid because the canonical balance has no outstanding amount;
 * an overpayment (paid >= due) is also paid. A positive payment below due is
 * partial; otherwise the attendee is unpaid.
 */
export function deriveAllocationPaymentState(
  amountDueMinor: number | null | undefined,
  paidAmountMinor: number | null | undefined
): AllocationPaymentState {
  const due = normalizeMinorAmount(amountDueMinor)
  const paid = normalizeMinorAmount(paidAmountMinor)

  if (due <= 0) {
    return "paid"
  }
  if (paid >= due) {
    return "paid"
  }
  if (paid > 0) {
    return "partial"
  }
  return "unpaid"
}

/**
 * Allocates an order's matched payment total across the attendees in the due
 * map by canonical due weight and returns one typed breakdown per attendee.
 * Attendees absent from the due map are intentionally omitted (the caller
 * decides how to surface an attendee with no canonical due entry). The
 * allocated paid amounts always sum to the normalized matched order total
 * unless every attendee has zero due, in which case the payment is an
 * overpayment/donation and nothing is allocated.
 */
export function deriveAllocationPaymentBreakdowns(input: {
  amountDueByAttendeeId: ReadonlyMap<string, number>
  paidTotalMinor: number | null | undefined
}): Map<string, AllocationAttendeePaymentBreakdown> {
  const breakdowns = new Map<string, AllocationAttendeePaymentBreakdown>()

  const dueWeights = [...input.amountDueByAttendeeId.entries()].map(
    ([attendeeId, dueMinor]) => ({
      id: String(attendeeId),
      weightMinor: normalizeMinorAmount(dueMinor),
    })
  )

  const allocatedPaidByAttendeeId = allocateMinorAmountByWeight(
    normalizeMinorAmount(input.paidTotalMinor),
    dueWeights
  )

  for (const item of dueWeights) {
    const amountDueMinor = item.weightMinor
    const paidAmountMinor = allocatedPaidByAttendeeId.get(item.id) ?? 0
    breakdowns.set(item.id, {
      attendeeId: item.id,
      amountDueMinor,
      paidAmountMinor,
      paymentState: deriveAllocationPaymentState(
        amountDueMinor,
        paidAmountMinor
      ),
    })
  }

  return breakdowns
}
