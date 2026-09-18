/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api } from "./_generated/api"
import schema from "./schema"
import type { Doc } from "./_generated/dataModel"

const modules = import.meta.glob("./**/*.ts")
const identity = {
  subject: "payment-source-search-admin",
  tokenIdentifier: "clerk|payment-source-search-admin",
}

type TestConvex = TestConvexForDataModel<GenericDataModel>

function fresh() {
  return convexTest(schema, modules).withIdentity(identity)
}

async function seedBeyondBrowseCap(t: TestConvex) {
  return await t.run(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      slug: "payment-source-search",
      title: "Payment Source Search",
      startsAt: 1_700_000_000_000,
      timezone: "Europe/Amsterdam",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: false,
      primarySourceKind: "internal",
      updatedAt: 1,
    })

    for (let index = 0; index < 500; index += 1) {
      await ctx.db.insert("payments", {
        source: "cash",
        payerName: `Browse Buyer ${index + 1}`,
        amountMinor: 1000,
        paidAt: 1_700_000_000_000 + index,
        eventId,
        status: "unassigned",
        reference: `BROWSE-${index + 1}`,
        notes: "ordinary unassigned payment",
      })
    }

    const beyondCapId = await ctx.db.insert("payments", {
      source: "bank_transfer",
      payerName: "J. de Vries",
      amountMinor: 2500,
      paidAt: 1_700_000_000_600,
      eventId,
      status: "unassigned",
      reference: "CAP-501-UNIQUE",
      notes: "needle in the notes field",
    })

    return String(beyondCapId)
  })
}

test("getUnassignedPayments requires identity", async () => {
  const t = convexTest(schema, modules)
  await expect(
    t.query(api.payments.getUnassignedPayments, {})
  ).rejects.toThrow("Unauthorized")
})

test("the browse contract remains capped at 500 and excludes the 501st payment", async () => {
  const t = fresh()
  const beyondCapId = await seedBeyondBrowseCap(t)

  const rows = await t.query(api.payments.getUnassignedPayments, {})
  expect(rows).toHaveLength(500)
  expect(rows.map((row: Doc<"payments">) => String(row._id))).not.toContain(
    beyondCapId
  )
})

test("a search finds a payment beyond the historical 500-row browse cap", async () => {
  const t = fresh()
  const beyondCapId = await seedBeyondBrowseCap(t)

  const rows = await t.query(api.payments.getUnassignedPayments, {
    search: "CAP-501-UNIQUE",
  })
  expect(rows.map((row: Doc<"payments">) => String(row._id))).toEqual([
    beyondCapId,
  ])
})

test("the source search folds and searches payer, reference, notes, and source", async () => {
  const t = fresh()
  const beyondCapId = await seedBeyondBrowseCap(t)

  for (const search of [
    "jdevries",
    "CAP-501-UNIQUE",
    "needle in the notes",
    "bank_transfer",
  ]) {
    const rows = await t.query(api.payments.getUnassignedPayments, { search })
    expect(
      rows.map((row: Doc<"payments">) => String(row._id)),
      search
    ).toContain(beyondCapId)
  }
})

test("a non-matching search returns an empty array rather than the browse page", async () => {
  const t = fresh()
  await seedBeyondBrowseCap(t)

  const rows = await t.query(api.payments.getUnassignedPayments, {
    search: "does-not-exist-anywhere",
  })
  expect(rows).toEqual([])
})
