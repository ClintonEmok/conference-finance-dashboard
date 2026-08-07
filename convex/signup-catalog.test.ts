/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"

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
  constrainedRoomTypeId: Id<"accommodationRoomTypes">
}

async function createConfiguredEvent(
  t: TestConvexForDataModel<GenericDataModel>
): Promise<SeedContext> {
  const eventId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: "signup-catalog-event",
      title: "Signup Catalog Event",
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

  // Stay: two nights before the event, breakfast included.
  await t.mutation(api.accommodation.upsertEventAccommodationConfig, {
    eventId,
    baseCheckInAt: BASE_EVENT_AT - 2 * DAY_MS,
    baseCheckOutAt: BASE_EVENT_AT,
    breakfastIncluded: true,
  })
  // Rates: standard/shared €30, standard/single €40, superior/shared €45.
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId,
    categoryId: categoryStandardId,
    occupancy: "shared",
    pricePerPersonMinor: 3000,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId,
    categoryId: categoryStandardId,
    occupancy: "single",
    pricePerPersonMinor: 4000,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId,
    categoryId: categorySuperiorId,
    occupancy: "shared",
    pricePerPersonMinor: 4500,
  })
  // Options: cot €5/unit/night (no age-band eligibility).
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
    constrainedRoomTypeId: constrainedRoomTypeId as Id<"accommodationRoomTypes">,
  }
}

test("public catalog exposes event-configured accommodation choices and ticket entitlement", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  const catalog = await t.query(api.signupCatalog.getPublicSignupCatalog, {})
  const event = catalog.find((entry) => entry.eventId === seed.eventId)

  expect(event).toBeDefined()
  expect(event?.accommodation.config).toMatchObject({
    baseCheckInAt: BASE_EVENT_AT - 2 * DAY_MS,
    baseCheckOutAt: BASE_EVENT_AT,
    nightCount: 2,
    breakfastIncluded: true,
    // Extended-stay policy is exposed for the buyer surfaces; disabled by
    // default in this fixture.
    allowExtendedStayBefore: false,
    allowExtendedStayAfter: false,
    allowExtendedStayBoth: false,
  })

  const standard = event?.accommodation.activeCategories.find(
    (category) => category.categoryId === seed.categoryStandardId
  )
  expect(standard?.rates).toEqual(
    expect.arrayContaining([
      { occupancy: "shared", pricePerPersonMinor: 3000 },
      { occupancy: "single", pricePerPersonMinor: 4000 },
    ])
  )

  expect(event?.accommodation.options).toEqual(
    expect.arrayContaining([
      { optionKey: "cot", label: "Cot", priceMinor: 500 },
    ])
  )

  const constrainedTicket = event?.tickets.find(
    (ticket) => ticket.ticketTypeId === seed.constrainedTicketId
  )
  expect(constrainedTicket?.roomTypeId).toBe(seed.constrainedRoomTypeId)
  expect(constrainedTicket?.roomTypeCategoryId).toBe(seed.categorySuperiorId)
  expect(constrainedTicket?.roomTypeCategoryCode).toBe("superior")

  const unconstrainedTicket = event?.tickets.find(
    (ticket) => ticket.ticketTypeId === seed.unconstrainedTicketId
  )
  expect(unconstrainedTicket?.roomTypeCategoryId).toBeUndefined()
})

test("quote returns canonical ticket and accommodation lines and totals", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  const quote = await t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
    eventId: seed.eventId,
    attendees: [
      {
        attendeeKey: "a1",
        ticketTypeId: seed.unconstrainedTicketId,
        categoryId: seed.categoryStandardId,
        occupancy: "shared",
        optionSelections: [],
      },
    ],
  })

  expect(quote).toMatchObject({
    eventId: seed.eventId,
    currency: "EUR",
    breakfastIncluded: true,
    ticketTotalMinor: 2000,
    // 2 nights × €30 shared standard.
    accommodationTotalMinor: 6000,
    totalDueMinor: 8000,
  })
  expect(quote.attendees[0]).toMatchObject({
    attendeeKey: "a1",
    ticketLabel: "Unconstrained ticket",
    ticketPriceMinor: 2000,
    categoryCode: "standard",
    occupancy: "shared",
    accommodationTotalMinor: 6000,
    amountDueMinor: 8000,
  })
  expect(quote.attendees[0].lines).toEqual([
    {
      kind: "accommodation",
      label: "Accommodation",
      nights: 2,
      ratePerNightMinor: 3000,
      chargeMinor: 6000,
    },
  ])
})

