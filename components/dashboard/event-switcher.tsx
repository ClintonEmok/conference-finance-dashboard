"use client"

import { useMemo } from "react"

import { useEvents } from "@/lib/convex/hooks/events"
import { cn } from "@/lib/utils"

type EventSwitcherProps = {
  currentSlug?: string | null
  className?: string
}

export function EventSwitcher({ currentSlug, className }: EventSwitcherProps) {
  const events = useEvents()

  const activeEvent = useMemo(() => {
    if (!events || !currentSlug) return null

    return events.find((event) => event.slug === currentSlug) ?? null
  }, [events, currentSlug])

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
