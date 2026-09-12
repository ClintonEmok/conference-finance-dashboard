/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"
import { api, internal } from "./_generated/api"
import schema from "./schema"
import {
  paginateSearchDocuments,
  upsertAttendeeSearchDocument,
  upsertOrderSearchDocument,
} from "./search"

const modules = import.meta.glob("./**/*.ts")
const identity = { subject: "search-admin", name: "Search Admin", email: "admin@example.com" }
const deployment = "https://grateful-pelican-605.convex.cloud"
process.env.CONVEX_SITE_URL = deployment

function fresh() { return convexTest(schema, modules) }

async function seed(t: TestConvexForDataModel<GenericDataModel>) {
  return await t.mutation(async (ctx) => {
    const internalEvent = await ctx.db.insert("events", {
      slug: "search-internal", title: "Search Event", startsAt: 1_700_000_000_000,
      timezone: "Europe/Amsterdam", currency: "EUR", isPublished: true, isSignupOpen: true,
      accommodationEnabled: false, primarySourceKind: "internal", updatedAt: 1,
    })
    const integrationEvent = await ctx.db.insert("events", {
      slug: "search-integration", title: "Integration", startsAt: 1_700_000_000_000,
      timezone: "Europe/Amsterdam", currency: "EUR", isPublished: true, isSignupOpen: true,
      accommodationEnabled: false, primarySourceKind: "integration", updatedAt: 1,
    })
    const ticket = await ctx.db.insert("ticketTypes", {
      eventId: internalEvent, label: "Volunteer Pass", priceMinor: 100, isActive: true,
      visibility: "public", availabilityState: "selectable", updatedAt: 1,
    })
    const order = await ctx.db.insert("orders", {
      eventId: internalEvent, source: "internal", bookingRef: "BK-ALPHA-01", bookerName: "Alice Example",
      bookerEmail: "alice@example.com", providerOrderId: "PROVIDER-ALPHA", submittedAt: 300, status: "pending",
    })
    const newer = await ctx.db.insert("orders", {
      eventId: internalEvent, source: "internal", bookingRef: "BK-BETA-02", bookerName: "Bob Beta",
      bookerEmail: "bob@example.com", providerOrderId: "PROVIDER-BETA", submittedAt: 500, status: "paid",
    })
    const merged = await ctx.db.insert("orders", {
      eventId: internalEvent, source: "internal", bookingRef: "BK-MERGED", bookerName: "Hidden Merge",
      submittedAt: 600, mergedIntoOrderId: newer,
    })
    const external = await ctx.db.insert("orders", {
      eventId: integrationEvent, source: "integration", bookingRef: "BK-EXTERNAL", bookerName: "External",
      submittedAt: 900,
    })
    const attendee = await ctx.db.insert("orderAttendees", {
      orderId: order, attendeeKey: "a1", name: "Charlie Child", email: "charlie@example.com",
      gender: "unknown", sortOrder: 0,
    })
    await ctx.db.insert("orderTicketSelections", { orderId: order, attendeeId: attendee, ticketTypeId: ticket, quantity: 1, sortOrder: 0 })
    const family = await ctx.db.insert("attendeeFamilyGroups", { label: "Alpha Family", primaryAttendeeId: String(attendee) })
    await ctx.db.insert("attendeeFamilyMembers", { familyGroupId: String(family), attendeeId: String(attendee), relationship: "child" })
    await ctx.db.insert("orderBookingRefAliases", { bookingRef: "OLD-ALPHA", sourceOrderId: order, targetOrderId: order, createdAt: 1 })
    return { internalEvent, integrationEvent, ticket, order, newer, merged, external, attendee }
  })
}

