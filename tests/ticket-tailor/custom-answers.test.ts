import { describe, expect, it } from "vitest"
import {
  extractCustomAnswers,
  parseGenderFromAnswer,
  parseGenderFromTicketType,
  parseAgeGroupFromTicketType,
  parseTicketCategory,
  detectPriorityFromAnswers,
  getAnswerByKey,
  wantsRoommate,
  getAllUniqueQuestions,
} from "@/lib/domain/ticket-tailor/custom-answers"

describe("extractCustomAnswers", () => {
  it("extracts gender, location, and remarks from custom questions", () => {
    const questions = [
      { question: "Gender", answer: "Female" },
      { question: "Location", answer: "Amsterdam" },
      { question: "Remarks", answer: "Vegetarian, need roommate" },
    ]

    const answers = extractCustomAnswers(questions)

    expect(answers.gender).toBe("Female")
    expect(answers.location).toBe("Amsterdam")
    expect(answers.remarks).toBe("Vegetarian, need roommate")
  })

  it("handles null answers", () => {
    const questions = [
      { question: "Gender", answer: null },
      { question: "Location", answer: "" },
    ]

    const answers = extractCustomAnswers(questions)

    expect(answers.gender).toBeNull()
    expect(answers.location).toBeNull()
  })

  it("handles alternative question phrasings", () => {
    const questions = [
      { question: "What is your gender?", answer: "Male" },
      { question: "What location are you from?", answer: "Rotterdam" },
      { question: "Any remarks?", answer: "None" },
    ]

    const answers = extractCustomAnswers(questions)

    expect(answers.gender).toBe("Male")
    expect(answers.location).toBe("Rotterdam")
    expect(answers.remarks).toBe("None")
  })

  it("stores all questions with normalized key", () => {
    const questions = [
      { question: "Custom Field", answer: "Custom Value" },
    ]

    const answers = extractCustomAnswers(questions)

    expect(answers["custom field"]).toBe("Custom Value")
  })
})

describe("parseGenderFromTicketType", () => {
  it("parses male ticket types", () => {
    expect(parseGenderFromTicketType("Male 18+")).toBe("MALE")
    expect(parseGenderFromTicketType("Man Adult")).toBe("MALE")
    expect(parseGenderFromTicketType("Boy Teen")).toBe("MALE")
  })

  it("parses female ticket types", () => {
    expect(parseGenderFromTicketType("Female 18+")).toBe("FEMALE")
    expect(parseGenderFromTicketType("Woman Adult")).toBe("FEMALE")
    expect(parseGenderFromTicketType("Girl Teen")).toBe("FEMALE")
  })

  it("parses mixed/family ticket types", () => {
    expect(parseGenderFromTicketType("Mixed Family")).toBe("MIXED")
    expect(parseGenderFromTicketType("Family Pack")).toBe("MIXED")
  })

  it("returns UNKNOWN for unrecognized patterns", () => {
    expect(parseGenderFromTicketType("VIP Pass")).toBe("UNKNOWN")
    expect(parseGenderFromTicketType("General Admission")).toBe("UNKNOWN")
    expect(parseGenderFromTicketType(null)).toBe("UNKNOWN")
  })
})

describe("parseGenderFromAnswer", () => {
  it("parses gender from custom question answers", () => {
    expect(parseGenderFromAnswer("Female")).toBe("FEMALE")
    expect(parseGenderFromAnswer("Male")).toBe("MALE")
    expect(parseGenderFromAnswer("Mixed Family")).toBe("MIXED")
  })

  it("returns UNKNOWN for empty or unsupported answers", () => {
    expect(parseGenderFromAnswer(null)).toBe("UNKNOWN")
    expect(parseGenderFromAnswer("Prefer not to say")).toBe("UNKNOWN")
  })
})

describe("parseAgeGroupFromTicketType", () => {
  it("parses adult age groups", () => {
    expect(parseAgeGroupFromTicketType("Male 18+")).toBe("adult")
    expect(parseAgeGroupFromTicketType("Adult Pass")).toBe("adult")
  })

  it("parses teen age groups", () => {
    expect(parseAgeGroupFromTicketType("Teen 13-17")).toBe("teen")
    expect(parseAgeGroupFromTicketType("Youth Ticket")).toBe("teen")
  })

  it("parses child age groups", () => {
    expect(parseAgeGroupFromTicketType("Child 5-12")).toBe("child")
    expect(parseAgeGroupFromTicketType("Kids Pass")).toBe("child")
  })

  it("parses infant age groups", () => {
    expect(parseAgeGroupFromTicketType("Infant 0-4")).toBe("infant")
    expect(parseAgeGroupFromTicketType("Baby Ticket")).toBe("infant")
  })

  it("returns null for unrecognized patterns", () => {
    expect(parseAgeGroupFromTicketType("VIP Pass")).toBeNull()
    expect(parseAgeGroupFromTicketType(null)).toBeNull()
  })
})

