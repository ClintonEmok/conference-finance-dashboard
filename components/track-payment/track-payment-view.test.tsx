import { createElement, type ReactElement } from "react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getFunctionName } from "convex/server"

import { api } from "@/convex/_generated/api"
import { TrackPaymentView } from "@/components/track-payment/TrackPaymentView"
import {
  TrackPaymentAccommodationEditor,
  TrackPaymentEditResultPanel,
  buildTrackPaymentEditBody,
  messageForEditError,
  submitTrackPaymentEdit,
  type TrackPaymentEditContext,
} from "@/components/track-payment/TrackPaymentAccommodationEditor"

const ROOT = resolve(import.meta.dirname, "../..")

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  routerPush: vi.fn(),
}))

vi.mock("convex/react", () => ({
  useQuery: mocks.useQuery,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => createElement("a", { href, ...props }, children),
}))

const BOOKING_REF = "BK-20260806-TEST01"

const mockSubmission = {
  submissionId: "order-1",
  bookingRef: BOOKING_REF,
  bookerName: "Booker",
  bookerEmail: "booker@example.com",
  bookerPhone: "+31612345678",
  eventId: "event-1",
  eventSlug: "test-event",
  submittedAt: 1_750_000_000_000,
  attendees: [
    {
      name: "Attendee One",
      email: undefined,
      ticketType: "Unconstrained ticket",
      assignedRoom: undefined,
    },
  ],
  roomAssignments: [],
  totalAmountMinor: 22500,
  accommodationLines: [
    {
      kind: "accommodation" as const,
      label: "Accommodation",
      nights: 2,
      ratePerNightMinor: 3000,
      chargeMinor: 6000,
    },
  ],
  ticketSelections: [
    {
      id: "ts-1",
      ticketTypeId: "tt-1",
      ticketTypeName: "Unconstrained ticket",
      quantity: 1,
      pricePerTicketMinor: 2000,
    },
  ],
}

const mockTracking = {
  bookingRef: BOOKING_REF,
  event: {
    slug: "test-event",
    title: "Test Conference",
    startsAt: 1_750_000_000_000,
  },
  order: {
    buyerName: "Booker",
    buyerPhone: "+31612345678",
    submittedAt: 1_750_000_000_000,
    orderedAt: null,
    totalAmountMinor: null,
    amountDueMinor: 22500,
    status: "pending",
  },
  payment: {
    totalDueMinor: 22500,
    totalPaidMinor: 10000,
    remainingMinor: 12500,
    progressPercent: 44,
    overpaymentDeltaMinor: 0,
    paymentCount: 1,
    paymentStatus: "partial" as const,
  },
  tikkieUrl: "https://pay.example.com/tikkie/flexible-zero-1",
  tikkieAmountMinor: 0,
  tikkieDescription: "Flexible payment request",
}

function buildEditContext(
  overrides: Partial<TrackPaymentEditContext> = {}
): TrackPaymentEditContext {
  return {
    bookingRef: BOOKING_REF,
    event: {
      slug: "test-event",
      title: "Test Conference",
      startsAt: 1_750_000_000_000,
      currency: "EUR",
    },
    locked: false,
    hasSelections: true,
    selections: [
      {
        attendeeKey: "a-1",
        attendeeName: "Attendee One",
        ticketLabel: "Unconstrained ticket",
        ticketCategoryId: undefined,
        categoryId: "cat-standard",
        occupancy: "shared",
        optionSelections: [{ optionKey: "cot", quantity: 1, nights: 2 }],
        confirmed: false,
      },
      {
        attendeeKey: "a-2",
        attendeeName: "Attendee Two",
        ticketLabel: "Superior-suite ticket",
        ticketCategoryId: "cat-superior",
        categoryId: "cat-superior",
        occupancy: "shared",
        optionSelections: [],
        confirmed: false,
      },
    ],
    accommodation: {
      eligible: true,
      config: {
        baseCheckInAt: 1_749_823_200_000,
        baseCheckOutAt: 1_750_000_000_000,
        nightCount: 2,
        breakfastIncluded: true,
      },
      activeCategories: [
        {
          categoryId: "cat-standard",
          code: "standard",
          label: "Standard",
          rates: [
            { occupancy: "shared", pricePerPersonMinor: 3000 },
            { occupancy: "single", pricePerPersonMinor: 5000 },
          ],
        },
        {
          categoryId: "cat-superior",
          code: "superior",
          label: "Superior",
          rates: [{ occupancy: "shared", pricePerPersonMinor: 4500 }],
        },
      ],
      options: [
        {
          optionKey: "parking",
          label: "Parking pass",
          priceMinor: 2000,
        },
        {
          optionKey: "cot",
          label: "Cot",
          priceMinor: 500,
        },
      ],
    },
    ...overrides,
  }
}

