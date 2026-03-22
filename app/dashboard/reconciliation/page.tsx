"use client"

import Link from "next/link"
import { ArrowRight, CircleAlert, HandCoins, SearchCheck } from "lucide-react"
import { FormEvent, useEffect, useMemo, useState } from "react"

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

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

type CanonicalOrderStatus = "paid" | "refunded" | "cancelled" | "pending"

type ReconciliationPayload = {
  generatedAt: string
  filters: {
    eventId: string | null
    from: string
    to: string
    status: CanonicalOrderStatus | null
  }
  availableEvents: Array<{
    providerEventId: string
    name: string | null
  }>
  totals: {
    rows: number
    outstandingMinor: number
  }
  rows: Array<{
    providerOrderId: string
    providerEventId: string
    eventName: string | null
    normalizedStatus: CanonicalOrderStatus
    totalAmountMinor: number
    currency: string | null
    orderedAt: string | null
    refundedAt: string | null
    outstandingMinor: number
    reasons: Array<
      | "pending-payment"
      | "cancelled-with-amount"
      | "missing-amount"
      | "refund-without-refunded-at"
    >
  }>
}

type TikkieLinkRecord = TikkieLinkSummaryRecord

type TikkieLinkSummaryPayload = {
  count: number
  latestLink: TikkieLinkRecord | null
  history: TikkieLinkRecord[]
  providerLastCheckedAt: string | null
  latestLinkCheckState: "fresh" | "stale" | null
}

type RowLinkState = {
  isLoading: boolean
  isCreating: boolean
  isCopying: boolean
  error: string | null
  summary: TikkieLinkSummaryPayload | null
}

