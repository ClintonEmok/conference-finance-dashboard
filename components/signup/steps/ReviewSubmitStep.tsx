"use client"

import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { SignupDraft, AttendeeDraft } from "@/components/signup/state"
import type { SignupClientErrorCode } from "@/components/signup/submission-client"
import type { SignupSubmissionResult } from "@/lib/types/signup"
import type { PublicSignupCatalogEvent } from "@/lib/domain/signup/catalog"
import { ReviewSection } from "@/components/signup/ReviewSection"
import {
  buildAllocationSummary,
  buildAssignmentBoard,
  type AllocationSummary,
} from "@/components/signup/assignment"
import { formatMoney } from "@/lib/format"
import { AlertCircle } from "lucide-react"

type ReviewSubmitStepProps = {
  draft: SignupDraft
  event: PublicSignupCatalogEvent
  submitResult: SignupSubmissionResult | null
  submitError: { code: SignupClientErrorCode; message: string } | null
  isSubmitting: boolean
  restorePayloadChoicePending: boolean
  onSubmit: () => void
  onContinuePreviousSubmission: () => void
  onEditCurrentDetails: () => void
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
  event,
  submitResult,
  submitError,
  isSubmitting,
  restorePayloadChoicePending,
  onSubmit,
  onContinuePreviousSubmission,
  onEditCurrentDetails,
}: ReviewSubmitStepProps) {
  const allocationSummary = useMemo<AllocationSummary>(() => {
    const board = buildAssignmentBoard(
      draft.attendees.map((attendee) => ({
        attendeeId: attendee.attendeeKey,
        name: attendee.name || `Attendee ${attendee.attendeeKey}`,
      })),
      event.accommodation.slots,
      draft.assignments
    )
    return buildAllocationSummary(
      board,
      draft.attendees,
      event.accommodation.slots
    )
  }, [draft.attendees, draft.assignments, event.accommodation.slots])

  const totalPrice = useMemo(() => {
    return draft.ticketSelections.reduce((sum, ticket) => {
      return sum + ticket.priceMinor * ticket.quantity
    }, 0)
  }, [draft.ticketSelections])

  const hasUnfilledBeds = allocationSummary.rooms.some(
    (room) => room.unfilledBeds > 0
  )

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
                  <AttendeeDetailRow
                    label="Avoid"
                    value={attendee.roommateAvoid}
                    isEmpty={!attendee.roommateAvoid}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </ReviewSection>

      {/* Room Allocations Section */}
      <ReviewSection
        title="Room Allocations"
        subtitle={
          allocationSummary.unassignedAttendees.length > 0
            ? `${allocationSummary.unassignedAttendees.length} unassigned`
            : undefined
        }
        badge={
          allocationSummary.rooms.filter((r) => r.occupants.length > 0).length
        }
        defaultExpanded={true}
      >
        {allocationSummary.rooms.length === 0 ? (
          <p className="text-muted-foreground">No accommodation available.</p>
        ) : (
          <div className="space-y-3">
            {allocationSummary.rooms
              .filter((room) => room.occupants.length > 0)
              .map((room) => (
                <div
                  key={room.roomLabel}
                  className="rounded-md border border-border/50 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">
                        {room.roomLabel}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {room.roomTypeLabel}
                      </p>
                    </div>
                    {room.unfilledBeds > 0 ? (
                      <span className="text-xs font-medium text-amber-600">
                        {room.unfilledBeds} unfilled bed
                        {room.unfilledBeds !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-green-600">
                        Full
                      </span>
                    )}
                  </div>
                  <ul className="list-disc space-y-1 pl-4 text-sm">
                    {room.occupants.map((occupant) => (
                      <li key={occupant.attendeeKey}>
                        <span className="text-foreground">{occupant.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          ({occupant.ticketLabel}
                          {occupant.location ? `, ${occupant.location}` : ""}
                          {occupant.gender
                            ? `, ${formatAttendeeGender(occupant.gender)}`
                            : ""}
                          )
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

            {allocationSummary.unassignedAttendees.length > 0 ? (
              <Alert
                variant="destructive"
                className="border-amber-500/50 bg-amber-500/10"
              >
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800">
                  Unassigned Attendees (
                  {allocationSummary.unassignedAttendees.length})
                </AlertTitle>
                <AlertDescription className="text-amber-700">
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {allocationSummary.unassignedAttendees.map((attendee) => (
                      <li key={attendee.attendeeKey}>
                        {attendee.name} ({attendee.ticketLabel})
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}

            {hasUnfilledBeds &&
            allocationSummary.unassignedAttendees.length === 0 ? (
              <Alert className="border-amber-500/50 bg-amber-500/10">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800">
                  Unfilled Beds
                </AlertTitle>
                <AlertDescription className="text-amber-700">
                  Some rooms have unfilled beds. You can go back to assign more
                  attendees or submit with unassigned beds.
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}
      </ReviewSection>

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
