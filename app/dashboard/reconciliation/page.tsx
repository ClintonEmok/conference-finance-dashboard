"use client"

import Link from "next/link"
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
    <section className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Outstanding balances</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Identify unpaid or mismatched orders, then hand off directly into attendee follow-up and room assignment.
        </p>
      </header>

      <article className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-100">
        Start here when an order needs action, then open the attendee ledger with the order already in focus.
      </article>

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
          Loading outstanding-balance rows…
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
                       <th className="px-2 py-2 font-medium text-muted-foreground">Next step</th>
                       <th className="px-2 py-2 font-medium text-muted-foreground">Tikkie</th>
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
                         <td className="px-2 py-2">
                           <div className="flex flex-col gap-2">
                             <Button asChild size="sm">
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
                               </Link>
                             </Button>
                             <p className="text-[11px] text-muted-foreground">
                               Search lands on the related attendees for this order.
                             </p>
                           </div>
                         </td>
                         <td className="px-2 py-2">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!canGenerate || linkState.isCreating}
                                onClick={() => void handleGenerateLink(row)}
                              >
                                {linkState.isCreating ? "Generating…" : "Generate Tikkie link"}
                              </Button>
                              {latestLink && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  disabled={linkState.isCopying}
                                  onClick={() => void handleCopyLink(row.providerOrderId, latestLink.paymentRequestUrl)}
                                >
                                  {linkState.isCopying ? "Copying…" : "Copy link"}
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
                                  {linkState.isLoading ? "Refreshing…" : "Refresh status"}
                                </Button>
                              )}
                            </div>

                            {!canGenerate && (
                              <p className="text-[11px] text-muted-foreground">No outstanding amount for link generation.</p>
                            )}

                            {linkState.isLoading && (
                              <p className="text-[11px] text-muted-foreground">Loading link status…</p>
                            )}

                            {latestLink && (
                              <div className="space-y-1 text-[11px]">
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${statusBadgeClass(latestLink.status)}`}
                                >
                                  {formatTikkieStatus(latestLink.status)}
                                </span>
                                <div className="text-muted-foreground">Created: {formatDateTime(latestLink.createdAt)}</div>
                                <div className="text-muted-foreground">
                                  Last status check: {formatDateTime(latestLink.providerLastCheckedAt)} ({formatStatusSource(latestLink.statusSource)})
                                </div>
                                <div className="text-muted-foreground">Updated: {formatDateTime(latestLink.statusUpdatedAt)}</div>
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
          </article>
        </>
      )}
    </section>
  )
}