const EMPTY_ROW_LINK_STATE: RowLinkState = {
  isLoading: false,
  isCreating: false,
  isCopying: false,
  error: null,
  summary: null,
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

function toIsoBoundary(value: string, boundary: "start" | "end") {
  if (!value.trim()) {
    return null
  }

  const suffix = boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z"
  const parsed = new Date(`${value}${suffix}`)

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString()
}

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

function formatReason(reason: string) {
  switch (reason) {
    case "pending-payment":
      return "Outstanding pending payment"
    case "cancelled-with-amount":
      return "Cancelled order still has amount"
    case "missing-amount":
      return "Missing amount"
    case "refund-without-refunded-at":
      return "Refunded status missing refunded timestamp"
    default:
      return reason
  }
}

function defaultExpiryDate() {
  const date = new Date()
  date.setDate(date.getDate() + 14)
  return date.toISOString().slice(0, 10)
}

function defaultDialogValues(
  row: ReconciliationPayload["rows"][number]
): TikkieLinkDialogDefaults {
  return {
    providerOrderId: row.providerOrderId,
    providerEventId: row.providerEventId,
    amountMinor: row.outstandingMinor,
    expiryDate: defaultExpiryDate(),
    description: `Order ${row.providerOrderId}`.slice(0, 35),
    referenceId: row.providerOrderId.slice(0, 35),
  }
}

export default function ReconciliationPage() {
  const [eventIdInput, setEventIdInput] = useState("")
  const [statusInput, setStatusInput] = useState<"all" | CanonicalOrderStatus>(
    "all"
  )
  const [fromInput, setFromInput] = useState(() => {
    const today = new Date()
    const from = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)
    return toDateInputValue(from)
  })
  const [toInput, setToInput] = useState(() => toDateInputValue(new Date()))

  const [appliedEventId, setAppliedEventId] = useState("")
  const [appliedStatus, setAppliedStatus] = useState<
    "all" | CanonicalOrderStatus
  >("all")
  const [appliedFrom, setAppliedFrom] = useState(fromInput)
  const [appliedTo, setAppliedTo] = useState(toInput)

  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [payload, setPayload] = useState<ReconciliationPayload | null>(null)
  const [rowLinks, setRowLinks] = useState<Record<string, RowLinkState>>({})
  const [dialogRow, setDialogRow] = useState<
    ReconciliationPayload["rows"][number] | null
  >(null)

  const dateValidationError = useMemo(() => {
    const fromIso = toIsoBoundary(fromInput, "start")
    const toIso = toIsoBoundary(toInput, "end")

    if (!fromIso || !toIso) {
      return "Select valid from/to dates."
    }

    if (new Date(fromIso).getTime() > new Date(toIso).getTime()) {
      return "From date must be before or equal to To date."
    }

    return null
  }, [fromInput, toInput])

  useEffect(() => {
    const fromIso = toIsoBoundary(appliedFrom, "start")
    const toIso = toIsoBoundary(appliedTo, "end")

    if (!fromIso || !toIso) {
      setErrorMessage("Active filter dates are invalid.")
      setPayload(null)
      setIsLoading(false)
      return
    }

    const safeFromIso = fromIso
    const safeToIso = toIso
    const controller = new AbortController()

    async function loadReconciliation() {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const query = new URLSearchParams()
        query.set("from", safeFromIso)
        query.set("to", safeToIso)

        if (appliedEventId.trim()) {
          query.set("eventId", appliedEventId.trim())
        }

        if (appliedStatus !== "all") {
          query.set("status", appliedStatus)
        }

        const response = await fetch(
          `/api/dashboard/reconciliation?${query.toString()}`,
          {
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { message?: string }
          } | null
          setPayload(null)
          setErrorMessage(
            body?.error?.message ??
              `Failed to load reconciliation data (${response.status}).`
          )
          return
        }

        const body = (await response.json()) as ReconciliationPayload
        setPayload(body)
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return
        }

        setPayload(null)
        setErrorMessage("Network error while loading reconciliation rows.")
      } finally {
        setIsLoading(false)
      }
    }

    loadReconciliation()

    return () => {
      controller.abort()
    }
  }, [appliedEventId, appliedFrom, appliedStatus, appliedTo])

  function getRowLinkState(providerOrderId: string) {
    return rowLinks[providerOrderId] ?? EMPTY_ROW_LINK_STATE
  }

  async function fetchRowLinks(
    providerOrderId: string,
    options?: { refresh?: boolean }
  ) {
    setRowLinks((current) => ({
      ...current,
      [providerOrderId]: {
        isLoading: true,
        isCreating: current[providerOrderId]?.isCreating ?? false,
        isCopying: current[providerOrderId]?.isCopying ?? false,
        error: null,
        summary: current[providerOrderId]?.summary ?? null,
      },
    }))

    try {
      const response = await fetch(
        `/api/dashboard/tikkie-links?providerOrderId=${encodeURIComponent(providerOrderId)}${
          options?.refresh ? "&refresh=1" : ""
        }`
      )

      const body = (await response.json().catch(() => null)) as
        | (TikkieLinkSummaryPayload & { error?: { message?: string } })
        | null

      if (!response.ok) {
        setRowLinks((current) => ({
          ...current,
          [providerOrderId]: {
            isLoading: false,
            isCreating: current[providerOrderId]?.isCreating ?? false,
            isCopying: current[providerOrderId]?.isCopying ?? false,
            error:
              body?.error?.message ??
              `Failed to load links (${response.status}).`,
            summary: current[providerOrderId]?.summary ?? null,
          },
        }))
        return
      }

      setRowLinks((current) => ({
        ...current,
        [providerOrderId]: {
          isLoading: false,
          isCreating: current[providerOrderId]?.isCreating ?? false,
          isCopying: current[providerOrderId]?.isCopying ?? false,
          error: null,
          summary: body
            ? {
                count: body.count,
                latestLink: body.latestLink,
                history: body.history,
                providerLastCheckedAt: body.providerLastCheckedAt,
                latestLinkCheckState: body.latestLinkCheckState,
              }
            : null,
        },
      }))
    } catch {
      setRowLinks((current) => ({
        ...current,
        [providerOrderId]: {
          isLoading: false,
          isCreating: current[providerOrderId]?.isCreating ?? false,
          isCopying: current[providerOrderId]?.isCopying ?? false,
          error: "Network error while loading Tikkie links.",
          summary: current[providerOrderId]?.summary ?? null,
        },
      }))
    }
  }

  useEffect(() => {
    if (!payload?.rows.length) {
      return
    }

    for (const row of payload.rows) {
      void fetchRowLinks(row.providerOrderId)
    }
  }, [payload?.rows])

  async function handleGenerateLink(
    row: ReconciliationPayload["rows"][number],
    values: TikkieLinkDialogValues
  ) {
    setRowLinks((current) => ({
      ...current,
      [row.providerOrderId]: {
        isLoading: current[row.providerOrderId]?.isLoading ?? false,
        isCreating: true,
        isCopying: current[row.providerOrderId]?.isCopying ?? false,
        error: null,
        summary: current[row.providerOrderId]?.summary ?? null,
      },
    }))

    try {
      const response = await fetch("/api/dashboard/tikkie-links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providerOrderId: row.providerOrderId,
          providerEventId: row.providerEventId,
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
        setRowLinks((current) => ({
          ...current,
          [row.providerOrderId]: {
            isLoading: current[row.providerOrderId]?.isLoading ?? false,
            isCreating: false,
            isCopying: current[row.providerOrderId]?.isCopying ?? false,
            error:
              body?.error?.message ??
              `Failed to create link (${response.status}).`,
            summary: current[row.providerOrderId]?.summary ?? null,
          },
        }))
        return
      }

      await fetchRowLinks(row.providerOrderId)
      setDialogRow(null)
    } catch {
      setRowLinks((current) => ({
        ...current,
        [row.providerOrderId]: {
          isLoading: current[row.providerOrderId]?.isLoading ?? false,
          isCreating: false,
          isCopying: current[row.providerOrderId]?.isCopying ?? false,
          error: "Network error while creating link.",
          summary: current[row.providerOrderId]?.summary ?? null,
        },
      }))
      return
    }

    setRowLinks((current) => ({
      ...current,
      [row.providerOrderId]: {
        isLoading: current[row.providerOrderId]?.isLoading ?? false,
        isCreating: false,
        isCopying: current[row.providerOrderId]?.isCopying ?? false,
        error: current[row.providerOrderId]?.error ?? null,
        summary: current[row.providerOrderId]?.summary ?? null,
      },
    }))
  }

  async function handleCopyLink(providerOrderId: string, url: string) {
    setRowLinks((current) => ({
      ...current,
      [providerOrderId]: {
        isLoading: current[providerOrderId]?.isLoading ?? false,
        isCreating: current[providerOrderId]?.isCreating ?? false,
        isCopying: true,
        error: null,
        summary: current[providerOrderId]?.summary ?? null,
      },
    }))

    try {
      await navigator.clipboard.writeText(url)
    } catch {
      setRowLinks((current) => ({
        ...current,
        [providerOrderId]: {
          isLoading: current[providerOrderId]?.isLoading ?? false,
          isCreating: current[providerOrderId]?.isCreating ?? false,
          isCopying: false,
          error: "Clipboard permission denied. Copy the URL manually.",
          summary: current[providerOrderId]?.summary ?? null,
        },
      }))
      return
    }

    setRowLinks((current) => ({
      ...current,
      [providerOrderId]: {
        isLoading: current[providerOrderId]?.isLoading ?? false,
        isCreating: current[providerOrderId]?.isCreating ?? false,
        isCopying: false,
        error: null,
        summary: current[providerOrderId]?.summary ?? null,
      },
    }))
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (dateValidationError) {
      setErrorMessage(dateValidationError)
      return
    }

    setAppliedEventId(eventIdInput)
    setAppliedStatus(statusInput)
    setAppliedFrom(fromInput)
    setAppliedTo(toInput)
  }

  return (
    <section className="space-y-8">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
        <Card className="border border-border p-6 md:p-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                Outstanding balances
              </p>
              <h2 className="mt-2.5 text-2xl font-semibold tracking-tight text-foreground md:text-[2rem]">
                Resolve the orders that still need payment or operator
                attention.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                Start here when a balance needs action, then carry the order
                context straight into attendee follow-up and room assignment.
              </p>
            </div>

            <div className="grid min-w-[220px] gap-3 sm:grid-cols-2 sm:grid-rows-2">
              <div className="rounded-lg border border-border bg-muted/40 p-4 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Flagged rows</p>
                <p className="mt-1.5 text-2xl font-semibold text-foreground">
                  {payload?.totals.rows ?? "--"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="mt-1.5 text-base font-semibold text-foreground">
                  {payload
                    ? formatMoney(payload.totals.outstandingMinor)
                    : "--"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">Status view</p>
                <p className="mt-1.5 text-base font-semibold text-foreground">
                  {appliedStatus === "all" ? "All" : appliedStatus}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="border border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary dark:bg-white/10 dark:text-primary-foreground">
                <SearchCheck className="size-5" />
              </span>
              <div>
                <CardDescription className="text-[11px] font-semibold tracking-[0.2em] text-primary/70 uppercase">
                  Refine list
                </CardDescription>
                <CardTitle className="mt-1 text-lg">
                  Find the balances that need attention
                </CardTitle>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={applyFilters}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-xs font-medium text-foreground">
                    Event ID
                  </span>
                  <select
                    value={eventIdInput}
                    onChange={(event) => setEventIdInput(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm"
                  >
                    <option value="">All events</option>
                    {(payload?.availableEvents ?? []).map((event) => (
                      <option
                        key={event.providerEventId}
                        value={event.providerEventId}
                      >
                        {event.name?.trim() || event.providerEventId}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-xs font-medium text-foreground">
                    Status
                  </span>
                  <select
                    value={statusInput}
                    onChange={(event) =>
                      setStatusInput(
                        event.target.value as "all" | CanonicalOrderStatus
                      )
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm"
                  >
                    <option value="all">All statuses</option>
                    <option value="paid">Paid</option>
                    <option value="refunded">Refunded</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="pending">Pending</option>
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-xs font-medium text-foreground">
                    From
                  </span>
                  <input
                    type="date"
                    value={fromInput}
                    onChange={(event) => setFromInput(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-xs font-medium text-foreground">
                    To
                  </span>
                  <input
                    type="date"
                    value={toInput}
                    onChange={(event) => setToInput(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm"
                  />
                </label>
              </div>

              {dateValidationError && (
                <p className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-200">
                  {dateValidationError}
                </p>
              )}

              <Button
                className="h-10 w-full rounded-md text-xs"
                type="submit"
                disabled={Boolean(dateValidationError) || isLoading}
              >
                {isLoading ? "Loading..." : "Apply follow-up filters"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-primary">
                <HandCoins className="size-5" />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Outstanding
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {payload
                    ? formatMoney(payload.totals.outstandingMinor)
                    : "--"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-primary">
                <CircleAlert className="size-5" />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Flagged rows
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {payload?.totals.rows ?? "--"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="p-5 text-sm leading-5 text-muted-foreground">
            Open attendee follow-up from any row to preserve order context and
            avoid backtracking.
          </CardContent>
        </Card>
      </section>

      {errorMessage && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {!errorMessage && isLoading && (
        <Card className="border border-border">
          <CardContent className="p-5">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-[150px]" />
              <div className="flex flex-col gap-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-16 w-[120px]" />
                    <Skeleton className="h-16 w-[100px]" />
                    <Skeleton className="h-16 w-[70px]" />
                    <Skeleton className="h-16 w-[80px]" />
                    <Skeleton className="h-16 w-[80px]" />
                    <Skeleton className="h-16 w-[150px]" />
                    <Skeleton className="h-16 w-[100px]" />
                    <Skeleton className="h-16 w-[120px]" />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!errorMessage && !isLoading && payload && (
        <Card className="border border-border">
          <CardContent className="p-4 lg:p-6">
            {payload.rows.length === 0 ? (
              <p className="rounded-lg border border-border/70 p-4 text-sm text-muted-foreground">
                No outstanding or mismatch candidates found for the selected
                filters.
              </p>
            ) : (
              <>
                <div className="hidden md:block">
                  <div className="grid gap-4 lg:grid-cols-2">
                    {payload.rows.map((row) => {
                      const linkState = getRowLinkState(row.providerOrderId)
                      const latestLink = linkState.summary?.latestLink ?? null
                      const canGenerate = row.outstandingMinor > 0

                      return (
                        <Card
                          key={row.providerOrderId}
                          className="flex flex-col gap-3 border border-border p-4"
                        >
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-mono text-xs font-medium text-foreground">
                                {row.providerOrderId}
                              </p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {row.eventName ?? "Unknown event"}
                              </p>
                              {row.orderedAt && (
                                <p className="mt-0.5 text-[10px] text-muted-foreground">
                                  {new Date(row.orderedAt).toLocaleString()}
                                </p>
                              )}
                            </div>
                            <Badge
                              variant={
                                row.normalizedStatus === "cancelled"
                                  ? "destructive"
                                  : row.normalizedStatus === "refunded"
                                    ? "outline"
                                    : "secondary"
                              }
                              className="shrink-0 capitalize"
                            >
                              {row.normalizedStatus}
                            </Badge>
                          </div>

                          <div className="flex items-baseline justify-between gap-3 rounded-md border border-border bg-muted/30 p-3">
                            <div>
                              <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
                                Amount
                              </p>
                              <p className="mt-0.5 text-sm text-foreground">
                                {formatMoney(row.totalAmountMinor)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
                                Outstanding
                              </p>
                              <p className="mt-0.5 text-base font-semibold text-foreground">
                                {formatMoney(row.outstandingMinor)}
                              </p>
                            </div>
                          </div>

                          {row.reasons.length > 0 && (
                            <ul className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                              {row.reasons.map((reason) => (
                                <li key={reason}>{formatReason(reason)}</li>
                              ))}
                            </ul>
                          )}

                          <div className="flex flex-col gap-1.5 border-t border-border/50 pt-1">
                            <Button
                              asChild
                              className="h-9 justify-between rounded-md px-3 text-[11px]"
                              size="sm"
                            >
                              <Link
                                href={`/dashboard/attendees?search=${encodeURIComponent(row.providerOrderId)}&eventId=${encodeURIComponent(row.providerEventId)}&source=outstanding-balances&orderId=${encodeURIComponent(row.providerOrderId)}`}
                              >
                                Open attendee follow-up
                                <ArrowRight className="size-4" />
                              </Link>
                            </Button>
                          </div>

                          <div className="flex flex-col gap-2 border-t border-border/50 pt-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!canGenerate || linkState.isCreating}
                                onClick={() => setDialogRow(row)}
                                className="h-8 text-[11px]"
                              >
                                {linkState.isCreating
                                  ? "Generating..."
                                  : "Generate Tikkie link"}
                              </Button>
                            </div>

                            {!canGenerate && (
                              <p className="text-[11px] text-muted-foreground">
                                No outstanding amount for link generation.
                              </p>
                            )}

                            {linkState.isLoading && (
                              <p className="text-[11px] text-muted-foreground">
                                Loading link status...
                              </p>
                            )}

                            <TikkieLinkSummary
                              latestLink={latestLink}
                              history={linkState.summary?.history ?? []}
                              isLoading={linkState.isLoading}
                              isCopying={linkState.isCopying}
                              compact
                              emptyState="No Tikkie links generated for this order yet."
                              onCopy={(url) =>
                                void handleCopyLink(row.providerOrderId, url)
                              }
                              onRefresh={() =>
                                void fetchRowLinks(row.providerOrderId, {
                                  refresh: true,
                                })
                              }
                            />

                            {linkState.error && (
                              <p className="text-[11px] text-destructive">
                                {linkState.error}
                              </p>
                            )}
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                </div>

                <div className="block divide-y divide-border md:hidden">
                  {payload.rows.map((row) => {
                    const linkState = getRowLinkState(row.providerOrderId)
                    const latestLink = linkState.summary?.latestLink ?? null
                    const canGenerate = row.outstandingMinor > 0

                    return (
                      <div
                        key={row.providerOrderId}
                        className="flex flex-col gap-3 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-mono text-xs text-foreground">
                              {row.providerOrderId}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {row.eventName ?? "Unknown event"}
                            </p>
                          </div>
                          <Badge
                            variant={
                              row.normalizedStatus === "cancelled"
                                ? "destructive"
                                : row.normalizedStatus === "refunded"
                                  ? "outline"
                                  : "secondary"
                            }
                          >
                            {row.normalizedStatus}
                          </Badge>
                        </div>

                        <div className="flex items-baseline justify-between gap-3">
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Amount
                            </p>
                            <p className="text-sm text-foreground">
                              {formatMoney(row.totalAmountMinor)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">
                              Outstanding
                            </p>
                            <p className="text-base font-semibold text-foreground">
                              {formatMoney(row.outstandingMinor)}
                            </p>
                          </div>
                        </div>

                        {row.reasons.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {row.reasons.map((reason) => (
                              <p key={reason}>{formatReason(reason)}</p>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-col gap-2 pt-1">
                          <Button
                            asChild
                            className="w-full justify-between rounded-md text-xs"
                            size="sm"
                          >
                            <Link
                              href={`/dashboard/attendees?search=${encodeURIComponent(
                                row.providerOrderId
                              )}&eventId=${encodeURIComponent(
                                row.providerEventId
                              )}&source=outstanding-balances&orderId=${encodeURIComponent(
                                row.providerOrderId
                              )}`}
                            >
                              Open attendee follow-up
                              <ArrowRight className="size-4" />
                            </Link>
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full text-xs"
                            disabled={!canGenerate || linkState.isCreating}
                            onClick={() => setDialogRow(row)}
                          >
                            {linkState.isCreating
                              ? "Generating..."
                              : "Generate Tikkie link"}
                          </Button>
                        </div>

                        <TikkieLinkSummary
                          latestLink={latestLink}
                          history={linkState.summary?.history ?? []}
                          isLoading={linkState.isLoading}
                          isCopying={linkState.isCopying}
                          compact
                          emptyState="No Tikkie links yet."
                          onCopy={(url) =>
                            void handleCopyLink(row.providerOrderId, url)
                          }
                          onRefresh={() =>
                            void fetchRowLinks(row.providerOrderId, {
                              refresh: true,
                            })
                          }
                        />

                        {linkState.error && (
                          <p className="text-xs text-destructive">
                            {linkState.error}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <TikkieLinkDialog
        key={
          dialogRow ? dialogRow.providerOrderId : "reconciliation-tikkie-closed"
        }
        open={Boolean(dialogRow)}
        defaults={dialogRow ? defaultDialogValues(dialogRow) : null}
        submitting={
          dialogRow
            ? getRowLinkState(dialogRow.providerOrderId).isCreating
            : false
        }
        error={
          dialogRow ? getRowLinkState(dialogRow.providerOrderId).error : null
        }
        onOpenChange={(open) => {
          if (!open) {
            setDialogRow(null)
          }
        }}
        onSubmit={async (values) => {
          if (!dialogRow) {
            return
          }

          await handleGenerateLink(dialogRow, values)
        }}
      />
    </section>
  )
}
