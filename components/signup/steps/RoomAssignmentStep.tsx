"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  buildDraggableRooms,
  buildAssignmentBoard,
  canDropAttendeeIntoSlot,
  swapAttendeesInSlots,
  summarizeUnfilledBeds,
  type DraggableRoom,
} from "@/components/signup/assignment"
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
  const [draggingAttendeeId, setDraggingAttendeeId] = useState<string | null>(
    null
  )

  const currentAttendeeIds = new Set(attendees.map((a) => a.attendeeKey))

  const board = buildAssignmentBoard(
    attendees.map((attendee) => ({
      attendeeId: attendee.attendeeKey,
      name: attendee.name || `Attendee ${attendee.attendeeKey}`,
    })),
    event.accommodation.slots,
    assignments
  )

  const summary = summarizeUnfilledBeds(board)
  const draggableRooms = buildDraggableRooms(board, currentAttendeeIds)

  const assignedAttendees = new Set(Object.keys(assignments))
  const unassignedAttendees = attendees.filter(
    (attendee) => !assignedAttendees.has(attendee.attendeeKey)
  )

  function handleDragStart(
    e: React.DragEvent<HTMLDivElement>,
    attendeeId: string
  ) {
    setDraggingAttendeeId(attendeeId)
    e.dataTransfer.setData("text/plain", attendeeId)
    e.dataTransfer.effectAllowed = "move"
  }

  function handleDragEnd() {
    setDraggingAttendeeId(null)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, slotId: string) {
    e.preventDefault()
    const attendeeId = e.dataTransfer.getData("text/plain")
    if (!attendeeId) return

    const swapResult = swapAttendeesInSlots(attendeeId, slotId, board)
    if (swapResult) {
      onAssignmentChange(swapResult)
      return
    }

    if (!canDropAttendeeIntoSlot(attendeeId, slotId, board)) {
      return
    }

    onAssignmentChange({
      ...assignments,
      [attendeeId]: slotId,
    })
    setDraggingAttendeeId(null)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }

  function clearSlot(slotId: string) {
    const nextAssignments = Object.fromEntries(
      Object.entries(assignments).filter(([, value]) => value !== slotId)
    )
    onAssignmentChange(nextAssignments)
  }

  const attendeeMap = new Map(attendees.map((a) => [a.attendeeKey, a]))

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

      {attendees.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Attendees</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {attendees.map((attendee) => {
                const isAssigned = assignedAttendees.has(attendee.attendeeKey)
                return (
                  <div
                    key={attendee.attendeeKey}
                    draggable={!isAssigned}
                    onDragStart={(e) =>
                      handleDragStart(e, attendee.attendeeKey)
                    }
                    onDragEnd={handleDragEnd}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-all ${isAssigned
                        ? "cursor-default border-muted-foreground/20 bg-muted text-muted-foreground"
                        : draggingAttendeeId === attendee.attendeeKey
                          ? "cursor-move border-primary/50 bg-primary/10"
                          : "cursor-move border-border/70 bg-background hover:border-primary/50"
                      }`}
                  >
                    <span className="font-medium">
                      {attendee.name || "Unnamed"}
                    </span>
                    {attendee.gender && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({attendee.gender})
                      </span>
                    )}
                    {isAssigned && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ✓ assigned
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Drag unassigned attendees to a room below.
            </p>
          </CardContent>
        </Card>
      )}

      {draggableRooms.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No rooms available for assignment.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {draggableRooms.map((room) => (
            <div
              key={room.roomId}
              className={`rounded-lg border-2 border-dashed p-4 transition-colors ${room.isEmpty
                  ? "border-muted-foreground/30 bg-muted/20"
                  : "border-primary/30 bg-primary/5"
                }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`h-3 w-3 rounded-full ${room.isEmpty ? "bg-muted-foreground/40" : "bg-primary"
                      }`}
                  />
                  <span className="text-sm font-medium">
                    {room.roomTypeLabel}
                  </span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {room.filledBeds}/{room.totalBeds} beds
                </Badge>
              </div>

              <div className="min-h-[60px] space-y-2">
                {room.slots.map((slot) => {
                  const occupantName = slot.occupant
                    ? attendeeMap.get(slot.occupant.attendeeId)?.name ||
                    slot.occupant.name
                    : null

                  return (
                    <div
                      key={slot.slotId}
                      className={`flex items-center justify-between rounded-md border p-2 text-sm transition-all ${slot.isEmpty
                          ? "border-dashed border-muted-foreground/30"
                          : "border-solid border-primary/20 bg-background"
                        } ${draggingAttendeeId && slot.isEmpty
                          ? "border-primary bg-primary/10"
                          : ""
                        }`}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, slot.slotId)}
                    >
                      <div className="flex items-center gap-2">
                        {slot.isEmpty ? (
                          <span className="text-xs text-muted-foreground">
                            Empty bed
                          </span>
                        ) : (
                          <>
                            <span className="font-medium">
                              {occupantName || "Attendee"}
                            </span>
                            {slot.isAllocatedByCurrentProcess && (
                              <span className="rounded bg-primary/20 px-1 py-0.5 text-xs text-primary">
                                yours
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      {!slot.isEmpty && slot.isAllocatedByCurrentProcess && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => clearSlot(slot.slotId)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
