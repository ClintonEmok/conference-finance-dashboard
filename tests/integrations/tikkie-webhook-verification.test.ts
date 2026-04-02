import { createHmac } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock the tikkie-links dependency to prevent Convex URL requirement
vi.mock("@/lib/domain/finance/tikkie-links", () => ({
  refreshTikkiePaymentLinkStatus: vi.fn(),
}))

import { verifyTikkieWebhook } from "@/lib/integrations/tikkie/webhook"

function makeHmac(secret: string, body: string) {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex")
}

function headersWithSignature(signatureValue: string, headerName = "x-tikkie-signature") {
  const h = new Headers()
  h.set(headerName, signatureValue)
  return h
}

describe("verifyTikkieWebhook", () => {
  const SECRET = "super-secret-tikkie-key"
  const BODY = JSON.stringify({ subscriptionId: "sub_1", notificationType: "PAYMENT" })

  beforeEach(() => {
    process.env.TIKKIE_WEBHOOK_SECRET = SECRET
  })

  afterEach(() => {
    delete process.env.TIKKIE_WEBHOOK_SECRET
    vi.restoreAllMocks()
  })

  it("returns true when signature matches using x-tikkie-signature header", () => {
    const sig = makeHmac(SECRET, BODY)
    const headers = headersWithSignature(sig, "x-tikkie-signature")

    expect(verifyTikkieWebhook(headers, BODY)).toBe(true)
  })

  it("returns true when signature matches using x-signature fallback header", () => {
    const sig = makeHmac(SECRET, BODY)
    const headers = headersWithSignature(sig, "x-signature")

    expect(verifyTikkieWebhook(headers, BODY)).toBe(true)
  })

  it("returns true when signature matches using signature fallback header", () => {
    const sig = makeHmac(SECRET, BODY)
    const headers = headersWithSignature(sig, "signature")

    expect(verifyTikkieWebhook(headers, BODY)).toBe(true)
  })

  it("returns false when the provided signature does not match the expected HMAC", () => {
    const headers = headersWithSignature("wrong-signature-value")

    expect(verifyTikkieWebhook(headers, BODY)).toBe(false)
  })

  it("returns false when no signature header is present", () => {
    const headers = new Headers()

    expect(verifyTikkieWebhook(headers, BODY)).toBe(false)
  })

  it("returns false when the body is different from what was signed", () => {
    const sig = makeHmac(SECRET, BODY)
    const headers = headersWithSignature(sig)

    expect(verifyTikkieWebhook(headers, '{"tampered":"payload"}')).toBe(false)
  })

  it("returns false when the secret has changed since the signature was computed", () => {
    const sig = makeHmac("old-secret", BODY)
    const headers = headersWithSignature(sig)

    // Current secret is SECRET (different from old-secret)
    expect(verifyTikkieWebhook(headers, BODY)).toBe(false)
  })

  it("returns true (skip verification) when TIKKIE_WEBHOOK_SECRET is not set", () => {
    delete process.env.TIKKIE_WEBHOOK_SECRET

    // Without a configured secret, the function should always pass
    const headers = headersWithSignature("any-value-doesnt-matter")
    expect(verifyTikkieWebhook(headers, BODY)).toBe(true)

    const emptyHeaders = new Headers()
    expect(verifyTikkieWebhook(emptyHeaders, BODY)).toBe(true)
  })

  it("returns false when provided signature has a different length than the computed digest", () => {
    // The implementation performs a length check before timingSafeEqual
    const headers = headersWithSignature("short")

    expect(verifyTikkieWebhook(headers, BODY)).toBe(false)
  })

  it("trims whitespace from the TIKKIE_WEBHOOK_SECRET before using it", () => {
    process.env.TIKKIE_WEBHOOK_SECRET = `  ${SECRET}  `
    const sig = makeHmac(SECRET, BODY)
    const headers = headersWithSignature(sig)

    expect(verifyTikkieWebhook(headers, BODY)).toBe(true)
  })
})
