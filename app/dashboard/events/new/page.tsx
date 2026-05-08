"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Calendar,
  Clock,
  Globe,
  Type,
  Settings,
  AlertCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useCreateEvent } from "@/lib/convex/hooks/events"

// Common timezones for the dropdown
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

// Generate slug from title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
}

// Format date for datetime-local input
function formatDateTimeLocal(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Parse datetime-local value to epoch ms
function parseDateTimeLocal(value: string): number {
  return new Date(value).getTime()
}

type SectionKey = "basic" | "schedule" | "settings"

export default function CreateEventPage() {
  const router = useRouter()
  const createEvent = useCreateEvent()

  const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(
    new Set(["basic"])
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)

  const now = new Date()
  const defaultStart = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 1 week from now
  const [startsAt, setStartsAt] = useState(formatDateTimeLocal(defaultStart))
  const [endsAt, setEndsAt] = useState("")
  const [timezone, setTimezone] = useState("Europe/London")
  const [currency, setCurrency] = useState("GBP")
  const [isPublished, setIsPublished] = useState(false)
  const [isSignupOpen, setIsSignupOpen] = useState(false)
  const [accommodationEnabled, setAccommodationEnabled] = useState(false)

  // Toggle section expansion
  const toggleSection = useCallback((section: SectionKey) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }, [])

  // Auto-generate slug from title
  const handleTitleChange = (value: string) => {
    setTitle(value)
    if (!slugManuallyEdited) {
      setSlug(generateSlug(value))
    }
  }

  const handleSlugChange = (value: string) => {
    setSlug(value)
    setSlugManuallyEdited(true)
  }

  // Validation
  const validationErrors: string[] = []
  if (!title.trim()) validationErrors.push("Title is required")
  if (!slug.trim()) validationErrors.push("Slug is required")
  if (!startsAt) validationErrors.push("Start date is required")
  if (endsAt && parseDateTimeLocal(endsAt) <= parseDateTimeLocal(startsAt)) {
    validationErrors.push("End date must be after start date")
  }
  const isSignupOpenDisabled = !isPublished
  if (isSignupOpen && !isPublished) {
    // This shouldn't happen due to UI, but just in case
    validationErrors.push("Signups can only be open for published events")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (validationErrors.length > 0) return

    setIsSubmitting(true)
    setError(null)

    try {
      const eventId = await createEvent({
        slug: slug.trim(),
        title: title.trim(),
        startsAt: parseDateTimeLocal(startsAt),
        endsAt: endsAt ? parseDateTimeLocal(endsAt) : undefined,
        timezone,
        currency,
        isPublished,
        isSignupOpen: isPublished && isSignupOpen,
        accommodationEnabled,
      })

      router.push(`/dashboard/events/${slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event")
      setIsSubmitting(false)
    }
  }

  const SectionHeader = ({
    section,
    icon: Icon,
    title: sectionTitle,
    description,
  }: {
    section: SectionKey
    icon: React.ElementType
    title: string
    description: string
  }) => (
    <button
      type="button"
      onClick={() => toggleSection(section)}
      className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-muted/30"
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-lg transition-colors",
            expandedSections.has(section)
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          )}
        >
          <Icon className="size-5" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{sectionTitle}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {expandedSections.has(section) ? (
        <ChevronDown className="size-5 text-muted-foreground" />
      ) : (
        <ChevronRight className="size-5 text-muted-foreground" />
      )}
    </button>
  )

  return (
    <div className="animate-in space-y-6 duration-700 fade-in">
      {/* Header */}
      <header className="flex flex-col gap-4 px-1">
        <Link
          href="/dashboard"
          className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to picker
        </Link>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Create Event
            </h1>
            <p className="text-muted-foreground">
              Set up a new conference event with schedule and settings.
            </p>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-bold text-destructive">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info Section */}
        <Card className="overflow-hidden">
          <SectionHeader
            section="basic"
            icon={Type}
            title="Basic Information"
            description="Event name and URL identifier"
          />
          {expandedSections.has("basic") && (
            <CardContent className="space-y-4 border-t border-border/50 px-5 pt-4 pb-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Event Title <span className="text-destructive">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="e.g., Annual Conference 2025"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="h-11"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Slug <span className="text-destructive">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm whitespace-nowrap text-muted-foreground">
                    /events/
                  </span>
                  <Input
                    type="text"
                    placeholder="annual-conference-2025"
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    className="h-11 flex-1 font-mono text-sm"
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  URL-friendly identifier. Auto-generated from title but can be
                  edited.
                </p>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Schedule Section */}
        <Card className="overflow-hidden">
          <SectionHeader
            section="schedule"
            icon={Calendar}
            title="Schedule"
            description="Event date, time, and timezone"
          />
          {expandedSections.has("schedule") && (
            <CardContent className="space-y-4 border-t border-border/50 px-5 pt-4 pb-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Start Date & Time{" "}
                    <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Clock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="datetime-local"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                      className="h-11 pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    End Date & Time{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <div className="relative">
                    <Clock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="datetime-local"
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                      className="h-11 pl-10"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Timezone <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Globe className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="h-11 w-full appearance-none rounded-lg border border-border/40 bg-background/50 pr-4 pl-10 text-sm transition-all focus:ring-2 focus:ring-primary/20"
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Settings Section */}
        <Card className="overflow-hidden">
          <SectionHeader
            section="settings"
            icon={Settings}
            title="Settings"
            description="Publishing, signups, and modules"
          />
          {expandedSections.has("settings") && (
            <CardContent className="space-y-6 border-t border-border/50 px-5 pt-4 pb-5">
              {/* Currency */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="h-11 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm transition-all focus:ring-2 focus:ring-primary/20"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Toggles */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium tracking-wider text-muted-foreground uppercase">
                  Status
                </h4>

                {/* Published Toggle */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium">Published</label>
                    <p className="text-xs text-muted-foreground">
                      Event is visible to the public
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newPublished = !isPublished
                      setIsPublished(newPublished)
                      if (!newPublished) {
                        setIsSignupOpen(false)
                      }
                    }}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                      isPublished ? "bg-primary" : "bg-muted-foreground/30"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block size-4 rounded-full bg-white transition-transform",
                        isPublished ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
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
                  <button
                    type="button"
                    onClick={() => setIsSignupOpen(!isSignupOpen)}
                    disabled={isSignupOpenDisabled}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                      isSignupOpen ? "bg-primary" : "bg-muted-foreground/30",
                      isSignupOpenDisabled && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block size-4 rounded-full bg-white transition-transform",
                        isSignupOpen ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>
                {isSignupOpenDisabled && (
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
                  <button
                    type="button"
                    onClick={() =>
                      setAccommodationEnabled(!accommodationEnabled)
                    }
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                      accommodationEnabled
                        ? "bg-primary"
                        : "bg-muted-foreground/30"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block size-4 rounded-full bg-white transition-transform",
                        accommodationEnabled ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Status Summary */}
              <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
                <h4 className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Combined Status
                </h4>
                <div className="flex items-center gap-2">
                  {!isPublished ? (
                    <Badge variant="outline" className="h-6">
                      Draft
                    </Badge>
                  ) : isSignupOpen ? (
                    <Badge className="h-6 border-none bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20">
                      Live — Published + Signups Open
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="h-6">
                      Published — Signups Closed
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-destructive">
              <AlertCircle className="size-4" />
              Please fix the following errors:
            </h4>
            <ul className="ml-6 space-y-1 text-sm text-destructive">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-4 pt-4">
          <Link href="/dashboard">
            <Button type="button" variant="outline" className="h-11 px-6">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={isSubmitting || validationErrors.length > 0}
            className="h-11 rounded-2xl bg-primary px-8 text-white shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create Event"}
          </Button>
        </div>
      </form>
    </div>
  )
}
