/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"

const modules = import.meta.glob("./**/*.ts")

const BASE_AT = 1_750_000_000_000

const adminIdentity = {
  tokenIdentifier: "admin:donation-allocation",
  name: "Admin",
  email: "admin@example.com",
}

type TestConvex = TestConvexForDataModel<GenericDataModel>

type AllocationScope = "event_charges" | "whole_order"

type ManualRowInput = {
  attendeeId: Id<"orderAttendees">
  amountMinor: number
  scope: AllocationScope
}

type TargetInput = {
  attendeeId: Id<"orderAttendees">
  scope: AllocationScope
}

function fresh() {
  return convexTest(schema, modules)
}

function manualRequest(rows: ManualRowInput[]) {
  return { method: "manual" as const, rows }
}

type AllocationRequestInput =
  | { method: "manual"; rows: ManualRowInput[] }
  | { method: "equal"; targets: TargetInput[] }
  | { method: "largest_balance_first"; targets: TargetInput[] }

/**
 * The allocation mutation now REQUIRES an idempotency key (D-21), so every call
 * site goes through this helper. Unless a test passes an explicit
 * `idempotencyKey` (the replay/conflict cases), a fresh key is minted per call —
 * which is exactly what a real operator client does, and which keeps the
 * existing "distinct submission" tests reading as distinct submissions.
 */
let allocationKeySeq = 0
function allocate(
  client: TestConvex,
  args: {
    donationId: Id<"payments">
    eventId: Id<"events">
    request: AllocationRequestInput
    idempotencyKey?: string
  }
) {
  allocationKeySeq += 1
  return client.mutation(api.donations.allocateDonation, {
    ...args,
    idempotencyKey: args.idempotencyKey ?? `auto-${allocationKeySeq}`,
  })
}

type LedgerRow = {
  _id: string
  donationId: string
  idempotencyKey: string
  requestDigest: string
  operation: string
  actor: string
  allocatedTotalMinor: number
  remainingMinor: number
  rows: Array<{
    attendeeId: string
    orderId: string
    amountMinor: number
    scope: string
  }>
}

/**
 * The `(donationId, idempotencyKey)` ledger row. Read through the composite
 * `by_donationId_and_idempotencyKey` index using its `donationId` PREFIX and
 * matched on the key in memory: `GenericDataModel` types the index range
 * builder as accepting only one `eq`, while the production lookup chains both.
 */
async function loadLedgerRow(
  t: TestConvex,
  donationId: Id<"payments">,
  idempotencyKey: string
): Promise<LedgerRow | null> {
  return t.query(async (ctx) => {
    const row = await ctx.db
      .query("donationAllocationSubmissions")
      .withIndex("by_donationId_and_idempotencyKey", (q) =>
        q.eq("donationId", donationId)
      )
      .filter((q) => q.eq(q.field("idempotencyKey"), idempotencyKey))
      .first()

    if (!row) {
      return null
    }

    return {
      _id: String(row._id),
      donationId: String(row.donationId),
      idempotencyKey: String(row.idempotencyKey),
      requestDigest: String(row.requestDigest),
      operation: String(row.operation),
      actor: String(row.actor),
      allocatedTotalMinor: Number(row.allocatedTotalMinor),
      remainingMinor: Number(row.remainingMinor),
      rows: (row.rows as unknown as LedgerRow["rows"]).map((entry) => ({
        attendeeId: String(entry.attendeeId),
        orderId: String(entry.orderId),
        amountMinor: Number(entry.amountMinor),
        scope: String(entry.scope),
      })),
    }
  })
}

async function countLedgerRows(t: TestConvex): Promise<number> {
  return t.query(async (ctx) => {
    let count = 0
    for await (const _row of ctx.db.query("donationAllocationSubmissions")) {
      count += 1
    }
    return count
  })
}

/** Every `donationAllocations` row for a donation, WITH its provenance stamp. */
async function loadAllocationRowDetails(t: TestConvex, donationId: Id<"payments">) {
  return t.query(async (ctx) => {
    const rows: Array<{
      _id: string
      attendeeId: string
      orderId: string
      amountMinor: number
      scope: string
      createdAt: number
      createdBy: string
      submissionId: string | null
    }> = []

    for await (const row of ctx.db
      .query("donationAllocations")
      .withIndex("by_donationId", (q) => q.eq("donationId", donationId))) {
      rows.push({
        _id: String(row._id),
        attendeeId: String(row.attendeeId),
        orderId: String(row.orderId),
        amountMinor: Number(row.amountMinor),
        scope: String(row.scope),
        createdAt: Number(row.createdAt),
        createdBy: String(row.createdBy),
        submissionId: row.submissionId ? String(row.submissionId) : null,
      })
    }

    return rows
  })
}

