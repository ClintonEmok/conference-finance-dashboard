/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import type { Doc, Id } from "./_generated/dataModel"
import type { PaginationResult } from "convex/server"
import {
  loadCanonicalOrderBalances,
  loadOrderAmountDueBreakdowns,
  loadOrderPaymentAttributions,
} from "./finance"

/**
 * Phase 59 plan 03 — the DEDICATED-PAGE cross-surface agreement proof
 * (DVER-01 / DVER-02, 59-CONTEXT gap 2).
 *
 * THE CLAIM: on ONE allocation-bearing fixture, the THREE reads that back the
 * dedicated `/donations` page and its record panel report the SAME money — and
 * that agreement is the canonical owners' own figures, not merely three reads
 * that happen to match each other. Three reads can agree and ALL be wrong
 * (probe M-5 makes them consistently wrong and the agreement test stays green),
 * so the agreement is TIED to `convex/finance.ts`'s owners by two identities
 * read in the same run:
 *
 *   1. `getDonationAllocationSummary(D1).recordedAllocatedMinor`
 *      === order A's `targetedCreditMinor` + order B's `wholeOrderCreditMinor`
 *      (6 000 + 5 000 = 11 000), and
 *   2. `getEventDonationIncome(E).totals.allocatedMinor`
 *      === Σ (paidAmountMinor − appliedPaymentMinor) over A and B
 *      ((6 000 − 0) + (5 000 − 0) = 11 000).
 *
 * THE THREE READS (the dedicated pages, Phase 58):
 *   - `donations.getEventDonationIncome` (`convex/donations.ts:1603`) — the
 *     recorded-total band;
 *   - `payments.getStandaloneDonations` (`convex/payments.ts:707`) — the list,
 *     enriched by the ONE shared step at `convex/payments.ts:854-858`;
 *   - `donations.getDonationAllocationSummary` (`convex/donations.ts:1356`) —
 *     the record panel.
 *
 * THE COUNT IS DELIBERATELY ASYMMETRIC. The list read is a page projection
 * that adds only `allocatedMinor` + `unallocatedRemainderMinor` to the raw
 * `payments` row (`convex/payments.ts:854-858`), so it does NOT carry
 * `allocationCount`; the count exists on the income rows
 * (`convex/donations.ts:1683`) and is derived there from
 * `loadRecordedAllocatedMinorByDonationIds` (`convex/donations.ts:417-420`).
 * A three-way count comparison is unsatisfiable as an API fact, so the count is
 * compared income ↔ summary (`rows.length`) only, and the list's omission is
 * asserted explicitly — a future enrichment that adds the field is a conscious
 * contract change, never a silently-matching third value.
 *
 * DELIBERATELY NOT RE-TESTED HERE (cite, never duplicate):
 *   - the order/attendee/reconciliation agreement fixture:
 *     `convex/attendee-attribution.handlers.test.ts:372` (cases 1-5 and 7) and
 *     its structural scan at `:682` (Case 6);
 *   - the order-level ledger/reconciliation/status agreement:
 *     `convex/canonical-order-balance.handlers.test.ts:307`;
 *   - the list↔income agreement across all EIGHT paginate branches:
 *     `convex/donation-income.handlers.test.ts:601`;
 *   - the reconciliation display offset by the unallocated remainder:
 *     `tests/reconciliation/reconciliation-outstanding.test.ts:113`;
 *   - the economics of the once-each no-double-count identity (DVER-02):
 *     `convex/donation-no-double-count.handlers.test.ts` (59-02);
 *   - the DON-07 write-side scope pin:
 *     `convex/donation-allocation.handlers.test.ts:3757`.
 * This suite asserts only the minimal owner baseline needed to ANCHOR the
 * dedicated pages' three reads, and none of the above is re-walked.
 *
 * THE FIXTURE (exact integers, EUR minor units):
 *   - Event E: Order A (Maria 12_000 + Tom 8_000, NO payment) and
 *     Order B (Solo 5_000, NO payment).
 *   - D1 = 20_000 on E, allocated in ONE `allocateDonation` submission:
 *     6_000 `event_charges` to Maria + 5_000 `whole_order` naming Solo
 *     => allocated 11_000, remainder 9_000, count 2.
 *   - D2 = 7_000 on E, never allocated => 0 / 7_000 / 7_000, count 0.
 *   - Event E2: D3 = 3_000, never allocated — the event-scoping probe.
 *
 * Every donation is created through the production
 * `payments.createStandaloneDonation` mutation and the allocation through the
 * production `donations.allocateDonation` set-replace, so both reads and writes
 * run against real persisted rows — never rows hand-inserted by this test.
 *
 * TEST SPLIT (deliberate, see the M-5 evidence in the plan's SUMMARY):
 *   - Test 1 asserts AGREEMENT ONLY (cross-read comparisons, sets, counts and
 *     the recorded scopes) — it contains no absolute money literal, so a
 *     consistently-wrong set of reads cannot fail it;
 *   - Test 2 asserts the owners' exact figures, the two owner ties, and every
 *     absolute literal the agreement implies — a shared drift dies here.
 */

