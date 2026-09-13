/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest } from "convex-test"
import { api } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")
const identity = { subject: "maintenance-admin", tokenIdentifier: "clerk|maintenance-admin" }

test("family writer refreshes the canonical attendee projection without creating provider-only rows", async () => {
  const t = convexTest(schema, modules).withIdentity(identity)
  const ids = await t.mutation(async (ctx) => {
    const event = await ctx.db.insert("events", { slug: "maintenance", title: "Maintenance", startsAt: 1, timezone: "UTC", currency: "EUR", isPublished: true, isSignupOpen: true, accommodationEnabled: false, primarySourceKind: "internal", updatedAt: 1 })
    const order = await ctx.db.insert("orders", { eventId: event, source: "internal", bookingRef: "BOOK-MAINT", bookerName: "Booker", submittedAt: 1, status: "pending" })
    const attendee = await ctx.db.insert("orderAttendees", { orderId: order, attendeeKey: "one", name: "Canonical", gender: "unknown", sortOrder: 0 })
    await ctx.db.insert("ticketTailorAttendees", { providerEventId: "provider-event", providerOrderId: "provider-order", orderId: order, name: "Provider only", rawPayload: {} })
    return { attendee }
  })
  const family = await t.mutation(api.sync.createAttendeeFamilyGroup, { label: "Maintenance Family", primaryAttendeeId: String(ids.attendee) })
  await t.mutation(api.sync.addAttendeeToFamilyGroup, { familyGroupId: family, attendeeId: String(ids.attendee), relationship: "primary" })
  const docs = await t.run(async (ctx) => ctx.db.query("searchDocuments").withIndex("by_kind_and_subjectId", (q) => q.eq("kind", "attendee").eq("subjectId", String(ids.attendee))).take(5))
  expect(docs[0]?.searchText).toContain("maintenance family")
  expect(docs).toHaveLength(1)
})
