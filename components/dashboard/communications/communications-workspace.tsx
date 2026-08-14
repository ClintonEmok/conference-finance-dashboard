"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { render } from "@react-email/render"
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Filter,
  Loader2,
  Mail,
  RotateCcw,
  Save,
  Search,
  Send,
  Trash2,
  Undo2,
  X,
} from "lucide-react"

import { api } from "@/lib/convex/api"
import type { Id } from "@/convex/_generated/dataModel"
import AnnouncementEmail from "@/lib/email/templates/announcement"
import { WorkspaceFrame } from "@/components/dashboard/workspace-frame"
import { WorkspaceTabs } from "@/components/dashboard/workspace-tabs"
import { communicationsHref } from "@/lib/dashboard/workspace-routes"
import { useEventDashboard } from "@/components/dashboard/event-dashboard-context"
import {
  readComposeDraft,
  removeComposeDraft,
  writeComposeDraft,
} from "@/lib/dashboard/communications/drafts"
import {
  BroadcastsPanel,
  describeFilters,
  type BroadcastHistoryItem,
} from "./broadcasts-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type AudienceFilters = {
  location?: string
  status?: "paid" | "pending" | "cancelled" | "refunded"
  from?: number
  to?: number
  hasAccommodationSelection?: boolean
  ticketTypeId?: Id<"ticketTypes">
}

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "success"; broadcastId?: string }
  | { status: "error"; message: string }

type TemplateState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "error"; message: string }

type AudiencePreview = {
  total: number
  skippedNoEmail: number
  skippedNoRef: number
  recipients: Array<{
    orderId: string
    bookerName: string | null
    bookerEmail: string
    bookingRef: string | null
    status: string | null
    location: string | null
    hasAccommodationSelection: boolean
    ticketTypeLabels: string[]
    submittedAt: number | null
  }>
}

type SavedTemplate = {
  _id: Id<"emailTemplates">
  name: string
  title: string
  message: string
  eventName: string
  eventDate: string
  eventLocation: string
  paymentUrl?: string
  nightBeforeNote?: string
}

const AUDIENCE_PAGE = 25
const MAX_PREVIEW_RECIPIENTS = 200
const PREVIEW_DEBOUNCE_MS = 300
const DRAFT_DEBOUNCE_MS = 500

function toDayTimestamp(dateStr: string, boundary: "start" | "end") {
  if (!dateStr) return undefined
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return undefined
  return boundary === "start"
    ? date.getTime()
    : date.getTime() + 86_400_000 - 1
}

function formatEventDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function CommunicationsWorkspace({ slug }: { slug: string }) {
  const { event } = useEventDashboard()

  // --- Compose state -------------------------------------------------------
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [eventName, setEventName] = useState(event.title)
  const [eventDate, setEventDate] = useState(
    formatEventDate(event.startsAt)
  )
  const [eventLocation, setEventLocation] = useState("")
  const [paymentUrl, setPaymentUrl] = useState("")
  const [nightBeforeNote, setNightBeforeNote] = useState("")

  // --- Audience filter state -----------------------------------------------
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [locationFilter, setLocationFilter] = useState<string>("all")
  const [fromFilter, setFromFilter] = useState("")
  const [toFilter, setToFilter] = useState("")
  const [accommodationFilter, setAccommodationFilter] = useState("all")
  const [ticketTypeFilter, setTicketTypeFilter] = useState<string>("all")

  // --- Audience search + progressive reveal --------------------------------
  const [audienceSearch, setAudienceSearch] = useState("")
  const [visibleCount, setVisibleCount] = useState(AUDIENCE_PAGE)

  // --- Send / tracking state -----------------------------------------------
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sendState, setSendState] = useState<SendState>({ status: "idle" })
  const [selectedBroadcastId, setSelectedBroadcastId] = useState<string | null>(
    null
  )
  const [testRecipient, setTestRecipient] = useState("")
  const [testState, setTestState] = useState<SendState>({ status: "idle" })

  // --- Saved template state -------------------------------------------------
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("none")
  const [templateName, setTemplateName] = useState("")
  const [templateState, setTemplateState] = useState<TemplateState>({
    status: "idle",
  })

  // --- Live preview state ---------------------------------------------------
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const previewRenderSeq = useRef(0)

  const eventLocations = useQuery(
    api.reports.getEventLocations,
    event?._id ? { eventId: event._id } : ("skip" as const)
  ) as string[] | undefined

  const ticketTypes = useQuery(
    api.events.getTicketTypesForEvent,
    event?._id ? { eventId: event._id } : ("skip" as const)
  )

  const filters = useMemo<AudienceFilters>(() => {
    const value: AudienceFilters = {}
    if (statusFilter !== "all") value.status = statusFilter as AudienceFilters["status"]
    if (locationFilter !== "all") value.location = locationFilter
    const from = toDayTimestamp(fromFilter, "start")
    const to = toDayTimestamp(toFilter, "end")
    if (from !== undefined) value.from = from
    if (to !== undefined) value.to = to
    if (accommodationFilter === "with") value.hasAccommodationSelection = true
    if (ticketTypeFilter !== "all")
      value.ticketTypeId = ticketTypeFilter as Id<"ticketTypes">
    return value
  }, [accommodationFilter, fromFilter, locationFilter, statusFilter, ticketTypeFilter, toFilter])

  const preview = useQuery(
    api.emailBroadcasts.previewAudience,
    event?._id
      ? { eventId: event._id, ...filters, limit: MAX_PREVIEW_RECIPIENTS }
      : ("skip" as const)
  ) as AudiencePreview | undefined

  const history = useQuery(
    api.emailBroadcasts.getBroadcastHistory,
    event?._id ? { eventId: event._id } : ("skip" as const)
  ) as BroadcastHistoryItem[] | undefined

  const templates = useQuery(
    api.emailTemplates.getTemplatesForEvent,
    event?._id ? { eventId: event._id } : ("skip" as const)
  ) as SavedTemplate[] | undefined

  const scheduleEmailBroadcast = useMutation(
    api.emailBroadcasts.scheduleEmailBroadcast
  )
  const cancelEmailBroadcast = useMutation(
    api.emailBroadcasts.cancelEmailBroadcast
  )
  const retryFailedEmailBroadcast = useMutation(
    api.emailBroadcasts.retryFailedEmailBroadcast
  )
  const sendAnnouncementTest = useAction(api.emailActions.sendAnnouncementTest)
  const saveTemplate = useMutation(api.emailTemplates.saveTemplate)
  const deleteTemplate = useMutation(api.emailTemplates.deleteTemplate)

  const audienceTotal = preview?.total ?? 0
  const canBroadcast = Boolean(
    title.trim() && message.trim() && audienceTotal > 0 && sendState.status !== "sending"
  )

  // --- Draft restore on mount (SSR-safe: localStorage is client-only) -------
  useEffect(() => {
    const draft = readComposeDraft(String(event._id))
    if (!draft) return
    setTitle(draft.title)
    setMessage(draft.message)
    setEventName(draft.eventName)
    setEventDate(draft.eventDate)
    setEventLocation(draft.eventLocation)
    setPaymentUrl(draft.paymentUrl)
    setNightBeforeNote(draft.nightBeforeNote)
  }, [event._id])

  // --- Debounced draft autosave ---------------------------------------------
  useEffect(() => {
    const timer = setTimeout(() => {
      writeComposeDraft(String(event._id), {
        title,
        message,
        eventName,
        eventDate,
        eventLocation,
        paymentUrl,
        nightBeforeNote,
        updatedAt: Date.now(),
      })
    }, DRAFT_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [event._id, eventDate, eventLocation, eventName, message, nightBeforeNote, paymentUrl, title])

  // --- Debounced live preview with stale-render protection ------------------
  useEffect(() => {
    const origin =
      typeof window === "undefined"
        ? "http://localhost:3000"
        : window.location.origin
    const seq = ++previewRenderSeq.current
    const timer = setTimeout(() => {
      void render(
        AnnouncementEmail({
          title: title.trim() || "Announcement title",
          message: message.trim() || "Write the announcement body…",
          eventName: eventName.trim(),
          eventDate: eventDate.trim(),
          eventLocation: eventLocation.trim(),
          manageBookingUrl: `${origin}/booking/BK-EXAMPLE/manage`,
          signupUrl: `${origin}/signup/${event.slug}`,
          paymentUrl: paymentUrl.trim() || null,
          nightBeforeNote: nightBeforeNote.trim() || null,
        })
      ).then((html) => {
        if (previewRenderSeq.current === seq) setPreviewHtml(html)
      })
    }, PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [event.slug, eventDate, eventLocation, eventName, message, nightBeforeNote, paymentUrl, title])

  // --- Reset audience search/reveal when the filters change -----------------
  useEffect(() => {
    setAudienceSearch("")
    setVisibleCount(AUDIENCE_PAGE)
  }, [filters])

  // --- Select a sensible initial broadcast without polling ------------------
  useEffect(() => {
    if (!selectedBroadcastId && history && history.length > 0) {
      setSelectedBroadcastId(String(history[0]._id))
    }
  }, [history, selectedBroadcastId])

  const searchedRecipients = useMemo(() => {
    const rows = preview?.recipients ?? []
    const query = audienceSearch.trim().toLowerCase()
    if (!query) return rows
    return rows.filter(
      (recipient) =>
        (recipient.bookerName ?? "").toLowerCase().includes(query) ||
        recipient.bookerEmail.toLowerCase().includes(query) ||
        (recipient.bookingRef ?? "").toLowerCase().includes(query)
    )
  }, [audienceSearch, preview])

  const visibleRecipients = searchedRecipients.slice(0, visibleCount)
  const canRevealMore = visibleRecipients.length < searchedRecipients.length

  async function handleTestSend() {
    const to = testRecipient.trim()
    if (!to) {
      setTestState({ status: "error", message: "Enter a recipient email." })
      return
    }
    setTestState({ status: "sending" })
    try {
      const origin = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin
      const result = await sendAnnouncementTest({
        to,
        title: title.trim(),
        message: message.trim(),
        eventName: eventName.trim(),
        eventDate: eventDate.trim(),
        eventLocation: eventLocation.trim(),
        manageBookingUrl: `${origin}/booking/test/manage`,
        signupUrl: `${origin}/signup/${event.slug}`,
        paymentUrl: paymentUrl.trim() || undefined,
        nightBeforeNote: nightBeforeNote.trim() || undefined,
      })
      if (!result.success) {
        setTestState({ status: "error", message: result.error ?? "Send failed." })
        return
      }
      setTestState({ status: "success" })
    } catch (error) {
      setTestState({
        status: "error",
        message: error instanceof Error ? error.message : "Send failed.",
      })
    }
  }

  async function handleConfirmSend() {
    if (!event) return
    setConfirmOpen(false)
    setSendState({ status: "sending" })
    try {
      const result = await scheduleEmailBroadcast({
        eventId: event._id,
        title: title.trim(),
        message: message.trim(),
        eventName: eventName.trim(),
        eventDate: eventDate.trim(),
        eventLocation: eventLocation.trim(),
        paymentUrl: paymentUrl.trim() || undefined,
        nightBeforeNote: nightBeforeNote.trim() || undefined,
        filters: filters as never,
        authorize: true,
      })
      setSelectedBroadcastId(String(result.broadcastId))
      setSendState({ status: "success", broadcastId: String(result.broadcastId) })
    } catch (error) {
      setSendState({
        status: "error",
        message: error instanceof Error ? error.message : "Send failed.",
      })
    }
  }

  async function handleCancel() {
    if (!selectedBroadcastId) return
    await cancelEmailBroadcast({ broadcastId: selectedBroadcastId as Id<"emailBroadcasts"> })
  }

  async function handleRetry() {
    if (!selectedBroadcastId) return
    await retryFailedEmailBroadcast({ broadcastId: selectedBroadcastId as Id<"emailBroadcasts"> })
  }

  function handleLoadTemplate(id: string) {
    if (id === "none") {
      setSelectedTemplateId("none")
      setTemplateName("")
      return
    }
    const template = (templates ?? []).find(
      (item) => String(item._id) === id
    )
    if (!template) return
    setTitle(template.title)
    setMessage(template.message)
    setEventName(template.eventName)
    setEventDate(template.eventDate)
    setEventLocation(template.eventLocation)
    setPaymentUrl(template.paymentUrl ?? "")
    setNightBeforeNote(template.nightBeforeNote ?? "")
    setSelectedTemplateId(id)
    setTemplateName(template.name)
    setTemplateState({ status: "idle" })
  }

  function handleDiscardTemplate() {
    setSelectedTemplateId("none")
    setTemplateName("")
    setTemplateState({ status: "idle" })
  }

  async function handleSaveAsTemplate() {
    if (!event) return
    const name = templateName.trim()
    if (!name) {
      setTemplateState({
        status: "error",
        message: "Enter a template name to save.",
      })
      return
    }
    setTemplateState({ status: "saving" })
    try {
      const id = await saveTemplate({
        eventId: event._id,
        templateId:
          selectedTemplateId !== "none"
            ? (selectedTemplateId as Id<"emailTemplates">)
            : undefined,
        name,
        title: title.trim(),
        message: message.trim(),
        eventName: eventName.trim(),
        eventDate: eventDate.trim(),
        eventLocation: eventLocation.trim(),
        paymentUrl: paymentUrl.trim() || undefined,
        nightBeforeNote: nightBeforeNote.trim() || undefined,
      })
      setSelectedTemplateId(String(id))
      setTemplateState({ status: "idle" })
    } catch (error) {
      setTemplateState({
        status: "error",
        message: error instanceof Error ? error.message : "Save failed.",
      })
    }
  }

  async function handleDeleteTemplate() {
    if (!event || selectedTemplateId === "none") return
    try {
      await deleteTemplate({
        eventId: event._id,
        templateId: selectedTemplateId as Id<"emailTemplates">,
      })
      setSelectedTemplateId("none")
      setTemplateName("")
      setTemplateState({ status: "idle" })
    } catch (error) {
      setTemplateState({
        status: "error",
        message: error instanceof Error ? error.message : "Delete failed.",
      })
    }
  }

  function handleDiscardDraft() {
    removeComposeDraft(String(event._id))
    setTitle("")
    setMessage("")
    setEventName(event.title)
    setEventDate(formatEventDate(event.startsAt))
    setEventLocation("")
    setPaymentUrl("")
    setNightBeforeNote("")
  }

  const tabs = useMemo(
    () => [{ value: "communications", label: "Broadcast", href: communicationsHref(slug) }],
    [slug]
  )

  return (
    <WorkspaceFrame
      title="Communications"
      description="Compose announcements, select an audience of order bookers, and send asynchronously with live status."
      eventLabel={event.title}
      workspaceLabel="Communications"
      workspaceId="communications"
      activeTab="communications"
      tabs={
        <WorkspaceTabs
          workspaceId="communications"
          tabs={tabs}
          activeTab="communications"
        />
      }
    >
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)]">
        {/* Left rail: compose, templates, audience, send */}
        <div className="min-w-0 space-y-6">
          <ComposeCard
            title={title}
            onTitleChange={setTitle}
            message={message}
            onMessageChange={setMessage}
            eventName={eventName}
            onEventNameChange={setEventName}
            eventDate={eventDate}
            onEventDateChange={setEventDate}
            eventLocation={eventLocation}
            onEventLocationChange={setEventLocation}
            paymentUrl={paymentUrl}
            onPaymentUrlChange={setPaymentUrl}
            nightBeforeNote={nightBeforeNote}
            onNightBeforeNoteChange={setNightBeforeNote}
            onDiscardDraft={handleDiscardDraft}
          />

          <TemplateCard
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            onSelectTemplate={handleLoadTemplate}
            onDiscardTemplate={handleDiscardTemplate}
            templateName={templateName}
            onTemplateNameChange={setTemplateName}
            onSaveTemplate={handleSaveAsTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            templateState={templateState}
          />

          <AudienceCard
            eventId={event._id}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            locationFilter={locationFilter}
            onLocationFilterChange={setLocationFilter}
            fromFilter={fromFilter}
            onFromFilterChange={setFromFilter}
            toFilter={toFilter}
            onToFilterChange={setToFilter}
            accommodationFilter={accommodationFilter}
            onAccommodationFilterChange={setAccommodationFilter}
            ticketTypeFilter={ticketTypeFilter}
            onTicketTypeFilterChange={setTicketTypeFilter}
            eventLocations={eventLocations}
            ticketTypes={ticketTypes}
            preview={preview}
            audienceSearch={audienceSearch}
            onAudienceSearchChange={setAudienceSearch}
            visibleRecipients={visibleRecipients}
            canRevealMore={canRevealMore}
            revealCount={searchedRecipients.length - visibleRecipients.length}
            onRevealMore={() =>
              setVisibleCount((count) => count + AUDIENCE_PAGE)
            }
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="size-4 text-primary" />
                Send
              </CardTitle>
              <CardDescription>
                First send a diagnostic to a controlled inbox, then broadcast to
                the {audienceTotal} selected booker{audienceTotal === 1 ? "" : "s"}.
                Broadcasting requires explicit confirmation and is delivered
                asynchronously.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex min-w-0 flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <Label htmlFor="test-recipient">Test recipient email</Label>
                  <Input
                    id="test-recipient"
                    type="email"
                    placeholder="your@inbox.com"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestSend}
                  disabled={testState.status === "sending"}
                >
                  {testState.status === "sending" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Mail className="size-4" />
                  )}
                  Send test email
                </Button>
              </div>

              {testState.status === "success" && (
                <Alert>
                  <CheckCircle2 className="size-4" />
                  <AlertTitle>Test sent</AlertTitle>
                  <AlertDescription>
                    The announcement was delivered to {testRecipient}.
                  </AlertDescription>
                </Alert>
              )}
              {testState.status === "error" && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertTitle>Test failed</AlertTitle>
                  <AlertDescription>{testState.message}</AlertDescription>
                </Alert>
              )}

              <div className="flex min-w-0 flex-wrap items-center gap-3 border-t border-border/60 pt-4">
                <Button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!canBroadcast}
                >
                  {sendState.status === "sending" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Send to {audienceTotal} booker{audienceTotal === 1 ? "" : "s"}
                </Button>
                {sendState.status === "error" && (
                  <span className="text-sm text-destructive">{sendState.message}</span>
                )}
                {sendState.status === "success" && sendState.broadcastId && (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                    <CheckCircle2 className="size-4" />
                    Broadcast scheduled — tracking below.
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right rail: sticky live email preview */}
        <div className="min-w-0">
          <div className="space-y-6 xl:sticky xl:top-6">
            <PreviewCard previewHtml={previewHtml} />
          </div>
        </div>
      </div>

      {/* Below the fold: unified broadcast history + tracking */}
      <div className="mt-6 min-w-0">
        <BroadcastsPanel
          history={history}
          broadcastId={selectedBroadcastId}
          onSelect={setSelectedBroadcastId}
          onCancel={handleCancel}
          onRetry={handleRetry}
          ticketTypes={ticketTypes}
        />
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm broadcast</DialogTitle>
            <DialogDescription>
              This will send the announcement to{" "}
              <strong>{audienceTotal} booker{audienceTotal === 1 ? "" : "s"}</strong>{" "}
              asynchronously. You can track progress and cancel while it is
              running.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm">
            <p>
              <span className="font-semibold">Subject:</span> {title.trim() || "—"}
            </p>
            <p>
              <span className="font-semibold">Audience filters:</span>{" "}
              {describeFilters(filters, ticketTypes)}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSend}
              disabled={sendState.status === "sending"}
            >
              {sendState.status === "sending" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Confirm & send"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspaceFrame>
  )
}

