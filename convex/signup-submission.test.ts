/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"
import { loadOrderAmountDueBreakdowns } from "./finance"

const modules = import.meta.glob("./**/*.ts")

function fresh() {
  return convexTest(schema, modules)
}

const adminIdentity = {
  subject: "user_admin",
  name: "Admin",
  email: "admin@example.com",
}

const BASE_EVENT_AT = 1_750_000_000_000
const DAY_MS = 24 * 60 * 60 * 1000

type SeedContext = {
  eventId: Id<"events">
  categoryStandardId: Id<"accommodationCategories">
  categorySuperiorId: Id<"accommodationCategories">
  unconstrainedTicketId: Id<"ticketTypes">
  constrainedTicketId: Id<"ticketTypes">
}

async function createConfiguredEvent(
  t: TestConvexForDataModel<GenericDataModel>
): Promise<SeedContext> {
  const eventId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: "signup-submission-event",
      title: "Signup Submission Event",
      startsAt: BASE_EVENT_AT,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: true,
      primarySourceKind: "internal" as const,
      updatedAt: BASE_EVENT_AT,
    })
  })

  const categoryStandardId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationCategories", {
      code: "standard",
      label: "Standard",
      sortOrder: 1,
    })
  })
  const categorySuperiorId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationCategories", {
      code: "superior",
      label: "Superior",
      sortOrder: 2,
    })
  })
  const upgradeOptionId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationOptions", {
      code: "superior_upgrade",
      label: "Superior Upgrade",
      kind: "upgrade",
      unit: "per_night",
    })
  })
  const cotOptionId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationOptions", {
      code: "cot",
      label: "Cot",
      kind: "addon",
      unit: "per_night",
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationAgeBands", {
      code: "under_3",
      label: "Under 3",
      minAge: 0,
      maxAge: 3,
      sortOrder: 1,
    })
  })
  await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationAgeBands", {
      code: "18_plus",
      label: "18 and over",
      minAge: 18,
      sortOrder: 4,
    })
  })

  await t.mutation(api.accommodation.upsertEventAccommodationConfig, {
    eventId,
    baseCheckInAt: BASE_EVENT_AT - 2 * DAY_MS,
    baseCheckOutAt: BASE_EVENT_AT,
    breakfastIncluded: true,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId,
    categoryId: categoryStandardId,
    occupancy: "shared",
    pricePerPersonMinor: 3000,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId,
    categoryId: categorySuperiorId,
    occupancy: "shared",
    pricePerPersonMinor: 4500,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationOption, {
    eventId,
    optionId: upgradeOptionId,
    enabled: true,
    priceMinor: 1500,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationOption, {
    eventId,
    optionId: cotOptionId,
    enabled: true,
    priceMinor: 500,
    eligibilityAgeBandCode: "under_3",
  })
  await t.mutation(api.accommodation.upsertEventAccommodationAgePricing, {
    eventId,
    ageBandCode: "18_plus",
    rateType: "full",
    value: 0,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationAgePricing, {
    eventId,
    ageBandCode: "under_3",
    rateType: "free",
    value: 0,
  })

  const constrainedRoomTypeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationRoomTypes", {
      label: "Superior Suite",
      defaultCapacity: 2,
      categoryId: categorySuperiorId as never,
    })
  })

  const unconstrainedTicketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: eventId as never,
      label: "Unconstrained ticket",
      priceMinor: 2000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: false,
      updatedAt: BASE_EVENT_AT,
    })
  })
  const constrainedTicketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: eventId as never,
      label: "Superior-suite ticket",
      priceMinor: 2500,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: false,
      roomTypeId: constrainedRoomTypeId as never,
      updatedAt: BASE_EVENT_AT,
    })
  })

  return {
    eventId: eventId as Id<"events">,
    categoryStandardId: categoryStandardId as Id<"accommodationCategories">,
    categorySuperiorId: categorySuperiorId as Id<"accommodationCategories">,
    unconstrainedTicketId: unconstrainedTicketId as Id<"ticketTypes">,
    constrainedTicketId: constrainedTicketId as Id<"ticketTypes">,
  }
}

