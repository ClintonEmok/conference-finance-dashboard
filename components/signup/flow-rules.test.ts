import { describe, expect, it } from "vitest"

import {
  SIGNUP_STEP_ORDER,
  pruneAccommodationSelectionsForAttendees,
  type AccommodationSelectionDraft,
  type AttendeeDraft,
} from "@/components/signup/state"
import {
  allAttendeesHaveAccommodationSelections,
  attendeeHasCompleteAccommodationSelection,
  eventHasConfiguredAccommodation,
} from "@/components/signup/flow-rules"
import type { PublicSignupCatalogEvent } from "@/lib/domain/signup/catalog"

const baseEvent: PublicSignupCatalogEvent = {
  eventId: "evt_1",
  slug: "event-one",
  title: "Event One",
  startsAt: Date.now(),
  endsAt: Date.now() + 1_000,
  timezone: "Europe/Amsterdam",
  currency: "EUR",
  source: {
    kind: "internal",
    provider: null,
    externalEventId: null,
  },
  defaultRoomTypeId: "rt_default",
  tickets: [
    {
      ticketTypeId: "ticket_1",
      label: "Standard",
      priceMinor: 10000,
      selectable: true,
      reason: null,
      roomTypeId: undefined,
    },
  ],
  accommodation: {
    eligible: true,
    reason: null,
    config: {
      baseCheckInAt: 1,
      baseCheckOutAt: 2,
      nightCount: 1,
      breakfastIncluded: false,
    },
    activeCategories: [
      {
        categoryId: "cat_1",
        code: "standard",
        label: "Standard",
        rates: [{ occupancy: "shared", pricePerPersonMinor: 3000 }],
      },
    ],
    options: [],
    slots: [],
  },
}

function makeAttendee(
  attendeeKey: string,
  ticketTypeId = "ticket_1"
): AttendeeDraft {
  return {
    attendeeKey,
    ticketTypeId,
    ticketLabel: "Standard",
    name: "",
    email: "",
    phone: "",
    gender: "",
    location: "",
    dietaryRestrictions: "",
    roommatePreference: "",
  }
}

function makeSelection(
  overrides: Partial<AccommodationSelectionDraft> = {}
): AccommodationSelectionDraft {
  return {
    categoryId: "cat_1",
    occupancy: "shared",
    optionSelections: [],
    ...overrides,
  }
}

describe("signup flow options-only rules", () => {
  it("exposes the five-step options-only order", () => {
    expect(SIGNUP_STEP_ORDER).toEqual([
      "tickets",
      "buyer",
      "attendees",
      "accommodation",
      "review",
    ])
  })

  it("detects configured accommodation from the server contract", () => {
    expect(eventHasConfiguredAccommodation(baseEvent)).toBe(true)
    expect(
      eventHasConfiguredAccommodation({
        ...baseEvent,
        accommodation: {
          ...baseEvent.accommodation,
          config: null,
          activeCategories: [],
        },
      })
    ).toBe(false)
  })

  it("requires a category and occupancy before a selection is complete", () => {
    const attendee = makeAttendee("ticket_1-1")
    expect(
      attendeeHasCompleteAccommodationSelection(attendee, {
        "ticket_1-1": makeSelection(),
      })
    ).toBe(true)
    expect(
      attendeeHasCompleteAccommodationSelection(attendee, {
        "ticket_1-1": makeSelection({ categoryId: "" }),
      })
    ).toBe(false)
    expect(
      attendeeHasCompleteAccommodationSelection(attendee, {})
    ).toBe(false)

    expect(
      allAttendeesHaveAccommodationSelections(
        [attendee, makeAttendee("ticket_1-2")],
        { "ticket_1-1": makeSelection() }
      )
    ).toBe(false)
  })

  it("preserves selections for surviving attendee keys", () => {
    const previous = {
      "ticket_1-1": makeSelection(),
      "ticket_1-2": makeSelection({ occupancy: "single" }),
    }
    const pruned = pruneAccommodationSelectionsForAttendees(previous, [
      makeAttendee("ticket_1-1"),
      makeAttendee("ticket_1-2"),
      makeAttendee("ticket_1-3"),
    ])

    expect(pruned).toEqual(previous)
  })

  it("drops selections for removed attendees and changed ticket types", () => {
    const previous = {
      "ticket_1-1": makeSelection(),
      "ticket_1-2": makeSelection(),
      "ticket_2-1": makeSelection(),
    }
    const pruned = pruneAccommodationSelectionsForAttendees(previous, [
      makeAttendee("ticket_1-1"),
      makeAttendee("ticket_2-1", "ticket_2"),
    ])

    expect(pruned).toEqual({
      "ticket_1-1": makeSelection(),
      "ticket_2-1": makeSelection(),
    })
  })
})
