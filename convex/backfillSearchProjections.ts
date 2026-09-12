import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server"
import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import { assertProductionDeployment } from "../lib/domain/legacy/production-deployment-guard"
import {
  MAX_CANONICAL_ROWS_PER_INVOCATION,
  MAX_DOCUMENTS_WRITTEN_PER_INVOCATION,
  MAX_PROJECTION_POSTINGS_PER_SUBJECT,
  MAX_RELATED_DOCUMENTS_READ_PER_INVOCATION,
  SearchProjectionBlocked,
  upsertAttendeeSearchDocument,
  upsertOrderSearchDocument,
} from "./search"

const kindValidator = v.union(v.literal("order"), v.literal("attendee"))
const diagnosticValidator = v.object({ subjectId: v.string(), reason: v.string() })

function authorize(args: { authorize: boolean; allowedDeploymentUrl?: string }, operation: string) {
  assertProductionDeployment({
    authorize: args.authorize,
    allowedDeploymentUrl: args.allowedDeploymentUrl,
    operation,
  })
}

export default internalMutation({
  args: {
    kind: kindValidator,
    cursor: v.union(v.string(), v.null()),
    batchSize: v.number(),
    authorize: v.boolean(),
    allowedDeploymentUrl: v.optional(v.string()),
  },
  returns: v.object({
    kind: kindValidator,
    processed: v.number(),
    skipped: v.number(),
    isDone: v.boolean(),
    nextCursor: v.union(v.string(), v.null()),
    diagnostics: v.array(diagnosticValidator),
  }),
  handler: async (ctx, args) => {
    authorize(args, "search projection backfill")
    if (!Number.isInteger(args.batchSize) || args.batchSize < 1 || args.batchSize > MAX_CANONICAL_ROWS_PER_INVOCATION) {
      throw new Error(`batchSize must be an integer between 1 and ${MAX_CANONICAL_ROWS_PER_INVOCATION}.`)
    }
    // The single-row contract is intentional: projection replacement can
    // consume up to 129 writes and must remain atomic with its canonical page.
    const page = args.kind === "order"
      ? await ctx.db.query("orders").order("asc").paginate({ numItems: args.batchSize, cursor: args.cursor })
      : await ctx.db.query("orderAttendees").order("asc").paginate({ numItems: args.batchSize, cursor: args.cursor })
    const diagnostics: Array<{ subjectId: string; reason: string }> = []
    let skipped = 0
    for (const row of page.page) {
      try {
        if (args.kind === "order") await upsertOrderSearchDocument(ctx, row._id as Id<"orders">)
        else await upsertAttendeeSearchDocument(ctx, row._id as Id<"orderAttendees">)
      } catch (error) {
        if (!(error instanceof SearchProjectionBlocked)) throw error
        skipped++
        diagnostics.push({ subjectId: String(row._id), reason: error.reason.slice(0, 512) })
      }
    }
    return {
      kind: args.kind,
      processed: page.page.length,
      skipped,
      isDone: page.isDone,
      nextCursor: page.isDone ? null : page.continueCursor,
      diagnostics,
    }
  },
})

async function boundedTake<T>(query: { take: (limit: number) => Promise<T[]> }, limit = 5000) {
  const rows = await query.take(limit + 1)
  return {
    rows: rows.slice(0, limit),
    truncated: rows.length > limit,
  }
}

export const verifySearchProjections = internalQuery({
  args: {
    authorize: v.boolean(),
    allowedDeploymentUrl: v.string(),
  },
  returns: v.object({
    missing: v.number(),
    stale: v.number(),
    duplicatePostings: v.number(),
    orphanedPostings: v.number(),
    blockedJobs: v.number(),
    pendingJobs: v.number(),
    diagnostics: v.array(diagnosticValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    authorize(args, "search projection verification")
    const diagnostics: Array<{ subjectId: string; reason: string }> = []
    let missing = 0; let stale = 0
    const orderRows = await boundedTake(ctx.db.query("orders").order("asc"))
    const attendeeRows = await boundedTake(ctx.db.query("orderAttendees").order("asc"))
    for (const order of orderRows.rows) {
      const projection = await ctx.db.query("searchDocuments").withIndex("by_kind_and_subjectId", (q) => q.eq("kind", "order").eq("subjectId", String(order._id))).unique()
      const isEligible = Boolean(order.eventId && !order.mergedIntoOrderId && await internalEvent(ctx, order.eventId))
      if (!projection) {
        if (isEligible) { missing++; diagnostics.push({ subjectId: String(order._id), reason: "missing order projection" }) }
      } else if (!isEligible) { if (projection.isSearchable) stale++ }
    }
    for (const attendee of attendeeRows.rows) {
      const projection = await ctx.db.query("searchDocuments").withIndex("by_kind_and_subjectId", (q) => q.eq("kind", "attendee").eq("subjectId", String(attendee._id))).unique()
      const order = await ctx.db.get("orders", attendee.orderId)
      const isEligible = Boolean(order?.eventId && !order.mergedIntoOrderId && await internalEvent(ctx, order.eventId))
      if (!projection) {
        if (isEligible) { missing++; diagnostics.push({ subjectId: String(attendee._id), reason: "missing attendee projection" }) }
      } else if (!isEligible) { if (projection.isSearchable) stale++ }
    }
    const postings = await boundedTake(ctx.db.query("searchDocumentTerms").order("asc"))
    const keys = new Map<string, number>(); let orphanedPostings = 0
    for (const posting of postings.rows) {
      const key = `${posting.documentKey}:${posting.term}`; keys.set(key, (keys.get(key) ?? 0) + 1)
      const projection = await ctx.db.query("searchDocuments").withIndex("by_kind_and_subjectId", (q) => q.eq("kind", posting.kind).eq("subjectId", posting.subjectId)).unique()
      if (!projection || projection.eventId !== posting.eventId) orphanedPostings++
    }
    const duplicatePostings = [...keys.values()].filter((count) => count > 1).length
    const jobs = await boundedTake(ctx.db.query("searchProjectionFanoutJobs").order("asc"))
    return {
      missing, stale, duplicatePostings, orphanedPostings,
      blockedJobs: jobs.rows.filter((job) => job.status === "blocked").length,
      pendingJobs: jobs.rows.filter((job) => job.status === "pending" || job.status === "running").length,
      diagnostics: diagnostics.slice(0, 100),
      truncated: orderRows.truncated || attendeeRows.truncated || postings.truncated || jobs.truncated,
    }
  },
})

async function internalEvent(ctx: QueryCtx, eventId: Id<"events">) {
  return (await ctx.db.get("events", eventId))?.primarySourceKind === "internal"
}

// Keep these imports visible in generated contract review: these are the
// explicit budgets used by the backfill's shared projection implementation.
export const SEARCH_BACKFILL_BUDGETS = {
  maxPostings: MAX_PROJECTION_POSTINGS_PER_SUBJECT,
  maxRelatedReads: MAX_RELATED_DOCUMENTS_READ_PER_INVOCATION,
  maxWrites: MAX_DOCUMENTS_WRITTEN_PER_INVOCATION,
}
