/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import { nextAllocationRemovalKey } from "../lib/dashboard/donation-allocation-removal-copy"
import { nextAllocationKey } from "../lib/dashboard/donation-allocation-request"
import type { Id } from "./_generated/dataModel"

/**
 * The D-06 UI-path proof (Phase 61, plan 61-07).
 *
 * This suite runs the EXACT arguments the removal dialog submits against the
 * REAL `removeDonationAllocation`: every removal key is minted through the UI
 * policy (`nextAllocationRemovalKey`), never an inline string. It proves the
 * five contracts the wiring depends on:
 *
 *   (a) one removal hard-deletes exactly one row, writes exactly one audit row
 *       and one `remove` ledger row, leaves the sibling byte-identical, and
 *       never touches the donation's `payments` row;
 *   (b) a retry with the SAME key replays the frozen result with no second
 *       write, while a FRESH key falls through to `DONATION_ALLOCATION_NOT_FOUND`
 *       — the counterfactual that proves a regenerated key is a bug;
 *   (c) a reused `allocate` key is an intended `DONATION_ALLOCATION_IDEMPOTENCY_CONFLICT`
 *       — the reason the minted form is `remove`-namespaced;
 *   (d) the hard delete leaves the `(donationId, attendeeId)` slot FREE for a
 *       re-allocation (no tombstone);
 *   (e) the donation payment row is `toEqual`-identical across a removal.
 */

const modules = import.meta.glob("./**/*.ts")

const BASE_AT = 1_750_000_000_000

