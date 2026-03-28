import { createHmac } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CONVEX_URL = "http://convex.test"
})

import { verifyTicketTailorWebhook } from "@/lib/integrations/ticket-tailor/webhook"

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

function signPayload(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex")
}

describe("verifyTicketTailorWebhook", () => {
  it("returns false when TICKET_TAILOR_WEBHOOK_SECRET is missing", () => {
    delete process.env.TICKET_TAILOR_WEBHOOK_SECRET
    const headers = new Headers()
    expect(verifyTicketTailorWebhook(headers, '{"ok":true}')).toBe(false)
  })

  it("returns false when TICKET_TAILOR_WEBHOOK_SECRET is blank", () => {
    process.env.TICKET_TAILOR_WEBHOOK_SECRET = "   "
    const headers = new Headers()
    expect(verifyTicketTailorWebhook(headers, '{"ok":true}')).toBe(false)
  })

  it("returns false when signature header is missing", () => {
    process.env.TICKET_TAILOR_WEBHOOK_SECRET = "test-secret"
    const headers = new Headers()
    expect(verifyTicketTailorWebhook(headers, '{"ok":true}')).toBe(false)
  })

  it("returns false when signature is invalid", () => {
    process.env.TICKET_TAILOR_WEBHOOK_SECRET = "test-secret"
    const headers = new Headers({ "x-ticket-tailor-signature": "bad-sig" })
    expect(verifyTicketTailorWebhook(headers, '{"ok":true}')).toBe(false)
  })

  it("returns true when signature is valid", () => {
    process.env.TICKET_TAILOR_WEBHOOK_SECRET = "test-secret"
    const body = '{"ok":true}'
    const signature = signPayload(body, "test-secret")
    const headers = new Headers({ "x-ticket-tailor-signature": signature })
    expect(verifyTicketTailorWebhook(headers, body)).toBe(true)
  })

  it("accepts x-webhook-signature header", () => {
    process.env.TICKET_TAILOR_WEBHOOK_SECRET = "test-secret"
    const body = '{"ok":true}'
    const signature = signPayload(body, "test-secret")
    const headers = new Headers({ "x-webhook-signature": signature })
    expect(verifyTicketTailorWebhook(headers, body)).toBe(true)
  })

  it("returns false when payload is tampered (valid sig, different body)", () => {
    process.env.TICKET_TAILOR_WEBHOOK_SECRET = "test-secret"
    const signature = signPayload('{"ok":true}', "test-secret")
    const headers = new Headers({ "x-ticket-tailor-signature": signature })
    expect(verifyTicketTailorWebhook(headers, '{"tampered":true}')).toBe(false)
  })
})
