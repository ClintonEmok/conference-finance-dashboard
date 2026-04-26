"use client"

import Link from "next/link"
import { format } from "date-fns"
import { Calendar, ChevronRight, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useEvents } from "@/lib/convex/hooks/events"
import { cn } from "@/lib/utils"

type PickerEvent = {
  _id: string
  slug: string
  title: string
  startsAt: number
  isPublished: boolean
  primarySourceKind: "integration" | "internal"
  updatedAt: number
}

function getEventStatus(event: PickerEvent) {
  if (event.isPublished) {
    return (
      <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10">
        Published
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="border-white/15 bg-white/5 text-white/70">
      Draft
    </Badge>
  )
}

function PickerCardSkeleton({ accent }: { accent: boolean }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.75rem] border p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)] backdrop-blur-xl",
        accent
          ? "border-dashed border-white/18 bg-white/[0.08]"
          : "border-white/14 bg-white/[0.06]"
      )}
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <Skeleton className="h-3 w-24 rounded-full bg-white/10" />
          <Skeleton className="h-8 w-44 rounded-2xl bg-white/10" />
          <Skeleton className="h-4 w-32 rounded-full bg-white/10" />
        </div>
        <Skeleton className="h-4 w-full rounded-full bg-white/10" />
        <Skeleton className="h-4 w-5/6 rounded-full bg-white/10" />
      </div>
      <div className="mt-8 flex items-center justify-between">
        <Skeleton className="h-4 w-28 rounded-full bg-white/10" />
        <Skeleton className="h-4 w-16 rounded-full bg-white/10" />
      </div>
    </div>
  )
}

export function EventPicker() {
  const events = useEvents()

  const chooserEvents = (events as PickerEvent[] | undefined)?.filter(
    (event) => event.primarySourceKind === "internal"
  )
  const sortedEvents = chooserEvents
    ? [...chooserEvents].sort((a, b) => (b.startsAt ?? 0) - (a.startsAt ?? 0))
    : []
  const isLoading = events === undefined

  return (
    <main className="relative isolate min-h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(121,86,255,0.28),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.12),_transparent_24%),linear-gradient(180deg,_#09090c_0%,_#111116_100%)] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.06),transparent_28%,transparent_72%,rgba(255,255,255,0.03))] opacity-70" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.05),transparent_24%)] opacity-60" />

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col justify-center px-6 py-10 sm:px-8 lg:px-10">
        <div className="max-w-2xl space-y-4">
          <p className="text-[10px] font-black tracking-[0.28em] text-white/55 uppercase">
            Event picker
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Choose an event to continue
          </h1>
          <p className="max-w-xl text-sm leading-6 text-white/70 sm:text-base">
            Pick an existing event card to enter the dashboard, or start a new one
            before you step into the shell.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Link
            href="/dashboard/events/new"
            className="group relative overflow-hidden rounded-[1.75rem] border border-dashed border-white/18 bg-white/[0.08] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.2)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-white/28 hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-70" />
            <div className="flex h-full min-h-[16rem] flex-col justify-between">
              <div className="space-y-5">
                <div className="flex size-12 items-center justify-center rounded-2xl border border-white/12 bg-white/10 text-white shadow-inner shadow-black/20 transition group-hover:scale-105">
                  <Plus className="size-5" />
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-black tracking-[0.24em] text-white/55 uppercase">
                    New event
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight text-white">
                    Create a fresh workspace
                  </h2>
                  <p className="max-w-sm text-sm leading-6 text-white/65">
                    Start from a clean slate and set up the next event before opening
                    the dashboard.
                  </p>
                </div>
              </div>

              <div className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-white/85 transition group-hover:text-white">
                Start setup
                <ChevronRight className="size-4 transition group-hover:translate-x-0.5" />
              </div>
            </div>
          </Link>

          {isLoading ? (
            <>
              <PickerCardSkeleton accent={false} />
              <PickerCardSkeleton accent={false} />
              <PickerCardSkeleton accent={false} />
            </>
          ) : sortedEvents.length > 0 ? (
            sortedEvents.map((event) => (
              <Link
                key={event._id}
                href={`/dashboard/events/${event.slug}`}
                className="group relative overflow-hidden rounded-[1.75rem] border border-white/14 bg-white/[0.07] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-white/26 hover:bg-white/[0.11] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-white/55 to-transparent opacity-70" />
                <div className="flex h-full min-h-[16rem] flex-col justify-between">
                  <div className="space-y-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <p className="text-[10px] font-black tracking-[0.24em] text-white/55 uppercase">
                          Event
                        </p>
                        <h2 className="text-2xl font-semibold tracking-tight text-white">
                          {event.title}
                        </h2>
                        <p className="font-mono text-xs text-white/45">/{event.slug}</p>
                      </div>

                      {getEventStatus(event)}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-white/68">
                      <div className="flex items-center gap-2">
                        <Calendar className="size-4 text-white/50" />
                        <span>
                          {format(new Date(event.startsAt), "MMM d, yyyy")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-white/85 transition group-hover:text-white">
                    Open dashboard
                    <ChevronRight className="size-4 transition group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-[1.75rem] border border-dashed border-white/18 bg-white/[0.06] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)] backdrop-blur-xl md:col-span-2 xl:col-span-2">
              <div className="flex h-full min-h-[16rem] flex-col justify-between">
                <div className="space-y-5">
                  <div className="flex size-12 items-center justify-center rounded-2xl border border-white/12 bg-white/10 text-white">
                    <Plus className="size-5" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-black tracking-[0.24em] text-white/55 uppercase">
                      No events yet
                    </p>
                    <h2 className="text-2xl font-semibold tracking-tight text-white">
                      Create the first event
                    </h2>
                    <p className="max-w-sm text-sm leading-6 text-white/65">
                      You can set up the first event now and enter its dashboard once it
                      is ready.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="mt-8 text-xs text-white/45">
          Once you choose a card, the event-specific dashboard shell appears.
        </p>
      </div>
    </main>
  )
}
