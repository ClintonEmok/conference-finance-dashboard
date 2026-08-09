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

  // Stay: two nights before the event, breakfast included. The event's
  // included-stay category defaults to Standard, mirroring the divine
  // migration's effect.
  await t.mutation(api.accommodation.upsertEventAccommodationConfig, {
    eventId,
    baseCheckInAt: BASE_EVENT_AT - 2 * DAY_MS,
    baseCheckOutAt: BASE_EVENT_AT,
    breakfastIncluded: true,
    defaultCategoryId: categoryStandardId,
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
  // Options: cot €5/unit/night (no age-band eligibility) and the
  // superior_upgrade included-stay upgrade at €10/person/night.
  await t.mutation(api.accommodation.upsertEventAccommodationOption, {
    eventId,
    optionId: cotOptionId,
    enabled: true,
    priceMinor: 500,
  })
  const superiorUpgradeOptionId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("accommodationOptions", {
      code: "superior_upgrade",
      label: "Superior upgrade",
      kind: "upgrade",
      unit: "per_night",
    })
  })
  await t.mutation(api.accommodation.upsertEventAccommodationOption, {
    eventId,
    optionId: superiorUpgradeOptionId as Id<"accommodationOptions">,
    enabled: true,
    priceMinor: 1000,
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
  })
  // Server-resolved night-before display rates: Standard at the included
  // category's occupancy rates, Superior + €10 (copy only).
  expect(event?.accommodation.nightBefore).toEqual({
    standard: { single: 4000, shared: 3000 },
    superior: { single: 5000, shared: 4000 },
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
      {
        optionKey: "superior_upgrade",
        label: "Superior upgrade",
        priceMinor: 1000,
      },
    ])
  )

  const constrainedTicket = event?.tickets.find(
    (ticket) => ticket.ticketTypeId === seed.constrainedTicketId
  )
  expect(constrainedTicket?.roomTypeId).toBe(seed.constrainedRoomTypeId)
  expect(constrainedTicket?.roomTypeCategoryId).toBe(seed.categorySuperiorId)
  expect(constrainedTicket?.roomTypeCategoryCode).toBe("superior")
  expect(constrainedTicket?.occupancy).toBe("shared")

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

test("quote resolves the included stay to Standard for every ticket and rejects category-dependent payloads", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // A client category that does not match the server-resolved included stay
  // (Standard) is rejected — the buyer never chooses a category.
  const mismatched = t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.unconstrainedTicketId,
          categoryId: seed.categorySuperiorId,
          occupancy: "shared",
          optionSelections: [],
        },
      ],
    }
  )
  await expect(mismatched).rejects.toThrow("QUOTE_INVALID")
  await expect(mismatched).rejects.toThrow("one room category")

  // The ticket's constrained room type (Superior) stays admin-allocation
  // metadata only: the buyer-facing included stay still resolves to Standard,
  // so a Superior categoryId is equally rejected for that ticket.
  await expect(
    t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
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
    })
  ).rejects.toThrow("QUOTE_INVALID")

  // No categoryId or occupancy: the server resolves the included stay to
  // Standard and derives Shared from the ticket's room capacity (2 × €30 =
  // €60).
  const accepted = await t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.constrainedTicketId,
          optionSelections: [],
        },
      ],
    }
  )
  expect(accepted.attendees[0]).toMatchObject({
    categoryCode: "standard",
    categoryLabel: "Standard",
    occupancy: "shared",
  })
  expect(accepted.accommodationTotalMinor).toBe(6000) // 2 × €30 standard
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

test("quote rejects family occupancy and unknown categories under the simplified contract", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createConfiguredEvent(t)

  // Only single/shared occupancy is offered for the included stay.
  const noRate = t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
    eventId: seed.eventId,
    attendees: [
      {
        attendeeKey: "a1",
        ticketTypeId: seed.unconstrainedTicketId,
        occupancy: "family",
        optionSelections: [],
      },
    ],
  })
  await expect(noRate).rejects.toThrow("QUOTE_INVALID")
  await expect(noRate).rejects.toThrow("single and shared occupancy")

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
  await expect(unknownCategory).rejects.toThrow("one room category")
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

