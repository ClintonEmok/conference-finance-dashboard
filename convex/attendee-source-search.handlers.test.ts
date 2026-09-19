/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api, internal } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"

/**
 * Phase 62 plan 62-03 — the D-05 acceptance bar for the attendee ledger and
 * the allocation picker that consumes it.
 *
 * The fixture contains NO `searchDocuments` / `searchProjectionFanoutJobs` /
 * `searchDocumentTerms` rows (asserted before every call), so an
 * implementation that still reads the retired projection returns nothing here:
 * that is the structural reason the pre-phase implementation fails this suite.
 *
 * The scan is source-table (D-01), folded-substring (D-02), and page-filling
 * (D-04): a match behind a long non-match run must still fill the page, and
 * the union of pages must be exactly the match set.
 */

const modules = import.meta.glob("./**/*.ts")
const identity = {
  subject: "attendee-source-search-admin",
  tokenIdentifier: "clerk|attendee-source-search-admin",
}

type TestConvex = TestConvexForDataModel<GenericDataModel>

const BASE_AT = 1_700_000_000_000

function fresh() {
  return convexTest(schema, modules).withIdentity(identity)
}

/**
 * The source path's premise: the fixture contains no projection rows, so the
 * pre-phase implementation (which pages `searchDocuments`) returns nothing.
 */
async function expectSourceOnly(t: TestConvex) {
  const counts = await t.run(async (ctx) => ({
    documents: (await ctx.db.query("searchDocuments").take(10)).length,
    jobs: (await ctx.db.query("searchProjectionFanoutJobs").take(10)).length,
    terms: (await ctx.db.query("searchDocumentTerms").take(10)).length,
  }))
  expect(counts.documents).toBe(0)
  expect(counts.jobs).toBe(0)
  expect(counts.terms).toBe(0)
}

/**
 * convex-test ids share a long zero prefix, so an 8-character prefix is not a
 * discriminating fragment there. Strip it for a real id fragment; the full-id
 * needle stays the discriminating one in this suite.
 */
function idFragment(id: string) {
  return id.replace(/^0+/, "")
}

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

type LedgerArgs = {
  eventId?: Id<"events">
  search?: string
  cursor?: string | null
  pageSize?: number
  from?: number | null
  to?: number | null
}

type LedgerResult = {
  dateMode: string
  from: number | null
  to: number | null
  rows: Array<{ _id: string }>
  page: { hasNextPage: boolean; nextCursor: string | null }
}

async function ledger(t: TestConvex, args: LedgerArgs): Promise<LedgerResult> {
  return await t.query(api.attendees.getAttendeeLedgerPage, {
    eventId: args.eventId,
    search: args.search,
    cursor: args.cursor ?? null,
    pageSize: args.pageSize ?? 25,
    from: args.from ?? null,
    to: args.to ?? null,
  })
}

async function foundIds(t: TestConvex, args: LedgerArgs): Promise<string[]> {
  const page = await ledger(t, args)
  return page.rows.map((row) => String(row._id))
}

/** Run a callback with a stubbed runtime deployment URL, restoring it after. */
async function withSiteUrl<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.CONVEX_SITE_URL
  process.env.CONVEX_SITE_URL = url
  try {
    return await fn()
  } finally {
    if (previous === undefined) {
      delete process.env.CONVEX_SITE_URL
    } else {
      process.env.CONVEX_SITE_URL = previous
    }
  }
}

/**
 * The shared core fixture:
 * - event A: the live defect shape (`Oliver Vos` / `BK-FAMILY-VOS`), a second
 *   visible attendee, a merged order's attendee, a legacy attendee with NO
 *   `eventId`, and an attendee whose order has been deleted;
 * - event B: one visible attendee for the cross-event scope checks.
 */
