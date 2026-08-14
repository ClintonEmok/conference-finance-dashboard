/// <reference types="vite/client" />
import { expect, test } from "vitest"
import {
  convexTest,
  type TestConvexForDataModel,
} from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

function fresh() {
  return convexTest(schema, modules)
}

const adminIdentity = {
  subject: "user_admin",
  name: "Admin",
  email: "admin@example.com",
}

async function seedEvent(
  t: TestConvexForDataModel<GenericDataModel>,
  slug = "test-event"
) {
  return t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug,
      title: "Test Event",
      startsAt: Date.UTC(2026, 9, 23),
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: true,
      primarySourceKind: "internal",
      updatedAt: Date.now(),
    })
  })
}

function templateArgs(eventId: string, overrides: Record<string, unknown> = {}) {
  return {
    eventId: eventId as never,
    name: "Options announcement",
    title: "New accommodation options are available",
    message: "We have added new accommodation options.",
    eventName: "Test Event",
    eventDate: "23 October 2026",
    eventLocation: "Eindhoven, Netherlands",
    paymentUrl: "https://tikkie.me/pay/preview",
    nightBeforeNote: "An extra night is available for early arrivals.",
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Auth gates
// ---------------------------------------------------------------------------

test("getTemplatesForEvent rejects anonymous callers", async () => {
  const t = fresh()
  const eventId = await seedEvent(t)
  await expect(
    t.query(api.emailTemplates.getTemplatesForEvent, {
      eventId: eventId as never,
    })
  ).rejects.toThrow("Unauthorized")
})

test("saveTemplate rejects anonymous callers", async () => {
  const t = fresh()
  const eventId = await seedEvent(t)
  await expect(
    t.mutation(api.emailTemplates.saveTemplate, templateArgs(eventId))
  ).rejects.toThrow("Unauthorized")
})

test("deleteTemplate rejects anonymous callers", async () => {
  const t = fresh()
  const eventId = await seedEvent(t)
  await t.mutation(async (ctx) => {
    await ctx.db.insert("emailTemplates", {
      eventId,
      name: "Options announcement",
      title: "New accommodation options",
      message: "Body",
      eventName: "Test Event",
      eventDate: "2026-10-23",
      eventLocation: "Eindhoven",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  })
  const templateId = await t.run(async (ctx) => {
    return (await ctx.db.query("emailTemplates").first())!._id
  })
  await expect(
    t.mutation(api.emailTemplates.deleteTemplate, {
      eventId: eventId as never,
      templateId: templateId as never,
    })
  ).rejects.toThrow("Unauthorized")
})

// ---------------------------------------------------------------------------
// Listing + scoping
// ---------------------------------------------------------------------------

test("saveTemplate inserts and getTemplatesForEvent lists it for the event", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)

  const templateId = await t.mutation(
    api.emailTemplates.saveTemplate,
    templateArgs(eventId)
  )

  const list = await t.query(api.emailTemplates.getTemplatesForEvent, {
    eventId: eventId as never,
  })
  expect(list).toHaveLength(1)
  expect(list[0]._id).toBe(templateId)
  expect(list[0].name).toBe("Options announcement")
  expect(list[0].title).toBe("New accommodation options are available")
  expect(list[0].message).toBe("We have added new accommodation options.")
  expect(list[0].eventName).toBe("Test Event")
  expect(list[0].eventDate).toBe("23 October 2026")
  expect(list[0].eventLocation).toBe("Eindhoven, Netherlands")
  expect(list[0].paymentUrl).toBe("https://tikkie.me/pay/preview")
  expect(list[0].nightBeforeNote).toBe(
    "An extra night is available for early arrivals."
  )
  expect(list[0].createdAt).toBeGreaterThan(0)
  expect(list[0].updatedAt).toBeGreaterThan(0)
})

test("templates are scoped per event", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventA = await seedEvent(t, "event-a")
  const eventB = await seedEvent(t, "event-b")

  await t.mutation(api.emailTemplates.saveTemplate, templateArgs(eventA))

  const listB = await t.query(api.emailTemplates.getTemplatesForEvent, {
    eventId: eventB as never,
  })
  expect(listB).toHaveLength(0)

  const listA = await t.query(api.emailTemplates.getTemplatesForEvent, {
    eventId: eventA as never,
  })
  expect(listA).toHaveLength(1)
})

test("getTemplatesForEvent is bounded and newest-first", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await t.mutation(async (ctx) => {
    await ctx.db.insert("emailTemplates", {
      eventId,
      name: "Older",
      title: "Old",
      message: "m",
      eventName: "e",
      eventDate: "d",
      eventLocation: "l",
      createdAt: 1000,
      updatedAt: 1000,
    })
    await ctx.db.insert("emailTemplates", {
      eventId,
      name: "Newer",
      title: "New",
      message: "m",
      eventName: "e",
      eventDate: "d",
      eventLocation: "l",
      createdAt: 2000,
      updatedAt: 3000,
    })
  })

  const list = await t.query(api.emailTemplates.getTemplatesForEvent, {
    eventId: eventId as never,
  })
  expect(list.map((template: { name: string }) => template.name)).toEqual([
    "Newer",
    "Older",
  ])
})

