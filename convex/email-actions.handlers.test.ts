/// <reference types="vite/client" />
import { expect, test } from "vitest"
import {
  convexTest,
  type TestConvexForDataModel,
} from "convex-test"
import type { GenericDataModel } from "convex/server"

import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

function fresh() {
  return convexTest(schema, modules)
}

const adminIdentity = {
  subject: "user_admin",
  name: "Admin",
  email: "admin@example.com",
}

const signupConfirmationArgs = {
  to: "buyer@example.com",
  bookerName: "Test Buyer",
  bookingRef: "BK-TEST-001",
  eventName: "Test Event",
  eventDate: "2026-01-01",
  eventLocation: "Amsterdam",
  attendeeCount: 1,
  roomAssignments: [],
  trackPaymentUrl: "http://localhost:3000/booking/BK-TEST-001/manage",
  successPageUrl: "http://localhost:3000/signup/success/BK-TEST-001",
}

const announcementTestArgs = {
  to: "admin@example.com",
  title: "Test Announcement",
  message: "Test message body",
  eventName: "Test Event",
  eventDate: "2026-01-01",
  manageBookingUrl: "http://localhost:3000/booking/BK-TEST-001/manage",
  signupUrl: "http://localhost:3000/signup/test-event",
}

async function insertOrderId(
  t: TestConvexForDataModel<GenericDataModel>
): Promise<string> {
  return t.mutation(async (ctx) => {
    return await ctx.db.insert("orders", {
      source: "internal",
      bookingRef: "BK-TEST-001",
      submittedAt: Date.now(),
    })
  })
}

// ---------------------------------------------------------------------------
// CQ-02: the three public email actions fail closed for anonymous callers.
// Any caller with the deployment URL can otherwise trigger real Resend sends.
// The internal sendSignupConfirmation (scheduler path) is NOT gated.
// ---------------------------------------------------------------------------

test("sendSignupConfirmationTest rejects anonymous callers before any send", async () => {
  const anonymous = fresh()
  await expect(
    anonymous.action(api.emailActions.sendSignupConfirmationTest, {
      ...signupConfirmationArgs,
    })
  ).rejects.toThrow("Unauthorized")
})

test("sendAnnouncementTest rejects anonymous callers before any send", async () => {
  const anonymous = fresh()
  await expect(
    anonymous.action(api.emailActions.sendAnnouncementTest, {
      ...announcementTestArgs,
    })
  ).rejects.toThrow("Unauthorized")
})

test("resendOrderConfirmation rejects anonymous callers before any lookup", async () => {
  const t = fresh()
  const orderId = await insertOrderId(t)
  const anonymous = fresh()
  await expect(
    anonymous.action(api.emailActions.resendOrderConfirmation, {
      orderId: orderId as never,
    })
  ).rejects.toThrow("Unauthorized")
})

test("sendSignupConfirmationTest accepts an authenticated identity", async () => {
  const t = fresh().withIdentity(adminIdentity)
  // The identity gate passes; the send proceeds and only fails because no
  // Resend API key is configured in the test environment.
  const result = await t.action(
    api.emailActions.sendSignupConfirmationTest,
    signupConfirmationArgs
  )
  expect(result.success).toBe(false)
  expect(result.error).toBe("API key is not set")
})

test("sendAnnouncementTest accepts an authenticated identity", async () => {
  const t = fresh().withIdentity(adminIdentity)
  const result = await t.action(
    api.emailActions.sendAnnouncementTest,
    announcementTestArgs
  )
  expect(result.success).toBe(false)
  expect(result.error).toBe("API key is not set")
})

test("resendOrderConfirmation accepts an authenticated identity", async () => {
  const t = fresh().withIdentity(adminIdentity)
  // The identity gate passes; the order lookup runs and reports not found
  // because the minimal fixture order has no internal event/source rows.
  const orderId = await insertOrderId(t)
  const result = await t.action(
    api.emailActions.resendOrderConfirmation,
    { orderId: orderId as never }
  )
  expect(result.success).toBe(false)
  expect(result.error).toBe("Order not found")
})

test("internal sendSignupConfirmation stays callable without an identity (scheduler path)", async () => {
  const t = fresh()
  // signupSubmission.ts schedules internal.emailActions.sendSignupConfirmation
  // with no identity; it must not be gated.
  const result = await t.action(
    internal.emailActions.sendSignupConfirmation,
    signupConfirmationArgs
  )
  expect(result.success).toBe(false)
  expect(result.error).toBe("API key is not set")
})