function ComposeCard(props: {
  title: string
  onTitleChange: (value: string) => void
  message: string
  onMessageChange: (value: string) => void
  eventName: string
  onEventNameChange: (value: string) => void
  eventDate: string
  onEventDateChange: (value: string) => void
  eventLocation: string
  onEventLocationChange: (value: string) => void
  paymentUrl: string
  onPaymentUrlChange: (value: string) => void
  nightBeforeNote: string
  onNightBeforeNoteChange: (value: string) => void
  onDiscardDraft: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Mail className="size-4 text-primary" />
              Compose announcement
            </CardTitle>
            <CardDescription>
              Rendered with the standard AnnouncementEmail template, including
              Manage Booking and Register links. Autosaved as a draft while you
              type.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={props.onDiscardDraft}
          >
            <Undo2 className="size-3.5" />
            Discard draft
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ann-title">Subject / title</Label>
          <Input
            id="ann-title"
            value={props.title}
            onChange={(e) => props.onTitleChange(e.target.value)}
            placeholder="e.g. New accommodation options are available"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ann-location">Event location</Label>
          <Input
            id="ann-location"
            value={props.eventLocation}
            onChange={(e) => props.onEventLocationChange(e.target.value)}
            placeholder="e.g. Eindhoven, Netherlands"
          />
        </div>
        <div className="space-y-2 lg:col-span-2">
          <Label htmlFor="ann-message">Message</Label>
          <textarea
            id="ann-message"
            rows={6}
            value={props.message}
            onChange={(e) => props.onMessageChange(e.target.value)}
            placeholder="Write the announcement body…"
            className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ann-event-name">Event name</Label>
          <Input
            id="ann-event-name"
            value={props.eventName}
            onChange={(e) => props.onEventNameChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ann-event-date">Event date</Label>
          <Input
            id="ann-event-date"
            value={props.eventDate}
            onChange={(e) => props.onEventDateChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ann-payment-url">Payment URL (optional)</Label>
          <Input
            id="ann-payment-url"
            type="url"
            value={props.paymentUrl}
            onChange={(e) => props.onPaymentUrlChange(e.target.value)}
            placeholder="https://tikkie.me/…"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ann-night-before">Night before note (optional)</Label>
          <Input
            id="ann-night-before"
            value={props.nightBeforeNote}
            onChange={(e) => props.onNightBeforeNoteChange(e.target.value)}
            placeholder="e.g. An extra night is available for early arrivals."
          />
        </div>
      </CardContent>
    </Card>
  )
}

function TemplateCard(props: {
  templates:
    | Array<{
        _id: Id<"emailTemplates">
        name: string
      }>
    | undefined
  selectedTemplateId: string
  onSelectTemplate: (id: string) => void
  onDiscardTemplate: () => void
  templateName: string
  onTemplateNameChange: (value: string) => void
  onSaveTemplate: () => void
  onDeleteTemplate: () => void
  templateState: TemplateState
}) {
  const hasSelection = props.selectedTemplateId !== "none"
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Save className="size-4 text-primary" />
          Saved templates
        </CardTitle>
        <CardDescription>
          Load a previously saved announcement for this event, save the current
          compose state as a template, or remove a template.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-2">
            <Label htmlFor="ann-template-picker">Template</Label>
            <Select
              value={props.selectedTemplateId}
              onValueChange={props.onSelectTemplate}
            >
              <SelectTrigger id="ann-template-picker">
                <SelectValue placeholder="No template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No template</SelectItem>
                {(props.templates ?? []).map((template) => (
                  <SelectItem key={String(template._id)} value={String(template._id)}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasSelection && (
            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={props.onDiscardTemplate}
              >
                <X className="size-3.5" />
                Discard template
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={props.onDeleteTemplate}
              >
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-wrap items-end gap-3 border-t border-border/60 pt-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="ann-template-name">Template name</Label>
            <Input
              id="ann-template-name"
              value={props.templateName}
              onChange={(e) => props.onTemplateNameChange(e.target.value)}
              placeholder={hasSelection ? "Update template name…" : "e.g. Options announcement"}
            />
          </div>
          <Button
            type="button"
            onClick={props.onSaveTemplate}
            disabled={props.templateState.status === "saving"}
          >
            {props.templateState.status === "saving" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {hasSelection ? "Update template" : "Save as template"}
          </Button>
        </div>

        {props.templateState.status === "error" && (
          <p className="text-sm text-destructive">{props.templateState.message}</p>
        )}
      </CardContent>
    </Card>
  )
}

function AudienceCard(props: {
  eventId: Id<"events">
  statusFilter: string
  onStatusFilterChange: (value: string) => void
  locationFilter: string
  onLocationFilterChange: (value: string) => void
  fromFilter: string
  onFromFilterChange: (value: string) => void
  toFilter: string
  onToFilterChange: (value: string) => void
  accommodationFilter: string
  onAccommodationFilterChange: (value: string) => void
  ticketTypeFilter: string
  onTicketTypeFilterChange: (value: string) => void
  eventLocations: string[] | undefined
  ticketTypes: Array<{ _id: Id<"ticketTypes">; label: string }> | undefined
  preview:
    | {
        total: number
        skippedNoEmail: number
        skippedNoRef: number
        recipients: Array<{
          bookerName: string | null
          bookerEmail: string
          bookingRef: string | null
          status: string | null
          location: string | null
          ticketTypeLabels: string[]
        }>
      }
    | undefined
  audienceSearch: string
  onAudienceSearchChange: (value: string) => void
  visibleRecipients: Array<{
    bookerName: string | null
    bookerEmail: string
    bookingRef: string | null
    status: string | null
    location: string | null
    ticketTypeLabels: string[]
  }>
  canRevealMore: boolean
  revealCount: number
  onRevealMore: () => void
}) {
  const locations = props.eventLocations ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="size-4 text-primary" />
          Audience
        </CardTitle>
        <CardDescription>
          Order bookers matching all selected filters. Live count updates as you
          filter; search and reveal rows up to 200.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid min-w-0 gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="aud-status">Order status</Label>
            <Select
              value={props.statusFilter}
              onValueChange={props.onStatusFilterChange}
            >
              <SelectTrigger id="aud-status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="aud-location">Location</Label>
            <Select
              value={props.locationFilter}
              onValueChange={props.onLocationFilterChange}
            >
              <SelectTrigger id="aud-location">
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location} value={location}>
                    {location}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="aud-accommodation">Accommodation</Label>
            <Select
              value={props.accommodationFilter}
              onValueChange={props.onAccommodationFilterChange}
            >
              <SelectTrigger id="aud-accommodation">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="with">With a selection</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="aud-from">Submitted from</Label>
            <Input
              id="aud-from"
              type="date"
              value={props.fromFilter}
              onChange={(e) => props.onFromFilterChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aud-to">Submitted to</Label>
            <Input
              id="aud-to"
              type="date"
              value={props.toFilter}
              onChange={(e) => props.onToFilterChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aud-ticket">Ticket type</Label>
            <Select
              value={props.ticketTypeFilter}
              onValueChange={props.onTicketTypeFilterChange}
            >
              <SelectTrigger id="aud-ticket">
                <SelectValue placeholder="All tickets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tickets</SelectItem>
                {(props.ticketTypes ?? []).map((ticketType) => (
                  <SelectItem key={String(ticketType._id)} value={String(ticketType._id)}>
                    {ticketType.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {props.preview === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <Badge variant="secondary" className="text-sm">
                {props.preview.total} booker{props.preview.total === 1 ? "" : "s"}
              </Badge>
              {props.preview.skippedNoEmail > 0 && (
                <span className="text-xs text-muted-foreground">
                  {props.preview.skippedNoEmail} without an email skipped
                </span>
              )}
              {props.preview.skippedNoRef > 0 && (
                <span className="text-xs text-muted-foreground">
                  {props.preview.skippedNoRef} without a booking reference skipped
                </span>
              )}
            </div>

            {props.preview.recipients.length === 0 ? (
              <p className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                No bookers match these filters.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="audience-search"
                    type="search"
                    value={props.audienceSearch}
                    onChange={(e) => props.onAudienceSearchChange(e.target.value)}
                    placeholder="Search by name, email, or booking reference"
                    className="pl-9"
                  />
                </div>

                {props.visibleRecipients.length === 0 ? (
                  <p className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                    No bookers match your search.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Booking ref</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Tickets</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {props.visibleRecipients.map((recipient) => (
                          <TableRow key={recipient.bookerEmail}>
                            <TableCell className="font-medium">
                              {recipient.bookerName ?? "—"}
                            </TableCell>
                            <TableCell>{recipient.bookerEmail}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {recipient.bookingRef ?? "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{recipient.status ?? "—"}</Badge>
                            </TableCell>
                            <TableCell>{recipient.location ?? "—"}</TableCell>
                            <TableCell>
                              {recipient.ticketTypeLabels.length > 0
                                ? recipient.ticketTypeLabels.join(", ")
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {props.canRevealMore && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={props.onRevealMore}
                  >
                    Show more ({props.revealCount} more)
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function PreviewCard({ previewHtml }: { previewHtml: string | null }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/60 bg-muted/20">
        <CardTitle className="flex items-center gap-2">
          <Eye className="size-4 text-primary" />
          Live preview
        </CardTitle>
        <CardDescription>
          Real AnnouncementEmail rendering of the compose values, refreshed as
          you type.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {previewHtml === null ? (
          <div className="flex h-[560px] items-center justify-center bg-white p-6">
            <p className="text-center text-sm text-muted-foreground">
              The preview appears here as you compose.
            </p>
          </div>
        ) : (
          <iframe
            title="Announcement email live preview"
            srcDoc={previewHtml}
            className="h-[760px] w-full bg-white"
          />
        )}
      </CardContent>
    </Card>
  )
}
