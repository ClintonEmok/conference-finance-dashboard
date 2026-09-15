import { internal } from "./_generated/api"
import {
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import { v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"

export const MAX_CANONICAL_ROWS_PER_INVOCATION = 1
export const MAX_RELATED_DOCUMENTS_READ_PER_INVOCATION = 200
export const MAX_FANOUT_SUBJECTS_PER_INVOCATION = 1
export const MAX_SEARCH_TEXT_LENGTH = 512
// Convex native full-text search accepts at most 16 terms in a single search
// expression, so the caller-facing cap matches that hard limit.
export const MAX_SEARCH_TERMS = 16

type SearchKind = "order" | "attendee"
type DbCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">

export class SearchProjectionBlocked extends Error {
  constructor(public readonly reason: string) {
    super(`SEARCH_PROJECTION_BLOCKED: ${reason}`)
  }
}

function boundedText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
}

export function normalizeSearch(value: string | undefined | null): string {
  const result = boundedText(value).toLowerCase()
  if (result.length > MAX_SEARCH_TEXT_LENGTH) {
    throw new Error(`Search input exceeds ${MAX_SEARCH_TEXT_LENGTH} characters.`)
  }
  return result
}

export function searchTerms(value: string): string[] {
  const normalized = normalizeSearch(value)
  const terms = normalized.match(/[\p{L}\p{N}]+/gu) ?? []
  const unique = [...new Set(terms)]
  if (unique.length > MAX_SEARCH_TERMS) {
    throw new Error(`Search input contains more than ${MAX_SEARCH_TERMS} terms.`)
  }
  return unique
}

async function eventIsInternal(ctx: DbCtx, eventId: Id<"events">) {
  const event = await ctx.db.get("events", eventId)
  return event?.primarySourceKind === "internal"
}

type BuiltProjection = {
  kind: SearchKind
  subjectId: string
  eventId: Id<"events">
  searchText: string
  sortAt: number
  isSearchable: boolean
}

async function replaceProjection(
  ctx: MutationCtx,
  projection: BuiltProjection
): Promise<Doc<"searchDocuments">> {
  if (projection.searchText.length > MAX_SEARCH_TEXT_LENGTH) {
    throw new SearchProjectionBlocked(
      `projection text exceeds ${MAX_SEARCH_TEXT_LENGTH} characters`
    )
  }
  const current = await ctx.db
    .query("searchDocuments")
    .withIndex("by_kind_and_subjectId", (q) =>
      q.eq("kind", projection.kind).eq("subjectId", projection.subjectId)
    )
    .unique()
  const now = Date.now()
  const document = {
    ...projection,
    searchText: projection.isSearchable ? normalizeSearch(projection.searchText) : "",
    updatedAt: now,
  }
  // The native `search_text` index is maintained by Convex from `searchText`,
  // so a projection upsert is a single document write with no postings.
  const documentId = current
    ? (await ctx.db.patch("searchDocuments", current._id, document), current._id)
    : await ctx.db.insert("searchDocuments", document)
  return { ...document, _id: documentId, _creationTime: current?._creationTime ?? now }
}

async function orderProjection(ctx: DbCtx, orderId: Id<"orders">): Promise<BuiltProjection | null> {
  const order = await ctx.db.get("orders", orderId)
  if (!order?.eventId || order.mergedIntoOrderId || !(await eventIsInternal(ctx, order.eventId))) return null
  const aliases = await ctx.db.query("orderBookingRefAliases").withIndex("by_sourceOrderId", (q) => q.eq("sourceOrderId", orderId)).take(65)
  if (aliases.length > 64) throw new SearchProjectionBlocked(`${orderId} has more than 64 booking-reference aliases`)
  const text = [
    String(order._id), order.bookerName, order.bookerEmail, order.bookingRef,
    order.providerOrderId, ...aliases.map((alias) => alias.bookingRef),
  ].filter(Boolean).join(" ")
  return {
    kind: "order", subjectId: String(order._id), eventId: order.eventId,
    searchText: text, sortAt: order.submittedAt ?? order.orderedAt ?? order._creationTime,
    isSearchable: true,
  }
}

async function attendeeProjection(ctx: DbCtx, attendeeId: Id<"orderAttendees">): Promise<BuiltProjection | null> {
  const attendee = await ctx.db.get("orderAttendees", attendeeId)
  const order = attendee ? await ctx.db.get("orders", attendee.orderId) : null
  if (!attendee || !order?.eventId || order.mergedIntoOrderId || !(await eventIsInternal(ctx, order.eventId))) return null
  let reads = 2
  const selections = await ctx.db.query("orderTicketSelections").withIndex("by_orderId", (q) => q.eq("orderId", order._id)).take(201); reads++
  if (selections.length > MAX_RELATED_DOCUMENTS_READ_PER_INVOCATION) throw new SearchProjectionBlocked(`${attendeeId} requires more than 200 related reads`)
  const ticketLabels: string[] = []
  for (const selection of selections.filter((entry) => entry.attendeeId === attendeeId)) {
    const ticket = await ctx.db.get("ticketTypes", selection.ticketTypeId); reads++
    if (ticket?.label) ticketLabels.push(ticket.label)
  }
  const familyMember = await ctx.db.query("attendeeFamilyMembers").withIndex("attendeeId", (q) => q.eq("attendeeId", String(attendeeId))).first(); reads++
  const familyGroupId = familyMember ? ctx.db.normalizeId("attendeeFamilyGroups", familyMember.familyGroupId) : null
  const family = familyGroupId ? await ctx.db.get("attendeeFamilyGroups", familyGroupId) : null; if (familyGroupId) reads++
  if (reads > MAX_RELATED_DOCUMENTS_READ_PER_INVOCATION) throw new SearchProjectionBlocked(`${attendeeId} requires ${reads} related reads`)
  const text = [attendee.name, attendee.email, order.bookingRef, ...ticketLabels, family?.label, order.status].filter(Boolean).join(" ")
  return {
    kind: "attendee", subjectId: String(attendee._id), eventId: order.eventId,
    searchText: text, sortAt: order.submittedAt ?? order.orderedAt ?? order._creationTime,
    isSearchable: true,
  }
}

export async function upsertOrderSearchDocument(ctx: MutationCtx, orderId: Id<"orders">) {
  const projection = await orderProjection(ctx, orderId)
  if (projection) return replaceProjection(ctx, projection)
  const existing = await ctx.db.query("searchDocuments").withIndex("by_kind_and_subjectId", (q) => q.eq("kind", "order").eq("subjectId", String(orderId))).unique()
  if (existing) return replaceProjection(ctx, { kind: "order", subjectId: String(orderId), eventId: existing.eventId, searchText: "", sortAt: existing.sortAt, isSearchable: false })
  return null
}

export async function upsertAttendeeSearchDocument(ctx: MutationCtx, attendeeId: Id<"orderAttendees">) {
  const projection = await attendeeProjection(ctx, attendeeId)
  if (projection) return replaceProjection(ctx, projection)
  const existing = await ctx.db.query("searchDocuments").withIndex("by_kind_and_subjectId", (q) => q.eq("kind", "attendee").eq("subjectId", String(attendeeId))).unique()
  if (existing) return replaceProjection(ctx, { kind: "attendee", subjectId: String(attendeeId), eventId: existing.eventId, searchText: "", sortAt: existing.sortAt, isSearchable: false })
  return null
}

export async function deleteSearchProjection(
  ctx: MutationCtx,
  kind: SearchKind,
  subjectId: string
) {
  const existing = await ctx.db
    .query("searchDocuments")
    .withIndex("by_kind_and_subjectId", (q) => q.eq("kind", kind).eq("subjectId", subjectId))
    .unique()
  if (existing) await ctx.db.delete(existing._id)
}

export async function refreshAttendeeSearchDocumentsForOrder(ctx: MutationCtx, orderId: Id<"orders">, cursor: string | null = null) {
  const page = await ctx.db.query("orderAttendees").withIndex("by_orderId", (q) => q.eq("orderId", orderId)).paginate({ numItems: MAX_FANOUT_SUBJECTS_PER_INVOCATION, cursor })
  if (page.page[0]) await upsertAttendeeSearchDocument(ctx, page.page[0]._id)
  return page.isDone ? null : page.continueCursor
}

/** Refresh the order itself and one attendee, then leave the remainder resumable. */
export async function maintainOrderSearchProjection(ctx: MutationCtx, orderId: Id<"orders">) {
  await upsertOrderSearchDocument(ctx, orderId)
  const next = await refreshAttendeeSearchDocumentsForOrder(ctx, orderId)
  if (next !== null) await enqueueSearchProjectionFanout(ctx, "order", orderId, next)
}

async function refreshByAttendeeIds(ctx: MutationCtx, ids: Id<"orderAttendees">[], cursor: string | null) {
  const page = ids.slice(cursor ? Number(cursor) : 0, (cursor ? Number(cursor) : 0) + 1)
  if (page[0]) await upsertAttendeeSearchDocument(ctx, page[0])
  const next = (cursor ? Number(cursor) : 0) + page.length
  return page.length ? String(next) : null
}

export async function refreshAttendeeSearchDocumentsForTicketType(ctx: MutationCtx, ticketTypeId: Id<"ticketTypes">, cursor: string | null) {
  const selections = await ctx.db.query("orderTicketSelections").withIndex("by_ticketTypeId", (q) => q.eq("ticketTypeId", ticketTypeId)).take(201)
  if (selections.length > 200) throw new SearchProjectionBlocked("ticket type affects more than 200 related rows")
  return refreshByAttendeeIds(ctx, [...new Set(selections.map((row) => row.attendeeId))], cursor)
}

export async function refreshAttendeeSearchDocumentsForFamily(ctx: MutationCtx, familyGroupId: Id<"attendeeFamilyGroups">, cursor: string | null) {
  const members = await ctx.db.query("attendeeFamilyMembers").withIndex("familyGroupId", (q) => q.eq("familyGroupId", String(familyGroupId))).take(201)
  if (members.length > 200) throw new SearchProjectionBlocked("family affects more than 200 related rows")
  return refreshByAttendeeIds(ctx, members.map((row) => ctx.db.normalizeId("orderAttendees", row.attendeeId)).filter((id): id is Id<"orderAttendees"> => Boolean(id)), cursor)
}

/**
 * Bounded search over the denormalized `searchDocuments` projection.
 *
 * Behavior after the native full-text migration:
 * - A non-empty query uses the `search_text` search index. Convex matches a
 *   document when it contains **any** of the query terms (OR, not AND) and
 *   returns results in relevance order (BM25-like), NOT newest-first. Only the
 *   final query term receives prefix matching. At most `MAX_SEARCH_TERMS` (16)
 *   unique terms are accepted, and the index scans at most 1024 matching
 *   documents per query.
 * - An empty query keeps the previous newest-first browse over the
 *   `searchDocuments` indexes.
 * - Projection visibility (`isSearchable`) and event scope
 *   (`eventIsInternal`) are enforced after the index read.
 */
export async function paginateSearchDocuments(ctx: QueryCtx, args: { kind: SearchKind; eventId?: Id<"events">; search?: string | null; cursor?: string | null; numItems: number }) {
  if (!Number.isInteger(args.numItems) || args.numItems < 1 || args.numItems > MAX_RELATED_DOCUMENTS_READ_PER_INVOCATION) throw new Error("Invalid search page size.")
  const normalized = normalizeSearch(args.search)
  const terms = searchTerms(normalized)
  if (!terms.length) {
    const query = args.eventId
      ? ctx.db.query("searchDocuments").withIndex("by_kind_and_eventId_and_sortAt_and_subjectId", (q) => q.eq("kind", args.kind).eq("eventId", args.eventId!))
      : ctx.db.query("searchDocuments").withIndex("by_kind_and_sortAt_and_subjectId_and_eventId", (q) => q.eq("kind", args.kind))
    const page = await query.order("desc").paginate({ numItems: args.numItems, cursor: args.cursor ?? null })
    const browseVisible: Doc<"searchDocuments">[] = []
    for (const row of page.page) {
      if (row.isSearchable && (await eventIsInternal(ctx, row.eventId))) browseVisible.push(row)
    }
    return { page: browseVisible, isDone: page.isDone, continueCursor: page.isDone ? null : page.continueCursor }
  }
  const searchQuery = args.eventId
    ? ctx.db.query("searchDocuments").withSearchIndex("search_text", (q) => q.search("searchText", normalized).eq("kind", args.kind).eq("eventId", args.eventId!))
    : ctx.db.query("searchDocuments").withSearchIndex("search_text", (q) => q.search("searchText", normalized).eq("kind", args.kind))
  const page = await searchQuery.paginate({ numItems: args.numItems, cursor: args.cursor ?? null })
  const visible: Doc<"searchDocuments">[] = []
  for (const row of page.page) {
    if (row.isSearchable && (await eventIsInternal(ctx, row.eventId))) visible.push(row)
  }
  return { page: visible, isDone: page.isDone, continueCursor: page.isDone ? null : page.continueCursor }
}

export const startSearchProjectionFanout = internalMutation({
  args: { operation: v.union(v.literal("order"), v.literal("ticketType"), v.literal("family")), targetId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now()
    const jobId = await ctx.db.insert("searchProjectionFanoutJobs", { ...args, continuationCursor: null, status: "pending", processedCount: 0, attemptCount: 0, createdAt: now, updatedAt: now })
    await ctx.scheduler.runAfter(0, internal.search.continueSearchProjectionFanout, { jobId })
    return jobId
  },
})

export async function enqueueSearchProjectionFanout(
  ctx: MutationCtx,
  operation: "order" | "ticketType" | "family",
  targetId: string,
  continuationCursor: string | null = null
) {
  const now = Date.now()
  const jobId = await ctx.db.insert("searchProjectionFanoutJobs", { operation, targetId, continuationCursor, status: "pending", processedCount: 0, attemptCount: 0, createdAt: now, updatedAt: now })
  await ctx.scheduler.runAfter(0, internal.search.continueSearchProjectionFanout, { jobId })
  return jobId
}

export const continueSearchProjectionFanout = internalMutation({
  args: { jobId: v.id("searchProjectionFanoutJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get("searchProjectionFanoutJobs", args.jobId); if (!job) throw new Error("Fanout job not found.")
    await ctx.db.patch("searchProjectionFanoutJobs", args.jobId, { status: "running", attemptCount: job.attemptCount + 1, updatedAt: Date.now() })
    try {
      const target = ctx.db.normalizeId(job.operation === "order" ? "orders" : job.operation === "ticketType" ? "ticketTypes" : "attendeeFamilyGroups", job.targetId)
      if (!target) throw new SearchProjectionBlocked("invalid fanout target")
      let next: string | null
      if (job.operation === "order") next = await refreshAttendeeSearchDocumentsForOrder(ctx, target as Id<"orders">, job.continuationCursor)
      else if (job.operation === "ticketType") next = await refreshAttendeeSearchDocumentsForTicketType(ctx, target as Id<"ticketTypes">, job.continuationCursor)
      else next = await refreshAttendeeSearchDocumentsForFamily(ctx, target as Id<"attendeeFamilyGroups">, job.continuationCursor)
      const done = next === null
      await ctx.db.patch("searchProjectionFanoutJobs", args.jobId, { continuationCursor: next, status: done ? "complete" : "pending", processedCount: job.processedCount + 1, completedAt: done ? Date.now() : undefined, updatedAt: Date.now() })
      if (!done) await ctx.scheduler.runAfter(0, internal.search.continueSearchProjectionFanout, { jobId: args.jobId })
      return { status: done ? "complete" : "pending", nextCursor: next }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown fanout failure"
      await ctx.db.patch("searchProjectionFanoutJobs", args.jobId, { status: error instanceof SearchProjectionBlocked ? "blocked" : "pending", lastError: reason.slice(0, 512), updatedAt: Date.now() })
      if (!(error instanceof SearchProjectionBlocked)) await ctx.scheduler.runAfter(0, internal.search.continueSearchProjectionFanout, { jobId: args.jobId })
      throw error
    }
  },
})
