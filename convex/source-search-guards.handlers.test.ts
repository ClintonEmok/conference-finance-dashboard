/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"
import { buildSearchHaystack, matchesNormalizedSearch } from "./search"

const modules = import.meta.glob("./**/*.ts")
const identity = {
  subject: "source-search-guards-admin",
  tokenIdentifier: "clerk|source-search-guards-admin",
}

type TestConvex = TestConvexForDataModel<GenericDataModel>

const BASE_AT = 1_700_000_000_000

function fresh() {
  return convexTest(schema, modules).withIdentity(identity)
}

function internalEventDoc(slug: string, primarySourceKind: "internal" | "integration" = "internal") {
  return {
    slug,
    title: slug,
    startsAt: BASE_AT,
    timezone: "Europe/Amsterdam",
    currency: "EUR",
    isPublished: true,
    isSignupOpen: true,
    accommodationEnabled: false,
    primarySourceKind,
    updatedAt: 1,
  }
}

function idFragment(id: string) {
  // convex-test ids have a long zero prefix; stripping it keeps the source-id
  // checks discriminating while the real production id is pinned separately.
  return id.replace(/^0+/, "")
}

type FixtureOrder = {
  id: Id<"orders">
  bookingRef: string
  bookerName: string
}

type FixtureAttendee = {
  id: Id<"orderAttendees">
  orderId: Id<"orders">
  name: string
  email?: string
  bookingRef: string
}

type Fixture = {
  eventId: Id<"events">
  otherEventId: Id<"events">
  visibleOrders: FixtureOrder[]
  visibleAttendees: FixtureAttendee[]
  mergedOrder: FixtureOrder
  mergedAttendeeId: Id<"orderAttendees">
  otherOrder: FixtureOrder
  otherAttendeeId: Id<"orderAttendees">
}

async function seedFixture(t: TestConvex): Promise<Fixture> {
  return await t.run(async (ctx) => {
    const eventId = await ctx.db.insert("events", internalEventDoc("source-search-guards"))
    const otherEventId = await ctx.db.insert(
      "events",
      internalEventDoc("source-search-guards-other", "integration")
    )

    const orderSpecs = [
      {
        bookingRef: "BK-FAMILY-VOS",
        bookerName: "Oliver Vos",
        bookerEmail: "oliver.vos@example.com",
      },
      {
        bookingRef: "BK-NADINE-01",
        bookerName: "Nadine de Vries",
        bookerEmail: "nadine.devries@example.com",
      },
      {
        bookingRef: "BK-NADINE-02",
        bookerName: "Nadine O'Neil",
        bookerEmail: "nadine.oneil@example.com",
      },
      {
        bookingRef: "BK-NADINE-03",
        bookerName: "Nadine Müller",
        bookerEmail: "nadine.muller@example.com",
      },
      {
        bookingRef: "BK-NADINE-04",
        bookerName: "Nadine van Dijk",
        bookerEmail: "nadine.vandijk@example.com",
      },
      {
        bookingRef: "BK-NADINE-05",
        bookerName: "Nadine Smith",
        bookerEmail: "nadine.smith@example.com",
      },
    ]
    const visibleOrders: FixtureOrder[] = []
    for (const [index, spec] of orderSpecs.entries()) {
      const id = await ctx.db.insert("orders", {
        eventId,
        source: "internal",
        bookingRef: spec.bookingRef,
        bookerName: spec.bookerName,
        bookerEmail: spec.bookerEmail,
        submittedAt: BASE_AT + index * 1_000,
        status: "pending",
      })
      visibleOrders.push({ id, ...spec })
    }

    const mergedOrderId = await ctx.db.insert("orders", {
      eventId,
      source: "internal",
      bookingRef: "BK-MERGED-GHOST",
      bookerName: "Merged Ghost Order",
      submittedAt: BASE_AT + 8_000,
      status: "pending",
      mergedIntoOrderId: visibleOrders[0].id,
    })
    const mergedOrder = {
      id: mergedOrderId,
      bookingRef: "BK-MERGED-GHOST",
      bookerName: "Merged Ghost Order",
    }

    const otherOrderId = await ctx.db.insert("orders", {
      eventId: otherEventId,
      source: "integration",
      bookingRef: "BK-OTHER-EVENT",
      bookerName: "Other Event Order",
      submittedAt: BASE_AT + 9_000,
      status: "pending",
    })
    const otherOrder = {
      id: otherOrderId,
      bookingRef: "BK-OTHER-EVENT",
      bookerName: "Other Event Order",
    }

    const attendeeSpecs: Array<{
      orderIndex: number
      name: string
      email?: string
    }> = [
      { orderIndex: 0, name: "Oliver Vos", email: "oliver.vos@example.com" },
      { orderIndex: 0, name: "Vicky Vos", email: "vicky.vos@example.com" },
      { orderIndex: 1, name: "Nadine de Vries", email: "nadine.devries@example.com" },
      { orderIndex: 1, name: "Nadine van Dijk", email: "nadine.vandijk@example.com" },
      { orderIndex: 2, name: "Nadine O'Neil", email: "nadine.oneil@example.com" },
      { orderIndex: 2, name: "Nadine Ó Briain", email: "nadine.obriain@example.com" },
      { orderIndex: 3, name: "Nadine Müller" },
      { orderIndex: 3, name: "Nadine Kovač", email: "nadine.kovac@example.com" },
      { orderIndex: 4, name: "Nadine Smith", email: "nadine.smith@example.com" },
      { orderIndex: 5, name: "Nadine Johnson", email: "nadine.johnson@example.com" },
    ]
    const visibleAttendees: FixtureAttendee[] = []
    for (const [index, spec] of attendeeSpecs.entries()) {
      const order = visibleOrders[spec.orderIndex]
      const id = await ctx.db.insert("orderAttendees", {
        orderId: order.id,
        eventId,
        attendeeKey: `source-guard-${index}`,
        name: spec.name,
        email: spec.email,
        gender: "unknown",
        sortOrder: index,
      })
      visibleAttendees.push({
        id,
        orderId: order.id,
        name: spec.name,
        email: spec.email,
        bookingRef: order.bookingRef,
      })
    }

    const mergedAttendeeId = await ctx.db.insert("orderAttendees", {
      orderId: mergedOrderId,
      eventId,
      attendeeKey: "source-guard-merged",
      name: "Merged Ghost Attendee",
      email: "merged.ghost@example.com",
      gender: "unknown",
      sortOrder: 0,
    })
    const otherAttendeeId = await ctx.db.insert("orderAttendees", {
      orderId: otherOrderId,
      eventId: otherEventId,
      attendeeKey: "source-guard-other",
      name: "Other Event Attendee",
      email: "other.event@example.com",
      gender: "unknown",
      sortOrder: 0,
    })

    return {
      eventId,
      otherEventId,
      visibleOrders,
      visibleAttendees,
      mergedOrder,
      mergedAttendeeId,
      otherOrder,
      otherAttendeeId,
    }
  })
}