/** Every append-only removal audit row for a donation. */
async function loadRemovalAuditRows(t: TestConvex, donationId: Id<"payments">) {
  return t.query(async (ctx) => {
    const rows: Array<{
      donationId: string
      eventId: string
      orderId: string
      attendeeId: string
      amountMinor: number
      scope: string
      actor: string
      removedAt: number
      submissionId: string | null
    }> = []

    for await (const row of ctx.db
      .query("donationAllocationRemovals")
      .withIndex("by_donationId", (q) => q.eq("donationId", donationId))) {
      rows.push({
        donationId: String(row.donationId),
        eventId: String(row.eventId),
        orderId: String(row.orderId),
        attendeeId: String(row.attendeeId),
        amountMinor: Number(row.amountMinor),
        scope: String(row.scope),
        actor: String(row.actor),
        removedAt: Number(row.removedAt),
        submissionId: row.submissionId ? String(row.submissionId) : null,
      })
    }

    return rows
  })
}

async function countRemovalAuditRows(t: TestConvex): Promise<number> {
  return t.query(async (ctx) => {
    let count = 0
    for await (const _row of ctx.db.query("donationAllocationRemovals")) {
      count += 1
    }
    return count
  })
}

/**
 * Moves the ceiling BEHIND an order's attendees by repricing its ticket types.
 * `loadOrderAmountDueBreakdowns` re-prices selections from
 * `ticketTypes.priceMinor` on every call, so this changes every attendee's
 * attributable due (and therefore both scope ceilings) without touching a
 * single allocation row — which is exactly the D-16 staleness fixture.
 */
async function reduceTicketPrice(
  t: TestConvex,
  orderId: Id<"orders">,
  priceMinor: number
): Promise<void> {
  await t.mutation(async (ctx) => {
    for await (const selection of ctx.db
      .query("orderTicketSelections")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))) {
      await ctx.db.patch(
        "ticketTypes",
        selection.ticketTypeId as Id<"ticketTypes">,
        { priceMinor }
      )
    }
  })
}

async function seedEvent(t: TestConvex, slug: string): Promise<Id<"events">> {
  return t.mutation(async (ctx) =>
    ctx.db.insert("events", {
      slug,
      title: slug,
      startsAt: BASE_AT,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: false,
      primarySourceKind: "internal" as const,
      updatedAt: BASE_AT,
    })
  )
}

/**
 * Inserts an order (unless one is supplied), a ticket type priced at
 * `ticketPriceMinor`, the attendee, and the ticket selection the canonical
 * `loadOrderAmountDueBreakdowns` loader prices from. The ticket selection is
 * REQUIRED: without it the loader returns a zero ceiling and every ceiling
 * assertion becomes vacuous.
 */
async function createAttendee(
  t: TestConvex,
  eventId: Id<"events">,
  input: {
    orderId?: Id<"orders">
    attendeeKey: string
    name: string
    ticketPriceMinor: number
    sortOrder?: number
  }
): Promise<{ orderId: Id<"orders">; attendeeId: Id<"orderAttendees"> }> {
  const orderId =
    input.orderId ??
    (await t.mutation(async (ctx) =>
      ctx.db.insert("orders", {
        eventId,
        source: "internal" as const,
        bookingRef: `BK-${input.attendeeKey.toUpperCase()}`,
        bookerName: "Booker",
        bookerEmail: "booker@example.com",
        submittedAt: BASE_AT,
      })
    ))

  const ticketTypeId = await t.mutation(async (ctx) =>
    ctx.db.insert("ticketTypes", {
      eventId,
      label: `Ticket ${input.attendeeKey}`,
      priceMinor: input.ticketPriceMinor,
      isActive: true,
      visibility: "public" as const,
      availabilityState: "selectable" as const,
      accommodationIncluded: false,
      updatedAt: BASE_AT,
    })
  )

  const attendeeId = await t.mutation(async (ctx) =>
    ctx.db.insert("orderAttendees", {
      orderId,
      attendeeKey: input.attendeeKey,
      name: input.name,
      gender: "unknown" as const,
      sortOrder: input.sortOrder ?? 0,
    })
  )

  await t.mutation(async (ctx) =>
    ctx.db.insert("orderTicketSelections", {
      orderId,
      attendeeId,
      ticketTypeId,
      quantity: 1,
      sortOrder: 0,
    })
  )

  return { orderId, attendeeId }
}

