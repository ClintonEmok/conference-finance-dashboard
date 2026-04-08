import type {
  SignupSubmissionEnvelope,
  SignupSubmissionRestorePayload,
  SignupSubmissionResult,
} from "@/lib/types/signup"
import type { SignupDraft } from "@/components/signup/state"

export type SignupClientErrorCode =
  | "INVALID_SUBMISSION"
  | "CAPACITY_EXCEEDED"
  | "TICKET_UNAVAILABLE"
  | "ASSIGNMENT_UNAVAILABLE"
  | "SUBMISSION_CONFLICT"
  | "RATE_LIMITED"
  | "HONEYPOT_TRIGGERED"
  | "SUBMISSION_FAILED"

export type SignupClientSubmitResult =
  | {
      ok: true
      data: SignupSubmissionResult
    }
  | {
      ok: false
      error: {
        code: SignupClientErrorCode
        message: string
      }
    }

export type SignupSubmissionBody = Omit<
  SignupSubmissionEnvelope,
  "idempotencyKey" | "payloadFingerprint" | "honeypotSeen"
>

export function buildSubmissionBodyFromDraft(
  draft: SignupDraft
): SignupSubmissionBody {
  return {
    eventId: draft.eventId,
    source: draft.source,
    notes: draft.notes || undefined,
    booker: {
      name: draft.booker.name.trim() || "Main booker",
      email: draft.booker.email.trim() || "booker@example.com",
      phone: draft.booker.phone.trim() || undefined,
    },
    attendees: draft.attendees.map((attendee) => ({
      attendeeKey: attendee.attendeeKey,
      name: attendee.name.trim() || `Attendee ${attendee.attendeeKey}`,
      email: attendee.email.trim() || undefined,
      phone: attendee.phone,
      gender: attendee.gender || "unknown",
      location: attendee.location,
      dietaryRestrictions: attendee.dietaryRestrictions,
      roommatePreference: attendee.roommatePreference,
    })),
    ticketSelections: draft.attendees.map((attendee) => ({
      attendeeKey: attendee.attendeeKey,
      ticketTypeId: attendee.ticketTypeId,
      quantity: 1 as const,
    })),
    assignments: draft.attendees
      .map((attendee) => ({
        attendeeKey: attendee.attendeeKey,
        slotId: draft.assignments[attendee.attendeeKey],
      }))
      .filter((assignment) => Boolean(assignment.slotId))
      .map((assignment) => ({
        attendeeKey: assignment.attendeeKey,
        slotId: String(assignment.slotId),
        assignmentIntent: "assign" as const,
      })),
  }
}

function mapKnownErrorCode(code: string): SignupClientErrorCode {
  if (code === "INVALID_SUBMISSION") return "INVALID_SUBMISSION"
  if (code === "CAPACITY_EXCEEDED") return "CAPACITY_EXCEEDED"
  if (code === "TICKET_UNAVAILABLE") return "TICKET_UNAVAILABLE"
  if (code === "ASSIGNMENT_UNAVAILABLE") return "ASSIGNMENT_UNAVAILABLE"
  if (code === "SUBMISSION_CONFLICT") return "SUBMISSION_CONFLICT"
  if (code === "RATE_LIMITED") return "RATE_LIMITED"
  if (code === "HONEYPOT_TRIGGERED") return "HONEYPOT_TRIGGERED"
  return "SUBMISSION_FAILED"
}

function isRestorePayload(
  value: unknown
): value is SignupSubmissionRestorePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  const record = value as Record<string, unknown>
  return (
    typeof record.eventId === "string" &&
    (record.source === "integration" || record.source === "internal") &&
    typeof record.booker === "object" &&
    Array.isArray(record.attendees) &&
    Array.isArray(record.ticketSelections) &&
    Array.isArray(record.assignments)
  )
}

function createIdempotencyKey() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID()
  }

  return `signup-${Date.now()}`
}

export async function submitSignupDraft(
  draft: SignupDraft,
  options?: { idempotencyKey?: string }
): Promise<SignupClientSubmitResult> {
  const body = buildSubmissionBodyFromDraft(draft)
  const idempotencyKey = options?.idempotencyKey ?? createIdempotencyKey()

  try {
    const response = await fetch("/api/signup/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(body),
    })

    const payload = (await response.json().catch(() => null)) as {
      data?: {
        submissionId?: string
        bookingRef?: string
        submittedAt?: string
        restorePayload?: unknown
      }
      error?: { code?: string; message?: string }
    } | null

    if (response.ok) {
      const data = payload?.data
      if (
        !data ||
        typeof data.submissionId !== "string" ||
        typeof data.bookingRef !== "string" ||
        typeof data.submittedAt !== "string"
      ) {
        return {
          ok: false,
          error: {
            code: "SUBMISSION_FAILED",
            message: "Unexpected submission response.",
          },
        }
      }

      return {
        ok: true,
        data: {
          submissionId: data.submissionId,
          bookingRef: data.bookingRef,
          submittedAt: data.submittedAt,
          ...(isRestorePayload(data.restorePayload)
            ? { restorePayload: data.restorePayload }
            : {}),
        },
      }
    }

    const code = mapKnownErrorCode(payload?.error?.code ?? "SUBMISSION_FAILED")

    return {
      ok: false,
      error: {
        code,
        message: payload?.error?.message ?? "Unable to submit signup.",
      },
    }
  } catch {
    return {
      ok: false,
      error: {
        code: "SUBMISSION_FAILED",
        message: "Network error while submitting signup.",
      },
    }
  }
}
