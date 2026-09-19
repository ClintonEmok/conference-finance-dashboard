/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import { loadAllocationCeilings } from "./donations"
import { loadCanonicalOrderBalances } from "./finance"
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

/**
 * The D-17 single-row additive mutation, keyed like `allocate` so the existing
 * "distinct submission" intent is preserved.
 */
let singleAllocationKeySeq = 0
function allocateOne(
  client: TestConvex,
  args: {
    donationId: Id<"payments">
    eventId: Id<"events">
    attendeeId: Id<"orderAttendees">
    amountMinor: number
    scope: AllocationScope
    idempotencyKey?: string
  }
) {
  singleAllocationKeySeq += 1
  return client.mutation(api.donations.allocateDonationToAttendee, {
    ...args,
    idempotencyKey: args.idempotencyKey ?? `auto-one-${singleAllocationKeySeq}`,
  })
}

/**
 * Drops ONE attendee's attributed charges by repricing only their ticket
 * selection — used to make a stored row stale WITHOUT collapsing the rest of the
 * order (which would drive the order-capacity check to zero).
 */
async function reduceAttendeeTicketPrice(
  t: TestConvex,
  attendeeId: Id<"orderAttendees">,
  priceMinor: number
): Promise<void> {
  await t.mutation(async (ctx) => {
    for await (const selection of ctx.db
      .query("orderTicketSelections")
      .withIndex("by_attendeeId", (q) => q.eq("attendeeId", attendeeId))) {
      await ctx.db.patch(
        "ticketTypes",
        selection.ticketTypeId as Id<"ticketTypes">,
        { priceMinor }
      )
    }
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
 * The donation-scoped ceiling map, read through the shared server projection
 * the writer and the summary both use. Returned as an ARRAY because `t.run`
 * serializes its result and a `Map` is not a Convex value. Needed only to
 * assert the D-12 relationship directly (both ceilings at once for one
 * attendee).
 */
async function loadCeilings(
  t: TestConvex,
  donationId: Id<"payments">,
  orderIds: Id<"orders">[]
) {
  return t.run(async (ctx) => {
    const ceilings = await loadAllocationCeilings(
      ctx as unknown as Parameters<typeof loadAllocationCeilings>[0],
      { donationId, orderIds }
    )
    return Array.from(ceilings.values())
  })
}

/**
 * One order's canonical balance, read through Phase 56's owner
 * (`loadCanonicalOrderBalances`). Returned as a plain object because `t.run`
 * serializes its result and a `Map` is not a Convex value.
 */
async function loadCanonicalBalance(t: TestConvex, orderId: Id<"orders">) {
  return t.run(async (ctx) => {
    const balances = await loadCanonicalOrderBalances({
      ctx: ctx as unknown as Parameters<
        typeof loadCanonicalOrderBalances
      >[0]["ctx"],
      orders: [{ _id: orderId }],
    })

    const balance = balances.get(String(orderId))
    if (!balance) {
      throw new Error(`no canonical balance for order ${String(orderId)}`)
    }

    return {
      appliedPaymentMinor: balance.appliedPaymentMinor,
      allocationCreditMinor: balance.allocationCreditMinor,
      paidAmountMinor: balance.paidAmountMinor,
      outstandingAmountMinor: balance.outstandingAmountMinor,
    }
  })
}

/** One row of `getDonationAllocationSummary`'s projection. */
type SummaryRow = {
  attendeeId: string
  orderId: string
  amountMinor: number
  scope: string
  scopeOutstandingMinor: number
  effectiveCapacityMinor: number
  appliedMinor: number
  unappliedMinor: number
  exceedsCeiling: boolean
  exceedsCapacity: boolean
  createdAt: number
  createdBy: string
}

type SummaryResult = {
  donationId: string
  eventId: string | null
  donationAmountMinor: number
  recordedAllocatedMinor: number
  remainingMinor: number
  rows: SummaryRow[]
}

/**
 * Calls the summary query with an authenticated client and types the result as
 * the documented projection shape.
 */
async function loadSummary(
  client: TestConvex,
  donationId: Id<"payments">
): Promise<SummaryResult> {
  return client.query(api.donations.getDonationAllocationSummary, { donationId })
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

test("duplicate targets are refused and both distribution methods dispatch server-side", async () => {
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
  expect(await countAllocationRows(seeded)).toBe(0)

  // The two distribution methods now dispatch to the pure engine: the client
  // supplies ONLY targets and scopes (no amounts), and the server computes every
  // distributed amount. A's event_charges ceiling is 10_000 while the donation
  // is 15_000, so each method places 10_000 and leaves the unplaceable 5_000 as
  // the derived remainder — a success, never a typed error (DON-05/D-20).
  const targets: TargetInput[] = [{ attendeeId, scope: "event_charges" }]
  for (const method of ["equal", "largest_balance_first"] as const) {
    const result = await allocate(authed, {
      donationId,
      eventId,
      request: { method, targets },
    })
    expect(result).toMatchObject({
      allocatedTotalMinor: 10_000,
      remainingMinor: 5_000,
    })

    const rows = await loadAllocationRows(seeded, donationId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      attendeeId: String(attendeeId),
      amountMinor: 10_000,
      scope: "event_charges",
    })
  }
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

// ---------------------------------------------------------------------------
// Task 2 (plan 55-03): removal as a hard delete plus an append-only audit
// ---------------------------------------------------------------------------

test("removing one allocation hard-deletes it, audits it, and leaves the siblings alone", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-remove")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "remove-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "remove-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 20_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  const allocated = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 6_000, scope: "event_charges" },
      { attendeeId: second.attendeeId, amountMinor: 4_000, scope: "whole_order" },
    ]),
  })
  expect(allocated.remainingMinor).toBe(10_000)
  const beforeRows = await loadAllocationRowDetails(seeded, donationId)
  const survivorRow = beforeRows.find(
    (row) => row.attendeeId === String(second.attendeeId)
  )
  expect(survivorRow).toBeDefined()

  const removal = await authed.mutation(api.donations.removeDonationAllocation, {
    donationId,
    eventId,
    attendeeId: first.attendeeId,
    idempotencyKey: "remove-1",
  })

  // The freed amount returns to the DERIVED remainder and nothing is clamped:
  // the pre-removal remainder was 10_000 and exactly the removed 6_000 comes
  // back.
  expect(removal.remainingMinor).toBe(16_000)
  expect(removal.allocatedTotalMinor).toBe(4_000)
  expect(removal.rows).toHaveLength(1)

  const afterRows = await loadAllocationRowDetails(seeded, donationId)
  expect(afterRows).toHaveLength(1)
  expect(afterRows[0].attendeeId).toBe(String(second.attendeeId))

  // The untouched sibling keeps its amount AND its provenance byte-identical.
  expect(afterRows[0]).toMatchObject({
    amountMinor: 4_000,
    scope: "whole_order",
    createdAt: survivorRow?.createdAt,
    createdBy: survivorRow?.createdBy,
    submissionId: survivorRow?.submissionId,
  })

  // T-55-15: exactly one immutable audit row with the full action recorded.
  const audits = await loadRemovalAuditRows(seeded, donationId)
  expect(audits).toHaveLength(1)
  expect(audits[0]).toMatchObject({
    donationId: String(donationId),
    eventId: String(eventId),
    orderId: String(first.orderId),
    attendeeId: String(first.attendeeId),
    amountMinor: 6_000,
    scope: "event_charges",
    actor: adminIdentity.tokenIdentifier,
  })
  expect(audits[0].removedAt).toBeGreaterThan(0)

  // No soft-delete tombstone survives.
  const rawRows = await seeded.run(async (ctx) => {
    const rows: Array<Record<string, unknown>> = []
    for await (const row of ctx.db
      .query("donationAllocations")
      .withIndex("by_donationId", (q) => q.eq("donationId", donationId))) {
      rows.push(row as unknown as Record<string, unknown>)
    }
    return rows
  })
  expect(rawRows).toHaveLength(1)
  expect(rawRows[0].removedAt).toBeUndefined()
  expect(rawRows[0].status).toBeUndefined()
})

test("removing the same allocation twice with the same key replays with one audit row", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-remove-replay")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "remove-replay-a",
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

  const firstRemoval = await authed.mutation(
    api.donations.removeDonationAllocation,
    { donationId, eventId, attendeeId, idempotencyKey: "remove-replay-key" }
  )
  const secondRemoval = await authed.mutation(
    api.donations.removeDonationAllocation,
    { donationId, eventId, attendeeId, idempotencyKey: "remove-replay-key" }
  )

  expect(firstRemoval.remainingMinor).toBe(15_000)
  expect(secondRemoval).toEqual(firstRemoval)
  expect(await countRemovalAuditRows(seeded)).toBe(1)
  expect(await countAllocationRows(seeded)).toBe(0)
  expect(await countLedgerRows(seeded)).toBe(2)
})

