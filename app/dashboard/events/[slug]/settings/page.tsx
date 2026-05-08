"use client"

import { use, useState, useEffect } from "react"
import { Settings, Globe, Clock, CreditCard, AlertCircle, Trash2, Check, X, Link as LinkIcon, ArrowRight } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useUpdateEvent, useEventBySlug } from "@/lib/convex/hooks/events"
import { useRoomTypes } from "@/lib/convex/hooks/accommodation"
import { Id } from "@/convex/_generated/dataModel"
import { EventTikkieSection } from "@/components/dashboard/event-tikkie-section"

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

export default function EventSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const event = useEventBySlug(slug)
  
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Form state
  const [editTitle, setEditTitle] = useState("")
  const [editStartsAt, setEditStartsAt] = useState("")
  const [editEndsAt, setEditEndsAt] = useState("")
  const [editTimezone, setEditTimezone] = useState("")
  const [editCurrency, setEditCurrency] = useState("")
  const [editIsPublished, setEditIsPublished] = useState(false)
  const [editIsSignupOpen, setEditIsSignupOpen] = useState(false)
  const [editAccommodationEnabled, setEditAccommodationEnabled] = useState(false)
  const [editDefaultRoomTypeId, setEditDefaultRoomTypeId] = useState<Id<"accommodationRoomTypes"> | null>(null)

  const updateEvent = useUpdateEvent()
  const roomTypes = useRoomTypes()

  const formatDateTimeLocal = (timestamp: number) => {
    const date = new Date(timestamp)
    const pad = (n: number) => n.toString().padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  const parseDateTimeLocal = (value: string) => new Date(value).getTime()

  // Sync initial state
  useEffect(() => {
    if (!isEditing && event) {
      setEditTitle(event.title)
      setEditStartsAt(formatDateTimeLocal(event.startsAt))
      setEditEndsAt(event.endsAt ? formatDateTimeLocal(event.endsAt) : "")
      setEditTimezone(event.timezone)
      setEditCurrency(event.currency)
      setEditIsPublished(event.isPublished)
      setEditIsSignupOpen(event.isSignupOpen)
      setEditAccommodationEnabled(event.accommodationEnabled)
      setEditDefaultRoomTypeId(event.defaultRoomTypeId ?? null)
    }
  }, [event, isEditing])

  if (!event) return null

  const saveChanges = async () => {
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
        defaultRoomTypeId: editDefaultRoomTypeId ?? undefined,
      })
      setIsEditing(false)
    } catch (err) {
      console.error("Failed to update event:", err)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <EventTikkieSection
        events={[{ eventId: event._id, title: event.title }]}
        selectedEventId={event._id}
      />

      <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-7">
          <div>
            <CardTitle className="text-xl font-bold">Global Settings</CardTitle>
            <CardDescription className="text-muted-foreground/70">
              Core event configuration and availability
            </CardDescription>
          </div>
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)} className="rounded-xl">
              <Settings className="mr-2 size-4" /> Edit Settings
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving} className="rounded-xl border-white/20">
                Cancel
              </Button>
              <Button onClick={saveChanges} disabled={isSaving} className="rounded-xl px-6">
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid gap-8 sm:grid-cols-2">
            <div className="space-y-3">
              <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase px-1">Event Title</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                disabled={!isEditing}
                className="rounded-xl border-white/20 bg-white/50 dark:bg-black/20 h-11"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase px-1">Visibility & Access</label>
              <div className="flex flex-col gap-3 pt-1">
                <label className="flex items-center gap-3 text-sm font-medium cursor-pointer group">
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={editIsPublished}
                      onChange={(e) => setEditIsPublished(e.target.checked)}
                      disabled={!isEditing}
                      className="size-5 rounded-lg border-white/20 bg-white/50 dark:bg-black/20 transition-all checked:bg-primary"
                    />
                  </div>
                  <span>Published to Web</span>
                </label>
                <label className="flex items-center gap-3 text-sm font-medium cursor-pointer group">
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={editIsSignupOpen}
                      onChange={(e) => setEditIsSignupOpen(e.target.checked)}
                      disabled={!isEditing || !editIsPublished}
                      className="size-5 rounded-lg border-white/20 bg-white/50 dark:bg-black/20 transition-all checked:bg-primary disabled:opacity-30"
                    />
                  </div>
                  <span className={cn(!editIsPublished && "text-muted-foreground/40")}>Accepting Active Signups</span>
                </label>
              </div>
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-2">
             <div className="space-y-3">
              <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase px-1">Starts At</label>
              <Input
                type="datetime-local"
                value={editStartsAt}
                onChange={(e) => setEditStartsAt(e.target.value)}
                disabled={!isEditing}
                className="rounded-xl border-white/20 bg-white/50 dark:bg-black/20 h-11"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase px-1">Ends At</label>
              <Input
                type="datetime-local"
                value={editEndsAt}
                onChange={(e) => setEditEndsAt(e.target.value)}
                disabled={!isEditing}
                className="rounded-xl border-white/20 bg-white/50 dark:bg-black/20 h-11"
              />
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-2">
            <div className="space-y-3">
              <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase px-1">Timezone</label>
              <select
                value={editTimezone}
                onChange={(e) => setEditTimezone(e.target.value)}
                disabled={!isEditing}
                className="flex h-11 w-full rounded-xl border border-white/20 bg-white/50 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:bg-black/20"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz} className="dark:bg-zinc-900">{tz}</option>
                ))}
              </select>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase px-1">Currency</label>
              <select
                value={editCurrency}
                onChange={(e) => setEditCurrency(e.target.value)}
                disabled={!isEditing}
                className="flex h-11 w-full rounded-xl border border-white/20 bg-white/50 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:bg-black/20"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code} className="dark:bg-zinc-900">{c.name} ({c.code})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-6 border-t border-white/10">
            <div className="flex items-center justify-between pb-4">
              <div className="space-y-1">
                <p className="font-bold text-sm tracking-tight">Accommodation Module</p>
                <p className="text-xs text-muted-foreground">Inventory tracking and hotel management.</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                 <input
                  type="checkbox"
                  checked={editAccommodationEnabled}
                  onChange={(e) => setEditAccommodationEnabled(e.target.checked)}
                  disabled={!isEditing}
                  className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full bg-white/20 border border-white/10 transition-colors after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-focus:outline-none dark:bg-white/5"></div>
              </label>
            </div>

            {editAccommodationEnabled && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase px-1">Default Room Type</label>
                <select
                  value={editDefaultRoomTypeId ?? ""}
                  onChange={(e) => setEditDefaultRoomTypeId((e.target.value as Id<"accommodationRoomTypes">) || null)}
                  disabled={!isEditing}
                  className="flex h-11 w-full rounded-xl border border-white/20 bg-white/50 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:bg-black/20"
                >
                   <option value="" className="dark:bg-zinc-900">None</option>
                   {roomTypes.map((rt: any) => (
                     <option key={rt._id} value={rt._id} className="dark:bg-zinc-900">{rt.label}</option>
                   ))}
                </select>
              </div>
            )}
          </div>

          {!isEditing && (
            <div className="pt-10 mt-4 border-t border-destructive/20 group">
              <div className="flex items-center gap-3 text-destructive mb-3">
                <AlertCircle className="size-5 transition-transform group-hover:rotate-12" />
                <h3 className="text-sm font-black tracking-widest uppercase">Danger Zone</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
                Archiving this event will hide it from all public lists and the dashboard. 
                Data remains in the database but will be set to a read-only archived state.
              </p>
              <Button variant="outline" className="rounded-xl border-destructive/20 text-destructive hover:bg-destructive/10 hover:border-destructive/40 bg-transparent h-11 px-6">
                <Trash2 className="mr-3 size-4" /> Archive Event
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Link
        href={`/dashboard/events/${slug}/settings/sources`}
        className="group block rounded-[1.75rem] border border-border/50 bg-background/80 p-5 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-muted/35"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-4">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <LinkIcon className="size-5" />
            </div>
            <div>
              <p className="text-[10px] font-black tracking-[0.22em] text-muted-foreground uppercase">
                Integrations
              </p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                Event Sources
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                External integrations linked to this event
              </p>
            </div>
          </div>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
      </Link>
    </div>
  )
}
