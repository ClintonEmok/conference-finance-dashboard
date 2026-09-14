/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest, type TestConvexForDataModel } from "convex-test"
import type { GenericDataModel } from "convex/server"

import { internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")
const TEST_DEPLOYMENT_URL = "https://test-production.convex.cloud"
process.env.CONVEX_SITE_URL = TEST_DEPLOYMENT_URL

const productionGuard = {
  authorize: true,
  allowedDeploymentUrl: TEST_DEPLOYMENT_URL,
}

async function seedOrder(
  t: TestConvexForDataModel<GenericDataModel>,
  bookingRef: string,
  keys: string[]
) {
  return await t.mutation(async (ctx) => {
    const orderId = await ctx.db.insert("orders", {
      source: "internal",
      bookingRef,
      submittedAt: Date.now(),
    })
    const attendeeIds = []
    for (const [sortOrder, attendeeKey] of keys.entries()) {
      attendeeIds.push(
        await ctx.db.insert("orderAttendees", {
          orderId,
          attendeeKey,
          name: `Attendee ${sortOrder + 1}`,
          gender: "unknown",
          sortOrder,
        })
      )
    }
    return { orderId, attendeeIds }
  })
}

test("rekeys duplicate and blank attendee keys one order at a time", async () => {
  const t = convexTest(schema, modules)
  const first = await seedOrder(t, "BK-REKEY-ONE", ["same", "same", ""])
  const second = await seedOrder(t, "BK-REKEY-TWO", ["unique"])

  const firstRun = await t.mutation(
    internal.rekeyDuplicateAttendeeKeys.default,
    { cursor: null, batchSize: 1, ...productionGuard }
  )
  expect(firstRun).toMatchObject({
    processed: 1,
    rekeyed: 2,
    changedOrders: 1,
    isDone: false,
  })
  expect(firstRun.nextCursor).toBeTruthy()
  expect(firstRun.changes).toHaveLength(2)

  const secondRun = await t.mutation(
    internal.rekeyDuplicateAttendeeKeys.default,
    {
      cursor: firstRun.nextCursor,
      batchSize: 1,
      ...productionGuard,
    }
  )
  expect(secondRun).toMatchObject({
    processed: 1,
    rekeyed: 0,
    changedOrders: 0,
    isDone: true,
    nextCursor: null,
  })

  const attendees = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("orderAttendees")
      .withIndex("by_orderId", (q) => q.eq("orderId", first.orderId))
      .order("asc")
      .collect()
    return rows.map((row) => ({ id: String(row._id), key: row.attendeeKey }))
  })
  expect(attendees).toEqual([
    { id: String(first.attendeeIds[0]), key: "same" },
    {
      id: String(first.attendeeIds[1]),
      key: `attendee-${String(first.attendeeIds[1])}`,
    },
    {
      id: String(first.attendeeIds[2]),
      key: `attendee-${String(first.attendeeIds[2])}`,
    },
  ])

  const rerun = await t.mutation(
    internal.rekeyDuplicateAttendeeKeys.default,
    { cursor: null, batchSize: 1, ...productionGuard }
  )
  expect(rerun.rekeyed).toBe(0)
})

test("verification reports a clean complete pass after rekeying", async () => {
  const t = convexTest(schema, modules)
  await seedOrder(t, "BK-REKEY-CLEAN", ["same", "same"])

  const before = await t.query(
    internal.rekeyDuplicateAttendeeKeys.verifyAttendeeKeys,
    { cursor: null, batchSize: 1, ...productionGuard }
  )
  expect(before.duplicateOrders).toBe(1)
  expect(before.duplicateAttendees).toBe(1)
  expect(before.isDone).toBe(true)

  await t.mutation(internal.rekeyDuplicateAttendeeKeys.default, {
    cursor: null,
    batchSize: 1,
    ...productionGuard,
  })

  const after = await t.query(
    internal.rekeyDuplicateAttendeeKeys.verifyAttendeeKeys,
    { cursor: null, batchSize: 1, ...productionGuard }
  )
  expect(after).toMatchObject({
    processed: 1,
    duplicateOrders: 0,
    duplicateAttendees: 0,
    blankAttendees: 0,
    diagnostics: [],
    isDone: true,
    nextCursor: null,
  })
})

test("migration and verification fail closed without explicit production authorization", async () => {
  const t = convexTest(schema, modules)
  await expect(
    t.mutation(internal.rekeyDuplicateAttendeeKeys.default, {
      cursor: null,
      batchSize: 1,
      authorize: false,
      allowedDeploymentUrl: TEST_DEPLOYMENT_URL,
    })
  ).rejects.toThrow("AUTHORIZATION_REQUIRED")
  await expect(
    t.query(internal.rekeyDuplicateAttendeeKeys.verifyAttendeeKeys, {
      cursor: null,
      batchSize: 1,
      authorize: false,
      allowedDeploymentUrl: TEST_DEPLOYMENT_URL,
    })
  ).rejects.toThrow("AUTHORIZATION_REQUIRED")
})
