"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"

type CanonicalOrderStatus = "paid" | "refunded" | "cancelled" | "pending"

type ReconciliationPayload = {
  generatedAt: string
  filters: {
    eventId: string | null
    from: string
    to: string
    status: CanonicalOrderStatus | null
  }
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
    <section className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Reconciliation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Identify outstanding balances and mismatched order states requiring follow-up.
        </p>
      </header>

      <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <form className="space-y-4" onSubmit={applyFilters}>
          <div className="grid gap-4 md:grid-cols-4">
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
              <span className="text-sm font-medium">Status</span>
              <select
                value={statusInput}
                onChange={(event) => setStatusInput(event.target.value as "all" | CanonicalOrderStatus)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="paid">Paid</option>
                <option value="refunded">Refunded</option>
                <option value="cancelled">Cancelled</option>
                <option value="pending">Pending</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">From</span>
              <input
                type="date"
                value={fromInput}
                onChange={(event) => setFromInput(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">To</span>
              <input
                type="date"
                value={toInput}
                onChange={(event) => setToInput(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          {dateValidationError && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
              {dateValidationError}
            </p>
          )}

          <div>
            <Button type="submit" disabled={Boolean(dateValidationError) || isLoading}>
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
          Loading reconciliation rows…
        </article>
      )}

      {!errorMessage && !isLoading && payload && (
        <>
          <section className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Flagged rows</p>
              <p className="mt-1 text-xl font-semibold">{payload.totals.rows}</p>
            </article>
            <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding</p>
              <p className="mt-1 text-xl font-semibold">{formatMoney(payload.totals.outstandingMinor)}</p>
            </article>
          </section>

          <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
            {payload.rows.length === 0 ? (
              <p className="rounded-md border border-border/70 p-3 text-sm text-muted-foreground">
                No outstanding or mismatch candidates found for the selected filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-2 py-2 font-medium text-muted-foreground">Order</th>
                      <th className="px-2 py-2 font-medium text-muted-foreground">Event</th>
                      <th className="px-2 py-2 font-medium text-muted-foreground">Status</th>
                      <th className="px-2 py-2 font-medium text-muted-foreground">Amount</th>
                      <th className="px-2 py-2 font-medium text-muted-foreground">Outstanding</th>
                      <th className="px-2 py-2 font-medium text-muted-foreground">Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.rows.map((row) => (
                      <tr key={row.providerOrderId} className="border-b border-border/60">
                        <td className="px-2 py-2 font-mono text-xs">
                          <div>{row.providerOrderId}</div>
                          <div className="text-muted-foreground">{row.orderedAt ? new Date(row.orderedAt).toLocaleString() : "-"}</div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="text-xs">{row.eventName ?? "Unknown event"}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">{row.providerEventId}</div>
                        </td>
                        <td className="px-2 py-2">{row.normalizedStatus}</td>
                        <td className="px-2 py-2">{formatMoney(row.totalAmountMinor)}</td>
                        <td className="px-2 py-2 font-medium">{formatMoney(row.outstandingMinor)}</td>
                        <td className="px-2 py-2">
                          <ul className="list-inside list-disc text-xs text-muted-foreground">
                            {row.reasons.map((reason) => (
                              <li key={reason}>{formatReason(reason)}</li>
                            ))}
                          </ul>
                        </td>
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
