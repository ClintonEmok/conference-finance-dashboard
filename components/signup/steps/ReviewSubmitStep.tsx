"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { SignupDraft } from "@/components/signup/state"
import type { SignupClientErrorCode } from "@/components/signup/submission-client"
import type { SignupSubmissionResult } from "@/lib/types/signup"

type ReviewSubmitStepProps = {
  draft: SignupDraft
  submitResult: SignupSubmissionResult | null
  submitError: { code: SignupClientErrorCode; message: string } | null
  isSubmitting: boolean
  restorePayloadChoicePending: boolean
  onSubmit: () => void
  onContinuePreviousSubmission: () => void
  onEditCurrentDetails: () => void
}

export function ReviewSubmitStep({
  draft,
  submitResult,
  submitError,
  isSubmitting,
  restorePayloadChoicePending,
  onSubmit,
  onContinuePreviousSubmission,
  onEditCurrentDetails,
}: ReviewSubmitStepProps) {
  if (submitResult && !restorePayloadChoicePending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Signup submitted</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Booking reference:{" "}
            <strong className="text-foreground">
              {submitResult.bookingRef}
            </strong>
          </p>
          <p>
            Submitted at:{" "}
            <strong className="text-foreground">
              {submitResult.submittedAt}
            </strong>
          </p>
          <p>
            Submission includes{" "}
            <strong className="text-foreground">
              {draft.attendees.length}
            </strong>{" "}
            attendee(s).
          </p>
          <p>
            Next step: keep your booking reference for any follow-up updates.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Booker</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>Name: {draft.booker.name || "Main booker"}</p>
          <p>Email: {draft.booker.email || "booker@example.com"}</p>
          <p>Phone: {draft.booker.phone || "-"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tickets and attendees</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>Selected attendees: {draft.attendees.length}</p>
          <p>Assigned beds: {Object.keys(draft.assignments).length}</p>
          <ul className="list-disc pl-5">
            {draft.attendees.map((attendee) => (
              <li key={attendee.attendeeKey}>
                {attendee.name || attendee.attendeeKey} - {attendee.ticketLabel}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {draft.notes.trim() ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {draft.notes}
          </CardContent>
        </Card>
      ) : null}

      {submitError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-medium">{submitError.code}</p>
          <p>{submitError.message}</p>
        </div>
      ) : null}

      {restorePayloadChoicePending ? (
        <div className="rounded-lg border border-border/70 p-3 text-sm">
          <p className="font-medium">
            A previous submission was restored for this draft.
          </p>
          <p className="mt-1 text-muted-foreground">
            Choose whether to continue the previous submission or edit current
            details.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onContinuePreviousSubmission}
            >
              Continue previous submission
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onEditCurrentDetails}
            >
              Edit current details
            </Button>
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        onClick={onSubmit}
        disabled={isSubmitting || restorePayloadChoicePending}
      >
        {isSubmitting ? "Submitting..." : "Submit signup"}
      </Button>
    </div>
  )
}
