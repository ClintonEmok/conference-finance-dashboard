"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import {
  BedDouble,
  CalendarDays,
  Calendar,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  Flag,
  Mail,
  MapPin,
  ReceiptText,
  Tag,
  UserRound,
  Utensils,
  Users,
} from "lucide-react"

import {
  TikkieLinkDialog,
  type TikkieLinkDialogDefaults,
  type TikkieLinkDialogValues,
} from "@/components/dashboard/tikkie-link-dialog"
import {
  TikkieLinkSummary,
  type TikkieLinkSummaryRecord,
} from "@/components/dashboard/tikkie-link-summary"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type AttendeeDetailPayload = {
  attendee: {
    id: string
    name: string | null
    email: string | null
    ticketTypeLabel: string | null
    ticketStatus: string | null
    checkedInAt: string | null
    providerIssuedTicketId: string | null
    providerOrderId: string
    providerEventId: string
    tikkieAmountOverrideMinor: number | null
  }
  event: {
    id: string
    name: string | null
  }
  order: {
    id: string
    providerOrderId: string
    providerEventId: string
    buyerName: string | null
    buyerEmail: string | null
    normalizedStatus: "paid" | "refunded" | "cancelled" | "pending"
    orderedAt: string | null
    totalAmountMinor: number
  }
  finance: {
    outstandingAmountMinor: number
    paidAmountMinor: number
    installmentProgress: {
      totalLinks: number
      paidLinks: number
      openLinks: number
      expiredLinks: number
    }
  }
  tikkie: {
    latestLink: TikkieLinkSummaryRecord | null
    history: TikkieLinkSummaryRecord[]
    providerLastCheckedAt: string | null
    latestLinkCheckState: "fresh" | "stale" | null
    generationDefaults: {
      amountMinor: number
      expiryDate: string
      description: string
      referenceId: string
    }
    templateFallback: {
      hasTemplate: boolean
      source: "override" | "template" | "default"
      amountMinor: number | null
      description: string | null
    } | null
    actions: {
      createEndpoint: string
      listEndpoint: string
      refreshEndpoint: string
      updateOverrideEndpoint: string
    }
  }
  paymentHistory: Array<{
    id: string
    type: "payment-link" | "status-transition"
    title: string
    status: string
    amountMinor: number | null
    happenedAt: string
    note: string | null
    url: string | null
  }>
  roomStatus:
    | {
        status: "assigned"
        roomLabel: string
        hotelName: string
        roomTypeLabel: string
      }
    | {
        status: "unassigned"
        roomLabel: null
        hotelName: null
        roomTypeLabel: null
      }
  signals: {
    genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
    location: string | null
    remarks: string | null
    dietary: string | null
    roommatePreference: string | null
    allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"
    priorityReason: string | null
    ageGroup: string | null
    ticketCategory: string | null
  }
}

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-"
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

function formatStatusLabel(value: string | null) {
  if (!value) {
    return "-"
  }

  return value.replace(/[-_]/g, " ")
}

function paymentMethodLabel(
  entry: AttendeeDetailPayload["paymentHistory"][number]
) {
  return entry.type === "payment-link" ? "Tikkie" : "Status update"
}

function paymentMethodClasses(
  entry: AttendeeDetailPayload["paymentHistory"][number]
) {
  if (entry.type === "payment-link") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
  }

  return "bg-slate-100 text-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
}

type PageProps = {
  params: Promise<{
    attendeeId: string
  }>
}

