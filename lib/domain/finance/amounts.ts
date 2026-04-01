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

    if (lineAmountMinor <= 0) {
      continue
    }

    amountDueMinor += lineAmountMinor

    const attendeeId = String(selection.attendeeId)
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
  amountDueMinor: number,
  paidAmountMinor: number
) {
  const safeAmountDueMinor = Math.max(0, Math.floor(amountDueMinor))
  const safePaidAmountMinor = Math.max(0, Math.floor(paidAmountMinor))

  return {
    amountDueMinor: safeAmountDueMinor,
    paidAmountMinor: safePaidAmountMinor,
    outstandingAmountMinor: Math.max(
      0,
      safeAmountDueMinor - safePaidAmountMinor
    ),
    overpaidAmountMinor: Math.max(0, safePaidAmountMinor - safeAmountDueMinor),
  }
}