test("a removal audit row carries the remove submission's id as its submissionId", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-remove-provenance")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "remove-prov-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const idempotencyKey = "remove-provenance-key"

  await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId, amountMinor: 6_000, scope: "event_charges" },
    ]),
  })
  await authed.mutation(api.donations.removeDonationAllocation, {
    donationId,
    eventId,
    attendeeId,
    idempotencyKey,
  })

  const ledgerRow = await loadLedgerRow(seeded, donationId, idempotencyKey)
  expect(ledgerRow).not.toBeNull()
  expect(ledgerRow?.operation).toBe("remove")
  expect(ledgerRow?.actor).toBe(adminIdentity.tokenIdentifier)

  const audits = await loadRemovalAuditRows(seeded, donationId)
  expect(audits).toHaveLength(1)
  // Same contract the batch path guarantees: assert the strict equality, never
  // mere field presence.
  expect(audits[0].submissionId).not.toBeNull()
  expect(audits[0].submissionId).toBe(ledgerRow?._id)
})

test("reusing an allocate key for a removal is an intended conflict and deletes nothing", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-remove-conflict")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "remove-conflict-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const allocationKey = "shared-key"

  await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId, amountMinor: 6_000, scope: "event_charges" },
    ]),
    idempotencyKey: allocationKey,
  })

  // A key identifies ONE SUBMISSION, not one operation: the key is scoped per
  // donation only, so this is a conflict rather than a replay.
  await expect(
    authed.mutation(api.donations.removeDonationAllocation, {
      donationId,
      eventId,
      attendeeId,
      idempotencyKey: allocationKey,
    })
  ).rejects.toThrow("DONATION_ALLOCATION_IDEMPOTENCY_CONFLICT")

  expect(await countAllocationRows(seeded)).toBe(1)
  expect(await countRemovalAuditRows(seeded)).toBe(0)
  expect(await countLedgerRows(seeded)).toBe(1)
})

test("removing a non-existent allocation is refused with no audit row", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-remove-missing")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "remove-missing-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "remove-missing-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 6_000, scope: "event_charges" },
    ]),
  })

  // B has no row on this donation.
  await expect(
    authed.mutation(api.donations.removeDonationAllocation, {
      donationId,
      eventId,
      attendeeId: second.attendeeId,
      idempotencyKey: "remove-missing-key",
    })
  ).rejects.toThrow("DONATION_ALLOCATION_NOT_FOUND")

  // And a removal against a donation with no allocations at all.
  const emptyDonationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  await expect(
    authed.mutation(api.donations.removeDonationAllocation, {
      donationId: emptyDonationId,
      eventId,
      attendeeId: first.attendeeId,
      idempotencyKey: "remove-missing-key-2",
    })
  ).rejects.toThrow("DONATION_ALLOCATION_NOT_FOUND")

  expect(await countAllocationRows(seeded)).toBe(1)
  expect(await countRemovalAuditRows(seeded)).toBe(0)
})

test("removal is refused for a cross-event or non-standalone donation and writes nothing", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-remove-guards-one")
  const otherEventId = await seedEvent(seeded, "alloc-remove-guards-two")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "remove-guard-a",
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

  // Wrong event id in the args.
  await expect(
    authed.mutation(api.donations.removeDonationAllocation, {
      donationId,
      eventId: otherEventId,
      attendeeId,
      idempotencyKey: "remove-guard-1",
    })
  ).rejects.toThrow("DONATION_ALLOCATION_CROSS_EVENT")

  // A donation that is not a same-event standalone donation.
  const overpaymentId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
    donationKind: "overpayment",
  })
  await expect(
    authed.mutation(api.donations.removeDonationAllocation, {
      donationId: overpaymentId,
      eventId,
      attendeeId,
      idempotencyKey: "remove-guard-2",
    })
  ).rejects.toThrow("DONATION_NOT_STANDALONE")

  // A blank key is refused before anything else.
  await expect(
    authed.mutation(api.donations.removeDonationAllocation, {
      donationId,
      eventId,
      attendeeId,
      idempotencyKey: " ",
    })
  ).rejects.toThrow("DONATION_ALLOCATION_INVALID_KEY")

  expect(await countAllocationRows(seeded)).toBe(1)
  expect(await countRemovalAuditRows(seeded)).toBe(0)
})

test("unauthenticated removal is unauthorized and deletes nothing", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-remove-auth")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "remove-auth-a",
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

  const anonymous = convexTest(schema, modules)
  await expect(
    anonymous.mutation(api.donations.removeDonationAllocation, {
      donationId,
      eventId,
      attendeeId,
      idempotencyKey: "remove-anon",
    })
  ).rejects.toThrow("Unauthorized")

  expect(await countAllocationRows(seeded)).toBe(1)
  expect(await countRemovalAuditRows(seeded)).toBe(0)
})

test("DACC-03: a removal never touches the donation payment row", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-remove-dacc03")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "remove-dacc-a",
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
  await authed.mutation(api.donations.removeDonationAllocation, {
    donationId,
    eventId,
    attendeeId,
    idempotencyKey: "remove-dacc-key",
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

// ---------------------------------------------------------------------------
// Task 3 (plan 55-03): the scope-aware staleness read projection (D-16/D-18)
// ---------------------------------------------------------------------------

test("a fresh allocation reports every row fully applied with no excess", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-summary-fresh")
  const { attendeeId, orderId } = await createAttendee(seeded, eventId, {
    attendeeKey: "summary-a",
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

  const summary = await loadSummary(authed, donationId)

  expect(summary.donationId).toBe(donationId)
  expect(summary.eventId).toBe(eventId)
  expect(summary.donationAmountMinor).toBe(15_000)
  expect(summary.recordedAllocatedMinor).toBe(6_000)
  expect(summary.remainingMinor).toBe(9_000)
  expect(summary.rows).toHaveLength(1)

  const row = summary.rows[0]
  expect(row).toMatchObject({
    attendeeId: String(attendeeId),
    orderId: String(orderId),
    amountMinor: 6_000,
    scope: "event_charges",
    scopeOutstandingMinor: 10_000,
    effectiveCapacityMinor: 10_000,
    appliedMinor: 6_000,
    unappliedMinor: 0,
    exceedsCeiling: false,
    exceedsCapacity: false,
  })
  expect(row.createdAt).toBeGreaterThan(0)
  expect(row.createdBy).toBe(adminIdentity.tokenIdentifier)

  // The donation-level remainder is the recorded total, never the applied one.
  expect(summary.remainingMinor).toBe(
    summary.donationAmountMinor -
      summary.rows.reduce((sum, entry) => sum + entry.amountMinor, 0)
  )
})

test("a stored row whose ceiling dropped keeps its amount and reports the excess", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-summary-stale")
  const { attendeeId, orderId } = await createAttendee(seeded, eventId, {
    attendeeKey: "summary-stale-a",
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

  // The balance drops BEHIND the stored row and the row is never touched.
  await reduceTicketPrice(seeded, orderId, 4_000)
  expect(await loadAllocationRowDetails(seeded, donationId)).toHaveLength(1)

  const summary = await loadSummary(authed, donationId)
  const row = summary.rows[0]

  // D-16/D-04: the recorded amount is NOT rewritten.
  expect(row.amountMinor).toBe(6_000)
  expect(row.scopeOutstandingMinor).toBe(4_000)
  // The cap-and-report shape, mirroring `deriveBalanceAmounts`.
  expect(row.appliedMinor).toBe(Math.min(6_000, 4_000))
  expect(row.unappliedMinor).toBe(6_000 - row.appliedMinor)
  expect(row.unappliedMinor).toBeGreaterThan(0)
  expect(row.exceedsCeiling).toBe(true)
  expect(row.effectiveCapacityMinor).toBe(4_000)
  expect(row.exceedsCapacity).toBe(true)

  // T-55-16: a stale row must NOT free budget. The remainder is derived from
  // the RECORDED 6_000, so it is unchanged at 15_000 - 6_000.
  expect(summary.donationAmountMinor).toBe(15_000)
  expect(summary.recordedAllocatedMinor).toBe(6_000)
  expect(summary.remainingMinor).toBe(9_000)

  // Nothing is negative.
  for (const value of [
    row.amountMinor,
    row.scopeOutstandingMinor,
    row.effectiveCapacityMinor,
    row.appliedMinor,
    row.unappliedMinor,
    summary.recordedAllocatedMinor,
    summary.remainingMinor,
  ]) {
    expect(value).toBeGreaterThanOrEqual(0)
  }
})

test("the read projection excludes SELF: a donation's own row never lowers its own ceiling", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-summary-self")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "summary-self-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 10_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId, amountMinor: 10_000, scope: "event_charges" },
    ]),
  })

  const summary = await loadSummary(authed, donationId)
  const row = summary.rows[0]

  // If the summary re-included D1's own 10_000 row, the ceiling would read 0
  // and this row would report itself fully unapplied — the read-side
  // counterpart of the writer's exclude-SELF rule.
  expect(row.scopeOutstandingMinor).toBe(10_000)
  expect(row.appliedMinor).toBe(10_000)
  expect(row.unappliedMinor).toBe(0)
  expect(row.exceedsCeiling).toBe(false)
})

