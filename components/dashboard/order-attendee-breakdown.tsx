"use client"

import { useQuery } from "convex/react"
import { useEffect, useState } from "react"

import { ChevronDown, ChevronRight, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/convex/api"
import type { Id } from "@/convex/_generated/dataModel"

type OrderAttendeeBreakdownProps = {
  orderId: string
  onResolvedAttendeeId?: (resolution: {
    orderId: string
    attendeeId: string | null
  }) => void
}

function resolveAttendeeIdCandidate(
  attendees: Array<{ id: string }>
): string | null {
  if (attendees.length === 0) {
    return null
  }

  const firstStableId = attendees
    .map((attendee) => attendee.id.trim())
    .find((id) => id.length > 0)

  return firstStableId ?? null
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "cancelled"
      ? "destructive"
      : status === "refunded"
        ? "outline"
        : "secondary"
  return (
    <Badge variant={variant} className="text-[10px] capitalize">
      {status}
    </Badge>
  )
}

export function OrderAttendeeBreakdown({
  orderId,
  onResolvedAttendeeId,
}: OrderAttendeeBreakdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const trimmedOrderId = orderId.trim()
  const hasOrderId = trimmedOrderId.length > 0
  const data = useQuery(
    api.orders.getOrderWithAttendees,
    hasOrderId ? { orderId: trimmedOrderId as Id<"orders"> } : "skip"
  )
  const isLoading = hasOrderId && data === undefined

  useEffect(() => {
    if (!onResolvedAttendeeId || isLoading) {
      return
    }

    onResolvedAttendeeId({
      orderId,
      attendeeId: data ? resolveAttendeeIdCandidate(data.attendees) : null,
    })
  }, [data, isLoading, onResolvedAttendeeId, orderId])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 border-t border-border/50 pt-1">
        <Skeleton className="h-5 w-[80px]" />
      </div>
    )
  }

  if (!data || !data.attendees.length) {
    return null
  }

  const count = data.attendees.length

  // Single attendee: show inline without expand/collapse
  if (count === 1) {
    const attendee = data.attendees[0]
    return (
      <div className="flex items-center gap-2 border-t border-border/50 pt-1 text-[11px] text-muted-foreground">
        <Users className="size-3 shrink-0" />
        <span>
          1 attendee:{" "}
          <span className="font-medium text-foreground">{attendee.name}</span>
          {attendee.ticketTypeLabel !== "-" && (
            <span className="ml-1">· {attendee.ticketTypeLabel}</span>
          )}
        </span>
        <StatusBadge status={attendee.normalizedStatus} />
      </div>
    )
  }

  // Multiple attendees: show expandable breakdown
  return (
    <div className="flex flex-col gap-1.5 border-t border-border/50 pt-1">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        {isOpen ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <Users className="size-3 shrink-0" />
        <span>{count} attendees</span>
      </button>

      {isOpen && (
        <div className="ml-5 flex flex-col gap-1">
          {data.attendees.map((attendee) => (
            <div
              key={attendee.id}
              className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1"
            >
              <div className="min-w-0 flex-1">
                <span className="truncate text-xs font-medium text-foreground">
                  {attendee.name}
                </span>
                {attendee.ticketTypeLabel !== "-" && (
                  <span className="ml-1.5 truncate text-[10px] text-muted-foreground">
                    {attendee.ticketTypeLabel}
                  </span>
                )}
              </div>
              <StatusBadge status={attendee.normalizedStatus} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