/**
 * Divine-like fixture: Standard single €90 / shared €60 (the included-stay
 * occupancy rates), cot €10/unit/night, superior_upgrade €10/person/night,
 * and a €250 accommodation-included ticket — the production divine-conference
 * model the simplified contract targets.
 */
async function createDivineLikeEvent(
  t: TestConvexForDataModel<GenericDataModel>
): Promise<SeedContext & { includedTicketId: Id<"ticketTypes"> }> {
  const seed = await createConfiguredEvent(t)
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId: seed.eventId,
    categoryId: seed.categoryStandardId,
    occupancy: "shared",
    pricePerPersonMinor: 6000,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId: seed.eventId,
    categoryId: seed.categoryStandardId,
    occupancy: "single",
    pricePerPersonMinor: 9000,
  })
  await t.mutation(api.accommodation.upsertEventAccommodationRate, {
    eventId: seed.eventId,
    categoryId: seed.categorySuperiorId,
    occupancy: "shared",
    pricePerPersonMinor: 4500,
  })
  // Cot at €10/unit/night (replaces the €5 fixture price).
  const cotOption = await t.mutation(async (ctx) => {
    return await ctx.db
      .query("accommodationOptions")
      .withIndex("by_code", (q) => q.eq("code", "cot"))
      .first()
  })
  if (cotOption) {
    await t.mutation(api.accommodation.upsertEventAccommodationOption, {
      eventId: seed.eventId,
      optionId: cotOption._id as Id<"accommodationOptions">,
      enabled: true,
      priceMinor: 1000,
    })
  }
  const includedTicketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: seed.eventId as never,
      label: "Included-stay ticket",
      priceMinor: 25000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: true,
      updatedAt: BASE_EVENT_AT,
    })
  })
  return {
    ...seed,
    includedTicketId: includedTicketId as Id<"ticketTypes">,
  }
}

test("night before: the Standard level quotes exactly one server-priced night at the included rate", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createDivineLikeEvent(t)

  // No categoryId: the included stay resolves to Standard. No night-before
  // means the included 2-night stay is covered by the ticket at zero charge.
  const baseOnly = await t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.includedTicketId,
          occupancy: "shared",
          optionSelections: [],
        },
      ],
    }
  )
  expect(baseOnly.attendees[0]).toMatchObject({
    categoryCode: "standard",
    accommodationIncluded: true,
    baseNights: 2,
    accommodationTotalMinor: 0,
  })
  expect(baseOnly.attendees[0].lines).toEqual([])

  // Night-before Standard: one charged night at the Standard shared rate
  // (€60). Single occupancy prices the same night at €90.
  const sharedStandard = await t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.includedTicketId,
          occupancy: "shared",
          nightBeforeLevel: "standard",
          optionSelections: [],
        },
      ],
    }
  )
  expect(sharedStandard.attendees[0].nightBeforeLevel).toBe("standard")
  expect(sharedStandard.attendees[0].lines).toEqual([
    {
      kind: "accommodation",
      label: "Accommodation",
      nights: 1,
      ratePerNightMinor: 6000,
      chargeMinor: 6000,
    },
  ])
  expect(sharedStandard.accommodationTotalMinor).toBe(6000)
  expect(sharedStandard.totalDueMinor).toBe(31000) // 25000 + 6000

  const singleStandard = await t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.includedTicketId,
          occupancy: "single",
          nightBeforeLevel: "standard",
          nightBeforeOccupancy: "shared",
          optionSelections: [],
        },
      ],
    }
  )
  expect(singleStandard.attendees[0].nightBeforeOccupancy).toBe("shared")
  expect(singleStandard.accommodationTotalMinor).toBe(6000)
})

