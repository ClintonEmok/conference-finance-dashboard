/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import { buildSearchHaystack, matchesNormalizedSearch } from "./search"

const modules = import.meta.glob("./**/*.ts")
const identity = {
  subject: "source-search-guards-admin",
  tokenIdentifier: "clerk|source-search-guards-admin",
}

type TestConvex = TestConvexForDataModel<GenericDataModel>

type SearchPage = {
  rows: Array<{ _id: string; orderId?: string }>
  page: {
    hasNextPage: boolean
    nextCursor: string | null
  }
}

const BASE_AT = 1_700_000_000_000

function fresh() {
  return convexTest(schema, modules).withIdentity(identity)
}

/**
 * The fixture intentionally never writes a projection row. This is the
 * structural reason the pre-Phase-62 readers return no positive matches.
 */
async function expectSourceOnly(t: TestConvex) {
  const counts = await t.run(async (ctx) => ({
    documents: (await ctx.db.query("searchDocuments").take(1)).length,
    jobs: (await ctx.db.query("searchProjectionFanoutJobs").take(1)).length,
    terms: (await ctx.db.query("searchDocumentTerms").take(1)).length,
  }))
  expect(counts.documents).toBe(0)
  expect(counts.jobs).toBe(0)
  expect(counts.terms).toBe(0)
}

/** convex-test ids have a long zero prefix; this is the useful test fragment. */
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

type Fixture = {
  eventA: string
  eventB: string
  visibleOrders: Array<{ id: string; bookerName: string; bookingRef: string }>
  visibleAttendees: Array<{
    id: string
    name: string
    email?: string
    bookingRef: string
  }>
  mergedOrderId: string
  mergedAttendeeId: string
  otherEventOrderId: string
  otherEventAttendeeId: string
}

/**
 * Six visible internal orders and ten attendees give the loops a meaningful
 * floor. The seventh order is merged, and the eighth belongs to another event.
 */
async function seedFixture(t: TestConvex): Promise<Fixture> {
  return await t.run(async (ctx) => {
    const eventA = await ctx.db.insert("events", internalEventDoc("guard-event-a"))
    const eventB = await ctx.db.insert("events", internalEventDoc("guard-event-b"))

    const orderSpecs = [
      ["Oliver Vos", "BK-FAMILY-VOS", "oliver.vos@example.com"],
      ["Nadine North", "BK-NADINE-NORTH", "nadine.north@example.com"],
      ["Nadine South", "BK-NADINE-SOUTH", "nadine.south@example.com"],
      ["Nadine East", "BK-NADINE-EAST", "nadine.east@example.com"],
      ["Nadine West", "BK-NADINE-WEST", "nadine.west@example.com"],
      ["Nadine Central", "BK-NADINE-CENTRAL", "nadine.central@example.com"],
    ] as const

    const visibleOrderIds = [] as Array<{
      id: string
      bookerName: string
      bookingRef: string
    }>
    for (const [index, [bookerName, bookingRef, bookerEmail]] of orderSpecs.entries()) {
      const id = await ctx.db.insert("orders", {
        eventId: eventA,
        source: "internal",
        bookerName,
        bookingRef,
        bookerEmail,
        providerOrderId: `PROVIDER-GUARD-${index + 1}`,
        submittedAt: BASE_AT + index,
        status: index === 0 ? "pending" : "paid",
      })
      visibleOrderIds.push({ id: String(id), bookerName, bookingRef })
    }

    const mergedOrderId = await ctx.db.insert("orders", {
      eventId: eventA,
      source: "internal",
      bookerName: "Merged Ghost",
      bookingRef: "BK-MERGED-GUARD",
      submittedAt: BASE_AT + 20,
      mergedIntoOrderId: visibleOrderIds[0].id as never,
    })
    const otherEventOrderId = await ctx.db.insert("orders", {
      eventId: eventB,
      source: "internal",
      bookerName: "Bea Other",
      bookingRef: "BK-OTHER-EVENT",
      bookerEmail: "bea.other@example.com",
      submittedAt: BASE_AT + 21,
      status: "pending",
    })

    const attendeeSpecs = [
      [visibleOrderIds[0].id, "Oliver Vos", "oliver.vos@example.com"],
      [visibleOrderIds[0].id, "Ava-Mae O'Neil", "ava.mae+guard@example.com"],
      [visibleOrderIds[1].id, "Nadine North", "nadine.north@example.com"],
      [visibleOrderIds[2].id, "Nadine South", "nadine.south@example.com"],
      [visibleOrderIds[2].id, "Celine van Dijk", undefined],
      [visibleOrderIds[3].id, "Nadine East", "nadine.east@example.com"],
      [visibleOrderIds[3].id, "Daan Koster", "daan.koster@example.com"],
      [visibleOrderIds[4].id, "Nadine West", "nadine.west@example.com"],
      [visibleOrderIds[4].id, "Eline Smith", "eline.smith@example.com"],
      [visibleOrderIds[5].id, "Nadine Central", "nadine.central@example.com"],
    ] as const

    const visibleAttendeeIds = [] as Array<{
      id: string
      name: string
      email?: string
      bookingRef: string
    }>
    for (const [index, [orderId, name, email]] of attendeeSpecs.entries()) {
      const order = visibleOrderIds.find((candidate) => candidate.id === orderId)
      const attendeeId = await ctx.db.insert("orderAttendees", {
        orderId: orderId as never,
        eventId: eventA,
        attendeeKey: `guard-${index + 1}`,
        name,
        email,
        gender: "unknown",
        sortOrder: index,
      })
      visibleAttendeeIds.push({
        id: String(attendeeId),
        name,
        ...(email ? { email } : {}),
        bookingRef: order!.bookingRef,
      })
    }

    const mergedAttendeeId = await ctx.db.insert("orderAttendees", {
      orderId: mergedOrderId,
      eventId: eventA,
      attendeeKey: "merged-guard",
      name: "Merged Ghost",
      email: "merged.guard@example.com",
      gender: "unknown",
      sortOrder: 0,
    })
    const otherEventAttendeeId = await ctx.db.insert("orderAttendees", {
      orderId: otherEventOrderId,
      eventId: eventB,
      attendeeKey: "other-event-guard",
      name: "Bea Other",
      email: "bea.other@example.com",
      gender: "unknown",
      sortOrder: 0,
    })

    return {
      eventA: String(eventA),
      eventB: String(eventB),
      visibleOrders: visibleOrderIds,
      visibleAttendees: visibleAttendeeIds,
      mergedOrderId: String(mergedOrderId),
      mergedAttendeeId: String(mergedAttendeeId),
      otherEventOrderId: String(otherEventOrderId),
      otherEventAttendeeId: String(otherEventAttendeeId),
    }
  })
}

