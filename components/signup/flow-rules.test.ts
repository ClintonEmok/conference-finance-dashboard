import { describe, expect, it } from "vitest"

import { shouldSkipRoomsStep } from "@/components/signup/flow-rules"
import type { AttendeeDraft } from "@/components/signup/state"
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
    config: null,
    activeCategories: [],
    options: [],
    ageBands: [],
    slots: [],
  },
}

function makeAttendee(attendeeKey: string): AttendeeDraft {
  return {
    attendeeKey,
    ticketTypeId: "ticket_1",
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

describe("signup flow room-step rules", () => {
  it("skips rooms step for one attendee with effective room type", () => {
    const result = shouldSkipRoomsStep(baseEvent, [makeAttendee("ticket_1-1")])

    expect(result).toBe(true)
  })

  it("does not skip rooms step for multiple attendees", () => {
    const result = shouldSkipRoomsStep(baseEvent, [
      makeAttendee("ticket_1-1"),
      makeAttendee("ticket_1-2"),
    ])

    expect(result).toBe(false)
  })
})