const modules = import.meta.glob("./**/*.ts")

const BASE_AT = 1_750_000_000_000

const adminIdentity = {
  tokenIdentifier: "admin:donation-cross-surface",
  name: "Admin",
  email: "admin@example.com",
}

const ALLOCATION_KEY_D1 = "donation-cross-surface-d1"

/** Distinct `paidAt` values so every ordering consumer stays deterministic. */
const PAID_AT = {
  donationD1: BASE_AT,
  donationD2: BASE_AT + 1_000,
  donationD3: BASE_AT + 2_000,
} as const

type TestConvex = TestConvexForDataModel<GenericDataModel>

type FinanceLoaderCtx = Parameters<typeof loadCanonicalOrderBalances>[0]["ctx"]

type ManualAllocationRow = {
  attendeeId: Id<"orderAttendees">
  amountMinor: number
  scope: "event_charges" | "whole_order"
}

function fresh() {
  return convexTest(schema, modules)
}

function manualRequest(rows: ManualAllocationRow[]) {
  return { method: "manual" as const, rows }
}

// ---------------------------------------------------------------------------
// Seeding helpers (file-local and minimal, the sibling suites' exact idioms).
// Donations always go through the production create mutation.
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

async function createStandaloneDonation(
  client: TestConvex,
  input: { eventId: Id<"events">; amountMinor: number; paidAt: number }
): Promise<Id<"payments">> {
  return client.mutation(api.payments.createStandaloneDonation, {
    eventId: input.eventId,
    payerName: "Donor",
    amountMinor: input.amountMinor,
    paidAt: input.paidAt,
    source: "cash",
  })
}

type CrossSurfaceFixture = {
  eventId: Id<"events">
  secondEventId: Id<"events">
  orderAId: Id<"orders">
  mariaId: Id<"orderAttendees">
  tomId: Id<"orderAttendees">
  orderBId: Id<"orders">
  soloId: Id<"orderAttendees">
  donationD1Id: Id<"payments">
  donationD2Id: Id<"payments">
  donationD3Id: Id<"payments">
}

/**
 * Seeds the plan's fixture WITHOUT any allocations, so the owner baseline can
 * be captured before `allocateDonation` moves it.
 */
async function seedCrossSurfaceFixture(
  t: TestConvex,
  authed: TestConvex
): Promise<CrossSurfaceFixture> {
  const eventId = await seedEvent(t, "donation-cross-surface")
  const secondEventId = await seedEvent(t, "donation-cross-surface-e2")

  // Order A — due 12_000 + 8_000 = 20_000, NO payment: allocation credit is
  // the only thing that can move this order.
  const maria = await createAttendee(t, eventId, {
    attendeeKey: "cs-maria",
    name: "Maria",
    ticketPriceMinor: 12_000,
  })
  const tom = await createAttendee(t, eventId, {
    orderId: maria.orderId,
    attendeeKey: "cs-tom",
    name: "Tom",
    ticketPriceMinor: 8_000,
    sortOrder: 1,
  })

  // Order B — due 5_000, NO payment.
  const solo = await createAttendee(t, eventId, {
    attendeeKey: "cs-solo",
    name: "Solo",
    ticketPriceMinor: 5_000,
  })

  const donationD1Id = await createStandaloneDonation(authed, {
    eventId,
    amountMinor: 20_000,
    paidAt: PAID_AT.donationD1,
  })
  const donationD2Id = await createStandaloneDonation(authed, {
    eventId,
    amountMinor: 7_000,
    paidAt: PAID_AT.donationD2,
  })
  const donationD3Id = await createStandaloneDonation(authed, {
    eventId: secondEventId,
    amountMinor: 3_000,
    paidAt: PAID_AT.donationD3,
  })

  return {
    eventId,
    secondEventId,
    orderAId: maria.orderId,
    mariaId: maria.attendeeId,
    tomId: tom.attendeeId,
    orderBId: solo.orderId,
    soloId: solo.attendeeId,
    donationD1Id,
    donationD2Id,
    donationD3Id,
  }
}