test("projection text is canonical, joined, idempotent, and excludes merged subjects", async () => {
  const t = fresh().withIdentity(identity); const ids = await seed(t)
  await t.mutation(async (ctx) => { await upsertOrderSearchDocument(ctx, ids.order); await upsertAttendeeSearchDocument(ctx, ids.attendee); await upsertOrderSearchDocument(ctx, ids.order) })
  const rows = await t.run(async (ctx) => await ctx.db.query("searchDocuments").order("asc").take(20))
  expect(rows).toHaveLength(2)
  expect(rows.find((row) => row.kind === "order")?.searchText).toContain("old-alpha")
  expect(rows.find((row) => row.kind === "attendee")?.searchText).toContain("volunteer pass")
  expect(rows.find((row) => row.kind === "attendee")?.searchText).toContain("alpha family")
  expect((await t.run(async (ctx) => await ctx.db.query("searchDocumentTerms").take(100))).length).toBeGreaterThan(0)
  await t.mutation(async (ctx) => { await upsertOrderSearchDocument(ctx, ids.merged) })
  const mergedProjection = await t.run(async (ctx) => await ctx.db.query("searchDocuments").withIndex("by_kind_and_subjectId", (q) => q.eq("kind", "order").eq("subjectId", String(ids.merged))).unique())
  expect(mergedProjection).toBeNull()
})

test("term cursor search is prefix-aware, deduplicated, newest-first, and rejects mismatches", async () => {
  const t = fresh().withIdentity(identity); const ids = await seed(t)
  await t.mutation(async (ctx) => { await upsertOrderSearchDocument(ctx, ids.order); await upsertOrderSearchDocument(ctx, ids.newer) })
  const first = await t.run(async (ctx) => paginateSearchDocuments(ctx, { kind: "order", eventId: ids.internalEvent, search: "pro", numItems: 1, cursor: null }))
  expect(first.page).toHaveLength(1); expect(first.page[0].subjectId).toBe(String(ids.newer))
  expect(first.isDone).toBe(false)
  const second = await t.run(async (ctx) => paginateSearchDocuments(ctx, { kind: "order", eventId: ids.internalEvent, search: "pro", numItems: 1, cursor: first.continueCursor }))
  expect(second.page[0].subjectId).toBe(String(ids.order)); expect(second.page[0].subjectId).not.toBe(first.page[0].subjectId)
  await expect(t.run(async (ctx) => paginateSearchDocuments(ctx, { kind: "attendee", eventId: ids.internalEvent, search: "pro", numItems: 1, cursor: first.continueCursor }))).rejects.toThrow(/does not match/)
})

test("order ledger search retains core-only searchable orders", async () => {
  const t = fresh().withIdentity(identity); const ids = await seed(t)
  await t.mutation(async (ctx) => { await upsertOrderSearchDocument(ctx, ids.order) })

  const result = await t.query(api.orders.getOrdersWithFilters, {
    eventId: String(ids.internalEvent), search: "alice", page: 1, pageSize: 25,
  })

  expect(result.orders).toHaveLength(1)
  expect(result.orders[0]?.buyerName).toBe("Alice Example")
})

test("one posting scan preserves a multi-term subject split across a page boundary", async () => {
  const t = fresh().withIdentity(identity)
  const ids = await seed(t)
  const event = await t.run(async (ctx) => ctx.db.get("events", ids.internalEvent))
  if (!event) throw new Error("seed event required")
  await t.mutation(async (ctx) => {
    // Keep the qualifying subject at the end of the descending posting scan.
    // Its two postings must be reassembled across the 200-row scan boundary.
    for (let index = 100; index < 299; index++) {
      const subjectId = `subject-${index}`
      await ctx.db.insert("searchDocuments", { kind: "order", subjectId, eventId: event._id, searchText: "", sortAt: 1_000, isSearchable: true, updatedAt: 1 })
      await ctx.db.insert("searchDocumentTerms", { documentKey: `order:${subjectId}`, kind: "order", eventId: event._id, term: "other", sortAt: 1_000, subjectId })
    }
    const subjectId = "subject-000"
    await ctx.db.insert("searchDocuments", { kind: "order", subjectId, eventId: event._id, searchText: "", sortAt: 1_000, isSearchable: true, updatedAt: 1 })
    for (const term of ["alpha", "alphabet"]) {
      await ctx.db.insert("searchDocumentTerms", { documentKey: `order:${subjectId}`, kind: "order", eventId: event._id, term, sortAt: 1_000, subjectId })
    }
  })

  const first = await t.run(async (ctx) => paginateSearchDocuments(ctx, { kind: "order", eventId: event._id, search: "alpha alph", numItems: 1, cursor: null }))
  expect(first.page).toEqual([])
  expect(first.isDone).toBe(false)
  await expect(t.run(async (ctx) => paginateSearchDocuments(ctx, { kind: "order", eventId: event._id, search: "alpha beta", numItems: 1, cursor: first.continueCursor }))).rejects.toThrow(/does not match/)
  const second = await t.run(async (ctx) => paginateSearchDocuments(ctx, { kind: "order", eventId: event._id, search: "alpha alph", numItems: 1, cursor: first.continueCursor }))
  expect(second.page).toHaveLength(1)
  expect(second.page[0].subjectId).toBe("subject-000")
})

