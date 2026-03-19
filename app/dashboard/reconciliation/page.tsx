"use client"

import Link from "next/link"
import { ArrowRight, CircleAlert, HandCoins, SearchCheck } from "lucide-react"
import { FormEvent, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

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
    reasons: Array<"pending-payment" | "cancelled-with-amount" | "missing-amount" | "refund-without-refunded-at">
  }>
}

type TikkieLinkRecord = {
  id: string
  providerOrderId: string
  providerEventId: string
  paymentRequestToken: string
  paymentRequestUrl: string
  status: "created" | "paid" | "expired"
  statusSource: "create" | "webhook" | "poll"
  providerStatus: string
  amountMinor: number
  description: string
  expiryDate: string
  referenceId: string | null
  providerPayload: unknown
  providerLastCheckedAt: string | null
  statusUpdatedAt: string
  createdAt: string
  updatedAt: string
}

type RowLinkState = {
  isLoading: boolean
  isCreating: boolean
  isCopying: boolean
  error: string | null
  links: TikkieLinkRecord[]
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

function formatTikkieStatus(status: "created" | "paid" | "expired") {
  switch (status) {
    case "paid":
      return "Paid"
    case "expired":
      return "Expired"
    default:
      return "Created"
  }
}

function statusBadgeClass(status: "created" | "paid" | "expired") {
  if (status === "paid") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300"
  }

  if (status === "expired") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300"
  }

  return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-300"
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-"
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return "-"
  }

  return parsed.toLocaleString()
}

function defaultExpiryDate() {
  const date = new Date()
  date.setDate(date.getDate() + 14)
  return date.toISOString().slice(0, 10)
}

function formatStatusSource(value: "create" | "webhook" | "poll") {
  if (value === "webhook") {
    return "Webhook"
  }

  if (value === "poll") {
    return "Poll"
  }

  return "Create"
}

