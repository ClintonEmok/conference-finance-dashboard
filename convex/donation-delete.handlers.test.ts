/// <reference types="vite/client" />
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"

/**
 * Phase 57 contract suite — donation deletion & atomic reversal (DDEL-02 /
 * DDEL-03).
 *
 * Every case drives the PRODUCTION mutations (`payments.createStandaloneDonation`,
 * `donations.allocateDonation`, `donations.removeDonationAllocation`,
 * `donationDeletion.deleteDonation`, `payments.deletePayment`,
 * `payments.upsertTikkiePayment`) — never a hand-written deletion — so the
 * contract is proven on real writes. A fixture the production surface cannot
 * write (an `unassigned` standalone, an eventless donation, an `orderId` alias)
 * is hand-inserted and labelled as such at its call site.
 *
 * Refusals are proven INERT, not merely non-throwing: every refusal case
 * snapshots `payments`, `donationAllocations`, `donationAllocationRemovals` and
 * `donationAllocationSubmissions` before and after the refused call and asserts
 * the snapshots are deep-equal.
 *
 * The generic source-guard branch (`DONATION_DELETE_PAYMENT_GUARD`) has NO
 * handler-level case here, by design. The live `payments.source` union is
 * exactly `tikkie | bank_transfer | cash` and the schema validator rejects
 * anything else, so the branch is unreachable at the DB level; the earlier
 * Tikkie predicate owns the reachable provider-source refusal and the pure
 * classifier suite (`tests/finance/donation-deletion.test.ts`, plan 57-02) owns
 * the unreachable-branch behaviour. Task 2 pins the pure module's two guard
 * clauses and the schema union's three members instead, so a future fourth
 * source cannot be added silently.
 *
 * Cases 1-8 (lifecycle, audit shape, replay/conflict/already-deleted, blank
 * key) live in Task 1; the refusal classes, the Tikkie resurrection
 * demonstration and the structural guards live in Task 2.
 */

const modules = import.meta.glob("./**/*.ts")

const BASE_AT = 1_750_000_000_000