/** ONE set-replace submission: 6_000 `event_charges` Maria + 5_000 `whole_order` Solo. */
async function allocateCrossSurfaceFixture(
  authed: TestConvex,
  fixture: CrossSurfaceFixture
) {
  return authed.mutation(api.donations.allocateDonation, {
    donationId: fixture.donationD1Id,
    eventId: fixture.eventId,
    request: manualRequest([
      {
        attendeeId: fixture.mariaId,
        amountMinor: 6_000,
        scope: "event_charges",
      },
      { attendeeId: fixture.soloId, amountMinor: 5_000, scope: "whole_order" },
    ]),
    idempotencyKey: ALLOCATION_KEY_D1,
  })
}

// ---------------------------------------------------------------------------
// The three page reads — projected into plain data
// ---------------------------------------------------------------------------

/** `getEventDonationIncome` — the recorded-total band (event-scoped). */
async function readIncome(client: TestConvex, eventId: Id<"events">) {
  return client.query(api.donations.getEventDonationIncome, { eventId })
}

/**
 * The enriched list row: the raw `payments` document plus the ONE shared
 * enrichment step's two money fields (`convex/payments.ts:854-858`). The query
 * declares no `returns` validator, so the shape is projected here exactly.
 */
type DonationListRow = Doc<"payments"> & {
  allocatedMinor: number
  unallocatedRemainderMinor: number
}

/** `getStandaloneDonations` — the enriched list (event-scoped or global). */
async function readEventDonations(
  client: TestConvex,
  args: { eventId?: Id<"events"> }
): Promise<PaginationResult<DonationListRow>> {
  return client.query(api.payments.getStandaloneDonations, {
    ...args,
    paginationOpts: { numItems: 50, cursor: null },
  })
}

/**
 * The record panel's payload (`convex/donations.ts:1356`), projected from the
 * handler's own return shape — that query declares no `returns` validator
 * either.
 */
type DonationSummary = {
  donationId: Id<"payments">
  eventId: Id<"events"> | null
  donationAmountMinor: number
  recordedAllocatedMinor: number
  remainingMinor: number
  rows: Array<{
    attendeeId: string
    orderId: string
    scope: "event_charges" | "whole_order"
    scopeOutstandingMinor: number
    effectiveCapacityMinor: number
    amountMinor: number
    appliedMinor: number
    unappliedMinor: number
    exceedsCeiling: boolean
    exceedsCapacity: boolean
    createdAt: number
    createdBy: string
  }>
}

/** `getDonationAllocationSummary` — the record panel (donation-scoped). */
async function readSummary(
  client: TestConvex,
  donationId: Id<"payments">
): Promise<DonationSummary> {
  return client.query(api.donations.getDonationAllocationSummary, {
    donationId,
  })
}

/**
 * The SAME three fields, normalized out of each read. The field-name
 * differences are deliberate — `donationAmountMinor` on the two `donations.ts`
 * payloads, the raw `amountMinor` on a `payments` row — and are mapped here
 * explicitly, never papered over with optional chaining.
 */
type SharedFigure = {
  allocatedMinor: number
  unallocatedRemainderMinor: number
  faceMinor: number
}

function incomeFigures(
  income: Awaited<ReturnType<typeof readIncome>>
): Map<string, SharedFigure> {
  return new Map(
    income.donations.map((row) => [
      String(row.donationId),
      {
        allocatedMinor: row.allocatedMinor,
        unallocatedRemainderMinor: row.unallocatedRemainderMinor,
        faceMinor: row.donationAmountMinor,
      },
    ])
  )
}

function listFigures(rows: DonationListRow[]): Map<string, SharedFigure> {
  return new Map(
    rows.map((row) => [
      String(row._id),
      {
        allocatedMinor: row.allocatedMinor,
        unallocatedRemainderMinor: row.unallocatedRemainderMinor,
        faceMinor: row.amountMinor,
      },
    ])
  )
}

function summaryFigures(
  entries: ReadonlyArray<{
    donationId: Id<"payments">
    summary: DonationSummary
  }>
): Map<string, SharedFigure> {
  return new Map(
    entries.map(({ donationId, summary }) => [
      String(donationId),
      {
        allocatedMinor: summary.recordedAllocatedMinor,
        unallocatedRemainderMinor: summary.remainingMinor,
        faceMinor: summary.donationAmountMinor,
      },
    ])
  )
}

// --- Fail-loud lookups: never a `?? 0`, never a fabricated row -------------

function figureFor(
  figures: Map<string, SharedFigure>,
  donationId: Id<"payments">,
  readName: string
): SharedFigure {
  const figure = figures.get(String(donationId))
  if (!figure) {
    throw new Error(
      `donation ${String(donationId)} is missing from ${readName}`
    )
  }
  return figure
}

