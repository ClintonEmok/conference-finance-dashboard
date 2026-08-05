import { api } from "@/lib/convex/api"
import { convexMutation } from "@/lib/convex/server"
import type { Id } from "@/convex/_generated/dataModel"
import type {
  SignupAccommodationOccupancy,
  SignupAgeBandCode,
  SignupGender,
  SignupSource,
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

function isSignupSource(value: string): value is SignupSource {
  return value === "integration" || value === "internal"
}

function isSignupGender(value: string): value is SignupGender {
  return (
    value === "male" ||
    value === "female" ||
    value === "mixed" ||
    value === "unknown"
  )
}

function isSignupAccommodationOccupancy(
  value: string
): value is SignupAccommodationOccupancy {
  return value === "single" || value === "shared" || value === "family"
}

function isSignupAgeBandCode(value: string): boolean {
  return (
    value === "under_3" ||
    value === "3_11" ||
    value === "12_17" ||
    value === "18_plus"
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
  if (!isSignupSource(sourceValue)) {
    throw new SignupSubmissionValidationError(
      "Invalid 'source'. Expected 'integration' or 'internal'."
    )
  }

  const bookerRaw = toObject(root.booker, "booker")
  const attendeesRaw = toArray(root.attendees, "attendees")
  const ticketSelectionsRaw = toArray(root.ticketSelections, "ticketSelections")
  const assignmentsRaw = Array.isArray(root.assignments) ? root.assignments : []
  const accommodationSelectionsRaw = Array.isArray(
    root.accommodationSelections
  )
    ? root.accommodationSelections
    : []

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
    const genderValue = normalizeRequiredString(
      attendee.gender,
      `attendees[${index}].gender`
    )
    if (!isSignupGender(genderValue)) {
      throw new SignupSubmissionValidationError(
        `Invalid 'attendees[${index}].gender'.`
      )
    }

    return {
      attendeeKey: normalizeRequiredString(
        attendee.attendeeKey,
        `attendees[${index}].attendeeKey`
      ),
      name: normalizeRequiredString(attendee.name, `attendees[${index}].name`),
      email: normalizeOptionalString(attendee.email),
      phone: normalizeOptionalString(attendee.phone),
      gender: genderValue,
      location: normalizeOptionalString(attendee.location),
      dietaryRestrictions: normalizeOptionalString(
        attendee.dietaryRestrictions
      ),
      roommatePreference: normalizeOptionalString(attendee.roommatePreference),
      roommateAvoid: normalizeOptionalString(attendee.roommateAvoid),
    }
  })

  const ticketSelections = ticketSelectionsRaw.map((value, index) => {
    const selection = toObject(value, `ticketSelections[${index}]`)
    const quantity = Number(selection.quantity)

    if (quantity !== 1) {
      throw new SignupSubmissionValidationError(
        `Invalid 'ticketSelections[${index}].quantity'. Expected 1.`
      )
    }

    return {
      attendeeKey: normalizeRequiredString(
        selection.attendeeKey,
        `ticketSelections[${index}].attendeeKey`
      ),
      ticketTypeId: normalizeRequiredString(
        selection.ticketTypeId,
        `ticketSelections[${index}].ticketTypeId`
      ),
      quantity: 1 as const,
    }
  })

  const assignments = assignmentsRaw.map((value, index) => {
    const assignment = toObject(value, `assignments[${index}]`)
    const assignmentIntent = normalizeRequiredString(
      assignment.assignmentIntent,
      `assignments[${index}].assignmentIntent`
    )

    if (assignmentIntent !== "assign" && assignmentIntent !== "skip") {
      throw new SignupSubmissionValidationError(
        `Invalid 'assignments[${index}].assignmentIntent'.`
      )
    }

    return {
      attendeeKey: normalizeRequiredString(
        assignment.attendeeKey,
        `assignments[${index}].attendeeKey`
      ),
      slotId: normalizeRequiredString(
        assignment.slotId,
        `assignments[${index}].slotId`
      ),
      assignmentIntent: assignmentIntent as "assign" | "skip",
    }
  })

  const accommodationSelections = accommodationSelectionsRaw.map(
    (value, index) => {
      const preference = toObject(value, `accommodationSelections[${index}]`)
      const occupancy = normalizeRequiredString(
        preference.occupancy,
        `accommodationSelections[${index}].occupancy`
      )
      if (!isSignupAccommodationOccupancy(occupancy)) {
        throw new SignupSubmissionValidationError(
          `Invalid 'accommodationSelections[${index}].occupancy'.`
        )
      }

      const ageBandCode = normalizeOptionalString(preference.ageBandCode)
      if (ageBandCode !== undefined && !isSignupAgeBandCode(ageBandCode)) {
        throw new SignupSubmissionValidationError(
          `Invalid 'accommodationSelections[${index}].ageBandCode'.`
        )
      }

      return {
        attendeeKey: normalizeRequiredString(
          preference.attendeeKey,
          `accommodationSelections[${index}].attendeeKey`
        ),
        categoryId: normalizeRequiredString(
          preference.categoryId,
          `accommodationSelections[${index}].categoryId`
        ),
        occupancy: occupancy as SignupAccommodationOccupancy,
        upgradeSelected: Boolean(preference.upgradeSelected),
        cotSelected: Boolean(preference.cotSelected),
        ageBandCode: ageBandCode as SignupAgeBandCode | undefined,
      }
    }
  )

  const deterministicPayload = {
    eventId: normalizeRequiredString(root.eventId, "eventId"),
    source: sourceValue,
    notes: normalizeOptionalString(root.notes),
    booker: {
      name: normalizeRequiredString(bookerRaw.name, "booker.name"),
      email: normalizeRequiredString(bookerRaw.email, "booker.email"),
      phone: normalizeOptionalString(bookerRaw.phone),
    },
    attendees,
    ticketSelections,
    assignments,
    accommodationSelections,
  }

  const payloadFingerprint =
    options?.payloadFingerprint ??
    hashString(JSON.stringify(deterministicPayload))

  return {
    ...deterministicPayload,
    idempotencyKey:
      options?.idempotencyKey ??
      `derived-${hashString(`${deterministicPayload.eventId}:${payloadFingerprint}`)}`,
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
      eventId: envelope.eventId as Id<"events">,
      source: envelope.source,
      idempotencyKey: envelope.idempotencyKey,
      payloadFingerprint: envelope.payloadFingerprint,
      honeypotSeen: envelope.honeypotSeen,
      notes: envelope.notes,
      booker: envelope.booker,
      attendees: envelope.attendees,
      ticketSelections: envelope.ticketSelections.map((selection) => ({
        attendeeKey: selection.attendeeKey,
        ticketTypeId: selection.ticketTypeId as Id<"ticketTypes">,
        quantity: 1,
      })),
      assignments: envelope.assignments.map((assignment) => ({
        attendeeKey: assignment.attendeeKey,
        slotId: assignment.slotId as Id<"accommodationSlots">,
        assignmentIntent: assignment.assignmentIntent,
      })),
      accommodationSelections: envelope.accommodationSelections.map(
        (preference) => ({
          attendeeKey: preference.attendeeKey,
          categoryId: preference.categoryId as Id<"accommodationCategories">,
          occupancy: preference.occupancy,
          upgradeSelected: preference.upgradeSelected,
          cotSelected: preference.cotSelected,
          ageBandCode: preference.ageBandCode,
        })
      ),
    }
  )

  return {
    submissionId: String(result.submissionId),
    bookingRef: result.bookingRef ?? "",
    submittedAt: String(result.submittedAt ?? Date.now()),
    restorePayload: result.restorePayload
      ? {
          eventId: String(result.restorePayload.eventId),
          source: result.restorePayload.source ?? "internal",
          notes: result.restorePayload.notes,
          booker: {
            name: result.restorePayload.booker?.name ?? "",
            email: result.restorePayload.booker?.email ?? "",
            phone: result.restorePayload.booker?.phone,
          },
          attendees: result.restorePayload.attendees,
          ticketSelections: result.restorePayload.ticketSelections.map(
            (selection) => ({
              attendeeKey: selection.attendeeKey,
              ticketTypeId: String(selection.ticketTypeId),
              quantity: 1 as const,
            })
          ),
          assignments: result.restorePayload.assignments.map((assignment) => ({
            attendeeKey: assignment.attendeeKey,
            slotId: String(assignment.slotId),
            assignmentIntent: assignment.assignmentIntent,
          })),
          accommodationSelections: result.restorePayload.accommodationSelections
            .map((preference) => ({
              attendeeKey: preference.attendeeKey,
              categoryId: String(preference.categoryId),
              occupancy: preference.occupancy,
              upgradeSelected: preference.upgradeSelected,
              cotSelected: preference.cotSelected,
              ageBandCode: preference.ageBandCode,
            }))
            .filter(
              (preference): preference is NonNullable<typeof preference> =>
                preference !== null
            ),
        }
      : undefined,
  }
}