const adminIdentity = {
  tokenIdentifier: "admin:donation-delete",
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

type ManualRequestInput = {
  method: "manual"
  rows: ManualRowInput[]
}

function fresh() {
  return convexTest(schema, modules)
}

function manualRequest(rows: ManualRowInput[]): ManualRequestInput {
  return { method: "manual", rows }
}

// ---------------------------------------------------------------------------
// Seeding helpers (file-local and minimal, mirroring the Phase 55/56 handler
// suites). The donation always comes from the production mutation.
// ---------------------------------------------------------------------------

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

/** The PRODUCTION standalone-donation write — never a hand-written row. */
async function createDonation(
  client: TestConvex,
  input: { eventId: Id<"events">; amountMinor: number }
): Promise<Id<"payments">> {
  return client.mutation(api.payments.createStandaloneDonation, {
    eventId: input.eventId,
    payerName: "Donor",
    amountMinor: input.amountMinor,
    paidAt: BASE_AT,
    source: "cash",
  })
}

/**
 * The allocation mutation requires an idempotency key (D-21), so every call
 * site goes through this helper: a fresh key per call unless a test passes one
 * explicitly (the replay / conflict cases).
 */
let allocationKeySeq = 0
function allocate(
  client: TestConvex,
  args: {
    donationId: Id<"payments">
    eventId: Id<"events">
    request: ManualRequestInput
    idempotencyKey?: string
  }
) {
  allocationKeySeq += 1
  return client.mutation(api.donations.allocateDonation, {
    ...args,
    idempotencyKey: args.idempotencyKey ?? `auto-allocate-${allocationKeySeq}`,
  })
}

/**
 * The frozen deletion result the handler returns. `deleteDonation` carries no
 * `returns` validator (matching the neighbouring `donations.ts` mutations), so
 * the test states the contract explicitly and every assertion below is checked
 * against a structured type instead of `any`.
 */
type DeletionResult = {
  donationId: string
  deleted: true
  donationAmountMinor: number
  reversedAllocationMinor: number
  remainingMinor: number
  allocationCount: number
  rows: Array<{
    attendeeId: string
    orderId: string
    amountMinor: number
    scope: string
  }>
}

/** The deletion under test, keyed like `allocate` for the replay cases. */
let deletionKeySeq = 0
function deleteDonation(
  client: TestConvex,
  args: {
    donationId: Id<"payments">
    eventId: Id<"events">
    idempotencyKey?: string
  }
): Promise<DeletionResult> {
  deletionKeySeq += 1
  return client.mutation(api.donationDeletion.deleteDonation, {
    ...args,
    idempotencyKey: args.idempotencyKey ?? `auto-delete-${deletionKeySeq}`,
  })
}

/**
 * The stable code prefix of a settled refusal — or `"RESOLVED"` if the call
 * unexpectedly resolved. Adapted from `donation-allocation.handlers.test.ts`'s
 * `rejectionCode` with ONE deliberate difference: it never throws on resolve,
 * so the caller's inertness snapshot assertion is always reached. A "refusal"
 * that commits a write and returns must fail the snapshot; if this helper threw
 * first, that regression would be masked by the rejection assertion.
 */
async function rejectionCode(promise: Promise<unknown>): Promise<string> {
  let message = ""
  await promise.then(
    () => {
      message = "RESOLVED"
    },
    (error: unknown) => {
      message = error instanceof Error ? error.message : String(error)
    }
  )
  return message.split(":")[0]
}

// ---------------------------------------------------------------------------
// Read helpers (the shapes copied from convex/donation-allocation.handlers.test.ts)
// ---------------------------------------------------------------------------

type LedgerRow = {
  _id: string
  donationId: string
  idempotencyKey: string
  requestDigest: string
  operation: string
  actor: string
  createdAt: number
  allocatedTotalMinor: number
  remainingMinor: number
  eventId: string | null
  donationAmountMinor: number | null
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
      createdAt: Number(row.createdAt),
      allocatedTotalMinor: Number(row.allocatedTotalMinor),
      remainingMinor: Number(row.remainingMinor),
      eventId: row.eventId ? String(row.eventId) : null,
      donationAmountMinor:
        row.donationAmountMinor !== undefined
          ? Number(row.donationAmountMinor)
          : null,
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

/** Every live allocation row for a donation, with its provenance stamp. */
async function loadAllocationRowDetails(
  t: TestConvex,
  donationId: Id<"payments">
) {
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

function jsonClone(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

type DeletionSnapshot = {
  payments: Array<Record<string, unknown>>
  donationAllocations: Array<Record<string, unknown>>
  donationAllocationRemovals: Array<Record<string, unknown>>
  donationAllocationSubmissions: Array<Record<string, unknown>>
}

/**
 * The byte-unchanged instrument every refusal case uses: every row of the four
 * deletion-relevant tables, JSON-cloned, read through bounded `for await`
 * scans. A refusal must leave this deep-equal to its pre-call value.
 */
async function snapshotDeletionTables(
  t: TestConvex
): Promise<DeletionSnapshot> {
  return t.run(async (ctx) => {
    const snapshot: DeletionSnapshot = {
      payments: [],
      donationAllocations: [],
      donationAllocationRemovals: [],
      donationAllocationSubmissions: [],
    }

    for await (const row of ctx.db.query("payments")) {
      snapshot.payments.push(jsonClone(row))
    }
    for await (const row of ctx.db.query("donationAllocations")) {
      snapshot.donationAllocations.push(jsonClone(row))
    }
    for await (const row of ctx.db.query("donationAllocationRemovals")) {
      snapshot.donationAllocationRemovals.push(jsonClone(row))
    }
    for await (const row of ctx.db.query("donationAllocationSubmissions")) {
      snapshot.donationAllocationSubmissions.push(jsonClone(row))
    }

    return snapshot
  })
}

/**
 * A well-formed `Id` whose row is gone. Fabricated id strings fail the argument
 * validator (`Expected ID for table ...`), so the only way to hand the handler
 * a valid id with no row behind it is insert-then-delete.
 */
async function insertThenDeletePayment(
  t: TestConvex,
  eventId: Id<"events">
): Promise<Id<"payments">> {
  return t.mutation(async (ctx) => {
    const id = await ctx.db.insert("payments", {
      source: "cash" as const,
      eventId,
      payerName: "Ghost donor",
      amountMinor: 1_000,
      paidAt: BASE_AT,
      donationKind: "standalone" as const,
      status: "donation" as const,
    })
    await ctx.db.delete("payments", id)
    return id
  })
}

async function insertThenDeleteEvent(t: TestConvex): Promise<Id<"events">> {
  return t.mutation(async (ctx) => {
    const id = await ctx.db.insert("events", {
      slug: "donation-delete-ghost-event",
      title: "Ghost event",
      startsAt: BASE_AT,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: false,
      primarySourceKind: "internal" as const,
      updatedAt: BASE_AT,
    })
    await ctx.db.delete("events", id)
    return id
  })
}

// ---------------------------------------------------------------------------
// Case 1 (DDEL-03): the auth guard
// ---------------------------------------------------------------------------

test("case 1: an anonymous caller is refused with Unauthorized and nothing changes", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "del-auth")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "auth-a",
    name: "Attendee A",
    ticketPriceMinor: 20_000,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const donationId = await createDonation(authed, {
    eventId,
    amountMinor: 25_000,
  })
  await allocate(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId, amountMinor: 10_000, scope: "event_charges" },
    ]),
  })

  // The anonymous client shares the seeded deployment, so the snapshot
  // comparison is meaningful: the guarded call must not touch real data.
  const before = await snapshotDeletionTables(seeded)
  await expect(
    seeded.mutation(api.donationDeletion.deleteDonation, {
      donationId,
      eventId,
      idempotencyKey: "auth-attempt",
    })
  ).rejects.toThrow("Unauthorized")
  expect(await snapshotDeletionTables(seeded)).toEqual(before)
  expect(
    await seeded.query(async (ctx) => ctx.db.get("payments", donationId))
  ).not.toBeNull()
})

// ---------------------------------------------------------------------------
// Case 2 (DDEL-02 + DDEL-03): the happy path and its audit shape
// ---------------------------------------------------------------------------

