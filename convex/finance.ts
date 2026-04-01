import type { Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"

import { deriveOrderAmountBreakdown } from "../lib/domain/finance/amounts"

type FinanceDbCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">

type OrderRef = {
  _id: Id<"orders">
}

type OrderSelectionDoc = {
  orderId: Id<"orders">
  attendeeId: Id<"orderAttendees">
  ticketTypeId: Id<"ticketTypes">
  quantity: number
}

type TicketTypeDoc = {
  _id: Id<"ticketTypes">
  priceMinor: number
}

export type OrderAmountDueBreakdown = {
  amountDueMinor: number
  amountDueByAttendeeId: Map<string, number>
}

export async function loadOrderAmountDueBreakdowns(
  ctx: FinanceDbCtx,
  orders: OrderRef[]
): Promise<Map<string, OrderAmountDueBreakdown>> {
  const selectionsByOrderId = new Map<string, OrderSelectionDoc[]>()
  const ticketTypeIds = new Set<Id<"ticketTypes">>()

  await Promise.all(
    orders.map(async (order) => {
      const selections = (await ctx.db
        .query("orderTicketSelections")
        .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
        .take(100)) as OrderSelectionDoc[]

      selectionsByOrderId.set(String(order._id), selections)

      for (const selection of selections) {
        ticketTypeIds.add(selection.ticketTypeId)
      }
    })
  )

  const ticketTypes = await Promise.all(
    Array.from(ticketTypeIds).map((ticketTypeId) =>
      ctx.db.get("ticketTypes", ticketTypeId)
    )
  )

  const ticketTypePriceById = new Map<string, number>()

  for (const ticketType of ticketTypes as Array<TicketTypeDoc | null>) {
    if (!ticketType) {
      continue
    }

    ticketTypePriceById.set(String(ticketType._id), ticketType.priceMinor)
  }

  const breakdownByOrderId = new Map<string, OrderAmountDueBreakdown>()

  for (const order of orders) {
    const selections = selectionsByOrderId.get(String(order._id)) ?? []
    breakdownByOrderId.set(
      String(order._id),
      deriveOrderAmountBreakdown({
        selections,
        ticketTypePriceById,
      })
    )
  }

  return breakdownByOrderId
}
