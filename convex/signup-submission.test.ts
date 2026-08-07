/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"
import { loadOrderAmountDueBreakdowns } from "./finance"
import {
  digestSubmissionEnvelope,
  mintSignupSubmissionToken,
} from "../lib/domain/signup/submission-token"

const modules = import.meta.glob("./**/*.ts")

// CR-07: the public mutation requires a server-issued token signed with
// SIGNUP_SUBMISSION_SECRET. The test secret mirrors the real Next server /
// Convex backend env wiring so every test envelope carries a valid token and
// dedicated tests prove forged/expired/mis-bound tokens are rejected.
const TEST_SIGNUP_SUBMISSION_SECRET = "test-signup-submission-secret"
process.env.SIGNUP_SUBMISSION_SECRET = TEST_SIGNUP_SUBMISSION_SECRET

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
  const cotOptionId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationOptions", {
      code: "cot",
      label: "Cot",
      kind: "addon",
      unit: "per_night",
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
    optionId: cotOptionId,
    enabled: true,
    priceMinor: 500,
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

/**
 * Recompute the CR-09 payload digest exactly the way the mutation does: from
 * the envelope's payload fields (never from a caller-supplied fingerprint).
 */
async function envelopeDigest(envelope: {
  eventId: Id<"events">
  source: "integration" | "internal"
  notes?: string
  booker: {
    name: string
    email: string
    phone?: string
  }
  attendees: Array<{
    attendeeKey: string
    name: string
    email?: string
    phone?: string
    gender: "male" | "female" | "mixed" | "unknown"
    location?: string
    dietaryRestrictions?: string
    roommatePreference?: string
    roommateAvoid?: string
  }>
  ticketSelections: Array<{
    attendeeKey: string
    ticketTypeId: Id<"ticketTypes"> | string
    quantity: number
  }>
  assignments: Array<{
    attendeeKey: string
    slotId: Id<"accommodationSlots"> | string
    assignmentIntent: "assign" | "skip"
  }>
  accommodationSelections: Array<{
    attendeeKey: string
    categoryId: Id<"accommodationCategories"> | string
    occupancy: "single" | "shared" | "family"
    optionSelections: Array<{
      optionKey: string
      quantity: number
      nights: number
    }>
    nights?: number
  }>
}): Promise<string> {
  return digestSubmissionEnvelope({
    eventId: String(envelope.eventId),
    source: envelope.source,
    notes: envelope.notes,
    booker: envelope.booker,
    attendees: envelope.attendees,
    ticketSelections: envelope.ticketSelections.map((selection) => ({
      attendeeKey: selection.attendeeKey,
      ticketTypeId: String(selection.ticketTypeId),
      quantity: selection.quantity,
    })),
    assignments: envelope.assignments,
    accommodationSelections: envelope.accommodationSelections.map(
      (preference) => ({
        attendeeKey: preference.attendeeKey,
        categoryId: String(preference.categoryId),
        occupancy: preference.occupancy,
        optionSelections: preference.optionSelections,
        nights: preference.nights,
      })
    ),
  })
}

