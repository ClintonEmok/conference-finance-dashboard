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
  Plus,
  Building2,
  Copy,
  ExternalLink,
  Ticket,
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
import {
  useHotels,
  useEventHotels,
  useLinkHotelToEvent,
  useUnlinkHotelFromEvent,
  useCreateHotel,
  useCreateRooms,
  useCreateRoomType,
  useRoomTypes,
} from "@/lib/convex/hooks/accommodation"
import { useAccommodationSummaryForEvent } from "@/lib/convex/hooks/accommodation"
import { LinkedHotelCard } from "./components/linked-hotel-card"
import { AddHotelDialog } from "./components/add-hotel-dialog"
import {
  useTicketTypesForEvent,
  useCreateTicketType,
  useUpdateTicketType,
  useDeleteTicketType,
} from "@/lib/convex/hooks/events"

type TabKey = "overview" | "settings" | "sources" | "accommodation" | "tickets"

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

function CopyButton({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      const fullUrl = `${window.location.origin}${url}`
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  return (
    <button
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        handleCopy()
      }}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      title={`Copy ${label}`}
    >
      {copied ? (
        <>
          <Check className="size-3 text-emerald-500" />
          <span className="text-emerald-500">Copied!</span>
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

  // Hotel selection state
  const [isLinkingHotel, setIsLinkingHotel] = useState(false)
  const [isAddHotelDialogOpen, setIsAddHotelDialogOpen] = useState(false)

  const hotels = useHotels()
  const roomTypes = useRoomTypes()
  const eventHotels = useEventHotels(event?._id ?? "")
  const linkHotelToEvent = useLinkHotelToEvent()
  const unlinkHotelFromEvent = useUnlinkHotelFromEvent()
  const accommodationSummary = useAccommodationSummaryForEvent(event?._id)
  const createHotel = useCreateHotel()
  const createRooms = useCreateRooms()
  const createRoomType = useCreateRoomType()

  // Ticket types state
  const ticketTypes = useTicketTypesForEvent(event?._id)
  const createTicketType = useCreateTicketType()
  const updateTicketType = useUpdateTicketType()
  const deleteTicketType = useDeleteTicketType()

  // Ticket form state
  const [isAddingTicket, setIsAddingTicket] = useState(false)
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null)
  const [ticketLabel, setTicketLabel] = useState("")
  const [ticketPrice, setTicketPrice] = useState("")
  const [ticketQuantity, setTicketQuantity] = useState("")
  const [ticketIsActive, setTicketIsActive] = useState(true)
  const [ticketVisibility, setTicketVisibility] = useState<"public" | "hidden">(
    "public"
  )

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

  const handleAddHotelSubmit = async (data: {
    hotelId?: any
    newHotel?: { name: string; city?: string; address?: string }
    roomTypes: Array<{
      id: string
      label: string
      capacity: number
      roomCount: number
    }>
  }) => {
    if (!event) return
    setIsLinkingHotel(true)
    try {
      let hotelId: any

      // Step 1: Create or use existing hotel
      if (data.hotelId) {
        hotelId = data.hotelId
      } else if (data.newHotel) {
        hotelId = await createHotel({
          name: data.newHotel.name,
          city: data.newHotel.city,
        })
      }

      if (!hotelId) throw new Error("Failed to get or create hotel")

      // Step 2: Create room types for new room types
      const roomTypeMap = new Map<string, any>()
      for (const rt of data.roomTypes) {
        if (rt.id.startsWith("new-")) {
          // Create new room type
          const newRtId = await createRoomType({
            label: rt.label,
            defaultCapacity: rt.capacity,
          })
          roomTypeMap.set(rt.id, newRtId)
        } else {
          // Use existing room type
          roomTypeMap.set(rt.id, rt.id)
        }
      }

      // Step 3: Create rooms (this will auto-generate slots when linked)
      for (const rt of data.roomTypes) {
        const roomTypeId = roomTypeMap.get(rt.id)
        if (!roomTypeId) continue

        // Create the specified number of rooms for this type
        const roomLabels = Array.from(
          { length: rt.roomCount },
          (_, i) => `${rt.label} ${String(i + 1).padStart(2, "0")}`
        )

        await createRooms({
          hotelId,
          roomTypeId,
          quantity: rt.roomCount,
          labels: roomLabels,
        })
      }

      // Step 4: Link hotel to event (this will auto-generate slots for all rooms)
      await linkHotelToEvent({
        eventId: event._id,
        hotelId,
        autoGenerateSlots: true,
      })
    } catch (err) {
      console.error("Failed to add hotel:", err)
      throw err
    } finally {
      setIsLinkingHotel(false)
    }
  }

  const handleUnlinkHotel = async (hotelId: string) => {
    if (!event) return
    try {
      await unlinkHotelFromEvent({
        eventId: event._id,
        hotelId: hotelId as any,
      })
    } catch (err) {
      console.error("Failed to unlink hotel:", err)
    }
  }

  // Ticket handlers
  const handleAddTicket = async () => {
    if (!event || !ticketLabel.trim() || !ticketPrice) return
    try {
      await createTicketType({
        eventId: event._id,
        label: ticketLabel.trim(),
        priceMinor: Math.round(parseFloat(ticketPrice) * 100),
        maxQuantity: ticketQuantity ? parseInt(ticketQuantity) : undefined,
        isActive: ticketIsActive,
        visibility: ticketVisibility,
      })
      // Reset form
      setTicketLabel("")
      setTicketPrice("")
      setTicketQuantity("")
      setTicketIsActive(true)
      setTicketVisibility("public")
      setIsAddingTicket(false)
    } catch (err) {
      console.error("Failed to create ticket:", err)
    }
  }

  const handleUpdateTicket = async () => {
    if (!editingTicketId || !ticketLabel.trim() || !ticketPrice) return
    try {
      await updateTicketType({
        ticketTypeId: editingTicketId as any,
        label: ticketLabel.trim(),
        priceMinor: Math.round(parseFloat(ticketPrice) * 100),
        maxQuantity: ticketQuantity ? parseInt(ticketQuantity) : undefined,
        isActive: ticketIsActive,
        visibility: ticketVisibility,
      })
      setEditingTicketId(null)
      setTicketLabel("")
      setTicketPrice("")
      setTicketQuantity("")
    } catch (err) {
      console.error("Failed to update ticket:", err)
    }
  }

  const handleDeleteTicket = async (ticketTypeId: string) => {
    if (!confirm("Are you sure you want to delete this ticket type?")) return
    try {
      await deleteTicketType({ ticketTypeId: ticketTypeId as any })
    } catch (err) {
      console.error("Failed to delete ticket:", err)
    }
  }

  const startEditingTicket = (ticket: any) => {
    setEditingTicketId(ticket._id)
    setTicketLabel(ticket.label)
    setTicketPrice((ticket.priceMinor / 100).toFixed(2))
    setTicketQuantity(ticket.maxQuantity?.toString() ?? "")
    setTicketIsActive(ticket.isActive)
    setTicketVisibility(ticket.visibility)
  }

  const cancelTicketEdit = () => {
    setIsAddingTicket(false)
    setEditingTicketId(null)
    setTicketLabel("")
    setTicketPrice("")
    setTicketQuantity("")
    setTicketIsActive(true)
    setTicketVisibility("public")
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
    { key: "tickets", label: "Tickets", icon: Ticket },
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

            {/* Public URLs */}
            {event.isPublished ? (
              <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/50 bg-muted/20 p-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    Public URLs
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`/events/${event.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded px-2 py-1 font-mono text-xs text-primary transition-colors hover:bg-muted"
                      >
                        <ExternalLink className="size-3" />
                        <span>/events/{event.slug}</span>
                      </a>
                      <CopyButton
                        url={`/events/${event.slug}`}
                        label="Event page URL"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`/signup/${event.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded bg-primary/10 px-2 py-1 font-mono text-xs text-primary transition-colors hover:bg-primary/20"
                      >
                        <ExternalLink className="size-3" />
                        <span>/signup/{event.slug}</span>
                      </a>
                      <CopyButton
                        url={`/signup/${event.slug}`}
                        label="Signup URL"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/50 bg-muted/10 p-3">
                <p className="text-xs text-muted-foreground italic">
                  Event is not published. Publish to get public URLs.
                </p>
              </div>
            )}
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

              {/* Hotels Section - Enhanced with LinkedHotelCard */}
              {event.accommodationEnabled && !isEditing && (
                <div className="mt-6 border-t border-border/50 pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="flex items-center gap-2 text-sm font-medium">
                        <Building2 className="size-4" />
                        Linked Hotels
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Hotels available for room assignments at this event
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {eventHotels === undefined ? (
                      <>
                        <Skeleton className="h-24" />
                        <Skeleton className="h-24" />
                      </>
                    ) : eventHotels.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/50 p-4 text-center text-sm text-muted-foreground">
                        No hotels linked yet. Add hotels to enable room
                        assignments.
                      </div>
                    ) : (
                      eventHotels.map((hotel: any) => (
                        <LinkedHotelCard
                          key={hotel._id}
                          hotel={hotel}
                          onUnlink={handleUnlinkHotel}
                          onAddRooms={(hotelId) => {
                            // TODO: Open inline room creation dialog
                            console.log("Add rooms to hotel:", hotelId)
                          }}
                          isUnlinking={isLinkingHotel}
                        />
                      ))
                    )}

                    {/* Add Hotel Button */}
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setIsAddHotelDialogOpen(true)}
                    >
                      <Plus className="mr-2 size-4" />
                      Add Hotel
                    </Button>
                  </div>
                </div>
              )}

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
            <CardContent className="space-y-6">
              {/* Accommodation Stats */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {accommodationSummary?.hotelsLinked ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Hotels Linked</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {accommodationSummary?.totalSlots ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Slots</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {accommodationSummary?.submissionsCount ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Submissions</p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-4 py-8">
                <Link href={`/dashboard/accommodation/${event.slug}`}>
                  <Button size="lg" variant="outline">
                    <BedDouble className="mr-2 size-4" />
                    Event Accommodation
                  </Button>
                </Link>
                <Link href={`/dashboard/accommodation?eventId=${event._id}`}>
                  <Button size="lg">
                    <Building2 className="mr-2 size-4" />
                    Full Workspace
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "tickets" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Ticket Types</CardTitle>
                  <CardDescription>
                    Manage ticket types, pricing, and availability
                  </CardDescription>
                </div>
                {!isAddingTicket && !editingTicketId && (
                  <Button onClick={() => setIsAddingTicket(true)}>
                    <Plus className="mr-2 size-4" />
                    Add Ticket
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Add/Edit Ticket Form */}
              {(isAddingTicket || editingTicketId) && (
                <div className="space-y-4 rounded-lg border border-border/50 bg-muted/20 p-4">
                  <h4 className="font-medium">
                    {editingTicketId ? "Edit Ticket" : "New Ticket"}
                  </h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Ticket Name</label>
                      <input
                        type="text"
                        value={ticketLabel}
                        onChange={(e) => setTicketLabel(e.target.value)}
                        placeholder="e.g., Early Bird, Standard"
                        className="h-10 w-full rounded-lg border border-border/40 bg-background/50 px-3 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Price ({event.currency})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={ticketPrice}
                        onChange={(e) => setTicketPrice(e.target.value)}
                        placeholder="0.00"
                        className="h-10 w-full rounded-lg border border-border/40 bg-background/50 px-3 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Quantity Available
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={ticketQuantity}
                        onChange={(e) => setTicketQuantity(e.target.value)}
                        placeholder="Unlimited"
                        className="h-10 w-full rounded-lg border border-border/40 bg-background/50 px-3 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Visibility</label>
                      <select
                        value={ticketVisibility}
                        onChange={(e) =>
                          setTicketVisibility(
                            e.target.value as "public" | "hidden"
                          )
                        }
                        className="h-10 w-full rounded-lg border border-border/40 bg-background/50 px-3 text-sm"
                      >
                        <option value="public">Public</option>
                        <option value="hidden">Hidden</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={ticketIsActive}
                        onChange={(e) => setTicketIsActive(e.target.checked)}
                        className="size-4 rounded border-border"
                      />
                      Active
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={cancelTicketEdit}>
                      Cancel
                    </Button>
                    <Button
                      onClick={
                        editingTicketId ? handleUpdateTicket : handleAddTicket
                      }
                      disabled={!ticketLabel.trim() || !ticketPrice}
                    >
                      {editingTicketId ? "Update" : "Add"} Ticket
                    </Button>
                  </div>
                </div>
              )}

              {/* Ticket List */}
              {ticketTypes === undefined ? (
                <Skeleton className="h-48" />
              ) : ticketTypes.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Ticket className="mx-auto mb-3 size-12 opacity-30" />
                  <p className="font-medium">No ticket types yet</p>
                  <p className="text-sm">
                    Add your first ticket type to start selling tickets.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {ticketTypes.map((ticket: any) => (
                    <div
                      key={ticket._id}
                      className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{ticket.label}</p>
                          <Badge
                            variant={ticket.isActive ? "default" : "outline"}
                            className="text-[10px]"
                          >
                            {ticket.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {ticket.visibility}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {event.currency}{" "}
                          {(ticket.priceMinor / 100).toFixed(2)}
                          {ticket.maxQuantity && (
                            <span className="ml-2">
                              · {ticket.maxQuantity - (ticket.soldCount || 0)}{" "}
                              of {ticket.maxQuantity} available
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditingTicket(ticket)}
                        >
                          <Edit className="size-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteTicket(ticket._id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add Hotel Dialog */}
      <AddHotelDialog
        open={isAddHotelDialogOpen}
        onOpenChange={setIsAddHotelDialogOpen}
        eventId={event?._id as any}
        existingHotels={hotels}
        existingRoomTypes={roomTypes}
        onSubmit={handleAddHotelSubmit}
        isSubmitting={isLinkingHotel}
      />
    </div>
  )
}
