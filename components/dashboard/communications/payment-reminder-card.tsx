"use client"

import { useEffect, useState } from "react"
import { AlarmClock } from "lucide-react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"

import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/lib/convex/api"
import type { PaymentReminderKind } from "@/lib/domain/payment-reminders"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

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

function parseUtcDateTimeLocal(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return Number.NaN
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5])
  )
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

export function PaymentReminderCard(props: { eventId: Id<"events"> }) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
  const canQuery = isAuthenticated && !authLoading
  const settings = useQuery(
    api.paymentReminders.getSettings,
    canQuery ? { eventId: props.eventId } : ("skip" as const)
  )
  const deliveries = useQuery(
    api.paymentReminders.getReminderDeliveryHistory,
    canQuery
      ? {
          eventId: props.eventId,
          limit: 100,
        }
      : ("skip" as const)
  ) as ReminderDeliveryHistory[] | undefined
  const updateSettings = useMutation(api.paymentReminders.updateSettings)

  const [enabled, setEnabled] = useState(false)
  const [automaticEnabled, setAutomaticEnabled] = useState(false)
  const [dueAt, setDueAt] = useState("")
  const [cadenceMinutes, setCadenceMinutes] = useState("1440")
  const [repeatPolicy, setRepeatPolicy] = useState<
    "oncePerPeriod" | "onceEver"
  >("oncePerPeriod")
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

  async function save() {
    setSavePending(true)
    setSaveError(null)
    setSaveMessage(null)
    try {
      await updateSettings({
        eventId: props.eventId,
        enabled,
        automaticEnabled,
        dueAt: parseUtcDateTimeLocal(dueAt),
        timezone: "UTC",
        cadenceMinutes: Number(cadenceMinutes),
        repeatPolicy,
      })
      setSaveMessage("Reminder policy saved.")
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Could not save the reminder policy."
      )
    } finally {
      setSavePending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlarmClock className="size-4 text-primary" />
          Payment reminder automation
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Keep reminder rules, scheduling, and delivery health separate from
          one-off announcements.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              aria-label="Enable payment reminders"
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Enable reminders
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              aria-label="Enable automatic payment reminders"
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
          <Button
            type="button"
            variant="outline"
            onClick={save}
            disabled={savePending}
          >
            {savePending ? "Saving…" : "Save reminder policy"}
          </Button>
          {saveMessage && (
            <span className="text-xs text-emerald-700">{saveMessage}</span>
          )}
          {saveError && (
            <span className="text-xs text-destructive">{saveError}</span>
          )}
        </div>

        <section
          aria-labelledby="payment-reminder-history-heading"
          className="space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h3
              id="payment-reminder-history-heading"
              className="text-sm font-semibold"
            >
              Delivery history
            </h3>
            <span className="text-xs text-muted-foreground">
              Latest 100 deliveries
            </span>
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
                      {delivery.kind} · {delivery.recipient} · queued{" "}
                      {formatDate(delivery.createdAt)}
                    </p>
                    {delivery.error && (
                      <p className="mt-1 text-xs text-destructive">
                        {delivery.error}
                      </p>
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