test("case 2: deletes a standalone donation across both scopes and freezes the audit shape", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "del-happy")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "happy-a",
    name: "Attendee A",
    ticketPriceMinor: 40_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "happy-b",
    name: "Attendee B",
    ticketPriceMinor: 30_000,
    sortOrder: 1,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const donationId = await createDonation(authed, {
    eventId,
    amountMinor: 100_000,
  })

  const allocated = await allocate(authed, {
    donationId,
    eventId,
    idempotencyKey: "happy-allocate",
    request: manualRequest([
      {
        attendeeId: first.attendeeId,
        amountMinor: 25_000,
        scope: "event_charges",
      },
      {
        attendeeId: second.attendeeId,
        amountMinor: 20_000,
        scope: "whole_order",
      },
    ]),
  })
  // Non-vacuity: the credit layer really moved before the deletion is exercised.
  expect(allocated.remainingMinor).toBe(55_000)
  expect(await loadAllocationRowDetails(seeded, donationId)).toHaveLength(2)

  const deletionKey = "happy-delete"
  const result = await deleteDonation(authed, {
    donationId,
    eventId,
    idempotencyKey: deletionKey,
  })

  // The frozen result, field by field.
  expect(String(result.donationId)).toBe(String(donationId))
  expect(result.deleted).toBe(true)
  expect(result.donationAmountMinor).toBe(100_000)
  expect(result.reversedAllocationMinor).toBe(45_000)
  expect(result.remainingMinor).toBe(55_000)
  expect(result.allocationCount).toBe(2)

  const rowA = {
    attendeeId: String(first.attendeeId),
    orderId: String(first.orderId),
    amountMinor: 25_000,
    scope: "event_charges",
  }
  const rowB = {
    attendeeId: String(second.attendeeId),
    orderId: String(first.orderId),
    amountMinor: 20_000,
    scope: "whole_order",
  }
  expect(result.rows).toHaveLength(2)
  expect(result.rows).toEqual(expect.arrayContaining([rowA, rowB]))

  // The hard delete happened and every allocation row is gone.
  expect(
    await seeded.query(async (ctx) => ctx.db.get("payments", donationId))
  ).toBeNull()
  expect(await loadAllocationRowDetails(seeded, donationId)).toEqual([])

  // The ledger row: ONE `operation: "delete"` row (the only delete in this
  // fixture) carrying the frozen figures and the event + explicit amount.
  const ledger = await loadLedgerRow(seeded, donationId, deletionKey)
  expect(ledger).not.toBeNull()
  expect(ledger?.donationId).toBe(String(donationId))
  expect(ledger?.idempotencyKey).toBe(deletionKey)
  expect(ledger?.operation).toBe("delete")
  expect(ledger?.actor).toBe(adminIdentity.tokenIdentifier)
  expect(ledger?.allocatedTotalMinor).toBe(45_000)
  expect(ledger?.remainingMinor).toBe(55_000)
  expect(ledger?.donationAmountMinor).toBe(100_000)
  expect(ledger?.eventId).toBe(String(eventId))
  // The ledger replays the returned order VERBATIM.
  expect(ledger?.rows).toEqual(
    result.rows.map((row) => ({
      attendeeId: String(row.attendeeId),
      orderId: String(row.orderId),
      amountMinor: row.amountMinor,
      scope: row.scope,
    }))
  )
  // One allocate row + one delete row.
  expect(await countLedgerRows(seeded)).toBe(2)

  // Per-allocation provenance: one removal row per reversed row, each stamped
  // with the deletion's ledger id and ONE shared removedAt.
  const removalRows = await loadRemovalAuditRows(seeded, donationId)
  expect(removalRows).toHaveLength(2)
  expect(removalRows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        donationId: String(donationId),
        eventId: String(eventId),
        orderId: String(first.orderId),
        attendeeId: String(first.attendeeId),
        amountMinor: 25_000,
        scope: "event_charges",
        actor: adminIdentity.tokenIdentifier,
        submissionId: ledger?._id,
      }),
      expect.objectContaining({
        donationId: String(donationId),
        eventId: String(eventId),
        orderId: String(second.orderId),
        attendeeId: String(second.attendeeId),
        amountMinor: 20_000,
        scope: "whole_order",
        actor: adminIdentity.tokenIdentifier,
        submissionId: ledger?._id,
      }),
    ])
  )
  expect(new Set(removalRows.map((row) => row.removedAt)).size).toBe(1)
})

// ---------------------------------------------------------------------------
// Case 3 (DDEL-02): a zero-allocation deletion still records event and worth
// ---------------------------------------------------------------------------

test("case 3: deletes a zero-allocation donation and records the full amount", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "del-zero-alloc")
  const authed = seeded.withIdentity(adminIdentity)
  const donationId = await createDonation(authed, {
    eventId,
    amountMinor: 30_000,
  })

  const deletionKey = "zero-allocation-delete"
  const result = await deleteDonation(authed, {
    donationId,
    eventId,
    idempotencyKey: deletionKey,
  })

  expect(result.deleted).toBe(true)
  expect(result.allocationCount).toBe(0)
  expect(result.rows).toEqual([])
  expect(result.reversedAllocationMinor).toBe(0)
  expect(result.remainingMinor).toBe(30_000)

  expect(await loadRemovalAuditRows(seeded, donationId)).toEqual([])
  expect(
    await seeded.query(async (ctx) => ctx.db.get("payments", donationId))
  ).toBeNull()

  const ledger = await loadLedgerRow(seeded, donationId, deletionKey)
  expect(ledger).not.toBeNull()
  expect(ledger?.operation).toBe("delete")
  expect(ledger?.rows).toEqual([])
  expect(ledger?.allocatedTotalMinor).toBe(0)
  expect(ledger?.remainingMinor).toBe(30_000)
  expect(ledger?.donationAmountMinor).toBe(30_000)
  expect(ledger?.eventId).toBe(String(eventId))
  // The deletion's ledger row is the only submission this fixture ever wrote.
  expect(await countLedgerRows(seeded)).toBe(1)
})

// ---------------------------------------------------------------------------
// Case 4 (DDEL-03): the replay contract — the ordering fix
// ---------------------------------------------------------------------------