test("night before: the Superior level adds the fixed premium and stays independent of the included stay", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createDivineLikeEvent(t)

  // Night-before Superior (shared): €60 Standard night + €10 premium = €70.
  const superior = await t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.includedTicketId,
          occupancy: "shared",
          nightBeforeLevel: "superior",
          optionSelections: [],
        },
      ],
    }
  )
  expect(superior.attendees[0].lines).toEqual([
    {
      kind: "accommodation",
      label: "Accommodation",
      nights: 1,
      ratePerNightMinor: 6000,
      chargeMinor: 6000,
    },
    {
      kind: "option",
      optionKey: "night_before_superior",
      label: "Night before · Superior",
      nights: 1,
      quantity: 1,
      ratePerNightMinor: 1000,
      chargeMinor: 1000,
    },
  ])
  expect(superior.accommodationTotalMinor).toBe(7000)

  // Single occupancy: €90 + €10 = €100.
  const superiorSingle = await t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.includedTicketId,
          occupancy: "single",
          nightBeforeLevel: "superior",
          optionSelections: [],
        },
      ],
    }
  )
  expect(superiorSingle.accommodationTotalMinor).toBe(10000)

  // Independence: adding the included-stay Superior upgrade (€10 × 2 nights
  // = €20) must NOT change the night-before line or its level, and the
  // night-before level must NOT upgrade the included stay.
  const upgraded = await t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.includedTicketId,
          occupancy: "shared",
          nightBeforeLevel: "standard",
          optionSelections: [
            { optionKey: "superior_upgrade", quantity: 1, nights: 2 },
          ],
        },
      ],
    }
  )
  expect(upgraded.attendees[0].nightBeforeLevel).toBe("standard")
  expect(upgraded.attendees[0].categoryCode).toBe("standard")
  expect(upgraded.attendees[0].lines).toEqual(
    expect.arrayContaining([
      {
        kind: "accommodation",
        label: "Accommodation",
        nights: 1,
        ratePerNightMinor: 6000,
        chargeMinor: 6000,
      },
      {
        kind: "option",
        optionKey: "superior_upgrade",
        label: "Superior upgrade",
        nights: 2,
        quantity: 1,
        ratePerNightMinor: 1000,
        chargeMinor: 2000,
      },
    ])
  )
  expect(upgraded.accommodationTotalMinor).toBe(8000)
})

test("the acceptance example totals exactly €360 for the €250 ticket", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createDivineLikeEvent(t)

  // 18+ attendee, included Superior upgrade (€20), night-before Superior
  // shared (€70), cot (2 nights × €10 = €20): €250 + €20 + €70 + €20 = €360.
  const quote = await t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.includedTicketId,
          occupancy: "shared",
          nightBeforeLevel: "superior",
          optionSelections: [
            { optionKey: "superior_upgrade", quantity: 1, nights: 2 },
            { optionKey: "cot", quantity: 1, nights: 2 },
          ],
        },
      ],
    }
  )
  expect(quote).toMatchObject({
    ticketTotalMinor: 25000,
    accommodationTotalMinor: 11000,
    totalDueMinor: 36000,
  })
  expect(quote.attendees[0].lines).toEqual([
    {
      kind: "accommodation",
      label: "Accommodation",
      nights: 1,
      ratePerNightMinor: 6000,
      chargeMinor: 6000,
    },
    {
      kind: "option",
      optionKey: "superior_upgrade",
      label: "Superior upgrade",
      nights: 2,
      quantity: 1,
      ratePerNightMinor: 1000,
      chargeMinor: 2000,
    },
    {
      kind: "option",
      optionKey: "cot",
      label: "Cot",
      nights: 2,
      quantity: 1,
      ratePerNightMinor: 1000,
      chargeMinor: 2000,
    },
    {
      kind: "option",
      optionKey: "night_before_superior",
      label: "Night before · Superior",
      nights: 1,
      quantity: 1,
      ratePerNightMinor: 1000,
      chargeMinor: 1000,
    },
  ])
})