async function seedCore(t: TestConvex) {
  return await t.run(async (ctx) => {
    const eventA = await ctx.db.insert(
      "events",
      internalEventDoc("attendees-source-a")
    )
    const eventB = await ctx.db.insert(
      "events",
      internalEventDoc("attendees-source-b")
    )
    const ticketA = await ctx.db.insert("ticketTypes", {
      eventId: eventA,
      label: "A Pass",
      priceMinor: 1000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      updatedAt: 1,
    })
    const ticketB = await ctx.db.insert("ticketTypes", {
      eventId: eventB,
      label: "B Pass",
      priceMinor: 1000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      updatedAt: 1,
    })

    const orderVos = await ctx.db.insert("orders", {
      eventId: eventA,
      source: "internal",
      bookingRef: "BK-FAMILY-VOS",
      bookerName: "Oliver Vos",
      bookerEmail: "oliver.vos@example.com",
      submittedAt: BASE_AT + 5_000,
      status: "pending",
    })
    const orderSecond = await ctx.db.insert("orders", {
      eventId: eventA,
      source: "internal",
      bookingRef: "BK-SECOND-02",
      bookerName: "Second Sam",
      bookerEmail: "sam.second@example.com",
      submittedAt: BASE_AT + 6_000,
      status: "pending",
    })
    const orderMerged = await ctx.db.insert("orders", {
      eventId: eventA,
      source: "internal",
      bookingRef: "BK-MERGED-03",
      bookerName: "Merged Mara",
      submittedAt: BASE_AT + 7_000,
      mergedIntoOrderId: orderVos,
    })
    const orderLegacy = await ctx.db.insert("orders", {
      eventId: eventA,
      source: "internal",
      bookingRef: "BK-LEGACY-04",
      bookerName: "Legacy Booker",
      submittedAt: BASE_AT + 8_000,
      status: "pending",
    })
    const orderMissing = await ctx.db.insert("orders", {
      eventId: eventA,
      source: "internal",
      bookingRef: "BK-MISSING-05",
      bookerName: "Missing Booker",
      submittedAt: BASE_AT + 9_000,
      status: "pending",
    })
    const orderB = await ctx.db.insert("orders", {
      eventId: eventB,
      source: "internal",
      bookingRef: "BK-B-01",
      bookerName: "Bea Other",
      bookerEmail: "bea.other@example.com",
      submittedAt: Date.now(),
      status: "pending",
    })

    const attendeeVos = await ctx.db.insert("orderAttendees", {
      orderId: orderVos,
      eventId: eventA,
      attendeeKey: "vos-1",
      name: "Oliver Vos",
      email: "oliver.vos@example.com",
      gender: "unknown",
      sortOrder: 0,
    })
    const attendeeSecond = await ctx.db.insert("orderAttendees", {
      orderId: orderSecond,
      eventId: eventA,
      attendeeKey: "second-1",
      name: "Second Sam",
      email: "sam.second@example.com",
      gender: "unknown",
      sortOrder: 0,
    })
    const attendeeMerged = await ctx.db.insert("orderAttendees", {
      orderId: orderMerged,
      eventId: eventA,
      attendeeKey: "merged-1",
      name: "Merged Ghost",
      email: "merged.ghost@example.com",
      gender: "unknown",
      sortOrder: 0,
    })
    // Legacy shape: written before the additive copy existed, so NO eventId.
    const attendeeLegacy = await ctx.db.insert("orderAttendees", {
      orderId: orderLegacy,
      attendeeKey: "legacy-1",
      name: "Legacy Loner",
      email: "legacy.loner@example.com",
      gender: "unknown",
      sortOrder: 0,
    })
    const attendeeMissingOrder = await ctx.db.insert("orderAttendees", {
      orderId: orderMissing,
      attendeeKey: "missing-1",
      name: "Missing Order Mo",
      email: "mo.missing@example.com",
      gender: "unknown",
      sortOrder: 0,
    })
    const attendeeB = await ctx.db.insert("orderAttendees", {
      orderId: orderB,
      eventId: eventB,
      attendeeKey: "b-1",
      name: "Bea Other",
      email: "bea.other@example.com",
      gender: "unknown",
      sortOrder: 0,
    })

    const selections = [
      [orderVos, attendeeVos, ticketA],
      [orderSecond, attendeeSecond, ticketA],
      [orderMerged, attendeeMerged, ticketA],
      [orderLegacy, attendeeLegacy, ticketA],
      [orderMissing, attendeeMissingOrder, ticketA],
      [orderB, attendeeB, ticketB],
    ] as const
    for (const [orderId, attendeeId, ticketTypeId] of selections) {
      await ctx.db.insert("orderTicketSelections", {
        orderId,
        attendeeId,
        ticketTypeId,
        quantity: 1,
        sortOrder: 0,
      })
    }

    // The attendee whose order no longer exists — the backfill must skip it
    // with a diagnostic, never guess an event.
    await ctx.db.delete("orders", orderMissing)

    return {
      eventA,
      eventB,
      ticketA,
      ticketB,
      orderVos,
      orderSecond,
      orderMerged,
      orderLegacy,
      orderB,
      attendeeVos,
      attendeeSecond,
      attendeeMerged,
      attendeeLegacy,
      attendeeMissingOrder,
      attendeeB,
    }
  })
}

