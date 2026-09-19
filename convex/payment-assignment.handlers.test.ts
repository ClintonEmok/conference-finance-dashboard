/// <reference types="vite/client" />
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api, internal } from "./_generated/api"
import schema from "./schema"
import type { Id } from "./_generated/dataModel"
import {
  loadCanonicalOrderBalances,
  loadOrderAmountDueBreakdowns,
} from "./finance"

/**
 * Phase 60 plan 04 — the `assignPaymentToOrder` standalone-donation guard (D-02).
 *
 * The audit's "one theoretical double-count vector": a direct caller could
 * convert a standalone donation's `payments` row into an order payment while
 * the donation's allocation rows remain, so the canonical owner would count the
 * donation twice — once as an order-applied payment (the full face) and once as
 * allocation credit.
 *
 * This suite DEMONSTRATES that vector rather than asserting a throw: it
 * reproduces the pre-fix handler's exact patch as a raw test mutation against a
 * real allocation written through the production `donations.allocateDonation`,
 * and reads both the doubled and the restored figures from
 * `loadCanonicalOrderBalances` — the ONE canonical owner, never a locally
 * derived number. It then proves the guarded public mutation is INERT (row,
 * allocations and canonical figures all unchanged) and carries its own
 * distinctly-named code, pins the internal path's existing closure, and shows
 * the guard is not over-broad for the order-linked overpayment class.
 *
 * Repo truth on the two call paths (the written answer the plan requires):
 *   - PUBLIC `assignPaymentToOrder` (`convex/payments.ts`) was the OPEN path —
 *     it resolved the order and patched unconditionally, explicitly clearing
 *     `donationKind`; this plan closes it.
 *   - INTERNAL `internalAssignPaymentToOrder` (`convex/payments.ts`) is CLOSED
 *     by its `payment.status !== "unassigned"` return — a standalone donation's
 *     status is `"donation"`, so it returns before any write. It is PINNED
 *     here, deliberately not changed.
 */

const modules = import.meta.glob("./**/*.ts")

const BASE_AT = 1_750_000_000_000

const adminIdentity = {
  tokenIdentifier: "admin:payment-assignment",
  name: "Admin",
  email: "admin@example.com",
}

/**
 * The guard's own code, asserted literally so a rename cannot ride along with a
 * passing suite.
 */
const STANDALONE_REFUSAL_CODE = "PAYMENT_ASSIGNMENT_STANDALONE_DONATION_REFUSED"

type TestConvex = TestConvexForDataModel<GenericDataModel>

type FinanceLoaderCtx = Parameters<typeof loadOrderAmountDueBreakdowns>[0]

type CanonicalSnapshot = {
  amountDueMinor: number
  appliedPaymentMinor: number
  allocationCreditMinor: number
  paidAmountMinor: number
  outstandingAmountMinor: number
  donationAmountMinor: number
  appliedAmountMinor: number
}

type AllocationRow = {
  attendeeId: string
  orderId: string
  amountMinor: number
  scope: string
}

function fresh() {
  return convexTest(schema, modules)
}

/**
 * The declaration slice from `startMarker` to the next top-level export — the
 * house `sourceSlice` idiom from `donation-delete.handlers.test.ts`, used here
 * to pin the ORDER of statements inside the public mutation.
 */