test("quote rejects a ticket/category mismatch and accepts the constrained category", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  const mismatched = t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.constrainedTicketId,
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          optionSelections: [],
        },
      ],
    }
  )
  await expect(mismatched).rejects.toThrow("QUOTE_INVALID")
  await expect(mismatched).rejects.toThrow("not allowed for this ticket")

  const accepted = await t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.constrainedTicketId,
          categoryId: seed.categorySuperiorId,
          occupancy: "shared",
          optionSelections: [],
        },
      ],
    }
  )
  expect(accepted.attendees[0].categoryCode).toBe("superior")
  expect(accepted.accommodationTotalMinor).toBe(9000) // 2 × €45
})

test("quote rejects an unknown accommodation option and prices a selected option", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  const unknownOption = t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.unconstrainedTicketId,
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          optionSelections: [
            { optionKey: "does_not_exist", quantity: 1, nights: 2 },
          ],
        },
      ],
    }
  )
  await expect(unknownOption).rejects.toThrow("QUOTE_INVALID")
  await expect(unknownOption).rejects.toThrow("not enabled")

  const eligible = await t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.unconstrainedTicketId,
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          optionSelections: [{ optionKey: "cot", quantity: 1, nights: 2 }],
        },
      ],
    }
  )
  expect(eligible.attendees[0].lines).toEqual(
    expect.arrayContaining([
      {
        kind: "option",
        optionKey: "cot",
        label: "Cot",
        nights: 2,
        quantity: 1,
        ratePerNightMinor: 500,
        chargeMinor: 1000,
      },
    ])
  )
  expect(eligible.accommodationTotalMinor).toBe(7000) // 6000 base + 1000 cot
})

test("quote rejects an unconfigured rate/occupancy combination and unknown categories", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // family occupancy has no configured rate for standard.
  const noRate = t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
    eventId: seed.eventId,
    attendees: [
      {
        attendeeKey: "a1",
        ticketTypeId: seed.unconstrainedTicketId,
        categoryId: seed.categoryStandardId,
        occupancy: "family",
        optionSelections: [],
      },
    ],
  })
  await expect(noRate).rejects.toThrow("QUOTE_INVALID")

  // A catalog category with no rate rows for this event is not active.
  const orphanCategoryId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationCategories", {
      code: "family",
      label: "Family",
      sortOrder: 3,
    })
  })
  const unknownCategory = t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.unconstrainedTicketId,
          categoryId: orphanCategoryId as Id<"accommodationCategories">,
          occupancy: "shared",
          optionSelections: [],
        },
      ],
    }
  )
  await expect(unknownCategory).rejects.toThrow("QUOTE_INVALID")
  await expect(unknownCategory).rejects.toThrow("not offered")
})

test("quote keeps an unconfigured event at an honest zero accommodation contribution", async () => {
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

  const quote = await t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: eventId as Id<"events">,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: ticketId as Id<"ticketTypes">,
          optionSelections: [],
        },
      ],
    }
  )

  expect(quote).toMatchObject({
    breakfastIncluded: false,
    ticketTotalMinor: 1000,
    accommodationTotalMinor: 0,
    totalDueMinor: 1000,
  })
  expect(quote.attendees[0].lines).toEqual([])

  // Supplying a category for an unconfigured event is invalid.
  const orphanCategoryId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationCategories", {
      code: "family",
      label: "Family",
      sortOrder: 3,
    })
  })
  await expect(
    t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
      eventId: eventId as Id<"events">,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: ticketId as Id<"ticketTypes">,
          categoryId: orphanCategoryId as Id<"accommodationCategories">,
          occupancy: "shared",
          optionSelections: [],
        },
      ],
    })
  ).rejects.toThrow("QUOTE_INVALID")
})

