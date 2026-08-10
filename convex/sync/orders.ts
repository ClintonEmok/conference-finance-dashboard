import { query } from "../_generated/server"
import { v } from "convex/values"

// Public query

export const getTicketTailorOrderByProviderId = query({
  args: { providerOrderId: v.string() },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("ticketTailorOrders")
      .withIndex("providerOrderId", (q) =>
        q.eq("providerOrderId", args.providerOrderId)
      )
      .collect()
    return orders[0] ?? null
  },
})
