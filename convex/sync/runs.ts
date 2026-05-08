import { query, mutation, internalMutation } from "../_generated/server"
import { v } from "convex/values"
import { requireIdentity } from "../auth"

// Public queries

export const getSyncRuns = query({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db
      .query("ticketTailorSyncRuns")
      .order("desc")
      .take(50)
    return runs
  },
})

export const getSyncRunById = query({
  args: { runId: v.id("ticketTailorSyncRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get("ticketTailorSyncRuns", args.runId)
  },
})

export const getLatestSyncRun = query({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db
      .query("ticketTailorSyncRuns")
      .order("desc")
      .take(1)
    return runs[0] ?? null
  },
})

// Public mutations (require authentication)

export const startSyncRun = mutation({
  args: {},
  returns: v.id("ticketTailorSyncRuns"),
  handler: async (ctx) => {
    await requireIdentity(ctx)
    const id = await ctx.db.insert("ticketTailorSyncRuns", {
      status: "running",
      startedAt: Date.now(),
      eventsScanned: 0,
      ordersFetched: 0,
      ordersUpserted: 0,
      ordersArchived: 0,
      normalizedFallbackCount: 0,
      failedItems: 0,
    })
    return id
  },
})

export const updateSyncRun = mutation({
  args: {
    runId: v.id("ticketTailorSyncRuns"),
    eventsScanned: v.optional(v.number()),
    ordersFetched: v.optional(v.number()),
    ordersUpserted: v.optional(v.number()),
    ordersArchived: v.optional(v.number()),
    normalizedFallbackCount: v.optional(v.number()),
    failedItems: v.optional(v.number()),
    errorSummary: v.optional(v.string()),
    diagnostics: v.optional(v.any()),
  },
  returns: v.id("ticketTailorSyncRuns"),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    const { runId, ...updates } = args
    await ctx.db.patch("ticketTailorSyncRuns", runId, updates)
    return runId
  },
})

export const completeSyncRun = mutation({
  args: {
    runId: v.id("ticketTailorSyncRuns"),
    status: v.union(
      v.literal("success"),
      v.literal("partial"),
      v.literal("failed")
    ),
    errorSummary: v.optional(v.string()),
    diagnostics: v.optional(v.any()),
    eventsScanned: v.optional(v.number()),
    ordersFetched: v.optional(v.number()),
    ordersUpserted: v.optional(v.number()),
    ordersArchived: v.optional(v.number()),
    normalizedFallbackCount: v.optional(v.number()),
    failedItems: v.optional(v.number()),
  },
  returns: v.id("ticketTailorSyncRuns"),
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    await ctx.db.patch("ticketTailorSyncRuns", args.runId, {
      status: args.status,
      finishedAt: Date.now(),
      errorSummary: args.errorSummary,
      diagnostics: args.diagnostics,
      eventsScanned: args.eventsScanned,
      ordersFetched: args.ordersFetched,
      ordersUpserted: args.ordersUpserted,
      ordersArchived: args.ordersArchived,
      normalizedFallbackCount: args.normalizedFallbackCount,
      failedItems: args.failedItems,
    })
    return args.runId
  },
})

// Internal mutations (no auth - for cron/action use)

export const internalStartSyncRun = internalMutation({
  args: {},
  returns: v.id("ticketTailorSyncRuns"),
  handler: async (ctx) => {
    const id = await ctx.db.insert("ticketTailorSyncRuns", {
      status: "running",
      startedAt: Date.now(),
      eventsScanned: 0,
      ordersFetched: 0,
      ordersUpserted: 0,
      ordersArchived: 0,
      normalizedFallbackCount: 0,
      failedItems: 0,
    })
    return id
  },
})

export const internalCompleteSyncRun = internalMutation({
  args: {
    runId: v.id("ticketTailorSyncRuns"),
    status: v.union(
      v.literal("success"),
      v.literal("partial"),
      v.literal("failed")
    ),
    errorSummary: v.optional(v.string()),
    diagnostics: v.optional(v.any()),
    eventsScanned: v.optional(v.number()),
    ordersFetched: v.optional(v.number()),
    ordersUpserted: v.optional(v.number()),
    ordersArchived: v.optional(v.number()),
    normalizedFallbackCount: v.optional(v.number()),
    failedItems: v.optional(v.number()),
  },
  returns: v.id("ticketTailorSyncRuns"),
  handler: async (ctx, args) => {
    await ctx.db.patch("ticketTailorSyncRuns", args.runId, {
      status: args.status,
      finishedAt: Date.now(),
      errorSummary: args.errorSummary,
      diagnostics: args.diagnostics,
      eventsScanned: args.eventsScanned,
      ordersFetched: args.ordersFetched,
      ordersUpserted: args.ordersUpserted,
      ordersArchived: args.ordersArchived,
      normalizedFallbackCount: args.normalizedFallbackCount,
      failedItems: args.failedItems,
    })
    return args.runId
  },
})