test("the read projection includes OTHERS: a competing donation's claim shows as unapplied", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-summary-others")
  const { attendeeId, orderId } = await createAttendee(seeded, eventId, {
    attendeeKey: "summary-others-a",
    name: "Attendee A",
    ticketPriceMinor: 20_000,
  })
  const firstDonationId = await createDonation(seeded, eventId, {
    amountMinor: 10_000,
  })
  const secondDonationId = await createDonation(seeded, eventId, {
    amountMinor: 10_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  // BOTH rows are pinned to the SAME scope (`event_charges`) — load-bearing:
  // the two subtractions are asymmetric (an `event_charges` ceiling subtracts
  // only same-scope rows, a `whole_order` ceiling subtracts any scope), so a
  // mixed-scope pair would produce a different number for a reason unrelated to
  // the defect under test.
  await allocate(authed, {
    donationId: firstDonationId,
    eventId,
    request: manualRequest([
      { attendeeId, amountMinor: 10_000, scope: "event_charges" },
    ]),
  })
  // D2's ceiling is 20_000 - D1's 10_000 = 10_000, so this is accepted.
  await allocate(authed, {
    donationId: secondDonationId,
    eventId,
    request: manualRequest([
      { attendeeId, amountMinor: 10_000, scope: "event_charges" },
    ]),
  })

  // Reduce A's obligation to 15_000 WITHOUT touching either row.
  await reduceTicketPrice(seeded, orderId, 15_000)

  for (const donationId of [firstDonationId, secondDonationId]) {
    const summary = await loadSummary(authed, donationId)
    const row = summary.rows[0]

    // 15_000 (A's new due) - 10_000 (the OTHER donation's same-scope claim).
    // A payment-only ceiling would read 15_000 here and report
    // `appliedMinor === 10_000`, so this assertion fails if the
    // include-OTHERS subtraction is missing from the read path.
    expect(row.scopeOutstandingMinor).toBe(5_000)
    expect(row.appliedMinor).toBe(5_000)
    expect(row.unappliedMinor).toBe(5_000)
    expect(row.exceedsCeiling).toBe(true)

    // The recorded amount is untouched and the remainder still counts ALL of
    // it — a stale row never frees budget.
    expect(row.amountMinor).toBe(10_000)
    expect(summary.recordedAllocatedMinor).toBe(10_000)
    expect(summary.remainingMinor).toBe(0)
  }
})

test("removing a row raises the summary's remainder by exactly the freed amount", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-summary-remove")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "summary-remove-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "summary-remove-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 20_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 6_000, scope: "event_charges" },
      { attendeeId: second.attendeeId, amountMinor: 4_000, scope: "event_charges" },
    ]),
  })

  const before = await loadSummary(authed, donationId)
  expect(before.remainingMinor).toBe(10_000)
  expect(before.rows).toHaveLength(2)

  await authed.mutation(api.donations.removeDonationAllocation, {
    donationId,
    eventId,
    attendeeId: first.attendeeId,
    idempotencyKey: "summary-remove-key",
  })

  const after = await loadSummary(authed, donationId)
  expect(after.remainingMinor).toBe(before.remainingMinor + 6_000)
  expect(after.recordedAllocatedMinor).toBe(4_000)
  expect(after.rows).toHaveLength(1)
  expect(after.rows[0].attendeeId).toBe(String(second.attendeeId))
})

test("whole_order >= event_charges only while no other donation holds the order", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-summary-d12")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "d12-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "d12-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 20_000,
  })

  // No competing claim: both ceilings reduce to their payment-only bases, so
  // the order's outstanding (20_000) is >= any single attendee's (10_000).
  const quiet = await loadCeilings(seeded, donationId, [first.orderId])
  expect(
    quiet.find((ceiling) => ceiling.attendeeId === String(first.attendeeId))
      ?.wholeOrderOutstandingMinor
  ).toBe(20_000)
  expect(
    quiet.find((ceiling) => ceiling.attendeeId === String(first.attendeeId))
      ?.eventChargesOutstandingMinor
  ).toBe(10_000)
  // "for every attendee" — both attendees of the order are covered.
  expect(quiet).toHaveLength(2)
  for (const ceiling of quiet) {
    expect(ceiling.wholeOrderOutstandingMinor).toBeGreaterThanOrEqual(
      ceiling.eventChargesOutstandingMinor
    )
  }
  expect(second.attendeeId).toBeDefined()

  // A single-attendee order makes them exactly equal.
  const solo = await createAttendee(seeded, eventId, {
    attendeeKey: "d12-solo",
    name: "Solo Attendee",
    ticketPriceMinor: 8_000,
  })
  const soloCeilings = await loadCeilings(seeded, donationId, [solo.orderId])
  const soloCeiling = soloCeilings.find(
    (ceiling) => ceiling.attendeeId === String(solo.attendeeId)
  )
  expect(soloCeiling?.wholeOrderOutstandingMinor).toBe(
    soloCeiling?.eventChargesOutstandingMinor
  )

  // NOW a competing donation claims 15_000 of the order with `whole_order`.
  const authed = seeded.withIdentity(adminIdentity)
  await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 15_000, scope: "whole_order" },
    ]),
  })

  // A second donation that holds no rows of its own, used purely as the
  // "other donation" reader — with exclude-SELF, reading the ceilings as D1
  // would hide D1's own 15_000 claim.
  const probeDonationId = await createDonation(seeded, eventId, {
    amountMinor: 20_000,
  })

  // COUNTER-EXAMPLE, and it is CORRECT — do not "fix" it. This is read for a
  // DIFFERENT donation (the probe), so D1's 15_000 becomes an "other"
  // donation's claim: the `whole_order` subtraction removes it from the ORDER
  // (5_000 left), while an `event_charges` ceiling subtracts only same-scope
  // rows on that attendee (none — D1's row is `whole_order`), so it stays at
  // the attendee's full 10_000. The two ceilings legitimately cross once
  // another donation holds a claim on the order.
  const competing = await loadCeilings(seeded, probeDonationId, [first.orderId])
  const firstCeiling = competing.find(
    (ceiling) => ceiling.attendeeId === String(first.attendeeId)
  )
  const secondCeiling = competing.find(
    (ceiling) => ceiling.attendeeId === String(second.attendeeId)
  )
  expect(firstCeiling?.wholeOrderOutstandingMinor).toBe(5_000)
  expect(firstCeiling?.eventChargesOutstandingMinor).toBe(10_000)
  expect(secondCeiling?.wholeOrderOutstandingMinor).toBe(5_000)
  expect(secondCeiling?.eventChargesOutstandingMinor).toBe(10_000)
  expect(secondCeiling!.wholeOrderOutstandingMinor).toBeLessThan(
    secondCeiling!.eventChargesOutstandingMinor
  )
})