export default function AttendeeDetailPage({ params }: PageProps) {
  const searchParams = useSearchParams()
  const [attendeeId, setAttendeeId] = useState<string | null>(null)
  const [payload, setPayload] = useState<AttendeeDetailPayload | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isTikkieDialogOpen, setIsTikkieDialogOpen] = useState(false)
  const [isSubmittingTikkie, setIsSubmittingTikkie] = useState(false)
  const [isRefreshingTikkie, setIsRefreshingTikkie] = useState(false)
  const [isCopyingLatestLink, setIsCopyingLatestLink] = useState(false)
  const [tikkieError, setTikkieError] = useState<string | null>(null)
  const [isEditingOverride, setIsEditingOverride] = useState(false)
  const [overrideValue, setOverrideValue] = useState<string>("")
  const [isSavingOverride, setIsSavingOverride] = useState(false)
  const [overrideError, setOverrideError] = useState<string | null>(null)

  const attendeeSearch = searchParams.get("search")
  const eventId = searchParams.get("eventId")
  const source = searchParams.get("source")

  const backToAttendeesHref = (() => {
    const params = new URLSearchParams()

    if (attendeeSearch) {
      params.set("search", attendeeSearch)
    }

    if (eventId) {
      params.set("eventId", eventId)
    }

    if (source) {
      params.set("source", source)
    }

    const query = params.toString()
    return query ? `/dashboard/attendees?${query}` : "/dashboard/attendees"
  })()

  const manageRoomAssignmentHref = (() => {
    if (!attendeeId) {
      return "/dashboard/accommodation"
    }

    const params = new URLSearchParams({
      attendeeId,
      source: "attendee-detail",
    })

    if (payload?.attendee.name) {
      params.set("search", payload.attendee.name)
    } else if (attendeeSearch) {
      params.set("search", attendeeSearch)
    }

    if (eventId ?? payload?.attendee.providerEventId) {
      params.set("eventId", eventId ?? payload?.attendee.providerEventId ?? "")
    }

    return `/dashboard/accommodation?${params.toString()}`
  })()

  async function loadAttendeeDetail(
    targetAttendeeId: string,
    options?: { silent?: boolean }
  ) {
    if (!options?.silent) {
      setIsLoading(true)
    }

    setErrorMessage(null)

    try {
      const response = await fetch(
        `/api/dashboard/attendees/${targetAttendeeId}`
      )
      const body = (await response.json().catch(() => null)) as
        | AttendeeDetailPayload
        | { error?: { message?: string } }
        | null

      if (!response.ok) {
        setPayload(null)
        setErrorMessage(
          body && "error" in body
            ? (body.error?.message ?? "Failed to load attendee detail.")
            : "Failed to load attendee detail."
        )
        return false
      }

      setPayload(body as AttendeeDetailPayload)
      return true
    } catch {
      setPayload(null)
      setErrorMessage("Network error while loading attendee detail.")
      return false
    } finally {
      if (!options?.silent) {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    let cancelled = false

    async function resolveParamsAndLoad() {
      const resolved = await params

      if (cancelled) {
        return
      }

      setAttendeeId(resolved.attendeeId)
      if (!cancelled) {
        await loadAttendeeDetail(resolved.attendeeId)
      }
    }

    void resolveParamsAndLoad()

    return () => {
      cancelled = true
    }
  }, [params])

  const paymentProgress = useMemo(() => {
    if (!payload || payload.order.totalAmountMinor <= 0) {
      return 0
    }

    return Math.max(
      0,
      Math.min(
        100,
        Math.round(
          (payload.finance.paidAmountMinor / payload.order.totalAmountMinor) *
            100
        )
      )
    )
  }, [payload])

  const attendeeName = payload?.attendee.name ?? "Unnamed attendee"
  const attendeeInitials = attendeeName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")

  const tikkieDialogDefaults: TikkieLinkDialogDefaults | null = payload
    ? {
        providerOrderId: payload.attendee.providerOrderId,
        providerEventId: payload.attendee.providerEventId,
        ...payload.tikkie.generationDefaults,
      }
    : null

  async function handleCreateTikkieLink(values: TikkieLinkDialogValues) {
    if (!payload) {
      return
    }

    setIsSubmittingTikkie(true)
    setTikkieError(null)

    try {
      const response = await fetch(payload.tikkie.actions.createEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providerOrderId: payload.attendee.providerOrderId,
          providerEventId: payload.attendee.providerEventId,
          amountMinor: values.amountMinor,
          description: values.description,
          expiryDate: values.expiryDate,
          referenceId: values.referenceId,
        }),
      })
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string }
      } | null

      if (!response.ok) {
        setTikkieError(
          body?.error?.message ?? `Failed to create link (${response.status}).`
        )
        return
      }

      setIsTikkieDialogOpen(false)
      await loadAttendeeDetail(payload.attendee.id, { silent: true })
    } catch {
      setTikkieError("Network error while creating link.")
    } finally {
      setIsSubmittingTikkie(false)
    }
  }

  async function handleRefreshTikkie() {
    if (!payload) {
      return
    }

    setIsRefreshingTikkie(true)
    setTikkieError(null)

    try {
      const response = await fetch(payload.tikkie.actions.refreshEndpoint)
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string }
      } | null

      if (!response.ok) {
        setTikkieError(
          body?.error?.message ??
            `Failed to refresh link status (${response.status}).`
        )
        return
      }

      await loadAttendeeDetail(payload.attendee.id, { silent: true })
    } catch {
      setTikkieError("Network error while refreshing Tikkie status.")
    } finally {
      setIsRefreshingTikkie(false)
    }
  }

  async function handleCopyLatestLink(url: string) {
    setIsCopyingLatestLink(true)
    setTikkieError(null)

    try {
      await navigator.clipboard.writeText(url)
    } catch {
      setTikkieError("Clipboard permission denied. Copy the URL manually.")
    } finally {
      setIsCopyingLatestLink(false)
    }
  }

  async function handleSaveOverride() {
    if (!payload) {
      return
    }

    const euros = Number.parseFloat(overrideValue.trim())
    if (isNaN(euros) || euros <= 0) {
      setOverrideError("Please enter a valid positive amount in euros.")
      return
    }

    setIsSavingOverride(true)
    setOverrideError(null)

    try {
      const response = await fetch(
        payload.tikkie.actions.updateOverrideEndpoint,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tikkieAmountOverrideMinor: Math.round(euros * 100),
          }),
        }
      )

      if (!response.ok) {
        const body = (await response.json()) as {
          error?: { message?: string }
        } | null
        throw new Error(body?.error?.message ?? "Failed to save override")
      }

      setIsEditingOverride(false)
      await loadAttendeeDetail(payload.attendee.id, { silent: true })
    } catch (err) {
      setOverrideError(
        err instanceof Error ? err.message : "Failed to save override"
      )
    } finally {
      setIsSavingOverride(false)
    }
  }

  async function handleClearOverride() {
    if (!payload) {
      return
    }

    setIsSavingOverride(true)
    setOverrideError(null)

    try {
      const response = await fetch(
        payload.tikkie.actions.updateOverrideEndpoint,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tikkieAmountOverrideMinor: null }),
        }
      )

      if (!response.ok) {
        const body = (await response.json()) as {
          error?: { message?: string }
        } | null
        throw new Error(body?.error?.message ?? "Failed to clear override")
      }

      setIsEditingOverride(false)
      await loadAttendeeDetail(payload.attendee.id, { silent: true })
    } catch (err) {
      setOverrideError(
        err instanceof Error ? err.message : "Failed to clear override"
      )
    } finally {
      setIsSavingOverride(false)
    }
  }

  return (
    <section className="space-y-6">
      {errorMessage && (
        <article className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {errorMessage}
        </article>
      )}

      {!errorMessage && isLoading && (
        <article className="rounded-xl border border-border bg-background/80 p-5 text-sm text-muted-foreground shadow-sm backdrop-blur">
          Loading attendee detail...
        </article>
      )}

      {!errorMessage && !isLoading && payload && (
        <>
          <section className="rounded-xl border border-border/70 bg-background/88 p-5 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex gap-4">
                <div className="flex size-28 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(145deg,rgba(113,84,255,0.18),rgba(83,56,171,0.12))] text-3xl font-semibold text-primary shadow-inner">
                  {attendeeInitials || "A"}
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
                    <span>Directory</span>
                    <ChevronRight className="size-3" />
                    <span>Attendee details</span>
                  </div>

                  <div>
                    <h2 className="text-4xl font-semibold tracking-tight text-primary md:text-5xl">
                      {attendeeName}
                    </h2>
                    <p className="mt-2 text-lg text-muted-foreground">
                      {payload.attendee.ticketTypeLabel ??
                        payload.event.name ??
                        payload.attendee.providerEventId}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border/70 bg-background px-3 py-1.5">
                      Event:{" "}
                      {payload.event.name ?? payload.attendee.providerEventId}
                    </span>
                    <span className="rounded-full border border-border/70 bg-background px-3 py-1.5">
                      Order: {payload.order.providerOrderId}
                    </span>
                    <span className="rounded-full border border-border/70 bg-background px-3 py-1.5 capitalize">
                      Status: {payload.order.normalizedStatus}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex min-w-[250px] flex-col gap-2">
                <Button asChild variant="outline" className="justify-start">
                  <Link href={backToAttendeesHref}>Back to attendees</Link>
                </Button>
                <Button asChild className="justify-start">
                  <Link href={manageRoomAssignmentHref}>
                    Manage room assignment
                  </Link>
                </Button>
              </div>
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_340px]">
            <Card className="bg-background/88 backdrop-blur">
              <CardHeader className="flex flex-wrap items-center justify-between gap-3 sm:flex-row">
                <div>
                  <CardTitle className="text-2xl text-primary">
                    Financial status
                  </CardTitle>
                  <CardDescription>
                    Live payment health across Ticket Tailor and Tikkie
                    activity.
                  </CardDescription>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium tracking-[0.18em] text-primary uppercase">
                  {payload.finance.installmentProgress.totalLinks > 0
                    ? "Installments active"
                    : "No installments"}
                </span>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                      Total amount due
                    </p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight">
                      {formatMoney(payload.order.totalAmountMinor)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                      Amount paid
                    </p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-300">
                      {formatMoney(payload.finance.paidAmountMinor)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                      Remaining balance
                    </p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-rose-600 dark:text-rose-300">
                      {formatMoney(payload.finance.outstandingAmountMinor)}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-lg font-medium">Payment progress</p>
                    <p className="text-2xl font-semibold text-primary">
                      {paymentProgress}%
                    </p>
                  </div>
                  <div className="h-3 rounded-full bg-muted">
                    <div
                      className="h-3 rounded-full bg-[linear-gradient(90deg,#0f6b21,#6bcc74)]"
                      style={{ width: `${paymentProgress}%` }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {payload.finance.installmentProgress.openLinks} open links,{" "}
                    {payload.finance.installmentProgress.expiredLinks} expired,{" "}
                    {payload.finance.installmentProgress.paidLinks} paid.
                  </p>
                </div>

                <div className="space-y-4 rounded-2xl border border-border/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.88))] p-4 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.68),rgba(17,24,39,0.76))]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.2em] text-cyan-700 uppercase dark:text-cyan-300">
                        Tikkie follow-up
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Keep the latest link visible here so payment follow-up
                        stays in the same attendee context.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        isSubmittingTikkie ||
                        payload.finance.outstandingAmountMinor <= 0
                      }
                      onClick={() => {
                        setTikkieError(null)
                        setIsTikkieDialogOpen(true)
                      }}
                    >
                      {isSubmittingTikkie
                        ? "Generating..."
                        : "Generate Tikkie link"}
                    </Button>
                  </div>

                  {/* Amount Override Section */}
                  <div className="rounded-lg border border-slate-200/80 bg-white/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase dark:text-slate-400">
                          Amount override
                        </p>
                        {payload.attendee.tikkieAmountOverrideMinor !== null ? (
                          <div className="mt-1">
                            <p className="text-lg font-semibold text-foreground">
                              {formatMoney(
                                payload.attendee.tikkieAmountOverrideMinor
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Custom amount for this attendee (overrides
                              template/default)
                            </p>
                          </div>
                        ) : (
                          <div className="mt-1">
                            <p className="text-sm text-muted-foreground">
                              No override set
                            </p>
                            {payload.tikkie.templateFallback && (
                              <p className="text-xs text-muted-foreground">
                                Template fallback:{" "}
                                {formatMoney(
                                  payload.tikkie.templateFallback.amountMinor ??
                                    0
                                )}
                                {payload.tikkie.templateFallback.source ===
                                  "template" && " from ticket type template"}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      {!isEditingOverride ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setOverrideValue(
                              payload.attendee.tikkieAmountOverrideMinor !==
                                null
                                ? (
                                    payload.attendee.tikkieAmountOverrideMinor /
                                    100
                                  ).toFixed(2)
                                : ""
                            )
                            setOverrideError(null)
                            setIsEditingOverride(true)
                          }}
                        >
                          {payload.attendee.tikkieAmountOverrideMinor !== null
                            ? "Edit override"
                            : "Set override"}
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setIsEditingOverride(false)
                              setOverrideError(null)
                            }}
                            disabled={isSavingOverride}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              void handleClearOverride()
                            }}
                            disabled={isSavingOverride}
                          >
                            Clear
                          </Button>
                        </div>
                      )}
                    </div>

                    {isEditingOverride && (
                      <form
                        className="mt-3 flex items-end gap-2"
                        onSubmit={(e) => {
                          e.preventDefault()
                          void handleSaveOverride()
                        }}
                      >
                        <div className="flex-1">
                          <label htmlFor="overrideAmount" className="sr-only">
                            Amount in cents
                          </label>
                          <input
                            id="overrideAmount"
                            type="number"
                            min={1}
                            step={1}
                            value={overrideValue}
                            onChange={(e) => setOverrideValue(e.target.value)}
                            placeholder="Amount in cents (e.g. 2500 for €25.00)"
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            disabled={isSavingOverride}
                          />
                        </div>
                        <Button
                          type="submit"
                          size="sm"
                          disabled={isSavingOverride || !overrideValue.trim()}
                        >
                          {isSavingOverride ? "Saving..." : "Save"}
                        </Button>
                      </form>
                    )}

                    {overrideError && (
                      <div className="mt-2 text-xs text-rose-600 dark:text-rose-300">
                        {overrideError}
                      </div>
                    )}
                  </div>

                  {payload.finance.outstandingAmountMinor <= 0 && (
                    <p className="text-sm text-muted-foreground">
                      No remaining balance to generate a new payment link.
                    </p>
                  )}

                  <TikkieLinkSummary
                    latestLink={payload.tikkie.latestLink}
                    history={payload.tikkie.history}
                    isLoading={isRefreshingTikkie}
                    isCopying={isCopyingLatestLink}
                    emptyState="No Tikkie link has been generated for this order yet."
                    onCopy={(url) => void handleCopyLatestLink(url)}
                    onRefresh={() => void handleRefreshTikkie()}
                  />

                  {tikkieError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200">
                      {tikkieError}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <article className="overflow-hidden rounded-xl bg-[linear-gradient(145deg,rgba(15,54,138,0.96),rgba(20,64,156,0.92))] text-primary-foreground shadow-[0_20px_56px_rgba(16,43,113,0.24)]">
              <div className="border-b border-white/10 px-6 py-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-white/10">
                    <BedDouble className="size-5" />
                  </span>
                  <h3 className="text-2xl font-semibold tracking-tight">
                    Accommodation
                  </h3>
                </div>
              </div>

              <div className="space-y-5 px-6 py-6 text-sm">
                <div>
                  <p className="text-[11px] tracking-[0.2em] text-primary-foreground/70 uppercase">
                    Assigned hotel
                  </p>
                  <p className="mt-2 text-2xl leading-tight font-semibold">
                    {payload.roomStatus.status === "assigned"
                      ? payload.roomStatus.hotelName
                      : "Not assigned yet"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] tracking-[0.2em] text-primary-foreground/70 uppercase">
                      Room
                    </p>
                    <p className="mt-2 text-xl font-semibold">
                      {payload.roomStatus.roomLabel ?? "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] tracking-[0.2em] text-primary-foreground/70 uppercase">
                      Type
                    </p>
                    <p className="mt-2 text-xl font-semibold">
                      {payload.roomStatus.roomTypeLabel ?? "-"}
                    </p>
                  </div>
                </div>

                <Button
                  asChild
                  variant="secondary"
                  className="w-full justify-center bg-white/10 text-primary-foreground hover:bg-white/16"
                >
                  <Link href={manageRoomAssignmentHref}>
                    Manage room assignment
                  </Link>
                </Button>
              </div>
            </article>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_340px]">
            <Card className="bg-background/88 backdrop-blur">
              <CardHeader className="flex flex-wrap items-center justify-between gap-3 sm:flex-row">
                <div>
                  <CardTitle className="text-2xl text-primary">
                    Payment history ledger
                  </CardTitle>
                  <CardDescription>
                    Payment links, transitions, and reminder-ready history for
                    this attendee&apos;s order.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {payload.paymentHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No Tikkie payment activity recorded yet for this
                    attendee&apos;s order.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                      <thead>
                        <tr className="text-left text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                          <th className="px-4 py-2">Transaction</th>
                          <th className="px-4 py-2">Date</th>
                          <th className="px-4 py-2">Method</th>
                          <th className="px-4 py-2">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payload.paymentHistory.map((entry) => (
                          <tr
                            key={entry.id}
                            className="bg-background shadow-sm"
                          >
                            <td className="rounded-l-lg px-4 py-4">
                              <p className="font-medium text-primary">
                                {entry.title}
                              </p>
                              {entry.note && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {entry.note}
                                </p>
                              )}
                              {entry.url && (
                                <a
                                  className="mt-2 inline-flex text-xs text-primary underline"
                                  href={entry.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Open payment link
                                </a>
                              )}
                            </td>
                            <td className="px-4 py-4 text-muted-foreground">
                              {formatDateTime(entry.happenedAt)}
                            </td>
                            <td className="px-4 py-4">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${paymentMethodClasses(entry)}`}
                              >
                                {paymentMethodLabel(entry)}
                              </span>
                            </td>
                            <td className="rounded-r-lg px-4 py-4 text-right font-semibold text-foreground">
                              {entry.amountMinor === null
                                ? "-"
                                : formatMoney(entry.amountMinor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-background/88 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-lg">Attendee snapshot</CardTitle>
                <CardDescription>
                  Quick reference for attendee, ticket, and order context.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {[
                  {
                    label: "Email",
                    value: payload.attendee.email ?? "-",
                    icon: Mail,
                  },
                  {
                    label: "Buyer",
                    value:
                      payload.order.buyerName ??
                      payload.order.buyerEmail ??
                      "-",
                    icon: UserRound,
                  },
                  {
                    label: "Ordered at",
                    value: formatDateTime(payload.order.orderedAt),
                    icon: CalendarDays,
                  },
                  {
                    label: "Ticket status",
                    value: formatStatusLabel(payload.attendee.ticketStatus),
                    icon: ReceiptText,
                  },
                  {
                    label: "Checked in",
                    value: formatDateTime(payload.attendee.checkedInAt),
                    icon: CreditCard,
                  },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <div
                      key={item.label}
                      className="flex gap-3 rounded-lg border border-border/70 bg-background px-3 py-3"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                          {item.label}
                        </p>
                        <p className="mt-1 font-medium break-words text-foreground">
                          {item.value}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {(payload.signals.location ||
              payload.signals.remarks ||
              payload.signals.dietary ||
              payload.signals.roommatePreference ||
              payload.signals.allocationPriority ||
              payload.signals.ageGroup ||
              payload.signals.ticketCategory) && (
              <Card className="bg-background/88 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-lg">Custom Answers</CardTitle>
                  <CardDescription>
                    Registration form responses from Ticket Tailor.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  {(
                    [
                      payload.signals.location && {
                        label: "Location",
                        value: payload.signals.location,
                        icon: MapPin,
                      },
                      payload.signals.remarks && {
                        label: "Remarks",
                        value: payload.signals.remarks,
                        icon: FileText,
                      },
                      payload.signals.dietary && {
                        label: "Dietary",
                        value: payload.signals.dietary,
                        icon: Utensils,
                      },
                      payload.signals.roommatePreference && {
                        label: "Roommate",
                        value: payload.signals.roommatePreference,
                        icon: Users,
                      },
                      payload.signals.allocationPriority && {
                        label: "Priority",
                        value: payload.signals.allocationPriority,
                        icon: Flag,
                      },
                      payload.signals.priorityReason && {
                        label: "Priority Reason",
                        value: payload.signals.priorityReason,
                        icon: Clock,
                      },
                      payload.signals.ageGroup && {
                        label: "Age Group",
                        value: payload.signals.ageGroup,
                        icon: Calendar,
                      },
                      payload.signals.ticketCategory && {
                        label: "Ticket Category",
                        value: payload.signals.ticketCategory,
                        icon: Tag,
                      },
                    ].filter(Boolean) as Array<{
                      label: string
                      value: string
                      icon: React.ComponentType<
                        React.ComponentPropsWithRef<"svg">
                      >
                    }>
                  ).map((item) => {
                    const Icon = item.icon
                    return (
                      <div
                        key={item.label}
                        className="flex gap-3 rounded-lg border border-border/70 bg-background px-3 py-3"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                            {item.label}
                          </p>
                          <p className="mt-1 font-medium break-words text-foreground">
                            {item.value}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            )}
          </section>
        </>
      )}

      {!attendeeId && !isLoading && !payload && !errorMessage && (
        <article className="rounded-xl border border-border bg-background/80 p-5 text-sm text-muted-foreground shadow-sm backdrop-blur">
          No attendee selected.
        </article>
      )}

      <TikkieLinkDialog
        key={payload ? payload.attendee.id : "attendee-tikkie-closed"}
        open={isTikkieDialogOpen}
        defaults={tikkieDialogDefaults}
        submitting={isSubmittingTikkie}
        error={tikkieError}
        onOpenChange={(open) => {
          setIsTikkieDialogOpen(open)
          if (!open) {
            setTikkieError(null)
          }
        }}
        onSubmit={handleCreateTikkieLink}
      />
    </section>
  )
}
