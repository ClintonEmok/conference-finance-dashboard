/// <reference types="vite/client" />
import { expect, test } from "vitest"
import { convexTest } from "convex-test"
import { api } from "./_generated/api"
import schema from "./schema"
import { classifyPaymentReminder } from "../lib/domain/finance/payment-reminder-policy"

const modules = import.meta.glob("./**/*.ts")

test("payment reminder policy classifies zero, partial, and full balances", () => {
  expect(classifyPaymentReminder(10_000, 0)?.kind).toBe("outstanding")
  expect(classifyPaymentReminder(10_000, 4_000)?.kind).toBe("partial")
  expect(classifyPaymentReminder(10_000, 10_000)).toBeNull()
  expect(classifyPaymentReminder(10_000, 12_000)).toBeNull()
})

test("schedulePaymentReminder requires authentication and explicit authorization", async () => {
  const t = convexTest(schema, modules)
  const eventId = await t.mutation(async (ctx) => await ctx.db.insert("events", {
    slug: "payment-event", title: "Payment Event", startsAt: Date.now(), timezone: "Europe/Amsterdam",
    currency: "EUR", isPublished: true, isSignupOpen: true, accommodationEnabled: false,
    primarySourceKind: "internal", updatedAt: Date.now(),
  }))
  await expect(t.mutation(api.paymentReminders.schedulePaymentReminder, {
    eventId, selection: { mode: "allMatching" }, authorize: true,
  })).rejects.toThrow("Unauthorized")
})
