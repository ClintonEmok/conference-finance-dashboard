"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { format } from "date-fns"
import {
  Calendar,
  ChevronRight,
  Plus,
  Search,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useEvents } from "@/lib/convex/hooks/events"

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        handleCopy()
      }}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      title={`Copy ${label}`}
    >
      {copied ? (
        <>
          <Check className="size-3 text-emerald-500" />
          <span className="text-emerald-500">Copied</span>
        </>
      ) : (
        <>
          <Copy className="size-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  )
}

function getStatusBadge(isPublished: boolean) {
  if (isPublished) {
    return (
      <Badge
        variant="secondary"
        className="h-5 border-none bg-emerald-500/10 text-[10px] text-emerald-600"
      >
        Published
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="h-5 text-[10px]">
      Draft
    </Badge>
  )
}

export default function EventsPage() {
  const router = useRouter()
  const events = useEvents()

  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all")
  const [searchQuery, setSearchQuery] = useState("")

  const chooserEvents = useMemo(() => {
    if (!events) return []

    return events
      .filter((event) => event.primarySourceKind === "internal")
      .filter((event) => {
        if (statusFilter !== "all") {
          if (statusFilter === "published" && !event.isPublished) return false
          if (statusFilter === "draft" && event.isPublished) return false
        }

        if (searchQuery) {
          const query = searchQuery.toLowerCase()
          const matchesTitle = event.title?.toLowerCase().includes(query)
          const matchesSlug = event.slug?.toLowerCase().includes(query)
          if (!matchesTitle && !matchesSlug) return false
        }

        return true
      })
      .sort((a, b) => (b.startsAt ?? 0) - (a.startsAt ?? 0))
  }, [events, statusFilter, searchQuery])

  const recentEvents = chooserEvents.slice(0, 3)
  const isLoading = events === undefined

  return (
    <div className="animate-in space-y-8 duration-700 fade-in">
      <header className="flex flex-col gap-5 px-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl space-y-3">
          <p className="text-[10px] font-bold tracking-[0.22em] text-muted-foreground uppercase">
            Event chooser
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Choose an event
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Open an existing event to work inside its dashboard, or create a new
            one when you need a fresh scope.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/dashboard/events/new">
            <Button className="h-11 rounded-2xl bg-primary px-5 text-white shadow-lg shadow-primary/20 transition-all active:scale-95">
              <Plus className="mr-2 size-4" />
              New event
            </Button>
          </Link>
        </div>
      </header>

      <article className="rounded-3xl border border-border/50 bg-card/40 p-6 shadow-sm backdrop-blur-xl">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
              Recent events
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
              Open the latest work first
            </h2>
          </div>
          <Link href="/dashboard/events/new" className="text-sm font-medium text-primary hover:underline">
            New event
          </Link>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <article key={i} className="rounded-2xl border border-border/50 bg-background/50 p-5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-24" />
                <Skeleton className="mt-4 h-20 w-full" />
              </article>
            ))}
          </div>
        ) : recentEvents.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recentEvents.map((event) => (
              <article key={event._id} className="rounded-2xl border border-border/50 bg-background/60 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      {event.title ?? event.slug}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{event.slug}</p>
                  </div>
                  {getStatusBadge(event.isPublished)}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                  <div>
                    <p className="font-semibold text-foreground">Starts</p>
                    <p>{event.startsAt ? format(new Date(event.startsAt), "MMM d, yyyy") : "Not set"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Type</p>
                    <p>{event.isPublished ? "Published" : "Draft"}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <Link href={`/dashboard/events/${event.slug}`}>
                    <Button size="sm" className="rounded-xl">
                      Open event
                    </Button>
                  </Link>
                  {event.isPublished ? (
                    <div className="flex flex-col items-end gap-1">
                      <a
                        href={`/events/${event.slug}`}
                        onClick={(e) => e.stopPropagation()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <ExternalLink className="size-3" />
                        <span>/events/{event.slug}</span>
                      </a>
                      <a
                        href={`/signup/${event.slug}`}
                        onClick={(e) => e.stopPropagation()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs text-primary transition-colors hover:bg-muted hover:text-primary"
                      >
                        <ExternalLink className="size-3" />
                        <span>/signup/{event.slug}</span>
                      </a>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Draft only</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/60 bg-background/50 p-8 text-center">
            <h3 className="text-lg font-semibold text-foreground">No events yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Create your first event to start working in an event-scoped dashboard.
            </p>
            <div className="mt-5">
              <Link href="/dashboard/events/new">
                <Button className="rounded-xl">
                  <Plus className="mr-2 size-4" />
                  New event
                </Button>
              </Link>
            </div>
          </div>
        )}
      </article>

      <article className="rounded-3xl border border-border/50 bg-card/40 p-6 shadow-sm backdrop-blur-xl">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[150px] flex-1 space-y-1.5">
            <label className="ml-1 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="h-11 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm transition-all focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          <div className="min-w-[280px] flex-1 space-y-1.5">
            <label className="ml-1 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              <Search className="size-3" /> Search
            </label>
            <input
              type="text"
              placeholder="Search by title or slug..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm transition-all focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      </article>

      <article className="overflow-hidden rounded-xl border border-border/50 bg-card/40 shadow-sm backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-border/30 bg-muted/50">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold tracking-wider text-muted-foreground/70 uppercase">
                  Event
                </th>
                <th className="px-6 py-4 text-[10px] font-bold tracking-wider text-muted-foreground/70 uppercase">
                  Date
                </th>
                <th className="px-6 py-4 text-[10px] font-bold tracking-wider text-muted-foreground/70 uppercase">
                  Status
                </th>
                <th className="px-6 py-4 text-[10px] font-bold tracking-wider text-muted-foreground/70 uppercase">
                  Public URLs
                </th>
                <th className="w-28 px-6 py-4 text-right text-[10px] font-bold tracking-wider text-muted-foreground/70 uppercase">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/10">
                    <td className="px-6 py-5">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <Skeleton className="h-4 w-28" />
                    </td>
                    <td className="px-6 py-5">
                      <Skeleton className="h-5 w-16 rounded-lg" />
                    </td>
                    <td className="px-6 py-5">
                      <Skeleton className="h-5 w-16 rounded-lg" />
                    </td>
                    <td className="px-6 py-5">
                      <Skeleton className="ml-auto size-8 rounded-full" />
                    </td>
                  </tr>
                ))
              ) : chooserEvents.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center font-medium text-muted-foreground italic"
                  >
                    {events?.length === 0
                      ? "No events yet. Create your first event to get started."
                      : "No events found matching the criteria."}
                  </td>
                </tr>
              ) : (
                chooserEvents.map((event) => (
                  <tr
                    key={event._id}
                    onClick={() => router.push(`/dashboard/events/${event.slug}`)}
                    className="group cursor-pointer transition-colors hover:bg-muted/30"
                  >
                    <td className="px-6 py-5">
                      <div className="font-semibold text-foreground">{event.title ?? event.slug}</div>
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground/60">{event.slug}</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="size-3.5 text-muted-foreground" />
                        {event.startsAt ? format(new Date(event.startsAt), "MMM d, yyyy") : "-"}
                      </div>
                    </td>
                    <td className="px-6 py-5">{getStatusBadge(event.isPublished)}</td>
                    <td className="px-6 py-5">
                      {event.isPublished ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <a
                              href={`/events/${event.slug}`}
                              onClick={(e) => e.stopPropagation()}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <ExternalLink className="size-3" />
                              <span>/events/{event.slug}</span>
                            </a>
                            <CopyButton
                              text={`${typeof window !== "undefined" ? window.location.origin : ""}/events/${event.slug}`}
                              label="event page URL"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <a
                              href={`/signup/${event.slug}`}
                              onClick={(e) => e.stopPropagation()}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs text-primary transition-colors hover:bg-muted hover:text-primary"
                            >
                              <ExternalLink className="size-3" />
                              <span>/signup/{event.slug}</span>
                            </a>
                            <CopyButton
                              text={`${typeof window !== "undefined" ? window.location.origin : ""}/signup/${event.slug}`}
                              label="signup URL"
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Not published</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <Link
                        href={`/dashboard/events/${event.slug}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-xl border border-border/50 bg-background/70 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                      >
                        Open event
                        <ChevronRight className="size-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  )
}