test("case 4: a same-key replay returns the stored result and writes nothing", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "del-replay")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "replay-a",
    name: "Attendee A",
    ticketPriceMinor: 40_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "replay-b",
    name: "Attendee B",
    ticketPriceMinor: 30_000,
    sortOrder: 1,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const donationId = await createDonation(authed, {
    eventId,
    amountMinor: 100_000,
  })
  await allocate(authed, {
    donationId,
    eventId,
    idempotencyKey: "replay-allocate",
    request: manualRequest([
      {
        attendeeId: first.attendeeId,
        amountMinor: 25_000,
        scope: "event_charges",
      },
      {
        attendeeId: second.attendeeId,
        amountMinor: 20_000,
        scope: "whole_order",
      },
    ]),
  })

  const replayKey = "replay-delete"
  const result = await deleteDonation(authed, {
    donationId,
    eventId,
    idempotencyKey: replayKey,
  })
  const postDeletion = await snapshotDeletionTables(seeded)
  const ledgerCount = await countLedgerRows(seeded)
  const removalCount = (await loadRemovalAuditRows(seeded, donationId)).length
  expect(ledgerCount).toBe(2) // one allocate + one delete
  expect(removalCount).toBe(2)

  // THE ORDERING FIX. Phase 55's guard-first order would throw
  // DONATION_DELETE_ALREADY_DELETED here — the donation row is gone, so the
  // donation guard would fire before the ledger lookup could find the frozen
  // submission. This case fails if the ledger lookup ever moves after the
  // donation read. The assertion covers BOTH halves: no throw, and the returned
  // value deep-equals the original.
  const replay = await deleteDonation(authed, {
    donationId,
    eventId,
    idempotencyKey: replayKey,
  })

  expect(replay).toEqual(result)
  expect(replay.remainingMinor).toBe(55_000)
  expect(replay.allocationCount).toBe(2)
  expect(await countLedgerRows(seeded)).toBe(ledgerCount)
  expect((await loadRemovalAuditRows(seeded, donationId)).length).toBe(
    removalCount
  )
  // Zero writes on the replay path, byte for byte.
  expect(await snapshotDeletionTables(seeded)).toEqual(postDeletion)
})

// ---------------------------------------------------------------------------
// Case 5 (DDEL-03): the conflict class, both reachable directions
// ---------------------------------------------------------------------------

test("case 5: a key already used by another operation on the same donation is a typed conflict", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "del-conflict")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "conflict-a",
    name: "Attendee A",
    ticketPriceMinor: 30_000,
  })
  const second = await createAttendee(seeded, eventId, {
    orderId: first.orderId,
    attendeeKey: "conflict-b",
    name: "Attendee B",
    ticketPriceMinor: 30_000,
    sortOrder: 1,
  })
  const authed = seeded.withIdentity(adminIdentity)

  // Direction 1: a key minted by the set-replace allocation, reused by deletion.
  const donationOne = await createDonation(authed, {
    eventId,
    amountMinor: 60_000,
  })
  await allocate(authed, {
    donationId: donationOne,
    eventId,
    idempotencyKey: "shared-allocation-key",
    request: manualRequest([
      {
        attendeeId: first.attendeeId,
        amountMinor: 10_000,
        scope: "event_charges",
      },
    ]),
  })
  const beforeOne = await snapshotDeletionTables(seeded)
  const codeOne = await rejectionCode(
    deleteDonation(authed, {
      donationId: donationOne,
      eventId,
      idempotencyKey: "shared-allocation-key",
    })
  )
  // The snapshot assertion comes FIRST: an inertness regression must be
  // reported as a changed table, never masked by the code assertion.
  expect(await snapshotDeletionTables(seeded)).toEqual(beforeOne)
  expect(codeOne).toBe("DONATION_DELETE_IDEMPOTENCY_CONFLICT")
  expect(
    await seeded.query(async (ctx) => ctx.db.get("payments", donationOne))
  ).not.toBeNull()

  // Direction 2: a key minted by the single-row removal, reused by deletion.
  const donationTwo = await createDonation(authed, {
    eventId,
    amountMinor: 60_000,
  })
  await allocate(authed, {
    donationId: donationTwo,
    eventId,
    idempotencyKey: "remove-prep-key",
    request: manualRequest([
      {
        attendeeId: second.attendeeId,
        amountMinor: 5_000,
        scope: "whole_order",
      },
    ]),
  })
  await authed.mutation(api.donations.removeDonationAllocation, {
    donationId: donationTwo,
    eventId,
    attendeeId: second.attendeeId,
    idempotencyKey: "shared-removal-key",
  })
  const beforeTwo = await snapshotDeletionTables(seeded)
  const codeTwo = await rejectionCode(
    deleteDonation(authed, {
      donationId: donationTwo,
      eventId,
      idempotencyKey: "shared-removal-key",
    })
  )
  expect(await snapshotDeletionTables(seeded)).toEqual(beforeTwo)
  expect(codeTwo).toBe("DONATION_DELETE_IDEMPOTENCY_CONFLICT")
  expect(
    await seeded.query(async (ctx) => ctx.db.get("payments", donationTwo))
  ).not.toBeNull()

  // The mirror direction (an allocation operation replaying a delete's key) is
  // unreachable after a successful deletion — the donation is gone — and the
  // allocation-side conflict code is already pinned by Phase 55's suite.
})

// ---------------------------------------------------------------------------
// Case 6 (DDEL-03): a fresh key after a completed deletion
// ---------------------------------------------------------------------------

