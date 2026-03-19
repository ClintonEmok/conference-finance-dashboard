"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"

type RevenueResponse = {
  generatedAt: string
  filters: {
    eventId: string | null
    from: string
    to: string
    trendGranularity: "day"
  }
  totals: {
    grossMinor: number
    paidMinor: number
    refundedMinor: number
    netMinor: number
  }
  statusCounts: {
    paid: number
    refunded: number
    cancelled: number
    pending: number
  }
  trend: Array<{
    bucket: string
    grossMinor: number
    paidMinor: number
    refundedMinor: number
    netMinor: number
    orderCount: number
  }>
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)
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

export default function DashboardPage() {
  const [eventIdInput, setEventIdInput] = useState("")
  const [fromDateInput, setFromDateInput] = useState(() => {
    const today = new Date()
    const from = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)
    return toDateInputValue(from)
  })
  const [toDateInput, setToDateInput] = useState(() => toDateInputValue(new Date()))

  const [appliedEventId, setAppliedEventId] = useState("")
  const [appliedFromDate, setAppliedFromDate] = useState(fromDateInput)
  const [appliedToDate, setAppliedToDate] = useState(toDateInput)

  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [payload, setPayload] = useState<RevenueResponse | null>(null)

  const inlineValidationError = useMemo(() => {
    const fromIso = toIsoBoundary(fromDateInput, "start")
    const toIso = toIsoBoundary(toDateInput, "end")

    if (!fromIso || !toIso) {
      return "Select valid from/to dates."
    }

    if (new Date(fromIso).getTime() > new Date(toIso).getTime()) {
      return "From date must be before or equal to To date."
    }

    return null
  }, [fromDateInput, toDateInput])

  useEffect(() => {
    const fromIso = toIsoBoundary(appliedFromDate, "start")
    const toIso = toIsoBoundary(appliedToDate, "end")

    if (!fromIso || !toIso) {
      setIsLoading(false)
      setPayload(null)
      setErrorMessage("Active filters include invalid dates.")
      return
    }

    const safeFromIso = fromIso
    const safeToIso = toIso

    const controller = new AbortController()

    async function loadRevenue() {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const query = new URLSearchParams()

        if (appliedEventId.trim()) {
          query.set("eventId", appliedEventId.trim())
        }

        query.set("from", safeFromIso)
        query.set("to", safeToIso)

        const response = await fetch(`/api/dashboard/revenue?${query.toString()}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null
          setPayload(null)
          setErrorMessage(body?.error?.message ?? `Failed to load revenue metrics (${response.status}).`)
          return
        }

        const body = (await response.json()) as RevenueResponse
        setPayload(body)
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return
        }

        setPayload(null)
        setErrorMessage("Network error while loading revenue metrics.")
      } finally {
        setIsLoading(false)
      }
    }

    loadRevenue()

    return () => {
      controller.abort()
    }
  }, [appliedEventId, appliedFromDate, appliedToDate])

  function onApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (inlineValidationError) {
      setErrorMessage(inlineValidationError)
      return
    }

    setAppliedEventId(eventIdInput)
    setAppliedFromDate(fromDateInput)
    setAppliedToDate(toDateInput)
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Revenue overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitor topline finance performance from synced Ticket Tailor orders.
        </p>
      </header>

      <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <form className="space-y-4" onSubmit={onApplyFilters}>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-1">
              <span className="text-sm font-medium">Event ID</span>
              <input
                type="text"
                value={eventIdInput}
                onChange={(event) => setEventIdInput(event.target.value)}
                placeholder="All events"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">From</span>
              <input
                type="date"
                value={fromDateInput}
                onChange={(event) => setFromDateInput(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">To</span>
              <input
                type="date"
                value={toDateInput}
                onChange={(event) => setToDateInput(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          {inlineValidationError && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
              {inlineValidationError}
            </p>
          )}

          <div>
            <Button type="submit" disabled={Boolean(inlineValidationError) || isLoading}>
              {isLoading ? "Loading…" : "Apply filters"}
            </Button>
          </div>
        </form>
      </article>

      {errorMessage && (
        <article className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {errorMessage}
        </article>
      )}

      {!errorMessage && isLoading && (
        <article className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          Loading revenue metrics…
        </article>
      )}

      {!errorMessage && !isLoading && payload && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Gross</p>
              <p className="mt-1 text-xl font-semibold">{formatMoney(payload.totals.grossMinor)}</p>
            </article>
            <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Paid</p>
              <p className="mt-1 text-xl font-semibold text-emerald-700 dark:text-emerald-400">
                {formatMoney(payload.totals.paidMinor)}
              </p>
            </article>
            <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Refunded</p>
              <p className="mt-1 text-xl font-semibold text-amber-700 dark:text-amber-400">
                {formatMoney(payload.totals.refundedMinor)}
              </p>
            </article>
            <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Net</p>
              <p className="mt-1 text-xl font-semibold">{formatMoney(payload.totals.netMinor)}</p>
            </article>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <h3 className="text-sm font-semibold">Order status counts</h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-border/70 p-3">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Paid</dt>
                  <dd className="mt-1 font-semibold">{payload.statusCounts.paid}</dd>
                </div>
                <div className="rounded-md border border-border/70 p-3">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Refunded</dt>
                  <dd className="mt-1 font-semibold">{payload.statusCounts.refunded}</dd>
                </div>
                <div className="rounded-md border border-border/70 p-3">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Cancelled</dt>
                  <dd className="mt-1 font-semibold">{payload.statusCounts.cancelled}</dd>
                </div>
                <div className="rounded-md border border-border/70 p-3">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Pending</dt>
                  <dd className="mt-1 font-semibold">{payload.statusCounts.pending}</dd>
                </div>
              </dl>
            </article>

            <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <h3 className="text-sm font-semibold">Applied scope</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 p-3">
                  <dt className="text-muted-foreground">Event</dt>
                  <dd className="font-mono text-xs">{payload.filters.eventId ?? "All events"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 p-3">
                  <dt className="text-muted-foreground">From</dt>
                  <dd className="font-mono text-xs">{new Date(payload.filters.from).toLocaleString()}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 p-3">
                  <dt className="text-muted-foreground">To</dt>
                  <dd className="font-mono text-xs">{new Date(payload.filters.to).toLocaleString()}</dd>
                </div>
              </dl>
            </article>
          </section>

          <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h3 className="text-base font-semibold">Daily trend</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Finance-safe daily breakdown suitable for charting or operational review.
            </p>

            {payload.trend.length === 0 ? (
              <p className="mt-4 rounded-md border border-border/70 p-3 text-sm text-muted-foreground">
                No synced orders found for the selected filters.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-2 py-2 font-medium text-muted-foreground">Date</th>
                      <th className="px-2 py-2 font-medium text-muted-foreground">Orders</th>
                      <th className="px-2 py-2 font-medium text-muted-foreground">Gross</th>
                      <th className="px-2 py-2 font-medium text-muted-foreground">Paid</th>
                      <th className="px-2 py-2 font-medium text-muted-foreground">Refunded</th>
                      <th className="px-2 py-2 font-medium text-muted-foreground">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.trend.map((bucket) => (
                      <tr key={bucket.bucket} className="border-b border-border/60">
                        <td className="px-2 py-2 font-mono text-xs">{bucket.bucket}</td>
                        <td className="px-2 py-2">{bucket.orderCount}</td>
                        <td className="px-2 py-2">{formatMoney(bucket.grossMinor)}</td>
                        <td className="px-2 py-2">{formatMoney(bucket.paidMinor)}</td>
                        <td className="px-2 py-2">{formatMoney(bucket.refundedMinor)}</td>
                        <td className="px-2 py-2 font-medium">{formatMoney(bucket.netMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </>
      )}
    </section>
  )
}