async function buildEnvelope(input: {
  eventId: Id<"events">
  ticketTypeId: Id<"ticketTypes">
  attendeeKey?: string
  accommodationSelections?: Array<{
    attendeeKey: string
    categoryId: Id<"accommodationCategories">
    occupancy: "single" | "shared" | "family"
    optionSelections: Array<{
      optionKey: string
      quantity: number
      nights: number
    }>
    nights?: number
  }>
  assignments?: Array<{
    attendeeKey: string
    slotId: Id<"accommodationSlots">
    assignmentIntent: "assign" | "skip"
  }>
}) {
  const attendeeKey = input.attendeeKey ?? "attendee-1"
  const envelope = {
    eventId: input.eventId,
    source: "internal" as const,
    idempotencyKey: `idem-${Math.random().toString(36).slice(2)}`,
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
  // CR-09: the token binds the SHA-256 digest of the exact envelope payload
  // plus the idempotency key — the mutation recomputes the same digest from
  // its own arguments, exactly like the Next.js route mints after CAPTCHA.
  const payloadDigest = await envelopeDigest(envelope)
  const submissionToken = await mintSignupSubmissionToken({
    eventId: String(envelope.eventId),
    payloadDigest,
    idempotencyKey: envelope.idempotencyKey,
    secret: TEST_SIGNUP_SUBMISSION_SECRET,
  })
  return { ...envelope, submissionToken }
}

/**
 * Re-mint a token for an envelope whose payload was mutated after
 * `buildEnvelope`, so the signed digest covers the final payload.
 */
async function reMintSubmissionToken(
  envelope: Awaited<ReturnType<typeof buildEnvelope>>
): Promise<typeof envelope> {
  const payloadDigest = await envelopeDigest(envelope)
  envelope.submissionToken = await mintSignupSubmissionToken({
    eventId: String(envelope.eventId),
    payloadDigest,
    idempotencyKey: envelope.idempotencyKey,
    secret: TEST_SIGNUP_SUBMISSION_SECRET,
  })
  return envelope
}

test("valid options-only submission persists one selection row per preference with server-derived stay fields", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  const result = await t.mutation(
    api.signupSubmission.submitSignupEnvelope,
    await buildEnvelope({
      eventId: seed.eventId,
      ticketTypeId: seed.unconstrainedTicketId,
      accommodationSelections: [
        {
          attendeeKey: "attendee-1",
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          optionSelections: [],
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

  // The restore payload round-trips the preferences (omitted nights resolved
  // to the configured base stay, so the selected count survives persistence).
  expect(result.restorePayload.accommodationSelections).toEqual([
    {
      attendeeKey: "attendee-1",
      categoryId: String(seed.categoryStandardId),
      occupancy: "shared",
      nights: 2,
      optionSelections: [],
    },
  ])
})

test("the canonical amount-due loader prices newly inserted unconfirmed selection rows live", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  const result = await t.mutation(
    api.signupSubmission.submitSignupEnvelope,
    await buildEnvelope({
      eventId: seed.eventId,
      ticketTypeId: seed.unconstrainedTicketId,
      accommodationSelections: [
        {
          attendeeKey: "attendee-1",
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          optionSelections: [],
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
    await buildEnvelope({
      eventId: seed.eventId,
      ticketTypeId: seed.unconstrainedTicketId,
      accommodationSelections: [
        {
          attendeeKey: "attendee-1",
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          optionSelections: [],
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
  expect(rows[0].nightCount).toBe(2)
})

test("submission enforces ticket-constrained categories", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // Constrained ticket (superior suite) with the wrong category is rejected.
  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      await buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: seed.constrainedTicketId,
        accommodationSelections: [
          {
            attendeeKey: "attendee-1",
            categoryId: seed.categoryStandardId,
            occupancy: "shared",
            optionSelections: [],
          },
        ],
      })
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")

  // The constrained category is accepted.
  const accepted = await t.mutation(
    api.signupSubmission.submitSignupEnvelope,
    await buildEnvelope({
      eventId: seed.eventId,
      ticketTypeId: seed.constrainedTicketId,
      accommodationSelections: [
        {
          attendeeKey: "attendee-1",
          categoryId: seed.categorySuperiorId,
          occupancy: "shared",
          optionSelections: [],
        },
      ],
    })
  )
  expect(accepted.submissionId).toBeDefined()
})

test("submission rejects an unknown accommodation option and persists selected options", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      await buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: seed.unconstrainedTicketId,
        accommodationSelections: [
          {
            attendeeKey: "attendee-1",
            categoryId: seed.categoryStandardId,
            occupancy: "shared",
            optionSelections: [
              { optionKey: "does_not_exist", quantity: 1, nights: 2 },
            ],
          },
        ],
      })
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")

  const accepted = await t.mutation(
    api.signupSubmission.submitSignupEnvelope,
    await buildEnvelope({
      eventId: seed.eventId,
      ticketTypeId: seed.unconstrainedTicketId,
      accommodationSelections: [
        {
          attendeeKey: "attendee-1",
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          optionSelections: [{ optionKey: "cot", quantity: 1, nights: 2 }],
        },
      ],
    })
  )
  expect(accepted.submissionId).toBeDefined()

  // The option selection persists as a child row linked to the base row.
  const childRows = await t.query(async (ctx) => {
    return await ctx.db
      .query("orderAccommodationOptionSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", accepted.submissionId as never))
      .take(10)
  })
  expect(childRows).toHaveLength(1)
  expect(childRows[0]).toMatchObject({
    optionKey: "cot",
    quantity: 1,
    nights: 2,
  })
})

test("submission rejects stale rate combinations, duplicates, and unknown attendees", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // family occupancy has no rate for standard.
  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      await buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: seed.unconstrainedTicketId,
        accommodationSelections: [
          {
            attendeeKey: "attendee-1",
            categoryId: seed.categoryStandardId,
            occupancy: "family",
            optionSelections: [],
          },
        ],
      })
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")

  // Duplicate preference for the same attendee is rejected.
  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      await buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: seed.unconstrainedTicketId,
        accommodationSelections: [
          {
            attendeeKey: "attendee-1",
            categoryId: seed.categoryStandardId,
            occupancy: "shared",
            optionSelections: [],
          },
          {
            attendeeKey: "attendee-1",
            categoryId: seed.categoryStandardId,
            occupancy: "single",
            optionSelections: [],
          },
        ],
      })
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")

  // Preference for an attendee with no ticket selection is rejected.
  const envelopeWithUnseatedAttendee = await buildEnvelope({
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
      optionSelections: [],
    },
  ]
  // The payload changed after minting, so re-mint the token over the final
  // envelope (CR-09) — the mutation recomputes the digest from its args.
  await reMintSubmissionToken(envelopeWithUnseatedAttendee)
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
      await buildEnvelope({
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
      await buildEnvelope({
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
      await buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: seed.unconstrainedTicketId,
        accommodationSelections: [
          {
            attendeeKey: "attendee-1",
            categoryId: otherCategoryId as Id<"accommodationCategories">,
            occupancy: "shared",
            optionSelections: [],
          },
        ],
      })
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")
})

test("CR-02: submission rejects a ticket whose constrained room type cannot be resolved", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  const danglingRoomTypeId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationRoomTypes", {
      label: "Deleted Suite",
      defaultCapacity: 2,
      categoryId: seed.categorySuperiorId as never,
    })
  })
  const danglingTicketId = await t.mutation(async (ctx) => {
    const ticketId = await ctx.db.insert("ticketTypes", {
      eventId: seed.eventId as never,
      label: "Dangling-suite ticket",
      priceMinor: 2500,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: false,
      roomTypeId: danglingRoomTypeId as never,
      updatedAt: BASE_EVENT_AT,
    })
    await ctx.db.delete(danglingRoomTypeId as never)
    return ticketId
  })

  // The dangling ticket is rejected even for the room type's former category.
  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      await buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: danglingTicketId as Id<"ticketTypes">,
        accommodationSelections: [
          {
            attendeeKey: "attendee-1",
            categoryId: seed.categorySuperiorId,
            occupancy: "shared",
            optionSelections: [],
          },
        ],
      })
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")
})