test("the summary is authenticated, refuses a missing donation and never leaks rows", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-summary-guards")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "summary-guard-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const otherDonationId = await createDonation(seeded, eventId, {
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

  const anonymous = convexTest(schema, modules)
  await expect(
    anonymous.query(api.donations.getDonationAllocationSummary, { donationId })
  ).rejects.toThrow("Unauthorized")

  const goneDonationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  await seeded.mutation(async (ctx) => {
    await ctx.db.delete("payments", goneDonationId)
  })
  await expect(
    authed.query(api.donations.getDonationAllocationSummary, {
      donationId: goneDonationId,
    })
  ).rejects.toThrow("Donation not found")

  // A donation with allocations never reports another donation's rows...
  const otherSummary = await loadSummary(authed, otherDonationId)
  expect(otherSummary.rows).toHaveLength(0)
  expect(otherSummary.recordedAllocatedMinor).toBe(0)
  expect(otherSummary.remainingMinor).toBe(15_000)

  // ...and the first donation still reports exactly its own single row.
  const summary = await loadSummary(authed, donationId)
  expect(summary.rows).toHaveLength(1)
  expect(summary.rows[0].attendeeId).toBe(String(attendeeId))
})

// ---------------------------------------------------------------------------
// Task 1 (plan 55-04): the single-row D-17 additive path
// ---------------------------------------------------------------------------

test("allocateDonationToAttendee appends a row without disturbing the existing sibling", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "one-append")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "one-append-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "one-append-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 20_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 6_000, scope: "event_charges" },
    ]),
  })
  const before = await loadAllocationRowDetails(seeded, donationId)
  const siblingBefore = before.find(
    (row) => row.attendeeId === String(first.attendeeId)
  )
  expect(siblingBefore).toBeDefined()

  const result = await allocateOne(authed, {
    donationId,
    eventId,
    attendeeId: second.attendeeId,
    amountMinor: 4_000,
    scope: "event_charges",
  })
  expect(result).toMatchObject({
    allocatedTotalMinor: 10_000,
    remainingMinor: 10_000,
  })

  const after = await loadAllocationRowDetails(seeded, donationId)
  expect(after).toHaveLength(2)

  const siblingAfter = after.find(
    (row) => row.attendeeId === String(first.attendeeId)
  )
  // D-04/D-17/T-55-21: an UNTOUCHED sibling keeps its amount AND its provenance
  // byte-identical — the merge must never re-stamp a row it did not change.
  expect(siblingAfter).toMatchObject({
    amountMinor: siblingBefore?.amountMinor,
    scope: siblingBefore?.scope,
    createdAt: siblingBefore?.createdAt,
    createdBy: siblingBefore?.createdBy,
    submissionId: siblingBefore?.submissionId,
  })

  expect(
    after.find((row) => row.attendeeId === String(second.attendeeId))?.amountMinor
  ).toBe(4_000)
})

test("allocateDonationToAttendee replaces the target's own row and moves the remainder exactly", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "one-replace")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "one-replace-a",
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

  const raised = await allocateOne(authed, {
    donationId,
    eventId,
    attendeeId,
    amountMinor: 10_000,
    scope: "event_charges",
  })
  expect(raised).toMatchObject({
    allocatedTotalMinor: 10_000,
    remainingMinor: 5_000,
  })

  let rows = await loadAllocationRowDetails(seeded, donationId)
  expect(rows).toHaveLength(1)
  expect(rows[0].amountMinor).toBe(10_000)

  const lowered = await allocateOne(authed, {
    donationId,
    eventId,
    attendeeId,
    amountMinor: 4_000,
    scope: "event_charges",
  })
  expect(lowered).toMatchObject({
    allocatedTotalMinor: 4_000,
    remainingMinor: 11_000,
  })

  rows = await loadAllocationRowDetails(seeded, donationId)
  // D-02: exactly ONE row per (donation, attendee) — this was a replacement,
  // never a second row.
  expect(rows).toHaveLength(1)
  expect(rows[0].amountMinor).toBe(4_000)
})

test("a single-row amount beyond the free remainder is refused and writes nothing", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "one-remainder")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "one-rem-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "one-rem-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 10_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 6_000, scope: "event_charges" },
      { attendeeId: second.attendeeId, amountMinor: 3_000, scope: "event_charges" },
    ]),
  })
  const before = await loadAllocationRows(seeded, donationId)
  expect(before.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(9_000)

  // availableMinor = remaining(1_000) + A's OWN recorded(6_000) = 7_000, and the
  // row asks for 8_000. The DONATION's money is the binding bound: A's ceiling is
  // 10_000 and the order pool is 20_000 − 3_000 = 17_000, so neither fires.
  await expect(
    allocateOne(authed, {
      donationId,
      eventId,
      attendeeId: first.attendeeId,
      amountMinor: 8_000,
      scope: "event_charges",
    })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_REMAINDER")

  const after = await loadAllocationRows(seeded, donationId)
  expect(after).toEqual(before)

  // A zero or negative amount is not a way to clear a row (that is
  // removeDonationAllocation's job).
  for (const amountMinor of [0, -1]) {
    await expect(
      allocateOne(authed, {
        donationId,
        eventId,
        attendeeId: first.attendeeId,
        amountMinor,
        scope: "event_charges",
      })
    ).rejects.toThrow("DONATION_ALLOCATION_INVALID_AMOUNT")
  }
  expect(await loadAllocationRows(seeded, donationId)).toEqual(before)
})

test("a single-row edit can raise its own row to the attendee's real outstanding (exclude SELF)", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "one-self")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "one-self-a",
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

  // The ceiling for A EXCLUDES D1's own 6_000, so it still reads 10_000, while
  // `availableMinor` re-adds the 6_000 so the 10_000 replacement is legal. If
  // either half were wrong this edit would be wrongly refused.
  const raised = await allocateOne(authed, {
    donationId,
    eventId,
    attendeeId,
    amountMinor: 10_000,
    scope: "event_charges",
  })
  expect(raised).toMatchObject({
    allocatedTotalMinor: 10_000,
    remainingMinor: 5_000,
  })

  const rows = await loadAllocationRowDetails(seeded, donationId)
  expect(rows).toHaveLength(1)
  expect(rows[0].amountMinor).toBe(10_000)

  const summary = await loadSummary(authed, donationId)
  expect(summary.remainingMinor).toBe(5_000)
})

test("a single-row edit cannot walk past another donation's claim (include OTHERS)", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "one-others")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "one-others-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const firstDonationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const secondDonationId = await createDonation(seeded, eventId, {
    amountMinor: 10_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  await allocate(authed, {
    donationId: firstDonationId,
    eventId,
    request: manualRequest([
      { attendeeId, amountMinor: 6_000, scope: "event_charges" },
    ]),
  })

  // D2's ceiling is max(0, 10_000 − 6_000) = 4_000, so this is accepted and A
  // is now fully claimed (6_000 + 4_000 = 10_000).
  await allocate(authed, {
    donationId: secondDonationId,
    eventId,
    request: manualRequest([
      { attendeeId, amountMinor: 4_000, scope: "event_charges" },
    ]),
  })

  // D1's ceiling is max(0, 10_000 due − 4_000 from D2) = 6_000, so 10_000 is
  // refused. This is the single-row counterpart of the cross-donation rejection
  // and it fails if the `by_attendeeId` subtraction is dropped from the
  // single-row ceiling load.
  await expect(
    allocateOne(authed, {
      donationId: firstDonationId,
      eventId,
      attendeeId,
      amountMinor: 10_000,
      scope: "event_charges",
    })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_CEILING")

  // The refusal rolled back: D1's row is STILL 6_000 and D2's is still 4_000.
  const firstRows = await loadAllocationRows(seeded, firstDonationId)
  expect(firstRows).toHaveLength(1)
  expect(firstRows[0].amountMinor).toBe(6_000)
  const secondRows = await loadAllocationRows(seeded, secondDonationId)
  expect(secondRows).toHaveLength(1)
  expect(secondRows[0].amountMinor).toBe(4_000)
})

test("CE-2: an additive follow-up cannot push the order past its outstanding", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "one-ce2")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "one-ce2-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "one-ce2-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  // D is sized ABOVE the €200 order outstanding on purpose, so the ORDER-CAPACITY
  // bound — not the remainder bound — is what refuses the follow-up below.
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 30_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  // (1) D records €200 `whole_order` on A against the €200 order outstanding.
  const initial = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 20_000, scope: "whole_order" },
    ]),
  })
  expect(initial).toMatchObject({
    allocatedTotalMinor: 20_000,
    remainingMinor: 10_000,
  })

  // (2) The additive follow-up to B must be refused. A's €200 row is this
  // donation's OWN other row on the order, so `alreadyClaimedByOrder` is 200 and
  // the order capacity is `200 − 200 = 0`. The CEILING alone cannot catch this:
  // `loadAllocationCeilings` excludes ALL of D's own rows, so it still reads
  // `wholeOrderOutstandingMinor === 200`, and `availableMinor === 10_000` would
  // also fit the €100 row. A validator without the `alreadyClaimedByOrder` term
  // accepts this and leaves €300 allocated against a €200 order.
  //
  // The firing code is DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY — the
  // order-capacity bound (`wholeOrderOutstanding − alreadyClaimedByOrder`). The
  // distinct, narrower bound that throws DONATION_ALLOCATION_EXCEEDS_CEILING is
  // the include-OTHERS test above; the two codes never collapse.
  await expect(
    allocateOne(authed, {
      donationId,
      eventId,
      attendeeId: second.attendeeId,
      amountMinor: 10_000,
      scope: "whole_order",
    })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY")

  expect(await countAllocationRows(seeded)).toBe(1)
  const rows = await loadAllocationRows(seeded, donationId)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    attendeeId: String(first.attendeeId),
    amountMinor: 20_000,
    scope: "whole_order",
  })
  expect(
    rows.find((row) => row.attendeeId === String(second.attendeeId))
  ).toBeUndefined()

  const summary = await loadSummary(authed, donationId)
  expect(summary.remainingMinor).toBe(10_000)

  // (3) Control on a FRESH order of the same shape — NOT the step-(1) order.
  // Reusing it would be a self-contradiction: D's €200 row is still present
  // there, so its wholeOrderOutstandingMinor would read max(0, 200 − 200) = 0
  // and the ACCEPTED outcome below would be unreachable. The fresh order has NO
  // D row on it.
  const freshFirst = await createAttendee(seeded, eventId, {
    attendeeKey: "one-ce2-fresh-a",
    name: "Fresh A",
    ticketPriceMinor: 10_000,
  })
  const freshSecond = await createAttendee(seeded, eventId, {
    orderId: freshFirst.orderId,
    attendeeKey: "one-ce2-fresh-b",
    name: "Fresh B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const secondDonationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })

  await allocate(authed, {
    donationId: secondDonationId,
    eventId,
    request: manualRequest([
      { attendeeId: freshFirst.attendeeId, amountMinor: 10_000, scope: "whole_order" },
    ]),
  })
  // D2's €100 row is the only row on the fresh order before the follow-up.
  expect(await loadAllocationRows(seeded, secondDonationId)).toHaveLength(1)

  // capacity = 200 − 100 = 100; available = remaining(50) + 0 = 50 → ACCEPTED.
  // The rule is a capacity bound, not a blanket refusal of follow-up rows.
  const followUp = await allocateOne(authed, {
    donationId: secondDonationId,
    eventId,
    attendeeId: freshSecond.attendeeId,
    amountMinor: 5_000,
    scope: "whole_order",
  })
  expect(followUp).toMatchObject({
    allocatedTotalMinor: 15_000,
    remainingMinor: 0,
  })

  const freshRows = await loadAllocationRows(seeded, secondDonationId)
  expect(freshRows).toHaveLength(2)
  expect(
    freshRows.reduce((sum, row) => sum + row.amountMinor, 0)
  ).toBe(15_000)
})

