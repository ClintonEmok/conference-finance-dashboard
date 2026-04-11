import { z } from "zod"
import { isValidPhoneNumber } from "react-phone-number-input"

import type { AttendeeDraft } from "@/components/signup/state"

export const signupBookerSchema = z.object({
  name: z.string().trim().min(1, "Full name is required"),
  email: z
    .string()
    .trim()
    .min(1, "Email address is required")
    .email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .refine((value) => isValidPhoneNumber(value), "Enter a valid phone number"),
})

export const signupAttendeeSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  gender: z.enum(["male", "female", "mixed", "unknown"]),
})

export type SignupBookerValidationSummary = {
  isValid: boolean
  errors: Partial<Record<"name" | "email" | "phone", string>>
}

export type SignupAttendeeValidationSummary = {
  isValid: boolean
  byAttendee: Record<string, string[]>
}

function collectFieldErrors(
  issues: z.ZodIssue[],
  allowedFields: readonly string[]
) {
  const errors: Record<string, string> = {}

  for (const issue of issues) {
    const field = issue.path[0]
    if (typeof field !== "string" || !allowedFields.includes(field)) {
      continue
    }

    if (errors[field]) {
      continue
    }

    errors[field] = issue.message
  }

  return errors
}

function collectInvalidAttendeeFields(issues: z.ZodIssue[]) {
  const fields = new Set<string>()

  for (const issue of issues) {
    const field = issue.path[0]
    if (typeof field === "string") {
      fields.add(field)
    }
  }

  return Array.from(fields)
}

export function validateSignupBooker(booker: {
  name: string
  email: string
  phone: string
}): SignupBookerValidationSummary {
  const result = signupBookerSchema.safeParse(booker)

  if (result.success) {
    return { isValid: true, errors: {} }
  }

  return {
    isValid: false,
    errors: collectFieldErrors(result.error.issues, ["name", "email", "phone"]),
  }
}

export function validateSignupAttendees(
  attendees: Pick<AttendeeDraft, "attendeeKey" | "name" | "gender">[]
): SignupAttendeeValidationSummary {
  const byAttendee: Record<string, string[]> = {}

  for (const attendee of attendees) {
    const result = signupAttendeeSchema.safeParse({
      name: attendee.name,
      gender: attendee.gender || "",
    })

    if (result.success) {
      byAttendee[attendee.attendeeKey] = []
      continue
    }

    byAttendee[attendee.attendeeKey] = collectInvalidAttendeeFields(
      result.error.issues
    )
  }

  return {
    isValid: Object.values(byAttendee).every((missing) => missing.length === 0),
    byAttendee,
  }
}