test("CR-03: a configured event requires exactly one preference per ticketed attendee", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // A ticketed attendee with no preference is rejected before any write.
  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      await buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: seed.unconstrainedTicketId,
      })
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")

  // A preference for a non-ticketed attendee is rejected too: the preference
  // set must equal the ticketed attendee set exactly.
  const envelopeWithExtraPreference = await buildEnvelope({
    eventId: seed.eventId,
    ticketTypeId: seed.unconstrainedTicketId,
    accommodationSelections: [
      {
        attendeeKey: "attendee-1",
        categoryId: seed.categoryStandardId,
        occupancy: "shared",
        optionSelections: [],
      },
      {
        attendeeKey: "attendee-2",
        categoryId: seed.categoryStandardId,
        occupancy: "shared",
        optionSelections: [],
      },
    ],
  })
  envelopeWithExtraPreference.attendees = [
    ...envelopeWithExtraPreference.attendees,
    {
      attendeeKey: "attendee-2",
      name: "Attendee Two",
      email: "two@example.com",
      gender: "female" as const,
    },
  ]
  // The payload changed after minting, so re-mint the token over the final
  // envelope (CR-09) — the mutation recomputes the digest from its args.
  await reMintSubmissionToken(envelopeWithExtraPreference)
  await expect(
    t.mutation(api.signupSubmission.submitSignupEnvelope, envelopeWithExtraPreference)
  ).rejects.toThrow("SUBMISSION_CONFLICT")

  // Nothing was persisted for the rejected submissions.
  const orders = await t.query(async (ctx) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", seed.eventId))
      .take(10)
  })
  expect(orders).toHaveLength(0)
})

