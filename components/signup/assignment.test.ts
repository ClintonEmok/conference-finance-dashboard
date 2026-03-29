import { describe, expect, it } from "vitest"

import {
  buildAssignmentBoard,
  canDropAttendeeIntoSlot,
  getAssignableSlotTargets,
  summarizeUnfilledBeds,
} from "@/components/signup/assignment"
import type { PublicSignupCatalogEvent } from "@/lib/domain/signup/catalog"

const eventFixture: PublicSignupCatalogEvent = {
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
  tickets: [],
  accommodation: {
    eligible: true,
    reason: null,
    slots: [
      {
        slotId: "slot-a",
        roomLabel: "Room A",
        roomTypeLabel: "Twin",
        assignable: true,
      },
      {
        slotId: "slot-b",
        roomLabel: "Room A",
        roomTypeLabel: "Twin",
        assignable: false,
      },
      {
        slotId: "slot-c",
        roomLabel: "Room B",
        roomTypeLabel: "Triple",
        assignable: true,
      },
    ],
  },
}

describe("signup-flow assignment helpers", () => {
  it("excludes non-assignable slots from drop targets", () => {
    const targets = getAssignableSlotTargets(eventFixture)

    expect(targets.map((slot) => slot.slotId)).toEqual(["slot-a", "slot-c"])
  })

  it("rejects duplicate attendee and duplicate slot mappings", () => {
    const board = buildAssignmentBoard(
      [
        { attendeeId: "att-1", name: "Ada" },
        { attendeeId: "att-2", name: "Bo" },
      ],
      eventFixture.accommodation.slots,
      {
        "att-1": "slot-a",
        "att-2": "slot-c",
      }
    )

    expect(canDropAttendeeIntoSlot("att-1", "slot-c", board)).toBe(false)
    expect(canDropAttendeeIntoSlot("att-2", "slot-a", board)).toBe(false)
    expect(canDropAttendeeIntoSlot("att-2", "slot-b", board)).toBe(false)
  })

  it("keeps unfilled bed summary accurate through assign and unassign", () => {
    const attendees = [
      { attendeeId: "att-1", name: "Ada" },
      { attendeeId: "att-2", name: "Bo" },
    ]

    const noAssignments = buildAssignmentBoard(
      attendees,
      eventFixture.accommodation.slots,
      {}
    )

    expect(summarizeUnfilledBeds(noAssignments)).toEqual({
      totalBeds: 2,
      filledBeds: 0,
      unfilledBeds: 2,
    })

    const oneAssigned = buildAssignmentBoard(
      attendees,
      eventFixture.accommodation.slots,
      { "att-1": "slot-a" }
    )

    expect(summarizeUnfilledBeds(oneAssigned)).toEqual({
      totalBeds: 2,
      filledBeds: 1,
      unfilledBeds: 1,
    })

    const unassignedAgain = buildAssignmentBoard(
      attendees,
      eventFixture.accommodation.slots,
      {}
    )

    expect(summarizeUnfilledBeds(unassignedAgain)).toEqual({
      totalBeds: 2,
      filledBeds: 0,
      unfilledBeds: 2,
    })
  })
})