/** The exact shape `createStandaloneDonation` writes (no orderId). */
async function createDonation(
  t: TestConvex,
  eventId: Id<"events">,
  input: {
    amountMinor: number
    donationKind?: "standalone" | "overpayment"
    status?: "donation" | "unassigned"
    orderId?: string
  }
): Promise<Id<"payments">> {
  return t.mutation(async (ctx) =>
    ctx.db.insert("payments", {
      source: "cash" as const,
      eventId,
      payerName: "Donor",
      amountMinor: input.amountMinor,
      paidAt: BASE_AT,
      donationKind: input.donationKind ?? "standalone",
      status: input.status ?? "donation",
      ...(input.orderId ? { orderId: input.orderId } : {}),
    })
  )
}

async function countAllocationRows(t: TestConvex): Promise<number> {
  return t.query(async (ctx) => {
    let count = 0
    for await (const _row of ctx.db.query("donationAllocations")) count += 1
    return count
  })
}

async function loadAllocationRows(
  t: TestConvex,
  donationId: Id<"payments">
) {
  return t.query(async (ctx) => {
    const rows: Array<{
      attendeeId: string
      orderId: string
      amountMinor: number
      scope: string
    }> = []
    for await (const row of ctx.db
      .query("donationAllocations")
      .withIndex("by_donationId", (q) => q.eq("donationId", donationId))) {
      rows.push({
        attendeeId: String(row.attendeeId),
        orderId: String(row.orderId),
        amountMinor: Number(row.amountMinor),
        scope: String(row.scope),
      })
    }
    return rows
  })
}

test("allocateDonation requires auth, writes the submitted rows and derives the remainder", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-auth")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "auth-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const anonymous = convexTest(schema, modules)

  const request = manualRequest([
    { attendeeId, amountMinor: 6_000, scope: "event_charges" },
  ])

  await expect(
    allocate(anonymous, {
      donationId,
      eventId,
      request,
    })
  ).rejects.toThrow("Unauthorized")
  expect(await countAllocationRows(seeded)).toBe(0)

  const result = await allocate(authed, {
    donationId,
    eventId,
    request,
  })

  expect(result).toMatchObject({
    donationId,
    allocatedTotalMinor: 6_000,
    remainingMinor: 9_000,
  })

  const rows = await loadAllocationRows(seeded, donationId)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    attendeeId: String(attendeeId),
    amountMinor: 6_000,
    scope: "event_charges",
  })
})

test("a second submission is a set-replace and an empty plan clears the allocations", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-replace")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "replace-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "replace-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 20_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  const firstResult = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 6_000, scope: "event_charges" },
      { attendeeId: second.attendeeId, amountMinor: 4_000, scope: "event_charges" },
    ]),
  })
  expect(firstResult.remainingMinor).toBe(10_000)
  expect(await countAllocationRows(seeded)).toBe(2)

  const secondResult = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 10_000, scope: "event_charges" },
    ]),
  })
  expect(secondResult.remainingMinor).toBe(10_000)
  expect(await countAllocationRows(seeded)).toBe(1)
  const rows = await loadAllocationRows(seeded, donationId)
  expect(rows.map((row) => row.attendeeId)).toEqual([String(first.attendeeId)])

  const clearedResult = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([]),
  })
  expect(clearedResult.remainingMinor).toBe(20_000)
  expect(clearedResult.allocatedTotalMinor).toBe(0)
  expect(await countAllocationRows(seeded)).toBe(0)
})

test("over-remainder and over-ceiling submissions write nothing", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-refusals")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "refuse-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  // Donation smaller than the row -> remainder check fires first.
  const smallDonationId = await createDonation(seeded, eventId, {
    amountMinor: 5_000,
  })
  await expect(
    allocate(authed, {
      donationId: smallDonationId,
      eventId,
      request: manualRequest([
        { attendeeId, amountMinor: 6_000, scope: "event_charges" },
      ]),
    })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_REMAINDER")
  expect(await countAllocationRows(seeded)).toBe(0)

  // Donation above the ceiling -> the per-row ceiling check fires.
  const largeDonationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  await expect(
    allocate(authed, {
      donationId: largeDonationId,
      eventId,
      request: manualRequest([
        { attendeeId, amountMinor: 15_000, scope: "event_charges" },
      ]),
    })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_CEILING")
  expect(await countAllocationRows(seeded)).toBe(0)
})

test("whole_order is the larger attendee-agnostic ceiling (D-12 divergence)", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-divergence")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "diverge-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "diverge-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  // Order outstanding is 20_000; A's own attributable outstanding is 10_000.
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 30_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  await expect(
    allocate(authed, {
      donationId,
      eventId,
      request: manualRequest([
        { attendeeId: first.attendeeId, amountMinor: 15_000, scope: "event_charges" },
      ]),
    })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_CEILING")
  expect(await countAllocationRows(seeded)).toBe(0)

  // The identical amount is accepted under whole_order: the scope is honoured,
  // never inferred.
  const accepted = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 15_000, scope: "whole_order" },
    ]),
  })
  expect(accepted.remainingMinor).toBe(15_000)
  expect(await countAllocationRows(seeded)).toBe(1)
})

