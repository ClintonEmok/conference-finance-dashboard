/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"
import { api } from "./_generated/api"
import schema from "./schema"
import { buildSearchHaystack, matchesNormalizedSearch } from "./search"

const modules = import.meta.glob("./**/*.ts")
const identity = {
  subject: "order-source-search-admin",
  name: "Order Source Search Admin",
  email: "order-source-search@example.com",
}

type TestConvex = TestConvexForDataModel<GenericDataModel>

type LedgerArgs = {
  eventId?: string
  from?: number
  to?: number
  status?: "paid" | "refunded" | "cancelled" | "pending"
  page?: number
  pageSize?: number
  search?: string
  searchCursor?: string | null
}

function fresh() {
  return convexTest(schema, modules).withIdentity(identity)
}

async function ledger(t: TestConvex, args: LedgerArgs = {}) {
  return await t.query(api.orders.getOrdersWithFilters, args)
}

/**
 * The source path's premise: the fixture contains NO projection rows, so an
 * implementation that still reads `searchDocuments` returns nothing here.
 */
async function expectSourceOnly(t: TestConvex) {
  const counts = await t.run(async (ctx) => ({
    documents: (await ctx.db.query("searchDocuments").take(10)).length,
    jobs: (await ctx.db.query("searchProjectionFanoutJobs").take(10)).length,
  }))
  expect(counts.documents).toBe(0)
  expect(counts.jobs).toBe(0)
}

/**
 * convex-test ids share a long zero prefix, so an 8-character prefix is not a
 * discriminating fragment there. Strip it for a real id fragment; production
 * ids have no such shape and 62-06 pins the real one live.
 */
function idFragment(id: string) {
  return id.replace(/^0+/, "")
}

const BASE_AT = 1_700_000_000_000

function internalEventDoc(slug: string) {
  return {
    slug,
    title: slug,
    startsAt: BASE_AT,
    timezone: "Europe/Amsterdam",
    currency: "EUR",
    isPublished: true,
    isSignupOpen: true,
    accommodationEnabled: false,
    primarySourceKind: "internal" as const,
    updatedAt: 1,
  }
}

/** The shared fixture: the live defect order, a companion, a merged order, an external order. */
async function seedCore(t: TestConvex) {
  return await t.run(async (ctx) => {
    const internalEvent = await ctx.db.insert(
      "events",
      internalEventDoc("orders-source-internal")
    )
    const integrationEvent = await ctx.db.insert("events", {
      ...internalEventDoc("orders-source-integration"),
      primarySourceKind: "integration" as const,
    })
    const defect = await ctx.db.insert("orders", {
      eventId: internalEvent,
      source: "internal",
      bookerName: "Oliver Vos",
      bookingRef: "BK-FAMILY-VOS",
      bookerEmail: "oliver.vos@example.com",
      providerOrderId: "PROVIDER-VOS",
      submittedAt: 300,
      status: "pending",
    })
    const companion = await ctx.db.insert("orders", {
      eventId: internalEvent,
      source: "internal",
      bookerName: "Second Sam",
      bookingRef: "BK-SECOND-02",
      bookerEmail: "sam.second@example.com",
      providerOrderId: "PROVIDER-SECOND",
      submittedAt: 400,
      status: "paid",
    })
    const merged = await ctx.db.insert("orders", {
      eventId: internalEvent,
      source: "internal",
      bookerName: "Merged Mara",
      bookingRef: "BK-MERGED-03",
      submittedAt: 500,
      mergedIntoOrderId: defect,
    })
    const external = await ctx.db.insert("orders", {
      eventId: integrationEvent,
      source: "integration",
      bookerName: "External Xena",
      bookingRef: "BK-EXTERNAL-04",
      providerOrderId: "PROVIDER-EXTERNAL",
      submittedAt: 600,
    })
    return {
      internalEvent,
      integrationEvent,
      defect,
      companion,
      merged,
      external,
    }
  })
}