test("a distribution skips a target another donation already claimed (no row, leftover is success)", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "one-dist-others")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "one-dist-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const firstDonationId = await createDonation(seeded, eventId, {
    amountMinor: 10_000,
  })
  const secondDonationId = await createDonation(seeded, eventId, {
    amountMinor: 50_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  // D1 fully claims A under `event_charges`.
  await allocate(authed, {
    donationId: firstDonationId,
    eventId,
    request: manualRequest([
      { attendeeId, amountMinor: 10_000, scope: "event_charges" },
    ]),
  })

  // D2's only target has a zero donation-scoped ceiling, so it is SKIPPED — no
  // row is written and the entire donation surfaces as the derived remainder.
  // That is SUCCESS, never the typed error a `manual` row would raise (D-20).
  const committed = await allocate(authed, {
    donationId: secondDonationId,
    eventId,
    request: {
      method: "equal",
      targets: [{ attendeeId, scope: "event_charges" }],
    },
  })
  expect(committed).toMatchObject({
    allocatedTotalMinor: 0,
    remainingMinor: 50_000,
  })
  expect(await loadAllocationRows(seeded, secondDonationId)).toHaveLength(0)
})

test("D-17: an additive allocation to B never repairs a stale sibling A", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "one-d17")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "one-d17-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "one-d17-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 20_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 10_000, scope: "event_charges" },
    ]),
  })

  // Move A's ceiling BEHIND its stored row (A now owes 2_000, its row is
  // 10_000), so A's row is stale and would fail a whole-set re-validation.
  await reduceAttendeeTicketPrice(seeded, first.attendeeId, 2_000)

  // D-17: allocating to B validates ONLY B's row, so it succeeds even though A
  // is stale. available = remaining(10_000) + B's recorded(0) = 10_000; B's
  // ceiling is 10_000; the order pool is wholeOrder 12_000 − A's own 10_000
  // = 2_000, which bounds the row at 2_000.
  const additive = await allocateOne(authed, {
    donationId,
    eventId,
    attendeeId: second.attendeeId,
    amountMinor: 2_000,
    scope: "event_charges",
  })
  expect(additive).toMatchObject({
    allocatedTotalMinor: 12_000,
    remainingMinor: 8_000,
  })

  const rows = await loadAllocationRowDetails(seeded, donationId)
  expect(rows).toHaveLength(2)
  const staleA = rows.find((row) => row.attendeeId === String(first.attendeeId))
  // A's recorded amount is UNCHANGED — never silently rewritten (D-04/D-16).
  expect(staleA?.amountMinor).toBe(10_000)

  const summary = await loadSummary(authed, donationId)
  const aRow = summary.rows.find(
    (row) => row.attendeeId === String(first.attendeeId)
  )
  expect(aRow?.amountMinor).toBe(10_000)
  expect(aRow?.exceedsCeiling).toBe(true)
})

test("allocateDonationToAttendee replays with the same key and conflicts on a changed digest", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "one-replay")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "one-replay-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const idempotencyKey = "one-replay-key"

  const first = await allocateOne(authed, {
    donationId,
    eventId,
    attendeeId,
    amountMinor: 6_000,
    scope: "event_charges",
    idempotencyKey,
  })
  expect(first).toMatchObject({
    allocatedTotalMinor: 6_000,
    remainingMinor: 9_000,
  })

  const second = await allocateOne(authed, {
    donationId,
    eventId,
    attendeeId,
    amountMinor: 6_000,
    scope: "event_charges",
    idempotencyKey,
  })
  expect(second).toEqual(first)
  expect(await countAllocationRows(seeded)).toBe(1)
  expect(await countLedgerRows(seeded)).toBe(1)

  // A different amount under the same key is a typed conflict, not a replay.
  await expect(
    allocateOne(authed, {
      donationId,
      eventId,
      attendeeId,
      amountMinor: 5_000,
      scope: "event_charges",
      idempotencyKey,
    })
  ).rejects.toThrow("DONATION_ALLOCATION_IDEMPOTENCY_CONFLICT")

  expect(await countAllocationRows(seeded)).toBe(1)
  expect(await countLedgerRows(seeded)).toBe(1)
})

test("the row written by allocateDonationToAttendee carries its allocate_one ledger id", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "one-provenance")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "one-prov-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const idempotencyKey = "one-provenance-key"

  await allocateOne(authed, {
    donationId,
    eventId,
    attendeeId,
    amountMinor: 6_000,
    scope: "event_charges",
    idempotencyKey,
  })

  const ledgerRow = await loadLedgerRow(seeded, donationId, idempotencyKey)
  expect(ledgerRow).not.toBeNull()
  expect(ledgerRow?.operation).toBe("allocate_one")
  expect(ledgerRow?.actor).toBe(adminIdentity.tokenIdentifier)
  expect(ledgerRow?.allocatedTotalMinor).toBe(6_000)
  expect(ledgerRow?.remainingMinor).toBe(9_000)

  const rows = await loadAllocationRowDetails(seeded, donationId)
  expect(rows).toHaveLength(1)
  // Same provenance contract as the batch path — assert the strict equality,
  // never mere field presence.
  expect(rows[0].submissionId).not.toBeNull()
  expect(rows[0].submissionId).toBe(ledgerRow?._id)
})

// ---------------------------------------------------------------------------
// Task 2 (plan 55-04): the read-only preview with writer parity
// ---------------------------------------------------------------------------

type PreviewBreakdownRow = {
  attendeeId: string
  orderId: string
  scope: string
  ceilingMinor: number
  amountMinor: number
  extraMinorUnits: number
  skipped: boolean
  skipReason?: string
}

type PreviewResult = {
  donationId: string
  eventId: string
  donationAmountMinor: number
  recordedAllocatedMinor: number
  remainingMinor: number
  method: string
  totalAllocatedMinor: number
  leftoverMinor: number
  remainderMinor: number
  remainderRecipientAttendeeIds: string[]
  rows: PreviewBreakdownRow[]
  previewOnly: boolean
}

/**
 * The read-only D-07 preview. Argument-compatible with `allocateDonation`, so a
 * test can preview and then submit the identical request.
 */
async function preview(
  client: TestConvex,
  args: {
    donationId: Id<"payments">
    eventId: Id<"events">
    request: AllocationRequestInput
  }
): Promise<PreviewResult> {
  return client.query(api.donations.previewDonationAllocation, args)
}

/** Row counts across all three allocation tables, for the "writes nothing" proof. */
async function countRows(t: TestConvex) {
  return t.query(async (ctx) => {
    let allocations = 0
    for await (const _row of ctx.db.query("donationAllocations")) allocations += 1
    let submissions = 0
    for await (const _row of ctx.db.query("donationAllocationSubmissions")) {
      submissions += 1
    }
    let removals = 0
    for await (const _row of ctx.db.query("donationAllocationRemovals")) {
      removals += 1
    }
    return { allocations, submissions, removals }
  })
}

