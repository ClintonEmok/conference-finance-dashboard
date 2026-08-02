"use client"

import { useMemo } from "react"

import { useEvents } from "@/lib/convex/hooks/events"
import { cn } from "@/lib/utils"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"

type EventSwitcherProps = {
  currentSlug?: string | null
  event?: Pick<EventDashboardEvent, "slug" | "title"> | null
  className?: string
}

export function EventSwitcher({
  currentSlug,
  event,
  className,
}: EventSwitcherProps) {
  const events = useEvents(!event)

  const activeEvent = useMemo(() => {
    if (event) return event
    if (!events || !currentSlug) return null

    return events.find((event) => event.slug === currentSlug) ?? null
  }, [event, events, currentSlug])

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/50 bg-background/70 p-3 shadow-sm backdrop-blur",
        className
      )}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
          Event
        </p>
        <p className="truncate text-sm font-semibold text-foreground">
          {activeEvent ? activeEvent.title ?? activeEvent.slug : "—"}
        </p>
      </div>
    </div>
  )
}
