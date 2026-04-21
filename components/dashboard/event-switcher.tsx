"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, GalleryVerticalEnd } from "lucide-react"

import { useEvents } from "@/lib/convex/hooks/events"
import { cn } from "@/lib/utils"

type EventSwitcherProps = {
  currentSlug?: string | null
  className?: string
}

export function EventSwitcher({ currentSlug, className }: EventSwitcherProps) {
  const router = useRouter()
  const events = useEvents()

  const activeEvent = useMemo(() => {
    if (!events || !currentSlug) return null

    return events.find((event) => event.slug === currentSlug) ?? null
  }, [events, currentSlug])

  function handleChange(nextSlug: string) {
    if (!nextSlug) {
      router.push("/dashboard/events")
      return
    }

    router.push(`/dashboard/events/${nextSlug}`)
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/50 bg-background/70 p-3 shadow-sm backdrop-blur",
        className
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
            Event switcher
          </p>
          <p className="truncate text-sm font-semibold text-foreground">
            {activeEvent ? activeEvent.title ?? activeEvent.slug : "Choose an event"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push("/dashboard/events")}
          className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/40 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <GalleryVerticalEnd className="size-3" />
          Chooser
        </button>
      </div>

      <label className="flex items-center gap-2 rounded-xl border border-border/40 bg-background px-3 py-2 text-sm">
        <span className="sr-only">Current event</span>
        <select
          value={currentSlug ?? ""}
          onChange={(event) => handleChange(event.target.value)}
          disabled={events === undefined}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        >
          <option value="">Choose an event</option>
          {events?.map((event) => (
            <option key={event._id} value={event.slug}>
              {event.title ?? event.slug}
            </option>
          ))}
        </select>

        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </label>
    </div>
  )
}
