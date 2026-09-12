import { internal } from "./_generated/api"
import {
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import { v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"

export const MAX_CANONICAL_ROWS_PER_INVOCATION = 1
export const MAX_PROJECTION_POSTINGS_PER_SUBJECT = 64
export const MAX_RELATED_DOCUMENTS_READ_PER_INVOCATION = 200
export const MAX_DOCUMENTS_WRITTEN_PER_INVOCATION = 256
export const MAX_FANOUT_SUBJECTS_PER_INVOCATION = 1
export const MAX_SEARCH_TEXT_LENGTH = 512
export const MAX_SEARCH_TERMS = 32

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

function projectionKey(kind: SearchKind, subjectId: string) {
  return `${kind}:${subjectId}`
}

function termsForText(text: string): string[] {
  return searchTerms(text)
}

async function eventIsInternal(ctx: DbCtx, eventId: Id<"events">) {
  const event = await ctx.db.get("events", eventId)
  return event?.primarySourceKind === "internal"
}

async function oldPostings(ctx: DbCtx, documentKey: string) {
  const rows = await ctx.db
    .query("searchDocumentTerms")
    .withIndex("by_documentKey", (q) => q.eq("documentKey", documentKey))
    .take(MAX_PROJECTION_POSTINGS_PER_SUBJECT + 1)
  if (rows.length > MAX_PROJECTION_POSTINGS_PER_SUBJECT) {
    throw new SearchProjectionBlocked(
      `${documentKey} has more than ${MAX_PROJECTION_POSTINGS_PER_SUBJECT} existing postings`
    )
  }
  return rows
}

function ensureWriteBudget(oldCount: number, newCount: number) {
  const writes = 1 + oldCount + newCount
  if (writes > MAX_DOCUMENTS_WRITTEN_PER_INVOCATION) {
    throw new SearchProjectionBlocked(
      `replacement requires ${writes} writes (budget ${MAX_DOCUMENTS_WRITTEN_PER_INVOCATION})`
    )
  }
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
  const key = projectionKey(projection.kind, projection.subjectId)
  const terms = [...new Set(termsForText(projection.searchText))]
  if (terms.length > MAX_PROJECTION_POSTINGS_PER_SUBJECT) {
    throw new SearchProjectionBlocked(
      `${key} requires ${terms.length} postings (budget ${MAX_PROJECTION_POSTINGS_PER_SUBJECT})`
    )
  }
  const existing = await oldPostings(ctx, key)
  ensureWriteBudget(existing.length, projection.isSearchable ? terms.length : 0)
  const current = await ctx.db
    .query("searchDocuments")
    .withIndex("by_kind_and_subjectId", (q) =>
      q.eq("kind", projection.kind).eq("subjectId", projection.subjectId)
    )
    .unique()
  for (const posting of existing) await ctx.db.delete(posting._id)
  const now = Date.now()
  const document = {
    ...projection,
    searchText: projection.isSearchable ? normalizeSearch(projection.searchText) : "",
    updatedAt: now,
  }
  const documentId = current
    ? (await ctx.db.patch("searchDocuments", current._id, document), current._id)
    : await ctx.db.insert("searchDocuments", document)
  if (projection.isSearchable) {
    for (const term of terms) {
      await ctx.db.insert("searchDocumentTerms", {
        documentKey: key,
        kind: projection.kind,
        eventId: projection.eventId,
        term,
        sortAt: projection.sortAt,
        subjectId: projection.subjectId,
      })
    }
  }
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
  const key = projectionKey(kind, subjectId)
  const existing = await ctx.db
    .query("searchDocuments")
    .withIndex("by_kind_and_subjectId", (q) => q.eq("kind", kind).eq("subjectId", subjectId))
    .unique()
  const postings = await oldPostings(ctx, key)
  for (const posting of postings) await ctx.db.delete(posting._id)
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

type PartialSubject = { subjectId: string; sortAt: number; matchedTerms: string[] }
type PendingSubject = { subjectId: string; sortAt: number }
type CursorState = {
  version: 2
  signature: string
  scanCursor: string | null
  partial: PartialSubject | null
  pendingSubjectIds: PendingSubject[]
}
function encodeCursor(value: CursorState) { return `s:${encodeURIComponent(JSON.stringify(value))}` }
function decodeCursor(value: string): CursorState {
  try {
    const parsed = JSON.parse(decodeURIComponent(value.startsWith("s:") ? value.slice(2) : value)) as CursorState
    if (parsed.version !== 2 || typeof parsed.signature !== "string" ||
        (parsed.scanCursor !== null && typeof parsed.scanCursor !== "string") ||
        (parsed.partial !== null && typeof parsed.partial !== "object") ||
        !Array.isArray(parsed.pendingSubjectIds)) throw new Error()
    return parsed
  } catch { throw new Error("Invalid search continuation cursor.") }
}

export async function paginateSearchDocuments(ctx: QueryCtx, args: { kind: SearchKind; eventId?: Id<"events">; search?: string | null; cursor?: string | null; numItems: number }) {
  if (!Number.isInteger(args.numItems) || args.numItems < 1 || args.numItems > MAX_RELATED_DOCUMENTS_READ_PER_INVOCATION) throw new Error("Invalid search page size.")
  const normalized = normalizeSearch(args.search)
  const terms = searchTerms(normalized)
  if (!terms.length) {
    const query = args.eventId
      ? ctx.db.query("searchDocuments").withIndex("by_kind_and_eventId_and_sortAt_and_subjectId", (q) => q.eq("kind", args.kind).eq("eventId", args.eventId!))
      : ctx.db.query("searchDocuments").withIndex("by_kind_and_sortAt_and_subjectId_and_eventId", (q) => q.eq("kind", args.kind))
    const page = await query.order("desc").paginate({ numItems: args.numItems, cursor: args.cursor ?? null })
    const visible: Doc<"searchDocuments">[] = []
    for (const row of page.page) {
      if (row.isSearchable && (await eventIsInternal(ctx, row.eventId))) visible.push(row)
    }
    return { page: visible, isDone: page.isDone, continueCursor: page.isDone ? null : page.continueCursor }
  }
  const signature = JSON.stringify({ kind: args.kind, eventId: args.eventId ?? null, terms })
  const state = args.cursor
    ? decodeCursor(args.cursor)
    : { version: 2 as const, signature, scanCursor: null, partial: null, pendingSubjectIds: [] }
  if (state.signature !== signature) throw new Error("Search continuation cursor does not match the query.")
  const result: Doc<"searchDocuments">[] = []
  const matched: PendingSubject[] = state.pendingSubjectIds.splice(0)
  const matchedTerms = new Set(state.partial?.matchedTerms ?? [])
  let partial = state.partial

  const postingQuery = args.eventId
    ? ctx.db.query("searchDocumentTerms").withIndex("by_kind_and_eventId_and_sortAt_and_subjectId_and_term", (q) => q.eq("kind", args.kind).eq("eventId", args.eventId!))
    : ctx.db.query("searchDocumentTerms").withIndex("by_kind_and_sortAt_and_subjectId_and_eventId_and_term", (q) => q.eq("kind", args.kind))
  // There is deliberately one posting paginate per invocation. A subject may
  // span pages because it has one posting per indexed term, so retain its
  // partial match and complete it on the next invocation.
  if (matched.length < args.numItems) {
    const postingPage = await postingQuery.order("desc").paginate({ numItems: MAX_RELATED_DOCUMENTS_READ_PER_INVOCATION, cursor: state.scanCursor })
    let current = partial
    for (const posting of postingPage.page) {
      if (!current || current.subjectId !== posting.subjectId) {
        if (current && matchedTerms.size === terms.length) matched.push({ subjectId: current.subjectId, sortAt: current.sortAt })
        current = { subjectId: posting.subjectId, sortAt: posting.sortAt, matchedTerms: [] }
        matchedTerms.clear()
      }
      for (const term of terms) if (posting.term.startsWith(term)) matchedTerms.add(term)
      current.matchedTerms = [...matchedTerms]
    }
    if (current) {
      if (matchedTerms.size === terms.length && (postingPage.isDone || postingPage.page.length === 0 || postingPage.page[postingPage.page.length - 1].subjectId !== current.subjectId)) matched.push({ subjectId: current.subjectId, sortAt: current.sortAt })
      partial = postingPage.isDone ? null : current
    }
    state.scanCursor = postingPage.isDone ? null : postingPage.continueCursor
    if (postingPage.isDone && partial) { if (matchedTerms.size === terms.length) matched.push({ subjectId: partial.subjectId, sortAt: partial.sortAt }); partial = null }
  }
  matched.sort((a, b) => (b.sortAt - a.sortAt) || b.subjectId.localeCompare(a.subjectId))
  const pending = matched.splice(args.numItems)
  for (const candidate of matched) {
    const document = await ctx.db.query("searchDocuments").withIndex("by_kind_and_subjectId", (q) => q.eq("kind", args.kind).eq("subjectId", candidate.subjectId)).unique()
    if (document?.isSearchable && (!args.eventId || document.eventId === args.eventId) && await eventIsInternal(ctx, document.eventId)) result.push(document)
  }
  const isDone = state.scanCursor === null && partial === null && pending.length === 0
  return { page: result, isDone, continueCursor: isDone ? null : encodeCursor({ version: 2, signature, scanCursor: state.scanCursor, partial, pendingSubjectIds: pending }) }
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