test("CR-03: an unconfigured event requires an empty preference list", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: "signup-no-accommodation",
      title: "No Accommodation Event",
      startsAt: BASE_EVENT_AT,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: false,
      primarySourceKind: "internal" as const,
      updatedAt: BASE_EVENT_AT,
    })
  })
  const ticketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: eventId as never,
      label: "Plain ticket",
      priceMinor: 1000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      updatedAt: BASE_EVENT_AT,
    })
  })

  // Ticket-only submission with no preferences succeeds.
  const result = await t.mutation(
    api.signupSubmission.submitSignupEnvelope,
    await buildEnvelope({
      eventId: eventId as Id<"events">,
      ticketTypeId: ticketId as Id<"ticketTypes">,
    })
  )
  expect(result.submissionId).toBeDefined()

  // A preference for the unconfigured event is rejected.
  const categoryId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationCategories", {
      code: "standard",
      label: "Standard",
      sortOrder: 1,
    })
  })
  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      await buildEnvelope({
        eventId: eventId as Id<"events">,
        ticketTypeId: ticketId as Id<"ticketTypes">,
        accommodationSelections: [
          {
            attendeeKey: "attendee-1",
            categoryId: categoryId as Id<"accommodationCategories">,
            occupancy: "shared",
            optionSelections: [],
          },
        ],
      })
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")
})

test("CR-04: duplicate ticket selections and ticketless attendees are rejected", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // Duplicate ticket selection rows for the same attendee are rejected before
  // any write, so soldCount can never double-count an attendee.
  const duplicateEnvelope = await buildEnvelope({
    eventId: seed.eventId,
    ticketTypeId: seed.unconstrainedTicketId,
  })
  duplicateEnvelope.ticketSelections = [
    duplicateEnvelope.ticketSelections[0],
    {
      attendeeKey: "attendee-1",
      ticketTypeId: seed.unconstrainedTicketId,
      quantity: 1,
    },
  ]
  duplicateEnvelope.accommodationSelections = [
    {
      attendeeKey: "attendee-1",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      optionSelections: [],
    },
  ]
  // The payload changed after minting, so re-mint the token over the final
  // envelope (CR-09) — the mutation recomputes the digest from its args.
  await reMintSubmissionToken(duplicateEnvelope)
  await expect(
    t.mutation(api.signupSubmission.submitSignupEnvelope, duplicateEnvelope)
  ).rejects.toThrow("SUBMISSION_CONFLICT")

  // An attendee without a ticket selection is rejected (no ticketless rows).
  const ticketlessEnvelope = await buildEnvelope({
    eventId: seed.eventId,
    ticketTypeId: seed.unconstrainedTicketId,
  })
  ticketlessEnvelope.attendees = [
    ticketlessEnvelope.attendees[0],
    {
      attendeeKey: "attendee-2",
      name: "Attendee Two",
      email: "two@example.com",
      gender: "female" as const,
    },
  ]
  ticketlessEnvelope.accommodationSelections = [
    {
      attendeeKey: "attendee-1",
      categoryId: seed.categoryStandardId,
      occupancy: "shared",
      optionSelections: [],
    },
  ]
  // The payload changed after minting, so re-mint the token over the final
  // envelope (CR-09) — the mutation recomputes the digest from its args.
  await reMintSubmissionToken(ticketlessEnvelope)
  await expect(
    t.mutation(api.signupSubmission.submitSignupEnvelope, ticketlessEnvelope)
  ).rejects.toThrow("SUBMISSION_CONFLICT")

  // Nothing was persisted for the rejected submissions.
  const orders = await t.query(async (ctx) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", seed.eventId))
      .take(10)
  })
  expect(orders).toHaveLength(0)
})

