import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server"
import { v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import { buildReportSharePath } from "@/lib/domain/finance/stakeholder-report"

export type ReportShareDoc = Doc<"reportShares">

export type ReportShareSummary = {
  eventId: string
  token: string
  path: string
  region: string | null
  createdAt: number
  revokedAt: number | null
  reused: boolean
}

export type ReportShareRow = {
  _id: Id<"reportShares">
  token: string
  region: string | null
  createdAt: number
  revokedAt: number | null
  path: string
  isActive: boolean
}

function normalizeToken(token: string) {
  return token.trim()
}

function normalizeRegion(region: string | null | undefined) {
  const trimmed = typeof region === "string" ? region.trim() : ""
  return trimmed || null
}

function generateToken() {
  return `report_${crypto.randomUUID().replace(/-/g, "")}`
}

async function findLatestActiveReportShare(
  ctx: Pick<QueryCtx, "db">,
  eventId: Id<"events">,
  region?: string | null
) {
  const shares = await ctx.db
    .query("reportShares")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(20)

  const normalizedRegion = normalizeRegion(region)

  return (
    shares
      .filter((share) => {
        const shareRegion = normalizeRegion(share.region)
        return normalizedRegion === shareRegion
      })
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
  eventId: Id<"events">,
  region?: string | null
): Promise<ReportShareSummary> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error("Authentication required")
  }

  const activeShare = await findLatestActiveReportShare(
    ctx as Pick<QueryCtx, "db">,
    eventId,
    region
  )

  if (activeShare) {
    return {
      eventId,
      token: activeShare.token,
      path: buildReportSharePath(activeShare.token),
      region: activeShare.region ?? null,
      createdAt: activeShare.createdAt,
      revokedAt: activeShare.revokedAt ?? null,
      reused: true,
    }
  }

  const token = generateToken()
  const createdAt = Date.now()
  const normalizedRegion = normalizeRegion(region)

  await ctx.db.insert("reportShares", {
    eventId,
    token,
    region: normalizedRegion ?? undefined,
    createdAt,
    createdByUserId: identity.tokenIdentifier,
  })

  return {
    eventId,
    token,
    path: buildReportSharePath(token),
    region: normalizedRegion,
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
    region: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await createOrReuseReportShareForEvent(ctx, args.eventId, args.region)
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

export const listEventShares = query({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Authentication required")
    }

    const shares = await ctx.db
      .query("reportShares")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .collect()

    return shares.map((share) => ({
      _id: share._id,
      token: share.token,
      region: share.region ?? null,
      createdAt: share.createdAt,
      revokedAt: share.revokedAt ?? null,
      path: buildReportSharePath(share.token),
      isActive: share.revokedAt == null,
    }))
  },
})