test("a single-attendee order makes whole_order and event_charges equal", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-equality")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "equal-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  // Sized ABOVE the ceiling on purpose: with a donation exactly at the ceiling
  // the `ceiling + 1` row would trip the remainder check first and the
  // expected ceiling code would never fire.
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 20_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  const eventChargesResult = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId, amountMinor: 10_000, scope: "event_charges" },
    ]),
  })
  expect(eventChargesResult.remainingMinor).toBe(10_000)

  const wholeOrderResult = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId, amountMinor: 10_000, scope: "whole_order" },
    ]),
  })
  expect(wholeOrderResult.remainingMinor).toBe(10_000)

  for (const scope of ["event_charges", "whole_order"] as const) {
    await expect(
      allocate(authed, {
        donationId,
        eventId,
        request: manualRequest([
          { attendeeId, amountMinor: 10_100, scope },
        ]),
      })
    ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_CEILING")
  }

  expect(await countAllocationRows(seeded)).toBe(1)
})

test("cross-donation: an obligation another donation already holds is refused", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-cross-donation")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "cross-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const firstDonationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const secondDonationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  await expect(
    allocate(authed, {
      donationId: firstDonationId,
      eventId,
      request: manualRequest([
        { attendeeId, amountMinor: 10_000, scope: "event_charges" },
      ]),
    })
  ).resolves.toMatchObject({ remainingMinor: 5_000 })

  // Without the exclude-self/include-others subtraction D2 is invisible to D1
  // and this second allocation would be accepted, leaving A allocated 20_000
  // against a 10_000 obligation.
  await expect(
    allocate(authed, {
      donationId: secondDonationId,
      eventId,
      request: manualRequest([
        { attendeeId, amountMinor: 10_000, scope: "event_charges" },
      ]),
    })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_CEILING")

  expect(await countAllocationRows(seeded)).toBe(1)
  // D2's derived remainder is still its full amount: nothing was recorded.
  const d2Result = await allocate(authed, {
    donationId: secondDonationId,
    eventId,
    request: manualRequest([]),
  })
  expect(d2Result.remainingMinor).toBe(15_000)
})

test("order capacity rejects a sibling whole_order pair and accepts its counterpart", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-capacity")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "cap-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "cap-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  // D is sized ABOVE the 20_000 order outstanding on purpose: if it were exactly
  // 20_000 the plan below would be caught by the remainder check first and the
  // capacity check would never run.
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 40_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  await expect(
    allocate(authed, {
      donationId,
      eventId,
      request: manualRequest([
        { attendeeId: first.attendeeId, amountMinor: 20_000, scope: "whole_order" },
        { attendeeId: second.attendeeId, amountMinor: 20_000, scope: "whole_order" },
      ]),
    })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY")
  expect(await countAllocationRows(seeded)).toBe(0)

  // A's 20_000 is itself legal; the SECOND row has only 0 of pool left, so the
  // refusal is about the pool decrement, not "any over-ceiling row fails".
  await expect(
    allocate(authed, {
      donationId,
      eventId,
      request: manualRequest([
        { attendeeId: first.attendeeId, amountMinor: 20_000, scope: "whole_order" },
        { attendeeId: second.attendeeId, amountMinor: 100, scope: "whole_order" },
      ]),
    })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY")
  expect(await countAllocationRows(seeded)).toBe(0)

  const accepted = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 12_000, scope: "whole_order" },
      { attendeeId: second.attendeeId, amountMinor: 8_000, scope: "whole_order" },
    ]),
  })
  expect(accepted.remainingMinor).toBe(20_000)
  const acceptedRows = await loadAllocationRows(seeded, donationId)
  expect(acceptedRows).toHaveLength(2)
  expect(
    acceptedRows.reduce((sum, row) => sum + row.amountMinor, 0)
  ).toBe(20_000)
})

