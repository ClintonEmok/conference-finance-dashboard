/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"

/**
 * Phase 58's ACCEPTANCE EXAMPLES, on real writes.
 *
 * AE-1a..1e are the locked effective-capacity worked case and its neighbours,
 * machine-checked through the production quote (`previewDonationAllocation`),
 * the two commit paths (`allocateDonationToAttendee` additive and
 * `allocateDonation` set-replace) and the read projection
 * (`getDonationAllocationSummary`). Every amount is an exact integer minor
 * unit — never a shape assertion.
 *
 * HARNESS PROVENANCE: `fresh`, `manualRequest`, `allocate`, `allocateOne`,
 * `seedEvent` (:349), `createAttendee` (:373), `createDonation` (:434),
 * `loadSummary` (:317), `preview` (:3052) and `rejectionCode` (:3081) are
 * copied from `convex/donation-allocation.handlers.test.ts` (the Phase 55
 * harness) so this suite starts from the same fixtures and idioms. No
 * production file is touched by this file.
 *
 * FIXTURE RULE (makes every case non-vacuous): ONE event and ONE order per
 * case, with a distinct slug per case. The ceiling projection is
 * donation-scoped — it excludes SELF and subtracts OTHERS — so two cases
 * sharing an order would move each other's ceilings. `seedMariaAndTom` seeds
 * Maria (12 000) and Tom (8 000) onto the SAME order, so the order is due
 * exactly 20 000 while the two attendees keep distinct own balances.
 */

const modules = import.meta.glob("./**/*.ts")

const BASE_AT = 1_750_000_000_000