const serverResult = {
  bookingRef: BOOKING_REF,
  status: "applied" as const,
  amountDueMinor: 19500,
  totalPaidMinor: 30000,
  remainingMinor: 0,
  progressPercent: 100,
  overpaymentDeltaMinor: 10500,
}

const CLIENT_AUTHORITY_FIELDS = [
  "amountMinor",
  "totalAmountMinor",
  "amountDueMinor",
  "priceMinor",
  "price",
  "total",
  "checkInAt",
  "checkOutAt",
  "date",
  "dates",
  "nightCount",
  "nights",
  "roomId",
  "roomTypeId",
  "slotId",
  "assignedRoomId",
  "snapshot",
  "priceSnapshot",
  "configVersion",
  "confirmedAt",
]

function mockConvexData(
  submission: unknown,
  tracking: unknown,
  editContext: unknown
) {
  mocks.useQuery.mockImplementation((fn: unknown) => {
    const name = getFunctionName(fn as never)
    if (name === "signupSubmission:getByBookingRef") return submission
    if (name === "publicTracking:getByBookingRef") return tracking
    if (name === "publicTracking:getTrackPaymentEditContext") return editContext
    return undefined
  })
}

function render(element: ReactElement): string {
  return renderToStaticMarkup(element)
}

describe("buildTrackPaymentEditBody", () => {
  it("builds a complete options-only body with no client authority fields", () => {
    const body = buildTrackPaymentEditBody({
      bookingRef: BOOKING_REF,
      bookerEmail: "  Booker@Example.com ",
      editToken: "  token-abc ",
      idempotencyKey: "idem-1",
      selections: [
        {
          attendeeKey: "a-1",
          categoryId: "cat-standard",
          occupancy: "shared",
          optionSelections: [{ optionKey: "cot", quantity: 1, nights: 2 }],
        },
      ],
    })

    expect(body.bookingRef).toBeUndefined()
    expect(body.bookerEmail).toBe("booker@example.com")
    expect(body.editToken).toBe("token-abc")
    expect(body.idempotencyKey).toBe("idem-1")
    expect(body.website).toBe("")
    expect(Array.isArray(body.selections)).toBe(true)
    const selection = (body.selections as Array<Record<string, unknown>>)[0]
    expect(selection.attendeeKey).toBe("a-1")
    expect(selection.categoryId).toBe("cat-standard")
    expect(selection.occupancy).toBe("shared")
    expect(selection.optionSelections).toEqual([
      { optionKey: "cot", quantity: 1, nights: 2 },
    ])

    // Negative contract: no client money, stay, room, slot, or snapshot
    // field can leak into the request body (top level or inside selections).
    for (const field of CLIENT_AUTHORITY_FIELDS) {
      expect(field in body).toBe(false)
      expect(field in selection).toBe(false)
    }
  })

  it("omits empty ownership fields", () => {
    const body = buildTrackPaymentEditBody({
      bookingRef: BOOKING_REF,
      bookerEmail: "",
      editToken: "",
      idempotencyKey: "idem-1",
      selections: [],
    })
    expect(body.bookerEmail).toBeUndefined()
    expect(body.editToken).toBeUndefined()
  })
})