test("case 6: a fresh key after a completed deletion refuses with ALREADY_DELETED", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "del-already")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "already-a",
    name: "Attendee A",
    ticketPriceMinor: 20_000,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const donationId = await createDonation(authed, {
    eventId,
    amountMinor: 25_000,
  })
  await allocate(authed, {
    donationId,
    eventId,
    idempotencyKey: "already-allocate",
    request: manualRequest([
      { attendeeId, amountMinor: 10_000, scope: "event_charges" },
    ]),
  })
  await deleteDonation(authed, {
    donationId,
    eventId,
    idempotencyKey: "already-first-delete",
  })

  const postDeletion = await snapshotDeletionTables(seeded)
  const code = await rejectionCode(
    deleteDonation(authed, {
      donationId,
      eventId,
      idempotencyKey: "already-second-delete",
    })
  )
  // The refusal changes nothing — the post-deletion state is untouched.
  expect(await snapshotDeletionTables(seeded)).toEqual(postDeletion)
  expect(code).toBe("DONATION_DELETE_ALREADY_DELETED")
})

// ---------------------------------------------------------------------------
// Case 7 (DDEL-03): the not-found class, both shapes, both inert
// ---------------------------------------------------------------------------

test("case 7: a never-existing donation or event refuses with NOT_FOUND and changes nothing", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "del-not-found")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "not-found-a",
    name: "Attendee A",
    ticketPriceMinor: 20_000,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const donationId = await createDonation(authed, {
    eventId,
    amountMinor: 25_000,
  })
  await allocate(authed, {
    donationId,
    eventId,
    idempotencyKey: "not-found-allocate",
    request: manualRequest([
      { attendeeId, amountMinor: 10_000, scope: "event_charges" },
    ]),
  })

  const ghostDonationId = await insertThenDeletePayment(seeded, eventId)
  const ghostEventId = await insertThenDeleteEvent(seeded)

  // A well-formed donation id whose row never existed.
  const beforeDonationCase = await snapshotDeletionTables(seeded)
  const donationCode = await rejectionCode(
    deleteDonation(authed, {
      donationId: ghostDonationId,
      eventId,
      idempotencyKey: "ghost-donation",
    })
  )
  expect(await snapshotDeletionTables(seeded)).toEqual(beforeDonationCase)
  expect(donationCode).toBe("DONATION_DELETE_NOT_FOUND")

  // A well-formed event id whose row never existed: the live donation is
  // untouched because the event check fires before any donation work.
  const beforeEventCase = await snapshotDeletionTables(seeded)
  const eventCode = await rejectionCode(
    deleteDonation(authed, {
      donationId,
      eventId: ghostEventId,
      idempotencyKey: "ghost-event",
    })
  )
  expect(await snapshotDeletionTables(seeded)).toEqual(beforeEventCase)
  expect(eventCode).toBe("DONATION_DELETE_NOT_FOUND")
  expect(
    await seeded.query(async (ctx) => ctx.db.get("payments", donationId))
  ).not.toBeNull()
})

// ---------------------------------------------------------------------------
// Case 8 (DDEL-03): the blank-key refusal and the trim contract
// ---------------------------------------------------------------------------

test("case 8: a blank key is refused before any work, and a padded key is recorded trimmed", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "del-blank-key")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "blank-a",
    name: "Attendee A",
    ticketPriceMinor: 20_000,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const donationId = await createDonation(authed, {
    eventId,
    amountMinor: 25_000,
  })
  await allocate(authed, {
    donationId,
    eventId,
    idempotencyKey: "blank-allocate",
    request: manualRequest([
      { attendeeId, amountMinor: 8_000, scope: "event_charges" },
    ]),
  })

  // The whitespace-only key is refused BEFORE the ledger lookup or any read of
  // the donation — an unusable key can never be recorded, so a later retry with
  // the same (blank) key can never be mistaken for a replay.
  const before = await snapshotDeletionTables(seeded)
  const code = await rejectionCode(
    deleteDonation(authed, {
      donationId,
      eventId,
      idempotencyKey: "   ",
    })
  )
  expect(await snapshotDeletionTables(seeded)).toEqual(before)
  expect(code).toBe("DONATION_DELETE_INVALID_KEY")
  expect(
    await seeded.query(async (ctx) => ctx.db.get("payments", donationId))
  ).not.toBeNull()
  expect(await loadAllocationRowDetails(seeded, donationId)).toHaveLength(1)
  // Nothing beyond the allocation's own ledger row was written.
  expect(await countLedgerRows(seeded)).toBe(1)
  expect(await loadLedgerRow(seeded, donationId, "   ")).toBeNull()

  // The refusal does not reject a PADDED key, and the TRIMMED key is the
  // ledger's identity — the two halves of the key contract the handler owns.
  await deleteDonation(authed, {
    donationId,
    eventId,
    idempotencyKey: "  fresh-key  ",
  })
  const ledger = await loadLedgerRow(seeded, donationId, "fresh-key")
  expect(ledger).not.toBeNull()
  expect(ledger?.idempotencyKey).toBe("fresh-key")
  expect(ledger?.operation).toBe("delete")
  expect(
    await seeded.query(async (ctx) => ctx.db.get("payments", donationId))
  ).toBeNull()
})

// ---------------------------------------------------------------------------
// Task 2 — source-read helpers for the static pins
// ---------------------------------------------------------------------------

function sourceSlice(source: string, startMarker: string): string {
  const start = source.indexOf(startMarker)
  expect(start, `${startMarker} is missing`).toBeGreaterThanOrEqual(0)

  const end = source.indexOf("\nexport ", start + 1)
  return end === -1 ? source.slice(start) : source.slice(start, end)
}

/**
 * The balanced-parenthesis slice starting at `marker`, so a union's member list
 * can be asserted without depending on line wrapping or indentation.
 */