function incomeRowFor(
  income: Awaited<ReturnType<typeof readIncome>>,
  donationId: Id<"payments">
) {
  const row = income.donations.find(
    (entry) => String(entry.donationId) === String(donationId)
  )
  if (!row) {
    throw new Error(
      `donation ${String(donationId)} is missing from getEventDonationIncome`
    )
  }
  return row
}

function listRowFor(rows: DonationListRow[], donationId: Id<"payments">) {
  const row = rows.find((entry) => String(entry._id) === String(donationId))
  if (!row) {
    throw new Error(
      `donation ${String(donationId)} is missing from getStandaloneDonations`
    )
  }
  return row
}

function summaryRowFor(
  summary: DonationSummary,
  attendeeId: Id<"orderAttendees">
) {
  const row = summary.rows.find(
    (entry) => entry.attendeeId === String(attendeeId)
  )
  if (!row) {
    throw new Error(
      `attendee ${String(attendeeId)} is missing from getDonationAllocationSummary`
    )
  }
  return row
}

function donationIds(rows: ReadonlyArray<{ donationId: unknown }>) {
  return [...rows.map((row) => String(row.donationId))].sort()
}

// ---------------------------------------------------------------------------
// The canonical owners — the anchor. Both projections are built in ONE run and
// share ONE pricing pass (the `loadCanonicalOrderBalances` input contract).
// ---------------------------------------------------------------------------

type OrderBalanceProjection = {
  amountDueMinor: number
  appliedPaymentMinor: number
  allocationCreditMinor: number
  paidAmountMinor: number
  outstandingAmountMinor: number
  donationAmountMinor: number
  appliedAmountMinor: number
}

type AttendeeAttributionProjection = {
  attendeeId: string
  amountDueMinor: number
  paymentShareMinor: number
  targetedCreditMinor: number
  unappliedTargetedCreditMinor: number
  poolShareMinor: number
  paidAmountMinor: number
  outstandingAmountMinor: number
}

type OrderAttributionProjection = {
  appliedPaymentsMinor: number
  targetedCreditMinor: number
  wholeOrderCreditMinor: number
  orderPoolMinor: number
  unattributedTargetedCreditMinor: number
  orderPaidAmountMinor: number
  orderOutstandingAmountMinor: number
  byAttendeeId: AttendeeAttributionProjection[]
}

async function readOwnerProjections(
  t: TestConvex,
  orderIds: Id<"orders">[]
): Promise<{
  balances: Record<string, OrderBalanceProjection>
  attributions: Record<string, OrderAttributionProjection>
}> {
  return t.run(async (ctx) => {
    const loaderCtx = ctx as unknown as FinanceLoaderCtx
    const orders = orderIds.map((_id) => ({ _id }))

    const dueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      loaderCtx,
      orders
    )
    const balanceMap = await loadCanonicalOrderBalances({
      ctx: loaderCtx,
      orders,
      dueBreakdownsByOrderId,
    })
    const attributionMap = await loadOrderPaymentAttributions({
      ctx: loaderCtx,
      orders,
      dueBreakdownsByOrderId,
    })

    const balances: Record<string, OrderBalanceProjection> = {}
    for (const [orderKey, balance] of balanceMap) {
      balances[orderKey] = {
        amountDueMinor: balance.amountDueMinor,
        appliedPaymentMinor: balance.appliedPaymentMinor,
        allocationCreditMinor: balance.allocationCreditMinor,
        paidAmountMinor: balance.paidAmountMinor,
        outstandingAmountMinor: balance.outstandingAmountMinor,
        donationAmountMinor: balance.donationAmountMinor,
        appliedAmountMinor: balance.appliedAmountMinor,
      }
    }

    const attributions: Record<string, OrderAttributionProjection> = {}
    for (const [orderKey, attribution] of attributionMap) {
      attributions[orderKey] = {
        appliedPaymentsMinor: attribution.appliedPaymentsMinor,
        targetedCreditMinor: attribution.targetedCreditMinor,
        wholeOrderCreditMinor: attribution.wholeOrderCreditMinor,
        orderPoolMinor: attribution.orderPoolMinor,
        unattributedTargetedCreditMinor:
          attribution.unattributedTargetedCreditMinor,
        orderPaidAmountMinor: attribution.orderPaidAmountMinor,
        orderOutstandingAmountMinor: attribution.orderOutstandingAmountMinor,
        byAttendeeId: Array.from(attribution.byAttendeeId.values()).map(
          (row) => ({
            attendeeId: row.attendeeId,
            amountDueMinor: row.amountDueMinor,
            paymentShareMinor: row.paymentShareMinor,
            targetedCreditMinor: row.targetedCreditMinor,
            unappliedTargetedCreditMinor: row.unappliedTargetedCreditMinor,
            poolShareMinor: row.poolShareMinor,
            paidAmountMinor: row.paidAmountMinor,
            outstandingAmountMinor: row.outstandingAmountMinor,
          })
        ),
      }
    }

    return { balances, attributions }
  })
}

