import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import { v } from "convex/values"
import type { Doc } from "./_generated/dataModel"
import { assertProductionDeployment } from "../lib/domain/legacy/production-deployment-guard"
import { planUniqueAttendeeKeys } from "../lib/domain/attendee-key"

const MAX_ORDERS_PER_INVOCATION = 1
const MAX_ATTENDEES_PER_ORDER = 5000
const MAX_REPORTED_CHANGES = 100

const diagnosticValidator = v.object({
  orderId: v.string(),
  reason: v.string(),
})

const changeValidator = v.object({
  orderId: v.string(),
  attendeeId: v.string(),
  oldKey: v.string(),
  newKey: v.string(),
})

function authorize(
  args: { authorize: boolean; allowedDeploymentUrl?: string },
  operation: string
) {
  assertProductionDeployment({
    authorize: args.authorize,
    allowedDeploymentUrl: args.allowedDeploymentUrl,
    operation,
  })
}

async function loadAttendeesForOrder(
  ctx: QueryCtx | MutationCtx,
  orderId: Doc<"orders">["_id"]
) {
  const rows = await ctx.db
    .query("orderAttendees")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
    .take(MAX_ATTENDEES_PER_ORDER + 1)
  if (rows.length > MAX_ATTENDEES_PER_ORDER) {
    throw new Error(
      `ORDER_TOO_LARGE: Order ${String(orderId)} has more than ${MAX_ATTENDEES_PER_ORDER} attendees; refusing to rekey it in one transaction.`
    )
  }
  return rows
}

export default internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    batchSize: v.number(),
    authorize: v.boolean(),
    allowedDeploymentUrl: v.optional(v.string()),
  },
  returns: v.object({
    processed: v.number(),
    rekeyed: v.number(),
    changedOrders: v.number(),
    changes: v.array(changeValidator),
    changesTruncated: v.boolean(),
    isDone: v.boolean(),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    authorize(args, "attendee-key rekey migration")
    if (args.batchSize !== MAX_ORDERS_PER_INVOCATION) {
      throw new Error(
        `batchSize must be exactly ${MAX_ORDERS_PER_INVOCATION} so each order is rekeyed atomically.`
      )
    }

    const page = await ctx.db
      .query("orders")
      .order("asc")
      .paginate({ numItems: args.batchSize, cursor: args.cursor })
    let rekeyed = 0
    let changedOrders = 0
    let changesTruncated = false
    const changes: Array<{
      orderId: string
      attendeeId: string
      oldKey: string
      newKey: string
    }> = []

    for (const order of page.page) {
      const attendees = await loadAttendeesForOrder(ctx, order._id)
      const updates = planUniqueAttendeeKeys(
        attendees.map((attendee) => ({
          id: String(attendee._id),
          attendeeKey: attendee.attendeeKey,
        }))
      )
      if (updates.size === 0) continue
      changedOrders += 1
      for (const attendee of attendees) {
        const newKey = updates.get(String(attendee._id))
        if (!newKey) continue
        await ctx.db.patch("orderAttendees", attendee._id, {
          attendeeKey: newKey,
        })
        rekeyed += 1
        if (changes.length < MAX_REPORTED_CHANGES) {
          changes.push({
            orderId: String(order._id),
            attendeeId: String(attendee._id),
            oldKey: attendee.attendeeKey,
            newKey,
          })
        } else {
          changesTruncated = true
        }
      }
    }

    return {
      processed: page.page.length,
      rekeyed,
      changedOrders,
      changes,
      changesTruncated,
      isDone: page.isDone,
      nextCursor: page.isDone ? null : page.continueCursor,
    }
  },
})

export const verifyAttendeeKeys = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    batchSize: v.number(),
    authorize: v.boolean(),
    allowedDeploymentUrl: v.string(),
  },
  returns: v.object({
    processed: v.number(),
    duplicateOrders: v.number(),
    duplicateAttendees: v.number(),
    blankAttendees: v.number(),
    diagnostics: v.array(diagnosticValidator),
    isDone: v.boolean(),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    authorize(args, "attendee-key rekey verification")
    if (args.batchSize !== MAX_ORDERS_PER_INVOCATION) {
      throw new Error(
        `batchSize must be exactly ${MAX_ORDERS_PER_INVOCATION} for verification.`
      )
    }

    const page = await ctx.db
      .query("orders")
      .order("asc")
      .paginate({ numItems: args.batchSize, cursor: args.cursor })
    let duplicateOrders = 0
    let duplicateAttendees = 0
    let blankAttendees = 0
    const diagnostics: Array<{ orderId: string; reason: string }> = []

    for (const order of page.page) {
      const attendees = await loadAttendeesForOrder(ctx, order._id)
      const seen = new Set<string>()
      const duplicateIds: string[] = []
      for (const attendee of attendees) {
        const key = attendee.attendeeKey.trim()
        if (!key) {
          blankAttendees += 1
          if (diagnostics.length < MAX_REPORTED_CHANGES) {
            diagnostics.push({
              orderId: String(order._id),
              reason: `blank attendee key on ${String(attendee._id)}`,
            })
          }
          continue
        }
        if (seen.has(key)) {
          duplicateAttendees += 1
          duplicateIds.push(String(attendee._id))
        }
        seen.add(key)
      }
      if (duplicateIds.length > 0) {
        duplicateOrders += 1
        if (diagnostics.length < MAX_REPORTED_CHANGES) {
          diagnostics.push({
            orderId: String(order._id),
            reason: `duplicate attendee keys remain on ${duplicateIds.join(", ")}`,
          })
        }
      }
    }

    return {
      processed: page.page.length,
      duplicateOrders,
      duplicateAttendees,
      blankAttendees,
      diagnostics,
      isDone: page.isDone,
      nextCursor: page.isDone ? null : page.continueCursor,
    }
  },
})
