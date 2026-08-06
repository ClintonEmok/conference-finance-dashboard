import { describe, expect, it } from "vitest"

import {
  EDIT_REQUEST_SIGNATURE_TTL_MS,
  buildTrackPaymentPermalink,
  canonicalizeEditEnvelope,
  digestAccommodationSelections,
  digestEditEnvelope,
  mintEditRequestSignature,
  mintTrackPaymentEditToken,
  normalizeBookingRefForEdit,
  normalizeBookerEmail,
  verifyEditRequestSignature,
  verifyTrackPaymentEditToken,
  type EditAccommodationSelectionInput,
} from "@/lib/domain/track-payment/edit-token"

const TEST_SECRET = "test-track-payment-secret"

function buildEnvelope(overrides: Partial<Parameters<typeof digestEditEnvelope>[0]> = {}) {
  return {
    bookingRef: "BK-20260411-ABC123",
    bookerEmail: "booker@example.com",
    editToken: "abc123",
    idempotencyKey: "idem-1",
    selections: [
      {
        attendeeKey: "a-1",
        categoryId: "category-1",
        occupancy: "shared" as const,
        upgradeSelected: true,
        cotSelected: false,
        ageBandCode: null,
      },
    ],
    ...overrides,
  }
}

const baseSelections = (): Array<{
  attendeeKey: string
  categoryId: string
  occupancy: "shared" | "single" | "family"
  upgradeSelected: boolean
  cotSelected: boolean
  ageBandCode: string | null
}> => [
  {
    attendeeKey: "b-ob",
    categoryId: "cat-2",
    occupancy: "single",
    upgradeSelected: false,
    cotSelected: true,
    ageBandCode: "under_3",
  },
  {
    attendeeKey: "a-1",
    categoryId: "cat-1",
    occupancy: "shared",
    upgradeSelected: true,
    cotSelected: false,
    ageBandCode: null,
  },
]

describe("track-payment edit token primitives", () => {
  it("normalizes booking references and booker emails deterministically", () => {
    expect(normalizeBookingRefForEdit("  bk-20260411-abc123 ")).toBe(
      "BK-20260411-ABC123"
    )
    expect(normalizeBookerEmail("  Alice@Example.COM ")).toBe(
      "alice@example.com"
    )
  })

  it("mints and verifies an edit token bound to booking ref and normalized email", async () => {
    const token = await mintTrackPaymentEditToken({
      bookingRef: "bk-20260411-abc123",
      bookerEmail: "  Booker@Example.COM ",
      secret: TEST_SECRET,
    })
    expect(token).toBeTruthy()
    // The same binding (normalized) verifies; case/whitespace variants bind
    // to the same message.
    expect(
      await verifyTrackPaymentEditToken(token, {
        bookingRef: "BK-20260411-ABC123",
        bookerEmail: "booker@example.com",
        secret: TEST_SECRET,
      })
    ).toBe(true)
  })

  it("rejects an edit token bound to a different booking reference or email", async () => {
    const token = await mintTrackPaymentEditToken({
      bookingRef: "BK-20260411-ABC123",
      bookerEmail: "booker@example.com",
      secret: TEST_SECRET,
    })
    expect(
      await verifyTrackPaymentEditToken(token, {
        bookingRef: "BK-20260411-DEF456",
        bookerEmail: "booker@example.com",
        secret: TEST_SECRET,
      })
    ).toBe(false)
    expect(
      await verifyTrackPaymentEditToken(token, {
        bookingRef: "BK-20260411-ABC123",
        bookerEmail: "attacker@example.com",
        secret: TEST_SECRET,
      })
    ).toBe(false)
  })

  it("rejects tampered and missing edit tokens", async () => {
    const token = await mintTrackPaymentEditToken({
      bookingRef: "BK-20260411-ABC123",
      bookerEmail: "booker@example.com",
      secret: TEST_SECRET,
    })
    const tampered = `${token.slice(0, 4)}${token.slice(4) === "a" ? "b" : "a"}${token.slice(5)}`
    expect(tampered).not.toBe(token)
    expect(
      await verifyTrackPaymentEditToken(tampered, {
        bookingRef: "BK-20260411-ABC123",
        bookerEmail: "booker@example.com",
        secret: TEST_SECRET,
      })
    ).toBe(false)
    expect(
      await verifyTrackPaymentEditToken(null, {
        bookingRef: "BK-20260411-ABC123",
        bookerEmail: "booker@example.com",
        secret: TEST_SECRET,
      })
    ).toBe(false)
  })

  it("fails closed when the signing secret is missing", async () => {
    await expect(
      mintTrackPaymentEditToken({
        bookingRef: "BK-20260411-ABC123",
        bookerEmail: "booker@example.com",
      })
    ).rejects.toThrow("SIGNUP_SUBMISSION_SECRET is not configured")
    await expect(
      mintEditRequestSignature({
        ...buildEnvelope(),
        secret: undefined,
      })
    ).rejects.toThrow("SIGNUP_SUBMISSION_SECRET is not configured")
    expect(
      await verifyTrackPaymentEditToken("anything", {
        bookingRef: "BK-20260411-ABC123",
        bookerEmail: "booker@example.com",
      })
    ).toBe(false)
    expect(
      await verifyEditRequestSignature("anything", buildEnvelope())
    ).toBe(false)
  })
})