test("CE-1: a scope-mixed pair on one order is rejected with ZERO rows", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-ce1")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "ce1-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "ce1-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  // Sized ABOVE the 20_000 order outstanding on purpose so the ORDER-CAPACITY
  // check is the one that fires, not the remainder check.
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 30_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  // Each row passes its OWN scope check (A 10_000 <= 10_000; B 20_000 <=
  // 20_000) and the remainder check passes at 30_000 <= 30_000. Any rule that
  // pools whole_order rows only accepts this.
  await expect(
    allocate(authed, {
      donationId,
      eventId,
      request: manualRequest([
        { attendeeId: first.attendeeId, amountMinor: 10_000, scope: "event_charges" },
        { attendeeId: second.attendeeId, amountMinor: 20_000, scope: "whole_order" },
      ]),
    })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY")
  expect(await countAllocationRows(seeded)).toBe(0)

  const accepted = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 8_000, scope: "event_charges" },
      { attendeeId: second.attendeeId, amountMinor: 12_000, scope: "whole_order" },
    ]),
  })
  expect(accepted.remainingMinor).toBe(10_000)
  const acceptedRows = await loadAllocationRows(seeded, donationId)
  expect(
    acceptedRows.reduce((sum, row) => sum + row.amountMinor, 0)
  ).toBe(20_000)
})

test("an operator can edit their OWN row upward (exclude SELF)", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-circularity")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "self-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId, amountMinor: 6_000, scope: "event_charges" },
    ]),
  })

  // If the ceiling included D1's own 6_000, A's ceiling would read 4_000 and
  // this 10_000 edit would be wrongly refused.
  const raised = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId, amountMinor: 10_000, scope: "event_charges" },
    ]),
  })
  expect(raised.remainingMinor).toBe(5_000)

  const rows = await loadAllocationRows(seeded, donationId)
  expect(rows).toHaveLength(1)
  expect(rows[0].amountMinor).toBe(10_000)
})

test("whole_order is also other-scoped: a second donation sees the first's claim", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-other-scoped")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "other-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "other-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const firstDonationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const secondDonationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  await expect(
    allocate(authed, {
      donationId: firstDonationId,
      eventId,
      request: manualRequest([
        { attendeeId: first.attendeeId, amountMinor: 12_000, scope: "whole_order" },
      ]),
    })
  ).resolves.toMatchObject({ remainingMinor: 3_000 })

  // B's whole_order ceiling for D2 is max(0, 20_000 - 12_000) = 8_000. D2's
  // remainder check (10_000 <= 15_000) passes, so the per-row scope ceiling is
  // the check that fires. A missing (or scope-filtered) by_orderId subtraction
  // reads 20_000 for B and would accept this.
  await expect(
    allocate(authed, {
      donationId: secondDonationId,
      eventId,
      request: manualRequest([
        { attendeeId: second.attendeeId, amountMinor: 10_000, scope: "whole_order" },
      ]),
    })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_CEILING")
  expect(await countAllocationRows(seeded)).toBe(1)

  // The bound is the order's outstanding net of D1's row, NOT a blanket
  // refusal of a second donation.
  const accepted = await allocate(authed, {
    donationId: secondDonationId,
    eventId,
    request: manualRequest([
      { attendeeId: second.attendeeId, amountMinor: 8_000, scope: "whole_order" },
    ]),
  })
  expect(accepted.remainingMinor).toBe(7_000)
  expect(await countAllocationRows(seeded)).toBe(2)
})

test("mixed scopes on one attendee are rejected (subtraction spans scopes)", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-mixed-attendee")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "mixed-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const firstDonationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const secondDonationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  await expect(
    allocate(authed, {
      donationId: firstDonationId,
      eventId,
      request: manualRequest([
        { attendeeId, amountMinor: 10_000, scope: "event_charges" },
      ]),
    })
  ).resolves.toMatchObject({ remainingMinor: 5_000 })

  // D1's event_charges claim counts against the order's pool, so D2's
  // whole_order ceiling is max(0, 10_000 - 10_000) = 0.
  await expect(
    allocate(authed, {
      donationId: secondDonationId,
      eventId,
      request: manualRequest([
        { attendeeId, amountMinor: 10_000, scope: "whole_order" },
      ]),
    })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_CEILING")

  expect(await countAllocationRows(seeded)).toBe(1)
  expect(await loadAllocationRows(seeded, secondDonationId)).toHaveLength(0)
})