function balancedSlice(source: string, marker: string): string {
  const start = source.indexOf(marker)
  expect(start, `${marker} is missing`).toBeGreaterThanOrEqual(0)

  let depth = 0
  for (
    let index = start + marker.length - 1;
    index < source.length;
    index += 1
  ) {
    const character = source[index]
    if (character === "(") {
      depth += 1
    } else if (character === ")") {
      depth -= 1
      if (depth === 0) {
        return source.slice(start, index + 1)
      }
    }
  }

  throw new Error(`unbalanced marker: ${marker}`)
}

// ---------------------------------------------------------------------------
// Case 9 (DDEL-03): the non-standalone class, four shapes, each inert
// ---------------------------------------------------------------------------

test("case 9: refuses every non-standalone shape with NOT_STANDALONE and inert snapshots", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "del-not-standalone")
  const first = await createAttendee(seeded, eventId, {
    attendeeKey: "ns-a",
    name: "Attendee A",
    ticketPriceMinor: 20_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  // (a) An order-linked row reclassified through the PRODUCTION mutation: it
  // keeps its orderId and becomes `donationKind: "overpayment"`, `status:
  // "donation"` — the shape `markPaymentAsDonation` really writes.
  const linkedId = await seeded.mutation(async (ctx) =>
    ctx.db.insert("payments", {
      source: "cash" as const,
      eventId,
      orderId: String(first.orderId),
      payerName: "Linked payer",
      amountMinor: 5_000,
      paidAt: BASE_AT,
      status: "auto_matched" as const,
    })
  )
  await authed.mutation(api.payments.markPaymentAsDonation, {
    paymentId: linkedId,
    eventId,
  })
  const linkedRow = await seeded.query(async (ctx) =>
    ctx.db.get("payments", linkedId)
  )
  expect(linkedRow?.donationKind).toBe("overpayment")
  expect(linkedRow?.status).toBe("donation")
  expect(linkedRow?.orderId).toBe(String(first.orderId))

  // (b) An ambiguous row — hand-inserted; the donation surface never writes it.
  const ambiguousId = await seeded.mutation(async (ctx) =>
    ctx.db.insert("payments", {
      source: "cash" as const,
      eventId,
      payerName: "Ambiguous payer",
      amountMinor: 5_000,
      paidAt: BASE_AT,
      donationKind: "standalone" as const,
      status: "ambiguous" as const,
    })
  )

  // (c) standalone-kind but `unassigned` — never production-writable.
  const unassignedId = await seeded.mutation(async (ctx) =>
    ctx.db.insert("payments", {
      source: "cash" as const,
      eventId,
      payerName: "Unassigned payer",
      amountMinor: 5_000,
      paidAt: BASE_AT,
      donationKind: "standalone" as const,
      status: "unassigned" as const,
    })
  )

  // (d) standalone + donation but carrying an `orderId` provider alias — the
  // link term refuses it independently of the kind and status terms.
  const aliasId = await seeded.mutation(async (ctx) =>
    ctx.db.insert("payments", {
      source: "cash" as const,
      eventId,
      orderId: "orders_provider_alias_123",
      payerName: "Aliased payer",
      amountMinor: 5_000,
      paidAt: BASE_AT,
      donationKind: "standalone" as const,
      status: "donation" as const,
    })
  )

  const shapes: Array<{ label: string; paymentId: Id<"payments"> }> = [
    { label: "overpayment (order-linked)", paymentId: linkedId },
    { label: "ambiguous", paymentId: ambiguousId },
    { label: "unassigned standalone", paymentId: unassignedId },
    { label: "standalone with an orderId alias", paymentId: aliasId },
  ]

  for (const shape of shapes) {
    const before = await snapshotDeletionTables(seeded)
    const code = await rejectionCode(
      deleteDonation(authed, {
        donationId: shape.paymentId,
        eventId,
        idempotencyKey: `not-standalone-${shape.label}`,
      })
    )
    expect(await snapshotDeletionTables(seeded), shape.label).toEqual(before)
    expect(code, shape.label).toBe("DONATION_DELETE_NOT_STANDALONE")
  }
})

// ---------------------------------------------------------------------------
// Case 10 (DDEL-03): the cross-event class, both shapes, each inert
// ---------------------------------------------------------------------------

test("case 10: refuses cross-event and eventless donations with CROSS_EVENT and inert snapshots", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "del-cross-event")
  const otherEventId = await seedEvent(seeded, "del-cross-event-other")
  const authed = seeded.withIdentity(adminIdentity)

  // A real donation on ANOTHER event, deleted against the first event.
  const foreignDonationId = await createDonation(authed, {
    eventId: otherEventId,
    amountMinor: 20_000,
  })

  // An eventless standalone row — hand-inserted; the production surface always
  // sets the event for a standalone donation.
  const eventlessId = await seeded.mutation(async (ctx) =>
    ctx.db.insert("payments", {
      source: "cash" as const,
      payerName: "Eventless donor",
      amountMinor: 20_000,
      paidAt: BASE_AT,
      donationKind: "standalone" as const,
      status: "donation" as const,
    })
  )

  const cases: Array<{ label: string; paymentId: Id<"payments"> }> = [
    { label: "foreign event", paymentId: foreignDonationId },
    { label: "eventless row", paymentId: eventlessId },
  ]

  for (const entry of cases) {
    const before = await snapshotDeletionTables(seeded)
    const code = await rejectionCode(
      deleteDonation(authed, {
        donationId: entry.paymentId,
        eventId,
        idempotencyKey: `cross-event-${entry.label}`,
      })
    )
    expect(await snapshotDeletionTables(seeded), entry.label).toEqual(before)
    expect(code, entry.label).toBe("DONATION_DELETE_CROSS_EVENT")
  }
})

