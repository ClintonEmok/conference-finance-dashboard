import type { GenderType, AllocationPriority } from "@prisma/client"

export type CustomAnswers = {
  gender?: string | null
  location?: string | null
  remarks?: string | null
  dietary?: string | null
  roommatePreference?: string | null
  [key: string]: string | null | undefined
}

type TicketTailorQuestion = {
  question: string
  answer: string | null
}

const GENDER_PATTERNS = [
  { pattern: /\bfemale\b|\bwoman\b|\bgirl\b/i, gender: "FEMALE" as GenderType },
  { pattern: /\bmale\b|\bman\b|\bboy\b/i, gender: "MALE" as GenderType },
  { pattern: /\bmixed\b|\bfamily\b/i, gender: "MIXED" as GenderType },
]

const AGE_GROUP_PATTERNS = [
  { pattern: /18\+|adult/i, age: "adult" },
  { pattern: /13-17|teen|youth/i, age: "teen" },
  { pattern: /5-12|child|kid/i, age: "child" },
  { pattern: /0-4|infant|baby/i, age: "infant" },
]

const PRIORITY_PATTERNS: Array<{
  pattern: RegExp
  priority: AllocationPriority
  reason: string
}> = [
  { pattern: /wheelchair|mobility|elderly|disability|disabled|accessible|special needs/i, priority: "CRITICAL", reason: "accessibility" },
  { pattern: /baby|toddler|young children|infant|pregnant/i, priority: "HIGH", reason: "young_children" },
  { pattern: /need roommate|prefer roommate|room partner/i, priority: "HIGH", reason: "roommate_preference" },
  { pattern: /family/i, priority: "HIGH", reason: "family" },
]

export function extractCustomAnswers(questions: TicketTailorQuestion[]): CustomAnswers {
  const answers: CustomAnswers = {}

  for (const q of questions) {
    const normalizedQuestion = q.question.toLowerCase().trim()
    const answer = q.answer?.trim() || null

    if (normalizedQuestion.includes("gender")) {
      answers.gender = answer
    } else if (normalizedQuestion.includes("location") || normalizedQuestion.includes("from")) {
      answers.location = answer
    } else if (normalizedQuestion.includes("remark")) {
      answers.remarks = answer
    } else if (normalizedQuestion.includes("diet")) {
      answers.dietary = answer
    } else if (normalizedQuestion.includes("roommate") || normalizedQuestion.includes("room partner")) {
      answers.roommatePreference = answer
    }

    answers[normalizedQuestion] = answer
  }

  return answers
}

export function parseGenderFromTicketType(ticketTypeLabel: string | null): GenderType {
  if (!ticketTypeLabel) return "UNKNOWN"

  for (const { pattern, gender } of GENDER_PATTERNS) {
    if (pattern.test(ticketTypeLabel)) {
      return gender
    }
  }

  return "UNKNOWN"
}

export function parseGenderFromAnswer(answer: string | null | undefined): GenderType {
  if (!answer) {
    return "UNKNOWN"
  }

  for (const { pattern, gender } of GENDER_PATTERNS) {
    if (pattern.test(answer)) {
      return gender
    }
  }

  return "UNKNOWN"
}

export function parseAgeGroupFromTicketType(ticketTypeLabel: string | null): string | null {
  if (!ticketTypeLabel) return null

  for (const { pattern, age } of AGE_GROUP_PATTERNS) {
    if (pattern.test(ticketTypeLabel)) {
      return age
    }
  }

  return null
}

export function parseTicketCategory(ticketTypeLabel: string | null): string | null {
  if (!ticketTypeLabel) return null

  const normalized = ticketTypeLabel.toLowerCase()
  if (normalized.includes("vip")) return "VIP"
  if (normalized.includes("family") || normalized.includes("mixed")) return "Family"
  if (normalized.includes("adult") || normalized.includes("18+")) return "Adult"
  if (normalized.includes("teen") || normalized.includes("13-17")) return "Teen"
  if (normalized.includes("child") || normalized.includes("5-12")) return "Child"
  if (normalized.includes("infant") || normalized.includes("0-4")) return "Infant"
  if (normalized.includes("day")) return "DayPass"

  return "Standard"
}

export function detectPriorityFromAnswers(answers: CustomAnswers): {
  priority: AllocationPriority
  reason: string | null
} {
  const remarks = (answers.remarks || answers.dietary || "").toLowerCase()

  for (const { pattern, priority, reason } of PRIORITY_PATTERNS) {
    if (pattern.test(remarks)) {
      return { priority, reason }
    }
  }

  return { priority: "NORMAL", reason: null }
}

export function getAllUniqueQuestions(attendeePayloads: Array<{ rawPayload: unknown }>): string[] {
  const questionsSet = new Set<string>()

  for (const payload of attendeePayloads) {
    const raw = payload.rawPayload as Record<string, unknown>
    const customQuestions = raw.custom_questions as TicketTailorQuestion[] | undefined

    if (Array.isArray(customQuestions)) {
      for (const q of customQuestions) {
        questionsSet.add(q.question)
      }
    }
  }

  return Array.from(questionsSet).sort()
}

export function getAnswerByKey(answers: CustomAnswers, key: string): string | null {
  const normalizedKey = key.toLowerCase()
  return answers[normalizedKey] ?? answers[key] ?? null
}

export function wantsRoommate(answers: CustomAnswers): boolean {
  const preference = (answers.roommatePreference || answers.remarks || "").toLowerCase()
  
  if (preference.includes("no roommate") || preference.includes("don't need") || 
      preference.includes("single room") || preference.includes("not needed")) {
    return false
  }
  
  return preference.includes("yes") || preference.includes("prefer") || preference.includes("need") || 
         preference.includes("share room") || preference.includes("roommate")
}

export function needsAccessibleRoom(priority: AllocationPriority): boolean {
  return priority === "CRITICAL"
}

export function isFamilyTicket(genderType: GenderType): boolean {
  return genderType === "MIXED"
}