describe("parseTicketCategory", () => {
  it("categorizes ticket types", () => {
    expect(parseTicketCategory("VIP Pass")).toBe("VIP")
    expect(parseTicketCategory("Family Bundle")).toBe("Family")
    expect(parseTicketCategory("Adult 18+")).toBe("Adult")
    expect(parseTicketCategory("Teen 13-17")).toBe("Teen")
    expect(parseTicketCategory("Child 5-12")).toBe("Child")
    expect(parseTicketCategory("Infant 0-4")).toBe("Infant")
    expect(parseTicketCategory("Day Pass")).toBe("DayPass")
  })

  it("returns Standard for unrecognized", () => {
    expect(parseTicketCategory("General Admission")).toBe("Standard")
  })
})

describe("detectPriorityFromAnswers", () => {
  it("detects CRITICAL priority for accessibility needs", () => {
    const result = detectPriorityFromAnswers({
      remarks: "Wheelchair user, needs accessible room",
    })
    expect(result.priority).toBe("CRITICAL")
    expect(result.reason).toBe("accessibility")
  })

  it("detects HIGH priority for young children", () => {
    const result = detectPriorityFromAnswers({
      remarks: "Family with toddler",
    })
    expect(result.priority).toBe("HIGH")
    expect(result.reason).toBe("young_children")
  })

  it("detects HIGH priority for roommate preferences", () => {
    const result = detectPriorityFromAnswers({
      remarks: "Need roommate",
    })
    expect(result.priority).toBe("HIGH")
    expect(result.reason).toBe("roommate_preference")
  })

  it("returns NORMAL for standard attendees", () => {
    const result = detectPriorityFromAnswers({
      remarks: "No special requirements",
    })
    expect(result.priority).toBe("NORMAL")
    expect(result.reason).toBeNull()
  })
})

describe("getAnswerByKey", () => {
  it("gets answers by key", () => {
    const answers = {
      gender: "Female",
      location: "Amsterdam",
      remarks: "Vegetarian",
    }

    expect(getAnswerByKey(answers, "gender")).toBe("Female")
    expect(getAnswerByKey(answers, "Gender")).toBe("Female")
    expect(getAnswerByKey(answers, "GENDER")).toBe("Female")
    expect(getAnswerByKey(answers, "location")).toBe("Amsterdam")
  })

  it("returns null for missing keys", () => {
    const answers = { gender: "Female" }
    expect(getAnswerByKey(answers, "missing")).toBeNull()
  })
})

describe("wantsRoommate", () => {
  it("detects roommate preference", () => {
    expect(wantsRoommate({ roommatePreference: "Yes please" })).toBe(true)
    expect(wantsRoommate({ remarks: "I need a roommate" })).toBe(true)
    expect(wantsRoommate({ remarks: "Prefer to share room" })).toBe(true)
  })

  it("returns false when no roommate preference", () => {
    expect(wantsRoommate({ remarks: "No roommate needed" })).toBe(false)
    expect(wantsRoommate({})).toBe(false)
  })
})

describe("getAllUniqueQuestions", () => {
  it("collects unique questions from multiple attendees", () => {
    const attendees = [
      {
        rawPayload: {
          custom_questions: [
            { question: "Gender", answer: "Male" },
            { question: "Location", answer: "Amsterdam" },
          ],
        },
      },
      {
        rawPayload: {
          custom_questions: [
            { question: "Gender", answer: "Female" },
            { question: "Remarks", answer: "None" },
          ],
        },
      },
    ]

    const questions = getAllUniqueQuestions(attendees)

    expect(questions).toHaveLength(3)
    expect(questions).toContain("Gender")
    expect(questions).toContain("Location")
    expect(questions).toContain("Remarks")
  })

  it("handles missing custom_questions", () => {
    const attendees = [
      { rawPayload: {} },
      { rawPayload: { custom_questions: [] } },
    ]

    const questions = getAllUniqueQuestions(attendees)
    expect(questions).toHaveLength(0)
  })
})
