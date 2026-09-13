import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const source = fs.readFileSync(
  path.join(
    process.cwd(),
    "components/dashboard/accommodation/legacy-allocation-surface.tsx"
  ),
  "utf8"
)
const hotelsSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "components/dashboard/accommodation/legacy-hotels-surface.tsx"
  ),
  "utf8"
)

describe("manual Allocation workflow source contract", () => {
  it("uses the manual queue and room-capacity language", () => {
    expect(source).toContain("Needs Placement")
    expect(source).toContain("Room capacity")
    expect(source).toContain("Assign to selected room")
    expect(source).toContain("Family placement")
    expect(source).toContain("eligibleChildren")
    expect(source).toContain("eligibleChildCount")
    expect(source).toContain("Some family members require separate placement")
    expect(source).toContain("No attendees match the current filters.")
    expect(source).toContain("All attendees have been placed.")
  })

  it("renders server-owned context and native room selection semantics", () => {
    expect(source).toContain("attendee.paymentState")
    expect(source).toContain("attendee.allocationPriority")
    expect(source).toContain("attendee.bookingRef")
    expect(source).toContain("attendee.bookerName")
    expect(source).toContain("attendee.location")
    expect(source).toContain("attendee.roommatePreference")
    expect(source).toContain("attendee.roommateAvoid")
    expect(source).toContain("Order:")
    expect(source).toContain("Booker:")
    expect(source).toContain("Location:")
    expect(source).toContain("Roommate preference:")
    expect(source).toContain("Roommate avoidance:")
    expect(source).not.toContain("Advisory only")
    expect(source).not.toContain(">Compatibility:")
    expect(source).toContain("aria-pressed={isSelected}")
    expect(source).toContain("handleRoomCardClick")
    expect(source).toContain("toggleRoomSelection(room.id)")
    expect(source).toContain("room.occupantCount")
    expect(source).toContain("room.occupiedBeds")
    expect(source).toContain("room.availableBeds")
    expect(source).toContain("beds used")
    expect(source).toContain("No bed required")
    expect(source).toContain("room.foreignOccupantCount")
    expect(source).toContain("room.occupancyIncomplete")
    expect(source).not.toMatch(/room\.occupants(?:\?\.)?\.length/)
    expect(source).toContain("room.mixedCategoryGroup")
    expect(source).toContain("occ.nightBeforeMismatch")
    expect(source).toContain("PaymentBadge state={attendee.paymentState}")
    expect(source).toContain("Family placement")
    expect(source).not.toMatch(
      /(?:paidAmountMinor|totalPaidMinor|amountDueMinor)\s*[+\-*/]/
    )
  })

  it("uses explicit room selection before the assignment mutation", () => {
    expect(source).not.toContain("findCompatibleRoom")
    expect(source).not.toContain("Find compatible room")
    expect(source).not.toContain("recommendedRoomId")
    expect(source).not.toContain("Finding compatible room…")
    expect(source).toContain("useAssignAttendeeToRoom")
    expect(source).toContain("useUnassignAttendeeFromRoom")
    expect(source).toContain("await assignAttendee({")
    expect(source).toContain("eventId: event._id")
    expect(source).toContain("Assign family to selected room")
    expect(source).toContain("Move family to selected room")
    expect(source).toContain("Remove family placement")
    expect(source).toContain("No bed")
    expect(source).toContain("Follows parent when family placement is used")
    expect(source).not.toContain("Parent placement required")
    expect(source).toContain("Show family members for")
    expect(source).toContain("<details")
    expect(source).toContain("Assigning family…")
    expect(source).toContain("Moving family…")
    expect(source).toContain("Removing family placement…")
    expect(source).not.toContain("handleAssignGroup")
    expect(source).not.toContain("Assign child")
    expect(source).not.toContain("Move child")
    expect(source).not.toContain("Unassign child")
    expect(source).not.toContain("for (const a of group)")
    expect(source).toContain("role=\"alert\"")
    expect(source).toContain("role=\"status\"")
    expect(source).toContain("function errorMessage(error: unknown, fallback: string)")
    expect(source).toContain("catch (error: unknown)")
    expect(source).toContain("Unassigning…")
    expect(source).toContain("aria-busy={pendingAction === `unassign:${occ.attendeeId}`}")
    expect(source).toContain(
      "Confirming an assignment confirms this buyer's accommodation configuration and closes further buyer changes"
    )
    expect(hotelsSource).toContain("useEventAllocationSummary")
    expect(hotelsSource).toContain("allocationSummary.totalOccupants")
    expect(hotelsSource).toContain("allocationSummary.occupiedBeds")
    expect(hotelsSource).toContain("allocationSummary.availableBeds")
  })

  it("clears transient room intent without reintroducing a tab query", () => {
    const roomIntentResets =
      source.match(/nextParams\.delete\("roomId"\)/g) ?? []
    expect(roomIntentResets).toHaveLength(2)
    expect(source).toContain("syncAllocationFiltersToSearchParams")
    expect(source).toContain("nextParams.delete(\"tab\")")
  })

  it("does not render automatic or proposal placement controls", () => {
    expect(source).not.toContain("Generate Suggestions")
    expect(source).not.toContain("Suggested Assignments")
    expect(source).not.toContain("Auto-assign")
    expect(source).not.toContain("Apply (")
    expect(source).not.toContain("Fulfill")
    expect(source).not.toContain("generateAllocationProposal")
  })
})
