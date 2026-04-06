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
  onSubmit: () => void
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
  event,
  submitResult,
  submitError,
  isSubmitting,
  onSubmit,
  skipRooms = false,
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

  if (submitResult) {
    return null
  }

  return (
    <div className="space-y-4">
      <Card>
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
      {skipRooms ? (
        <ReviewSection
          title="Accommodation"
          subtitle="Will be assigned by organizer"
          badge={draft.attendees.length}
          defaultExpanded={true}
        >
          <div className="space-y-3">
            {draft.attendees.map((attendee, index) => {
              const ticket = event.tickets.find(
                (t) => t.ticketTypeId === attendee.ticketTypeId
              )
              const effectiveRoomTypeId =
                ticket?.roomTypeId ?? event.defaultRoomTypeId

              return (
                <div
                  key={attendee.attendeeKey}
                  className="flex items-center justify-between rounded-md border border-border/50 p-3"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {attendee.name || `Attendee ${index + 1}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {attendee.ticketLabel}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Room will be assigned by organizer
                  </span>
                </div>
              )
            })}
          </div>
        </ReviewSection>
      ) : (
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
                          <span className="text-foreground">
                            {occupant.name}
                          </span>
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
                    Some rooms have unfilled beds. You can go back to assign
                    more attendees or submit with unassigned beds.
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          )}
        </ReviewSection>
      )}

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
    </div>
  )
}