describe("messageForEditError", () => {
  it("maps ownership, confirmed, and rate-limit codes to accessible copy", () => {
    expect(messageForEditError("EDIT_OWNERSHIP")).toContain("verify ownership")
    expect(messageForEditError("EDIT_CONFIRMED")).toContain(
      "organizer has confirmed"
    )
    expect(messageForEditError("EDIT_INVALID")).toContain("no longer available")
    expect(messageForEditError("RATE_LIMITED")).toContain("Too many attempts")
    expect(messageForEditError("UNKNOWN_CODE")).toContain("try again")
  })
})

describe("submitTrackPaymentEdit", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it("posts an options-only body and returns the server canonical result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: serverResult }), { status: 200 })
    )
    globalThis.fetch = fetchMock as never

    const outcome = await submitTrackPaymentEdit({
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      editToken: "",
      idempotencyKey: "idem-1",
      selections: [
        {
          attendeeKey: "a-1",
          categoryId: "cat-standard",
          occupancy: "shared",
          optionSelections: [{ optionKey: "cot", quantity: 1, nights: 2 }],
        },
      ],
    })

    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.result.amountDueMinor).toBe(19500)
      expect(outcome.result.overpaymentDeltaMinor).toBe(10500)
    }

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string }
    ]
    expect(url).toBe(`/api/track-payment/${BOOKING_REF}`)
    expect(init.method).toBe("POST")
    expect(init.headers["x-idempotency-key"]).toBe("idem-1")
    const body = JSON.parse(init.body) as Record<string, unknown>
    for (const field of CLIENT_AUTHORITY_FIELDS) {
      expect(field in body).toBe(false)
    }
  })

  it("maps confirmed-lock and rate-limit failures to stable codes", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "EDIT_CONFIRMED",
            message: "locked",
          },
        }),
        { status: 409 }
      )
    ) as never
    const confirmed = await submitTrackPaymentEdit({
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      editToken: "",
      idempotencyKey: "idem-1",
      selections: [],
    })
    expect(confirmed).toEqual({ ok: false, code: "EDIT_CONFIRMED" })

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: "RATE_LIMITED", message: "slow down" } }),
        { status: 429 }
      )
    ) as never
    const limited = await submitTrackPaymentEdit({
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      editToken: "",
      idempotencyKey: "idem-1",
      selections: [],
    })
    expect(limited).toEqual({ ok: false, code: "RATE_LIMITED" })
  })

  it("maps network failures to EDIT_FAILED", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("network down")) as never
    const outcome = await submitTrackPaymentEdit({
      bookingRef: BOOKING_REF,
      bookerEmail: "booker@example.com",
      editToken: "",
      idempotencyKey: "idem-1",
      selections: [],
    })
    expect(outcome).toEqual({ ok: false, code: "EDIT_FAILED" })
  })
})

