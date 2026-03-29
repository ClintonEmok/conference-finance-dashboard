"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  buildAssignmentBoard,
  canDropAttendeeIntoSlot,
  getAssignableSlotTargets,
  summarizeUnfilledBeds,
} from "@/components/signup/assignment"
import type { PublicSignupCatalogEvent } from "@/lib/domain/signup/catalog"

type RoomAssignmentStepProps = {
  event: PublicSignupCatalogEvent
  attendees: Array<{ attendeeKey: string; name: string }>
  assignments: Record<string, string>
  acknowledgeRandomFill: boolean
  onAssignmentChange: (nextAssignments: Record<string, string>) => void
  onAcknowledgeRandomFillChange: (checked: boolean) => void
}

export function RoomAssignmentStep({
  event,
  attendees,
  assignments,
  acknowledgeRandomFill,
  onAssignmentChange,
  onAcknowledgeRandomFillChange,
}: RoomAssignmentStepProps) {
  const assignableTargets = getAssignableSlotTargets(event)
  const board = buildAssignmentBoard(
    attendees.map((attendee) => ({
      attendeeId: attendee.attendeeKey,
      name: attendee.name || `Attendee ${attendee.attendeeKey}`,
    })),
    event.accommodation.slots,
    assignments
  )
  const summary = summarizeUnfilledBeds(board)

  function handleDrop(attendeeId: string, slotId: string) {
    if (!canDropAttendeeIntoSlot(attendeeId, slotId, board)) {
      return
    }

    onAssignmentChange({
      ...assignments,
      [attendeeId]: slotId,
    })
  }

  function clearSlot(slotId: string) {
    const nextAssignments = Object.fromEntries(
      Object.entries(assignments).filter(([, value]) => value !== slotId)
    )
    onAssignmentChange(nextAssignments)
  }

  return (
    <div className="space-y-4">
      {summary.unfilledBeds > 0 ? (
        <div className="rounded-lg border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-medium">
            Open beds may be random-filled by another attendee.
          </p>
          <label className="mt-2 flex items-start gap-2">
            <input
              type="checkbox"
              checked={acknowledgeRandomFill}
              onChange={(event) =>
                onAcknowledgeRandomFillChange(event.currentTarget.checked)
              }
              className="mt-0.5"
            />
            <span>I acknowledge that open beds may be random-filled.</span>
          </label>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attendees</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {board.attendees.map((attendee) => (
              <button
                key={attendee.attendeeId}
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", attendee.attendeeId)
                }}
                className="rounded-full border border-border/70 px-3 py-1 text-xs"
              >
                {attendee.name}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assignable bed slots</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {assignableTargets.map((slot) => {
            const assignedAttendee = board.slots.find(
              (boardSlot) => boardSlot.slotId === slot.slotId
            )

            return (
              <div
                key={slot.slotId}
                className="rounded-lg border border-border/70 p-3"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  const attendeeId = event.dataTransfer.getData("text/plain")
                  handleDrop(attendeeId, slot.slotId)
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {slot.roomLabel} - {slot.roomTypeLabel}
                  </p>
                  {assignedAttendee?.attendeeId ? (
                    <div className="flex items-center gap-2">
                      <Badge>{assignedAttendee.attendeeId}</Badge>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => clearSlot(slot.slotId)}
                      >
                        Unassign
                      </Button>
                    </div>
                  ) : (
                    <Badge variant="outline">Open bed</Badge>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {event.accommodation.slots.some((slot) => !slot.assignable) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Non-assignable slots</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {event.accommodation.slots
              .filter((slot) => !slot.assignable)
              .map((slot) => (
                <p key={slot.slotId}>
                  {slot.roomLabel} - {slot.roomTypeLabel} (informational only)
                </p>
              ))}
          </CardContent>
        </Card>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Beds: {summary.filledBeds}/{summary.totalBeds} assigned
      </p>
    </div>
  )
}
