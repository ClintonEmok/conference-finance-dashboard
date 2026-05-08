import { createHmac } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CONVEX_URL = "http://convex.test"
})

import { verifyTikkieWebhook } from "@/lib/integrations/tikkie/webhook"

const ORIGINAL_ENV = process.env

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    NEXT_PUBLIC_CONVEX_URL: "http://convex.test",
  }
})

afterEach(() => {
  process.env = ORIGINAL_ENV
})

afterEach(() => {
  process.env = ORIGINAL_ENV
})

function signPayload(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex")
}

describe("verifyTikkieWebhook", () => {
  it("returns false when TIKKIE_WEBHOOK_SECRET is missing", () => {
    delete process.env.TIKKIE_WEBHOOK_SECRET
    const headers = new Headers()
    expect(verifyTikkieWebhook(headers, '{"ok":true}')).toBe(false)
  })

  it("returns false when TIKKIE_WEBHOOK_SECRET is blank", () => {
    process.env.TIKKIE_WEBHOOK_SECRET = "   "
    const headers = new Headers()
    expect(verifyTikkieWebhook(headers, '{"ok":true}')).toBe(false)
  })

  it("returns false when signature header is missing", () => {
    process.env.TIKKIE_WEBHOOK_SECRET = "test-secret"
    const headers = new Headers()
    expect(verifyTikkieWebhook(headers, '{"ok":true}')).toBe(false)
  })

  it("returns false when signature is invalid", () => {
    process.env.TIKKIE_WEBHOOK_SECRET = "test-secret"
    const headers = new Headers({ "x-tikkie-signature": "bad-sig" })
    expect(verifyTikkieWebhook(headers, '{"ok":true}')).toBe(false)
  })

  it("returns true when signature is valid", () => {
    process.env.TIKKIE_WEBHOOK_SECRET = "test-secret"
    const body = '{"ok":true}'
    const signature = signPayload(body, "test-secret")
    const headers = new Headers({ "x-tikkie-signature": signature })
    expect(verifyTikkieWebhook(headers, body)).toBe(true)
  })

  it("accepts x-signature header", () => {
    process.env.TIKKIE_WEBHOOK_SECRET = "test-secret"
    const body = '{"ok":true}'
    const signature = signPayload(body, "test-secret")
    const headers = new Headers({ "x-signature": signature })
    expect(verifyTikkieWebhook(headers, body)).toBe(true)
  })

  it("accepts signature header", () => {
    process.env.TIKKIE_WEBHOOK_SECRET = "test-secret"
    const body = '{"ok":true}'
    const signature = signPayload(body, "test-secret")
    const headers = new Headers({ signature: signature })
    expect(verifyTikkieWebhook(headers, body)).toBe(true)
  })

  it("returns false when payload is tampered (valid sig, different body)", () => {
    process.env.TIKKIE_WEBHOOK_SECRET = "test-secret"
    const signature = signPayload('{"ok":true}', "test-secret")
    const headers = new Headers({ "x-tikkie-signature": signature })
    expect(verifyTikkieWebhook(headers, '{"tampered":true}')).toBe(false)
  })
})
