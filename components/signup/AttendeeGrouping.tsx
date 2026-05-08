"use client"

import { useState } from "react"
import type { AttendeeDraft } from "@/components/signup/state"

type AttendeeGroupingProps = {
  attendees: AttendeeDraft[]
  assignments: Record<string, string>
  onGroupChange?: (groupedAttendeeIds: string[][]) => void
}

export function AttendeeGrouping({
  attendees,
  assignments,
  onGroupChange,
}: AttendeeGroupingProps) {
  // Visual grouping state - tracks which attendees are near each other
  const [visualPositions, setVisualPositions] = useState<
    Record<string, { x: number; y: number }>
  >(() => {
    // Initialize in a grid layout
    const positions: Record<string, { x: number; y: number }> = {}
    attendees.forEach((attendee, index) => {
      positions[attendee.attendeeKey] = {
        x: (index % 4) * 100,
        y: Math.floor(index / 4) * 60,
      }
    })
    return positions
  })

  return (
    <div className="relative min-h-[200px] rounded-lg border border-border/70 p-4">
      <p className="mb-4 text-sm text-muted-foreground">
        Drag attendees to group them together. Groups help you organize room
        assignments.
      </p>
      <div className="relative flex flex-wrap gap-3">
        {attendees.map((attendee) => (
          <div
            key={attendee.attendeeKey}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", attendee.attendeeKey)
              e.dataTransfer.setData("attendee/group", "true")
            }}
            className="cursor-move rounded-full border border-border/70 bg-background px-3 py-1.5 text-sm hover:border-primary/50"
          >
            <span className="font-medium">
              {attendee.name || `Attendee ${attendee.attendeeKey}`}
            </span>
            {attendee.gender && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({attendee.gender})
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