test("every attendee of the event is findable by own id, name, email, and booking ref — with no projection rows", async () => {
  const t = fresh()
  const ids = await seedCore(t)
  await expectSourceOnly(t)

  const expectations = [
    {
      attendeeId: String(ids.attendeeVos),
      needles: [
        idFragment(String(ids.attendeeVos)),
        String(ids.attendeeVos),
        "oliver",
        "vos",
        "olivervos",
        "oliver.vos@example.com",
        "olivervosexamplecom",
        "BK-FAMILY-VOS",
        "bkfamilyvos",
      ],
    },
    {
      attendeeId: String(ids.attendeeSecond),
      needles: [
        idFragment(String(ids.attendeeSecond)),
        String(ids.attendeeSecond),
        "second",
        "sam",
        "secondsam",
        "sam.second@example.com",
        "BK-SECOND-02",
        "bksecond02",
      ],
    },
  ] as const

  for (const expectation of expectations) {
    for (const needle of expectation.needles) {
      const rows = await foundIds(t, {
        eventId: ids.eventA,
        search: needle,
        from: null,
        to: null,
      })
      expect(rows, `needle '${needle}' must find ${expectation.attendeeId}`).toContain(
        expectation.attendeeId
      )
    }
  }

  // The full id of one attendee cannot be satisfied by another's row.
  expect(
    await foundIds(t, { eventId: ids.eventA, search: String(ids.attendeeSecond) })
  ).not.toContain(String(ids.attendeeVos))
})

test("the live defect fixture is findable by oliver, vos, and its booking ref", async () => {
  const t = fresh()
  const ids = await seedCore(t)
  await expectSourceOnly(t)

  for (const needle of ["oliver", "vos", "BK-FAMILY-VOS", "bkfamilyvos"]) {
    const rows = await foundIds(t, { eventId: ids.eventA, search: needle })
    expect(rows, `needle '${needle}'`).toEqual([String(ids.attendeeVos)])
  }
  expect(await foundIds(t, { eventId: ids.eventA, search: "famil" })).toEqual([
    String(ids.attendeeVos),
  ])
})

test("merged orders and other events never leak into the scoped scan", async () => {
  const t = fresh()
  const ids = await seedCore(t)

  expect(
    await foundIds(t, { eventId: ids.eventA, search: "Merged Ghost" })
  ).toEqual([])
  expect(
    await foundIds(t, { eventId: ids.eventA, search: "BK-MERGED-03" })
  ).toEqual([])

  // Event B's attendee is absent from event A...
  expect(await foundIds(t, { eventId: ids.eventA, search: "Bea Other" })).toEqual(
    []
  )
  // ...visible when scoped to event B...
  expect(await foundIds(t, { eventId: ids.eventB, search: "Bea Other" })).toEqual(
    [String(ids.attendeeB)]
  )
  // ...and visible globally when the order-time window allows it.
  expect(
    await foundIds(t, { search: "Bea Other", from: 0, to: Date.now() })
  ).toEqual([String(ids.attendeeB)])
  // The merged attendee stays excluded globally too.
  expect(
    await foundIds(t, { search: "Merged Ghost", from: 0, to: Date.now() })
  ).toEqual([])
})

