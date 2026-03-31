import { useMemo, useState, useCallback } from "react"
import type { AttendeeDraft, SignupDraft } from "@/components/signup/state"

export type AttendeeValidationError = {
  field: keyof AttendeeDraft
  message: string
}

export type AttendeeFieldValidation = {
  attendeeKey: string
  errors: AttendeeValidationError[]
  isValid: boolean
}

export type AttendeeValidationSummary = {
  isValid: boolean
  byAttendee: Record<string, AttendeeValidationError[]>
}

export type BookerValidationErrors = {
  name?: string
  email?: string
  phone?: string
}

export type BookerFieldValidation = {
  errors: BookerValidationErrors
  isValid: boolean
}

function validateEmail(email: string): boolean {
  if (!email.trim()) return false
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

function validatePhone(phone: string): boolean {
  if (!phone.trim()) return false
  return phone.trim().length >= 7
}

function validateRequired(
  value: string,
  fieldName: string
): string | undefined {
  if (!value.trim()) {
    return `${fieldName} is required.`
  }
  return undefined
}

export function validateAttendee(
  attendee: AttendeeDraft
): AttendeeFieldValidation {
  const errors: AttendeeValidationError[] = []

  const phoneError = validateRequired(attendee.phone, "Phone")
  if (phoneError) errors.push({ field: "phone", message: phoneError })

  if (!attendee.gender) {
    errors.push({ field: "gender", message: "Gender is required." })
  }

  const locationError = validateRequired(attendee.location, "Location")
  if (locationError) errors.push({ field: "location", message: locationError })

  const dietaryError = validateRequired(
    attendee.dietaryRestrictions,
    "Dietary restrictions"
  )
  if (dietaryError)
    errors.push({ field: "dietaryRestrictions", message: dietaryError })

  const preferenceError = validateRequired(
    attendee.roommatePreference,
    "Roommate preference"
  )
  if (preferenceError)
    errors.push({ field: "roommatePreference", message: preferenceError })

  const avoidError = validateRequired(attendee.roommateAvoid, "Roommate avoid")
  if (avoidError) errors.push({ field: "roommateAvoid", message: avoidError })

  return {
    attendeeKey: attendee.attendeeKey,
    errors,
    isValid: errors.length === 0,
  }
}

export function validateAllAttendees(
  attendees: AttendeeDraft[]
): AttendeeValidationSummary {
  const byAttendee: Record<string, AttendeeValidationError[]> = {}
  let allValid = true

  for (const attendee of attendees) {
    const validation = validateAttendee(attendee)
    byAttendee[attendee.attendeeKey] = validation.errors
    if (!validation.isValid) {
      allValid = false
    }
  }

  return {
    isValid: allValid,
    byAttendee,
  }
}

export function validateBooker(
  booker: SignupDraft["booker"]
): BookerFieldValidation {
  const errors: BookerValidationErrors = {}

  const nameError = validateRequired(booker.name, "Name")
  if (nameError) errors.name = nameError

  if (!booker.email.trim()) {
    errors.email = "Email is required."
  } else if (!validateEmail(booker.email)) {
    errors.email = "Please enter a valid email address."
  }

  if (!booker.phone.trim()) {
    errors.phone = "Phone is required."
  } else if (!validatePhone(booker.phone)) {
    errors.phone = "Please enter a valid phone number."
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
  }
}

export function useSignupValidation(draft: SignupDraft | null) {
  const [touchedFields, setTouchedFields] = useState<
    Record<string, Set<string>>
  >({})

  const attendeeValidation = useMemo(() => {
    if (!draft) return { isValid: false, byAttendee: {} }
    return validateAllAttendees(draft.attendees)
  }, [draft?.attendees])

  const bookerValidation = useMemo(() => {
    if (!draft) return { errors: {}, isValid: false }
    return validateBooker(draft.booker)
  }, [draft?.booker])

  const markFieldTouched = useCallback((attendeeKey: string, field: string) => {
    setTouchedFields((prev) => {
      const prevForAttendee = prev[attendeeKey] || new Set()
      const next = new Set(prevForAttendee)
      next.add(field)
      return {
        ...prev,
        [attendeeKey]: next,
      }
    })
  }, [])

  const getFieldError = useCallback(
    (attendeeKey: string, field: keyof AttendeeDraft): string | undefined => {
      const touched = touchedFields[attendeeKey]?.has(field) ?? false
      if (!touched) return undefined

      const attendee = draft?.attendees.find(
        (a) => a.attendeeKey === attendeeKey
      )
      if (!attendee) return undefined

      const validation = validateAttendee(attendee)
      const error = validation.errors.find((e) => e.field === field)
      return error?.message
    },
    [touchedFields, draft?.attendees]
  )

  const getBookerFieldError = useCallback(
    (field: keyof SignupDraft["booker"]): string | undefined => {
      const touched = touchedFields["booker"]?.has(field) ?? false
      if (!touched) return undefined

      const validation = validateBooker(
        draft?.booker ?? { name: "", email: "", phone: "" }
      )
      return validation.errors[field]
    },
    [touchedFields, draft?.booker]
  )

  const markBookerFieldTouched = useCallback((field: string) => {
    setTouchedFields((prev) => {
      const prevForBooker = prev["booker"] || new Set()
      const next = new Set(prevForBooker)
      next.add(field)
      return {
        ...prev,
        booker: next,
      }
    })
  }, [])

  return {
    attendeeValidation,
    bookerValidation,
    markFieldTouched,
    markBookerFieldTouched,
    getFieldError,
    getBookerFieldError,
  }
}
