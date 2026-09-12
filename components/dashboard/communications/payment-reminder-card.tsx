"use client"

import { useEffect, useState } from "react"
import { CreditCard, Send, X } from "lucide-react"
import { render } from "@react-email/render"
import { useMutation, useQuery } from "convex/react"

import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/lib/convex/api"
import {
  paymentReminderKinds,
  type PaymentReminderKind,
} from "@/lib/domain/payment-reminders"
import {
  PAYMENT_REMINDER_COPY,
} from "@/lib/email/payment-reminder-copy"
import PaymentReminderEmail from "@/lib/email/templates/payment-reminder"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const PREVIEW_DATA: Record<
  PaymentReminderKind,
  { paidAmountMinor: number; outstandingAmountMinor: number }
> = {
  unpaid: { paidAmountMinor: 0, outstandingAmountMinor: 10_000 },
  partial: { paidAmountMinor: 2_500, outstandingAmountMinor: 7_500 },
  overdue: { paidAmountMinor: 2_500, outstandingAmountMinor: 7_500 },
}

const STATUS_LABELS = {
  queued: "Queued",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  skipped: "Skipped",
} as const

function formatDate(value: number | undefined) {
  return value ? new Date(value).toLocaleString("en-GB") : "—"
}

type ReminderDeliveryHistory = {
  _id: Id<"paymentReminderDeliveries">
  bookerName: string
  bookingRef: string
  kind: PaymentReminderKind
  recipient: string
  status: keyof typeof STATUS_LABELS
  createdAt: number
  attempts: number
  sentAt?: number
  error?: string
}

