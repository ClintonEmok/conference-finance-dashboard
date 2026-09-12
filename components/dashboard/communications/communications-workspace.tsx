"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import {
  AlarmClock,
  CreditCard,
  FileText,
  History,
  Mail,
  Megaphone,
  Search,
  Send,
  Users,
} from "lucide-react"

import { api } from "@/lib/convex/api"
import type { Id } from "@/convex/_generated/dataModel"
import { WorkspaceFrame } from "@/components/dashboard/workspace-frame"
import { WorkspaceTabs } from "@/components/dashboard/workspace-tabs"
import {
  communicationsHref,
  parseCommunicationsView,
  type CommunicationsView,
} from "@/lib/dashboard/workspace-routes"
import { useEventDashboard } from "@/components/dashboard/event-dashboard-context"
import { PaymentReminderCard } from "./payment-reminder-card"
import { BroadcastsPanel, type BroadcastHistoryItem } from "./broadcasts-panel"
import { TemplateLibrary } from "./template-library"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useSearchParams } from "next/navigation"

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
    ticketTypeLabels: string[]
  }>
}

type AudienceRecipient = AudiencePreview["recipients"][number]
type EmailKind = "announcement" | "payment"
type ComposerStep = "type" | "recipients"

const AUDIENCE_PAGE = 25
const MAX_PREVIEW_RECIPIENTS = 200

