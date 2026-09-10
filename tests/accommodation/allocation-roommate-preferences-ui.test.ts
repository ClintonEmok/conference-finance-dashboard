import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  matchRoommatePreferences,
  normalizeRoommateTokens,
} from "@/lib/domain/accommodation/roommate-preferences"

const surface = readFileSync(
  new URL(
    "../../components/dashboard/accommodation/legacy-allocation-surface.tsx",
    import.meta.url
  ),
  "utf8"
)
const assignments = readFileSync(
  new URL("../../lib/domain/accommodation/assignments.ts", import.meta.url),
  "utf8"
)

describe("allocation roommate preferences", () => {
  it("renders populated request labels and uses the shared helper", () => {
    expect(surface).toContain("Wants to room with:")
    expect(surface).toContain("Avoids rooming with:")
    expect(surface).toContain("matchRoommatePreferences")
    expect(assignments).toContain("normalizeRoommateTokens")
    expect(assignments).toContain("buildPersonSignatures")
  })

  it("matches padded, mixed-case names and emails exactly", () => {
    expect(normalizeRoommateTokens("  ALICE@example.com; Bob\n")).toEqual([
      "alice@example.com",
      "bob",
    ])
    expect(
      matchRoommatePreferences({
        roommatePreference: "  ALICE@example.com, bob ",
        roommateAvoid: "Carol@example.com",
        candidates: [
          {
            attendeeId: "alice",
            attendeeName: "Alice",
            attendeeEmail: "alice@example.com",
          },
          {
            attendeeId: "bob",
            attendeeName: "Bob",
            attendeeEmail: "bob@example.com",
          },
          {
            attendeeId: "carol",
            attendeeName: "Carol",
            attendeeEmail: "carol@example.com",
          },
          {
            attendeeId: "substring",
            attendeeName: "Bobby",
            attendeeEmail: null,
          },
        ],
      })
    ).toEqual({ requestedIds: ["alice", "bob"], avoidedIds: ["carol"] })
  })

  it("wires highlight, focus, and advisory warning behavior without blocking actions", () => {
    expect(surface).toContain(
      "onMouseEnter={() => activateRoommateAttendee(attendee)}"
    )
    expect(surface).toContain(
      "onFocus={() => activateRoommateAttendee(attendee)}"
    )
    expect(surface).toContain("Avoided roommate")
    expect(surface).toContain("requestedIds.has(occ.attendeeId)")
    expect(surface).toContain("onClick={() => handleFulfill(attendee)}")
    expect(surface).toContain(
      "onClick={() => handleAssign(attendee.attendeeId)}"
    )
    expect(surface).not.toMatch(
      /handle(?:Assign|Fulfill)[\s\S]{0,500}roommateAvoid/
    )
  })

  it("keeps blank and unmatched preferences neutral", () => {
    expect(
      matchRoommatePreferences({
        roommatePreference: " ; \n ",
        roommateAvoid: null,
        candidates: [
          { attendeeId: "one", attendeeName: "One", attendeeEmail: null },
        ],
      })
    ).toEqual({ requestedIds: [], avoidedIds: [] })
    expect(
      matchRoommatePreferences({
        roommatePreference: "Nobody",
        roommateAvoid: "unknown@example.com",
        candidates: [
          {
            attendeeId: "one",
            attendeeName: "One",
            attendeeEmail: "one@example.com",
          },
        ],
      })
    ).toEqual({ requestedIds: [], avoidedIds: [] })
    expect(surface).toContain("attendee.roommatePreference?.trim()")
    expect(surface).toContain("attendee.roommateAvoid?.trim()")
    expect(surface).toContain("if (requestedIds.size === 0) return unassigned")
  })
})