/** The stable code prefix of a thrown allocation error, for parity assertions. */
async function rejectionCode(promise: Promise<unknown>): Promise<string> {
  let message = ""
  await promise.then(
    () => {
      throw new Error("expected the call to reject, but it resolved")
    },
    (error: unknown) => {
      message = error instanceof Error ? error.message : String(error)
    }
  )
  return message.split(":")[0]
}

test("a preview matches the commit for manual, equal and largest-balance-first", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "preview-parity")
  const a = await createAttendee(seeded, eventId, {
    attendeeKey: "pv-a",
    name: "Attendee A",
    ticketPriceMinor: 40_000,
  })
  const b = await createAttendee(seeded, eventId, {
    orderId: a.orderId,
    attendeeKey: "pv-b",
    name: "Attendee B",
    ticketPriceMinor: 40_000,
    sortOrder: 1,
  })
  const c = await createAttendee(seeded, eventId, {
    orderId: a.orderId,
    attendeeKey: "pv-c",
    name: "Attendee C",
    ticketPriceMinor: 40_000,
    sortOrder: 2,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 100_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  const allTargets: TargetInput[] = [
    { attendeeId: a.attendeeId, scope: "event_charges" },
    { attendeeId: b.attendeeId, scope: "event_charges" },
    { attendeeId: c.attendeeId, scope: "event_charges" },
  ]

  const cases: Array<{
    label: string
    request: AllocationRequestInput
    remainderMinor: number
    recipients: string[]
  }> = [
    {
      label: "manual",
      request: manualRequest([
        { attendeeId: a.attendeeId, amountMinor: 30_000, scope: "event_charges" },
        { attendeeId: b.attendeeId, amountMinor: 20_000, scope: "whole_order" },
      ]),
      remainderMinor: 0,
      recipients: [],
    },
    {
      label: "equal",
      request: { method: "equal", targets: allTargets },
      // 100_000 / 3 = 33_333.33… → 33_334 / 33_333 / 33_333, one unit to the
      // first target.
      remainderMinor: 1,
      recipients: [String(a.attendeeId)],
    },
    {
      label: "largest_balance_first",
      request: { method: "largest_balance_first", targets: allTargets },
      remainderMinor: 0,
      recipients: [],
    },
  ]

  for (const entry of cases) {
    const pv = await preview(authed, {
      donationId,
      eventId,
      request: entry.request,
    })
    expect(pv.previewOnly).toBe(true)
    expect(pv.method).toBe(entry.label)
    expect(pv.donationAmountMinor).toBe(100_000)
    expect(pv.remainderMinor).toBe(entry.remainderMinor)
    expect(pv.remainderRecipientAttendeeIds).toEqual(entry.recipients)

    const committed = await allocate(authed, {
      donationId,
      eventId,
      request: entry.request,
    })
    expect(committed.allocatedTotalMinor).toBe(pv.totalAllocatedMinor)
    expect(committed.remainingMinor).toBe(pv.leftoverMinor)

    const persisted = await loadAllocationRows(seeded, donationId)
    const funded = pv.rows.filter((row) => !row.skipped)
    expect(persisted).toHaveLength(funded.length)
    for (const row of funded) {
      const stored = persisted.find((entry2) => entry2.attendeeId === row.attendeeId)
      expect(stored).toBeDefined()
      expect(stored?.amountMinor).toBe(row.amountMinor)
      expect(stored?.scope).toBe(row.scope)
    }

    // The derived remainder after the commit is exactly the previewed leftover.
    const summary = await loadSummary(authed, donationId)
    expect(summary.remainingMinor).toBe(pv.leftoverMinor)
  }
})

test("a preview writes nothing at all", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "preview-readonly")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "pv-ro-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  const before = await countRows(seeded)
  expect(before).toEqual({ allocations: 0, submissions: 0, removals: 0 })

  await preview(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId, amountMinor: 5_000, scope: "event_charges" },
    ]),
  })
  await preview(authed, {
    donationId,
    eventId,
    request: { method: "equal", targets: [{ attendeeId, scope: "event_charges" }] },
  })

  // A query has no write capability, so this is structural — but proving it
  // keeps a future refactor from moving the preview onto a mutation.
  expect(await countRows(seeded)).toEqual(before)
})

test("a preview refuses over-allocation with the writer's own codes and writes nothing", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "preview-refusals")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "pv-refuse-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "pv-refuse-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const before = await countRows(seeded)

  // Over the donation's remainder.
  const smallDonationId = await createDonation(seeded, eventId, {
    amountMinor: 5_000,
  })
  const overRemainder = manualRequest([
    { attendeeId: first.attendeeId, amountMinor: 6_000, scope: "event_charges" },
  ])
  await expect(
    preview(authed, { donationId: smallDonationId, eventId, request: overRemainder })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_REMAINDER")
  await expect(
    allocate(authed, { donationId: smallDonationId, eventId, request: overRemainder })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_REMAINDER")

  // Over the attendee's own scope ceiling.
  const largeDonationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const overCeiling = manualRequest([
    { attendeeId: first.attendeeId, amountMinor: 15_000, scope: "event_charges" },
  ])
  await expect(
    preview(authed, { donationId: largeDonationId, eventId, request: overCeiling })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_CEILING")
  await expect(
    allocate(authed, { donationId: largeDonationId, eventId, request: overCeiling })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_CEILING")

  // CE-1: the scope-mixed pair on the €200 order. Each row passes its OWN scope
  // check and the remainder check, so ONLY the any-scope order-capacity rule
  // refuses it — and the preview must refuse it with exactly the commit's code.
  const ce1DonationId = await createDonation(seeded, eventId, {
    amountMinor: 30_000,
  })
  const ce1 = manualRequest([
    { attendeeId: first.attendeeId, amountMinor: 10_000, scope: "event_charges" },
    { attendeeId: second.attendeeId, amountMinor: 20_000, scope: "whole_order" },
  ])
  const previewCode = await rejectionCode(
    preview(authed, { donationId: ce1DonationId, eventId, request: ce1 })
  )
  const commitCode = await rejectionCode(
    allocate(authed, { donationId: ce1DonationId, eventId, request: ce1 })
  )
  expect(previewCode).toBe("DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY")
  expect(commitCode).toBe(previewCode)

  expect(await countRows(seeded)).toEqual(before)
})

test("a preview of an under-capacity distribution reports leftover and the commit persists its rows", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "preview-leftover")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "pv-left-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "pv-left-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 50_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  const request: AllocationRequestInput = {
    method: "equal",
    targets: [
      { attendeeId: first.attendeeId, scope: "event_charges" },
      { attendeeId: second.attendeeId, scope: "event_charges" },
    ],
  }

  const pv = await preview(authed, { donationId, eventId, request })
  expect(pv.totalAllocatedMinor).toBe(20_000)
  expect(pv.leftoverMinor).toBe(30_000)
  expect(pv.rows.every((row) => !row.skipped)).toBe(true)

  const committed = await allocate(authed, { donationId, eventId, request })
  expect(committed).toMatchObject({
    allocatedTotalMinor: 20_000,
    remainingMinor: 30_000,
  })

  const persisted = await loadAllocationRows(seeded, donationId)
  expect(persisted).toHaveLength(2)
  expect(
    persisted.reduce((sum, row) => sum + row.amountMinor, 0)
  ).toBe(20_000)
})

test("a preview reports the identical skipped target and leftover as the commit", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "preview-skip-parity")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "pv-skip-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const firstDonationId = await createDonation(seeded, eventId, {
    amountMinor: 10_000,
  })
  const secondDonationId = await createDonation(seeded, eventId, {
    amountMinor: 50_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  await allocate(authed, {
    donationId: firstDonationId,
    eventId,
    request: manualRequest([
      { attendeeId, amountMinor: 10_000, scope: "event_charges" },
    ]),
  })

  const request: AllocationRequestInput = {
    method: "equal",
    targets: [{ attendeeId, scope: "event_charges" }],
  }
  const pv = await preview(authed, { donationId: secondDonationId, eventId, request })
  expect(pv.rows).toHaveLength(1)
  expect(pv.rows[0]).toMatchObject({
    attendeeId: String(attendeeId),
    ceilingMinor: 0,
    amountMinor: 0,
    skipped: true,
    skipReason: "zero_scope_balance",
  })
  expect(pv.totalAllocatedMinor).toBe(0)
  expect(pv.leftoverMinor).toBe(50_000)

  const committed = await allocate(authed, {
    donationId: secondDonationId,
    eventId,
    request,
  })
  // Preview/commit parity: the commit's derived remainder is the preview's
  // leftover, and neither wrote a row.
  expect(committed.remainingMinor).toBe(pv.leftoverMinor)
  expect(await loadAllocationRows(seeded, secondDonationId)).toHaveLength(0)
})