export function CommunicationsWorkspace({ slug }: { slug: string }) {
  const { event } = useEventDashboard()
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
  const canQuery = isAuthenticated && !authLoading
  const searchParams = useSearchParams()
  const activeView = parseCommunicationsView(searchParams.toString())

  // --- Audience search + progressive reveal --------------------------------
  const [audienceSearch, setAudienceSearch] = useState("")
  const [visibleCount, setVisibleCount] = useState(AUDIENCE_PAGE)

  // --- Broadcast tracking state --------------------------------------------
  const [selectedBroadcastId, setSelectedBroadcastId] = useState<string | null>(
    null
  )
  const [broadcastActionError, setBroadcastActionError] = useState<
    string | null
  >(null)
  const [broadcastActionPending, setBroadcastActionPending] = useState(false)

  // --- Guided email composer state ------------------------------------------
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerStep, setComposerStep] = useState<ComposerStep>("type")
  const [emailKind, setEmailKind] = useState<EmailKind>("announcement")
  const [sendPending, setSendPending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<Set<string>>(
    new Set()
  )
  const [allMatching, setAllMatching] = useState(false)

  const previewAudienceEnabled =
    activeView === "audience" ||
    (activeView === "send" && !(composerOpen && emailKind === "payment"))
  const paymentPreviewEnabled =
    activeView === "send" && composerOpen && emailKind === "payment"
  const historyEnabled = activeView === "history"

  const ticketTypes = useQuery(
    api.events.getTicketTypesForEvent,
    canQuery && event?._id && historyEnabled
      ? { eventId: event._id }
      : ("skip" as const)
  )

  const preview = useQuery(
    api.emailBroadcasts.previewAudience,
    canQuery && event?._id && previewAudienceEnabled
      ? {
          eventId: event._id,
          search: audienceSearch.trim() || undefined,
          limit: MAX_PREVIEW_RECIPIENTS,
        }
      : ("skip" as const)
  ) as AudiencePreview | undefined

  const paymentPreview = useQuery(
    api.paymentReminders.previewPaymentReminderAudience,
    canQuery && event?._id && paymentPreviewEnabled
      ? {
          eventId: event._id,
          search: audienceSearch.trim() || undefined,
          limit: MAX_PREVIEW_RECIPIENTS,
        }
      : ("skip" as const)
  ) as AudiencePreview | undefined

  const history = useQuery(
    api.emailBroadcasts.getBroadcastHistory,
    canQuery && event?._id && historyEnabled
      ? { eventId: event._id }
      : ("skip" as const)
  ) as BroadcastHistoryItem[] | undefined

  const cancelEmailBroadcast = useMutation(
    api.emailBroadcasts.cancelEmailBroadcast
  )
  const retryFailedEmailBroadcast = useMutation(
    api.emailBroadcasts.retryFailedEmailBroadcast
  )
  const scheduleEmailBroadcast = useMutation(
    api.emailBroadcasts.scheduleEmailBroadcast
  )
  const scheduleManualPaymentReminders = useMutation(
    api.paymentReminders.scheduleManualPaymentReminders
  )

  // --- Reset progressive reveal when the search changes ---------------------
  useEffect(() => {
    setVisibleCount(AUDIENCE_PAGE)
    setSelectedRecipientIds(new Set())
    setAllMatching(false)
  }, [audienceSearch])

  // --- Clear the selected broadcast when the event changes ------------------
  useEffect(() => {
    setSelectedBroadcastId(null)
    setSelectedRecipientIds(new Set())
    setAllMatching(false)
  }, [event._id])

  // --- Select a sensible initial broadcast without polling ------------------
  useEffect(() => {
    if (!selectedBroadcastId && history && history.length > 0) {
      setSelectedBroadcastId(String(history[0]._id))
    }
  }, [history, selectedBroadcastId])

  const previewRecipients = preview?.recipients
  const composerPreview = emailKind === "payment" ? paymentPreview : preview
  const composerPreviewRecipients = composerPreview?.recipients
  const recipients = useMemo(
    () => previewRecipients ?? [],
    [previewRecipients]
  )
  const composerRecipients = useMemo(
    () => composerPreviewRecipients ?? [],
    [composerPreviewRecipients]
  )
  const visibleRecipients = useMemo(
    () => recipients.slice(0, visibleCount),
    [recipients, visibleCount]
  )
  const visibleComposerRecipients = useMemo(
    () => composerRecipients.slice(0, visibleCount),
    [composerRecipients, visibleCount]
  )
  const canRevealMore = visibleRecipients.length < recipients.length

  async function handleCancel() {
    if (!selectedBroadcastId || broadcastActionPending) return
    setBroadcastActionPending(true)
    setBroadcastActionError(null)
    try {
      await cancelEmailBroadcast({
        broadcastId: selectedBroadcastId as Id<"emailBroadcasts">,
      })
    } catch (error) {
      setBroadcastActionError(
        error instanceof Error ? error.message : "Could not cancel broadcast."
      )
    } finally {
      setBroadcastActionPending(false)
    }
  }

  async function handleRetry() {
    if (!selectedBroadcastId || broadcastActionPending) return
    setBroadcastActionPending(true)
    setBroadcastActionError(null)
    try {
      await retryFailedEmailBroadcast({
        broadcastId: selectedBroadcastId as Id<"emailBroadcasts">,
      })
    } catch (error) {
      setBroadcastActionError(
        error instanceof Error ? error.message : "Could not retry broadcast."
      )
    } finally {
      setBroadcastActionPending(false)
    }
  }

  // --- Queue the selected email type for the exact current audience ---------
  const trimmedSearch = audienceSearch.trim()
  const audienceTotal = preview?.total ?? 0
  const composerAudienceTotal = composerPreview?.total ?? 0
  const selectedCount = allMatching
    ? composerAudienceTotal
    : selectedRecipientIds.size
  const canSend = selectedCount > 0 && selectedCount <= 2000 && !sendPending
  const selectionFor = (ids: Set<string>, selectAll: boolean) =>
    selectAll
      ? { mode: "allMatching" as const, search: trimmedSearch || undefined }
      : {
          mode: "explicit" as const,
          orderIds: Array.from(ids) as Id<"orders">[],
        }

  async function handleSend() {
    if (sendPending || selectedCount === 0 || selectedCount > 2000) return
    setSendPending(true)
    setSendError(null)
    try {
      const selection = selectionFor(selectedRecipientIds, allMatching)
      if (emailKind === "announcement") {
        const result = await scheduleEmailBroadcast({
          eventId: event._id,
          selection,
          authorize: true,
        })
        setSelectedBroadcastId(String(result.broadcastId))
      } else {
        await scheduleManualPaymentReminders({
          eventId: event._id,
          selection,
          authorize: true,
        })
      }
      setComposerOpen(false)
      setComposerStep("type")
      setSelectedRecipientIds(new Set())
      setAllMatching(false)
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Could not queue this email."
      )
    } finally {
      setSendPending(false)
    }
  }

  function openComposer() {
    setComposerStep("type")
    setEmailKind("announcement")
    setSelectedRecipientIds(new Set())
    setAllMatching(false)
    setSendError(null)
    setComposerOpen(true)
  }

  function changeEmailKind(kind: EmailKind) {
    setEmailKind(kind)
    setSelectedRecipientIds(new Set())
    setAllMatching(false)
  }

  const tabs = useMemo<
    Array<{
      value: CommunicationsView
      label: string
      href: string
      icon: ReactNode
    }>
  >(
    () => [
      {
        value: "send",
        label: "Send",
        href: communicationsHref(slug, "send"),
        icon: <Mail className="size-4" />,
      },
      {
        value: "templates",
        label: "Templates",
        href: communicationsHref(slug, "templates"),
        icon: <FileText className="size-4" />,
      },
      {
        value: "audience",
        label: "Audience",
        href: communicationsHref(slug, "audience"),
        icon: <Users className="size-4" />,
      },
      {
        value: "reminders",
        label: "Reminders",
        href: communicationsHref(slug, "reminders"),
        icon: <AlarmClock className="size-4" />,
      },
      {
        value: "history",
        label: "History",
        href: communicationsHref(slug, "history"),
        icon: <History className="size-4" />,
      },
    ],
    [slug]
  )

  return (
    <WorkspaceFrame
      title="Communications"
      eventLabel={event.title}
      workspaceLabel="Communications"
      workspaceId="communications"
      activeTab={activeView}
      tabs={
        <WorkspaceTabs
          workspaceId="communications"
          tabs={tabs}
          activeTab={activeView}
        />
      }
    >
      <div className="min-w-0 space-y-6">
        {activeView === "send" && (
          <SendView audienceTotal={audienceTotal} onOpen={openComposer} />
        )}

        {activeView === "templates" && (
          <TemplateLibrary
            eventTitle={event.title}
            eventStartsAt={event.startsAt}
            eventSlug={event.slug}
            eventTimezone={event.timezone}
            currency={event.currency}
          />
        )}

        {activeView === "audience" && (
          <AudienceView
            preview={preview}
            audienceSearch={audienceSearch}
            onAudienceSearchChange={setAudienceSearch}
            visibleRecipients={visibleRecipients}
            canRevealMore={canRevealMore}
            revealCount={recipients.length - visibleRecipients.length}
            onRevealMore={() =>
              setVisibleCount((count) => count + AUDIENCE_PAGE)
            }
          />
        )}

        {activeView === "reminders" && <RemindersView eventId={event._id} />}

        {activeView === "history" && (
          <HistoryView
            history={history}
            broadcastId={selectedBroadcastId}
            onSelect={setSelectedBroadcastId}
            onCancel={handleCancel}
            onRetry={handleRetry}
            actionPending={broadcastActionPending}
            actionError={broadcastActionError}
            ticketTypes={ticketTypes}
          />
        )}
      </div>

      <EmailComposerDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        step={composerStep}
        kind={emailKind}
        onKindChange={changeEmailKind}
        onStepChange={setComposerStep}
        audienceSearch={audienceSearch}
        onAudienceSearchChange={setAudienceSearch}
        preview={composerPreview}
        visibleRecipients={visibleComposerRecipients}
        selectedRecipientIds={selectedRecipientIds}
        allMatching={allMatching}
        selectedCount={selectedCount}
        canSend={canSend}
        sendPending={sendPending}
        sendError={sendError}
        onSelectAll={() => setAllMatching(true)}
        onClear={() => {
          setAllMatching(false)
          setSelectedRecipientIds(new Set())
        }}
        onToggle={(id) => {
          if (allMatching) return
          setSelectedRecipientIds((current) => {
            const next = new Set(current)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
          })
        }}
        onSend={handleSend}
      />
    </WorkspaceFrame>
  )
}

