import { api } from "@/lib/convex/api"
import { convexMutation } from "@/lib/convex/server"
import type {
  SignupSubmissionEnvelope,
  SignupSubmissionResult,
} from "@/lib/types/signup"

export class SignupSubmissionValidationError extends Error {
  readonly code = "INVALID_SUBMISSION"

  constructor(message: string) {
    super(message)
    this.name = "SignupSubmissionValidationError"
  }
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new SignupSubmissionValidationError(
      `Invalid '${fieldName}'. Expected a string.`
    )
  }

  const normalized = value.trim()
  if (!normalized) {
    throw new SignupSubmissionValidationError(
      `Invalid '${fieldName}'. Value is required.`
    )
  }

  return normalized
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value !== "string") {
    throw new SignupSubmissionValidationError("Expected optional text field")
  }

  const normalized = value.trim()
  return normalized ? normalized : undefined
}

function toObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SignupSubmissionValidationError(
      `Invalid '${fieldName}'. Expected an object.`
    )
  }

  return value as Record<string, unknown>
}

function toArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new SignupSubmissionValidationError(
      `Invalid '${fieldName}'. Expected an array.`
    )
  }

  return value
}

function hashString(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }

  return Math.abs(hash).toString(36)
}

function isSignupGender(
  value: string
): value is "male" | "female" | "mixed" | "unknown" {
  return (
    value === "male" ||
    value === "female" ||
    value === "mixed" ||
    value === "unknown"
  )
}

function normalizeEnvelope(
  input: unknown,
  options?: {
    idempotencyKey?: string
    honeypotSeen?: boolean
    payloadFingerprint?: string
  }
): SignupSubmissionEnvelope {
  const root = toObject(input, "submission")

  const sourceValue = normalizeRequiredString(root.source, "source")
  if (sourceValue !== "integration" && sourceValue !== "internal") {
    throw new SignupSubmissionValidationError(
      "Invalid 'source'. Expected 'integration' or 'internal'."
    )
  }
  const source: "integration" | "internal" = sourceValue

  const bookerRaw = toObject(root.booker, "booker")
  const attendeesRaw = toArray(root.attendees, "attendees")
  const ticketSelectionsRaw = toArray(root.ticketSelections, "ticketSelections")
  const assignmentsRaw = Array.isArray(root.assignments) ? root.assignments : []

  if (attendeesRaw.length === 0) {
    throw new SignupSubmissionValidationError(
      "Invalid 'attendees'. At least one attendee is required."
    )
  }

  if (ticketSelectionsRaw.length === 0) {
    throw new SignupSubmissionValidationError(
      "Invalid 'ticketSelections'. At least one ticket selection is required."
    )
  }

  const attendees = attendeesRaw.map((value, index) => {
    const attendee = toObject(value, `attendees[${index}]`)
    const genderRaw = normalizeRequiredString(
      attendee.gender,
      `attendees[${index}].gender`
    )

    if (!isSignupGender(genderRaw)) {
      throw new SignupSubmissionValidationError(
        `Invalid 'attendees[${index}].gender'.`
      )
    }
    const gender = genderRaw

    return {
      attendeeKey: normalizeRequiredString(
        attendee.attendeeKey,
        `attendees[${index}].attendeeKey`
      ),
      fullName: normalizeRequiredString(
        attendee.fullName,
        `attendees[${index}].fullName`
      ),
      email: normalizeRequiredString(
        attendee.email,
        `attendees[${index}].email`
      ),
      gender,
      location: normalizeRequiredString(
        attendee.location,
        `attendees[${index}].location`
      ),
      dietaryRestrictions: normalizeRequiredString(
        attendee.dietaryRestrictions,
        `attendees[${index}].dietaryRestrictions`
      ),
      roommatePreference: normalizeRequiredString(
        attendee.roommatePreference,
        `attendees[${index}].roommatePreference`
      ),
      roommateAvoid: normalizeRequiredString(
        attendee.roommateAvoid,
        `attendees[${index}].roommateAvoid`
      ),
      phone: normalizeRequiredString(
        attendee.phone,
        `attendees[${index}].phone`
      ),
    }
  })

  const ticketSelections = ticketSelectionsRaw.map((value, index) => {
    const selection = toObject(value, `ticketSelections[${index}]`)
    const quantity = Number(selection.quantity)

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new SignupSubmissionValidationError(
        `Invalid 'ticketSelections[${index}].quantity'.`
      )
    }

    return {
      ticketTypeId: normalizeRequiredString(
        selection.ticketTypeId,
        `ticketSelections[${index}].ticketTypeId`
      ),
      quantity,
      attendeeKey: normalizeOptionalString(selection.attendeeKey),
    }
  })

  const assignments = assignmentsRaw.map((value, index) => {
    const assignment = toObject(value, `assignments[${index}]`)

    return {
      attendeeKey: normalizeRequiredString(
        assignment.attendeeKey,
        `assignments[${index}].attendeeKey`
      ),
      slotId: normalizeRequiredString(
        assignment.slotId,
        `assignments[${index}].slotId`
      ),
    }
  })

  const deterministicPayload = {
    signupEventId: normalizeRequiredString(root.signupEventId, "signupEventId"),
    source,
    notes: normalizeOptionalString(root.notes),
    booker: {
      name: normalizeRequiredString(bookerRaw.name, "booker.name"),
      email: normalizeRequiredString(bookerRaw.email, "booker.email"),
      phone: normalizeOptionalString(bookerRaw.phone),
    },
    attendees,
    ticketSelections,
    assignments,
  }

  const payloadFingerprint =
    options?.payloadFingerprint ??
    hashString(JSON.stringify(deterministicPayload))

  return {
    ...deterministicPayload,
    idempotencyKey:
      options?.idempotencyKey ??
      `derived-${hashString(`${deterministicPayload.signupEventId}:${payloadFingerprint}`)}`,
    payloadFingerprint,
    honeypotSeen: Boolean(options?.honeypotSeen),
  }
}

export async function submitSignup(
  input: unknown,
  options?: {
    idempotencyKey?: string
    honeypotSeen?: boolean
    payloadFingerprint?: string
  }
): Promise<SignupSubmissionResult> {
  const envelope = normalizeEnvelope(input, options)

  const result = await convexMutation(
    api.signupSubmission.submitSignupEnvelope,
    {
      signupEventId: envelope.signupEventId,
      source: envelope.source,
      idempotencyKey: envelope.idempotencyKey,
      payloadFingerprint: envelope.payloadFingerprint,
      honeypotSeen: envelope.honeypotSeen,
      notes: envelope.notes,
      booker: envelope.booker,
      attendees: envelope.attendees,
      ticketSelections: envelope.ticketSelections,
      assignments: envelope.assignments,
    }
  )

  return {
    submissionId: result.submissionId,
    bookingRef: result.bookingRef,
    submittedAt: result.submittedAt,
  }
}