function buildEnvelope(input: {
  eventId: Id<"events">
  ticketTypeId: Id<"ticketTypes">
  attendeeKey?: string
  accommodationSelections?: Array<{
    attendeeKey: string
    categoryId: Id<"accommodationCategories">
    occupancy: "single" | "shared" | "family"
    upgradeSelected: boolean
    cotSelected: boolean
    ageBandCode?: "under_3" | "3_11" | "12_17" | "18_plus"
  }>
  assignments?: Array<{
    attendeeKey: string
    slotId: Id<"accommodationSlots">
    assignmentIntent: "assign" | "skip"
  }>
}) {
  const attendeeKey = input.attendeeKey ?? "attendee-1"
  return {
    eventId: input.eventId,
    source: "internal" as const,
    idempotencyKey: `idem-${Math.random().toString(36).slice(2)}`,
    payloadFingerprint: `fp-${Math.random().toString(36).slice(2)}`,
    honeypotSeen: false,
    booker: {
      name: "Booker",
      email: "booker@example.com",
      phone: "+31612345678",
    },
    attendees: [
      {
        attendeeKey,
        name: "Attendee One",
        email: "attendee@example.com",
        gender: "female" as const,
      },
    ],
    ticketSelections: [
      {
        attendeeKey,
        ticketTypeId: input.ticketTypeId,
        quantity: 1,
      },
    ],
    assignments: input.assignments ?? [],
    accommodationSelections: input.accommodationSelections ?? [],
  }
}

test("valid options-only submission persists one selection row per preference with server-derived stay fields", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  const result = await t.mutation(
    api.signupSubmission.submitSignupEnvelope,
    buildEnvelope({
      eventId: seed.eventId,
      ticketTypeId: seed.unconstrainedTicketId,
      accommodationSelections: [
        {
          attendeeKey: "attendee-1",
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          upgradeSelected: false,
          cotSelected: false,
          ageBandCode: "18_plus",
        },
      ],
    })
  )

  expect(result.submissionId).toBeDefined()

  const rows = await t.query(async (ctx) => {
    return await ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", result.submissionId as never))
      .take(10)
  })
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    categoryId: seed.categoryStandardId,
    occupancy: "shared",
    upgradeSelected: false,
    cotSelected: false,
    ageBandCode: "18_plus",
    checkInAt: BASE_EVENT_AT - 2 * DAY_MS,
    checkOutAt: BASE_EVENT_AT,
    nightCount: 2,
  })
  // Unconfirmed: no confirmation boundary and no price snapshot.
  expect(rows[0].confirmedAt).toBeUndefined()
  expect(rows[0].configVersion).toBeUndefined()
  expect(rows[0].priceSnapshot).toBeUndefined()

  // No assignment rows are created for an options-only request.
  const assignments = await t.query(async (ctx) => {
    return await ctx.db
      .query("orderAssignments")
      .withIndex("by_orderId", (q) => q.eq("orderId", result.submissionId as never))
      .take(10)
  })
  expect(assignments).toHaveLength(0)

  // The restore payload round-trips the preferences.
  expect(result.restorePayload.accommodationSelections).toEqual([
    {
      attendeeKey: "attendee-1",
      categoryId: String(seed.categoryStandardId),
      occupancy: "shared",
      upgradeSelected: false,
      cotSelected: false,
      ageBandCode: "18_plus",
    },
  ])
})