test("two attendees choose independently: included Superior upgrade vs night-before Superior", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createDivineLikeEvent(t)
  const secondIncludedTicketId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("ticketTypes", {
      eventId: seed.eventId as never,
      label: "Included-stay ticket 2",
      priceMinor: 25000,
      isActive: true,
      visibility: "public",
      availabilityState: "selectable",
      accommodationIncluded: true,
      updatedAt: BASE_EVENT_AT,
    })
  })

  // a1: included Superior upgrade (€20), no night-before → 25000 + 2000.
  // a2: no upgrade, night-before Superior shared (€70) → 25000 + 7000.
  const quote = await t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.includedTicketId,
          occupancy: "shared",
          optionSelections: [
            { optionKey: "superior_upgrade", quantity: 1, nights: 2 },
          ],
        },
        {
          attendeeKey: "a2",
          ticketTypeId: secondIncludedTicketId as Id<"ticketTypes">,
          occupancy: "shared",
          nightBeforeLevel: "superior",
          optionSelections: [],
        },
      ],
    }
  )

  const a1 = quote.attendees.find((attendee) => attendee.attendeeKey === "a1")!
  const a2 = quote.attendees.find((attendee) => attendee.attendeeKey === "a2")!
  expect(a1.nightBeforeLevel).toBeUndefined()
  expect(a2.nightBeforeLevel).toBe("superior")
  expect(a1.categoryCode).toBe("standard")
  expect(a2.categoryCode).toBe("standard")
  // a1: only the Superior upgrade line (included stay covered). a2: the
  // Standard night plus the Superior premium line — the two attendees never
  // affect each other's choices.
  expect(a1.lines.map((line) => line.optionKey ?? line.kind)).toEqual([
    "superior_upgrade",
  ])
  expect(a2.lines.map((line) => line.optionKey ?? line.kind)).toEqual([
    "accommodation",
    "night_before_superior",
  ])
  expect(a1.accommodationTotalMinor).toBe(2000)
  expect(a2.accommodationTotalMinor).toBe(7000)
  expect(quote.accommodationTotalMinor).toBe(9000)
  expect(quote.totalDueMinor).toBe(59000) // 25000 + 2000 + 25000 + 7000
})

test("night before: malformed levels, mismatched totals, and arbitrary upgrade shapes are rejected", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const seed = await createDivineLikeEvent(t)

  // A malformed night-before level is rejected at the contract boundary.
  await expect(
    t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.includedTicketId,
          occupancy: "shared",
          nightBeforeLevel: "family" as never,
          optionSelections: [],
        },
      ],
    })
  ).rejects.toThrow()

  // A legacy total-nights value that does not match the derived total
  // (base 2, or 3 with a night-before) is rejected.
  await expect(
    t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.includedTicketId,
          occupancy: "shared",
          nightBeforeLevel: "standard",
          nights: 4,
          optionSelections: [],
        },
      ],
    })
  ).rejects.toThrow("not part of the simplified accommodation contract")

  // The included-stay upgrade is fixed: quantity must be 1 attendee and the
  // nights must be exactly the included base nights (2).
  await expect(
    t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.includedTicketId,
          occupancy: "shared",
          optionSelections: [
            { optionKey: "superior_upgrade", quantity: 2, nights: 2 },
          ],
        },
      ],
    })
  ).rejects.toThrow("exactly one attendee for the included base nights")

  await expect(
    t.query(api.signupCatalog.getPublicSignupAccommodationQuote, {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.includedTicketId,
          occupancy: "shared",
          optionSelections: [
            { optionKey: "superior_upgrade", quantity: 1, nights: 3 },
          ],
        },
      ],
    })
  ).rejects.toThrow("exactly one attendee for the included base nights")

  // The cot remains a normal independent option with its own quantity/nights.
  const cot = await t.query(
    api.signupCatalog.getPublicSignupAccommodationQuote,
    {
      eventId: seed.eventId,
      attendees: [
        {
          attendeeKey: "a1",
          ticketTypeId: seed.includedTicketId,
          occupancy: "shared",
          optionSelections: [{ optionKey: "cot", quantity: 2, nights: 1 }],
        },
      ],
    }
  )
  expect(cot.accommodationTotalMinor).toBe(2000)
})