test("a preview is authenticated and uses the writer's donation guards", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "preview-guards-one")
  const otherEventId = await seedEvent(seeded, "preview-guards-two")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "pv-guard-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const request = manualRequest([
    { attendeeId, amountMinor: 5_000, scope: "event_charges" },
  ])

  const anonymous = convexTest(schema, modules)
  await expect(
    anonymous.query(api.donations.previewDonationAllocation, {
      donationId,
      eventId,
      request,
    })
  ).rejects.toThrow("Unauthorized")

  // A read that cannot be performed throws the SAME code a commit would, so the
  // UI can explain the refusal identically.
  await expect(
    preview(authed, { donationId, eventId: otherEventId, request })
  ).rejects.toThrow("DONATION_ALLOCATION_CROSS_EVENT")

  const overpaymentId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
    donationKind: "overpayment",
  })
  await expect(
    preview(authed, { donationId: overpaymentId, eventId, request })
  ).rejects.toThrow("DONATION_NOT_STANDALONE")

  expect(await countRows(seeded)).toEqual({
    allocations: 0,
    submissions: 0,
    removals: 0,
  })
})

// ---------------------------------------------------------------------------
// Task 3 (plan 55-04): cross-method regression and the DACC-03 close-out
// ---------------------------------------------------------------------------

/** Rows per attendee for one donation — the D-02 at-most-one invariant. */
async function countRowsByAttendee(
  t: TestConvex,
  donationId: Id<"payments">
) {
  return t.query(async (ctx) => {
    const counts: Record<string, number> = {}
    for await (const row of ctx.db
      .query("donationAllocations")
      .withIndex("by_donationId", (q) => q.eq("donationId", donationId))) {
      const key = String(row.attendeeId)
      counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  })
}

/** An order-assigned payment that `isOrderAppliedPayment` counts. */
async function createAppliedPayment(
  t: TestConvex,
  eventId: Id<"events">,
  orderId: Id<"orders">,
  amountMinor: number
): Promise<Id<"payments">> {
  return t.mutation(async (ctx) =>
    ctx.db.insert("payments", {
      source: "cash" as const,
      eventId,
      orderId: String(orderId),
      payerName: "Payer",
      amountMinor,
      paidAt: BASE_AT,
      status: "auto_matched" as const,
    })
  )
}

/** Every payment row of an event, in a comparable shape (DACC-03 snapshots). */
async function loadPaymentRows(t: TestConvex, eventId: Id<"events">) {
  return t.query(async (ctx) => {
    const rows: Array<{
      _id: string
      amountMinor: number
      status: string | null
      donationKind: string | null
      orderId: string | null
      eventId: string | null
    }> = []
    for await (const row of ctx.db
      .query("payments")
      .withIndex("eventId", (q) => q.eq("eventId", eventId))) {
      rows.push({
        _id: String(row._id),
        amountMinor: Number(row.amountMinor),
        status: row.status ? String(row.status) : null,
        donationKind: row.donationKind ? String(row.donationKind) : null,
        orderId: row.orderId ? String(row.orderId) : null,
        eventId: row.eventId ? String(row.eventId) : null,
      })
    }
    return rows
  })
}

test("method matrix: every submission leaves exactly the set it implies and one row per attendee", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "matrix")
  const a = await createAttendee(seeded, eventId, {
    attendeeKey: "matrix-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const b = await createAttendee(seeded, eventId, {
    orderId: a.orderId,
    attendeeKey: "matrix-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const c = await createAttendee(seeded, eventId, {
    orderId: a.orderId,
    attendeeKey: "matrix-c",
    name: "Attendee C",
    ticketPriceMinor: 10_000,
    sortOrder: 2,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 25_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  const targets: TargetInput[] = [
    { attendeeId: a.attendeeId, scope: "event_charges" },
    { attendeeId: b.attendeeId, scope: "event_charges" },
    { attendeeId: c.attendeeId, scope: "event_charges" },
  ]

  const assertInvariants = async (expected: Record<string, number>) => {
    const stored = await loadAllocationRows(seeded, donationId)
    const actual: Record<string, number> = {}
    for (const row of stored) {
      actual[row.attendeeId] = row.amountMinor
    }
    expect(actual).toEqual(expected)

    // Set-replace: the derived remainder is the donation minus the stored rows,
    // with no orphaned rows left behind.
    const summary = await loadSummary(authed, donationId)
    expect(summary.remainingMinor).toBe(
      25_000 - stored.reduce((sum, row) => sum + row.amountMinor, 0)
    )

    // D-02: never more than one row per (donation, attendee).
    const counts = await countRowsByAttendee(seeded, donationId)
    for (const value of Object.values(counts)) {
      expect(value).toBe(1)
    }
  }

  await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: a.attendeeId, amountMinor: 5_000, scope: "event_charges" },
    ]),
  })
  await assertInvariants({ [String(a.attendeeId)]: 5_000 })

  // 25_000 / 3 → 8_334 / 8_333 / 8_333.
  await allocate(authed, {
    donationId,
    eventId,
    request: { method: "equal", targets },
  })
  await assertInvariants({
    [String(a.attendeeId)]: 8_334,
    [String(b.attendeeId)]: 8_333,
    [String(c.attendeeId)]: 8_333,
  })

  // Largest balance first: equal balances rank by selection order, so A and B
  // fill to their 10_000 ceilings and C takes the remaining 5_000.
  await allocate(authed, {
    donationId,
    eventId,
    request: { method: "largest_balance_first", targets },
  })
  await assertInvariants({
    [String(a.attendeeId)]: 10_000,
    [String(b.attendeeId)]: 10_000,
    [String(c.attendeeId)]: 5_000,
  })
})

test("a partial allocation leaves a reusable remainder that a later submission spends", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "partial-later")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "partial-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "partial-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  const firstResult = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 10_000, scope: "event_charges" },
    ]),
    idempotencyKey: "partial-key-1",
  })
  expect(firstResult.remainingMinor).toBe(5_000)

  const midSummary = await loadSummary(authed, donationId)
  expect(midSummary.remainingMinor).toBeGreaterThan(0)

  const secondResult = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 10_000, scope: "event_charges" },
      { attendeeId: second.attendeeId, amountMinor: 5_000, scope: "event_charges" },
    ]),
    idempotencyKey: "partial-key-2",
  })
  expect(secondResult.remainingMinor).toBe(0)

  // Two distinct ledger rows for the SAME donation.
  const firstLedger = await loadLedgerRow(seeded, donationId, "partial-key-1")
  const secondLedger = await loadLedgerRow(seeded, donationId, "partial-key-2")
  expect(firstLedger).not.toBeNull()
  expect(secondLedger).not.toBeNull()
  expect(firstLedger?._id).not.toBe(secondLedger?._id)
  expect(await countLedgerRows(seeded)).toBe(2)
})

test("leftover after a distribution is success and the leftover stays allocatable", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "dist-leftover")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "dist-left-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "dist-left-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const authed = seeded.withIdentity(adminIdentity)

  // Another donation fully claims A, so A is skipped by the split below.
  const otherDonationId = await createDonation(seeded, eventId, {
    amountMinor: 10_000,
  })
  await allocate(authed, {
    donationId: otherDonationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 10_000, scope: "event_charges" },
    ]),
  })

  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 25_000,
  })
  const split = await allocate(authed, {
    donationId,
    eventId,
    request: {
      method: "equal",
      targets: [
        { attendeeId: first.attendeeId, scope: "event_charges" },
        { attendeeId: second.attendeeId, scope: "event_charges" },
      ],
    },
  })
  // No throw: the unplaceable part is reported as the derived remainder.
  expect(split).toMatchObject({
    allocatedTotalMinor: 10_000,
    remainingMinor: 15_000,
  })

  const stored = await loadAllocationRows(seeded, donationId)
  expect(stored).toHaveLength(1)
  expect(stored[0].attendeeId).toBe(String(second.attendeeId))

  // The leftover is spent by a later submission against a fresh order.
  const third = await createAttendee(seeded, eventId, {
    attendeeKey: "dist-left-c",
    name: "Attendee C",
    ticketPriceMinor: 20_000,
  })
  const followUp = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: second.attendeeId, amountMinor: 10_000, scope: "event_charges" },
      { attendeeId: third.attendeeId, amountMinor: 15_000, scope: "event_charges" },
    ]),
  })
  expect(followUp.remainingMinor).toBe(0)
})

