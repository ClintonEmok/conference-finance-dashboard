"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { SignupDraft, AttendeeDraft } from "@/components/signup/state"
import type { SignupClientErrorCode } from "@/components/signup/submission-client"
import type { SignupSubmissionResult } from "@/lib/types/signup"
import { ReviewSection } from "@/components/signup/ReviewSection"
import { TurnstileCaptcha } from "@/components/signup/TurnstileCaptcha"
import { formatMoney } from "@/lib/format"

type ReviewSubmitStepProps = {
  draft: SignupDraft
  submitResult: SignupSubmissionResult | null
  submitError: { code: SignupClientErrorCode; message: string } | null
  isSubmitting: boolean
  captchaToken: string | null
  onCaptchaTokenChange: (token: string | null) => void
  skipRooms?: boolean
}

function formatAttendeeGender(gender: string): string {
  if (gender === "male") return "Male"
  if (gender === "female") return "Female"
  return gender || "Not specified"
}

function AttendeeDetailRow({
  label,
  value,
  isEmpty,
}: {
  label: string
  value: string
  isEmpty?: boolean
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 py-1">
      <span className="text-muted-foreground">{label}:</span>
      <span className={isEmpty ? "text-muted-foreground/70 italic" : ""}>
        {value || "-"}
      </span>
    </div>
  )
}

export function ReviewSubmitStep({
  draft,
  submitResult,
  submitError,
  isSubmitting,
  captchaToken,
  onCaptchaTokenChange,
  skipRooms = false,
}: ReviewSubmitStepProps) {
  const totalPrice = useMemo(() => {
    return draft.ticketSelections.reduce((sum, ticket) => {
      return sum + ticket.priceMinor * ticket.quantity
    }, 0)
  }, [draft.ticketSelections])

  const showAccommodationPreferences = draft.attendees.length > 1

  if (submitResult) {
    return null
  }

  return (
    <div className="space-y-4">
      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="text-base">Buyer Details</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <AttendeeDetailRow
            label="Name"
            value={draft.booker.name}
            isEmpty={!draft.booker.name}
          />
          <AttendeeDetailRow
            label="Email"
            value={draft.booker.email}
            isEmpty={!draft.booker.email}
          />
          <AttendeeDetailRow
            label="Phone"
            value={draft.booker.phone}
            isEmpty={!draft.booker.phone}
          />
        </CardContent>
      </Card>

      {/* Tickets Section */}
      <ReviewSection
        title="Tickets"
        subtitle={`Total: ${formatMoney(totalPrice)}`}
        badge={draft.ticketSelections.reduce((sum, t) => sum + t.quantity, 0)}
        defaultExpanded={true}
      >
        {draft.ticketSelections.length === 0 ? (
          <p className="text-muted-foreground">No tickets selected.</p>
        ) : (
          <div className="space-y-2">
            {draft.ticketSelections
              .filter((ticket) => ticket.quantity > 0)
              .map((ticket) => (
                <div
                  key={ticket.ticketTypeId}
                  className="flex items-center justify-between rounded-md border border-border/50 p-3"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {ticket.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(ticket.priceMinor)} each
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-foreground">
                      × {ticket.quantity}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(ticket.priceMinor * ticket.quantity)}
                    </p>
                  </div>
                </div>
              ))}
            <div className="flex items-center justify-between border-t border-border/50 pt-3">
              <span className="font-medium text-foreground">Total</span>
              <span className="font-semibold text-foreground">
                {formatMoney(totalPrice)}
              </span>
            </div>
          </div>
        )}
      </ReviewSection>

      {/* Attendee Details Section */}
      <ReviewSection
        title="Attendee Details"
        badge={draft.attendees.length}
        defaultExpanded={false}
      >
        {draft.attendees.length === 0 ? (
          <p className="text-muted-foreground">No attendees added.</p>
        ) : (
          <div className="space-y-4">
            {draft.attendees.map((attendee, index) => (
              <div
                key={attendee.attendeeKey}
                className="rounded-md border border-border/50 p-3"
              >
                <p className="mb-2 font-medium text-foreground">
                  Attendee {index + 1}: {attendee.name || "Unnamed"}
                </p>
                <div className="space-y-0.5 text-sm">
                  <AttendeeDetailRow
                    label="Ticket"
                    value={attendee.ticketLabel}
                  />
                  <AttendeeDetailRow
                    label="Email"
                    value={attendee.email}
                    isEmpty={!attendee.email}
                  />
                  <AttendeeDetailRow
                    label="Phone"
                    value={attendee.phone}
                    isEmpty={!attendee.phone}
                  />
                  <AttendeeDetailRow
                    label="Gender"
                    value={formatAttendeeGender(attendee.gender)}
                    isEmpty={!attendee.gender}
                  />
                  <AttendeeDetailRow
                    label="Location"
                    value={attendee.location}
                    isEmpty={!attendee.location}
                  />
                  <AttendeeDetailRow
                    label="Dietary"
                    value={attendee.dietaryRestrictions}
                    isEmpty={!attendee.dietaryRestrictions}
                  />
                  <AttendeeDetailRow
                    label="Roommate pref"
                    value={attendee.roommatePreference}
                    isEmpty={!attendee.roommatePreference}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </ReviewSection>

      {showAccommodationPreferences ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Accommodation Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Room preferences have been captured for {draft.attendees.length}{" "}
              attendees.
            </p>
            <p>
              Final room allocation will be completed by the organizer after
              submission.
            </p>
          </CardContent>
        </Card>
      ) : null}

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Verification</CardTitle>
        </CardHeader>
        <CardContent>
          <TurnstileCaptcha
            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
            token={captchaToken}
            onTokenChange={onCaptchaTokenChange}
          />
        </CardContent>
      </Card>

      {submitError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-medium">{submitError.code}</p>
          <p>{submitError.message}</p>
        </div>
      ) : null}
    </div>
  )
}
