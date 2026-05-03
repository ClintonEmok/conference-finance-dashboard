import { query, type QueryCtx } from "./_generated/server"
import { v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import { loadOrderAmountDueBreakdowns } from "./finance"
import {
  allocateReportPaymentsByAttendee,
  buildStakeholderReport,
  type StakeholderReport,
} from "@/lib/domain/finance/stakeholder-report"
import { deriveBalanceAmounts } from "@/lib/domain/finance/amounts"
import { lookupReportShareByToken, type ReportShareDoc } from "./reportShares"
import { loadOrderAttendeesWithExtensions } from "./provider_boundary"

const MATCHED_PAYMENT_STATUSES = new Set(["auto_matched", "manual_assignment"])

function normalizeGenderLabel(value: Doc<"orderAttendees">["gender"] | null) {
  if (value === "male") return "MALE" as const
  if (value === "female") return "FEMALE" as const
  if (value === "mixed") return "MIXED" as const
  return "UNKNOWN" as const
}

async function loadOrdersForEvent(
  ctx: Pick<QueryCtx, "db">,
  eventId: Id<"events">
) {
  const orders: Doc<"orders">[] = []

  for await (const order of ctx.db
    .query("orders")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .order("desc")) {
    orders.push(order)
  }

  return orders
}

async function buildReportRows(
  ctx: Pick<QueryCtx, "db">,
  orders: Doc<"orders">[]
) {
  const amountDueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(ctx, orders)

  const rows: Array<{
    location: string | null
    genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
    ticketTypeLabel: string | null
    amountDueMinor: number
    paidAmountMinor: number
    createdAt: string
  }> = []

  for (const order of orders) {
    const amountDueBreakdown = amountDueBreakdownsByOrderId.get(String(order._id))
    if (!amountDueBreakdown) {
      continue
    }

    const attendeesWithExtensions = await loadOrderAttendeesWithExtensions(ctx as QueryCtx, order._id)

    const payments: Doc<"payments">[] = []
    for await (const payment of ctx.db
      .query("payments")
      .withIndex("orderId", (q) => q.eq("orderId", String(order._id)))) {
      payments.push(payment)
    }

    const totalPaidMinor = payments
      .filter((payment) => MATCHED_PAYMENT_STATUSES.has(payment.status ?? "unassigned"))
      .reduce((sum, payment) => sum + payment.amountMinor, 0)

    if (attendeesWithExtensions.length === 0) {
      rows.push({
        location: null,
        genderType: null,
        ticketTypeLabel: null,
        amountDueMinor: amountDueBreakdown.amountDueMinor ?? 0,
        paidAmountMinor: totalPaidMinor,
        createdAt: new Date(order._creationTime).toISOString(),
      })
      continue
    }

    const paidByAttendeeId = allocateReportPaymentsByAttendee({
      totalPaidMinor,
      attendeeWeights: attendeesWithExtensions.map((attendee) => ({
        attendeeId: String(attendee._id),
        weightMinor: amountDueBreakdown.amountDueByAttendeeId.get(String(attendee._id)) ?? 0,
      })),
    })

    for (const attendee of attendeesWithExtensions) {
      const amountDueMinor =
        amountDueBreakdown.amountDueByAttendeeId.get(String(attendee._id)) ?? 0
      const paidAmountMinor = paidByAttendeeId.get(String(attendee._id)) ?? 0
      const balance = deriveBalanceAmounts(amountDueMinor, paidAmountMinor)

      rows.push({
        location: attendee.location ?? null,
        genderType: normalizeGenderLabel(attendee.gender),
        ticketTypeLabel: attendee.ticketTypeLabel ?? null,
        amountDueMinor: balance.amountDueMinor,
        paidAmountMinor: balance.paidAmountMinor,
        createdAt: new Date(order._creationTime).toISOString(),
      })
    }
  }

  return rows
}

export async function buildReportForToken(
  ctx: Pick<QueryCtx, "db">,
  token: string
): Promise<StakeholderReport | null> {
  const share: ReportShareDoc | null = await lookupReportShareByToken(ctx, token)

  if (!share) {
    return null
  }

  const event = await ctx.db.get(share.eventId)
  if (!event) {
    return null
  }

  const orders = await loadOrdersForEvent(ctx, event._id)
  const rows = await buildReportRows(ctx, orders)

  return buildStakeholderReport({
    generatedAt: new Date().toISOString(),
    event: {
      id: String(event._id),
      slug: event.slug,
      title: event.title,
      startsAt: event.startsAt,
      currency: event.currency,
    },
    rows,
  })
}

export const getReportByToken = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    return await buildReportForToken(ctx, args.token)
  },
})
