export type AmountWeight = {
  id: string
  weightMinor: number
}

export type OrderSelectionAmountInput = {
  attendeeId: string
  ticketTypeId: string
  quantity: number
}

export function deriveSelectionAmountMinor(
  priceMinor: number | null | undefined,
  quantity: number
) {
  const safePriceMinor = Number.isFinite(priceMinor)
    ? Math.max(0, priceMinor ?? 0)
    : 0
  const safeQuantity = Number.isFinite(quantity)
    ? Math.max(0, Math.floor(quantity))
    : 0

  return safePriceMinor * safeQuantity
}

function normalizeMinorAmount(value: number | null | undefined) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0
}

export type OrderAppliedPayment = {
  orderId?: string | null
  status?:
    | "auto_matched"
    | "manual_assignment"
    | "ambiguous"
    | "unassigned"
    | "donation"
    | null
  donationKind?: "overpayment" | "standalone" | null
}

/**
 * Returns true only for payments whose full amount is applied to an order's
 * raw matched balance. Standalone donations are intentionally excluded.
 */
export function isOrderAppliedPayment(payment: OrderAppliedPayment) {
  const hasOrderId =
    typeof payment.orderId === "string" && payment.orderId.trim().length > 0

  if (!hasOrderId) {
    return false
  }

  return (
    payment.status === "auto_matched" ||
    payment.status === "manual_assignment" ||
    (payment.status === "donation" && payment.donationKind === "overpayment")
  )
}

export type DonationClassificationPatch<TEventId extends string = string> = {
  orderId?: string
  eventId?: TEventId
  donationKind: "overpayment" | "standalone"
  status: "donation"
}

/**
 * Builds the schema-compatible classification patch without ever clearing a
 * linked order. The caller supplies the canonical/event fallback separately.
 */
export function buildDonationClassification<TEventId extends string = string>(
  params: {
    orderId?: string | null
    eventId?: TEventId | null
  }
): DonationClassificationPatch<TEventId> {
  const hasOrderId =
    typeof params.orderId === "string" && params.orderId.trim().length > 0

  return {
    ...(hasOrderId ? { orderId: params.orderId! } : {}),
    ...(params.eventId ? { eventId: params.eventId } : {}),
    donationKind: hasOrderId ? "overpayment" : "standalone",
    status: "donation",
  }
}

export function deriveOrderAmountBreakdown(params: {
  selections: OrderSelectionAmountInput[]
  ticketTypePriceById: Map<string, number | null | undefined>
}) {
  const amountDueByAttendeeId = new Map<string, number>()
  let amountDueMinor = 0

  for (const selection of params.selections) {
    const lineAmountMinor = deriveSelectionAmountMinor(
      params.ticketTypePriceById.get(selection.ticketTypeId),
      selection.quantity
    )

    const attendeeId = String(selection.attendeeId)
    if (lineAmountMinor <= 0) {
      amountDueByAttendeeId.set(attendeeId, amountDueByAttendeeId.get(attendeeId) ?? 0)
      continue
    }

    amountDueMinor += lineAmountMinor
    amountDueByAttendeeId.set(
      attendeeId,
      (amountDueByAttendeeId.get(attendeeId) ?? 0) + lineAmountMinor
    )
  }

  return {
    amountDueMinor,
    amountDueByAttendeeId,
  }
}

export function allocateMinorAmountByWeight(
  totalMinor: number,
  items: AmountWeight[]
) {
  const safeTotalMinor = Math.max(0, Math.floor(totalMinor))
  const normalizedItems = items.map((item, index) => ({
    id: item.id,
    weightMinor: Math.max(0, Math.floor(item.weightMinor)),
    index,
  }))

  const result = new Map<string, number>()

  if (normalizedItems.length === 0) {
    return result
  }

  const totalWeightMinor = normalizedItems.reduce(
    (sum, item) => sum + item.weightMinor,
    0
  )

  if (safeTotalMinor <= 0 || totalWeightMinor <= 0) {
    for (const item of normalizedItems) {
      result.set(item.id, 0)
    }
    return result
  }

  const allocations = normalizedItems.map((item) => {
    const exactShare = (safeTotalMinor * item.weightMinor) / totalWeightMinor
    const wholeShare = Math.floor(exactShare)
    return {
      id: item.id,
      weightMinor: item.weightMinor,
      wholeShare,
      remainder: exactShare - wholeShare,
      index: item.index,
    }
  })

  let remainder =
    safeTotalMinor - allocations.reduce((sum, item) => sum + item.wholeShare, 0)

  allocations
    .sort((left, right) => {
      if (right.remainder !== left.remainder) {
        return right.remainder - left.remainder
      }

      return left.index - right.index
    })
    .forEach((item) => {
      if (remainder > 0) {
        item.wholeShare += 1
        remainder -= 1
      }
    })

  for (const item of allocations) {
    result.set(item.id, item.wholeShare)
  }

  return result
}

export function deriveBalanceAmounts(
  amountDueMinor: number | null | undefined,
  paidAmountMinor: number | null | undefined
) {
  const safeAmountDueMinor = normalizeMinorAmount(amountDueMinor)
  const safePaidAmountMinor = normalizeMinorAmount(paidAmountMinor)
  const appliedAmountMinor = Math.min(
    safePaidAmountMinor,
    safeAmountDueMinor
  )
  const donationAmountMinor = Math.max(0, safePaidAmountMinor - safeAmountDueMinor)

  return {
    amountDueMinor: safeAmountDueMinor,
    paidAmountMinor: safePaidAmountMinor,
    appliedAmountMinor,
    outstandingAmountMinor: Math.max(
      0,
      safeAmountDueMinor - safePaidAmountMinor
    ),
    overpaidAmountMinor: donationAmountMinor,
    donationAmountMinor,
  }
}

export function deriveDonationAmountMinor(
  amountDueMinor: number | null | undefined,
  paidAmountMinor: number | null | undefined
) {
  return deriveBalanceAmounts(amountDueMinor, paidAmountMinor).donationAmountMinor
}

export function isOrderFullyPaid(
  amountDueMinor: number | null | undefined,
  paidAmountMinor: number | null | undefined
) {
  return deriveBalanceAmounts(amountDueMinor, paidAmountMinor).outstandingAmountMinor === 0
}