async function orderSearch(
  t: TestConvex,
  eventId: string,
  search: string,
  pageSize = 100,
  searchCursor?: string | null
) {
  return await t.query(api.orders.getOrdersWithFilters, {
    eventId,
    search,
    page: 1,
    pageSize,
    ...(searchCursor !== undefined ? { searchCursor } : {}),
  })
}

async function attendeeSearch(
  t: TestConvex,
  eventId: string,
  search: string,
  pageSize = 100,
  cursor?: string | null
): Promise<SearchPage> {
  return (await t.query(api.attendees.getAttendeeLedgerPage, {
    eventId,
    search,
    cursor: cursor ?? null,
    pageSize,
    from: null,
    to: null,
  })) as SearchPage
}

test("every visible order is findable by its own id on a projection-free fixture", async () => {
  const t = fresh()
  const fixture = await seedFixture(t)
  await expectSourceOnly(t)

  const counts = await t.run(async (ctx) => ({
    orders: (await ctx.db.query("orders").take(100)).length,
    attendees: (await ctx.db.query("orderAttendees").take(100)).length,
  }))
  expect(counts.orders).toBeGreaterThanOrEqual(6)
  expect(counts.attendees).toBeGreaterThanOrEqual(10)

  let checked = 0
  for (const order of fixture.visibleOrders) {
    for (const needle of [order.id.slice(0, 10), order.id, idFragment(order.id)]) {
      const result = await orderSearch(t, fixture.eventA, needle)
      expect(result.orders.map((row) => String(row.orderId)), `needle ${needle}`).toContain(
        order.id
      )
    }
    checked += 1
  }
  expect(checked).toBe(fixture.visibleOrders.length)
})

test("every attendee is findable by id, name, email, and order ref", async () => {
  const t = fresh()
  const fixture = await seedFixture(t)
  await expectSourceOnly(t)

  let checks = 0
  for (const attendee of fixture.visibleAttendees) {
    const nameParts = attendee.name.trim().split(/\s+/)
    const needles = [
      idFragment(attendee.id),
      attendee.id,
      nameParts[0],
      ...(nameParts.length > 1 ? [nameParts.at(-1)!] : []),
      attendee.bookingRef,
      attendee.bookingRef.replace(/[-_]/g, ""),
      ...(attendee.email
        ? [attendee.email, attendee.email.replace(/[.@+_-]/g, "")]
        : []),
    ]
    for (const needle of needles) {
      const result = await attendeeSearch(t, fixture.eventA, needle)
      expect(
        result.rows.map((row) => String(row._id)),
        `needle ${needle} must find ${attendee.id}`
      ).toContain(attendee.id)
      checks += 1
    }
  }
  expect(checks).toBeGreaterThanOrEqual(10)
  expect(checks).toBe(
    fixture.visibleAttendees.reduce(
      (count, attendee) =>
        count + 5 + (attendee.name.trim().split(/\s+/).length > 1 ? 1 : 0) + (attendee.email ? 2 : 0),
      0
    )
  )
})