const adminIdentity = {
  tokenIdentifier: "admin:allocation-removal-ui-path",
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

function fresh() {
  return convexTest(schema, modules)
}

function manualRequest(rows: ManualRowInput[]) {
  return { method: "manual" as const, rows }
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
 * due loader prices from. The selection is REQUIRED: without it every ceiling
 * is zero and the allocation assertions become vacuous.
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
  input: { amountMinor: number }
): Promise<Id<"payments">> {
  return t.mutation(async (ctx) =>
    ctx.db.insert("payments", {
      source: "cash" as const,
      eventId,
      payerName: "Donor",
      amountMinor: input.amountMinor,
      paidAt: BASE_AT,
      donationKind: "standalone" as const,
      status: "donation" as const,
    })
  )
}

type AllocationRowSnapshot = {
  _id: string
  attendeeId: string
  orderId: string
  amountMinor: number
  scope: string
  createdAt: number
  createdBy: string
  submissionId: string | null
}

async function loadAllocationRowSnapshots(
  t: TestConvex,
  donationId: Id<"payments">
): Promise<AllocationRowSnapshot[]> {
  return t.query(async (ctx) => {
    const rows: AllocationRowSnapshot[] = []
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

/**
 * The RAW `donationAllocations` docs, so a `removedAt`/`status` tombstone (or a
 * row simply left behind) is visible: the field reads `undefined` only when the
 * row is truly hard-deleted.
 */
async function loadRawAllocationRows(
  t: TestConvex,
  donationId: Id<"payments">
): Promise<Array<Record<string, unknown>>> {
  return t.run(async (ctx) => {
    const rows: Array<Record<string, unknown>> = []
    for await (const row of ctx.db
      .query("donationAllocations")
      .withIndex("by_donationId", (q) => q.eq("donationId", donationId))) {
      rows.push(row as unknown as Record<string, unknown>)
    }
    return rows
  })
}

type RemovalAuditSnapshot = {
  donationId: string
  eventId: string
  orderId: string
  attendeeId: string
  amountMinor: number
  scope: string
  actor: string
  removedAt: number
  submissionId: string | null
}

async function loadRemovalAuditRows(
  t: TestConvex,
  donationId: Id<"payments">
): Promise<RemovalAuditSnapshot[]> {
  return t.query(async (ctx) => {
    const rows: RemovalAuditSnapshot[] = []
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

type LedgerSnapshot = {
  _id: string
  idempotencyKey: string
  operation: string
  allocatedTotalMinor: number
  remainingMinor: number
  rows: Array<{
    attendeeId: string
    orderId: string
    amountMinor: number
    scope: string
  }>
}

async function loadLedgerSnapshots(
  t: TestConvex,
  donationId: Id<"payments">
): Promise<LedgerSnapshot[]> {
  return t.query(async (ctx) => {
    const rows: LedgerSnapshot[] = []
    for await (const row of ctx.db
      .query("donationAllocationSubmissions")
      .withIndex("by_donationId_and_idempotencyKey", (q) =>
        q.eq("donationId", donationId)
      )) {
      rows.push({
        _id: String(row._id),
        idempotencyKey: String(row.idempotencyKey),
        operation: String(row.operation),
        allocatedTotalMinor: Number(row.allocatedTotalMinor),
        remainingMinor: Number(row.remainingMinor),
        rows: (
          row.rows as unknown as Array<{
            attendeeId: string
            orderId: string
            amountMinor: number
            scope: string
          }>
        ).map((entry) => ({
          attendeeId: String(entry.attendeeId),
          orderId: String(entry.orderId),
          amountMinor: Number(entry.amountMinor),
          scope: String(entry.scope),
        })),
      })
    }
    return rows
  })
}

async function countAllocationRows(t: TestConvex): Promise<number> {
  return t.query(async (ctx) => {
    let count = 0
    for await (const _row of ctx.db.query("donationAllocations")) count += 1
    return count
  })
}

async function loadPaymentSnapshot(t: TestConvex, donationId: Id<"payments">) {
  return t.run(async (ctx) => ctx.db.get("payments", donationId))
}

test("(a) the UI-path removal hard-deletes one row, audits once, and preserves the sibling", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "ui-removal-path-a")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "ui-a-1",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "ui-a-2",
    name: "Attendee B",
    ticketPriceMinor: 10_000,
    sortOrder: 1,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 20_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  const allocated = await authed.mutation(api.donations.allocateDonation, {
    donationId,
    eventId,
    idempotencyKey: "ui-path-allocate-a",
    request: manualRequest([
      {
        attendeeId: first.attendeeId,
        amountMinor: 6_000,
        scope: "event_charges",
      },
      {
        attendeeId: second.attendeeId,
        amountMinor: 4_000,
        scope: "whole_order",
      },
    ]),
  })
  expect(allocated.allocatedTotalMinor).toBe(10_000)
  expect(allocated.remainingMinor).toBe(10_000)

  const beforeRows = await loadAllocationRowSnapshots(seeded, donationId)
  const survivor = beforeRows.find(
    (row) => row.attendeeId === String(second.attendeeId)
  )
  expect(survivor).toBeDefined()
  const paymentBefore = await loadPaymentSnapshot(seeded, donationId)

  const removal = await authed.mutation(
    api.donations.removeDonationAllocation,
    {
      donationId,
      eventId,
      attendeeId: first.attendeeId,
      idempotencyKey: nextAllocationRemovalKey(null, String(donationId)).key,
    }
  )

  // The freed amount returns to the DERIVED remainder: 10_000 + 6_000.
  expect(removal.remainingMinor).toBe(16_000)
  expect(removal.allocatedTotalMinor).toBe(4_000)
  expect(removal.rows).toHaveLength(1)

  // HARD delete: exactly the survivor remains, with no tombstone fields.
  const rawRows = await loadRawAllocationRows(seeded, donationId)
  expect(rawRows).toHaveLength(1)
  expect(rawRows[0].removedAt).toBeUndefined()
  expect(rawRows[0].status).toBeUndefined()

  const afterRows = await loadAllocationRowSnapshots(seeded, donationId)
  expect(afterRows).toHaveLength(1)
  expect(
    afterRows.some((row) => row.attendeeId === String(first.attendeeId))
  ).toBe(false)
  // The sibling keeps its amount AND provenance byte-identical (D-17).
  expect(afterRows[0]).toMatchObject({
    attendeeId: String(second.attendeeId),
    amountMinor: 4_000,
    scope: "whole_order",
    createdAt: survivor?.createdAt,
    createdBy: survivor?.createdBy,
    submissionId: survivor?.submissionId,
  })

  // Exactly ONE append-only audit row with the full action recorded.
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

  // Exactly ONE `remove` ledger row, carrying the frozen post-removal snapshot.
  const ledger = await loadLedgerSnapshots(seeded, donationId)
  const removeLedgerRows = ledger.filter((row) => row.operation === "remove")
  expect(removeLedgerRows).toHaveLength(1)
  expect(removeLedgerRows[0].allocatedTotalMinor).toBe(4_000)
  expect(removeLedgerRows[0].remainingMinor).toBe(16_000)
  expect(removeLedgerRows[0].rows).toHaveLength(1)

  // (e) the payments row is untouched.
  expect(await loadPaymentSnapshot(seeded, donationId)).toEqual(paymentBefore)
})

test("(b) a retry replays the same key; a fresh key falls through to not-found", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "ui-removal-path-b")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "ui-b-1",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  await authed.mutation(api.donations.allocateDonation, {
    donationId,
    eventId,
    idempotencyKey: "ui-path-allocate-b",
    request: manualRequest([
      { attendeeId, amountMinor: 6_000, scope: "event_charges" },
    ]),
  })

  const removalKey = nextAllocationRemovalKey(null, String(donationId)).key
  const args = { donationId, eventId, attendeeId, idempotencyKey: removalKey }

  const firstRemoval = await authed.mutation(
    api.donations.removeDonationAllocation,
    args
  )
  const retryRemoval = await authed.mutation(
    api.donations.removeDonationAllocation,
    args
  )

  expect(retryRemoval).toEqual(firstRemoval)
  expect(firstRemoval.remainingMinor).toBe(15_000)
  expect(await countRemovalAuditRows(seeded)).toBe(1)
  expect(await loadLedgerSnapshots(seeded, donationId)).toHaveLength(2)

  // The counterfactual: a REGENERATED key finds no row (replay resolves before
  // the guards), which is why the dialog must reuse the key on a retry.
  await expect(
    authed.mutation(api.donations.removeDonationAllocation, {
      ...args,
      idempotencyKey: nextAllocationRemovalKey(null, String(donationId)).key,
    })
  ).rejects.toThrow("DONATION_ALLOCATION_NOT_FOUND")

  // Nothing was written by the refused fresh-key attempt.
  expect(await countRemovalAuditRows(seeded)).toBe(1)
  expect(await loadLedgerSnapshots(seeded, donationId)).toHaveLength(2)
  expect(await countAllocationRows(seeded)).toBe(0)
})

test("(c) a reused allocation key is refused as an intended conflict", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "ui-removal-path-c")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "ui-c-1",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  // Keys come from the two policies, so this is exactly the namespace mix the
  // `:remove:` minting rule prevents.
  const allocationKey = nextAllocationKey(
    null,
    String(donationId),
    "canonical"
  ).key

  await authed.mutation(api.donations.allocateDonation, {
    donationId,
    eventId,
    idempotencyKey: allocationKey,
    request: manualRequest([
      { attendeeId, amountMinor: 6_000, scope: "event_charges" },
    ]),
  })

  await expect(
    authed.mutation(api.donations.removeDonationAllocation, {
      donationId,
      eventId,
      attendeeId,
      idempotencyKey: allocationKey,
    })
  ).rejects.toThrow("DONATION_ALLOCATION_IDEMPOTENCY_CONFLICT")

  // The refusal is inert: no audit, no delete, no new ledger row.
  expect(await countAllocationRows(seeded)).toBe(1)
  expect(await countRemovalAuditRows(seeded)).toBe(0)
  expect(await loadLedgerSnapshots(seeded, donationId)).toHaveLength(1)
})

test("(d) the hard delete frees the slot for a re-allocation (no tombstone)", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "ui-removal-path-d")
  const { attendeeId, orderId } = await createAttendee(seeded, eventId, {
    attendeeKey: "ui-d-1",
    name: "Attendee A",
    ticketPriceMinor: 10_000,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 15_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  await authed.mutation(api.donations.allocateDonation, {
    donationId,
    eventId,
    idempotencyKey: "ui-path-allocate-d",
    request: manualRequest([
      { attendeeId, amountMinor: 6_000, scope: "event_charges" },
    ]),
  })

  await authed.mutation(api.donations.removeDonationAllocation, {
    donationId,
    eventId,
    attendeeId,
    idempotencyKey: nextAllocationRemovalKey(null, String(donationId)).key,
  })

  // The same (donation, attendee) slot is free: a fresh allocation succeeds.
  const reallocated = await authed.mutation(api.donations.allocateDonation, {
    donationId,
    eventId,
    idempotencyKey: nextAllocationKey(
      null,
      String(donationId),
      "canonical-readd"
    ).key,
    request: manualRequest([
      { attendeeId, amountMinor: 5_000, scope: "event_charges" },
    ]),
  })
  expect(reallocated.allocatedTotalMinor).toBe(5_000)
  expect(reallocated.remainingMinor).toBe(10_000)

  // Exactly ONE row for the attendee — nothing tombstoned behind the re-add.
  const rows = await loadAllocationRowSnapshots(seeded, donationId)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    attendeeId: String(attendeeId),
    orderId: String(orderId),
    amountMinor: 5_000,
    scope: "event_charges",
  })
})
