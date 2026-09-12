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

describe("manual Allocation workflow source contract", () => {
  it("uses the manual queue and room-capacity language", () => {
    expect(source).toContain("Needs Placement")
    expect(source).toContain("Room capacity")
    expect(source).toContain("Find compatible room")
    expect(source).toContain("Assign to selected room")
    expect(source).toContain("Family/group")
    expect(source).toContain("Compatibility unavailable")
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
    expect(source).toContain("attendee.compatibility?.summary")
    expect(source).toContain("Order:")
    expect(source).toContain("Booker:")
    expect(source).toContain("Location:")
    expect(source).toContain("Roommate preference:")
    expect(source).toContain("Roommate avoidance:")
    expect(source).toContain("Compatibility:")
    expect(source).toContain("aria-pressed={isSelected}")
    expect(source).toContain("room.occupiedBeds")
    expect(source).toContain("room.availableBeds")
    expect(source).toContain("room.mixedCategoryGroup")
    expect(source).toContain("occ.nightBeforeMismatch")
    expect(source).toContain("PaymentBadge state={attendee.paymentState}")
    expect(source).toContain("Family/group")
    expect(source).not.toMatch(
      /(?:paidAmountMinor|totalPaidMinor|amountDueMinor)\s*[+\-*/]/
    )
  })

  it("keeps preview separate from the assignment mutation", () => {
    const start = source.indexOf("function findCompatibleRoom")
    const end = source.indexOf("async function handleUnassign", start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const previewBlock = source.slice(start, end)
    expect(previewBlock).not.toContain("assignAttendee(")
    expect(previewBlock).toContain("recommendedRoomId")
    expect(previewBlock).toContain("Review it, then choose Assign to selected room.")
    expect(source).not.toContain("Finding compatible room…")
    expect(source).toContain("useAssignAttendeeToRoom")
    expect(source).toContain("useUnassignAttendeeFromRoom")
    expect(source).toContain("assignAttendee({ attendeeId, roomId: selectedRoomId })")
    expect(source).toContain("Assign group to selected room")
    expect(source).toContain("role=\"alert\"")
    expect(source).toContain("role=\"status\"")
    expect(source).toContain(
      "Confirming an assignment confirms this buyer's accommodation configuration and closes further buyer changes"
    )
  })

  it("clears transient room intent only in the component filter actions", () => {
    const roomIntentResets =
      source.match(/nextParams\.delete\("roomId"\)/g) ?? []
    expect(roomIntentResets).toHaveLength(2)
    expect(source).toContain("syncAllocationFiltersToSearchParams")
    expect(source).toContain("nextParams.set(\"tab\", \"allocation\")")
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