test("a target whose event_charges are covered by applied payments is skipped (D-20)", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "dist-zero")
  const { attendeeId, orderId } = await createAttendee(seeded, eventId, {
    attendeeKey: "dist-zero-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  await createAppliedPayment(seeded, eventId, orderId, 10_000)
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 5_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  const request: AllocationRequestInput = {
    method: "equal",
    targets: [{ attendeeId, scope: "event_charges" }],
  }

  const pv = await preview(authed, { donationId, eventId, request })
  expect(pv.rows[0]).toMatchObject({
    ceilingMinor: 0,
    amountMinor: 0,
    skipped: true,
    skipReason: "zero_scope_balance",
  })
  expect(pv.leftoverMinor).toBe(5_000)

  const committed = await allocate(authed, { donationId, eventId, request })
  expect(committed).toMatchObject({
    allocatedTotalMinor: 0,
    remainingMinor: 5_000,
  })
  expect(await loadAllocationRows(seeded, donationId)).toHaveLength(0)
})

test("scope is recorded exactly as chosen and bounds the row differently (DON-07)", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "scope-honoured")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "scope-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "scope-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 30_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  // A's OWN attributable outstanding is 10_000; the order's is 20_000. The same
  // 20_000 that `whole_order` accepts is refused under `event_charges`.
  const wholeOrder = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 20_000, scope: "whole_order" },
    ]),
  })
  expect(wholeOrder.remainingMinor).toBe(10_000)
  expect((await loadAllocationRows(seeded, donationId))[0].scope).toBe(
    "whole_order"
  )

  const eventCharges = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: first.attendeeId, amountMinor: 10_000, scope: "event_charges" },
    ]),
  })
  expect(eventCharges.remainingMinor).toBe(20_000)
  expect((await loadAllocationRows(seeded, donationId))[0].scope).toBe(
    "event_charges"
  )

  await expect(
    allocate(authed, {
      donationId,
      eventId,
      request: manualRequest([
        { attendeeId: first.attendeeId, amountMinor: 20_000, scope: "event_charges" },
      ]),
    })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_CEILING")
})

test("DACC-03: no allocation path — batch, single-row, removal or replay — touches a payment", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "dacc-final")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "dacc-final-a",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "dacc-final-b",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const paymentsBefore = await loadPaymentRows(seeded, eventId)

  const request = manualRequest([
    { attendeeId: first.attendeeId, amountMinor: 10_000, scope: "event_charges" },
  ])
  await allocate(authed, {
    donationId,
    eventId,
    request,
    idempotencyKey: "dacc-final-key",
  })
  await allocateOne(authed, {
    donationId,
    eventId,
    attendeeId: second.attendeeId,
    amountMinor: 5_000,
    scope: "event_charges",
  })
  await authed.mutation(api.donations.removeDonationAllocation, {
    donationId,
    eventId,
    attendeeId: first.attendeeId,
    idempotencyKey: "dacc-final-remove",
  })
  // The replay returns its stored result and writes nothing.
  await allocate(authed, {
    donationId,
    eventId,
    request,
    idempotencyKey: "dacc-final-key",
  })

  // No payment row was created, reassigned, patched or deleted by this module —
  // the donation's own row included.
  expect(await loadPaymentRows(seeded, eventId)).toEqual(paymentsBefore)

  const donation = await seeded.query(async (ctx) =>
    ctx.db.get("payments", donationId)
  )
  expect(donation).toMatchObject({
    donationKind: "standalone",
    status: "donation",
    amountMinor: 15_000,
  })
  expect(donation?.orderId).toBeUndefined()
})

// ---------------------------------------------------------------------------
// Phase 60 D-03 coverage pins: the Tikkie allocation capability and the
// cross-donation mixed-scope shared pool
// ---------------------------------------------------------------------------

test("a Tikkie-sourced donation is allocatable: the production upsert seeds it and the canonical figures move (capability pin, DON-07 / Phase 59 SC2)", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-tikkie-pin")
  const { orderId, attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "alloc-tikkie-pin-a",
    name: "Attendee A",
    ticketPriceMinor: 5_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  // Seeded through the PRODUCTION upsert the cron path uses, not a raw insert:
  // this is the Tikkie inflow class the UI leaves un-gated.
  const seededTikkie = await authed.mutation(api.payments.upsertTikkiePayment, {
    sourceId: "tikkie-allocation-pin-1",
    eventId: String(eventId),
    purpose: "donation",
    payerName: "Tikkie donor",
    amountMinor: 12_500,
    paidAt: BASE_AT,
  })
  expect(seededTikkie.inserted).toBe(true)

  const donationId = seededTikkie.id
  const rowBefore = await seeded.query(async (ctx) =>
    ctx.db.get("payments", donationId)
  )
  expect(rowBefore).toMatchObject({
    source: "tikkie",
    status: "donation",
    donationKind: "standalone",
  })
  expect(rowBefore?.orderId).toBeUndefined()

  const before = await loadCanonicalBalance(seeded, orderId)
  expect(before).toEqual({
    appliedPaymentMinor: 0,
    allocationCreditMinor: 0,
    paidAmountMinor: 0,
    outstandingAmountMinor: 5_000,
  })

  // The loader has no source predicate and the client is un-gated, so a Tikkie
  // donation allocates exactly like a manual one.
  const allocated = await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId, amountMinor: 3_000, scope: "whole_order" },
    ]),
  })
  expect(allocated.remainingMinor).toBe(9_500)

  const after = await loadCanonicalBalance(seeded, orderId)
  expect(after).toEqual({
    appliedPaymentMinor: 0,
    allocationCreditMinor: 3_000,
    paidAmountMinor: 3_000,
    outstandingAmountMinor: 2_000,
  })

  // The credit lives in `donationAllocations` only (DACC-03): the donation's
  // payment row is byte-identical, still standalone and event-scoped.
  const rowAfter = await seeded.query(async (ctx) =>
    ctx.db.get("payments", donationId)
  )
  expect(rowAfter).toEqual(rowBefore)
})

test("D1 whole_order + D2 event_charges: the row passes its own ceiling but breaches the shared pool (write-time refusal)", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "alloc-mixed-scope-pool")
  const a = await createAttendee(seeded, eventId, {
    attendeeKey: "mixed-pool-a",
    name: "Attendee A",
    ticketPriceMinor: 12_000,
  })
  const b = await createAttendee(seeded, eventId, {
    orderId: a.orderId,
    attendeeKey: "mixed-pool-b",
    name: "Attendee B",
    ticketPriceMinor: 8_000,
    sortOrder: 1,
  })
  const authed = seeded.withIdentity(adminIdentity)

  // D1 claims 18 000 of the 20 000 order pool under whole_order.
  const d1 = await createDonation(seeded, eventId, { amountMinor: 40_000 })
  const d1Accepted = await allocate(authed, {
    donationId: d1,
    eventId,
    request: manualRequest([
      { attendeeId: b.attendeeId, amountMinor: 18_000, scope: "whole_order" },
    ]),
  })
  expect(d1Accepted.remainingMinor).toBe(22_000)
  expect(await countAllocationRows(seeded)).toBe(1)

  const d2 = await createDonation(seeded, eventId, { amountMinor: 15_000 })
  expect(await loadAllocationRows(seeded, d2)).toHaveLength(0)

  // THE MIXED-SCOPE CASE. D2's 5 000 row is `event_charges`, and D1's
  // `whole_order` row is NOT subtracted from the attendee scope, so A's own
  // ceiling still reads 12 000 and this row is not an EXCEEDS_CEILING refusal.
  // D2's order pool, however, is 20 000 − 18 000 = 2 000, so the same row
  // breaches the shared pool.
  await expect(
    allocate(authed, {
      donationId: d2,
      eventId,
      request: manualRequest([
        { attendeeId: a.attendeeId, amountMinor: 5_000, scope: "event_charges" },
      ]),
    })
  ).rejects.toThrow("DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY")

  // Inert: no row was written anywhere, and D2's derived remainder is full.
  expect(await countAllocationRows(seeded)).toBe(1)
  expect(await loadAllocationRows(seeded, d2)).toHaveLength(0)
  const d2Remainder = await allocate(authed, {
    donationId: d2,
    eventId,
    request: manualRequest([]),
  })
  expect(d2Remainder.remainingMinor).toBe(15_000)

  // Control: 2 000 fits the remaining pool exactly and is accepted, proving
  // the refusal bound was the shared pool, not the row's own ceiling.
  const control = await allocate(authed, {
    donationId: d2,
    eventId,
    request: manualRequest([
      { attendeeId: a.attendeeId, amountMinor: 2_000, scope: "event_charges" },
    ]),
  })
  expect(control.remainingMinor).toBe(13_000)
  expect(await countAllocationRows(seeded)).toBe(2)
  const d2Rows = await loadAllocationRows(seeded, d2)
  expect(d2Rows).toHaveLength(1)
  expect(d2Rows[0]).toMatchObject({
    attendeeId: String(a.attendeeId),
    amountMinor: 2_000,
    scope: "event_charges",
  })
})