// ---------------------------------------------------------------------------
// Case 11 (DDEL-03): the Tikkie class, demonstrated against its mechanism
// ---------------------------------------------------------------------------

test("case 11: refuses a Tikkie donation and DEMONSTRATES the resurrection hazard", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "del-tikkie")
  const authed = seeded.withIdentity(adminIdentity)
  const sourceId = "tikkie-donation-source-1"

  // Seeded through the PRODUCTION upsert: it lands as a standalone donation.
  const seededTikkie = await authed.mutation(api.payments.upsertTikkiePayment, {
    sourceId,
    eventId: String(eventId),
    purpose: "donation",
    payerName: "Tikkie donor",
    amountMinor: 12_500,
    paidAt: BASE_AT,
  })
  expect(seededTikkie.inserted).toBe(true)

  const tikkieRow = await seeded.query(async (ctx) =>
    ctx.db.get("payments", seededTikkie.id)
  )
  expect(tikkieRow?.source).toBe("tikkie")
  expect(tikkieRow?.sourceId).toBe(sourceId)
  expect(tikkieRow?.status).toBe("donation")
  expect(tikkieRow?.donationKind).toBe("standalone")

  // The refusal, inert.
  const before = await snapshotDeletionTables(seeded)
  const code = await rejectionCode(
    deleteDonation(authed, {
      donationId: seededTikkie.id,
      eventId,
      idempotencyKey: "tikkie-refusal",
    })
  )
  expect(await snapshotDeletionTables(seeded)).toEqual(before)
  expect(code).toBe("DONATION_DELETE_TIKKIE_SOURCED")

  // THE RESURRECTION DEMONSTRATION. A naive hard delete of this row would be
  // undone by a later poll: the poller re-fetches from
  // `watermark − TIKKIE_POLL_OVERLAP_MS` (`convex/autoSync.ts:23,68`; the
  // watermark is persisted at `convex/sync/internal.ts:216`), the upsert finds
  // no row at `(source, sourceId)` (`convex/payments.ts:480-496`) and
  // re-inserts it (`:502-513`). Delete the row directly — a raw test mutation,
  // unguarded, exactly what the handler must never do — and show the next
  // upsert re-inserting the SAME `(source, sourceId)`.
  await seeded.mutation(async (ctx) => {
    await ctx.db.delete("payments", seededTikkie.id)
  })
  expect(
    await seeded.query(async (ctx) => ctx.db.get("payments", seededTikkie.id))
  ).toBeNull()

  const resurrected = await authed.mutation(api.payments.upsertTikkiePayment, {
    sourceId,
    eventId: String(eventId),
    purpose: "donation",
    payerName: "Tikkie donor",
    amountMinor: 12_500,
    paidAt: BASE_AT,
  })

  // The upsert returns `{ id, inserted: true, updated: false }` on this branch
  // (`convex/payments.ts:515`) — assert the FLAG, never a whole-object
  // deep-equal of the returned object.
  expect(resurrected.inserted).toBe(true)
  expect(resurrected.updated).toBe(false)
  expect(String(resurrected.id)).not.toBe(String(seededTikkie.id))

  const reborn = await seeded.query(async (ctx) =>
    ctx.db.get("payments", resurrected.id)
  )
  expect(reborn?.source).toBe("tikkie")
  expect(reborn?.sourceId).toBe(sourceId)
  expect(reborn?.status).toBe("donation")
  expect(reborn?.donationKind).toBe("standalone")
  expect(reborn?.eventId).toBe(eventId)
})

// ---------------------------------------------------------------------------
// Case 12 (DDEL-03): the unreachable-by-design generic source guard
// ---------------------------------------------------------------------------

test("case 12: the generic source guard is fail-closed and unreachable at the DB level by design", () => {
  const domainSource = readFileSync(
    resolve(import.meta.dirname, "../lib/domain/finance/donation-deletion.ts"),
    "utf8"
  )

  // Both manual sources are enumerated in the guard, so a source outside them
  // is refused by default. (Whitespace-normalised so line wrapping cannot hide
  // a clause.)
  const domainFlat = domainSource.replace(/\s+/g, " ")
  expect(domainFlat).toContain('payment.source !== "cash"')
  expect(domainFlat).toContain('payment.source !== "bank_transfer"')
  expect(domainSource).toContain("DONATION_DELETE_PAYMENT_GUARD")

  // That branch is unreachable at the DB level BY DESIGN: the live union has
  // exactly three members and the schema validator rejects anything else, so
  // there is no schema-valid row that could reach it — which is why this suite
  // has NO handler-level case for it. Adding a fourth source to the schema
  // fails this assertion deliberately: the classifier must be widened first.
  const schemaSource = readFileSync(
    resolve(import.meta.dirname, "schema.ts"),
    "utf8"
  )
  const paymentsSlice = sourceSlice(schemaSource, "payments: defineTable(")
  const sourceUnion = balancedSlice(paymentsSlice, "source: v.union(")
  expect(sourceUnion.match(/v\.literal\(/g)).toHaveLength(3)
  expect(sourceUnion).toContain('v.literal("tikkie")')
  expect(sourceUnion).toContain('v.literal("bank_transfer")')
  expect(sourceUnion).toContain('v.literal("cash")')

  // The unreachable-branch behaviour itself is owned by the pure classifier
  // suite (plan 57-02, `tests/finance/donation-deletion.test.ts`); this link
  // keeps that claim honest.
  const pureSuiteSource = readFileSync(
    resolve(import.meta.dirname, "../tests/finance/donation-deletion.test.ts"),
    "utf8"
  )
  expect(pureSuiteSource).toContain("DONATION_DELETE_PAYMENT_GUARD")
})

// ---------------------------------------------------------------------------
// Case 13 (DDEL-03): the existing payment-deletion boundary is unchanged
// ---------------------------------------------------------------------------

test("case 13: deletePayment still refuses a standalone donation and changes nothing", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "del-payment-boundary")
  const { attendeeId } = await createAttendee(seeded, eventId, {
    attendeeKey: "boundary-a",
    name: "Attendee A",
    ticketPriceMinor: 20_000,
  })
  const authed = seeded.withIdentity(adminIdentity)
  const donationId = await createDonation(authed, {
    eventId,
    amountMinor: 25_000,
  })
  await allocate(authed, {
    donationId,
    eventId,
    idempotencyKey: "boundary-allocate",
    request: manualRequest([
      { attendeeId, amountMinor: 10_000, scope: "event_charges" },
    ]),
  })

  const before = await snapshotDeletionTables(seeded)
  await expect(
    authed.mutation(api.payments.deletePayment, {
      paymentId: donationId,
      eventId,
    })
  ).rejects.toThrow("Only unassigned payments can be deleted")
  expect(await snapshotDeletionTables(seeded)).toEqual(before)
  expect(
    await seeded.query(async (ctx) => ctx.db.get("payments", donationId))
  ).not.toBeNull()
  expect(await loadAllocationRowDetails(seeded, donationId)).toHaveLength(1)
  expect(await loadRemovalAuditRows(seeded, donationId)).toEqual([])
})