test("every visible internal order is findable by its own id, ref, name, email, and provider id", async () => {
  const t = fresh()
  const ids = await seedCore(t)
  await expectSourceOnly(t)

  const expectations = [
    {
      orderId: String(ids.defect),
      needles: [
        idFragment(String(ids.defect)),
        String(ids.defect),
        "BK-FAMILY-VOS",
        "bkfamilyvos",
        "oliver",
        "vos",
        "oliver.vos@example.com",
        "PROVIDER-VOS",
      ],
    },
    {
      orderId: String(ids.companion),
      needles: [
        idFragment(String(ids.companion)),
        String(ids.companion),
        "BK-SECOND-02",
        "second",
        "sam",
        "sam.second@example.com",
        "PROVIDER-SECOND",
      ],
    },
  ]

  for (const { orderId, needles } of expectations) {
    for (const needle of needles) {
      const result = await ledger(t, {
        eventId: String(ids.internalEvent),
        search: needle,
        page: 1,
        pageSize: 25,
      })
      expect(
        result.orders.map((row) => row.orderId),
        `needle ${needle} must find ${orderId}`
      ).toContain(orderId)
      expect(result.totalRows, `needle ${needle}`).toBeNull()
    }
  }
})

test("the live defect fixture is findable by oliver, vos, its ref, and its id prefix", async () => {
  const t = fresh()
  const ids = await seedCore(t)
  await expectSourceOnly(t)

  const needles = [
    "oliver",
    "vos",
    "bkfamilyvos",
    "BK-FAMILY-VOS",
    idFragment(String(ids.defect)),
  ]
  for (const needle of needles) {
    const result = await ledger(t, {
      eventId: String(ids.internalEvent),
      search: needle,
      page: 1,
      pageSize: 25,
    })
    expect(
      result.orders.map((row) => row.orderId),
      `needle ${needle}`
    ).toEqual([String(ids.defect)])
  }
})

test("the real defect's values match at the predicate level", () => {
  // convex-test cannot mint the production `_id`; 62-06 proves the real row
  // live. This pins the exact production values against the shared matcher.
  const haystack = buildSearchHaystack([
    "ph7dxxr9sebg2bc6x4vpk664mn8e9d2d",
    "Oliver Vos",
    "oliver.vos@example.com",
    "BK-FAMILY-VOS",
    "PROVIDER-VOS",
  ])
  for (const needle of ["ph7dxxr9", "oliver", "vos", "bkfamilyvos", "famil"]) {
    expect(matchesNormalizedSearch(haystack, needle), `needle ${needle}`).toBe(
      true
    )
  }
  expect(matchesNormalizedSearch(haystack, "absent")).toBe(false)
})

test("merged orders and external orders are not findable", async () => {
  const t = fresh()
  const ids = await seedCore(t)
  await expectSourceOnly(t)

  const mergedById = await ledger(t, {
    eventId: String(ids.internalEvent),
    search: idFragment(String(ids.merged)),
    page: 1,
    pageSize: 25,
  })
  expect(mergedById.orders).toEqual([])

  const mergedByName = await ledger(t, {
    eventId: String(ids.internalEvent),
    search: "mara",
    page: 1,
    pageSize: 25,
  })
  expect(mergedByName.orders).toEqual([])

  const externalGlobal = await ledger(t, {
    search: "xena",
    page: 1,
    pageSize: 25,
  })
  expect(externalGlobal.orders).toEqual([])

  const externalScoped = await ledger(t, {
    eventId: String(ids.integrationEvent),
    search: "xena",
    page: 1,
    pageSize: 25,
  })
  expect(externalScoped.orders).toEqual([])

  const externalById = await ledger(t, {
    search: idFragment(String(ids.external)),
    page: 1,
    pageSize: 25,
  })
  expect(externalById.orders).toEqual([])
})