test("cross-event targets and non-standalone donations fail closed and write nothing", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-event-one")
  const otherEventId = await seedEvent(seeded, "alloc-event-two")
  const local = await createAttendee(seeded, eventId, {
    attendeeKey: "guard-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const foreign = await createAttendee(seeded, otherEventId, {
    attendeeKey: "guard-foreign",
    name: "Foreign Attendee",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  // A target on another event.
  await expect(
    allocate(authed, {
      donationId,
      eventId,
      request: manualRequest([
        { attendeeId: foreign.attendeeId, amountMinor: 5_000, scope: "event_charges" },
      ]),
    })
  ).rejects.toThrow("DONATION_ALLOCATION_CROSS_EVENT")

  // A same-event target but the wrong event id in the args.
  await expect(
    allocate(authed, {
      donationId,
      eventId: otherEventId,
      request: manualRequest([
        { attendeeId: local.attendeeId, amountMinor: 5_000, scope: "event_charges" },
      ]),
    })
  ).rejects.toThrow("DONATION_ALLOCATION_CROSS_EVENT")

  // A donation belonging to another event.
  const foreignDonationId = await createDonation(seeded, otherEventId, {
    amountMinor: 15_000,
  })
  await expect(
    allocate(authed, {
      donationId: foreignDonationId,
      eventId,
      request: manualRequest([
        { attendeeId: local.attendeeId, amountMinor: 5_000, scope: "event_charges" },
      ]),
    })
  ).rejects.toThrow("DONATION_ALLOCATION_CROSS_EVENT")

  // An overpayment donation (donationKind !== "standalone").
  const overpaymentId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
    donationKind: "overpayment",
  })
  await expect(
    allocate(authed, {
      donationId: overpaymentId,
      eventId,
      request: manualRequest([
        { attendeeId: local.attendeeId, amountMinor: 5_000, scope: "event_charges" },
      ]),
    })
  ).rejects.toThrow("DONATION_NOT_STANDALONE")

  // A donation row carrying a string orderId is not standalone-shaped.
  const aliasDonationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
    orderId: "orders_provider_alias",
  })
  await expect(
    allocate(authed, {
      donationId: aliasDonationId,
      eventId,
      request: manualRequest([
        { attendeeId: local.attendeeId, amountMinor: 5_000, scope: "event_charges" },
      ]),
    })
  ).rejects.toThrow("DONATION_NOT_STANDALONE")

  // A donation that does not exist.
  const deletedDonationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  await seeded.mutation(async (ctx) => {
    await ctx.db.delete("payments", deletedDonationId)
  })
  await expect(
    allocate(authed, {
      donationId: deletedDonationId,
      eventId,
      request: manualRequest([
        { attendeeId: local.attendeeId, amountMinor: 5_000, scope: "event_charges" },
      ]),
    })
  ).rejects.toThrow("DONATION_ALLOCATION_NOT_FOUND")

  expect(await countAllocationRows(seeded)).toBe(0)
})

test("duplicate targets and unsupported methods are refused", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-plan-guards")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "plan-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  await expect(
    allocate(authed, {
      donationId,
      eventId,
      request: manualRequest([
        { attendeeId, amountMinor: 5_000, scope: "event_charges" },
        { attendeeId, amountMinor: 5_000, scope: "event_charges" },
      ]),
    })
  ).rejects.toThrow("DONATION_ALLOCATION_DUPLICATE_TARGET")

  const targets: TargetInput[] = [{ attendeeId, scope: "event_charges" }]
  for (const method of ["equal", "largest_balance_first"] as const) {
    await expect(
      allocate(authed, {
        donationId,
        eventId,
        request: { method, targets },
      })
    ).rejects.toThrow("DONATION_ALLOCATION_UNSUPPORTED_METHOD")
  }

  expect(await countAllocationRows(seeded)).toBe(0)
})

test("DACC-03: a successful allocation never touches the donation payment row", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-dacc03")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "dacc-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId, amountMinor: 5_000, scope: "event_charges" },
    ]),
  })

  const donation = await seeded.query(async (ctx) =>
    ctx.db.get("payments", donationId)
  )
  expect(donation).toMatchObject({
    donationKind: "standalone",
    status: "donation",
    amountMinor: 15_000,
  })
  expect(donation?.orderId).toBeUndefined()
  expect(donation?.eventId).toBe(eventId)
})