test("the canonical amount-due loader prices newly inserted unconfirmed selection rows live", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  const result = await t.mutation(
    api.signupSubmission.submitSignupEnvelope,
    buildEnvelope({
      eventId: seed.eventId,
      ticketTypeId: seed.unconstrainedTicketId,
      accommodationSelections: [
        {
          attendeeKey: "attendee-1",
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          upgradeSelected: false,
          cotSelected: false,
          ageBandCode: "18_plus",
        },
      ],
    })
  )

  const breakdown = await t.query(async (ctx) => {
    const loaderCtx =
      ctx as unknown as Parameters<typeof loadOrderAmountDueBreakdowns>[0]
    const breakdowns = await loadOrderAmountDueBreakdowns(loaderCtx, [
      { _id: result.submissionId as never },
    ])
    const row = breakdowns.get(String(result.submissionId))
    if (!row) return null
    return {
      amountDueMinor: row.amountDueMinor,
      accommodationLines: row.accommodationLines,
    }
  })

  // Ticket €20 + 2 nights × €30 standard/shared = €60 accommodation.
  expect(breakdown?.amountDueMinor).toBe(8000)
  expect(breakdown?.accommodationLines).toEqual([
    {
      kind: "accommodation",
      label: "Accommodation",
      nights: 2,
      ratePerNightMinor: 3000,
      chargeMinor: 6000,
    },
  ])
})

test("submission accepts an optional blank age band", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  const result = await t.mutation(
    api.signupSubmission.submitSignupEnvelope,
    buildEnvelope({
      eventId: seed.eventId,
      ticketTypeId: seed.unconstrainedTicketId,
      accommodationSelections: [
        {
          attendeeKey: "attendee-1",
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          upgradeSelected: false,
          cotSelected: false,
        },
      ],
    })
  )

  const rows = await t.query(async (ctx) => {
    return await ctx.db
      .query("orderAccommodationSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", result.submissionId as never))
      .take(10)
  })
  expect(rows).toHaveLength(1)
  expect(rows[0].ageBandCode).toBeUndefined()
})

test("submission enforces ticket-constrained categories", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // Constrained ticket (superior suite) with the wrong category is rejected.
  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: seed.constrainedTicketId,
        accommodationSelections: [
          {
            attendeeKey: "attendee-1",
            categoryId: seed.categoryStandardId,
            occupancy: "shared",
            upgradeSelected: false,
            cotSelected: false,
            ageBandCode: "18_plus",
          },
        ],
      })
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")

  // The constrained category is accepted.
  const accepted = await t.mutation(
    api.signupSubmission.submitSignupEnvelope,
    buildEnvelope({
      eventId: seed.eventId,
      ticketTypeId: seed.constrainedTicketId,
      accommodationSelections: [
        {
          attendeeKey: "attendee-1",
          categoryId: seed.categorySuperiorId,
          occupancy: "shared",
          upgradeSelected: false,
          cotSelected: false,
          ageBandCode: "18_plus",
        },
      ],
    })
  )
  expect(accepted.submissionId).toBeDefined()
})

test("submission enforces the event-configured cot eligibility band", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: seed.unconstrainedTicketId,
        accommodationSelections: [
          {
            attendeeKey: "attendee-1",
            categoryId: seed.categoryStandardId,
            occupancy: "shared",
            upgradeSelected: false,
            cotSelected: true,
            ageBandCode: "18_plus",
          },
        ],
      })
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")

  const accepted = await t.mutation(
    api.signupSubmission.submitSignupEnvelope,
    buildEnvelope({
      eventId: seed.eventId,
      ticketTypeId: seed.unconstrainedTicketId,
      accommodationSelections: [
        {
          attendeeKey: "attendee-1",
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          upgradeSelected: false,
          cotSelected: true,
          ageBandCode: "under_3",
        },
      ],
    })
  )
  expect(accepted.submissionId).toBeDefined()
})