test("CR-01: a disabled event with stale config/rate rows exposes no choices and rejects preferences", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: "signup-disabled-accommodation",
      title: "Disabled Accommodation Event",
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
  const categoryId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationCategories", {
      code: "standard",
      label: "Standard",
      sortOrder: 1,
    })
  })
  // Stale configuration rows remain: the event-level flag must still win.
  await t.mutation(api.accommodation.upsertEventAccommodationConfig, {
    eventId: eventId as Id<"events">,
    baseCheckInAt: BASE_EVENT_AT - 2 * DAY_MS,
    baseCheckOutAt: BASE_EVENT_AT,
    breakfastIncluded: true,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId: eventId as Id<"events">,
    categoryId: categoryId as Id<"accommodationCategories">,
    occupancy: "shared",
    pricePerPersonMinor: 3000,
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

  // Catalog: the disabled event exposes no accommodation choices at all.
  const catalog = await t.query(api.signupCatalog.getPublicSignupCatalog, {})
  const event = catalog.find((entry) => entry.eventId === eventId)
  expect(event?.accommodation.config).toBeNull()
  expect(event?.accommodation.activeCategories).toEqual([])
  expect(event?.accommodation.options).toEqual([])
  expect(event?.accommodation.eligible).toBe(false)

  // Quote: a supplied preference is rejected even though stale rows exist.
  await expect(
    t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
      eventId: eventId as Id<"events">,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: ticketId as Id<"ticketTypes">,
          categoryId: categoryId as Id<"accommodationCategories">,
          occupancy: "shared",
          optionSelections: [],
        },
      ],
    })
  ).rejects.toThrow("QUOTE_INVALID")

  // Quote: a ticket-only quote remains valid at zero accommodation.
  const quote = await t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: eventId as Id<"events">,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: ticketId as Id<"ticketTypes">,
          optionSelections: [],
        },
      ],
    }
  )
  expect(quote).toMatchObject({
    accommodationTotalMinor: 0,
    totalDueMinor: 1000,
  })
})

test("CR-02: a dangling constrained room type fails closed instead of becoming unconstrained", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // Create a room type, attach it to a ticket, then delete the room type so
  // ticketTypes.roomTypeId dangles exactly like a stale admin change would.
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

  // The catalog must not advertise a room-type category for the dangling
  // ticket (no resolvable entitlement).
  const catalog = await t.query(api.signupCatalog.getPublicSignupCatalog, {})
  const event = catalog.find((entry) => entry.eventId === seed.eventId)
  const danglingTicket = event?.tickets.find(
    (ticket) => ticket.ticketTypeId === danglingTicketId
  )
  expect(danglingTicket?.roomTypeCategoryId).toBeUndefined()

  // The quote must reject the dangling ticket rather than treat it as
  // unconstrained and accept any active category.
  await expect(
    t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: danglingTicketId as Id<"ticketTypes">,
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          optionSelections: [],
        },
      ],
    })
  ).rejects.toThrow("QUOTE_INVALID")
  await expect(
    t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: danglingTicketId as Id<"ticketTypes">,
          categoryId: seed.categorySuperiorId,
          occupancy: "shared",
          optionSelections: [],
        },
      ],
    })
  ).rejects.toThrow("room type is no longer available")
})

test("CR-08: a ticket at maxQuantity is not advertised as selectable and cannot be quoted", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  const soldOutTicketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: seed.eventId as never,
      label: "Sold-out-by-capacity ticket",
      priceMinor: 1500,
      maxQuantity: 2,
      soldCount: 2,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      updatedAt: BASE_EVENT_AT,
    })
  })

  // Catalog: the capacity-full ticket is exposed as non-selectable with the
  // sold_out reason, so the UI can never present it as a purchase option.
  const catalog = await t.query(api.signupCatalog.getPublicSignupCatalog, {})
  const event = catalog.find((entry) => entry.eventId === seed.eventId)
  const soldOutTicket = event?.tickets.find(
    (ticket) => ticket.ticketTypeId === soldOutTicketId
  )
  expect(soldOutTicket?.selectable).toBe(false)
  expect(soldOutTicket?.reason).toBe("sold_out")

  // Quote: the same capacity rule rejects the ticket so a buyer can never
  // reach the review step with a ticket the submission path would reject.
  await expect(
    t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: soldOutTicketId as Id<"ticketTypes">,
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          optionSelections: [],
        },
      ],
    })
  ).rejects.toThrow("maximum quantity")
})