test("a single whole_order row may exceed the attendee's own outstanding (residual)", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-residual")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "residual-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "residual-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  // A's whole_order ceiling is the order's 20_000, so 15_000 is accepted even
  // though A's OWN attributable outstanding is 10_000. Phase 55's read
  // projection caps this row at the SCOPE ceiling and reports it fully applied
  // (appliedMinor === 15_000, exceedsCeiling === false); it is Phase 56's
  // targeted-first projection that caps at the attendee's own outstanding and
  // reports 5_000 unapplied. Do not mistake the Phase 55 figure for the
  // canonical economic number.
  const accepted = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 15_000, scope: "whole_order" },
    ]),
  })
  expect(accepted.remainingMinor).toBe(0)
  const rows = await loadAllocationRows(seeded, donationId)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    attendeeId: String(first.attendeeId),
    amountMinor: 15_000,
    scope: "whole_order",
  })
})

// ---------------------------------------------------------------------------
// Task 1 (plan 55-03): idempotent submissions (D-21)
// ---------------------------------------------------------------------------

test("a retried submission with the same key and digest replays with no second write", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-replay")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "replay-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  const request = manualRequest([
    { attendeeId, amountMinor: 6_000, scope: "event_charges" },
  ])
  const idempotencyKey = "replay-key"

  const first = await allocate(authed, {
    donationId,
    eventId,
    request,
    idempotencyKey,
  })
  expect(first).toMatchObject({
    donationId,
    allocatedTotalMinor: 6_000,
    remainingMinor: 9_000,
  })
  expect(await countAllocationRows(seeded)).toBe(1)
  expect(await countLedgerRows(seeded)).toBe(1)

  const second = await allocate(authed, {
    donationId,
    eventId,
    request,
    idempotencyKey,
  })

  // The STORED frozen result comes back verbatim — totals AND rows.
  expect(second.remainingMinor).toBe(first.remainingMinor)
  expect(second.allocatedTotalMinor).toBe(first.allocatedTotalMinor)
  expect(second.rows).toEqual(first.rows)
  expect(second).toEqual(first)

  // T-55-13: the replay allocated NOTHING a second time.
  expect(await countAllocationRows(seeded)).toBe(1)
  expect(await countLedgerRows(seeded)).toBe(1)
  expect(await loadAllocationRowDetails(seeded, donationId)).toHaveLength(1)
})

test("the same key with a different digest is a typed conflict and writes nothing", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-conflict")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "conflict-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const idempotencyKey = "conflict-key"

  await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId, amountMinor: 6_000, scope: "event_charges" },
    ]),
    idempotencyKey,
  })

  // A changed amount under the SAME key is not a replay. Returning the stored
  // result would be a lie (the replacement was never applied), and applying it
  // would break the replay contract — so it is a typed conflict.
  await expect(
    allocate(authed, {
      donationId,
      eventId,
      request: manualRequest([
        { attendeeId, amountMinor: 5_000, scope: "event_charges" },
      ]),
      idempotencyKey,
    })
  ).rejects.toThrow("DONATION_ALLOCATION_IDEMPOTENCY_CONFLICT")

  // A changed scope is a different digest too.
  await expect(
    allocate(authed, {
      donationId,
      eventId,
      request: manualRequest([
        { attendeeId, amountMinor: 6_000, scope: "whole_order" },
      ]),
      idempotencyKey,
    })
  ).rejects.toThrow("DONATION_ALLOCATION_IDEMPOTENCY_CONFLICT")

  expect(await countLedgerRows(seeded)).toBe(1)
  const rows = await loadAllocationRowDetails(seeded, donationId)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ amountMinor: 6_000, scope: "event_charges" })
})

test("the same request under a different key applies normally and gains a ledger row", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-fresh-key")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "fresh-key-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  const request = manualRequest([
    { attendeeId, amountMinor: 6_000, scope: "event_charges" },
  ])

  await allocate(authed, { donationId, eventId, request, idempotencyKey: "fresh-1" })
  await allocate(authed, { donationId, eventId, request, idempotencyKey: "fresh-2" })

  // Two submissions, two ledger rows, still ONE allocation row (set-replace).
  expect(await countLedgerRows(seeded)).toBe(2)
  expect(await countAllocationRows(seeded)).toBe(1)
})

test("a reordered-but-equivalent rows array under the same key replays", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-reorder")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "reorder-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "reorder-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 20_000,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const idempotencyKey = "reorder-key"

  const original = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 6_000, scope: "event_charges" },
      { attendeeId: second.attendeeId, amountMinor: 4_000, scope: "event_charges" },
    ]),
    idempotencyKey,
  })
  expect(await countAllocationRows(seeded)).toBe(2)

  // Same set, reversed submission order. The digest canonicalizes `rows` by
  // attendeeId, so this is the SAME request and must replay — not conflict.
  const reordered = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: second.attendeeId, amountMinor: 4_000, scope: "event_charges" },
      { attendeeId: first.attendeeId, amountMinor: 6_000, scope: "event_charges" },
    ]),
    idempotencyKey,
  })

  expect(reordered).toEqual(original)
  expect(await countAllocationRows(seeded)).toBe(2)
  expect(await countLedgerRows(seeded)).toBe(1)
})