test("search pagination covers every match exactly once across pages", async () => {
  const t = fresh()
  const internalEvent = await t.run((ctx) =>
    ctx.db.insert("events", internalEventDoc("orders-page-event"))
  )
  const matchingIds: string[] = []
  await t.run(async (ctx) => {
    for (let index = 0; index < 35; index += 1) {
      if (index % 5 === 0) {
        const id = await ctx.db.insert("orders", {
          eventId: internalEvent,
          source: "internal",
          bookerName: `Nadine Match ${index}`,
          submittedAt: 1_000 + index,
        })
        matchingIds.push(String(id))
      } else {
        await ctx.db.insert("orders", {
          eventId: internalEvent,
          source: "internal",
          bookerName: `Filler Person ${index}`,
          submittedAt: 1_000 + index,
        })
      }
    }
  })
  expect(matchingIds).toHaveLength(7)
  await expectSourceOnly(t)

  const pageSizes: number[] = []
  const seen: string[] = []
  let cursor: string | null = null
  let hasNextPage = true
  while (hasNextPage) {
    const result = await ledger(t, {
      eventId: String(internalEvent),
      search: "nadine",
      page: 1,
      pageSize: 3,
      searchCursor: cursor,
    })
    pageSizes.push(result.orders.length)
    seen.push(
      ...result.orders.flatMap((row) => (row.orderId ? [row.orderId] : []))
    )
    expect(result.orders.length).toBeLessThanOrEqual(3)
    expect(result.totalRows).toBeNull()
    expect(result.totalPages).toBeNull()
    hasNextPage = result.hasNextPage
    cursor = result.nextCursor
    if (pageSizes.length > 10) throw new Error("pagination runaway")
  }

  expect(pageSizes).toEqual([3, 3, 1])
  expect(seen).toHaveLength(7)
  expect(new Set(seen).size).toBe(7)
  expect([...seen].sort()).toEqual([...matchingIds].sort())
})

test("a sparse match behind many non-matches still fills the first page", async () => {
  const t = fresh()
  const seeded = await t.run(async (ctx) => {
    const internalEvent = await ctx.db.insert(
      "events",
      internalEventDoc("orders-sparse-event")
    )
    const sparseA = await ctx.db.insert("orders", {
      eventId: internalEvent,
      source: "internal",
      bookerName: "Sparse Sally",
      submittedAt: 100,
    })
    const sparseB = await ctx.db.insert("orders", {
      eventId: internalEvent,
      source: "internal",
      bookerName: "Sparse Sonia",
      submittedAt: 101,
    })
    for (let index = 0; index < 20; index += 1) {
      await ctx.db.insert("orders", {
        eventId: internalEvent,
        source: "internal",
        bookerName: `Filler Person ${index}`,
        submittedAt: 200 + index,
      })
    }
    return { internalEvent, sparseA, sparseB }
  })
  await expectSourceOnly(t)

  const result = await ledger(t, {
    eventId: String(seeded.internalEvent),
    search: "sparse",
    page: 1,
    pageSize: 2,
  })
  expect(result.orders.map((row) => row.orderId).sort()).toEqual(
    [String(seeded.sparseA), String(seeded.sparseB)].sort()
  )
  expect(result.orders.length).toBeLessThanOrEqual(2)
  expect(result.hasNextPage).toBe(false)
})

test("an exact booking-ref alias resolves its target once on the first page", async () => {
  const t = fresh()
  const ids = await seedCore(t)
  await t.run(async (ctx) => {
    await ctx.db.insert("orderBookingRefAliases", {
      bookingRef: "OLD-ALPHA",
      sourceOrderId: ids.merged,
      targetOrderId: ids.defect,
      createdAt: 1,
    })
  })
  await expectSourceOnly(t)

  const first = await ledger(t, {
    eventId: String(ids.internalEvent),
    search: "OLD-ALPHA",
    page: 1,
    pageSize: 1,
  })
  expect(first.orders.map((row) => row.orderId)).toEqual([String(ids.defect)])
  expect(first.orders).toHaveLength(1)
  expect(first.hasNextPage).toBe(false)
  expect(first.nextCursor).toBeNull()

  const normalized = await ledger(t, {
    eventId: String(ids.internalEvent),
    search: "  old-alpha ",
    page: 1,
    pageSize: 5,
  })
  expect(normalized.orders.map((row) => row.orderId)).toEqual([
    String(ids.defect),
  ])
})

