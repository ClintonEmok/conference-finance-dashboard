/// <reference types="vite/client" />
import { expect, test } from "vitest"
import {
  convexTest,
  type TestConvexForDataModel,
} from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api, internal } from "./_generated/api"
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

const baseFilters = {}

type SeedOptions = {
  email: string
  name?: string
  ref: string
  status?: "paid" | "pending" | "cancelled" | "refunded"
  submittedAt?: number
  location?: string
  ticketLabel?: string
  accommodation?: boolean
}

async function seedEvent(t: TestConvexForDataModel<GenericDataModel>) {
  return t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: "test-event",
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

async function seedBooker(
  t: TestConvexForDataModel<GenericDataModel>,
  eventId: string,
  options: SeedOptions
) {
  await t.mutation(async (ctx) => {
    const orderId = await ctx.db.insert("orders", {
      source: "internal",
      eventId: eventId as never,
      bookingRef: options.ref,
      bookerName: options.name ?? options.email.split("@")[0],
      bookerEmail: options.email,
      status: options.status ?? "paid",
      submittedAt: options.submittedAt ?? Date.now() - 1000,
      totalAmountMinor: 25000,
      currency: "EUR",
    })

    const attendeeId = await ctx.db.insert("orderAttendees", {
      orderId: orderId as never,
      attendeeKey: `AT-${options.ref}`,
      name: `${options.name ?? "Booker"} 1`,
      gender: "unknown",
      sortOrder: 0,
      ...(options.location ? { location: options.location } : {}),
    })

    if (options.ticketLabel) {
      const ticketTypeId = await ctx.db.insert("ticketTypes", {
        eventId: eventId as never,
        label: options.ticketLabel,
        priceMinor: 25000,
        isActive: true,
        visibility: "public",
        availabilityState: "selectable",
        updatedAt: Date.now(),
      })
      await ctx.db.insert("orderTicketSelections", {
        orderId: orderId as never,
        attendeeId: attendeeId as never,
        ticketTypeId: ticketTypeId as never,
        quantity: 1,
        sortOrder: 0,
      })
    }

    if (options.accommodation) {
      await ctx.db.insert("orderAccommodationSelections", {
        orderId: orderId as never,
        attendeeId: attendeeId as never,
        occupancy: "shared",
      })
    }

    return orderId
  })
}

// ---------------------------------------------------------------------------
// Auth + authorization gates
// ---------------------------------------------------------------------------

test("previewAudience rejects anonymous callers", async () => {
  const t = fresh()
  const eventId = await seedEvent(t)
  await expect(
    t.query(api.emailBroadcasts.previewAudience, {
      eventId: eventId as never,
      ...baseFilters,
    })
  ).rejects.toThrow("Unauthorized")
})

test("scheduleEmailBroadcast rejects anonymous callers", async () => {
  const t = fresh()
  const eventId = await seedEvent(t)
  await expect(
    t.mutation(api.emailBroadcasts.scheduleEmailBroadcast, {
      eventId: eventId as never,
      title: "Announcement",
      message: "Body",
      eventName: "Test Event",
      eventDate: "2026-10-23",
      eventLocation: "Eindhoven",
      filters: {},
      authorize: true,
    })
  ).rejects.toThrow("Unauthorized")
})

test("cancelEmailBroadcast and retryFailedEmailBroadcast reject anonymous callers", async () => {
  const anonymous = fresh()
  const broadcastId = await anonymous.mutation(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      slug: "anon-event",
      title: "Anon Event",
      startsAt: Date.UTC(2026, 9, 23),
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: false,
      primarySourceKind: "internal",
      updatedAt: Date.now(),
    })
    return await ctx.db.insert("emailBroadcasts", {
      eventId,
      status: "queued",
      title: "Announcement",
      message: "Body",
      eventName: "Anon Event",
      eventDate: "2026-10-23",
      eventLocation: "Eindhoven",
      signupUrl: "http://localhost:3000/signup/anon-event",
      filters: {},
      totalRecipients: 1,
      sentCount: 0,
      failedCount: 0,
      pendingCount: 1,
      createdAt: Date.now(),
    })
  })
  await expect(
    anonymous.mutation(api.emailBroadcasts.cancelEmailBroadcast, {
      broadcastId: broadcastId as never,
    })
  ).rejects.toThrow("Unauthorized")
  await expect(
    anonymous.mutation(api.emailBroadcasts.retryFailedEmailBroadcast, {
      broadcastId: broadcastId as never,
    })
  ).rejects.toThrow("Unauthorized")
})