test("submission rejects stale rate combinations, duplicates, and unknown attendees", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // family occupancy has no rate for standard.
  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: seed.unconstrainedTicketId,
        accommodationSelections: [
          {
            attendeeKey: "attendee-1",
            categoryId: seed.categoryStandardId,
            occupancy: "family",
            upgradeSelected: false,
            cotSelected: false,
            ageBandCode: "18_plus",
          },
        ],
      })
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")

  // Duplicate preference for the same attendee is rejected.
  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: seed.unconstrainedTicketId,
        accommodationSelections: [
          {
            attendeeKey: "attendee-1",
            categoryId: seed.categoryStandardId,
            occupancy: "shared",
            upgradeSelected: false,
            cotSelected: false,
            ageBandCode: "18_plus",
          },
          {
            attendeeKey: "attendee-1",
            categoryId: seed.categoryStandardId,
            occupancy: "single",
            upgradeSelected: false,
            cotSelected: false,
            ageBandCode: "18_plus",
          },
        ],
      })
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")

  // Preference for an attendee with no ticket selection is rejected.
  const envelopeWithUnseatedAttendee = buildEnvelope({
    eventId: seed.eventId,
    ticketTypeId: seed.unconstrainedTicketId,
  })
  envelopeWithUnseatedAttendee.attendees = [
    envelopeWithUnseatedAttendee.attendees[0],
    {
      attendeeKey: "attendee-2",
      name: "Attendee Two",
      email: "two@example.com",
      gender: "female" as const,
    },
  ]
  envelopeWithUnseatedAttendee.ticketSelections = [
    {
      attendeeKey: "attendee-1",
      ticketTypeId: seed.unconstrainedTicketId,
      quantity: 1,
    },
  ]
  envelopeWithUnseatedAttendee.accommodationSelections = [
    {
      attendeeKey: "attendee-2",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      upgradeSelected: false,
      cotSelected: false,
      ageBandCode: "18_plus",
    },
  ]
  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      envelopeWithUnseatedAttendee
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")
})

test("submission rejects non-empty legacy room assignments before any write", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  const hotelId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationHotels", {
      name: "Test Hotel",
    })
  })
  const roomTypeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationRoomTypes", {
      label: "Twin",
      defaultCapacity: 2,
    })
  })
  const roomId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationRooms", {
      hotelId: hotelId as never,
      roomTypeId: roomTypeId as never,
      label: "Room 1",
      capacity: 2,
    })
  })
  const slotId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationSlots", {
      eventId: seed.eventId,
      hotelId: hotelId as never,
      roomId: roomId as never,
      slotLabel: "Bed-01",
      genderPolicy: "mixed",
      isAssignable: true,
      updatedAt: BASE_EVENT_AT,
    })
  })

  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: seed.unconstrainedTicketId,
        assignments: [
          {
            attendeeKey: "attendee-1",
            slotId: slotId as Id<"accommodationSlots">,
            assignmentIntent: "assign",
          },
        ],
      })
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")

  // Nothing was persisted: no orders and no assignment rows for this event.
  const orders = await t.query(async (ctx) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", seed.eventId))
      .take(10)
  })
  expect(orders).toHaveLength(0)
})

test("submission rejects cross-event ticket and category IDs", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // A second event with its own ticket: using it in a submission for the
  // first event must fail with the structured ticket error.
  const otherEventId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: "other-event",
      title: "Other Event",
      startsAt: BASE_EVENT_AT,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: true,
      primarySourceKind: "internal" as const,
      updatedAt: BASE_EVENT_AT,
    })
  })
  const otherTicketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: otherEventId as never,
      label: "Other ticket",
      priceMinor: 1000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      updatedAt: BASE_EVENT_AT,
    })
  })

  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: otherTicketId as Id<"ticketTypes">,
      })
    )
  ).rejects.toThrow("TICKET_UNAVAILABLE")

  // A category from the other event's rate rows is not active for this event.
  const otherCategoryId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationCategories", {
      code: "standard",
      label: "Standard Other",
      sortOrder: 5,
    })
  })
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId: otherEventId as Id<"events">,
    categoryId: otherCategoryId as Id<"accommodationCategories">,
    occupancy: "shared",
    pricePerPersonMinor: 1000,
  })

  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: seed.unconstrainedTicketId,
        accommodationSelections: [
          {
            attendeeKey: "attendee-1",
            categoryId: otherCategoryId as Id<"accommodationCategories">,
            occupancy: "shared",
            upgradeSelected: false,
            cotSelected: false,
            ageBandCode: "18_plus",
          },
        ],
      })
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")
})