test("alias + full page: a full scan page keeps its rows and the alias still lands with free capacity", async () => {
  const t = fresh()
  const seeded = await t.run(async (ctx) => {
    const internalEvent = await ctx.db.insert(
      "events",
      internalEventDoc("orders-alias-page-event")
    )
    const padA = await ctx.db.insert("orders", {
      eventId: internalEvent,
      source: "internal",
      bookerName: "Pad One",
      submittedAt: 1,
    })
    const padB = await ctx.db.insert("orders", {
      eventId: internalEvent,
      source: "internal",
      bookerName: "Pad Two",
      submittedAt: 2,
    })
    const padC = await ctx.db.insert("orders", {
      eventId: internalEvent,
      source: "internal",
      bookerName: "Pad Three",
      submittedAt: 3,
    })
    const target = await ctx.db.insert("orders", {
      eventId: internalEvent,
      source: "internal",
      bookerName: "Target Tango",
      bookingRef: "BK-TARGET",
      submittedAt: 10,
    })
    const mergedSource = await ctx.db.insert("orders", {
      eventId: internalEvent,
      source: "internal",
      bookerName: "Merged Source",
      bookingRef: "BK-SOURCE",
      submittedAt: 11,
      mergedIntoOrderId: target,
    })
    const olderMatch = await ctx.db.insert("orders", {
      eventId: internalEvent,
      source: "internal",
      bookerName: "Other Match One",
      providerOrderId: "OLDALPHA-ONE",
      submittedAt: 12,
    })
    const newerMatch = await ctx.db.insert("orders", {
      eventId: internalEvent,
      source: "internal",
      bookerName: "Other Match Two",
      providerOrderId: "OLDALPHA-TWO",
      submittedAt: 13,
    })
    await ctx.db.insert("orderBookingRefAliases", {
      bookingRef: "OLD-ALPHA",
      sourceOrderId: mergedSource,
      targetOrderId: target,
      createdAt: 1,
    })
    return { internalEvent, target, olderMatch, newerMatch, padA, padB, padC }
  })
  await expectSourceOnly(t)

  // A full scan page (two other matches fill pageSize 2): the capacity check
  // must keep the scan rows intact instead of displacing one with the alias.
  const fullPage = await ledger(t, {
    eventId: String(seeded.internalEvent),
    search: "OLD-ALPHA",
    page: 1,
    pageSize: 2,
  })
  expect(
    fullPage.orders.map((row) => row.orderId),
    "a full page must not drop a scan match for the alias"
  ).toEqual([String(seeded.newerMatch), String(seeded.olderMatch)])
  expect(fullPage.orders.length).toBeLessThanOrEqual(2)
  expect(fullPage.hasNextPage).toBe(true)

  // With one free slot the alias lands and the page is exactly full.
  const withAlias = await ledger(t, {
    eventId: String(seeded.internalEvent),
    search: "OLD-ALPHA",
    page: 1,
    pageSize: 3,
  })
  expect(withAlias.orders.map((row) => row.orderId)).toEqual([
    String(seeded.target),
    String(seeded.newerMatch),
    String(seeded.olderMatch),
  ])
  expect(withAlias.orders.length).toBeLessThanOrEqual(3)
  expect(withAlias.hasNextPage).toBe(false)
})

test("alias + scan cap: the target appears on page 1 and never reappears on the resume", async () => {
  const t = fresh()
  const seeded = await t.run(async (ctx) => {
    const internalEvent = await ctx.db.insert(
      "events",
      internalEventDoc("orders-alias-cap-event")
    )
    const target = await ctx.db.insert("orders", {
      eventId: internalEvent,
      source: "internal",
      bookerName: "Target Tango",
      bookingRef: "BK-TARGET",
      submittedAt: 10,
    })
    const mergedSource = await ctx.db.insert("orders", {
      eventId: internalEvent,
      source: "internal",
      bookerName: "Merged Source",
      submittedAt: 11,
      mergedIntoOrderId: target,
    })
    // The scan cap is 2_000 candidates: 2_001 non-matching orders guarantee
    // that page 1 stops on the cap (not on exhaustion), with a live cursor.
    for (let index = 0; index < 2_001; index += 1) {
      await ctx.db.insert("orders", {
        eventId: internalEvent,
        source: "internal",
        bookerName: `Bulk Person ${index}`,
        bookingRef: `BULK-${index}`,
        submittedAt: 1_000 + index,
      })
    }
    await ctx.db.insert("orderBookingRefAliases", {
      bookingRef: "OLD-ALPHA",
      sourceOrderId: mergedSource,
      targetOrderId: target,
      createdAt: 1,
    })
    return { internalEvent, target }
  })
  await expectSourceOnly(t)

  const first = await ledger(t, {
    eventId: String(seeded.internalEvent),
    search: "OLD-ALPHA",
    page: 1,
    pageSize: 200,
  })
  expect(
    first.orders.map((row) => row.orderId),
    "the alias target must survive a scan-cap hit"
  ).toEqual([String(seeded.target)])
  expect(first.orders.length).toBeLessThanOrEqual(200)
  expect(first.hasNextPage).toBe(true)
  expect(first.nextCursor).not.toBeNull()

  const resume = await ledger(t, {
    eventId: String(seeded.internalEvent),
    search: "OLD-ALPHA",
    page: 1,
    pageSize: 200,
    searchCursor: first.nextCursor,
  })
  expect(resume.orders).toEqual([])
  expect(resume.orders.length).toBeLessThanOrEqual(200)
  expect(resume.hasNextPage).toBe(false)
  expect(resume.nextCursor).toBeNull()
})