test("getBroadcastHistory rejects anonymous callers", async () => {
  const t = fresh()
  const eventId = await seedEvent(t)
  await expect(
    t.query(api.emailBroadcasts.getBroadcastHistory, {
      eventId: eventId as never,
    })
  ).rejects.toThrow("Unauthorized")
})

// ---------------------------------------------------------------------------
// Audience computation
// ---------------------------------------------------------------------------

test("previewAudience returns all matching bookers and dedupes by email", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await seedBooker(t, eventId, { email: "alice@example.com", ref: "BK-A" })
  await seedBooker(t, eventId, { email: "bob@example.com", ref: "BK-B" })
  // Same email on an older order must be deduplicated (newest wins).
  await seedBooker(t, eventId, {
    email: "alice@example.com",
    ref: "BK-A-OLD",
    submittedAt: Date.now() - 999999,
  })

  const preview = await t.query(api.emailBroadcasts.previewAudience, {
    eventId: eventId as never,
    ...baseFilters,
  })
  expect(preview.total).toBe(2)
  const emails = preview.recipients
    .map((r: { bookerEmail: string }) => r.bookerEmail)
    .sort()
  expect(emails).toEqual(["alice@example.com", "bob@example.com"])
})

test("previewAudience filters by order status", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await seedBooker(t, eventId, {
    email: "paid@example.com",
    ref: "BK-PAID",
    status: "paid",
  })
  await seedBooker(t, eventId, {
    email: "pending@example.com",
    ref: "BK-PENDING",
    status: "pending",
  })

  const preview = await t.query(api.emailBroadcasts.previewAudience, {
    eventId: eventId as never,
    status: "pending",
  })
  expect(preview.total).toBe(1)
  expect(preview.recipients[0].bookerEmail).toBe("pending@example.com")
})

test("previewAudience filters by location derived from attendees", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await seedBooker(t, eventId, {
    email: "ams@example.com",
    ref: "BK-AMS",
    location: "Amsterdam",
  })
  await seedBooker(t, eventId, {
    email: "utr@example.com",
    ref: "BK-UTR",
    location: "Utrecht",
  })

  const preview = await t.query(api.emailBroadcasts.previewAudience, {
    eventId: eventId as never,
    location: "amsterdam",
  })
  expect(preview.total).toBe(1)
  expect(preview.recipients[0].bookerEmail).toBe("ams@example.com")
})

test("previewAudience filters by submitted date range", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  const base = Date.now()
  await seedBooker(t, eventId, {
    email: "old@example.com",
    ref: "BK-OLD",
    submittedAt: base - 5_000_000,
  })
  await seedBooker(t, eventId, {
    email: "new@example.com",
    ref: "BK-NEW",
    submittedAt: base,
  })

  const preview = await t.query(api.emailBroadcasts.previewAudience, {
    eventId: eventId as never,
    from: base - 1_000_000,
    to: base + 1_000_000,
  })
  expect(preview.total).toBe(1)
  expect(preview.recipients[0].bookerEmail).toBe("new@example.com")
})

test("previewAudience filters by has accommodation selection", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await seedBooker(t, eventId, {
    email: "with@example.com",
    ref: "BK-WITH",
    accommodation: true,
  })
  await seedBooker(t, eventId, {
    email: "without@example.com",
    ref: "BK-WITHOUT",
  })

  const preview = await t.query(api.emailBroadcasts.previewAudience, {
    eventId: eventId as never,
    hasAccommodationSelection: true,
  })
  expect(preview.total).toBe(1)
  expect(preview.recipients[0].bookerEmail).toBe("with@example.com")
})

