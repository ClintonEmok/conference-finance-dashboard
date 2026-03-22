"use client"

import { useEffect, useState } from "react"

import { ChevronDown, ChevronRight, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

type AttendeeBreakdownAttendee = {
  id: string
  name: string
  ticketTypeLabel: string
  normalizedStatus: string
}

type OrderAttendeeBreakdownData = {
  order: {
    id: string
    providerOrderId: string
    normalizedStatus: string
    totalAmountMinor: number | null
    orderedAt: string | null
  }
  attendees: AttendeeBreakdownAttendee[]
}

type OrderAttendeeBreakdownProps = {
  orderId: string
  eventId: string
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
  eventId,
}: OrderAttendeeBreakdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [data, setData] = useState<OrderAttendeeBreakdownData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(
          `/api/dashboard/orders/${encodeURIComponent(orderId)}?eventId=${encodeURIComponent(eventId)}`
        )

        if (!response.ok) {
          throw new Error(`Failed to load (${response.status})`)
        }

        const body = (await response.json()) as OrderAttendeeBreakdownData
        if (!cancelled) {
          setData(body)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load attendees"
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [orderId, eventId])

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 border-t border-border/50 pt-1">
        <Skeleton className="h-5 w-[80px]" />
      </div>
    )
  }

  if (error || !data.attendees.length) {
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
          <ChevronRight className="size-3 shrink-0" />
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