async function assertProjectionFreeAndNonVacuous(
  t: TestConvex,
  fixture: Fixture
) {
  const counts = await t.run(async (ctx) => ({
    documents: (await ctx.db.query("searchDocuments").take(1)).length,
    jobs: (await ctx.db.query("searchProjectionFanoutJobs").take(1)).length,
  }))
  expect(counts.documents).toBe(0)
  expect(counts.jobs).toBe(0)
  expect(fixture.visibleOrders.length).toBeGreaterThanOrEqual(6)
  expect(fixture.visibleAttendees.length).toBeGreaterThanOrEqual(10)
}

type OrderSearchResult = Awaited<ReturnType<TestConvex["query"]>>

test("every visible order is findable by its own id on a projection-free fixture", async () => {
  const t = fresh()
  const fixture = await seedFixture(t)
  await assertProjectionFreeAndNonVacuous(t, fixture)

  let checked = 0
  for (const order of fixture.visibleOrders) {
    for (const search of [idFragment(String(order.id)), String(order.id)]) {
      const result = (await t.query(api.orders.getOrdersWithFilters, {
        eventId: String(fixture.eventId),
        search,
        pageSize: 25,
      })) as OrderSearchResult
      expect(
        result.orders.map((row) => row.orderId),
        `needle ${search} must find ${order.id}`
      ).toContain(String(order.id))
      checked += 1
    }
  }
  expect(checked).toBe(fixture.visibleOrders.length * 2)
})

test("every attendee is findable by id, name, email, and booking ref", async () => {
  const t = fresh()
  const fixture = await seedFixture(t)
  await assertProjectionFreeAndNonVacuous(t, fixture)

  let checked = 0
  for (const attendee of fixture.visibleAttendees) {
    const nameParts = attendee.name.split(/\s+/)
    const searches = [
      idFragment(String(attendee.id)),
      String(attendee.id),
      nameParts[0].slice(0, Math.min(5, nameParts[0].length)),
      nameParts[nameParts.length - 1],
      attendee.bookingRef,
    ]
    if (attendee.email) {
      searches.push(attendee.email, attendee.email.replace(/[^a-zA-Z0-9]/g, ""))
    }

    for (const search of searches) {
      const result = await t.query(api.attendees.getAttendeeLedgerPage, {
        eventId: fixture.eventId,
        search,
        pageSize: 50,
        cursor: null,
      })
      expect(
        result.rows.map((row) => String(row._id)),
        `needle ${search} must find ${attendee.id}`
      ).toContain(String(attendee.id))
      checked += 1
    }
  }
  expect(checked).toBeGreaterThanOrEqual(fixture.visibleAttendees.length * 6)
})