// ---------------------------------------------------------------------------
// Upsert behavior
// ---------------------------------------------------------------------------

test("saveTemplate updates an existing template in place without duplicating", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)

  const templateId = await t.mutation(
    api.emailTemplates.saveTemplate,
    templateArgs(eventId)
  )

  const updatedId = await t.mutation(
    api.emailTemplates.saveTemplate,
    templateArgs(eventId, {
      templateId,
      name: "Updated name",
      title: "Updated title",
      message: "Updated body",
    })
  )
  expect(updatedId).toBe(templateId)

  const list = await t.query(api.emailTemplates.getTemplatesForEvent, {
    eventId: eventId as never,
  })
  expect(list).toHaveLength(1)
  expect(list[0].name).toBe("Updated name")
  expect(list[0].title).toBe("Updated title")
  expect(list[0].message).toBe("Updated body")
})

test("saveTemplate rejects a template ID from another event", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventA = await seedEvent(t, "event-a")
  const eventB = await seedEvent(t, "event-b")

  const templateId = await t.mutation(
    api.emailTemplates.saveTemplate,
    templateArgs(eventA)
  )

  await expect(
    t.mutation(
      api.emailTemplates.saveTemplate,
      templateArgs(eventB, { templateId })
    )
  ).rejects.toThrow("another event")
})

test("saveTemplate requires a name, title, and message", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)

  await expect(
    t.mutation(
      api.emailTemplates.saveTemplate,
      templateArgs(eventId, { name: "   " })
    )
  ).rejects.toThrow("required")
  await expect(
    t.mutation(
      api.emailTemplates.saveTemplate,
      templateArgs(eventId, { title: "" })
    )
  ).rejects.toThrow("required")
})

// ---------------------------------------------------------------------------
// Delete behavior
// ---------------------------------------------------------------------------

test("deleteTemplate removes only the requested template", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)

  const firstId = await t.mutation(
    api.emailTemplates.saveTemplate,
    templateArgs(eventId, { name: "First" })
  )
  const secondId = await t.mutation(
    api.emailTemplates.saveTemplate,
    templateArgs(eventId, { name: "Second" })
  )

  const { deleted } = await t.mutation(api.emailTemplates.deleteTemplate, {
    eventId: eventId as never,
    templateId: firstId as never,
  })
  expect(deleted).toBe(true)

  const list = await t.query(api.emailTemplates.getTemplatesForEvent, {
    eventId: eventId as never,
  })
  expect(list).toHaveLength(1)
  expect(list[0]._id).toBe(secondId)
})

test("deleteTemplate rejects a template from another event", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventA = await seedEvent(t, "event-a")
  const eventB = await seedEvent(t, "event-b")

  const templateId = await t.mutation(
    api.emailTemplates.saveTemplate,
    templateArgs(eventA)
  )

  await expect(
    t.mutation(api.emailTemplates.deleteTemplate, {
      eventId: eventB as never,
      templateId: templateId as never,
    })
  ).rejects.toThrow("another event")
})
