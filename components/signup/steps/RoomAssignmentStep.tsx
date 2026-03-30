"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  buildAssignmentBoard,
  canDropAttendeeIntoSlot,
  swapAttendeesInSlots,
  groupSlotsByRoomType,
  buildRoomPreview,
  summarizeUnfilledBeds,
  type RoomTypeGroup,
  type RoomPreview,
} from "@/components/signup/assignment"
import { AttendeeGrouping } from "@/components/signup/AttendeeGrouping"
import type { AttendeeDraft } from "@/components/signup/state"
import type { PublicSignupCatalogEvent } from "@/lib/domain/signup/catalog"

type RoomAssignmentStepProps = {
  event: PublicSignupCatalogEvent
  attendees: AttendeeDraft[]
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set()
  )

  const board = buildAssignmentBoard(
    attendees.map((attendee) => ({
      attendeeId: attendee.attendeeKey,
      name: attendee.name || `Attendee ${attendee.attendeeKey}`,
    })),
    event.accommodation.slots,
    assignments
  )

  const summary = summarizeUnfilledBeds(board)
  const roomTypeGroups = groupSlotsByRoomType(board)
  const roomPreview = buildRoomPreview(
    board,
    attendees.map((a) => ({ attendeeId: a.attendeeKey, name: a.name }))
  )

  function handleDrop(attendeeId: string, slotId: string) {
    // Try swap first
    const swapResult = swapAttendeesInSlots(attendeeId, slotId, board)
    if (swapResult) {
      onAssignmentChange(swapResult)
      return
    }

    // Fall back to regular assignment if swap not possible
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

  function toggleGroup(roomTypeLabel: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(roomTypeLabel)) {
        next.delete(roomTypeLabel)
      } else {
        next.add(roomTypeLabel)
      }
      return next
    })
  }

  const assignedAttendees = new Set(Object.keys(assignments))
  const unassignedAttendees = attendees.filter(
    (attendee) => !assignedAttendees.has(attendee.attendeeKey)
  )

  return (
    <div className="space-y-6">
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

      {/* Visual attendee grouping */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Group</CardTitle>
        </CardHeader>
        <CardContent>
          <AttendeeGrouping attendees={attendees} assignments={assignments} />
          <p className="mt-2 text-xs text-muted-foreground">
            Drag attendees together to form groups. This helps you organize room
            assignments.
          </p>
        </CardContent>
      </Card>

      {/* Real-time room preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Room Preview</CardTitle>
        </CardHeader>
        <CardContent>
          {roomPreview.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rooms available for this event.
            </p>
          ) : (
            <div className="space-y-3">
              {roomPreview.map((room) => (
                <div
                  key={room.roomLabel}
                  className="rounded-lg border border-border/70 p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{room.roomLabel}</p>
                    <Badge variant="outline">{room.roomTypeLabel}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {room.occupants.map((occupant) => (
                      <Badge key={occupant.attendeeId} className="text-xs">
                        {occupant.name}
                      </Badge>
                    ))}
                    {room.remainingBeds > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {room.remainingBeds} open bed
                        {room.remainingBeds > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unassigned attendees */}
      {unassignedAttendees.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Unassigned Attendees ({unassignedAttendees.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {unassignedAttendees.map((attendee) => (
                <div
                  key={attendee.attendeeKey}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", attendee.attendeeKey)
                  }}
                  className="cursor-move rounded-full border border-border/70 bg-background px-3 py-1 text-sm hover:border-primary/50"
                >
                  <span className="font-medium">
                    {attendee.name || `Attendee ${attendee.attendeeKey}`}
                  </span>
                  {attendee.gender && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({attendee.gender})
                    </span>
                  )}
                  {attendee.location && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      from {attendee.location}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bedslots grouped by room type */}
      <div className="space-y-4">
        {roomTypeGroups.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No assignable beds available for this event.
            </CardContent>
          </Card>
        ) : (
          roomTypeGroups.map((group) => (
            <RoomTypeGroupCard
              key={group.roomTypeLabel}
              group={group}
              expanded={expandedGroups.has(group.roomTypeLabel)}
              onToggle={() => toggleGroup(group.roomTypeLabel)}
              onDrop={handleDrop}
              onClear={clearSlot}
              assignments={assignments}
              board={board}
              attendees={attendees}
            />
          ))
        )}
      </div>

      {/* Summary */}
      <p className="text-sm text-muted-foreground">
        Beds: {summary.filledBeds}/{summary.totalBeds} assigned
      </p>
    </div>
  )
}

function RoomTypeGroupCard({
  group,
  expanded,
  onToggle,
  onDrop,
  onClear,
  assignments,
  board,
  attendees,
}: {
  group: RoomTypeGroup
  expanded: boolean
  onToggle: () => void
  onDrop: (attendeeId: string, slotId: string) => void
  onClear: (slotId: string) => void
  assignments: Record<string, string>
  board: { slots: Array<{ slotId: string; attendeeId: string | null }> }
  attendees: AttendeeDraft[]
}) {
  const attendeeMap = new Map(attendees.map((a) => [a.attendeeKey, a]))

  return (
    <Card>
      <CardHeader
        className="cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {group.roomTypeLabel} — {group.filledBeds}/{group.totalBeds} beds
            filled
          </CardTitle>
          <Button variant="ghost" size="sm">
            {expanded ? "Collapse" : "Expand"}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-2">
          {group.slots.map((slot) => {
            const assignedAttendee = slot.attendeeId
              ? attendeeMap.get(slot.attendeeId)
              : null

            return (
              <div
                key={slot.slotId}
                className="rounded-lg border border-border/70 p-3"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  const attendeeId = event.dataTransfer.getData("text/plain")
                  onDrop(attendeeId, slot.slotId)
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{slot.roomLabel}</p>
                    {assignedAttendee?.gender && (
                      <span className="text-xs text-muted-foreground">
                        ({assignedAttendee.gender})
                      </span>
                    )}
                  </div>
                  {assignedAttendee ? (
                    <div className="flex items-center gap-2">
                      <Badge>
                        {assignedAttendee.name ||
                          `Attendee ${assignedAttendee.attendeeKey}`}
                      </Badge>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onClear(slot.slotId)}
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
      )}
    </Card>
  )
}