test("CR-10: a quote with two attendees sharing one ticket with one remaining place is rejected", async () => {
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

  // A single attendee requesting the ticket still fits (1 + 1 <= 2) and is
  // quoted normally.
  const single = await t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: nearlyFullTicketId as Id<"ticketTypes">,
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          optionSelections: [],
        },
      ],
    }
  )
  expect(single.attendees[0].ticketTypeId).toBe(nearlyFullTicketId)

  // Two attendees sharing the ticket exceed the one remaining place (1 + 2 >
  // 2): the quote must reject the request the submission path would reject,
  // so the UI can never display a valid-looking quote that cannot submit.
  await expect(
    t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: nearlyFullTicketId as Id<"ticketTypes">,
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          optionSelections: [],
        },
        {
          attendeeKey: "a2",
          ticketTypeId: nearlyFullTicketId as Id<"ticketTypes">,
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          optionSelections: [],
        },
      ],
    })
  ).rejects.toThrow("maximum quantity")
})

test("extended stay: an included ticket with base+1 nights is quoted as one server-priced night", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // Enable the night-before extension on the seeded event and add an
  // accommodation-included ticket, mirroring the production divine-conference
  // model: the base 2-night stay is covered, one extra night is charged.
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

  // Buyer selects one extra night (total 3): only the charged night beyond
  // the covered base is priced — €30 standard/shared.
  const extended = await t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: includedTicketId as Id<"ticketTypes">,
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          optionSelections: [],
          nights: 3,
        },
      ],
    }
  )
  expect(extended.attendees[0]).toMatchObject({
    accommodationIncluded: true,
    baseNights: 2,
    accommodationTotalMinor: 3000,
  })
  expect(extended.attendees[0].lines).toEqual([
    {
      kind: "accommodation",
      label: "Accommodation",
      nights: 1,
      ratePerNightMinor: 3000,
      chargeMinor: 3000,
    },
  ])
  expect(extended.accommodationTotalMinor).toBe(3000)
  expect(extended.totalDueMinor).toBe(5000) // 2000 ticket + 3000 extra night

  // Omitted nights keep quoting the base stay at zero charge for the included
  // ticket: the base nights are covered, so no line and no charge.
  const baseOnly = await t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: includedTicketId as Id<"ticketTypes">,
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          optionSelections: [],
        },
      ],
    }
  )
  expect(baseOnly.attendees[0]).toMatchObject({
    baseNights: 2,
    accommodationTotalMinor: 0,
  })
  expect(baseOnly.attendees[0].lines).toEqual([])
  expect(baseOnly.totalDueMinor).toBe(2000)
})

test("extended stay: below-base, fractional, and over-cap nights are rejected by the quote", async () => {
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

  const baseAttendee = {
    attendeeKey: "a1",
    ticketTypeId: includedTicketId as Id<"ticketTypes">,
    categoryId: seed.categoryStandardId,
    occupancy: "shared" as const,
    optionSelections: [],
  }

  // Below the configured base (2 nights) fails.
  await expect(
    t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
      eventId: seed.eventId,
      attendees: [{ ...baseAttendee, nights: 1 }],
    })
  ).rejects.toThrow("cannot be fewer than the 2-night base stay")

  // Fractional nights fail — only finite whole numbers are accepted.
  await expect(
    t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
      eventId: seed.eventId,
      attendees: [{ ...baseAttendee, nights: 2.5 }],
    })
  ).rejects.toThrow("must be a whole number")

  // Over the bounded allowance (base 2 + 7 extra = 9) fails even though the
  // extension is enabled.
  await expect(
    t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
      eventId: seed.eventId,
      attendees: [{ ...baseAttendee, nights: 10 }],
    })
  ).rejects.toThrow("exceed the allowed maximum of 9 nights")
})

test("extended stay: a nights request is rejected when no extension flag is enabled", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // The seeded event has all three extended-stay flags disabled; an extra
  // night beyond the base must be rejected by the same resolver the
  // submission path uses.
  await expect(
    t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.unconstrainedTicketId,
          categoryId: seed.categoryStandardId,
          occupancy: "shared",
          optionSelections: [],
          nights: 3,
        },
      ],
    })
  ).rejects.toThrow("does not permit an extended stay")

  // A nights value for an unconfigured event is rejected outright.
  const plainEventId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: "signup-no-accommodation-nights",
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
  const plainTicketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: plainEventId as never,
      label: "Plain ticket",
      priceMinor: 1000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      updatedAt: BASE_EVENT_AT,
    })
  })
  await expect(
    t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
      eventId: plainEventId as Id<"events">,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: plainTicketId as Id<"ticketTypes">,
          optionSelections: [],
          nights: 2,
        },
      ],
    })
  ).rejects.toThrow("does not offer configured accommodation")
})
