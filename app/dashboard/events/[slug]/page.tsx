"use client"

import { useState, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { format } from "date-fns"
import {
  ChevronLeft,
  Calendar,
  Clock,
  Globe,
  Settings,
  Link as LinkIcon,
  BedDouble,
  Users,
  Edit,
  Trash2,
  AlertCircle,
  Check,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useEventBySlug, useUpdateEvent } from "@/lib/convex/hooks/events"
import { useEventSourcesForEvent } from "@/lib/convex/hooks/events"

type TabKey = "overview" | "settings" | "sources" | "accommodation"

const COMMON_TIMEZONES = [
  "Europe/London",
  "Europe/Amsterdam",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Africa/Lagos",
]

const CURRENCIES = [
  { code: "GBP", name: "British Pound" },
  { code: "EUR", name: "Euro" },
  { code: "USD", name: "US Dollar" },
]

function getStatusBadge(isPublished: boolean, isSignupOpen: boolean) {
  if (!isPublished) {
    return <Badge variant="outline">Draft</Badge>
  }
  if (isSignupOpen) {
    return (
      <Badge className="border-none bg-emerald-500/10 text-emerald-600">
        Live
      </Badge>
    )
  }
  return <Badge variant="secondary">Published</Badge>
}

function getSourceBadge(kind: string, provider?: string) {
  if (kind === "internal") {
    return <Badge variant="secondary">Internal</Badge>
  }
  return (
    <Badge
      variant="outline"
      className="border-purple-500/50 bg-purple-50 text-purple-600"
    >
      {provider || "Integration"}
    </Badge>
  )
}

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const router = useRouter()
  const { slug } = use(params)
  const event = useEventBySlug(slug)
  const eventSources = useEventSourcesForEvent(event?._id)
  const updateEvent = useUpdateEvent()

  const [activeTab, setActiveTab] = useState<TabKey>("overview")
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Edit form state
  const [editTitle, setEditTitle] = useState("")
  const [editStartsAt, setEditStartsAt] = useState("")
  const [editEndsAt, setEditEndsAt] = useState("")
  const [editTimezone, setEditTimezone] = useState("")
  const [editCurrency, setEditCurrency] = useState("")
  const [editIsPublished, setEditIsPublished] = useState(false)
  const [editIsSignupOpen, setEditIsSignupOpen] = useState(false)
  const [editAccommodationEnabled, setEditAccommodationEnabled] =
    useState(false)

  const formatDateTimeLocal = (timestamp: number) => {
    const date = new Date(timestamp)
    const pad = (n: number) => n.toString().padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  const parseDateTimeLocal = (value: string) => new Date(value).getTime()

  const startEditing = () => {
    if (!event) return
    setEditTitle(event.title)
    setEditStartsAt(formatDateTimeLocal(event.startsAt))
    setEditEndsAt(event.endsAt ? formatDateTimeLocal(event.endsAt) : "")
    setEditTimezone(event.timezone)
    setEditCurrency(event.currency)
    setEditIsPublished(event.isPublished)
    setEditIsSignupOpen(event.isSignupOpen)
    setEditAccommodationEnabled(event.accommodationEnabled)
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
  }

  const saveChanges = async () => {
    if (!event) return
    setIsSaving(true)
    try {
      await updateEvent({
        eventId: event._id,
        title: editTitle,
        startsAt: parseDateTimeLocal(editStartsAt),
        endsAt: editEndsAt ? parseDateTimeLocal(editEndsAt) : undefined,
        timezone: editTimezone,
        currency: editCurrency,
        isPublished: editIsPublished,
        isSignupOpen: editIsPublished && editIsSignupOpen,
        accommodationEnabled: editAccommodationEnabled,
      })
      setIsEditing(false)
    } catch (err) {
      console.error("Failed to update event:", err)
    } finally {
      setIsSaving(false)
    }
  }

  const isSignupOpenDisabled = !editIsPublished

  if (event === undefined) {
    return (
      <div className="animate-in space-y-6 duration-700 fade-in">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (event === null) {
    return (
      <div className="animate-in space-y-6 duration-700 fade-in">
        <Link
          href="/dashboard/events"
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to Events
        </Link>
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
          <h1 className="text-2xl font-bold text-destructive">
            Event Not Found
          </h1>
          <p className="mt-2 text-muted-foreground">
            The event &quot;{slug}&quot; could not be found.
          </p>
          <Button className="mt-4" asChild>
            <Link href="/dashboard/events">View All Events</Link>
          </Button>
        </div>
      </div>
    )
  }

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "overview", label: "Overview", icon: Calendar },
    { key: "settings", label: "Settings", icon: Settings },
    { key: "sources", label: "Sources", icon: LinkIcon },
  ]

  if (event.accommodationEnabled) {
    tabs.push({ key: "accommodation", label: "Accommodation", icon: BedDouble })
  }

  return (
    <div className="animate-in space-y-6 duration-700 fade-in">
      {/* Header */}
      <header className="flex flex-col gap-4 px-1">
        <Link
          href="/dashboard/events"
          className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to Events
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                {event.title}
              </h1>
              {getStatusBadge(event.isPublished, event.isSignupOpen)}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="rounded bg-muted px-2 py-1 font-mono text-xs">
                /{event.slug}
              </span>
              {getSourceBadge(
                event.primarySourceKind,
                event.primarySourceProvider
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === "settings" && !isEditing && (
              <Button variant="outline" onClick={startEditing} className="h-10">
                <Edit className="mr-2 size-4" />
                Edit
              </Button>
            )}
            {activeTab === "settings" && isEditing && (
              <>
                <Button
                  variant="outline"
                  onClick={cancelEditing}
                  disabled={isSaving}
                  className="h-10"
                >
                  <X className="mr-2 size-4" />
                  Cancel
                </Button>
                <Button
                  onClick={saveChanges}
                  disabled={isSaving}
                  className="h-10"
                >
                  <Check className="mr-2 size-4" />
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border/50">
          <nav className="flex gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
                    isActive
                      ? "border-b-2 border-primary text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      {/* Tab Content */}
      <div className="px-1">
        {activeTab === "overview" && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Event Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calendar className="size-4 text-muted-foreground" />
                  Event Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs tracking-wider text-muted-foreground uppercase">
                    Date
                  </p>
                  <p className="text-sm font-medium">
                    {format(new Date(event.startsAt), "MMM d, yyyy")}
                  </p>
                </div>
                <div>
                  <p className="text-xs tracking-wider text-muted-foreground uppercase">
                    Time
                  </p>
                  <p className="text-sm font-medium">
                    {format(new Date(event.startsAt), "h:mm a")}
                    {event.endsAt &&
                      ` - ${format(new Date(event.endsAt), "h:mm a")}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs tracking-wider text-muted-foreground uppercase">
                    Timezone
                  </p>
                  <p className="flex items-center gap-1 text-sm font-medium">
                    <Globe className="size-3 text-muted-foreground" />
                    {event.timezone}
                  </p>
                </div>
                <div>
                  <p className="text-xs tracking-wider text-muted-foreground uppercase">
                    Currency
                  </p>
                  <p className="text-sm font-medium">{event.currency}</p>
                </div>
              </CardContent>
            </Card>

            {/* Status Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings className="size-4 text-muted-foreground" />
                  Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Published</span>
                  <Badge variant={event.isPublished ? "default" : "outline"}>
                    {event.isPublished ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Signups Open</span>
                  <Badge variant={event.isSignupOpen ? "default" : "outline"}>
                    {event.isSignupOpen ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Accommodation</span>
                  <Badge
                    variant={event.accommodationEnabled ? "default" : "outline"}
                  >
                    {event.accommodationEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Source Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <LinkIcon className="size-4 text-muted-foreground" />
                  Source
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs tracking-wider text-muted-foreground uppercase">
                    Kind
                  </p>
                  <p className="text-sm font-medium capitalize">
                    {event.primarySourceKind}
                  </p>
                </div>
                {event.primarySourceProvider && (
                  <div>
                    <p className="text-xs tracking-wider text-muted-foreground uppercase">
                      Provider
                    </p>
                    <p className="text-sm font-medium">
                      {event.primarySourceProvider}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "settings" && (
          <Card>
            <CardHeader>
              <CardTitle>Event Settings</CardTitle>
              <CardDescription>
                {isEditing
                  ? "Make changes to the event below"
                  : "View and edit event configuration"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="h-10 w-full rounded-lg border border-border/40 bg-background/50 px-3 text-sm"
                  />
                ) : (
                  <p className="text-sm">{event.title}</p>
                )}
              </div>

              {/* Schedule */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Clock className="size-4" />
                    Start Date & Time
                  </label>
                  {isEditing ? (
                    <input
                      type="datetime-local"
                      value={editStartsAt}
                      onChange={(e) => setEditStartsAt(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border/40 bg-background/50 px-3 text-sm"
                    />
                  ) : (
                    <p className="text-sm">
                      {format(new Date(event.startsAt), "MMM d, yyyy h:mm a")}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Clock className="size-4" />
                    End Date & Time
                  </label>
                  {isEditing ? (
                    <input
                      type="datetime-local"
                      value={editEndsAt}
                      onChange={(e) => setEditEndsAt(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border/40 bg-background/50 px-3 text-sm"
                    />
                  ) : (
                    <p className="text-sm">
                      {event.endsAt
                        ? format(new Date(event.endsAt), "MMM d, yyyy h:mm a")
                        : "Not set"}
                    </p>
                  )}
                </div>
              </div>

              {/* Timezone & Currency */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Globe className="size-4" />
                    Timezone
                  </label>
                  {isEditing ? (
                    <select
                      value={editTimezone}
                      onChange={(e) => setEditTimezone(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border/40 bg-background/50 px-3 text-sm"
                    >
                      {COMMON_TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm">{event.timezone}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Currency</label>
                  {isEditing ? (
                    <select
                      value={editCurrency}
                      onChange={(e) => setEditCurrency(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border/40 bg-background/50 px-3 text-sm"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm">{event.currency}</p>
                  )}
                </div>
              </div>

              {/* Status Toggles */}
              <div className="space-y-4 border-t border-border/50 pt-6">
                <h3 className="text-sm font-medium">Status Settings</h3>

                {/* Published Toggle */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium">Published</label>
                    <p className="text-xs text-muted-foreground">
                      Event is visible to the public
                    </p>
                  </div>
                  {isEditing ? (
                    <button
                      type="button"
                      onClick={() => {
                        const newPublished = !editIsPublished
                        setEditIsPublished(newPublished)
                        if (!newPublished) setEditIsSignupOpen(false)
                      }}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        editIsPublished
                          ? "bg-primary"
                          : "bg-muted-foreground/30"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block size-4 rounded-full bg-white transition-transform",
                          editIsPublished ? "translate-x-6" : "translate-x-1"
                        )}
                      />
                    </button>
                  ) : (
                    <Badge variant={event.isPublished ? "default" : "outline"}>
                      {event.isPublished ? "On" : "Off"}
                    </Badge>
                  )}
                </div>

                {/* Signup Open Toggle */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label
                      className={cn(
                        "text-sm font-medium",
                        isSignupOpenDisabled && "text-muted-foreground"
                      )}
                    >
                      Signups Open
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Accepting attendee registrations
                    </p>
                  </div>
                  {isEditing ? (
                    <button
                      type="button"
                      onClick={() => setEditIsSignupOpen(!editIsSignupOpen)}
                      disabled={isSignupOpenDisabled}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        editIsSignupOpen
                          ? "bg-primary"
                          : "bg-muted-foreground/30",
                        isSignupOpenDisabled && "cursor-not-allowed opacity-50"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block size-4 rounded-full bg-white transition-transform",
                          editIsSignupOpen ? "translate-x-6" : "translate-x-1"
                        )}
                      />
                    </button>
                  ) : (
                    <Badge variant={event.isSignupOpen ? "default" : "outline"}>
                      {event.isSignupOpen ? "On" : "Off"}
                    </Badge>
                  )}
                </div>
                {isEditing && isSignupOpenDisabled && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <AlertCircle className="size-3" />
                    Event must be published first
                  </p>
                )}

                {/* Accommodation Toggle */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium">
                      Accommodation Module
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Enable room booking and assignments
                    </p>
                  </div>
                  {isEditing ? (
                    <button
                      type="button"
                      onClick={() =>
                        setEditAccommodationEnabled(!editAccommodationEnabled)
                      }
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        editAccommodationEnabled
                          ? "bg-primary"
                          : "bg-muted-foreground/30"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block size-4 rounded-full bg-white transition-transform",
                          editAccommodationEnabled
                            ? "translate-x-6"
                            : "translate-x-1"
                        )}
                      />
                    </button>
                  ) : (
                    <Badge
                      variant={
                        event.accommodationEnabled ? "default" : "outline"
                      }
                    >
                      {event.accommodationEnabled ? "On" : "Off"}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Danger Zone */}
              {!isEditing && (
                <div className="mt-6 border-t border-destructive/20 pt-6">
                  <h3 className="flex items-center gap-2 text-sm font-medium text-destructive">
                    <AlertCircle className="size-4" />
                    Danger Zone
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    These actions cannot be undone.
                  </p>
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      className="border-destructive/30 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="mr-2 size-4" />
                      Archive Event
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "sources" && (
          <Card>
            <CardHeader>
              <CardTitle>Event Sources</CardTitle>
              <CardDescription>
                External integrations linked to this event
              </CardDescription>
            </CardHeader>
            <CardContent>
              {eventSources === undefined ? (
                <Skeleton className="h-24" />
              ) : eventSources.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <LinkIcon className="mx-auto mb-2 size-8 opacity-50" />
                  <p>No external sources linked to this event.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {eventSources.map((source: any) => (
                    <div
                      key={source._id}
                      className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-4"
                    >
                      <div className="space-y-1">
                        <p className="font-medium">{source.provider}</p>
                        <p className="font-mono text-sm text-muted-foreground">
                          {source.externalEventId}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px]">
                            {source.syncStatus}
                          </Badge>
                          {source.lastSyncedAt && (
                            <span>
                              Last synced{" "}
                              {format(
                                new Date(source.lastSyncedAt),
                                "MMM d, yyyy"
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "accommodation" && event.accommodationEnabled && (
          <Card>
            <CardHeader>
              <CardTitle>Accommodation</CardTitle>
              <CardDescription>
                Manage room assignments and submissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center py-12">
                <Link href={`/dashboard/accommodation/${event.slug}`}>
                  <Button>
                    <BedDouble className="mr-2 size-4" />
                    Open Accommodation Workspace
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