function sourceSlice(source: string, startMarker: string): string {
  const start = source.indexOf(startMarker)
  expect(start, `${startMarker} is missing`).toBeGreaterThanOrEqual(0)

  const end = source.indexOf("\nexport ", start + 1)
  return end === -1 ? source.slice(start) : source.slice(start, end)
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
 * Inserts an order, a ticket type priced at `ticketPriceMinor`, the attendee
 * and the ticket selection the canonical `loadOrderAmountDueBreakdowns` loader
 * prices from. Without the selection the order would carry a zero attributable
 * due and every canonical assertion below would be vacuous.
 */
async function createAttendee(
  t: TestConvex,
  eventId: Id<"events">,
  input: {
    attendeeKey: string
    name: string
    ticketPriceMinor: number
  }
): Promise<{ orderId: Id<"orders">; attendeeId: Id<"orderAttendees"> }> {
  const orderId = await t.mutation(async (ctx) =>
    ctx.db.insert("orders", {
      eventId,
      source: "internal" as const,
      bookingRef: `BK-${input.attendeeKey.toUpperCase()}`,
      bookerName: "Booker",
      bookerEmail: "booker@example.com",
      submittedAt: BASE_AT,
    })
  )

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
      sortOrder: 0,
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
async function createStandaloneDonation(
  t: TestConvex,
  eventId: Id<"events">,
  amountMinor: number
): Promise<Id<"payments">> {
  return t.mutation(async (ctx) =>
    ctx.db.insert("payments", {
      source: "cash" as const,
      eventId,
      payerName: "Donor",
      amountMinor,
      paidAt: BASE_AT,
      donationKind: "standalone" as const,
      status: "donation" as const,
    })
  )
}

/** One order's figures, read ONLY through the canonical owner. */
async function readCanonical(
  t: TestConvex,
  orderId: Id<"orders">
): Promise<CanonicalSnapshot> {
  return t.run(async (ctx) => {
    const loaderCtx = ctx as unknown as FinanceLoaderCtx
    const orders = [{ _id: orderId }]
    const dueBreakdownsByOrderId = await loadOrderAmountDueBreakdowns(
      loaderCtx,
      orders
    )
    const balances = await loadCanonicalOrderBalances({
      ctx: loaderCtx,
      orders,
      dueBreakdownsByOrderId,
    })
    const balance = balances.get(String(orderId))
    if (!balance) {
      throw new Error(`no canonical balance for order ${String(orderId)}`)
    }

    return {
      amountDueMinor: balance.amountDueMinor,
      appliedPaymentMinor: balance.appliedPaymentMinor,
      allocationCreditMinor: balance.allocationCreditMinor,
      paidAmountMinor: balance.paidAmountMinor,
      outstandingAmountMinor: balance.outstandingAmountMinor,
      donationAmountMinor: balance.donationAmountMinor,
      appliedAmountMinor: balance.appliedAmountMinor,
    }
  })
}

async function readPayment(t: TestConvex, paymentId: Id<"payments">) {
  return t.run(async (ctx) => ctx.db.get("payments", paymentId))
}

async function readAllocations(
  t: TestConvex,
  donationId: Id<"payments">
): Promise<AllocationRow[]> {
  return t.query(async (ctx) => {
    const rows: AllocationRow[] = []
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

// ---------------------------------------------------------------------------
// Test 1 — the vector, DEMONSTRATED against the canonical owner
// ---------------------------------------------------------------------------

test("the unguarded conversion double-counts the donation (paid 4 000 -> 14 000)", async () => {
  const t = fresh()
  const authed = t.withIdentity(adminIdentity)
  const eventId = await seedEvent(t, "payment-assignment-vector")
  const { orderId, attendeeId } = await createAttendee(t, eventId, {
    attendeeKey: "vector",
    name: "Vector Attendee",
    ticketPriceMinor: 20_000,
  })
  const donationId = await createStandaloneDonation(t, eventId, 10_000)

  // The allocation goes through the PRODUCTION mutation, never a hand-written
  // `donationAllocations` row.
  await authed.mutation(api.donations.allocateDonation, {
    donationId,
    eventId,
    request: {
      method: "manual",
      rows: [{ attendeeId, amountMinor: 4_000, scope: "whole_order" }],
    },
    idempotencyKey: "payment-assignment-vector",
  })

  expect(await readAllocations(t, donationId)).toHaveLength(1)

  const before = await readCanonical(t, orderId)
  expect(before.amountDueMinor).toBe(20_000)
  expect(before.appliedPaymentMinor).toBe(0)
  expect(before.allocationCreditMinor).toBe(4_000)
  expect(before.paidAmountMinor).toBe(4_000)
  expect(before.outstandingAmountMinor).toBe(16_000)

  // The exact patch the PRE-FIX public mutation applied, reproduced as a raw
  // test mutation. It assigns the donation row to the order and clears the
  // standalone classification WITHOUT touching the allocation rows.
  await t.mutation(async (ctx) => {
    await ctx.db.patch("payments", donationId, {
      orderId,
      eventId,
      donationKind: undefined,
      status: "manual_assignment",
      matchedAt: Date.now(),
      matchedBy: "unguarded-probe",
    })
  })

  // The double count made visible: the full 10 000 face is now an applied
  // payment AND the 4 000 allocation credit still applies.
  const doubled = await readCanonical(t, orderId)
  expect(doubled.appliedPaymentMinor).toBe(10_000)
  expect(doubled.allocationCreditMinor).toBe(4_000)
  expect(doubled.paidAmountMinor).toBe(14_000)
  expect(doubled.outstandingAmountMinor).toBe(6_000)
  // The allocation rows survived the conversion — that is the double count.
  expect(await readAllocations(t, donationId)).toHaveLength(1)

  // Restore the inverse raw patch so the demonstration is observable and
  // reversible, and the guarded tests below start from a clean state.
  await t.mutation(async (ctx) => {
    await ctx.db.patch("payments", donationId, {
      orderId: undefined,
      eventId,
      donationKind: "standalone",
      status: "donation",
      matchedAt: undefined,
      matchedBy: undefined,
    })
  })

  const restored = await readCanonical(t, orderId)
  expect(restored.appliedPaymentMinor).toBe(0)
  expect(restored.paidAmountMinor).toBe(4_000)
  expect(restored.outstandingAmountMinor).toBe(16_000)
})

// ---------------------------------------------------------------------------
// Test 2 — the guarded refusal is inert and carries its own code
// ---------------------------------------------------------------------------

test("the guarded refusal is inert: nothing written, distinct code returned", async () => {
  const t = fresh()
  const authed = t.withIdentity(adminIdentity)
  const eventId = await seedEvent(t, "payment-assignment-inert")
  const { orderId, attendeeId } = await createAttendee(t, eventId, {
    attendeeKey: "inert",
    name: "Inert Attendee",
    ticketPriceMinor: 20_000,
  })
  const donationId = await createStandaloneDonation(t, eventId, 10_000)

  await authed.mutation(api.donations.allocateDonation, {
    donationId,
    eventId,
    request: {
      method: "manual",
      rows: [{ attendeeId, amountMinor: 4_000, scope: "whole_order" }],
    },
    idempotencyKey: "payment-assignment-inert",
  })

  const beforePayment = await readPayment(t, donationId)
  const beforeAllocations = await readAllocations(t, donationId)
  const beforeCanonical = await readCanonical(t, orderId)
  expect(beforeCanonical.paidAmountMinor).toBe(4_000)

  await expect(
    authed.mutation(api.payments.assignPaymentToOrder, {
      paymentId: donationId,
      orderId,
      matchedBy: "operator",
    })
  ).rejects.toThrow(STANDALONE_REFUSAL_CODE)

  const afterPayment = await readPayment(t, donationId)
  expect(afterPayment?.orderId).toBeUndefined()
  expect(afterPayment?.donationKind).toBe("standalone")
  expect(afterPayment?.status).toBe("donation")
  expect(afterPayment?.matchedAt).toBeUndefined()
  expect(afterPayment?.matchedBy).toBeUndefined()
  // Byte-identical, not just field-by-field: the whole document deep-equals.
  expect(afterPayment).toEqual(beforePayment)
  expect(await readAllocations(t, donationId)).toEqual(beforeAllocations)
  expect(await readCanonical(t, orderId)).toEqual(beforeCanonical)
})

// ---------------------------------------------------------------------------
// Test 3 — the internal path is pinned closed (repo truth, not changed)
// ---------------------------------------------------------------------------

test("the internal path is pinned closed: it resolves without writing", async () => {
  const t = fresh()
  const authed = t.withIdentity(adminIdentity)
  const eventId = await seedEvent(t, "payment-assignment-internal")
  const { orderId, attendeeId } = await createAttendee(t, eventId, {
    attendeeKey: "internal",
    name: "Internal Attendee",
    ticketPriceMinor: 20_000,
  })
  const donationId = await createStandaloneDonation(t, eventId, 10_000)

  await authed.mutation(api.donations.allocateDonation, {
    donationId,
    eventId,
    request: {
      method: "manual",
      rows: [{ attendeeId, amountMinor: 4_000, scope: "whole_order" }],
    },
    idempotencyKey: "payment-assignment-internal",
  })

  const beforePayment = await readPayment(t, donationId)
  const beforeAllocations = await readAllocations(t, donationId)
  const beforeCanonical = await readCanonical(t, orderId)

  // The closure is the mutation's own `status !== "unassigned"` early return:
  // a standalone donation's status is "donation", so the handler returns the id
  // before its patch. Pinned, deliberately not changed.
  const result = await authed.mutation(
    internal.payments.internalAssignPaymentToOrder,
    {
      paymentId: donationId,
      orderId,
    }
  )

  expect(result).toBe(donationId)
  expect(await readPayment(t, donationId)).toEqual(beforePayment)
  expect(await readAllocations(t, donationId)).toEqual(beforeAllocations)
  expect(await readCanonical(t, orderId)).toEqual(beforeCanonical)
})

// ---------------------------------------------------------------------------
// Test 4 — the overpayment control: the guard is not over-broad
// ---------------------------------------------------------------------------

test("an order-linked overpayment row is not refused (predicate exactness)", async () => {
  const t = fresh()
  const authed = t.withIdentity(adminIdentity)
  const eventId = await seedEvent(t, "payment-assignment-overpayment")
  const { orderId } = await createAttendee(t, eventId, {
    attendeeKey: "overpayment",
    name: "Overpayment Attendee",
    ticketPriceMinor: 20_000,
  })
  const overpaymentId = await t.mutation(async (ctx) =>
    ctx.db.insert("payments", {
      source: "cash" as const,
      eventId,
      orderId: String(orderId),
      payerName: "Payer",
      amountMinor: 5_000,
      paidAt: BASE_AT,
      donationKind: "overpayment" as const,
      status: "donation" as const,
    })
  )

  const result = await authed.mutation(api.payments.assignPaymentToOrder, {
    paymentId: overpaymentId,
    orderId,
  })

  expect(result).toBe(overpaymentId)
  const row = await readPayment(t, overpaymentId)
  expect(row?.orderId).toBe(String(orderId))
  expect(row?.donationKind).toBeUndefined()
  expect(row?.status).toBe("manual_assignment")
})

// ---------------------------------------------------------------------------
// Test 5 (structural) — the refusal precedes every write in the source
// ---------------------------------------------------------------------------

/**
 * Hardened after a surviving mutant: patching the row BEFORE the throw is
 * invisible at runtime, because a thrown mutation is rolled back by the
 * platform (the same transaction guarantee Phase 57 recorded as probe-only).
 * A runtime post-state assertion therefore cannot distinguish "refuse before
 * writing" from "write, then throw". Only the source ORDER can, so the
 * inertness is pinned structurally here: the refusal must appear before every
 * `payments` write inside the public mutation's own declaration slice.
 */
test("inertness is structural: the refusal precedes every write in the public mutation", () => {
  const paymentsSource = readFileSync(
    resolve(import.meta.dirname, "payments.ts"),
    "utf8"
  )
  const assignSlice = sourceSlice(
    paymentsSource,
    "export const assignPaymentToOrder"
  )

  const refusalAt = assignSlice.indexOf(STANDALONE_REFUSAL_CODE)
  expect(
    refusalAt,
    "the standalone refusal code must be thrown inside the public mutation"
  ).toBeGreaterThanOrEqual(0)

  for (const write of [
    'ctx.db.patch("payments"',
    'ctx.db.insert("payments"',
    'ctx.db.replace("payments"',
    'ctx.db.delete("payments"',
  ] as const) {
    const writeAt = assignSlice.indexOf(write)
    if (writeAt === -1) {
      continue
    }
    expect(
      refusalAt,
      `${write} appears before the standalone refusal — the refusal must be inert, so it must precede every write`
    ).toBeLessThan(writeAt)
  }

  // The guard reads the row's own classification and refuses exactly the
  // standalone class (the overpayment control above covers the other class).
  expect(assignSlice).toContain('payment?.donationKind === "standalone"')
})