test("WR-05: legacy allocatedRoomTypeId is only set for explicitly constrained tickets", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // Unconstrained ticket: the attendee must NOT get a legacy placement hint,
  // even though the event exposes a default room type in a real deployment.
  const unconstrained = await t.mutation(
    api.signupSubmission.submitSignupEnvelope,
    await buildEnvelope({
      eventId: seed.eventId,
      ticketTypeId: seed.unconstrainedTicketId,
      accommodationSelections: [
        {
          attendeeKey: "attendee-1",
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          optionSelections: [],
        },
      ],
    })
  )
  const unconstrainedAttendee = await t.query(async (ctx) => {
    return await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) =>
        q.eq("orderId", unconstrained.submissionId as never)
      )
      .first()
  })
  expect(unconstrainedAttendee?.allocatedRoomTypeId).toBeUndefined()

  // Constrained ticket: the ticket's roomTypeId is stored as entitlement
  // metadata (never the event default, never the buyer's category).
  const constrained = await t.mutation(
    api.signupSubmission.submitSignupEnvelope,
    await buildEnvelope({
      eventId: seed.eventId,
      ticketTypeId: seed.constrainedTicketId,
      accommodationSelections: [
        {
          attendeeKey: "attendee-1",
          categoryId: seed.categorySuperiorId,
          occupancy: "shared",
          optionSelections: [],
        },
      ],
    })
  )
  const constrainedTicketRow = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("ticketTypes")
      .withIndex("by_eventId", (q) => q.eq("eventId", seed.eventId as never))
      .take(100)
    return rows.find((row) => row._id === seed.constrainedTicketId)
  })
  const constrainedAttendee = await t.query(async (ctx) => {
    return await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) =>
        q.eq("orderId", constrained.submissionId as never)
      )
      .first()
  })
  expect(constrainedTicketRow?.roomTypeId).toBeDefined()
  expect(constrainedAttendee?.allocatedRoomTypeId).toBe(
    constrainedTicketRow?.roomTypeId
  )
})

test("CR-07: the public mutation rejects envelopes without a valid server-issued token", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // A direct call with no token (the attack the API route used to be the
  // only guard against) is rejected before any work happens.
  const noToken = await buildEnvelope({
    eventId: seed.eventId,
    ticketTypeId: seed.unconstrainedTicketId,
    accommodationSelections: [
      {
        attendeeKey: "attendee-1",
        categoryId: seed.categoryStandardId,
        occupancy: "shared",
        optionSelections: [],
      },
    ],
  })
  noToken.submissionToken = ""
  await expect(
    t.mutation(api.signupSubmission.submitSignupEnvelope, noToken)
  ).rejects.toThrow("CAPTCHA_REQUIRED")

  // Nothing was persisted for the rejected submission.
  const orders = await t.query(async (ctx) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", seed.eventId))
      .take(10)
  })
  expect(orders).toHaveLength(0)
})

test("CR-07: forged, expired, and mis-bound submission tokens are rejected before any write", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // Tampered signature: flip the first hex char of the signature portion
  // while keeping a valid-looking expiry.
  const tampered = await buildEnvelope({
    eventId: seed.eventId,
    ticketTypeId: seed.unconstrainedTicketId,
    accommodationSelections: [
      {
        attendeeKey: "attendee-1",
        categoryId: seed.categoryStandardId,
        occupancy: "shared",
        optionSelections: [],
      },
    ],
  })
  const tamperedDotIndex = tampered.submissionToken.lastIndexOf(".")
  const flippedSignature =
    (tampered.submissionToken[0] === "0" ? "1" : "0") +
    tampered.submissionToken.slice(1, tamperedDotIndex)
  tampered.submissionToken =
    flippedSignature + tampered.submissionToken.slice(tamperedDotIndex)
  await expect(
    t.mutation(api.signupSubmission.submitSignupEnvelope, tampered)
  ).rejects.toThrow("CAPTCHA_REQUIRED")

  // Expired token: minted with a `now` before the current time beyond the
  // 5-minute TTL, so the expiry check rejects it.
  const expired = await buildEnvelope({
    eventId: seed.eventId,
    ticketTypeId: seed.unconstrainedTicketId,
    accommodationSelections: [
      {
        attendeeKey: "attendee-1",
        categoryId: seed.categoryStandardId,
        occupancy: "shared",
        optionSelections: [],
      },
    ],
  })
  expired.submissionToken = await mintSignupSubmissionToken({
    eventId: String(seed.eventId),
    payloadDigest: await envelopeDigest(expired),
    idempotencyKey: expired.idempotencyKey,
    secret: TEST_SIGNUP_SUBMISSION_SECRET,
    now: Date.now() - 10 * 60 * 1000,
  })
  await expect(
    t.mutation(api.signupSubmission.submitSignupEnvelope, expired)
  ).rejects.toThrow("CAPTCHA_REQUIRED")

  // Mis-bound token: validly signed but for a different payload (a different
  // attendee name), so the digest the mutation recomputes from this envelope
  // differs and the token must fail.
  const misBound = await buildEnvelope({
    eventId: seed.eventId,
    ticketTypeId: seed.unconstrainedTicketId,
    accommodationSelections: [
      {
        attendeeKey: "attendee-1",
        categoryId: seed.categoryStandardId,
        occupancy: "shared",
        optionSelections: [],
      },
    ],
  })
  const envelopeForOtherPayload = {
    ...misBound,
    attendees: [{ ...misBound.attendees[0], name: "Different Name" }],
  }
  const otherDigest = await envelopeDigest(envelopeForOtherPayload)
  misBound.submissionToken = await mintSignupSubmissionToken({
    eventId: String(seed.eventId),
    payloadDigest: otherDigest,
    idempotencyKey: misBound.idempotencyKey,
    secret: TEST_SIGNUP_SUBMISSION_SECRET,
  })
  await expect(
    t.mutation(api.signupSubmission.submitSignupEnvelope, misBound)
  ).rejects.toThrow("CAPTCHA_REQUIRED")

  // Nothing was persisted for any of the rejected submissions.
  const orders = await t.query(async (ctx) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", seed.eventId))
      .take(10)
  })
  expect(orders).toHaveLength(0)
})

