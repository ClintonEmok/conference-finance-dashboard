/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"
import { loadOrderAmountDueBreakdowns } from "./finance"

const modules = import.meta.glob("./**/*.ts")

const adminIdentity = {
  subject: "ticket-surcharge-admin",
  name: "Admin",
  email: "admin@example.com",
}

const BASE_AT = 1_750_000_000_000

type TestConvex = TestConvexForDataModel<GenericDataModel>

function fresh() {
  return convexTest(schema, modules)
}

async function createEvent(
  t: TestConvex,
  slug: string,
  input: { accommodationEnabled?: boolean; timezone?: string } = {}
) {
  return await t.mutation(async (ctx) =>
    ctx.db.insert("events", {
      slug,
      title: "Ticket surcharge event",
      startsAt: BASE_AT,
      timezone: input.timezone ?? "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: input.accommodationEnabled ?? false,
      primarySourceKind: "internal",
      updatedAt: BASE_AT,
    })
  )
}

async function createTicket(
  t: TestConvex,
  eventId: Id<"events">,
  input: {
    label: string
    priceMinor: number
    lateSurchargeMinor?: number
    lateSurchargeEffectiveAt?: number
  }
) {
  return await t.mutation(async (ctx) =>
    ctx.db.insert("ticketTypes", {
      eventId,
      label: input.label,
      priceMinor: input.priceMinor,
      ...(input.lateSurchargeMinor !== undefined
        ? { lateSurchargeMinor: input.lateSurchargeMinor }
        : {}),
      ...(input.lateSurchargeEffectiveAt !== undefined
        ? { lateSurchargeEffectiveAt: input.lateSurchargeEffectiveAt }
        : {}),
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      updatedAt: BASE_AT,
    })
  )
}

async function loadDue(t: TestConvex, orderId: Id<"orders">) {
  return await t.run(async (ctx) => {
    const breakdown = (
      await loadOrderAmountDueBreakdowns(ctx, [{ _id: orderId }])
    ).get(String(orderId))
    return breakdown
      ? {
          amountDueMinor: breakdown.amountDueMinor,
          amountDueByAttendeeId: Object.fromEntries(
            breakdown.amountDueByAttendeeId.entries()
          ),
          accommodationLines: breakdown.accommodationLines,
        }
      : null
  })
}

test("operator ticket controls validate surcharge configuration and public surfaces agree", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t, "ticket-surcharge-controls")
  const effectiveAt = Date.now() - 60_000

  await expect(
    t.mutation(api.events.createTicketType, {
      eventId,
      label: "Missing cutoff",
      priceMinor: 2_000,
      lateSurchargeMinor: 250,
    })
  ).rejects.toThrow(/requires an effective date and time/)

  await expect(
    t.mutation(api.events.createTicketType, {
      eventId,
      label: "Negative surcharge",
      priceMinor: 2_000,
      lateSurchargeMinor: -1,
    })
  ).rejects.toThrow(/non-negative/)

  const ticketId = await t.mutation(api.events.createTicketType, {
    eventId,
    label: "Late ticket",
    priceMinor: 2_000,
    lateSurchargeMinor: 250,
    lateSurchargeEffectiveAt: effectiveAt,
  })

  const catalog = await t.query(api.signupCatalog.getPublicSignupCatalog, {})
  const catalogTicket = catalog
    .find((event) => event.eventId === eventId)
    ?.tickets.find((ticket) => ticket.ticketTypeId === ticketId)
  expect(catalogTicket?.priceMinor).toBe(2_250)

  const quote = await t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
    eventId,
    attendees: [
      {
        attendeeKey: "quoted-attendee",
        ticketTypeId: ticketId,
        optionSelections: [],
      },
    ],
  })
  expect(quote).toMatchObject({
    ticketTotalMinor: 2_250,
    accommodationTotalMinor: 0,
    totalDueMinor: 2_250,
    attendees: [{ ticketPriceMinor: 2_250, amountDueMinor: 2_250 }],
  })

  await expect(
    t.mutation(api.events.updateTicketType, {
      ticketTypeId: ticketId,
      lateSurchargeMinor: 100,
      lateSurchargeEffectiveAt: null,
    })
  ).rejects.toThrow(/requires an effective date and time/)

  await t.mutation(api.events.updateTicketType, {
    ticketTypeId: ticketId,
    lateSurchargeMinor: 0,
    lateSurchargeEffectiveAt: null,
  })
  const cleared = await t.query(api.events.getTicketTypesForEvent, { eventId })
  expect(cleared[0]).not.toHaveProperty("lateSurchargeMinor")
  expect(cleared[0]).not.toHaveProperty("lateSurchargeEffectiveAt")
})