test("the real defect values resolve for both orders and attendees", async () => {
  const t = fresh()
  const fixture = await seedFixture(t)
  await expectSourceOnly(t)

  const defectOrder = fixture.visibleOrders[0]
  const defectAttendee = fixture.visibleAttendees[0]
  for (const needle of ["oliver", "vos", "bkfamilyvos", "BK-FAMILY-VOS"]) {
    const orderResult = await orderSearch(t, fixture.eventA, needle)
    expect(orderResult.orders.map((row) => String(row.orderId)), needle).toContain(
      defectOrder.id
    )
    const attendeeResult = await attendeeSearch(t, fixture.eventA, needle)
    expect(attendeeResult.rows.map((row) => String(row._id)), needle).toContain(
      defectAttendee.id
    )
  }

  const haystack = buildSearchHaystack([
    "ph7dxxr9sebg2bc6x4vpk664mn8e9d2d",
    "Oliver Vos",
    "BK-FAMILY-VOS",
  ])
  for (const needle of ["ph7dxxr9", "oliver", "vos"]) {
    expect(matchesNormalizedSearch(haystack, needle)).toBe(true)
  }
})

test("order and attendee pagination returns every Nadine match exactly once", async () => {
  const t = fresh()
  const fixture = await seedFixture(t)
  await expectSourceOnly(t)

  const expectedOrders = fixture.visibleOrders
    .filter((order) => order.bookerName.toLowerCase().includes("nadine"))
    .map((order) => order.id)
  const expectedAttendees = fixture.visibleAttendees
    .filter(
      (attendee) =>
        attendee.name.toLowerCase().includes("nadine") ||
        attendee.bookingRef.toLowerCase().includes("nadine")
    )
    .map((attendee) => attendee.id)
  expect(expectedOrders.length).toBeGreaterThanOrEqual(5)
  expect(expectedAttendees.length).toBeGreaterThanOrEqual(5)

  const orderIds: string[] = []
  let orderCursor: string | null = null
  for (let page = 0; page < 10; page += 1) {
    const result = await orderSearch(t, fixture.eventA, "nadine", 2, orderCursor)
    orderIds.push(...result.orders.map((row) => String(row.orderId)))
    if (!result.hasNextPage) {
      expect(result.nextCursor).toBeNull()
      break
    }
    expect(result.nextCursor).toBeTruthy()
    orderCursor = result.nextCursor
    if (page === 9) throw new Error("order pagination did not terminate")
  }

  const attendeeIds: string[] = []
  let attendeeCursor: string | null = null
  for (let page = 0; page < 10; page += 1) {
    const result = await attendeeSearch(t, fixture.eventA, "nadine", 2, attendeeCursor)
    attendeeIds.push(...result.rows.map((row) => String(row._id)))
    if (!result.page.hasNextPage) {
      expect(result.page.nextCursor).toBeNull()
      break
    }
    expect(result.page.nextCursor).toBeTruthy()
    attendeeCursor = result.page.nextCursor
    if (page === 9) throw new Error("attendee pagination did not terminate")
  }

  expect(new Set(orderIds)).toEqual(new Set(expectedOrders))
  expect(new Set(orderIds).size).toBe(expectedOrders.length)
  expect(new Set(attendeeIds)).toEqual(new Set(expectedAttendees))
  expect(new Set(attendeeIds).size).toBe(expectedAttendees.length)
})

test("merged and other-event records stay outside the event-scoped searches", async () => {
  const t = fresh()
  const fixture = await seedFixture(t)
  await expectSourceOnly(t)

  const mergedOrder = await orderSearch(
    t,
    fixture.eventA,
    idFragment(fixture.mergedOrderId)
  )
  const otherEventOrder = await orderSearch(
    t,
    fixture.eventA,
    idFragment(fixture.otherEventOrderId)
  )
  expect(mergedOrder.orders).toEqual([])
  expect(otherEventOrder.orders).toEqual([])

  const mergedAttendee = await attendeeSearch(
    t,
    fixture.eventA,
    idFragment(fixture.mergedAttendeeId)
  )
  const otherEventAttendee = await attendeeSearch(
    t,
    fixture.eventA,
    idFragment(fixture.otherEventAttendeeId)
  )
  expect(mergedAttendee.rows).toEqual([])
  expect(otherEventAttendee.rows).toEqual([])
})