/** Fails loudly on a missing key — never a `?? 0` default. */
function balanceFor(
  balances: Record<string, OrderBalanceProjection>,
  orderId: Id<"orders">
): OrderBalanceProjection {
  const balance = balances[String(orderId)]
  if (!balance) {
    throw new Error(
      `order ${String(orderId)} is missing from loadCanonicalOrderBalances`
    )
  }
  return balance
}

/** Fails loudly on a missing key — never a `?? 0` default. */
function attributionFor(
  attributions: Record<string, OrderAttributionProjection>,
  orderId: Id<"orders">
): OrderAttributionProjection {
  const attribution = attributions[String(orderId)]
  if (!attribution) {
    throw new Error(
      `order ${String(orderId)} is missing from loadOrderPaymentAttributions`
    )
  }
  return attribution
}

/** Fails loudly on a missing attendee — never a fabricated zero row. */
function attendeeFor(
  attribution: OrderAttributionProjection,
  attendeeId: Id<"orderAttendees">
): AttendeeAttributionProjection {
  const row = attribution.byAttendeeId.find(
    (entry) => entry.attendeeId === String(attendeeId)
  )
  if (!row) {
    throw new Error(
      `attendee ${String(attendeeId)} is missing from the attribution`
    )
  }
  return row
}

// ---------------------------------------------------------------------------
// Test 1 — THE AGREEMENT (no absolute money literal anywhere in this test):
// cross-read comparisons only, so three consistently-wrong reads cannot fail
// it. The literals' authority is Test 2's owner tie.
// ---------------------------------------------------------------------------