describe("TrackPaymentView routing and states", () => {
  beforeEach(() => {
    mocks.useQuery.mockReset()
  })

  it("root entry renders the search hero without an editor shell", () => {
    mockConvexData(undefined, undefined, undefined)
    const html = render(
      createElement(TrackPaymentView, { initialBookingRef: undefined })
    )
    expect(html).toContain("Manage booking")
    expect(html).toContain('aria-label="Booking reference"')
    expect(html).toContain("Find")
    expect(html).not.toContain("Search another booking")
    expect(html).not.toContain("Accommodation preferences")
  })

  it("permalink loading renders the skeleton while queries are pending", () => {
    mockConvexData(undefined, undefined, undefined)
    const html = render(
      createElement(TrackPaymentView, {
        initialBookingRef: BOOKING_REF,
      })
    )
    expect(html).toContain("animate-pulse")
    expect(html).toContain("Search another booking")
    expect(html).not.toContain("Track Booking")
  })

  it("permalink renders server balance, receipt, flexible Tikkie URL, and purchaser without client totals", () => {
    mockConvexData(mockSubmission, mockTracking, buildEditContext())
    const html = render(
      createElement(TrackPaymentView, {
        initialBookingRef: BOOKING_REF,
        initialEditToken: "token-from-email",
      })
    )
    expect(html).toContain("Test Conference")
    expect(html).toContain("€225.00") // server total due
    expect(html).toContain("€100.00") // server paid
    expect(html).toContain("44%")
    // The flexible-zero Tikkie link is preserved verbatim.
    expect(html).toContain("https://pay.example.com/tikkie/flexible-zero-1")
    // Receipt rows come from the server payload.
    expect(html).toContain("Unconstrained ticket")
    expect(html).toContain("Accommodation")
    // The ownership email is never rendered — it is input-only proof, and
    // returning it from a public query would defeat the email ownership gate.
    expect(html).not.toContain("booker@example.com")
    // The edit token from the email link is consumed locally only — it is
    // prefilled into the edit-link input (in-memory state from the URL),
    // never returned by a public query or rendered outside that input.
    expect(html).toContain('value="token-from-email"')
    expect(html.match(/token-from-email/g)?.length).toBe(1)
  })

  it("not-found renders the booking-not-found state without edit controls", () => {
    mockConvexData(null, null, null)
    const html = render(
      createElement(TrackPaymentView, {
        initialBookingRef: BOOKING_REF,
      })
    )
    expect(html).toContain("Booking not found")
    expect(html).not.toContain("Save preferences")
  })

  it("normalizes a lower/mixed-case permalink reference before querying", () => {
    mockConvexData(undefined, undefined, undefined)
    render(
      createElement(TrackPaymentView, {
        initialBookingRef: "  bk-20260806-test01  ",
      })
    )
    expect(mocks.useQuery).toHaveBeenCalled()
    const calls = mocks.useQuery.mock
      .calls as Array<[unknown, { bookingRef: string } | "skip"]>
    const queryArgs = calls
      .map(([, args]) => args)
      .filter((args): args is { bookingRef: string } => args !== "skip")
    expect(queryArgs.length).toBeGreaterThan(0)
    for (const args of queryArgs) {
      expect(args.bookingRef).toBe(BOOKING_REF)
    }
  })
})

describe("TrackPaymentAccommodationEditor states", () => {
  it("renders server-configured per-attendee choices with ticket-constrained filtering", () => {
    const html = render(
      createElement(TrackPaymentAccommodationEditor, {
        bookingRef: BOOKING_REF,
        currency: "EUR",
        editContext: buildEditContext(),
      })
    )
    expect(html).toContain("Accommodation preferences")
    expect(html).toContain("Attendee One")
    expect(html).toContain("Attendee Two")
    // Long server-configured option labels render verbatim.
    expect(html).toContain("Parking pass")
    expect(html).toContain("Cot")
    // a-1 (unconstrained) sees Standard + Superior; a-2 (superior ticket)
    // sees only Superior — Standard appears exactly once.
    expect(html.match(/Standard/g)?.length).toBe(1)
    expect(html.match(/Superior/g)?.length).toBeGreaterThanOrEqual(2)
    // Save action is present; narrow-layout classes are applied.
    expect(html).toContain("Save preferences")
    expect(html).toContain("min-w-0")
    expect(html).toContain("flex-wrap")
  })

  it("renders a locked state without mutation controls", () => {
    const html = render(
      createElement(TrackPaymentAccommodationEditor, {
        bookingRef: BOOKING_REF,
        currency: "EUR",
        editContext: buildEditContext({ locked: true }),
      })
    )
    expect(html).toContain(
      "Accommodation changes are closed because the organizer has confirmed this configuration."
    )
    expect(html).not.toContain("Save preferences")
  })

  it("renders an honest empty state when the order has no selections", () => {
    const html = render(
      createElement(TrackPaymentAccommodationEditor, {
        bookingRef: BOOKING_REF,
        currency: "EUR",
        editContext: buildEditContext({ hasSelections: false, selections: [] }),
      })
    )
    expect(html).toContain("no accommodation preferences recorded")
    expect(html).not.toContain("Save preferences")
  })

  it("renders nothing while the edit context is still loading", () => {
    const html = render(
      createElement(TrackPaymentAccommodationEditor, {
        bookingRef: BOOKING_REF,
        currency: "EUR",
        editContext: undefined,
      })
    )
    expect(html).toBe("")
  })
})

