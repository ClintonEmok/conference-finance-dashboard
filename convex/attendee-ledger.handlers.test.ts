/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest } from "convex-test"
import { api } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")
const identity = { subject: "attendee-ledger-admin", tokenIdentifier: "clerk|attendee-ledger-admin" }

test("authenticated attendee ledger searches source fields and uses event all-time normalization", async () => {
  const t = convexTest(schema, modules).withIdentity(identity)
  const ids = await t.mutation(async (ctx) => {
    const event = await ctx.db.insert("events", { slug: "ledger", title: "Ledger", startsAt: 1, timezone: "UTC", currency: "EUR", isPublished: true, isSignupOpen: true, accommodationEnabled: false, primarySourceKind: "internal", updatedAt: 1 })
    const ticket = await ctx.db.insert("ticketTypes", { eventId: event, label: "Family Pass", priceMinor: 100, isActive: true, visibility: "public", availabilityState: "selectable", updatedAt: 1 })
    const order = await ctx.db.insert("orders", { eventId: event, source: "internal", bookingRef: "BOOK-OLD", bookerName: "Booker", bookerEmail: "booker@example.com", submittedAt: 1, status: "pending" })
    // Phase 62: the ledger scans `orderAttendees.by_eventId`, so the fixture
    // carries the additive copy (a legacy row without it is deliberately
    // invisible — pinned by the new source-search suite).
    const attendee = await ctx.db.insert("orderAttendees", { orderId: order, eventId: event, attendeeKey: "one", name: "Older Attendee", email: "older@example.com", gender: "unknown", sortOrder: 0 })
    await ctx.db.insert("orderTicketSelections", { orderId: order, attendeeId: attendee, ticketTypeId: ticket, quantity: 1, sortOrder: 0 })
    const family = await ctx.db.insert("attendeeFamilyGroups", { label: "Search Family", primaryAttendeeId: String(attendee) })
    await ctx.db.insert("attendeeFamilyMembers", { familyGroupId: String(family), attendeeId: String(attendee), relationship: "child" })
    return { event, attendee }
  })

  const result = await t.query(api.attendees.getAttendeeLedgerPage, { eventId: ids.event, search: "older@example.com", pageSize: 10, from: null, to: null, cursor: null })
  expect(result.dateMode).toBe("all-time")
  expect(result.from).toBeNull()
  expect(result.rows[0]).toMatchObject({ familyGroupLabel: "Search Family", ticketTypeLabel: "Family Pass", bookingRef: "BOOK-OLD" })

  // Deliberate narrowing (62-03): family and ticket labels stay enrichment
  // fields, not haystack fields — matching them would add ~4 related reads per
  // scanned attendee and break the read budget.
  const familyLabelOnly = await t.query(api.attendees.getAttendeeLedgerPage, { eventId: ids.event, search: "Search Family", pageSize: 10, from: null, to: null, cursor: null })
  expect(familyLabelOnly.rows).toEqual([])
})