test("the dedicated pages' three reads agree per donation, on totals, on counts and across event scoping", async () => {
  const t = fresh()
  const authed = t.withIdentity(adminIdentity)
  const fixture = await seedCrossSurfaceFixture(t, authed)

  const frozen = await allocateCrossSurfaceFixture(authed, fixture)
  // The production write's own frozen result — the fixture really moved, read
  // from the mutation, not re-stated by this test.
  expect(frozen).toMatchObject({
    donationId: fixture.donationD1Id,
    allocatedTotalMinor: 11_000,
    remainingMinor: 9_000,
  })

  // --- The three reads, in the SAME run ------------------------------------
  const incomeE = await readIncome(authed, fixture.eventId)
  const listE = await readEventDonations(authed, { eventId: fixture.eventId })
  const summaryD1 = await readSummary(authed, fixture.donationD1Id)
  const summaryD2 = await readSummary(authed, fixture.donationD2Id)

  // --- The three-way agreement on the shared key set { D1, D2 } -----------
  // The ONLY projection this test performs is the field-name normalization
  // above; the compared values are server figures.
  const incomeProjection = [fixture.donationD1Id, fixture.donationD2Id].map(
    (donationId) =>
      figureFor(incomeFigures(incomeE), donationId, "getEventDonationIncome")
  )
  const listProjection = [fixture.donationD1Id, fixture.donationD2Id].map(
    (donationId) =>
      figureFor(listFigures(listE.page), donationId, "getStandaloneDonations")
  )
  const summaryProjection = [fixture.donationD1Id, fixture.donationD2Id].map(
    (donationId) =>
      figureFor(
        summaryFigures([
          { donationId: fixture.donationD1Id, summary: summaryD1 },
          { donationId: fixture.donationD2Id, summary: summaryD2 },
        ]),
        donationId,
        "getDonationAllocationSummary"
      )
  )

  expect(listProjection).toEqual(incomeProjection)
  expect(summaryProjection).toEqual(incomeProjection)

  // --- The totals band equals the sums over the list's page rows -----------
  // This is the ONLY local arithmetic in this test, and every summand is a
  // server field — the cross-check is between two server projections, never a
  // locally derived figure.
  const listTotals = listE.page.reduce(
    (totals, row) => ({
      donationCount: totals.donationCount + 1,
      donationsMinor: totals.donationsMinor + row.amountMinor,
      allocatedMinor: totals.allocatedMinor + row.allocatedMinor,
      unallocatedRemainderMinor:
        totals.unallocatedRemainderMinor + row.unallocatedRemainderMinor,
    }),
    {
      donationCount: 0,
      donationsMinor: 0,
      allocatedMinor: 0,
      unallocatedRemainderMinor: 0,
    }
  )
  expect(incomeE.totals).toEqual(listTotals)

  // --- The count, compared ONLY where BOTH reads carry it ------------------
  // income ↔ summary (`rows.length`). The enriched list is a page projection
  // (`convex/payments.ts:854-858`) that adds ONLY the two money fields to the
  // raw `payments` row; a three-way count comparison is unsatisfiable as an
  // API fact.
  expect(incomeRowFor(incomeE, fixture.donationD1Id).allocationCount).toBe(
    summaryD1.rows.length
  )
  expect(incomeRowFor(incomeE, fixture.donationD2Id).allocationCount).toBe(
    summaryD2.rows.length
  )
  expect(incomeRowFor(incomeE, fixture.donationD1Id).allocationCount).toBe(2)
  expect(incomeRowFor(incomeE, fixture.donationD2Id).allocationCount).toBe(0)

  // ...and the list's omission is pinned, so a future enrichment that adds the
  // field is a CONSCIOUS contract change rather than a silent third value.
  expect(
    "allocationCount" in listRowFor(listE.page, fixture.donationD1Id)
  ).toBe(false)
  expect(
    "allocationCount" in listRowFor(listE.page, fixture.donationD2Id)
  ).toBe(false)

  // --- The recorded scope survives to the record panel ---------------------
  // Mapped by attendeeId, NEVER by array position: a reordering must fail
  // rather than silently pass.
  expect(summaryD1.rows).toHaveLength(2)
  expect(summaryRowFor(summaryD1, fixture.mariaId).scope).toBe("event_charges")
  expect(summaryRowFor(summaryD1, fixture.mariaId).amountMinor).toBe(6_000)
  expect(summaryRowFor(summaryD1, fixture.soloId).scope).toBe("whole_order")
  expect(summaryRowFor(summaryD1, fixture.soloId).amountMinor).toBe(5_000)

  // `appliedMinor` / `effectiveCapacityMinor` are Phase 55's scope-ceiling
  // staleness signals and are deliberately NOT asserted as canonical attendee
  // balances — Phase 56 owns per-attendee application.

  // --- Event scoping agrees ------------------------------------------------
  // The event reads see exactly their own event...
  expect(donationIds(incomeE.donations)).toEqual(
    [String(fixture.donationD1Id), String(fixture.donationD2Id)].sort()
  )
  expect(listE.page.map((row) => String(row._id))).toEqual([
    String(fixture.donationD2Id),
    String(fixture.donationD1Id),
  ])

  // ...and the GLOBAL list read includes the second event's donation with the
  // same figures the second event's own income projection reports.
  const globalPage = await readEventDonations(authed, {})
  expect(globalPage.page.map((row) => String(row._id))).toEqual([
    String(fixture.donationD3Id),
    String(fixture.donationD2Id),
    String(fixture.donationD1Id),
  ])

  const incomeE2 = await readIncome(authed, fixture.secondEventId)
  expect(incomeE2.donations.map((row) => String(row.donationId))).toEqual([
    String(fixture.donationD3Id),
  ])
  expect(
    figureFor(
      listFigures(globalPage.page),
      fixture.donationD3Id,
      "getStandaloneDonations(global)"
    )
  ).toEqual(
    figureFor(
      incomeFigures(incomeE2),
      fixture.donationD3Id,
      "getEventDonationIncome(E2)"
    )
  )

  // --- Idempotence: re-read all three surfaces, deeply equal ---------------
  expect(await readIncome(authed, fixture.eventId)).toEqual(incomeE)
  expect(
    await readEventDonations(authed, { eventId: fixture.eventId })
  ).toEqual(listE)
  expect(await readSummary(authed, fixture.donationD1Id)).toEqual(summaryD1)
})

// ---------------------------------------------------------------------------
// Test 2 — THE ANCHOR AND THE TIE. Every absolute literal lives here, beside
// the owners that make it authoritative: a shared drift that keeps the three
// reads agreeing (probe M-5) dies at the tie.
// ---------------------------------------------------------------------------