test("the unchanged dateMode contract still bounds the source scan", async () => {
  const t = fresh()
  const ids = await t.run(async (ctx) => {
    const event = await ctx.db.insert(
      "events",
      internalEventDoc("attendees-source-dates")
    )
    const orderOld = await ctx.db.insert("orders", {
      eventId: event,
      source: "internal",
      bookingRef: "BK-OLD-01",
      bookerName: "Old Booker",
      submittedAt: BASE_AT,
      status: "pending",
    })
    const orderNew = await ctx.db.insert("orders", {
      eventId: event,
      source: "internal",
      bookingRef: "BK-NEW-02",
      bookerName: "New Booker",
      submittedAt: Date.now(),
      status: "pending",
    })
    const attendeeOld = await ctx.db.insert("orderAttendees", {
      orderId: orderOld,
      eventId: event,
      attendeeKey: "old-1",
      name: "Old Timer",
      email: "old.timer@example.com",
      gender: "unknown",
      sortOrder: 0,
    })
    const attendeeNew = await ctx.db.insert("orderAttendees", {
      orderId: orderNew,
      eventId: event,
      attendeeKey: "new-1",
      name: "New Timer",
      email: "new.timer@example.com",
      gender: "unknown",
      sortOrder: 0,
    })
    return { event, attendeeOld, attendeeNew }
  })

  const allTime = await ledger(t, { eventId: ids.event, search: "Timer" })
  expect(allTime.dateMode).toBe("all-time")
  expect(allTime.from).toBeNull()
  expect(allTime.to).toBeNull()
  expect(new Set(allTime.rows.map((row) => String(row._id)))).toEqual(
    new Set([String(ids.attendeeOld), String(ids.attendeeNew)])
  )

  const now = Date.now()
  const recent = await ledger(t, {
    eventId: ids.event,
    search: "Timer",
    from: now - 60_000,
    to: now + 60_000,
  })
  expect(recent.dateMode).toBe("bounded")
  expect(recent.rows.map((row) => String(row._id))).toEqual([
    String(ids.attendeeNew),
  ])

  const historical = await ledger(t, {
    eventId: ids.event,
    search: "Timer",
    from: 0,
    to: BASE_AT + 60_000,
  })
  expect(historical.rows.map((row) => String(row._id))).toEqual([
    String(ids.attendeeOld),
  ])
})

/** 5 `Nadine` matches interleaved behind 25 non-matching attendees. */
async function seedPaginationFixture(t: TestConvex) {
  return await t.run(async (ctx) => {
    const event = await ctx.db.insert(
      "events",
      internalEventDoc("attendees-source-pagination")
    )
    const order = await ctx.db.insert("orders", {
      eventId: event,
      source: "internal",
      bookingRef: "BK-PAGE-01",
      bookerName: "Page Booker",
      submittedAt: BASE_AT,
      status: "pending",
    })
    const expected: string[] = []
    let ordinal = 0
    const insert = async (name: string, matching: boolean) => {
      ordinal += 1
      const attendeeId = await ctx.db.insert("orderAttendees", {
        orderId: order,
        eventId: event,
        attendeeKey: `page-${ordinal}`,
        name,
        gender: "unknown",
        sortOrder: ordinal,
      })
      if (matching) expected.push(String(attendeeId))
    }
    for (let index = 0; index < 10; index++) {
      await insert(`Padding Start ${index}`, false)
    }
    for (let index = 0; index < 5; index++) {
      await insert(`Padding Left ${index}`, false)
      await insert(`Padding Right ${index}`, false)
      await insert(`Nadine ${index}`, true)
    }
    return { event, expected }
  })
}