export function PaymentReminderCard(props: {
  eventId: Id<"events">
  eventTitle: string
  eventDate: number
  audienceTotal: number
  selectedCount: number
  canSend: boolean
  onClear: () => void
  onSendRequest: () => void
}) {
  const settings = useQuery(api.paymentReminders.getSettings, {
    eventId: props.eventId,
  })
  const deliveries = useQuery(api.paymentReminders.getReminderDeliveryHistory, {
    eventId: props.eventId,
    limit: 100,
  }) as ReminderDeliveryHistory[] | undefined
  const updateSettings = useMutation(api.paymentReminders.updateSettings)

  const [enabled, setEnabled] = useState(false)
  const [automaticEnabled, setAutomaticEnabled] = useState(false)
  const [dueAt, setDueAt] = useState("")
  const [cadenceMinutes, setCadenceMinutes] = useState("1440")
  const [repeatPolicy, setRepeatPolicy] = useState<
    "oncePerPeriod" | "onceEver"
  >("oncePerPeriod")
  const [previews, setPreviews] = useState<
    Partial<Record<PaymentReminderKind, string>>
  >({})
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [savePending, setSavePending] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!settings) return
    setEnabled(settings.enabled)
    setAutomaticEnabled(settings.automaticEnabled)
    setDueAt(new Date(settings.dueAt).toISOString().slice(0, 16))
    setCadenceMinutes(String(settings.cadenceMinutes))
    setRepeatPolicy(settings.repeatPolicy)
  }, [settings])

  useEffect(() => {
    let cancelled = false
    setPreviews({})
    setPreviewError(null)
    const origin = window.location.origin
    const eventDate = new Date(props.eventDate).toLocaleDateString("en-GB")

    Promise.all(
      paymentReminderKinds.map(async (kind) => {
        const balance = PREVIEW_DATA[kind]
        const html = await render(
          PaymentReminderEmail({
            kind,
            eventName: props.eventTitle,
            eventDate,
            bookerName: "Example booker",
            bookingRef: "BK-EXAMPLE",
            amountDueMinor: 10_000,
            paidAmountMinor: balance.paidAmountMinor,
            outstandingAmountMinor: balance.outstandingAmountMinor,
            currency: "EUR",
            managePaymentUrl: `${origin}/booking/BK-EXAMPLE/manage`,
          })
        )
        return [kind, html] as const
      })
    )
      .then((entries) => {
        if (!cancelled) {
          setPreviews(Object.fromEntries(entries) as Record<PaymentReminderKind, string>)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPreviewError(
            error instanceof Error
              ? error.message
              : "Could not render the reminder previews."
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [props.eventTitle, props.eventDate])

  async function save() {
    setSavePending(true)
    setSaveError(null)
    setSaveMessage(null)
    try {
      await updateSettings({
        eventId: props.eventId,
        enabled,
        automaticEnabled,
        dueAt: new Date(dueAt).getTime(),
        timezone: "UTC",
        cadenceMinutes: Number(cadenceMinutes),
        repeatPolicy,
      })
      setSaveMessage("Reminder policy saved.")
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save the reminder policy."
      )
    } finally {
      setSavePending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-4 text-primary" />
          Payment reminders
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Fixed email previews</h3>
            <span className="text-xs text-muted-foreground">
              Copy and subjects are fixed by the server contract.
            </span>
          </div>
          {previewError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {previewError}
            </p>
          ) : (
            <div className="grid gap-3 xl:grid-cols-3">
              {paymentReminderKinds.map((kind) => (
                <div key={kind} className="min-w-0 overflow-hidden rounded-xl border">
                  <p className="border-b bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide">
                    {kind} · {PAYMENT_REMINDER_COPY[kind].subject}
                  </p>
                  {previews[kind] ? (
                    <iframe
                      title={`${kind} payment reminder email preview`}
                      srcDoc={previews[kind]}
                      sandbox=""
                      className="h-[420px] w-full bg-white"
                    />
                  ) : (
                    <div className="space-y-3 p-4">
                      <Skeleton className="h-6 w-40" />
                      <Skeleton className="h-24 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Enable reminders
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={automaticEnabled}
              onChange={(event) => setAutomaticEnabled(event.target.checked)}
            />
            Automatic reminders
          </label>
          <label className="text-sm">
            Due instant (UTC)
            <input
              aria-label="Payment reminder due instant"
              className="mt-1 w-full rounded border p-2"
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </label>
          <label className="text-sm">
            Cadence (minutes)
            <input
              aria-label="Payment reminder cadence in minutes"
              className="mt-1 w-full rounded border p-2"
              type="number"
              min="1"
              value={cadenceMinutes}
              onChange={(event) => setCadenceMinutes(event.target.value)}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Repeat policy
            <select
              aria-label="Payment reminder repeat policy"
              className="mt-1 w-full rounded border p-2"
              value={repeatPolicy}
              onChange={(event) =>
                setRepeatPolicy(event.target.value as typeof repeatPolicy)
              }
            >
              <option value="oncePerPeriod">Once per period</option>
              <option value="onceEver">Once ever</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={save} disabled={savePending}>
            {savePending ? "Saving…" : "Save reminder policy"}
          </Button>
          {saveMessage && <span className="text-xs text-emerald-700">{saveMessage}</span>}
          {saveError && <span className="text-xs text-destructive">{saveError}</span>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
          <p className="text-sm text-muted-foreground">
            {props.selectedCount} selected from {props.audienceTotal} current bookers.
            {props.selectedCount === 0
              ? " Check the payment-reminder boxes below to queue a send."
              : " Only these checked order IDs will be revalidated and queued."}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={props.onClear}>
              <X className="size-3" />
              Clear
            </Button>
            <Button
              type="button"
              onClick={props.onSendRequest}
              disabled={!props.canSend}
            >
              <Send className="size-4" />
              Queue reminders
            </Button>
          </div>
        </div>

        <section aria-labelledby="payment-reminder-history-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 id="payment-reminder-history-heading" className="text-sm font-semibold">
              Delivery history
            </h3>
            <span className="text-xs text-muted-foreground">Latest 100 deliveries</span>
          </div>
          {deliveries === undefined ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : deliveries.length === 0 ? (
            <p className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
              No payment-reminder deliveries have been queued for this event.
            </p>
          ) : (
            <ul className="space-y-2">
              {deliveries.map((delivery) => (
                <li
                  key={String(delivery._id)}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {delivery.bookerName} · {delivery.bookingRef}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {delivery.kind} · {delivery.recipient} · queued {formatDate(delivery.createdAt)}
                    </p>
                    {delivery.error && (
                      <p className="mt-1 text-xs text-destructive">{delivery.error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {STATUS_LABELS[delivery.status]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {delivery.status === "sent"
                        ? formatDate(delivery.sentAt)
                        : `${delivery.attempts} attempt${delivery.attempts === 1 ? "" : "s"}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  )
}