test("the pages' agreement is anchored to the canonical owners and TIED to them", async () => {
  const t = fresh()
  const authed = t.withIdentity(adminIdentity)
  const fixture = await seedCrossSurfaceFixture(t, authed)
  const orderIds = [fixture.orderAId, fixture.orderBId]

  // --- Owner baseline BEFORE the write -------------------------------------
  const before = await readOwnerProjections(t, orderIds)
  expect(balanceFor(before.balances, fixture.orderAId)).toEqual({
    amountDueMinor: 20_000,
    appliedPaymentMinor: 0,
    allocationCreditMinor: 0,
    paidAmountMinor: 0,
    outstandingAmountMinor: 20_000,
    donationAmountMinor: 0,
    appliedAmountMinor: 0,
  })
  expect(balanceFor(before.balances, fixture.orderBId)).toEqual({
    amountDueMinor: 5_000,
    appliedPaymentMinor: 0,
    allocationCreditMinor: 0,
    paidAmountMinor: 0,
    outstandingAmountMinor: 5_000,
    donationAmountMinor: 0,
    appliedAmountMinor: 0,
  })
  expect(attributionFor(before.attributions, fixture.orderAId)).toMatchObject({
    targetedCreditMinor: 0,
    wholeOrderCreditMinor: 0,
  })
  expect(attributionFor(before.attributions, fixture.orderBId)).toMatchObject({
    targetedCreditMinor: 0,
    wholeOrderCreditMinor: 0,
  })

  const frozen = await allocateCrossSurfaceFixture(authed, fixture)
  expect(frozen).toMatchObject({
    donationId: fixture.donationD1Id,
    allocatedTotalMinor: 11_000,
    remainingMinor: 9_000,
  })

  // --- Owner post-state: the fixture moved, and by exactly these figures ---
  const after = await readOwnerProjections(t, orderIds)
  expect(balanceFor(after.balances, fixture.orderAId)).toEqual({
    amountDueMinor: 20_000,
    appliedPaymentMinor: 0,
    allocationCreditMinor: 0,
    paidAmountMinor: 6_000,
    outstandingAmountMinor: 14_000,
    donationAmountMinor: 0,
    appliedAmountMinor: 6_000,
  })
  // Order A's `allocationCreditMinor` is 0 BY CONTRACT: that field carries
  // `whole_order` credit only, so Maria's `event_charges` 6_000 is visible in
  // the paid figure, never here.
  expect(balanceFor(after.balances, fixture.orderBId)).toEqual({
    amountDueMinor: 5_000,
    appliedPaymentMinor: 0,
    allocationCreditMinor: 5_000,
    paidAmountMinor: 5_000,
    outstandingAmountMinor: 0,
    donationAmountMinor: 0,
    appliedAmountMinor: 5_000,
  })

  const attributionA = attributionFor(after.attributions, fixture.orderAId)
  const attributionB = attributionFor(after.attributions, fixture.orderBId)
  expect(attributionA).toMatchObject({
    appliedPaymentsMinor: 0,
    targetedCreditMinor: 6_000,
    wholeOrderCreditMinor: 0,
    unattributedTargetedCreditMinor: 0,
    orderPaidAmountMinor: 6_000,
    orderOutstandingAmountMinor: 14_000,
  })
  expect(attributionB).toMatchObject({
    appliedPaymentsMinor: 0,
    targetedCreditMinor: 0,
    wholeOrderCreditMinor: 5_000,
    unattributedTargetedCreditMinor: 0,
    orderPaidAmountMinor: 5_000,
    orderOutstandingAmountMinor: 0,
  })

  expect(attendeeFor(attributionA, fixture.mariaId)).toEqual({
    attendeeId: String(fixture.mariaId),
    amountDueMinor: 12_000,
    paymentShareMinor: 0,
    targetedCreditMinor: 6_000,
    unappliedTargetedCreditMinor: 0,
    poolShareMinor: 0,
    paidAmountMinor: 6_000,
    outstandingAmountMinor: 6_000,
  })
  expect(attendeeFor(attributionA, fixture.tomId)).toEqual({
    attendeeId: String(fixture.tomId),
    amountDueMinor: 8_000,
    paymentShareMinor: 0,
    targetedCreditMinor: 0,
    unappliedTargetedCreditMinor: 0,
    poolShareMinor: 0,
    paidAmountMinor: 0,
    outstandingAmountMinor: 8_000,
  })
  expect(attendeeFor(attributionB, fixture.soloId)).toEqual({
    attendeeId: String(fixture.soloId),
    amountDueMinor: 5_000,
    paymentShareMinor: 0,
    targetedCreditMinor: 0,
    unappliedTargetedCreditMinor: 0,
    poolShareMinor: 5_000,
    paidAmountMinor: 5_000,
    outstandingAmountMinor: 0,
  })

  // --- THE TIE -------------------------------------------------------------
  // The anchor is not merely read BESIDE the page reads: the page reads must
  // equal it. Identity 1 — the record panel's recorded money is exactly the
  // credit the owners attribute to the two target orders (Maria's
  // `event_charges` 6_000 + Solo's `whole_order` 5_000).
  const summaryD1 = await readSummary(authed, fixture.donationD1Id)
  const incomeE = await readIncome(authed, fixture.eventId)

  const ownerTargetedCreditMinor = attributionA.targetedCreditMinor
  const ownerWholeOrderCreditMinor = attributionB.wholeOrderCreditMinor
  expect(ownerTargetedCreditMinor).toBe(6_000)
  expect(ownerWholeOrderCreditMinor).toBe(5_000)
  expect(
    ownerTargetedCreditMinor + ownerWholeOrderCreditMinor,
    "the tie's owner side must be the plan's 11_000"
  ).toBe(11_000)
  expect(summaryD1.recordedAllocatedMinor).toBe(
    ownerTargetedCreditMinor + ownerWholeOrderCreditMinor
  )

  // Identity 2 — the income projection's allocated total is exactly the
  // allocation-sourced part of the orders' paid money.
  const ownerCreditGainedMinor =
    balanceFor(after.balances, fixture.orderAId).paidAmountMinor -
    balanceFor(after.balances, fixture.orderAId).appliedPaymentMinor +
    (balanceFor(after.balances, fixture.orderBId).paidAmountMinor -
      balanceFor(after.balances, fixture.orderBId).appliedPaymentMinor)
  expect(ownerCreditGainedMinor).toBe(11_000)
  expect(incomeE.totals.allocatedMinor).toBe(ownerCreditGainedMinor)

  // --- The literals the owners imply, on all three page reads --------------
  const listE = await readEventDonations(authed, { eventId: fixture.eventId })
  const globalPage = await readEventDonations(authed, {})
  const incomeE2 = await readIncome(authed, fixture.secondEventId)
  const summaryD2 = await readSummary(authed, fixture.donationD2Id)

  const d1Expected: SharedFigure = {
    allocatedMinor: 11_000,
    unallocatedRemainderMinor: 9_000,
    faceMinor: 20_000,
  }
  const d2Expected: SharedFigure = {
    allocatedMinor: 0,
    unallocatedRemainderMinor: 7_000,
    faceMinor: 7_000,
  }
  const d3Expected: SharedFigure = {
    allocatedMinor: 0,
    unallocatedRemainderMinor: 3_000,
    faceMinor: 3_000,
  }

  expect(
    figureFor(incomeFigures(incomeE), fixture.donationD1Id, "income")
  ).toEqual(d1Expected)
  expect(
    figureFor(listFigures(listE.page), fixture.donationD1Id, "list")
  ).toEqual(d1Expected)
  expect(
    figureFor(
      summaryFigures([
        { donationId: fixture.donationD1Id, summary: summaryD1 },
        { donationId: fixture.donationD2Id, summary: summaryD2 },
      ]),
      fixture.donationD1Id,
      "summary"
    )
  ).toEqual(d1Expected)

  expect(
    figureFor(incomeFigures(incomeE), fixture.donationD2Id, "income")
  ).toEqual(d2Expected)
  expect(
    figureFor(listFigures(listE.page), fixture.donationD2Id, "list")
  ).toEqual(d2Expected)
  expect(
    figureFor(
      summaryFigures([
        { donationId: fixture.donationD1Id, summary: summaryD1 },
        { donationId: fixture.donationD2Id, summary: summaryD2 },
      ]),
      fixture.donationD2Id,
      "summary"
    )
  ).toEqual(d2Expected)

  expect(
    figureFor(listFigures(globalPage.page), fixture.donationD3Id, "global list")
  ).toEqual(d3Expected)
  expect(
    figureFor(incomeFigures(incomeE2), fixture.donationD3Id, "income E2")
  ).toEqual(d3Expected)

  expect(incomeE.totals).toEqual({
    donationCount: 2,
    donationsMinor: 27_000,
    allocatedMinor: 11_000,
    unallocatedRemainderMinor: 16_000,
  })

  // The record panel's own rows sum to its recorded total, and that total is
  // the tied 11_000 — `Σ rows.amountMinor === recordedAllocatedMinor`.
  expect(summaryD1.rows.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(
    summaryD1.recordedAllocatedMinor
  )
  expect(summaryD1.recordedAllocatedMinor).toBe(11_000)
  expect(summaryD1.remainingMinor).toBe(9_000)

  // The count literals the plan names (income ↔ summary only).
  expect(incomeRowFor(incomeE, fixture.donationD1Id).allocationCount).toBe(2)
  expect(incomeRowFor(incomeE, fixture.donationD2Id).allocationCount).toBe(0)

  // --- Idempotence: both owners re-read deeply equal -----------------------
  expect(await readOwnerProjections(t, orderIds)).toEqual(after)
})