test("pagination covers every match exactly once and never serves an undersized page", async () => {
  const t = fresh()
  const ids = await seedPaginationFixture(t)

  const pageSizes: number[] = []
  const seen: string[] = []
  let cursor: string | null = null
  let batches = 0
  for (;;) {
    const page = await ledger(t, {
      eventId: ids.event,
      search: "Nadine",
      pageSize: 2,
      cursor,
    })
    pageSizes.push(page.rows.length)
    seen.push(...page.rows.map((row) => String(row._id)))
    expect(page.rows.length).toBeLessThanOrEqual(2)
    if (!page.page.hasNextPage) break
    expect(page.page.nextCursor).toBeTruthy()
    cursor = page.page.nextCursor
    batches += 1
    if (batches > 40) throw new Error("pagination runaway")
  }

  expect(pageSizes).toEqual([2, 2, 1])
  expect(seen).toHaveLength(5)
  expect(new Set(seen).size).toBe(5)
  expect(new Set(seen)).toEqual(new Set(ids.expected))

  // A valid cursor resumes without overlapping the previous page; the same
  // cursor against a different search is rejected (never resumed against
  // different filters).
  const first = await ledger(t, {
    eventId: ids.event,
    search: "Nadine",
    pageSize: 2,
  })
  const cursorForNadine = first.page.nextCursor
  expect(cursorForNadine).toBeTruthy()
  const second = await ledger(t, {
    eventId: ids.event,
    search: "Nadine",
    pageSize: 2,
    cursor: cursorForNadine,
  })
  const firstIds = new Set(first.rows.map((row) => String(row._id)))
  expect(
    second.rows.some((row) => firstIds.has(String(row._id)))
  ).toBe(false)
  await expect(
    ledger(t, {
      eventId: ids.event,
      search: "Padding",
      pageSize: 2,
      cursor: cursorForNadine,
    })
  ).rejects.toThrow("Attendee ledger cursor does not match the request.")
})

test("a match behind a long non-match run still fills the first page", async () => {
  const t = fresh()
  const ids = await t.run(async (ctx) => {
    const event = await ctx.db.insert(
      "events",
      internalEventDoc("attendees-source-sparse")
    )
    const order = await ctx.db.insert("orders", {
      eventId: event,
      source: "internal",
      bookingRef: "BK-SPARSE-01",
      bookerName: "Sparse Booker",
      submittedAt: BASE_AT,
      status: "pending",
    })
    // The matches are the OLDEST rows, so the desc scan must page through the
    // whole padding run before reaching them (the old post-pagination filter
    // returned an empty first page here).
    const first = await ctx.db.insert("orderAttendees", {
      orderId: order,
      eventId: event,
      attendeeKey: "sparse-1",
      name: "Sparse Sam",
      email: "sparse.sam@example.com",
      gender: "unknown",
      sortOrder: 0,
    })
    const second = await ctx.db.insert("orderAttendees", {
      orderId: order,
      eventId: event,
      attendeeKey: "sparse-2",
      name: "Sparse Sam",
      email: "sparse.sam.second@example.com",
      gender: "unknown",
      sortOrder: 1,
    })
    for (let index = 0; index < 20; index++) {
      await ctx.db.insert("orderAttendees", {
        orderId: order,
        eventId: event,
        attendeeKey: `sparse-pad-${index}`,
        name: `Sparse Padding ${index}`,
        gender: "unknown",
        sortOrder: index + 2,
      })
    }
    return { event, first, second }
  })

  const page = await ledger(t, {
    eventId: ids.event,
    search: "Sparse Sam",
    pageSize: 2,
  })
  expect(page.rows.map((row) => String(row._id))).toEqual([
    String(ids.second),
    String(ids.first),
  ])
  expect(page.page.hasNextPage).toBe(false)
  expect(page.page.nextCursor).toBeNull()
})