test("empty search advances one bounded projection page at a time", async () => {
  const t = fresh().withIdentity(identity)
  const ids = await seed(t)
  const event = await t.run(async (ctx) => ctx.db.get("events", ids.internalEvent))
  if (!event) throw new Error("seed event required")
  await t.mutation(async (ctx) => {
    for (let index = 0; index < 3; index++) {
      await ctx.db.insert("searchDocuments", { kind: "order", subjectId: `empty-${index}`, eventId: event._id, searchText: "", sortAt: index, isSearchable: true, updatedAt: 1 })
    }
  })
  const first = await t.run(async (ctx) => paginateSearchDocuments(ctx, { kind: "order", eventId: event._id, search: "", numItems: 2, cursor: null }))
  expect(first.page).toHaveLength(2)
  expect(first.isDone).toBe(false)
  const second = await t.run(async (ctx) => paginateSearchDocuments(ctx, { kind: "order", eventId: event._id, search: "", numItems: 2, cursor: first.continueCursor }))
  expect(second.page).toHaveLength(1)
  expect(second.isDone).toBe(true)
})

test("empty search uses bounded continuation and backfill is fail-closed with batch size 1", async () => {
  const t = fresh().withIdentity(identity); const ids = await seed(t)
  const first = await t.run(async (ctx) => paginateSearchDocuments(ctx, { kind: "order", eventId: ids.internalEvent, numItems: 1, cursor: null }))
  expect(first.page).toEqual([])
  await expect(t.mutation(internal.backfillSearchProjections.default, { kind: "order", cursor: null, batchSize: 2, authorize: true, allowedDeploymentUrl: deployment })).rejects.toThrow(/batchSize/)
  await expect(t.mutation(internal.backfillSearchProjections.default, { kind: "order", cursor: null, batchSize: 1, authorize: false, allowedDeploymentUrl: deployment })).rejects.toThrow(/AUTHORIZATION_REQUIRED/)
  const result = await t.mutation(internal.backfillSearchProjections.default, { kind: "order", cursor: null, batchSize: 1, authorize: true, allowedDeploymentUrl: deployment })
  expect(result.processed).toBe(1); expect(result.nextCursor).toBeTruthy()
  const verification = await t.query(internal.backfillSearchProjections.verifySearchProjections, { authorize: true, allowedDeploymentUrl: deployment })
  expect(verification.missing).toBe(2)
})

test("verification ignores non-event and merged records", async () => {
  const t = fresh().withIdentity(identity); await seed(t)
  const verification = await t.query(internal.backfillSearchProjections.verifySearchProjections, { authorize: true, allowedDeploymentUrl: deployment })
  expect(verification.missing).toBe(3)
  expect(verification.diagnostics.every((entry) => !entry.reason.includes("merged") && !entry.reason.includes("external"))).toBe(true)
})

test("verification authorization fails before it reads", async () => {
  const t = fresh()
  await expect(t.query(internal.backfillSearchProjections.verifySearchProjections, { authorize: false, allowedDeploymentUrl: deployment })).rejects.toThrow(/AUTHORIZATION_REQUIRED/)
})

test("posting budget rejects an oversized replacement before any write", async () => {
  const t = fresh().withIdentity(identity); const ids = await seed(t)
  await t.mutation(async (ctx) => {
    for (let index = 0; index < 65; index++) {
      await ctx.db.insert("orderBookingRefAliases", {
        bookingRef: `OVER-${index}`, sourceOrderId: ids.order, targetOrderId: ids.order, createdAt: index,
      })
    }
  })
  await expect(t.mutation(async (ctx) => upsertOrderSearchDocument(ctx, ids.order))).rejects.toThrow(/more than 64/)
  expect(await t.run(async (ctx) => ctx.db.query("searchDocuments").take(10))).toHaveLength(0)
})
