import { describe, expect, it } from "vitest"

import { validateSignupAttendees } from "@/components/signup/validation"

describe("signup attendee validation", () => {
  it("requires location before the attendee step can complete", () => {
    const result = validateSignupAttendees([
      {
        attendeeKey: "a-1",
        name: "Jane Doe",
        gender: "female",
        location: "",
      },
    ])

    expect(result.isValid).toBe(false)
    expect(result.byAttendee["a-1"]).toContain("location")
  })

  it("accepts attendees with location filled in", () => {
    const result = validateSignupAttendees([
      {
        attendeeKey: "a-1",
        name: "Jane Doe",
        gender: "female",
        location: "Amsterdam",
      },
    ])

    expect(result.isValid).toBe(true)
    expect(result.byAttendee["a-1"]).toEqual([])
  })
})