test("legacy rows without eventId are honestly invisible until the copy is filled", async () => {
  const t = fresh()
  const ids = await seedCore(t)

  // The row exists, but the event-scoped index cannot see it.
  expect(
    await foundIds(t, { eventId: ids.eventA, search: "Legacy Loner" })
  ).toEqual([])
  expect(
    await foundIds(t, {
      eventId: ids.eventA,
      search: "legacy.loner@example.com",
    })
  ).toEqual([])

  // After the copy is filled (what the backfill does) it IS found.
  await t.run(async (ctx) => {
    await ctx.db.patch("orderAttendees", ids.attendeeLegacy, {
      eventId: ids.eventA,
    })
  })
  expect(
    await foundIds(t, { eventId: ids.eventA, search: "Legacy Loner" })
  ).toEqual([String(ids.attendeeLegacy)])
})

test("both public insert mutations write the copy, so new attendees are immediately findable", async () => {
  const t = fresh()
  const ids = await seedCore(t)

  const added = await t.mutation(api.attendees.addAttendeeToOrder, {
    orderId: ids.orderSecond,
    eventId: ids.eventA,
    name: "Added Ada",
    email: "ada.added@example.com",
    ticketTypeId: ids.ticketA,
  })
  expect(
    await foundIds(t, { eventId: ids.eventA, search: "Added Ada" })
  ).toContain(String(added.attendeeId))
  expect(
    await foundIds(t, { eventId: ids.eventA, search: "ada.added@example.com" })
  ).toContain(String(added.attendeeId))

  const manual = await t.mutation(api.events.createManualAttendee, {
    eventId: ids.eventA,
    attendeeName: "Manual Manny",
    attendeeEmail: "manny.manual@example.com",
    ticketTypeId: ids.ticketA,
  })
  expect(
    await foundIds(t, { eventId: ids.eventA, search: "Manual Manny" })
  ).toContain(String(manual.attendeeId))
  expect(
    await foundIds(t, { eventId: ids.eventA, search: "manny.manual@example.com" })
  ).toContain(String(manual.attendeeId))
})

const PREVIEW_DEPLOYMENT_URL = "https://test-preview-seed.convex.site"

test("the preview seed writes eventId with the row, so seeded attendees are findable without any backfill", async () => {
  const t = fresh()
  await withSiteUrl(PREVIEW_DEPLOYMENT_URL, async () => {
    const seeded = await t.mutation(internal.seedPreviewSimulation.default, {
      scope: "tracer",
      preview: true,
      allowedDeploymentUrl: PREVIEW_DEPLOYMENT_URL,
    })
    if (!seeded.eventId) throw new Error("the tracer seed returned no event")

    const attendee = await t.run(
      async (ctx) => await ctx.db.query("orderAttendees").first()
    )
    if (!attendee) throw new Error("the tracer seed wrote no attendee")
    expect(String(attendee.eventId)).toBe(seeded.eventId)

    // No backfill ran in this test: the seed itself wrote the copy.
    await expectSourceOnly(t)
    const page = await ledger(t, {
      eventId: seeded.eventId as Id<"events">,
      search: attendee.name,
      pageSize: 10,
    })
    expect(page.rows.map((row) => String(row._id))).toContain(
      String(attendee._id)
    )
  })
})

test("the ledger cursor is version-bumped and malformed cursors are rejected", async () => {
  const t = fresh()
  const ids = await seedCore(t)

  const v1Cursor = `al:${encodeURIComponent(
    JSON.stringify({ version: 1, signature: "x", searchCursor: null })
  )}`
  await expect(
    ledger(t, { eventId: ids.eventA, search: "oliver", cursor: v1Cursor })
  ).rejects.toThrow("Invalid attendee ledger continuation cursor.")

  const wrongSignature = `al:${encodeURIComponent(
    JSON.stringify({ version: 2, signature: "nope", sourceCursor: null })
  )}`
  await expect(
    ledger(t, {
      eventId: ids.eventA,
      search: "oliver",
      cursor: wrongSignature,
    })
  ).rejects.toThrow("Attendee ledger cursor does not match the request.")

  await expect(ledger(t, { eventId: ids.eventA, pageSize: 0 })).rejects.toThrow(
    "Invalid attendee ledger page size."
  )
  await expect(
    ledger(t, { eventId: ids.eventA, pageSize: 101 })
  ).rejects.toThrow("Invalid attendee ledger page size.")
})