function ViewHeading(props: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        {props.eyebrow}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {props.title}
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        {props.description}
      </p>
    </div>
  )
}

function SendView(props: { audienceTotal: number; onOpen: () => void }) {
  return (
    <div className="space-y-5">
      <ViewHeading
        eyebrow="Dispatch desk"
        title="Send an email"
        description="Start a deliberate send without mixing message design, audience review, or reminder policy into the same workspace."
      />
      <SendEmailCard
        audienceTotal={props.audienceTotal}
        onOpen={props.onOpen}
      />
      <div className="grid gap-4 md:grid-cols-3">
        {[
          [
            "01",
            "Choose a message",
            "Select the fixed announcement or a personalized payment reminder.",
          ],
          [
            "02",
            "Define the audience",
            "Pick named bookers or select every eligible booker matching the search.",
          ],
          [
            "03",
            "Queue and track",
            "Confirm once, then follow asynchronous delivery in History.",
          ],
        ].map(([number, title, description]) => (
          <div key={number} className="rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              {number}
            </p>
            <p className="mt-3 font-medium">{title}</p>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function AudienceView(props: Parameters<typeof AudienceCard>[0]) {
  return (
    <div className="space-y-5">
      <ViewHeading
        eyebrow="Recipient directory"
        title="Audience"
        description="Search the current eligible booker audience independently from message templates and send actions."
      />
      <AudienceCard {...props} />
    </div>
  )
}

function RemindersView(props: { eventId: Id<"events"> }) {
  return (
    <div className="space-y-5">
      <ViewHeading
        eyebrow="Payment operations"
        title="Payment reminders"
        description="Configure automatic reminder policy and inspect reminder delivery health here, away from one-off broadcasts."
      />
      <PaymentReminderCard eventId={props.eventId} />
    </div>
  )
}

function HistoryView(props: {
  history: BroadcastHistoryItem[] | undefined
  broadcastId: string | null
  onSelect: (id: string) => void
  onCancel: () => void
  onRetry: () => void
  actionPending: boolean
  actionError: string | null
  ticketTypes: Array<{ _id: Id<"ticketTypes">; label: string }> | undefined
}) {
  return (
    <div className="space-y-5">
      <ViewHeading
        eyebrow="Delivery ledger"
        title="Broadcast history"
        description="Inspect queued, sending, completed, failed, and cancelled announcement jobs without competing with the send flow."
      />
      <BroadcastsPanel {...props} />
    </div>
  )
}

function SendEmailCard(props: { audienceTotal: number; onOpen: () => void }) {
  return (
    <Card className="overflow-hidden border-primary/20 bg-primary/[0.03]">
      <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Mail className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
              Communications
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              Send an email
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Choose the message first, then select individual bookers or all{" "}
              {props.audienceTotal} eligible bookers.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="lg"
          onClick={props.onOpen}
          disabled={props.audienceTotal === 0}
        >
          <Send className="size-4" />
          Start email
        </Button>
      </CardContent>
    </Card>
  )
}

function EmailComposerDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  step: ComposerStep
  kind: EmailKind
  onKindChange: (kind: EmailKind) => void
  onStepChange: (step: ComposerStep) => void
  audienceSearch: string
  onAudienceSearchChange: (value: string) => void
  preview: AudiencePreview | undefined
  visibleRecipients: AudienceRecipient[]
  selectedRecipientIds: Set<string>
  allMatching: boolean
  selectedCount: number
  canSend: boolean
  sendPending: boolean
  sendError: string | null
  onSelectAll: () => void
  onClear: () => void
  onToggle: (id: string) => void
  onSend: () => void
}) {
  const isAnnouncement = props.kind === "announcement"

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[min(780px,calc(100vh-2rem))] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-primary uppercase">
            <span>Send email</span>
            <span className="text-muted-foreground">/</span>
            <span>
              {props.step === "type" ? "01 Message" : "02 Recipients"}
            </span>
          </div>
          <DialogTitle className="text-xl">
            {props.step === "type"
              ? "What kind of email do you want to send?"
              : "Who should receive it?"}
          </DialogTitle>
          <DialogDescription>
            {props.step === "type"
              ? "The message copy is fixed and personalized from the event data."
              : props.kind === "payment"
                ? "Only bookers with a current outstanding balance are shown. Choose specific bookers, or select all eligible reminder recipients."
                : "Choose specific bookers, or use all eligible to select the complete current audience."}
          </DialogDescription>
        </DialogHeader>

        {props.step === "type" ? (
          <div className="grid gap-3 py-1 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed={isAnnouncement}
              onClick={() => props.onKindChange("announcement")}
              className={`rounded-xl border p-4 text-left transition-colors ${isAnnouncement ? "border-primary bg-primary/[0.06] ring-2 ring-primary/20" : "hover:bg-muted/50"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Megaphone className="size-4" />
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  Fixed copy
                </span>
              </div>
              <p className="mt-4 font-semibold">Standard announcement</p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Share the event update, registration link, and accommodation
                options.
              </p>
            </button>
            <button
              type="button"
              aria-pressed={!isAnnouncement}
              onClick={() => props.onKindChange("payment")}
              className={`rounded-xl border p-4 text-left transition-colors ${!isAnnouncement ? "border-primary bg-primary/[0.06] ring-2 ring-primary/20" : "hover:bg-muted/50"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700">
                  <CreditCard className="size-4" />
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  Personalized
                </span>
              </div>
              <p className="mt-4 font-semibold">Payment reminder</p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Remind bookers about an outstanding balance with the correct
                reminder copy.
              </p>
            </button>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="composer-audience-search"
                type="search"
                aria-label="Search audience in email composer"
                value={props.audienceSearch}
                onChange={(event) =>
                  props.onAudienceSearchChange(event.target.value)
                }
                placeholder="Search by name, email, or booking reference"
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3">
              <div>
                <p className="font-medium">
                  {props.selectedCount} selected
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    of {props.preview?.total ?? 0} eligible
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {props.allMatching
                    ? props.kind === "payment"
                      ? "Every eligible reminder recipient matching this search will be rechecked on the server."
                      : "Every eligible booker matching this search will be rechecked on the server."
                    : props.kind === "payment"
                      ? "Only bookers with an outstanding balance are listed."
                      : "Select one or more bookers below."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={props.onSelectAll}
                  disabled={!props.preview?.total || props.allMatching}
                >
                  All eligible
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={props.onClear}
                  disabled={!props.selectedCount}
                >
                  Clear
                </Button>
              </div>
            </div>

            {props.preview === undefined ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : props.visibleRecipients.length === 0 ? (
              <p className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
                {props.kind === "payment"
                  ? "No bookers with an outstanding balance match this search."
                  : "No eligible bookers match this search."}
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-xl border">
                <ul className="divide-y">
                  {props.visibleRecipients.map((recipient) => {
                    const checked =
                      props.allMatching ||
                      props.selectedRecipientIds.has(recipient.orderId)
                    return (
                      <li key={recipient.orderId}>
                        <label className="flex cursor-pointer items-center gap-3 p-3 transition-colors hover:bg-muted/40">
                          <input
                            aria-label={`Select ${recipient.bookerEmail}`}
                            type="checkbox"
                            checked={checked}
                            disabled={props.allMatching}
                            onChange={() => props.onToggle(recipient.orderId)}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {recipient.bookerName ?? "Unnamed booker"}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {recipient.bookerEmail} · {recipient.bookingRef}
                            </span>
                          </span>
                          <Badge
                            variant="outline"
                            className="ml-auto shrink-0 text-[11px]"
                          >
                            {recipient.status ?? "pending"}
                          </Badge>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {(props.preview?.total ?? 0) > props.visibleRecipients.length && (
              <p className="text-xs text-muted-foreground">
                Showing the first {props.visibleRecipients.length} recipients.
                “All eligible” includes the full server-side audience.
              </p>
            )}
            {props.sendError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                {props.sendError}
              </p>
            )}
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs text-amber-900">
              This queues the email for asynchronous delivery. Recipient
              eligibility, balances, and lifecycle status are checked again
              before payment reminders are sent.
            </p>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button
              type="button"
              variant="outline"
              disabled={props.sendPending}
            >
              Cancel
            </Button>
          </DialogClose>
          {props.step === "type" ? (
            <Button
              type="button"
              onClick={() => props.onStepChange("recipients")}
            >
              Choose recipients
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => props.onStepChange("type")}
                disabled={props.sendPending}
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={props.onSend}
                disabled={!props.canSend || props.sendPending}
              >
                {props.sendPending ? (
                  <span className="flex items-center gap-2">
                    <Skeleton className="size-3 animate-pulse rounded-full" />{" "}
                    Queuing…
                  </span>
                ) : (
                  `Confirm ${isAnnouncement ? "announcement" : "reminder"}`
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AudienceCard(props: {
  preview:
    | {
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
          ticketTypeLabels: string[]
        }>
      }
    | undefined
  audienceSearch: string
  onAudienceSearchChange: (value: string) => void
  visibleRecipients: Array<{
    orderId: string
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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4 text-primary" />
          Audience
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="audience-search"
            type="search"
            aria-label="Search audience"
            value={props.audienceSearch}
            onChange={(e) => props.onAudienceSearchChange(e.target.value)}
            placeholder="Search by name, email, or booking reference"
            className="pl-9"
          />
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
                {props.preview.total} booker
                {props.preview.total === 1 ? "" : "s"}
              </Badge>
              {props.preview.skippedNoEmail > 0 && (
                <span className="text-xs text-muted-foreground">
                  {props.preview.skippedNoEmail} without an email skipped
                </span>
              )}
              {props.preview.skippedNoRef > 0 && (
                <span className="text-xs text-muted-foreground">
                  {props.preview.skippedNoRef} without a booking reference
                  skipped
                </span>
              )}
            </div>

            {props.preview.recipients.length === 0 ? (
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
                      <TableRow key={recipient.orderId}>
                        <TableCell className="font-medium">
                          {recipient.bookerName ?? "—"}
                        </TableCell>
                        <TableCell>{recipient.bookerEmail}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {recipient.bookingRef ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {recipient.status ?? "—"}
                          </Badge>
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
          </>
        )}
      </CardContent>
    </Card>
  )
}