const adminIdentity = {
  tokenIdentifier: "admin:donation-allocation-acceptance",
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

type AllocationRequestInput =
  | { method: "manual"; rows: ManualRowInput[] }
  | { method: "equal"; targets: TargetInput[] }
  | { method: "largest_balance_first"; targets: TargetInput[] }

function fresh() {
  return convexTest(schema, modules)
}

function manualRequest(rows: ManualRowInput[]) {
  return { method: "manual" as const, rows }
}

/**
 * The allocation mutation REQUIRES an idempotency key (D-21), so every call
 * site goes through this helper (copied from the Phase 55 harness): unless a
 * test passes an explicit key, a fresh one is minted per call, which is what a
 * real operator client does.
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

/** The D-17 single-row additive mutation, keyed like `allocate`. */
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
 * `loadOrderAmountDueBreakdowns` loader prices from. Without the selection the
 * loader returns a zero ceiling and every assertion here would be vacuous.
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

/**
 * AE-1's shared fixture shape, freshly seeded per call: ONE event, ONE order,
 * Maria due 12 000 and Tom due 8 000 on that same order (order due 20 000).
 */
async function seedMariaAndTom(
  t: TestConvex,
  slug: string
): Promise<{
  eventId: Id<"events">
  maria: { orderId: Id<"orders">; attendeeId: Id<"orderAttendees"> }
  tom: { orderId: Id<"orders">; attendeeId: Id<"orderAttendees"> }
}> {
  const eventId = await seedEvent(t, slug)
  const maria = await createAttendee(t, eventId, {
    attendeeKey: `${slug}-maria`,
    name: "Maria",
    ticketPriceMinor: 12_000,
  })
  const tom = await createAttendee(t, eventId, {
    orderId: maria.orderId,
    attendeeKey: `${slug}-tom`,
    name: "Tom",
    ticketPriceMinor: 8_000,
    sortOrder: 1,
  })

  return { eventId, maria, tom }
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

/** Calls the summary query with an authenticated client. */
async function loadSummary(
  client: TestConvex,
  donationId: Id<"payments">
): Promise<SummaryResult> {
  return client.query(api.donations.getDonationAllocationSummary, {
    donationId,
  })
}

/**
 * Finds one attendee's summary row, failing loudly when it is absent (so a
 * missing row can never turn a `toBe` into a vacuous `undefined`).
 */
function summaryRowFor(
  summary: SummaryResult,
  attendeeId: Id<"orderAttendees">
): SummaryRow {
  const row = summary.rows.find(
    (entry) => entry.attendeeId === String(attendeeId)
  )
  if (!row) {
    throw new Error(`no summary row for attendee ${String(attendeeId)}`)
  }
  return row
}

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

/** The read-only D-07 preview; argument-compatible with `allocateDonation`. */
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

/** Finds one preview row, failing loudly when it is absent. */
function previewRowFor(
  payload: PreviewResult,
  attendeeId: Id<"orderAttendees">
): PreviewBreakdownRow {
  const row = payload.rows.find(
    (entry) => entry.attendeeId === String(attendeeId)
  )
  if (!row) {
    throw new Error(`no preview row for attendee ${String(attendeeId)}`)
  }
  return row
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

/** The eight projected figures of a summary row, for exact comparisons. */
function rowFigures(row: SummaryRow) {
  return {
    scope: row.scope,
    scopeOutstandingMinor: row.scopeOutstandingMinor,
    effectiveCapacityMinor: row.effectiveCapacityMinor,
    amountMinor: row.amountMinor,
    appliedMinor: row.appliedMinor,
    unappliedMinor: row.unappliedMinor,
    exceedsCeiling: row.exceedsCeiling,
    exceedsCapacity: row.exceedsCapacity,
  }
}

// ---------------------------------------------------------------------------
// AE-1a — the LOCKED worked case, additive path + read projection
// ---------------------------------------------------------------------------

test("AE-1a — Order A €200 (Maria €120, Tom €80) with a €100 whole_order claim: the ceiling reads €120 while only €100 is writable", async () => {
  const seeded = fresh()
  const { eventId, maria, tom } = await seedMariaAndTom(
    seeded,
    "ae1a-effective-capacity"
  )
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 30_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  // THE CEILING IS DONATION-SCOPED (exclude SELF, include OTHERS), so every
  // figure below is the production projection's own, not a fixture assumption.

  // 1. Tom claims 10 000 of the order's 20 000 pool, whole order.
  const tomCommitted = await allocateOne(authed, {
    donationId,
    eventId,
    attendeeId: tom.attendeeId,
    amountMinor: 10_000,
    scope: "whole_order",
  })
  expect(tomCommitted.allocatedTotalMinor).toBe(10_000)
  expect(tomCommitted.remainingMinor).toBe(20_000)

  // 2. Maria's OWN event-charges ceiling is 12 000, but this donation already
  //    holds 10 000 on her order (any scope), so the writable pool is 10 000.
  //    The ORDER bound fires — not her attendee bound — because the per-row
  //    ceiling check passes first (12 000 <= 12 000) and the shared order pool
  //    is consumed any-scope (convex/donations.ts:1127-1133).
  expect(
    await rejectionCode(
      allocateOne(authed, {
        donationId,
        eventId,
        attendeeId: maria.attendeeId,
        amountMinor: 12_000,
        scope: "event_charges",
      })
    )
  ).toBe("DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY")

  // 3. 10 000 of the remaining 10 000 fits.
  const mariaCommitted = await allocateOne(authed, {
    donationId,
    eventId,
    attendeeId: maria.attendeeId,
    amountMinor: 10_000,
    scope: "event_charges",
  })
  expect(mariaCommitted.allocatedTotalMinor).toBe(20_000)
  expect(mariaCommitted.remainingMinor).toBe(10_000)

  // 4. THE LOCKED CLAIM: the ceiling reads 12 000, only 10 000 was writable,
  //    and the recorded 10 000 is neither over the ceiling nor over capacity.
  const summary = await loadSummary(authed, donationId)
  expect(rowFigures(summaryRowFor(summary, maria.attendeeId))).toEqual({
    scope: "event_charges",
    scopeOutstandingMinor: 12_000,
    effectiveCapacityMinor: 10_000,
    amountMinor: 10_000,
    appliedMinor: 10_000,
    unappliedMinor: 0,
    exceedsCeiling: false,
    exceedsCapacity: false,
  })

  // 5. Tom's row. DOCUMENTED ERRATUM: the UI-SPEC's AE-1a step 4 says Tom's
  //    `effectiveCapacityMinor` is 20 000. The projection computes
  //    min(scopeOutstandingMinor, wholeOrderOutstanding − this donation's OTHER
  //    rows on the order, ANY scope) (lib/domain/finance/donation-allocation.ts
  //    :961-972), and once Maria's 10 000 row exists that is
  //    min(20 000, 20 000 − 10 000) = 10 000 — the same any-scope pool rule the
  //    writer enforces. The code-true value is 10 000; the spec text is stale.
  const tomRow = summaryRowFor(summary, tom.attendeeId)
  expect(rowFigures(tomRow)).toEqual({
    scope: "whole_order",
    scopeOutstandingMinor: 20_000,
    effectiveCapacityMinor: 10_000,
    amountMinor: 10_000,
    appliedMinor: 10_000,
    unappliedMinor: 0,
    exceedsCeiling: false,
    exceedsCapacity: false,
  })

  // 6. The donation's own composition is unchanged by the staleness view: the
  //    two recorded rows total 20 000 of 30 000.
  expect(summary.recordedAllocatedMinor).toBe(20_000)
  expect(summary.remainingMinor).toBe(10_000)
})

// ---------------------------------------------------------------------------
// AE-1b — set-replace path refuses and NAMES the order bound, commit parity
// ---------------------------------------------------------------------------

test("AE-1b — the set-replace quote refuses 22 000 on the 20 000 order, the commit agrees, and the fitting shape leaves exactly 2 000", async () => {
  const seeded = fresh()
  const { eventId, maria, tom } = await seedMariaAndTom(
    seeded,
    "ae1b-order-bound"
  )
  // The 22 000 donation is LOAD-BEARING — see the size table below.
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 22_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  // 1. The order-bound refusal on the SET-REPLACE quote. Derivation:
  //    requestedMinor = 22 000 <= availableMinor = 22 000 passes the remainder
  //    check FIRST (donation-allocation.ts:260-266); both per-row scope
  //    ceilings pass (Tom whole_order 10 000 <= 20 000; Maria event_charges
  //    12 000 <= 12 000); then the ONE shared order pool (:291-312) is
  //    wholeOrderOutstanding 20 000 − alreadyClaimedByOrder 0 = 20 000, Tom's
  //    row leaves 10 000, and Maria's 12 000 breaches it. The pool starts EMPTY
  //    because a set-replace re-places the donation's WHOLE set
  //    (convex/donations.ts:1429-1431,1492).
  const refusedRequest = manualRequest([
    { attendeeId: tom.attendeeId, amountMinor: 10_000, scope: "whole_order" },
    {
      attendeeId: maria.attendeeId,
      amountMinor: 12_000,
      scope: "event_charges",
    },
  ])
  expect(
    await rejectionCode(
      preview(authed, { donationId, eventId, request: refusedRequest })
    )
  ).toBe("DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY")

  // 2. PARITY: the commit refuses with the SAME code. The commit validates the
  //    identical resolved rows with the identical EMPTY alreadyClaimedByOrder
  //    (convex/donations.ts:957-962), so the two paths cannot disagree. This is
  //    the contract invariant: an operator can never be refused at commit by a
  //    bound the quote did not already name.
  expect(
    await rejectionCode(
      allocate(authed, { donationId, eventId, request: refusedRequest })
    )
  ).toBe("DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY")

  // 3. The fitting shape resolves with the EXPECTED 2 000 leftover: the plan
  //    places 20 000 of a 22 000 donation, so leftoverMinor is
  //    max(0, 22 000 − 20 000) = 2 000 (convex/donations.ts:1509-1510). The 2 000
  //    is not a bug and must not be "fixed" by shrinking the donation.
  const quoted = await preview(authed, {
    donationId,
    eventId,
    request: manualRequest([
      { attendeeId: tom.attendeeId, amountMinor: 10_000, scope: "whole_order" },
      {
        attendeeId: maria.attendeeId,
        amountMinor: 10_000,
        scope: "event_charges",
      },
    ]),
  })
  expect(quoted.totalAllocatedMinor).toBe(20_000)
  expect(quoted.leftoverMinor).toBe(2_000)
  // Maria's quotable ceiling is the BARE scope ceiling (12 000) — the dialog
  // must label it `Scope balance`, never `Writable`: the writable figure here
  // is 10 000 and it is not this field.
  expect(previewRowFor(quoted, maria.attendeeId).ceilingMinor).toBe(12_000)
  expect(previewRowFor(quoted, tom.attendeeId).ceilingMinor).toBe(20_000)

  // 4. WHICH REFUSAL FIRES AT WHICH DONATION SIZE (kept here so no future
  //    reader "simplifies" the fixture):
  //      - the 22 000 request of step 1: donation < 22 000 ->
  //        DONATION_ALLOCATION_EXCEEDS_REMAINDER (the sum check runs before the
  //        order pool); donation >= 22 000 ->
  //        DONATION_ALLOCATION_EXCEEDS_ORDER_CAPACITY (a 20 000 pool was asked
  //        for 22 000);
  //      - the 20 000 request of step 3: donation < 20 000 ->
  //        DONATION_ALLOCATION_EXCEEDS_REMAINDER; donation >= 20 000 -> resolves
  //        with leftoverMinor = donation − 20 000 (so 0 only at 20 000).
  //    No donation amount satisfies an "leftoverMinor: 0 on a 22 000 request"
  //    reading: at 20 000 the first quote reports EXCEEDS_REMAINDER (checked
  //    first), and a 22 000 request on a 20 000 pool cannot resolve at all.
  //    That is exactly why this fixture is 22 000 and step 3 asserts 2 000.

  // 5. The ATTENDEE bound is distinct and IS reachable on a single row: a
  //    13 000 event_charges request breaches Maria's own 12 000 ceiling, which
  //    precedes the order pool (donation-allocation.ts:268-281). This is the
  //    ceiling oracle the UI-SPEC §5.2 describes.
  expect(
    await rejectionCode(
      preview(authed, {
        donationId,
        eventId,
        request: manualRequest([
          {
            attendeeId: maria.attendeeId,
            amountMinor: 13_000,
            scope: "event_charges",
          },
        ]),
      })
    )
  ).toBe("DONATION_ALLOCATION_EXCEEDS_CEILING")
})

// ---------------------------------------------------------------------------
// AE-1c — a distribution method reports the shortfall instead of refusing
// ---------------------------------------------------------------------------

test("AE-1c — an equal split on a 25 000 donation reports 5 000 that cannot be placed instead of refusing", async () => {
  const seeded = fresh()
  const { eventId, maria, tom } = await seedMariaAndTom(
    seeded,
    "ae1c-shortfall"
  )
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 25_000,
  })
  const authed = seeded.withIdentity(adminIdentity)

  // CONTRAST WITH AE-1b: a MANUAL over-allocation is a typed refusal (the
  // operator asked for an amount that cannot fit); a DISTRIBUTION that cannot
  // place the whole amount is SUCCESS (DON-05) — the unplaced part is the
  // donation's leftover and stays available for a later submission. This call
  // resolving at all is half the assertion.
  const quoted = await preview(authed, {
    donationId,
    eventId,
    request: {
      method: "equal",
      targets: [
        { attendeeId: tom.attendeeId, scope: "whole_order" },
        { attendeeId: maria.attendeeId, scope: "event_charges" },
      ],
    },
  })

  // The shared order pool (20 000) is consumed ONCE across both targets, so the
  // two takes total 20 000 — not 20 000 + 12 000 of naive per-target ceilings.
  expect(quoted.totalAllocatedMinor).toBe(20_000)
  expect(previewRowFor(quoted, tom.attendeeId).amountMinor).toBe(10_000)
  expect(previewRowFor(quoted, maria.attendeeId).amountMinor).toBe(10_000)
  expect(quoted.leftoverMinor).toBe(5_000)
  expect(quoted.remainderMinor).toBe(0)
})

// ---------------------------------------------------------------------------
// AE-1d — the equal-split rounding remainder is money that WAS allocated
// ---------------------------------------------------------------------------

test("AE-1d — 10 001 split equally across three 3 500 orders allocates all 10 001 and reports the 2-unit rounding remainder", async () => {
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "ae1d-rounding-remainder")
  // Three attendees on three DISTINCT orders (no orderId passed), each with a
  // 3 500 scope balance — >= 3 400 so each share fits.
  const a1 = await createAttendee(seeded, eventId, {
    attendeeKey: "ae1d-a1",
    name: "A1",
    ticketPriceMinor: 3_500,
  })
  const a2 = await createAttendee(seeded, eventId, {
    attendeeKey: "ae1d-a2",
    name: "A2",
    ticketPriceMinor: 3_500,
  })
  const a3 = await createAttendee(seeded, eventId, {
    attendeeKey: "ae1d-a3",
    name: "A3",
    ticketPriceMinor: 3_500,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 10_001,
  })
  const authed = seeded.withIdentity(adminIdentity)

  const quoted = await preview(authed, {
    donationId,
    eventId,
    request: {
      method: "equal",
      targets: [
        { attendeeId: a1.attendeeId, scope: "event_charges" },
        { attendeeId: a2.attendeeId, scope: "event_charges" },
        { attendeeId: a3.attendeeId, scope: "event_charges" },
      ],
    },
  })

  // 10 001 / 3 = 3 333.67 — the indivisible remainder is two minor units, and
  // it is part of `totalAllocatedMinor`: NOT money left over.
  expect(quoted.totalAllocatedMinor).toBe(10_001)
  expect(quoted.leftoverMinor).toBe(0)
  expect(quoted.remainderMinor).toBe(2)
  expect(quoted.remainderRecipientAttendeeIds).toEqual([
    String(a1.attendeeId),
    String(a2.attendeeId),
  ])
  expect(quoted.rows.filter((row) => row.extraMinorUnits === 1)).toHaveLength(2)
  expect(quoted.rows.filter((row) => row.extraMinorUnits === 0)).toHaveLength(1)

  // The multiset pins the identity: Σ row amounts === totalAllocatedMinor ===
  // the donation amount.
  const amounts = quoted.rows
    .map((row) => row.amountMinor)
    .sort((left, right) => right - left)
  expect(amounts).toEqual([3_334, 3_334, 3_333])
  expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(10_001)
  expect(quoted.rows.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(
    quoted.totalAllocatedMinor
  )
})

// ---------------------------------------------------------------------------
// AE-1e — commit parity on the success path
// ---------------------------------------------------------------------------

test("AE-1e — the commit's frozen remainingMinor equals the preview's leftoverMinor, not the preview's pre-submission remainingMinor", async () => {
  // AE-1d's request on a fresh copy of AE-1d's fixture (each case owns its
  // event + orders).
  const seeded = fresh()
  const eventId = await seedEvent(seeded, "ae1e-commit-parity")
  const a1 = await createAttendee(seeded, eventId, {
    attendeeKey: "ae1e-a1",
    name: "A1",
    ticketPriceMinor: 3_500,
  })
  const a2 = await createAttendee(seeded, eventId, {
    attendeeKey: "ae1e-a2",
    name: "A2",
    ticketPriceMinor: 3_500,
  })
  const a3 = await createAttendee(seeded, eventId, {
    attendeeKey: "ae1e-a3",
    name: "A3",
    ticketPriceMinor: 3_500,
  })
  const donationId = await createDonation(seeded, eventId, {
    amountMinor: 10_001,
  })
  const authed = seeded.withIdentity(adminIdentity)

  const request: AllocationRequestInput = {
    method: "equal",
    targets: [
      { attendeeId: a1.attendeeId, scope: "event_charges" },
      { attendeeId: a2.attendeeId, scope: "event_charges" },
      { attendeeId: a3.attendeeId, scope: "event_charges" },
    ],
  }

  const quoted = await preview(authed, { donationId, eventId, request })

  // THE PREVIEW'S `remainingMinor` IS PRE-SUBMISSION: it is
  // `deriveAllocationRemainingMinor` over the donation's RECORDED rows
  // (convex/donations.ts:1461-1466, returned at :1526). Nothing is recorded
  // yet, so it reads the full 10 001.
  expect(quoted.remainingMinor).toBe(10_001)
  expect(quoted.leftoverMinor).toBe(0)
  expect(quoted.totalAllocatedMinor).toBe(10_001)

  const committed = await allocate(authed, { donationId, eventId, request })

  // THE COMMIT'S FROZEN `remainingMinor` IS POST-SUBMISSION: it is derived from
  // the rows being written (convex/donations.ts:868-876, `10 001 − 10 001 = 0`).
  // Because a valid set-replace leaves exactly `donation − Σ written rows`, the
  // frozen value always equals the preview's `leftoverMinor` — NEVER the
  // preview's pre-submission `remainingMinor`. This is the repo's own pinned
  // parity (convex/donation-allocation.handlers.test.ts:3176). A future reader
  // must not "fix" this pair back to `remainingMinor === remainingMinor`:
  // those two figures are 0 and 10 001 and can never be equal.
  expect(committed.allocatedTotalMinor).toBe(quoted.totalAllocatedMinor)
  expect(committed.remainingMinor).toBe(quoted.leftoverMinor)
  expect(committed.remainingMinor).not.toBe(quoted.remainingMinor)

  // The recorded basis agrees after the write: the remainder collapses to zero.
  const summary = await loadSummary(authed, donationId)
  expect(summary.recordedAllocatedMinor).toBe(10_001)
  expect(summary.remainingMinor).toBe(0)
})