test("the live defect values find both the Oliver Vos order and attendee", async () => {
  const t = fresh()
  const fixture = await seedFixture(t)
  await assertProjectionFreeAndNonVacuous(t, fixture)

  const defect = fixture.visibleOrders[0]
  const defectAttendee = fixture.visibleAttendees[0]
  for (const search of ["oliver", "vos", "bkfamilyvos"]) {
    const orders = await t.query(api.orders.getOrdersWithFilters, {
      eventId: String(fixture.eventId),
      search,
      pageSize: 25,
    })
    const attendees = await t.query(api.attendees.getAttendeeLedgerPage, {
      eventId: fixture.eventId,
      search,
      pageSize: 50,
      cursor: null,
    })
    expect(orders.orders.map((row) => row.orderId), search).toContain(String(defect.id))
    expect(attendees.rows.map((row) => String(row._id)), search).toContain(
      String(defectAttendee.id)
    )
  }

  const realDefectHaystack = buildSearchHaystack([
    "ph7dxxr9sebg2bc6x4vpk664mn8e9d2d",
    "Oliver Vos",
    "BK-FAMILY-VOS",
  ])
  for (const needle of ["ph7dxxr9", "oliver", "vos"]) {
    expect(matchesNormalizedSearch(realDefectHaystack, needle)).toBe(true)
  }
})

test("pagination finds every Nadine match exactly once for attendees and orders", async () => {
  const t = fresh()
  const fixture = await seedFixture(t)
  await assertProjectionFreeAndNonVacuous(t, fixture)

  const expectedAttendees = fixture.visibleAttendees
    .filter((attendee) => attendee.name.toLowerCase().includes("nadine"))
    .map((attendee) => String(attendee.id))
  const attendeePages: string[][] = []
  let attendeeCursor: string | null = null
  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    const page = await t.query(api.attendees.getAttendeeLedgerPage, {
      eventId: fixture.eventId,
      search: "Nadine",
      pageSize: 2,
      cursor: attendeeCursor,
    })
    attendeePages.push(page.rows.map((row) => String(row._id)))
    if (!page.page.hasNextPage) break
    attendeeCursor = page.page.nextCursor
    expect(attendeeCursor).not.toBeNull()
  }
  expect(attendeePages.slice(0, -1).every((page) => page.length === 2)).toBe(true)
  const attendeeUnion = attendeePages.flat()
  expect(new Set(attendeeUnion)).toEqual(new Set(expectedAttendees))
  expect(attendeeUnion).toHaveLength(expectedAttendees.length)

  const expectedOrders = fixture.visibleOrders
    .filter((order) => order.bookerName.toLowerCase().includes("nadine"))
    .map((order) => String(order.id))
  const orderPages: string[][] = []
  let orderCursor: string | null = null
  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    const page = await t.query(api.orders.getOrdersWithFilters, {
      eventId: String(fixture.eventId),
      search: "Nadine",
      pageSize: 2,
      searchCursor: orderCursor,
    })
    orderPages.push(page.orders.map((row) => row.orderId))
    if (!page.hasNextPage) break
    orderCursor = page.nextCursor
    expect(orderCursor).not.toBeNull()
  }
  expect(orderPages.slice(0, -1).every((page) => page.length === 2)).toBe(true)
  const orderUnion = orderPages.flat()
  expect(new Set(orderUnion)).toEqual(new Set(expectedOrders))
  expect(orderUnion).toHaveLength(expectedOrders.length)
})

test("merged and other-event records stay excluded from an event-scoped search", async () => {
  const t = fresh()
  const fixture = await seedFixture(t)
  await assertProjectionFreeAndNonVacuous(t, fixture)

  for (const search of [fixture.mergedOrder.bookerName, String(fixture.mergedOrder.id)]) {
    const result = await t.query(api.orders.getOrdersWithFilters, {
      eventId: String(fixture.eventId),
      search,
      pageSize: 25,
    })
    expect(result.orders).toEqual([])
  }
  for (const search of ["Merged Ghost Attendee", String(fixture.mergedAttendeeId)]) {
    const result = await t.query(api.attendees.getAttendeeLedgerPage, {
      eventId: fixture.eventId,
      search,
      pageSize: 50,
      cursor: null,
    })
    expect(result.rows).toEqual([])
  }

  const otherOrderByName = await t.query(api.orders.getOrdersWithFilters, {
    eventId: String(fixture.eventId),
    search: fixture.otherOrder.bookerName,
    pageSize: 25,
  })
  const otherOrderById = await t.query(api.orders.getOrdersWithFilters, {
    eventId: String(fixture.eventId),
    search: String(fixture.otherOrder.id),
    pageSize: 25,
  })
  expect(otherOrderByName.orders).toEqual([])
  expect(otherOrderById.orders).toEqual([])

  const otherAttendee = await t.query(api.attendees.getAttendeeLedgerPage, {
    eventId: fixture.eventId,
    search: String(fixture.otherAttendeeId),
    pageSize: 50,
    cursor: null,
  })
  expect(otherAttendee.rows).toEqual([])
})