export default function ReconciliationPage() {
  const [eventIdInput, setEventIdInput] = useState("")
  const [statusInput, setStatusInput] = useState<"all" | CanonicalOrderStatus>("all")
  const [fromInput, setFromInput] = useState(() => {
    const today = new Date()
    const from = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)
    return toDateInputValue(from)
  })
  const [toInput, setToInput] = useState(() => toDateInputValue(new Date()))

  const [appliedEventId, setAppliedEventId] = useState("")
  const [appliedStatus, setAppliedStatus] = useState<"all" | CanonicalOrderStatus>("all")
  const [appliedFrom, setAppliedFrom] = useState(fromInput)
  const [appliedTo, setAppliedTo] = useState(toInput)

  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [payload, setPayload] = useState<ReconciliationPayload | null>(null)
  const [rowLinks, setRowLinks] = useState<Record<string, RowLinkState>>({})

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

        const response = await fetch(`/api/dashboard/reconciliation?${query.toString()}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null
          setPayload(null)
          setErrorMessage(body?.error?.message ?? `Failed to load reconciliation data (${response.status}).`)
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

  async function fetchRowLinks(providerOrderId: string, options?: { refresh?: boolean }) {
    setRowLinks((current) => ({
      ...current,
      [providerOrderId]: {
        isLoading: true,
        isCreating: current[providerOrderId]?.isCreating ?? false,
        isCopying: current[providerOrderId]?.isCopying ?? false,
        error: null,
        links: current[providerOrderId]?.links ?? [],
      },
    }))

    try {
      const response = await fetch(
        `/api/dashboard/tikkie-links?providerOrderId=${encodeURIComponent(providerOrderId)}${
          options?.refresh ? "&refresh=1" : ""
        }`,
      )

      const body = (await response.json().catch(() => null)) as
        | { links?: TikkieLinkRecord[]; error?: { message?: string } }
        | null

      if (!response.ok) {
        setRowLinks((current) => ({
          ...current,
          [providerOrderId]: {
            isLoading: false,
            isCreating: current[providerOrderId]?.isCreating ?? false,
            isCopying: current[providerOrderId]?.isCopying ?? false,
            error: body?.error?.message ?? `Failed to load links (${response.status}).`,
            links: current[providerOrderId]?.links ?? [],
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
          links: body?.links ?? [],
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
          links: current[providerOrderId]?.links ?? [],
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

  async function handleGenerateLink(row: ReconciliationPayload["rows"][number]) {
    setRowLinks((current) => ({
      ...current,
      [row.providerOrderId]: {
        isLoading: current[row.providerOrderId]?.isLoading ?? false,
        isCreating: true,
        isCopying: current[row.providerOrderId]?.isCopying ?? false,
        error: null,
        links: current[row.providerOrderId]?.links ?? [],
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
          amountMinor: row.outstandingMinor,
          description: `Order ${row.providerOrderId}`,
          expiryDate: defaultExpiryDate(),
          referenceId: row.providerOrderId,
        }),
      })

      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null

      if (!response.ok) {
        setRowLinks((current) => ({
          ...current,
          [row.providerOrderId]: {
            isLoading: current[row.providerOrderId]?.isLoading ?? false,
            isCreating: false,
            isCopying: current[row.providerOrderId]?.isCopying ?? false,
            error: body?.error?.message ?? `Failed to create link (${response.status}).`,
            links: current[row.providerOrderId]?.links ?? [],
          },
        }))
        return
      }

      await fetchRowLinks(row.providerOrderId)
    } catch {
      setRowLinks((current) => ({
        ...current,
        [row.providerOrderId]: {
          isLoading: current[row.providerOrderId]?.isLoading ?? false,
          isCreating: false,
          isCopying: current[row.providerOrderId]?.isCopying ?? false,
          error: "Network error while creating link.",
          links: current[row.providerOrderId]?.links ?? [],
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
        links: current[row.providerOrderId]?.links ?? [],
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
        links: current[providerOrderId]?.links ?? [],
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
          links: current[providerOrderId]?.links ?? [],
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
        links: current[providerOrderId]?.links ?? [],
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
        <article className="overflow-hidden rounded-xl bg-[linear-gradient(145deg,rgba(113,84,255,0.97),rgba(83,56,171,0.94))] p-6 text-primary-foreground shadow-[0_20px_56px_rgba(78,52,166,0.24)] md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-foreground/70">
                Outstanding balances
              </p>
              <h2 className="mt-2.5 text-2xl font-semibold tracking-tight md:text-[2rem]">
                Resolve the orders that still need payment or operator attention.
              </h2>
              <p className="mt-3 max-w-xl text-[13px] leading-6 text-primary-foreground/82 md:text-sm">
                Start here when a balance needs action, then carry the order context straight into attendee
                follow-up and room assignment.
              </p>
            </div>

            <div className="grid min-w-[220px] gap-3 sm:grid-cols-2 sm:grid-rows-2 sm:gap-4">
              <div className="rounded-lg bg-white/12 p-4 backdrop-blur-sm sm:col-span-2">
                <p className="text-xs text-primary-foreground/68">Flagged rows</p>
                <p className="mt-1.5 text-2xl font-semibold">{payload?.totals.rows ?? "--"}</p>
              </div>
              <div className="rounded-lg bg-white/12 p-4 backdrop-blur-sm">
                <p className="text-xs text-primary-foreground/68">Outstanding</p>
                <p className="mt-1.5 text-base font-semibold">
                  {payload ? formatMoney(payload.totals.outstandingMinor) : "--"}
                </p>
              </div>
              <div className="rounded-lg bg-white/12 p-4 backdrop-blur-sm">
                <p className="text-xs text-primary-foreground/68">Status view</p>
                <p className="mt-1.5 text-base font-semibold">{appliedStatus === "all" ? "All" : appliedStatus}</p>
              </div>
            </div>
          </div>
        </article>

        <Card className="bg-background/85 backdrop-blur">
          <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary dark:bg-white/10 dark:text-primary-foreground">
              <SearchCheck className="size-5" />
            </span>
            <div>
              <CardDescription className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/70">Refine list</CardDescription>
              <CardTitle className="mt-1 text-lg">Find the balances that need attention</CardTitle>
            </div>
          </div>
          </CardHeader>

          <CardContent>
          <form className="space-y-4" onSubmit={applyFilters}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-xs font-medium text-foreground">Event ID</span>
                <select
                  value={eventIdInput}
                  onChange={(event) => setEventIdInput(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm"
                >
                  <option value="">All events</option>
                  {(payload?.availableEvents ?? []).map((event) => (
                    <option key={event.providerEventId} value={event.providerEventId}>
                      {event.name?.trim() || event.providerEventId}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm">
                <span className="text-xs font-medium text-foreground">Status</span>
                <select
                  value={statusInput}
                  onChange={(event) => setStatusInput(event.target.value as "all" | CanonicalOrderStatus)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="paid">Paid</option>
                  <option value="refunded">Refunded</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="pending">Pending</option>
                </select>
              </label>

              <label className="space-y-2 text-sm">
                <span className="text-xs font-medium text-foreground">From</span>
                <input
                  type="date"
                  value={fromInput}
                  onChange={(event) => setFromInput(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm"
                />
              </label>

              <label className="space-y-2 text-sm">
                <span className="text-xs font-medium text-foreground">To</span>
                <input
                  type="date"
                  value={toInput}
                  onChange={(event) => setToInput(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm"
                />
              </label>
            </div>

            {dateValidationError && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                {dateValidationError}
              </p>
            )}

            <Button className="h-10 w-full rounded-md text-xs" type="submit" disabled={Boolean(dateValidationError) || isLoading}>
              {isLoading ? "Loading..." : "Apply follow-up filters"}
            </Button>
          </form>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="bg-background/85 backdrop-blur">
          <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary dark:bg-white/10 dark:text-primary-foreground">
              <HandCoins className="size-4" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/70">Outstanding</p>
              <p className="mt-1 text-lg font-semibold">{payload ? formatMoney(payload.totals.outstandingMinor) : "--"}</p>
            </div>
          </div>
          </CardContent>
        </Card>
        <Card className="bg-background/85 backdrop-blur">
          <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              <CircleAlert className="size-4" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/70">Flagged rows</p>
              <p className="mt-1 text-lg font-semibold">{payload?.totals.rows ?? "--"}</p>
            </div>
          </div>
          </CardContent>
        </Card>
        <Card className="bg-background/85 backdrop-blur">
          <CardContent className="p-4 text-xs leading-5 text-muted-foreground">
          Open attendee follow-up from any row to preserve order context and avoid backtracking.
          </CardContent>
        </Card>
      </section>

      {errorMessage && (
        <article className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {errorMessage}
        </article>
      )}

      {!errorMessage && isLoading && (
        <article className="rounded-xl border border-border bg-background/80 p-5 text-xs text-muted-foreground shadow-sm backdrop-blur">
          Loading outstanding-balance rows...
        </article>
      )}

      {!errorMessage && !isLoading && payload && (
        <Card className="bg-background/85 backdrop-blur">
          <CardContent className="p-5">
          {payload.rows.length === 0 ? (
            <p className="rounded-lg border border-border/70 p-4 text-xs text-muted-foreground">
              No outstanding or mismatch candidates found for the selected filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2.5 text-xs">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    <th className="px-3 py-2">Order</th>
                    <th className="px-3 py-2">Event</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Outstanding</th>
                    <th className="px-3 py-2">Reasons</th>
                    <th className="px-3 py-2">Next step</th>
                    <th className="px-3 py-2">Tikkie</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.rows.map((row) => {
                    const linkState = rowLinks[row.providerOrderId] ?? {
                      isLoading: false,
                      isCreating: false,
                      isCopying: false,
                      error: null,
                      links: [],
                    }
                    const latestLink = linkState.links[0] ?? null
                    const canGenerate = row.outstandingMinor > 0

                    return (
                      <tr key={row.providerOrderId} className="align-top shadow-sm">
                        <td className="rounded-l-lg bg-white/75 px-3 py-3 font-mono text-[11px] dark:bg-white/6">
                          <div className="text-foreground">{row.providerOrderId}</div>
                          <div className="mt-1 text-muted-foreground">
                            {row.orderedAt ? new Date(row.orderedAt).toLocaleString() : "-"}
                          </div>
                        </td>
                        <td className="bg-white/75 px-3 py-3 dark:bg-white/6">
                          <div className="text-[11px] font-medium text-foreground">{row.eventName ?? "Unknown event"}</div>
                          <div className="mt-1 font-mono text-[11px] text-muted-foreground">{row.providerEventId}</div>
                        </td>
                        <td className="bg-white/75 px-3 py-3 capitalize text-foreground dark:bg-white/6">
                          {row.normalizedStatus}
                        </td>
                        <td className="bg-white/75 px-3 py-3 text-foreground dark:bg-white/6">
                          {formatMoney(row.totalAmountMinor)}
                        </td>
                        <td className="bg-white/75 px-3 py-3 font-semibold text-foreground dark:bg-white/6">
                          {formatMoney(row.outstandingMinor)}
                        </td>
                        <td className="bg-white/75 px-3 py-3 dark:bg-white/6">
                          <ul className="space-y-1 text-[11px] text-muted-foreground">
                            {row.reasons.map((reason) => (
                              <li key={reason}>{formatReason(reason)}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="bg-white/75 px-3 py-3 dark:bg-white/6">
                          <div className="flex flex-col gap-3">
                            <Button asChild className="h-9 justify-between rounded-md px-3 text-[11px]" size="sm">
                              <Link
                                href={`/dashboard/attendees?search=${encodeURIComponent(
                                  row.providerOrderId,
                                )}&eventId=${encodeURIComponent(
                                  row.providerEventId,
                                )}&source=outstanding-balances&orderId=${encodeURIComponent(
                                  row.providerOrderId,
                                )}`}
                              >
                                Open attendee follow-up
                                <ArrowRight className="size-4" />
                              </Link>
                            </Button>
                            <p className="text-[10px] leading-5 text-muted-foreground">
                              Search lands on the related attendees for this order.
                            </p>
                          </div>
                        </td>
                        <td className="rounded-r-lg bg-white/75 px-3 py-3 dark:bg-white/6">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!canGenerate || linkState.isCreating}
                                onClick={() => void handleGenerateLink(row)}
                              >
                                {linkState.isCreating ? "Generating..." : "Generate Tikkie link"}
                              </Button>
                              {latestLink && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  disabled={linkState.isCopying}
                                  onClick={() => void handleCopyLink(row.providerOrderId, latestLink.paymentRequestUrl)}
                                >
                                  {linkState.isCopying ? "Copying..." : "Copy link"}
                                </Button>
                              )}
                              {latestLink && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={linkState.isLoading}
                                  onClick={() => void fetchRowLinks(row.providerOrderId, { refresh: true })}
                                >
                                  {linkState.isLoading ? "Refreshing..." : "Refresh status"}
                                </Button>
                              )}
                            </div>

                            {!canGenerate && (
                              <p className="text-[11px] text-muted-foreground">No outstanding amount for link generation.</p>
                            )}

                            {linkState.isLoading && (
                              <p className="text-[11px] text-muted-foreground">Loading link status...</p>
                            )}

                            {latestLink && (
                              <div className="space-y-1 text-[11px] text-muted-foreground">
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${statusBadgeClass(latestLink.status)}`}
                                >
                                  {formatTikkieStatus(latestLink.status)}
                                </span>
                                <div>Created: {formatDateTime(latestLink.createdAt)}</div>
                                <div>
                                  Last status check: {formatDateTime(latestLink.providerLastCheckedAt)} ({formatStatusSource(latestLink.statusSource)})
                                </div>
                                <div>Updated: {formatDateTime(latestLink.statusUpdatedAt)}</div>
                              </div>
                            )}

                            {linkState.error && <p className="text-[11px] text-red-600 dark:text-red-400">{linkState.error}</p>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          </CardContent>
        </Card>
      )}
    </section>
  )
}