test("CR-08: submissions cannot oversell a ticket past its maxQuantity", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // A ticket whose soldCount already equals maxQuantity is rejected with
  // TICKET_UNAVAILABLE even though its availability state is still
  // "selectable" — capacity alone makes it unsellable.
  const soldOutTicketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: seed.eventId as never,
      label: "Sold-out-by-capacity ticket",
      priceMinor: 1500,
      maxQuantity: 1,
      soldCount: 1,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      updatedAt: BASE_EVENT_AT,
    })
  })
  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      await buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: soldOutTicketId as Id<"ticketTypes">,
        accommodationSelections: [
          {
            attendeeKey: "attendee-1",
            categoryId: seed.categoryStandardId,
            occupancy: "shared",
            optionSelections: [],
          },
        ],
      })
    )
  ).rejects.toThrow("TICKET_UNAVAILABLE")

  // A capacity-1 ticket accepts exactly one submission; a SECOND buyer with a
  // different envelope is rejected inside the transaction before any
  // soldCount/order write, so the counter can never overshoot the configured
  // maximum. (The second envelope differs in attendee — an identical payload
  // would be served as an idempotent replay of the first submission.)
  const capacityOneTicketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: seed.eventId as never,
      label: "Capacity-one ticket",
      priceMinor: 1500,
      maxQuantity: 1,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      updatedAt: BASE_EVENT_AT,
    })
  })
  const first = await t.mutation(
    api.signupSubmission.submitSignupEnvelope,
    await buildEnvelope({
      eventId: seed.eventId,
      ticketTypeId: capacityOneTicketId as Id<"ticketTypes">,
      accommodationSelections: [
        {
          attendeeKey: "attendee-1",
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          optionSelections: [],
        },
      ],
    })
  )
  expect(first.submissionId).toBeDefined()

  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      await buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: capacityOneTicketId as Id<"ticketTypes">,
        attendeeKey: "attendee-2",
        accommodationSelections: [
          {
            attendeeKey: "attendee-2",
            categoryId: seed.categoryStandardId,
            occupancy: "shared",
            optionSelections: [],
          },
        ],
      })
    )
  ).rejects.toThrow("TICKET_UNAVAILABLE")

  // The capacity-1 ticket's soldCount ended at exactly 1, and only the first
  // order exists.
  const capacityTicketRow = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("ticketTypes")
      .withIndex("by_eventId", (q) => q.eq("eventId", seed.eventId as never))
      .take(100)
    return rows.find((row) => row._id === capacityOneTicketId)
  })
  expect(capacityTicketRow?.soldCount).toBe(1)
  const orders = await t.query(async (ctx) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", seed.eventId))
      .take(10)
  })
  expect(orders).toHaveLength(1)
})

test("CR-09: a captured token cannot be replayed with a different payload", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  const envelope = await buildEnvelope({
    eventId: seed.eventId,
    ticketTypeId: seed.unconstrainedTicketId,
    accommodationSelections: [
      {
        attendeeKey: "attendee-1",
        categoryId: seed.categoryStandardId,
        occupancy: "shared",
        optionSelections: [],
      },
    ],
  })

  // Replay the SAME token + idempotency key with a changed booker name: the
  // mutation recomputes the digest from the actual args, which no longer
  // matches the signed digest, so it fails closed before any read/write.
  const replayed = { ...envelope }
  replayed.booker = { ...envelope.booker, name: "Attacker Booker" }
  await expect(
    t.mutation(api.signupSubmission.submitSignupEnvelope, replayed)
  ).rejects.toThrow("CAPTCHA_REQUIRED")

  const orders = await t.query(async (ctx) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", seed.eventId))
      .take(10)
  })
  expect(orders).toHaveLength(0)
})

