import { internalMutation } from "./_generated/server"
import { v } from "convex/values"
import { assertProductionDeployment } from "../lib/domain/legacy/production-deployment-guard"

/**
 * Phase 62 (D-06) one-off backfill for the additive `orderAttendees.eventId`
 * copy.
 *
 * Why it exists: the field was added after `orderAttendees` had rows in
 * production, so legacy attendee rows carry no `eventId` and are invisible to
 * the new event-scoped `by_eventId` source scan (the attendee ledger and the
 * donation-allocation picker). New rows are written with the field by all four
 * production insert sites, so this only ever fills history.
 *
 * Shape (mirrors `backfillSearchProjections.ts`):
 * - Batched and resumable: `ctx.db.query("orderAttendees").order("asc").paginate`
 *   with an opaque `nextCursor`; repeat with the returned cursor until
 *   `isDone: true`. A completed batch is safe to re-run.
 * - Idempotent: rows already carrying `eventId` are counted as processed and
 *   left untouched, so a second pass patches zero.
 * - Production-guarded: `assertProductionDeployment` fails closed before any
 *   read or write unless `authorize: true` AND the detected `CONVEX_SITE_URL`
 *   exactly matches `allowedDeploymentUrl` (canonical slug form).
 * - Honest about gaps: an attendee whose order is missing (or has no eventId)
 *   is SKIPPED with a diagnostic — never guessed from another row.
 *
 * Running it against production is an operator-gated deploy step documented in
 * `docs/production-deployment-runbook.md`; Phase 62 only ran it against the dev
 * deployment.
 */
const MAX_BATCH_SIZE = 200

const diagnosticValidator = v.object({
  subjectId: v.string(),
  reason: v.string(),
})

export default internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    batchSize: v.number(),
    authorize: v.boolean(),
    allowedDeploymentUrl: v.optional(v.string()),
  },
  returns: v.object({
    processed: v.number(),
    patched: v.number(),
    skipped: v.number(),
    isDone: v.boolean(),
    nextCursor: v.union(v.string(), v.null()),
    diagnostics: v.array(diagnosticValidator),
  }),
  handler: async (ctx, args) => {
    assertProductionDeployment({
      authorize: args.authorize,
      allowedDeploymentUrl: args.allowedDeploymentUrl,
      operation: "attendee eventId backfill",
    })
    if (
      !Number.isInteger(args.batchSize) ||
      args.batchSize < 1 ||
      args.batchSize > MAX_BATCH_SIZE
    ) {
      throw new Error(
        `batchSize must be an integer between 1 and ${MAX_BATCH_SIZE}.`
      )
    }

    const page = await ctx.db
      .query("orderAttendees")
      .order("asc")
      .paginate({ numItems: args.batchSize, cursor: args.cursor })

    const diagnostics: Array<{ subjectId: string; reason: string }> = []
    let patched = 0
    let skipped = 0
    for (const row of page.page) {
      if (row.eventId) continue // already backfilled — the idempotent fast path
      const order = await ctx.db.get("orders", row.orderId)
      if (!order || !order.eventId) {
        skipped += 1
        diagnostics.push({
          subjectId: String(row._id),
          reason: "eventless or missing order",
        })
        continue
      }
      await ctx.db.patch("orderAttendees", row._id, { eventId: order.eventId })
      patched += 1
    }

    return {
      processed: page.page.length,
      patched,
      skipped,
      isDone: page.isDone,
      nextCursor: page.isDone ? null : page.continueCursor,
      diagnostics: diagnostics.slice(0, 100),
    }
  },
})