describe("TrackPaymentEditResultPanel", () => {
  it("renders the server-provided overpayment with donation/refund-support copy", () => {
    const html = render(
      createElement(TrackPaymentEditResultPanel, {
        result: serverResult,
        currency: "EUR",
      })
    )
    expect(html).toContain("Your payments exceed the new amount due by €105.00")
    expect(html).toContain("treated as a donation")
    expect(html).toContain("request a refund")
  })

  it("shows no overpayment callout when the server reports none", () => {
    const html = render(
      createElement(TrackPaymentEditResultPanel, {
        result: { ...serverResult, overpaymentDeltaMinor: 0 },
        currency: "EUR",
      })
    )
    expect(html).toContain("latest server calculation")
    expect(html).not.toContain("exceed")
  })
})

// ---------------------------------------------------------------------------
// Phase 45 deep-link and single-shell source contracts: the permalink is the
// canonical URL, root search navigates to it, the token query survives, and
// no route introduces a duplicate shell or drops the reference/token.
// ---------------------------------------------------------------------------

describe("deep-link and single-shell source contracts (Phase 45)", () => {
  it("root search page is a thin TrackPaymentView wrapper with no second shell", () => {
    const rootPage = readSource("app/manage/page.tsx")
    expect(rootPage).toContain("<TrackPaymentView />")
    expect(rootPage).not.toContain("initialBookingRef")
    expect(rootPage).not.toContain("Track Booking")
  })

  it("permalink page normalizes the reference and preserves the edit-token query", () => {
    const permalink = readSource("app/manage/[bookingRef]/page.tsx")
    expect(permalink).toContain("normalizeBookingRefForEdit")
    expect(permalink).toContain("initialBookingRef={bookingRef}")
    expect(permalink).toContain("initialEditToken={token}")
    expect(permalink).toContain("Promise<{ token?: string }>")
    // The permalink is a thin wrapper — it never renders search/hero markup
    // or a second shell.
    expect(permalink).not.toContain("Track Booking")
    expect(permalink).not.toContain("Search another booking")
  })

  it("shared view pushes a normalized permalink and back-links without a second shell", () => {
    const view = readSource("components/track-payment/TrackPaymentView.tsx")
    // Root search navigates to the canonical normalized permalink.
    expect(view).toContain(
      "router.push(`/manage/${encodeURIComponent(normalized)}`)"
    )
    // The permalink provides a safe path back to search.
    expect(view).toContain('href="/manage"')
    // The search hero renders only on the root entry, so the permalink never
    // shows a duplicate shell.
    expect(view).toContain("{!initialBookingRef ? (")
    // The token handed to the view is consumed locally (edit-link prefill),
    // never serialized into query data or rendered twice.
    expect(view).toContain("initialEditToken")
  })

  it("confirmation email links prefer the token permalink and fail closed to the manage surface", () => {
    const email = readSource("convex/emailActions.ts")
    const permalinkBuilder = readSource(
      "lib/domain/track-payment/edit-token.ts"
    )
    const template = readSource("lib/email/templates/signup-confirmation.tsx")

    expect(permalinkBuilder).toContain("/manage/${encodeURIComponent(")
    expect(permalinkBuilder).toContain("?token=${encodeURIComponent(token)}")
    // Resend/signup confirmation prefers the durable token permalink.
    expect(email).toContain("buildTrackPaymentPermalink")
    // Missing secret fails closed to the plain manage surface (email-match
    // ownership) — never a forgeable token link.
    expect(email).toContain("?? `${appUrl}/manage`")
    // The email template renders the server-built link target.
    expect(template).toContain("trackPaymentUrl")
    expect(template).toContain("href={trackPaymentUrl}")
  })
})
