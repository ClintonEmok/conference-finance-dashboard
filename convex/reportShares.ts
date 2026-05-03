import { mutation, type MutationCtx, type QueryCtx } from "./_generated/server"
import { v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import { buildReportSharePath } from "@/lib/domain/finance/stakeholder-report"

export type ReportShareDoc = Doc<"reportShares">

export type ReportShareSummary = {
  eventId: string
  token: string
  path: string
  createdAt: number
  revokedAt: number | null
  reused: boolean
}

function normalizeToken(token: string) {
  return token.trim()
}

function generateToken() {
  return `report_${crypto.randomUUID().replace(/-/g, "")}`
}

async function findLatestActiveReportShare(
  ctx: Pick<QueryCtx, "db">,
  eventId: Id<"events">
) {
  const shares = await ctx.db
    .query("reportShares")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(20)

  return (
    shares
      .filter((share) => share.revokedAt == null)
      .sort((left, right) => {
        if (right.createdAt !== left.createdAt) {
          return right.createdAt - left.createdAt
        }

        return right._creationTime - left._creationTime
      })[0] ?? null
  )
}

export async function lookupReportShareByToken(
  ctx: Pick<QueryCtx, "db">,
  token: string
) {
  const normalized = normalizeToken(token)
  if (!normalized) {
    return null
  }

  const share = await ctx.db
    .query("reportShares")
    .withIndex("token", (q) => q.eq("token", normalized))
    .first()

  if (!share || share.revokedAt != null) {
    return null
  }

  return share
}

export async function createOrReuseReportShareForEvent(
  ctx: MutationCtx,
  eventId: Id<"events">
): Promise<ReportShareSummary> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error("Authentication required")
  }

  const activeShare = await findLatestActiveReportShare(
    ctx as Pick<QueryCtx, "db">,
    eventId
  )

  if (activeShare) {
    return {
      eventId,
      token: activeShare.token,
      path: buildReportSharePath(activeShare.token),
      createdAt: activeShare.createdAt,
      revokedAt: activeShare.revokedAt ?? null,
      reused: true,
    }
  }

  const token = generateToken()
  const createdAt = Date.now()

  await ctx.db.insert("reportShares", {
    eventId,
    token,
    createdAt,
    createdByUserId: identity.tokenIdentifier,
  })

  return {
    eventId,
    token,
    path: buildReportSharePath(token),
    createdAt,
    revokedAt: null,
    reused: false,
  }
}

export async function revokeReportShareByToken(
  ctx: MutationCtx,
  token: string
) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error("Authentication required")
  }

  const share = await lookupReportShareByToken(
    ctx as Pick<QueryCtx, "db">,
    token
  )
  if (!share) {
    return false
  }

  await ctx.db.patch(share._id, {
    revokedAt: Date.now(),
  })

  return true
}

export const createEventShare = mutation({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    return await createOrReuseReportShareForEvent(ctx, args.eventId)
  },
})

export const revokeEventShare = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    return await revokeReportShareByToken(ctx, args.token)
  },
})