describe("request signature (route-to-Convex gate)", () => {
  it("mints and verifies a short-lived signature over the exact envelope", async () => {
    const signature = await mintEditRequestSignature({
      ...buildEnvelope(),
      secret: TEST_SECRET,
    })
    expect(signature).toMatch(/\.[0-9]+$/)
    expect(
      await verifyEditRequestSignature(signature, {
        ...buildEnvelope(),
        secret: TEST_SECRET,
      })
    ).toBe(true)
  })

  it("rejects when the envelope changed after minting", async () => {
    const signature = await mintEditRequestSignature({
      ...buildEnvelope(),
      secret: TEST_SECRET,
    })
    const changedSelections = [
      {
        attendeeKey: "a-1",
        categoryId: "category-9",
        occupancy: "single" as const,
        upgradeSelected: false,
        cotSelected: true,
        ageBandCode: "under_3",
      },
    ]
    expect(
      await verifyEditRequestSignature(signature, {
        ...buildEnvelope(),
        selections: changedSelections,
        secret: TEST_SECRET,
      })
    ).toBe(false)
    expect(
      await verifyEditRequestSignature(signature, {
        ...buildEnvelope(),
        idempotencyKey: "idem-2",
        secret: TEST_SECRET,
      })
    ).toBe(false)
    expect(
      await verifyEditRequestSignature(signature, {
        ...buildEnvelope(),
        bookingRef: "BK-20260411-DEF456",
        secret: TEST_SECRET,
      })
    ).toBe(false)
  })

  it("rejects an expired signature and honors a custom TTL", async () => {
    const now = 1_750_000_000_000
    const signature = await mintEditRequestSignature({
      ...buildEnvelope(),
      secret: TEST_SECRET,
      now,
      ttlMs: 60_000,
    })
    // Valid inside the window.
    expect(
      await verifyEditRequestSignature(signature, {
        ...buildEnvelope(),
        secret: TEST_SECRET,
        now: now + 59_000,
      })
    ).toBe(true)
    // Expired after the window.
    expect(
      await verifyEditRequestSignature(signature, {
        ...buildEnvelope(),
        secret: TEST_SECRET,
        now: now + 61_000,
      })
    ).toBe(false)
    // The default TTL constant is five minutes (short-lived by design).
    expect(EDIT_REQUEST_SIGNATURE_TTL_MS).toBe(5 * 60 * 1000)
  })

  it("rejects malformed signature strings", async () => {
    expect(
      await verifyEditRequestSignature("no-dot-here", {
        ...buildEnvelope(),
        secret: TEST_SECRET,
      })
    ).toBe(false)
    expect(
      await verifyEditRequestSignature("sig.not-a-number", {
        ...buildEnvelope(),
        secret: TEST_SECRET,
      })
    ).toBe(false)
  })
})

describe("canonical envelope and selection digests", () => {
  it("canonicalizes envelopes so whitespace does not change the digest", async () => {
    const base = buildEnvelope()
    const loose = buildEnvelope({
      bookingRef: "  bk-20260411-abc123  ",
      bookerEmail: "  BOOKER@example.com ",
      editToken: "  abc123  ",
      idempotencyKey: "  idem-1 ",
      selections: [
        {
          attendeeKey: " a-1 ",
          categoryId: "category-1",
          occupancy: "shared" as const,
          upgradeSelected: true,
          cotSelected: false,
          ageBandCode: null,
        },
      ],
    })
    expect(canonicalizeEditEnvelope(base)).toBe(canonicalizeEditEnvelope(loose))
    expect(await digestEditEnvelope(base)).toBe(
      await digestEditEnvelope(loose)
    )
  })

  it("selection digests are stable and order-independent", async () => {
    const first = await digestAccommodationSelections(baseSelections())
    const reversed = await digestAccommodationSelections(
      [...baseSelections()].reverse()
    )
    expect(first).toBe(reversed)
    const changed = await digestAccommodationSelections([
      ...baseSelections(),
      {
        attendeeKey: "c-3",
        categoryId: "cat-3",
        occupancy: "family",
        upgradeSelected: false,
        cotSelected: false,
        ageBandCode: null,
      },
    ])
    expect(changed).not.toBe(first)
  })
})

describe("canonical permalink construction", () => {
  it("builds a booking-reference permalink with an embedded edit token", async () => {
    const url = await buildTrackPaymentPermalink({
      bookingRef: "bk-20260411-abc123",
      bookerEmail: "Booker@Example.COM",
      appUrl: "https://example.com",
      secret: TEST_SECRET,
    })
    expect(url).toBeTruthy()
    expect(url).toContain("https://example.com/track-payment/BK-20260411-ABC123")
    const token = new URL(url as string).searchParams.get("token")
    expect(token).toBeTruthy()
    // The embedded token verifies for this exact binding.
    expect(
      await verifyTrackPaymentEditToken(token as string, {
        bookingRef: "BK-20260411-ABC123",
        bookerEmail: "booker@example.com",
        secret: TEST_SECRET,
      })
    ).toBe(true)
  })

  it("returns null when the shared secret is unavailable (fail closed)", async () => {
    const url = await buildTrackPaymentPermalink({
      bookingRef: "BK-20260411-ABC123",
      bookerEmail: "booker@example.com",
      appUrl: "https://example.com",
    })
    expect(url).toBeNull()
  })
})

// Keep the helper type referenced so the envelope fixture stays type-checked.
type _SelectionShape = EditAccommodationSelectionInput