test("previewAudience filters by ticket type", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await seedBooker(t, eventId, {
    email: "adult@example.com",
    ref: "BK-ADULT",
    ticketLabel: "18+",
  })
  await seedBooker(t, eventId, {
    email: "child@example.com",
    ref: "BK-CHILD",
    ticketLabel: "12-17",
  })

  const ticketTypes = await t.query(api.events.getTicketTypesForEvent, {
    eventId: eventId as never,
  })
  const adultType = (ticketTypes as Array<{ label: string; _id: string }>).find(
    (tt) => tt.label === "18+"
  )!
  const preview = await t.query(api.emailBroadcasts.previewAudience, {
    eventId: eventId as never,
    ticketTypeId: adultType._id as never,
  })
  expect(preview.total).toBe(1)
  expect(preview.recipients[0].bookerEmail).toBe("adult@example.com")
})

test("previewAudience skips bookers without email or booking ref and reports counts", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await t.mutation(async (ctx) => {
    await ctx.db.insert("orders", {
      source: "internal",
      eventId: eventId as never,
      bookingRef: "BK-NO-EMAIL",
      submittedAt: Date.now(),
    })
  })
  await seedBooker(t, eventId, {
    email: "no-ref@example.com",
    ref: "BK-NO-REF",
  })
  await t.mutation(async (ctx) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_bookingRef", (q) => q.eq("bookingRef", "BK-NO-REF"))
      .first()
    await ctx.db.patch("orders", order!._id, { bookingRef: undefined })
  })

  const preview = await t.query(api.emailBroadcasts.previewAudience, {
    eventId: eventId as never,
    ...baseFilters,
  })
  expect(preview.skippedNoEmail).toBe(1)
  expect(preview.skippedNoRef).toBe(1)
  expect(preview.total).toBe(0)
})

// ---------------------------------------------------------------------------
// Audience preview limits (200-row contract)
// ---------------------------------------------------------------------------

async function seedManyBookers(
  t: TestConvexForDataModel<GenericDataModel>,
  eventId: string,
  count: number
) {
  const BATCH = 100
  for (let start = 0; start < count; start += BATCH) {
    const end = Math.min(start + BATCH, count)
    await t.mutation(async (ctx) => {
      for (let i = start; i < end; i++) {
        const orderId = await ctx.db.insert("orders", {
          source: "internal",
          eventId: eventId as never,
          bookingRef: `BK-MANY-${String(i).padStart(4, "0")}`,
          bookerName: `Booker ${i}`,
          bookerEmail: `booker${i}@example.com`,
          status: "paid",
          submittedAt: Date.now() - count + i,
          totalAmountMinor: 25000,
          currency: "EUR",
        })
        await ctx.db.insert("orderAttendees", {
          orderId: orderId as never,
          attendeeKey: `AT-MANY-${i}`,
          name: `Booker ${i}`,
          gender: "unknown",
          sortOrder: 0,
        })
      }
    })
  }
}

test("previewAudience default limit returns more than the old 100 rows", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await seedManyBookers(t, eventId, 150)

  const preview = await t.query(api.emailBroadcasts.previewAudience, {
    eventId: eventId as never,
    ...baseFilters,
  })
  expect(preview.total).toBe(150)
  expect(preview.recipients.length).toBe(150)
}, 60_000)

test("previewAudience caps an oversized requested limit at 200", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await seedManyBookers(t, eventId, 250)

  const capped = await t.query(api.emailBroadcasts.previewAudience, {
    eventId: eventId as never,
    ...baseFilters,
    limit: 500,
  })
  expect(capped.total).toBe(250)
  expect(capped.recipients.length).toBe(200)

  const defaulted = await t.query(api.emailBroadcasts.previewAudience, {
    eventId: eventId as never,
    ...baseFilters,
  })
  expect(defaulted.recipients.length).toBe(200)
}, 60_000)