test("CR-09: a captured token cannot be replayed with a new idempotency key", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  const envelope = await buildEnvelope({
    eventId: seed.eventId,
    ticketTypeId: seed.unconstrainedTicketId,
    accommodationSelections: [
      {
        attendeeKey: "attendee-1",
        categoryId: seed.categoryStandardId,
        occupancy: "shared",
        optionSelections: [],
      },
    ],
  })

  // Same token + same payload but a fresh idempotency key: the signed key is
  // part of the token message, so verification fails before any write.
  const replayed = { ...envelope, idempotencyKey: "attacker-key-2" }
  await expect(
    t.mutation(api.signupSubmission.submitSignupEnvelope, replayed)
  ).rejects.toThrow("CAPTCHA_REQUIRED")

  const orders = await t.query(async (ctx) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", seed.eventId))
      .take(10)
  })
  expect(orders).toHaveLength(0)
})

test("CR-09: an exact retry (same payload, key, and token) returns the existing submission", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  const envelope = await buildEnvelope({
    eventId: seed.eventId,
    ticketTypeId: seed.unconstrainedTicketId,
    accommodationSelections: [
      {
        attendeeKey: "attendee-1",
        categoryId: seed.categoryStandardId,
        occupancy: "shared",
        optionSelections: [],
      },
    ],
  })

  const first = await t.mutation(
    api.signupSubmission.submitSignupEnvelope,
    envelope
  )
  // A legitimate retry of the identical envelope reuses the idempotency
  // record instead of creating a second order or re-incrementing soldCount.
  const second = await t.mutation(
    api.signupSubmission.submitSignupEnvelope,
    { ...envelope }
  )
  expect(second.submissionId).toBe(first.submissionId)

  const orders = await t.query(async (ctx) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", seed.eventId))
      .take(10)
  })
  expect(orders).toHaveLength(1)
})

test("CR-10: a submission with two attendees sharing one ticket with one remaining place is rejected", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // One remaining place: maxQuantity 2, soldCount 1, still "selectable".
  const nearlyFullTicketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: seed.eventId as never,
      label: "Nearly-full ticket",
      priceMinor: 1500,
      maxQuantity: 2,
      soldCount: 1,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      updatedAt: BASE_EVENT_AT,
    })
  })

  const envelope = await buildEnvelope({
    eventId: seed.eventId,
    ticketTypeId: nearlyFullTicketId as Id<"ticketTypes">,
    accommodationSelections: [
      {
        attendeeKey: "attendee-1",
        categoryId: seed.categoryStandardId,
        occupancy: "shared",
        optionSelections: [],
      },
      {
        attendeeKey: "attendee-2",
        categoryId: seed.categoryStandardId,
        occupancy: "shared",
        optionSelections: [],
      },
    ],
  })
  envelope.attendees = [
    envelope.attendees[0],
    {
      attendeeKey: "attendee-2",
      name: "Attendee Two",
      email: "two@example.com",
      gender: "female" as const,
    },
  ]
  envelope.ticketSelections = [
    envelope.ticketSelections[0],
    {
      attendeeKey: "attendee-2",
      ticketTypeId: nearlyFullTicketId as Id<"ticketTypes">,
      quantity: 1,
    },
  ]
  // The payload changed after minting, so re-mint the token over the final
  // envelope (CR-09) — the mutation recomputes the digest from its args.
  await reMintSubmissionToken(envelope)

  await expect(
    t.mutation(api.signupSubmission.submitSignupEnvelope, envelope)
  ).rejects.toThrow("TICKET_UNAVAILABLE")

  const orders = await t.query(async (ctx) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", seed.eventId))
      .take(10)
  })
  expect(orders).toHaveLength(0)
})

