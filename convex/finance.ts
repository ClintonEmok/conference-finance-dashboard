import type { Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"

import {
  deriveOrderAmountBreakdown,
  isOrderAppliedPayment,
} from "../lib/domain/finance/amounts"

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

type MatchedPaymentRecord = {
  amountMinor: number
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

export async function loadMatchedPaymentTotalsByOrderId(
  ctx: FinanceDbCtx,
  orders: OrderRef[]
): Promise<Map<string, number>> {
  const payments = (await ctx.db.query("payments").take(2000)) as MatchedPaymentRecord[]
  const canonicalOrderIdsByAlias = new Map<string, string>()

  for (const order of orders) {
    canonicalOrderIdsByAlias.set(String(order._id), String(order._id))
  }

  const orderByProviderId = new Map<string, string>()
  for (const order of orders as Array<OrderRef & { providerOrderId?: string | null }>) {
    const providerOrderId = order.providerOrderId?.trim()
    if (providerOrderId) {
      orderByProviderId.set(providerOrderId, String(order._id))
    }
  }

  const totalsByOrderId = new Map<string, number>()

  for (const payment of payments) {
    if (
      !payment ||
      !isOrderAppliedPayment(payment) ||
      !Number.isFinite(payment.amountMinor) ||
      payment.amountMinor <= 0
    ) {
      continue
    }

    const rawOrderId = typeof payment.orderId === "string" ? payment.orderId.trim() : ""
    if (!rawOrderId) continue

    const canonicalOrderId =
      canonicalOrderIdsByAlias.get(rawOrderId) ?? orderByProviderId.get(rawOrderId)
    if (!canonicalOrderId) continue

    totalsByOrderId.set(
      canonicalOrderId,
      (totalsByOrderId.get(canonicalOrderId) ?? 0) + payment.amountMinor
    )
  }

  return totalsByOrderId
}