test("signup writes snapshots, confirmation reads them, and live edits do not reprice them", async () => {
  const t = fresh()
  const eventId = await createEvent(t, "ticket-surcharge-signup")
  const ticketId = await createTicket(t, eventId, {
    label: "Snapshot ticket",
    priceMinor: 2_000,
    lateSurchargeMinor: 300,
    lateSurchargeEffectiveAt: Date.now() - 60_000,
  })

  const submission = await t.mutation(api.signupSubmission.submitSignupEnvelope, {
    eventId,
    source: "internal",
    idempotencyKey: "ticket-snapshot-submission",
    honeypotSeen: false,
    booker: { name: "Booker", email: "booker@example.com" },
    attendees: [
      {
        attendeeKey: "signup-attendee",
        name: "Signup Attendee",
        gender: "unknown",
      },
    ],
    ticketSelections: [{ attendeeKey: "signup-attendee", ticketTypeId: ticketId, quantity: 1 }],
    assignments: [],
    accommodationSelections: [],
  })

  const selection = await t.run(async (ctx) =>
    ctx.db
      .query("orderTicketSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", submission.submissionId))
      .unique()
  )
  expect(selection?.ticketPriceSnapshot).toMatchObject({
    basePriceMinor: 2_000,
    surchargeMinor: 300,
    unitPriceMinor: 2_300,
  })

  const confirmation = await t.query(api.signupSubmission.getByBookingRef, {
    bookingRef: submission.bookingRef!,
  })
  expect(confirmation?.ticketSelections[0]?.pricePerTicketMinor).toBe(2_300)
  expect(confirmation?.totalAmountMinor).toBe(2_300)

  await t.mutation(async (ctx) => {
    await ctx.db.patch("ticketTypes", ticketId, {
      priceMinor: 9_000,
      lateSurchargeMinor: 1_000,
      lateSurchargeEffectiveAt: Date.now() - 60_000,
    })
  })
  expect((await loadDue(t, submission.submissionId))?.amountDueMinor).toBe(2_300)
})

test("manual creation, added attendees, and explicit reticketing snapshot independently", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await createEvent(t, "ticket-surcharge-manual")
  const firstTicketId = await createTicket(t, eventId, {
    label: "First",
    priceMinor: 2_000,
    lateSurchargeMinor: 100,
    lateSurchargeEffectiveAt: Date.now() - 60_000,
  })
  const secondTicketId = await createTicket(t, eventId, {
    label: "Second",
    priceMinor: 2_500,
    lateSurchargeMinor: 200,
    lateSurchargeEffectiveAt: Date.now() - 60_000,
  })

  const manual = await t.mutation(api.events.createManualAttendee, {
    eventId,
    attendeeName: "Manual attendee",
    ticketTypeId: firstTicketId,
  })
  const manualRows = await t.run(async (ctx) =>
    ctx.db
      .query("orderTicketSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", manual.orderId))
      .take(10)
  )
  expect(manualRows[0]?.ticketPriceSnapshot?.unitPriceMinor).toBe(2_100)
  const manualOrder = await t.run((ctx) => ctx.db.get("orders", manual.orderId))
  expect(manualOrder?.totalAmountMinor).toBe(2_100)

  const added = await t.mutation(api.attendees.addAttendeeToOrder, {
    orderId: manual.orderId,
    eventId,
    name: "Added attendee",
    ticketTypeId: secondTicketId,
  })
  let addedSelection = await t.run(async (ctx) =>
    (await ctx.db
      .query("orderTicketSelections")
      .withIndex("by_attendeeId", (q) => q.eq("attendeeId", added.attendeeId))
      .unique())
  )
  expect(addedSelection?.ticketPriceSnapshot?.unitPriceMinor).toBe(2_700)
  expect(added.amountDueMinor).toBe(4_800)

  await t.mutation(async (ctx) => {
    await ctx.db.patch("ticketTypes", firstTicketId, {
      priceMinor: 3_000,
      lateSurchargeMinor: 700,
      lateSurchargeEffectiveAt: Date.now() - 60_000,
    })
  })
  await t.mutation(api.attendees.updateAttendee, {
    attendeeId: String(added.attendeeId),
    ticketTypeId: firstTicketId,
  })
  addedSelection = await t.run(async (ctx) =>
    ctx.db
      .query("orderTicketSelections")
      .withIndex("by_attendeeId", (q) => q.eq("attendeeId", added.attendeeId))
      .unique()
  )
  expect(addedSelection?.ticketTypeId).toBe(firstTicketId)
  expect(addedSelection?.ticketPriceSnapshot).toMatchObject({
    basePriceMinor: 3_000,
    surchargeMinor: 700,
    unitPriceMinor: 3_700,
  })
})