test("previewAudience search filters across the whole audience", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await seedBooker(t, eventId, { name: "Alice van Dijk", email: "alice@example.com", ref: "BK-ALICE" })
  await seedBooker(t, eventId, { name: "Bob Peters", email: "bob@example.com", ref: "BK-BOB" })

  const byName = await t.query(api.emailBroadcasts.previewAudience, {
    eventId: eventId as never,
    search: "alice",
  })
  expect(byName.total).toBe(1)
  expect(byName.recipients[0].bookerEmail).toBe("alice@example.com")

  const byEmail = await t.query(api.emailBroadcasts.previewAudience, {
    eventId: eventId as never,
    search: "BOB@",
  })
  expect(byEmail.total).toBe(1)
  expect(byEmail.recipients[0].bookerEmail).toBe("bob@example.com")

  const byRef = await t.query(api.emailBroadcasts.previewAudience, {
    eventId: eventId as never,
    search: "bk-bob",
  })
  expect(byRef.total).toBe(1)
  expect(byRef.recipients[0].bookerEmail).toBe("bob@example.com")

  const noMatch = await t.query(api.emailBroadcasts.previewAudience, {
    eventId: eventId as never,
    search: "nobody",
  })
  expect(noMatch.total).toBe(0)
  expect(noMatch.recipients.length).toBe(0)
})

test("previewAudience search runs before the 200-row limit", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await seedManyBookers(t, eventId, 250)
  // Rename the oldest order (last in desc order, beyond the 200 preview cap)
  // to a distinctive value; search must still find it across the whole audience.
  await t.mutation(async (ctx) => {
    const oldest = await ctx.db
      .query("orders")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId as never))
      .order("asc")
      .first()
    if (oldest) {
      await ctx.db.patch(oldest._id, { bookerEmail: "needle@example.com" })
    }
  })

  const needle = await t.query(api.emailBroadcasts.previewAudience, {
    eventId: eventId as never,
    search: "needle",
  })
  expect(needle.total).toBe(1)
  expect(needle.recipients.length).toBe(1)
  expect(needle.recipients[0].bookerEmail).toBe("needle@example.com")

  const broad = await t.query(api.emailBroadcasts.previewAudience, {
    eventId: eventId as never,
    search: "booker",
  })
  expect(broad.total).toBe(250)
  expect(broad.recipients.length).toBe(200)
}, 60_000)

test("previewAudience rejects integration events", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await t.mutation(async (ctx) => {
    return await ctx.db.insert("events", {
      slug: "integration-event",
      title: "Integration Event",
      startsAt: Date.now(),
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: false,
      primarySourceKind: "integration",
      updatedAt: Date.now(),
    })
  })
  await seedBooker(t, eventId, { email: "pii@example.com", ref: "BK-PII" })

  await expect(
    t.query(api.emailBroadcasts.previewAudience, {
      eventId: eventId as never,
    })
  ).rejects.toThrow("Broadcasts are only available for internal events")
})

test("previewAudience clamps invalid limits to the bounded range", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await seedManyBookers(t, eventId, 250)

  const negative = await t.query(api.emailBroadcasts.previewAudience, {
    eventId: eventId as never,
    ...baseFilters,
    limit: -1,
  })
  expect(negative.total).toBe(250)
  expect(negative.recipients.length).toBe(0)

  const oversized = await t.query(api.emailBroadcasts.previewAudience, {
    eventId: eventId as never,
    ...baseFilters,
    limit: 10_000,
  })
  expect(oversized.recipients.length).toBe(200)
}, 60_000)

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

test("scheduleEmailBroadcast requires explicit authorization", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await seedBooker(t, eventId, { email: "a@example.com", ref: "BK-A" })
  await expect(
    t.mutation(api.emailBroadcasts.scheduleEmailBroadcast, {
      eventId: eventId as never,
      title: "Announcement",
      message: "Body",
      eventName: "Test Event",
      eventDate: "2026-10-23",
      eventLocation: "Eindhoven",
      filters: {},
      authorize: false,
    })
  ).rejects.toThrow("explicit authorization")
})

test("scheduleEmailBroadcast rejects an empty audience", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await expect(
    t.mutation(api.emailBroadcasts.scheduleEmailBroadcast, {
      eventId: eventId as never,
      title: "Announcement",
      message: "Body",
      eventName: "Test Event",
      eventDate: "2026-10-23",
      eventLocation: "Eindhoven",
      filters: {},
      authorize: true,
    })
  ).rejects.toThrow("No bookers match")
})

