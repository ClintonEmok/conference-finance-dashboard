/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest } from "convex-test"
import { api } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")
const identity = { subject: "order-details-admin", tokenIdentifier: "clerk|order-details-admin" }

test("order detail updates preserve the immutable booking reference", async () => {
  const t = convexTest(schema, modules).withIdentity(identity)
  const orderId = await t.mutation(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      slug: "immutable-ref",
      title: "Immutable Reference",
      startsAt: 1,
      timezone: "UTC",
      currency: "EUR",
      isPublished: true,
      isSignupOpen: true,
      accommodationEnabled: false,
      primarySourceKind: "internal",
      updatedAt: 1,
    })
    return await ctx.db.insert("orders", {
      eventId,
      source: "internal",
      bookingRef: "BK-IMMUTABLE",
      bookerName: "Original Name",
      status: "pending",
    })
  })

  await t.mutation(api.orders.updateOrderDetails, {
    orderId,
    bookerName: "Updated Name",
  })

  const order = await t.run(async (ctx) => ctx.db.get("orders", orderId))
  expect(order?.bookerName).toBe("Updated Name")
  expect(order?.bookingRef).toBe("BK-IMMUTABLE")

  await expect(
    t.mutation(api.orders.updateOrderDetails, {
      orderId,
      bookingRef: "BK-CHANGED",
    } as never)
  ).rejects.toThrow()
})