test("finance keeps legacy rows surcharge-neutral, allocates mixed snapshots, and preserves accommodation snapshots", async () => {
  const t = fresh()
  const eventId = await createEvent(t, "ticket-surcharge-finance", {
    accommodationEnabled: true,
  })
  const ticketId = await createTicket(t, eventId, {
    label: "Shared ticket type",
    priceMinor: 2_000,
    lateSurchargeMinor: 300,
    lateSurchargeEffectiveAt: Date.now() - 60_000,
  })

  const seeded = await t.mutation(async (ctx) => {
    const orderId = await ctx.db.insert("orders", {
      eventId,
      source: "internal",
      bookingRef: "BK-MIXED-SNAPSHOT",
      submittedAt: BASE_AT,
    })
    const attendeeOneId = await ctx.db.insert("orderAttendees", {
      orderId,
      attendeeKey: "mixed-one",
      name: "Mixed one",
      gender: "unknown",
      sortOrder: 0,
    })
    const attendeeTwoId = await ctx.db.insert("orderAttendees", {
      orderId,
      attendeeKey: "mixed-two",
      name: "Mixed two",
      gender: "unknown",
      sortOrder: 1,
    })
    await ctx.db.insert("orderTicketSelections", {
      orderId,
      attendeeId: attendeeOneId,
      ticketTypeId: ticketId,
      quantity: 1,
      sortOrder: 0,
      ticketPriceSnapshot: {
        basePriceMinor: 2_000,
        surchargeMinor: 300,
        unitPriceMinor: 2_300,
        pricedAt: BASE_AT,
        lateSurchargeEffectiveAt: BASE_AT - 1,
      },
    })
    await ctx.db.insert("orderTicketSelections", {
      orderId,
      attendeeId: attendeeTwoId,
      ticketTypeId: ticketId,
      quantity: 1,
      sortOrder: 1,
      ticketPriceSnapshot: {
        basePriceMinor: 2_000,
        surchargeMinor: 800,
        unitPriceMinor: 2_800,
        pricedAt: BASE_AT,
        lateSurchargeEffectiveAt: BASE_AT - 1,
      },
    })
    await ctx.db.insert("orderAccommodationSelections", {
      orderId,
      attendeeId: attendeeOneId,
      occupancy: "shared",
      nightCount: 2,
      confirmedAt: BASE_AT,
      configVersion: 1,
      priceSnapshot: {
        baseRatePerNightMinor: 3_000,
        totalNights: 2,
        coveredNights: 0,
        optionLines: [],
      },
    })
    return { orderId, attendeeOneId, attendeeTwoId }
  })

  const beforeLiveEdit = await loadDue(t, seeded.orderId)
  expect(beforeLiveEdit?.amountDueMinor).toBe(11_100)
  expect(beforeLiveEdit?.amountDueByAttendeeId).toEqual({
    [String(seeded.attendeeOneId)]: 8_300,
    [String(seeded.attendeeTwoId)]: 2_800,
  })
  expect(beforeLiveEdit?.accommodationLines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "accommodation", chargeMinor: 6_000 }),
    ])
  )

  const legacyOrderId = await t.mutation(async (ctx) => {
    const orderId = await ctx.db.insert("orders", {
      eventId,
      source: "integration",
      providerOrderId: "legacy-order",
      submittedAt: BASE_AT,
    })
    const attendeeId = await ctx.db.insert("orderAttendees", {
      orderId,
      attendeeKey: "legacy-attendee",
      name: "Legacy attendee",
      gender: "unknown",
      sortOrder: 0,
    })
    await ctx.db.insert("orderTicketSelections", {
      orderId,
      attendeeId,
      ticketTypeId: ticketId,
      quantity: 1,
      sortOrder: 0,
    })
    return orderId
  })
  expect((await loadDue(t, legacyOrderId))?.amountDueMinor).toBe(2_000)

  await t.mutation(async (ctx) => {
    await ctx.db.patch("ticketTypes", ticketId, {
      priceMinor: 9_000,
      lateSurchargeMinor: 2_000,
      lateSurchargeEffectiveAt: Date.now() - 60_000,
    })
  })
  expect((await loadDue(t, seeded.orderId))?.amountDueMinor).toBe(11_100)
  // A legacy/provider selection uses the live base price but never inherits a
  // newly configured surcharge.
  expect((await loadDue(t, legacyOrderId))?.amountDueMinor).toBe(9_000)
})