test("scheduleEmailBroadcast creates a queued job and pending recipients without sending", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await seedBooker(t, eventId, { email: "a@example.com", ref: "BK-A" })
  await seedBooker(t, eventId, { email: "b@example.com", ref: "BK-B" })

  const { broadcastId, totalRecipients } = await t.mutation(
    api.emailBroadcasts.scheduleEmailBroadcast,
    {
      eventId: eventId as never,
      title: "New Options Available",
      message: "We have added new options.",
      eventName: "Test Event",
      eventDate: "2026-10-23",
      eventLocation: "Eindhoven",
      paymentUrl: "https://tikkie.me/pay/abc",
      nightBeforeNote: "Extra night available.",
      filters: { status: "paid" },
      authorize: true,
    }
  )

  expect(totalRecipients).toBe(2)

  const job = await t.run(async (ctx) => {
    return await ctx.db.get("emailBroadcasts", broadcastId as never)
  })
  expect(job).not.toBeNull()
  expect(job!.status).toBe("queued")
  expect(job!.totalRecipients).toBe(2)
  expect(job!.sentCount).toBe(0)
  expect(job!.failedCount).toBe(0)
  expect(job!.pendingCount).toBe(2)
  expect(job!.filters).toEqual({ status: "paid" })
  expect(job!.signupUrl).toContain("/signup/test-event")

  const recipients = await t.run(async (ctx) => {
    return await ctx.db
      .query("emailBroadcastRecipients")
      .withIndex("by_broadcastId", (q) =>
        q.eq("broadcastId", broadcastId as never)
      )
      .collect()
  })
  expect(recipients).toHaveLength(2)
  for (const recipient of recipients) {
    expect(recipient.status).toBe("pending")
    expect(recipient.attempts).toBe(0)
    expect(recipient.manageBookingUrl).toContain("/booking/")
  }
})

test("scheduleEmailBroadcast rejects integration-source events", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await t.mutation(async (ctx) => {
    await ctx.db.patch("events", eventId as never, {
      primarySourceKind: "integration",
    })
  })
  await seedBooker(t, eventId, { email: "a@example.com", ref: "BK-A" })
  await expect(
    t.mutation(api.emailBroadcasts.scheduleEmailBroadcast, {
      eventId: eventId as never,
      title: "Announcement",
      message: "Body",
      eventName: "Test Event",
      eventDate: "2026-10-23",
      eventLocation: "Eindhoven",
      filters: {},
      authorize: true,
    })
  ).rejects.toThrow("internal events")
})

// ---------------------------------------------------------------------------
// Async batch loop, cancellation, retry
// ---------------------------------------------------------------------------

test("processBatch drains recipients, records failures, counters, and finalizes", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await seedBooker(t, eventId, { email: "a@example.com", ref: "BK-A" })
  await seedBooker(t, eventId, { email: "b@example.com", ref: "BK-B" })

  const { broadcastId } = await t.mutation(
    api.emailBroadcasts.scheduleEmailBroadcast,
    {
      eventId: eventId as never,
      title: "Announcement",
      message: "Body",
      eventName: "Test Event",
      eventDate: "2026-10-23",
      eventLocation: "Eindhoven",
      filters: {},
      authorize: true,
    }
  )

  // Resend is unconfigured in the test harness, so every recipient fails
  // with "API key is not set" — the loop still drains and records outcomes.
  let done = false
  let guard = 0
  while (!done && guard < 10) {
    const result = await t.action(
      internal.emailBroadcastActions.processBatch,
      { broadcastId: broadcastId as never }
    )
    done = result.done
    guard++
  }

  const job = await t.run(async (ctx) => {
    return await ctx.db.get("emailBroadcasts", broadcastId as never)
  })
  expect(job!.status).toBe("failed")
  expect(job!.sentCount).toBe(0)
  expect(job!.failedCount).toBe(2)
  expect(job!.pendingCount).toBe(0)

  const recipients = await t.run(async (ctx) => {
    return await ctx.db
      .query("emailBroadcastRecipients")
      .withIndex("by_broadcastId", (q) =>
        q.eq("broadcastId", broadcastId as never)
      )
      .collect()
  })
  for (const recipient of recipients) {
    expect(recipient.status).toBe("failed")
    expect(recipient.attempts).toBe(1)
    expect(recipient.error).toContain("API key is not set")
  }

  // No sentEmails rows were written (all sends failed).
  const sentEmails = await t.run(async (ctx) => {
    return await ctx.db.query("sentEmails").collect()
  })
  expect(sentEmails).toHaveLength(0)
})

