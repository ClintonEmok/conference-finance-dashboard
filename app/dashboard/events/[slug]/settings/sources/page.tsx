"use client"

import { use } from "react"
import Link from "next/link"
import { Link as LinkIcon, ArrowLeft } from "lucide-react"
import { format } from "date-fns"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useEventSourcesForEvent } from "@/lib/convex/hooks/events"
import { useEventDashboard } from "@/components/dashboard/event-dashboard-context"

export default function EventSourcesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const { event } = useEventDashboard()
  const eventSources = useEventSourcesForEvent(event?._id)

  if (!event) return null

  return (
    <div className="space-y-6">
      <Link
        href={`/dashboard/events/${slug}/settings`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Settings
      </Link>

      <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Event Sources</CardTitle>
          <CardDescription className="text-muted-foreground/70">
            External integrations linked to this event
          </CardDescription>
        </CardHeader>
        <CardContent>
          {eventSources === undefined ? (
            <div className="space-y-3">
               <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : eventSources.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground rounded-2xl border border-dashed border-white/20 bg-white/5">
              <LinkIcon className="mx-auto mb-4 size-12 opacity-10" />
              <p className="text-sm font-bold tracking-widest uppercase opacity-40">No external sources</p>
              <p className="text-xs mt-1">
                Link external providers to sync attendee data.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {eventSources.map((source: any) => (
                <div
                  key={source._id}
                  className="group flex flex-col gap-4 rounded-2xl border border-white/60 bg-white/60 p-5 shadow-sm transition-all hover:bg-white/80 sm:flex-row sm:items-center sm:justify-between dark:border-white/5 dark:bg-white/5 dark:hover:bg-white/10"
                >
                  <div className="flex items-center gap-4">
                     <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                      <LinkIcon className="size-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold tracking-tight">{source.provider}</p>
                      <p className="font-mono text-xs text-muted-foreground/70">
                        ID: {source.externalEventId}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "text-[10px] font-black uppercase tracking-widest h-5 px-2",
                        source.syncStatus === "synced" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                      )}
                    >
                      {source.syncStatus}
                    </Badge>
                    {source.lastSyncedAt && (
                      <span className="text-[10px] text-muted-foreground/60 font-medium">
                        Synced {format(new Date(source.lastSyncedAt), "MMM d, HH:mm")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