// ---------------------------------------------------------------------------
// Case 14 (structural): the module stays single-transaction and single-write
// ---------------------------------------------------------------------------

test("case 14: the deletion module stays single-transaction, single-write and outside the Phase 56 scan set", () => {
  const source = readFileSync(
    resolve(import.meta.dirname, "donationDeletion.ts"),
    "utf8"
  )

  // Exactly ONE payments write: the hard delete. No insert / patch / replace.
  expect(source.match(/db\.delete\("payments"/g) ?? []).toHaveLength(1)
  expect(source).not.toContain('db.insert("payments"')
  expect(source).not.toContain('db.patch("payments"')
  expect(source).not.toContain('db.replace("payments"')

  // No nested mutation and no scheduler. The scan is PREFIX-ANCHORED on the
  // `ctx.`-prefixed tokens on purpose: the mandated module header legitimately
  // contains the phrase "no nested mutations and no scheduler", so a
  // bare-token scan for the words themselves would fail on correct code.
  expect(source).not.toContain("ctx.runMutation")
  expect(source).not.toContain("ctx.scheduler")

  // The reversal goes through the two shared helpers, never a parallel path.
  expect(source).toContain("loadRecordedAllocations")
  expect(source).toContain("writeAllocationRemovalAudit")

  // The Phase 56 guard set (case 7b of tests/finance/phase56-money-integrity)
  // stays out of this module.
  expect(source).not.toContain("loadMatchedPaymentTotalsByOrderId")
  expect(source).not.toContain("buildMatchedTotalsByOrderId")
  expect(source).not.toContain("isOrderAppliedPayment(")
})

// ---------------------------------------------------------------------------
// Case 15 (static): the resurrection mechanism is pinned in the source
// ---------------------------------------------------------------------------

test("case 15: pins the Tikkie resurrection mechanism in the source", () => {
  const paymentsSource = readFileSync(
    resolve(import.meta.dirname, "payments.ts"),
    "utf8"
  )
  const upsertSlice = sourceSlice(
    paymentsSource,
    "export const upsertTikkiePayment"
  )
  // Find by `(source, sourceId)` through the dedicated index, then INSERT a
  // fresh row when no row matches — the two steps that resurrect a deleted
  // Tikkie donation.
  expect(upsertSlice).toContain("source_sourceId")
  expect(upsertSlice).toContain('eq("source", "tikkie")')
  expect(upsertSlice).toContain('db.insert("payments"')

  // The poll re-fetches from the overlap window, so a payment removed less than
  // TIKKIE_POLL_OVERLAP_MS before the last poll is seen again.
  const autoSyncSource = readFileSync(
    resolve(import.meta.dirname, "autoSync.ts"),
    "utf8"
  )
  expect(autoSyncSource).toContain("TIKKIE_POLL_OVERLAP_MS")
  expect(autoSyncSource).toContain(
    "providerLastCheckedAt - TIKKIE_POLL_OVERLAP_MS"
  )

  // ...and the watermark itself is persisted on the link row.
  const syncInternalSource = readFileSync(
    resolve(import.meta.dirname, "sync/internal.ts"),
    "utf8"
  )
  expect(syncInternalSource).toContain("providerLastCheckedAt: args.checkedAt")

  // The deletion module describes the re-insertion FUNCTIONALLY instead of
  // naming the sync symbols. The scan normalises case and separators, so a
  // capitalised, hyphenated or underscored mention still fails — a future
  // author cannot make the module a second sync owner by naming it.
  const deletionSource = readFileSync(
    resolve(import.meta.dirname, "donationDeletion.ts"),
    "utf8"
  )
  const lower = deletionSource.toLowerCase()
  const flat = lower.replace(/[-_\s]/g, "")
  expect(flat).not.toContain("autosync")
  expect(flat).not.toContain("upserttikkiepayment")
  expect(lower).not.toContain("tombston")
})