test("extended stay: a chosen extra night is validated, persisted, and restored", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // Enable the night-before extension and add an accommodation-included
  // ticket so the base 2-night stay is covered and one extra night is charged.
  await t.mutation(api.accommodation.upsertEventAccommodationConfig, {
    eventId: seed.eventId,
    baseCheckInAt: BASE_EVENT_AT - 2 * DAY_MS,
    baseCheckOutAt: BASE_EVENT_AT,
    allowExtendedStayBefore: true,
    allowExtendedStayAfter: false,
    allowExtendedStayBoth: false,
    breakfastIncluded: true,
  })
  const includedTicketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: seed.eventId as never,
      label: "Included-stay ticket",
      priceMinor: 2000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: true,
      updatedAt: BASE_EVENT_AT,
    })
  })

  const result = await t.mutation(
    api.signupSubmission.submitSignupEnvelope,
    await buildEnvelope({
      eventId: seed.eventId,
      ticketTypeId: includedTicketId as Id<"ticketTypes">,
      accommodationSelections: [
        {
          attendeeKey: "attendee-1",
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          optionSelections: [],
          nights: 3,
        },
      ],
    })
  )

  // The resolved selected night count is persisted on the order row.
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
    nightCount: 3,
    checkInAt: BASE_EVENT_AT - 2 * DAY_MS,
    checkOutAt: BASE_EVENT_AT,
  })

  // The restore payload round-trips the selected nights.
  expect(result.restorePayload.accommodationSelections).toEqual([
    {
      attendeeKey: "attendee-1",
      categoryId: String(seed.categoryStandardId),
      occupancy: "shared",
      nights: 3,
      optionSelections: [],
    },
  ])

  // The canonical loader prices only the charged night beyond the covered
  // base: ticket €20 + 1 extra night × €30 = €50.
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
  expect(breakdown?.amountDueMinor).toBe(5000)
  expect(breakdown?.accommodationLines).toEqual([
    {
      kind: "accommodation",
      label: "Accommodation",
      nights: 1,
      ratePerNightMinor: 3000,
      chargeMinor: 3000,
    },
  ])
})

test("extended stay: below-base, fractional, over-cap, and disabled nights are rejected by submission", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  await t.mutation(api.accommodation.upsertEventAccommodationConfig, {
    eventId: seed.eventId,
    baseCheckInAt: BASE_EVENT_AT - 2 * DAY_MS,
    baseCheckOutAt: BASE_EVENT_AT,
    allowExtendedStayBefore: true,
    allowExtendedStayAfter: false,
    allowExtendedStayBoth: false,
    breakfastIncluded: true,
  })
  const includedTicketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: seed.eventId as never,
      label: "Included-stay ticket",
      priceMinor: 2000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: true,
      updatedAt: BASE_EVENT_AT,
    })
  })

  const preferenceFor = (nights: number) => ({
    attendeeKey: "attendee-1",
    categoryId: seed.categoryStandardId,
    occupancy: "shared" as const,
    optionSelections: [],
    nights,
  })

  // Below the configured base fails.
  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      await buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: includedTicketId as Id<"ticketTypes">,
        accommodationSelections: [preferenceFor(1)],
      })
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")

  // Fractional nights fail — only finite whole numbers are accepted.
  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      await buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: includedTicketId as Id<"ticketTypes">,
        accommodationSelections: [preferenceFor(2.5)],
      })
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")

  // Over the bounded allowance (base 2 + 7 extra = 9) fails.
  await expect(
    t.mutation(
      api.signupSubmission.submitSignupEnvelope,
      await buildEnvelope({
        eventId: seed.eventId,
        ticketTypeId: includedTicketId as Id<"ticketTypes">,
        accommodationSelections: [preferenceFor(10)],
      })
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")

  // No extension flag enabled: the seeded event has all flags false, so an
  // extra night is rejected with the same rule set as the quote.
  const disabledEvent = fresh().withIdentity(adminIdentity)
  const disabledSeed = await createConfiguredEvent(disabledEvent)
  await expect(
    disabledEvent.mutation(
      api.signupSubmission.submitSignupEnvelope,
      await buildEnvelope({
        eventId: disabledSeed.eventId,
        ticketTypeId: disabledSeed.unconstrainedTicketId,
        accommodationSelections: [
          {
            attendeeKey: "attendee-1",
            categoryId: disabledSeed.categoryStandardId,
            occupancy: "shared",
            optionSelections: [],
            nights: 3,
          },
        ],
      })
    )
  ).rejects.toThrow("SUBMISSION_CONFLICT")

  // Nothing was persisted for any rejected submission on the extended event.
  const orders = await t.query(async (ctx) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", seed.eventId))
      .take(10)
  })
  expect(orders).toHaveLength(0)
})