const BACKFILL_DEPLOYMENT_URL = "https://test-source-search.convex.cloud"

test("the backfill patches legacy rows once, is resumable, idempotent, and skips unresolvable orders", async () => {
  const t = fresh()
  const ids = await seedCore(t)

  await withSiteUrl(BACKFILL_DEPLOYMENT_URL, async () => {
    await expect(
      t.mutation(internal.backfillAttendeeEventIds.default, {
        cursor: null,
        batchSize: 200,
        authorize: false,
        allowedDeploymentUrl: BACKFILL_DEPLOYMENT_URL,
      })
    ).rejects.toThrow(/AUTHORIZATION_REQUIRED/)
    await expect(
      t.mutation(internal.backfillAttendeeEventIds.default, {
        cursor: null,
        batchSize: 200,
        authorize: true,
      })
    ).rejects.toThrow(/ALLOWLIST_UNAVAILABLE/)
    await expect(
      t.mutation(internal.backfillAttendeeEventIds.default, {
        cursor: null,
        batchSize: 200,
        authorize: true,
        allowedDeploymentUrl: "https://other-deployment.convex.cloud",
      })
    ).rejects.toThrow(/WRONG_DEPLOYMENT/)
    await expect(
      t.mutation(internal.backfillAttendeeEventIds.default, {
        cursor: null,
        batchSize: 0,
        authorize: true,
        allowedDeploymentUrl: BACKFILL_DEPLOYMENT_URL,
      })
    ).rejects.toThrow(/batchSize/)

    // Resumable walk, two rows per batch: only the legacy rows are patched and
    // the deleted order's attendee is skipped with a diagnostic.
    type BackfillBatch = {
      processed: number
      patched: number
      skipped: number
      isDone: boolean
      nextCursor: string | null
      diagnostics: Array<{ subjectId: string; reason: string }>
    }
    const patches: number[] = []
    const skips: number[] = []
    let cursor: string | null = null
    let isDone = false
    let batches = 0
    while (!isDone) {
      const page: BackfillBatch = await t.mutation(internal.backfillAttendeeEventIds.default, {
        cursor,
        batchSize: 2,
        authorize: true,
        allowedDeploymentUrl: BACKFILL_DEPLOYMENT_URL,
      })
      patches.push(page.patched)
      skips.push(page.skipped)
      cursor = page.nextCursor
      isDone = page.isDone
      batches += 1
      if (batches > 10) throw new Error("backfill runaway")
    }
    // batches of 2 in insertion order: [vos(has), second(has)] →
    // [merged(has), legacy(patch)] → [missing(skip), B(has)]
    expect(patches).toEqual([0, 1, 0])
    expect(skips).toEqual([0, 0, 1])

    // The patched legacy row is now visible to the event-scoped scan.
    expect(
      await foundIds(t, { eventId: ids.eventA, search: "Legacy Loner" })
    ).toEqual([String(ids.attendeeLegacy)])

    // A full re-run patches nothing (idempotent) and still reports the skip.
    const rerun = await t.mutation(internal.backfillAttendeeEventIds.default, {
      cursor: null,
      batchSize: 200,
      authorize: true,
      allowedDeploymentUrl: BACKFILL_DEPLOYMENT_URL,
    })
    expect(rerun.processed).toBe(6)
    expect(rerun.patched).toBe(0)
    expect(rerun.skipped).toBe(1)
    expect(rerun.isDone).toBe(true)
    expect(rerun.nextCursor).toBeNull()
    expect(rerun.diagnostics).toHaveLength(1)
    expect(rerun.diagnostics[0]?.reason).toContain("eventless or missing order")
  })
})