test("status and date filters still apply to the source-search branch", async () => {
  const t = fresh()
  const ids = await seedCore(t)
  await expectSourceOnly(t)

  const paid = await ledger(t, {
    eventId: String(ids.internalEvent),
    search: "provider",
    status: "paid",
    page: 1,
    pageSize: 25,
  })
  expect(paid.orders.map((row) => row.orderId)).toEqual([String(ids.companion)])

  const pendingButAskedForPaid = await ledger(t, {
    eventId: String(ids.internalEvent),
    search: "oliver",
    status: "paid",
    page: 1,
    pageSize: 25,
  })
  expect(pendingButAskedForPaid.orders).toEqual([])

  const fromBounded = await ledger(t, {
    eventId: String(ids.internalEvent),
    search: "provider",
    from: 350,
    page: 1,
    pageSize: 25,
  })
  expect(fromBounded.orders.map((row) => row.orderId)).toEqual([
    String(ids.companion),
  ])

  const toBounded = await ledger(t, {
    eventId: String(ids.internalEvent),
    search: "provider",
    to: 350,
    page: 1,
    pageSize: 25,
  })
  expect(toBounded.orders.map((row) => row.orderId)).toEqual([
    String(ids.defect),
  ])

  await expect(
    ledger(t, {
      eventId: String(ids.internalEvent),
      search: "oliver",
      page: 2,
      pageSize: 25,
    })
  ).rejects.toThrow(
    /Search cursor pagination cannot be combined with offset page pagination/
  )
})

test("the search cursor is signature-bound and malformed cursors are rejected", async () => {
  const t = fresh()
  const ids = await seedCore(t)
  await expectSourceOnly(t)

  const first = await ledger(t, {
    eventId: String(ids.internalEvent),
    search: "provider",
    page: 1,
    pageSize: 1,
  })
  expect(first.hasNextPage).toBe(true)
  const cursor = first.nextCursor
  if (cursor === null) throw new Error("expected a continuation cursor")

  await expect(
    ledger(t, {
      eventId: String(ids.internalEvent),
      search: "oliver",
      page: 1,
      pageSize: 1,
      searchCursor: cursor,
    })
  ).rejects.toThrow("Order search cursor does not match the request.")

  await expect(
    ledger(t, {
      eventId: String(ids.internalEvent),
      search: "provider",
      page: 1,
      pageSize: 2,
      searchCursor: cursor,
    })
  ).rejects.toThrow("Order search cursor does not match the request.")

  await expect(
    ledger(t, {
      eventId: String(ids.internalEvent),
      search: "provider",
      page: 1,
      pageSize: 1,
      searchCursor: "garbage",
    })
  ).rejects.toThrow("Invalid order search cursor.")

  await expect(
    ledger(t, {
      eventId: String(ids.internalEvent),
      page: 1,
      pageSize: 1,
      searchCursor: cursor,
    })
  ).rejects.toThrow("Invalid order search cursor.")

  const resume = await ledger(t, {
    eventId: String(ids.internalEvent),
    search: "provider",
    page: 1,
    pageSize: 1,
    searchCursor: cursor,
  })
  expect(resume.orders.map((row) => row.orderId)).toEqual([String(ids.defect)])
  expect(resume.hasNextPage).toBe(false)
})