test("cancelling a queued broadcast stops the loop without sending", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await seedBooker(t, eventId, { email: "a@example.com", ref: "BK-A" })

  const { broadcastId } = await t.mutation(
    api.emailBroadcasts.scheduleEmailBroadcast,
    {
      eventId: eventId as never,
      title: "Announcement",
      message: "Body",
      eventName: "Test Event",
      eventDate: "2026-10-23",
      eventLocation: "Eindhoven",
      filters: {},
      authorize: true,
    }
  )

  const { cancelled } = await t.mutation(
    api.emailBroadcasts.cancelEmailBroadcast,
    { broadcastId: broadcastId as never }
  )
  expect(cancelled).toBe(true)

  // processBatch must no-op on a cancelled job.
  const result = await t.action(
    internal.emailBroadcastActions.processBatch,
    { broadcastId: broadcastId as never }
  )
  expect(result.done).toBe(true)

  const job = await t.run(async (ctx) => {
    return await ctx.db.get("emailBroadcasts", broadcastId as never)
  })
  expect(job!.status).toBe("cancelled")
  expect(job!.sentCount).toBe(0)
  expect(job!.pendingCount).toBe(1)
})

async function drainBroadcast(
  t: TestConvexForDataModel<GenericDataModel>,
  broadcastId: string
) {
  let done = false
  let guard = 0
  while (!done && guard < 10) {
    const result = await t.action(
      internal.emailBroadcastActions.processBatch,
      { broadcastId: broadcastId as never }
    )
    done = result.done
    guard++
  }
  return done
}

test("retryFailedEmailBroadcast requeues only failed recipients and increments attempts", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await seedBooker(t, eventId, { email: "a@example.com", ref: "BK-A" })

  const { broadcastId } = await t.mutation(
    api.emailBroadcasts.scheduleEmailBroadcast,
    {
      eventId: eventId as never,
      title: "Announcement",
      message: "Body",
      eventName: "Test Event",
      eventDate: "2026-10-23",
      eventLocation: "Eindhoven",
      filters: {},
      authorize: true,
    }
  )

  await drainBroadcast(t, broadcastId)

  const { requeued } = await t.mutation(
    api.emailBroadcasts.retryFailedEmailBroadcast,
    { broadcastId: broadcastId as never }
  )
  expect(requeued).toBe(1)

  const job = await t.run(async (ctx) => {
    return await ctx.db.get("emailBroadcasts", broadcastId as never)
  })
  expect(job!.status).toBe("queued")
  expect(job!.pendingCount).toBe(1)
  expect(job!.failedCount).toBe(0)

  // Re-run the loop; the single recipient fails again and attempts advances.
  await t.action(internal.emailBroadcastActions.processBatch, {
    broadcastId: broadcastId as never,
  })
  const recipients = await t.run(async (ctx) => {
    return await ctx.db
      .query("emailBroadcastRecipients")
      .withIndex("by_broadcastId", (q) =>
        q.eq("broadcastId", broadcastId as never)
      )
      .collect()
  })
  expect(recipients[0].status).toBe("failed")
  expect(recipients[0].attempts).toBe(2)
})

test("getBroadcastHistory and getBroadcastById surface the job", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const eventId = await seedEvent(t)
  await seedBooker(t, eventId, { email: "a@example.com", ref: "BK-A" })

  const { broadcastId } = await t.mutation(
    api.emailBroadcasts.scheduleEmailBroadcast,
    {
      eventId: eventId as never,
      title: "New Options Available",
      message: "Body",
      eventName: "Test Event",
      eventDate: "2026-10-23",
      eventLocation: "Eindhoven",
      filters: {},
      authorize: true,
    }
  )

  const history = await t.query(api.emailBroadcasts.getBroadcastHistory, {
    eventId: eventId as never,
  })
  expect(history).toHaveLength(1)
  expect(history[0]._id).toBe(broadcastId)
  expect(history[0].status).toBe("queued")
  expect(history[0].totalRecipients).toBe(1)

  const job = await t.query(api.emailBroadcasts.getBroadcastById, {
    broadcastId: broadcastId as never,
  })
  expect(job!.title).toBe("New Options Available")
  expect(job!.filters).toEqual({})
})