test("an empty or blank idempotency key is refused before any other work", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-blank-key")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "blank-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const request = manualRequest([
    { attendeeId, amountMinor: 6_000, scope: "event_charges" },
  ])

  for (const idempotencyKey of ["", "   ", "\n\t "]) {
    await expect(
      allocate(authed, { donationId, eventId, request, idempotencyKey })
    ).rejects.toThrow("DONATION_ALLOCATION_INVALID_KEY")
  }

  // The blank-key guard runs BEFORE the donation guard: a missing donation
  // would otherwise raise DONATION_ALLOCATION_NOT_FOUND, but a blank key wins,
  // so a blank key can never be recorded and then mistaken for a replay.
  const goneDonationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  await seeded.mutation(async (ctx) => {
    await ctx.db.delete("payments", goneDonationId)
  })
  await expect(
    allocate(authed, {
      donationId: goneDonationId,
      eventId,
      request,
      idempotencyKey: "   ",
    })
  ).rejects.toThrow("DONATION_ALLOCATION_INVALID_KEY")

  expect(await countAllocationRows(seeded)).toBe(0)
  expect(await countLedgerRows(seeded)).toBe(0)
})

test("a replay after the ceilings have moved still returns the stored result", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-replay-stale")
  const { attendeeId, orderId } = await createAttendee(seeded, eventId, {
    attendeeKey: "replay-stale-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const idempotencyKey = "replay-stale-key"

  const request = manualRequest([
    { attendeeId, amountMinor: 6_000, scope: "event_charges" },
  ])
  const first = await allocate(authed, {
    donationId,
    eventId,
    request,
    idempotencyKey,
  })
  expect(first.remainingMinor).toBe(9_000)

  // Move the ceiling behind the stored row: A's attributable outstanding drops
  // from 10_000 to 4_000, so the stored 6_000 row no longer fits.
  await reduceTicketPrice(seeded, orderId, 4_000)

  // A FRESH submission of the same plan is now refused — proving the fixture
  // really moved the ceiling and that the replay below is not succeeding by
  // accident.
  await expect(
    allocate(authed, {
      donationId,
      eventId,
      request,
      idempotencyKey: "replay-stale-probe",
    })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_CEILING")

  // The replay returns the STORED answer and never recomputes money.
  const replay = await allocate(authed, {
    donationId,
    eventId,
    request,
    idempotencyKey,
  })
  expect(replay.remainingMinor).toBe(9_000)
  expect(replay.allocatedTotalMinor).toBe(6_000)
  expect(replay.rows).toEqual(first.rows)
  expect(await countLedgerRows(seeded)).toBe(1)
})

test("every allocation row carries the ledger row's id as its submissionId", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-provenance")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "prov-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "prov-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 20_000,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const idempotencyKey = "provenance-key"

  await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 6_000, scope: "event_charges" },
      { attendeeId: second.attendeeId, amountMinor: 4_000, scope: "event_charges" },
    ]),
    idempotencyKey,
  })

  const ledgerRow = await loadLedgerRow(seeded, donationId, idempotencyKey)
  expect(ledgerRow).not.toBeNull()
  expect(ledgerRow?.operation).toBe("allocate")
  expect(ledgerRow?.actor).toBe(adminIdentity.tokenIdentifier)
  // The ledger stores the frozen result it will replay.
  expect(ledgerRow?.allocatedTotalMinor).toBe(10_000)
  expect(ledgerRow?.remainingMinor).toBe(10_000)
  expect(ledgerRow?.rows).toHaveLength(2)

  const rows = await loadAllocationRowDetails(seeded, donationId)
  expect(rows).toHaveLength(2)

  // REGRESSION GUARD for the ledger-insert ORDER: if the ledger row were
  // inserted AFTER the allocation rows (or `submissionId` were not passed into
  // the writer), `submissionId` would be undefined here. The schema field is
  // optional, so NOTHING else in the gate would catch it — assert the strict
  // equality, never mere field presence.
  for (const row of rows) {
    expect(row.submissionId).not.toBeNull()
    expect(row.submissionId).toBe(ledgerRow?._id)
  }
})

