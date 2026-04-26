import type { Doc, Id } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"

type OrderWithExtension = {
  order: Doc<"orders">
  extension: Doc<"ticketTailorOrders"> | null
}

type OrderAttendeeWithExtension = Doc<"orderAttendees"> &
  Omit<Partial<Doc<"ticketTailorAttendees">>, "_id" | "_creationTime">

export async function loadOrderWithExtension(
  ctx: QueryCtx,
  orderId: Id<"orders">
): Promise<OrderWithExtension | null> {
  const order = await ctx.db.get("orders", orderId)
  if (!order) return null

  const extension = await ctx.db
    .query("ticketTailorOrders")
    .withIndex("orderId", (q) => q.eq("orderId", orderId))
    .first()

  return { order, extension }
}

export async function loadOrdersWithExtensions(
  ctx: QueryCtx,
  orders: Doc<"orders">[]
): Promise<OrderWithExtension[]> {
  return await Promise.all(
    orders.map(async (order) => {
      const extension = await ctx.db
        .query("ticketTailorOrders")
        .withIndex("orderId", (q) => q.eq("orderId", order._id))
        .first()

      return { order, extension }
    })
  )
}

export async function loadOrderAttendeesWithExtensions(
  ctx: QueryCtx,
  orderId: Id<"orders">
): Promise<OrderAttendeeWithExtension[]> {
  const attendees = await ctx.db
    .query("orderAttendees")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
    .take(100)

  return await Promise.all(
    attendees.map(async (attendee) => {
      const ttExtension = await ctx.db
        .query("ticketTailorAttendees")
        .withIndex("attendeeId", (q) => q.eq("attendeeId", attendee._id))
        .first()

      return {
        ...attendee,
        ...ttExtension,
        _id: attendee._id,
        _creationTime: attendee._creationTime,
      }
    })
  )
}
