"use client"

import Link from "next/link"
import { ArrowRight, BedDouble, CalendarRange, HandCoins, RefreshCcwDot, Users } from "lucide-react"
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

const quickActions = [
  {
    title: "Review outstanding balances",
    description: "Start with collection follow-up and resolve unpaid orders.",
    href: "/dashboard/reconciliation",
    icon: HandCoins,
  },
  {
    title: "Open attendee follow-up",
    description: "Check attendee context before sending someone into room allocation.",
    href: "/dashboard/attendees",
    icon: Users,
  },
  {
    title: "Manage room allocation",
    description: "Place unassigned attendees and monitor room pressure.",
    href: "/dashboard/accommodation",
    icon: BedDouble,
  },
  {
    title: "Run Ticket Tailor sync",
    description: "Refresh source-of-truth data before finance review.",
    href: "/dashboard/ticket-tailor/sync",
    icon: RefreshCcwDot,
  },
] as const

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

    void loadRevenue()

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
    <section className="space-y-8">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
        <article className="overflow-hidden rounded-[2rem] bg-[linear-gradient(145deg,rgba(113,84,255,0.97),rgba(83,56,171,0.94))] p-7 text-primary-foreground shadow-[0_28px_80px_rgba(78,52,166,0.28)] md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-foreground/70">
                Overview
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                One live picture of conference finance and operator flow.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-primary-foreground/82 md:text-base">
                Start with the current financial picture, then move directly into balances, attendee checks,
                and room placement without losing the thread.
              </p>
            </div>

            <div className="min-w-[210px] rounded-[1.5rem] border border-white/18 bg-white/10 p-5 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-primary-foreground/70">Reporting scope</p>
              <p className="mt-2 text-sm font-medium">
                {payload?.filters.eventId ?? "All events"}
              </p>
              <div className="mt-4 flex items-start gap-3 text-sm text-primary-foreground/82">
                <CalendarRange className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p>{payload ? new Date(payload.filters.from).toLocaleDateString() : appliedFromDate}</p>
                  <p>{payload ? new Date(payload.filters.to).toLocaleDateString() : appliedToDate}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[1.5rem] bg-white/12 p-5 backdrop-blur-sm">
              <p className="text-sm text-primary-foreground/68">Gross</p>
              <p className="mt-2 text-2xl font-semibold">
                {payload ? formatMoney(payload.totals.grossMinor) : "--"}
              </p>
            </article>
            <article className="rounded-[1.5rem] bg-white/12 p-5 backdrop-blur-sm">
              <p className="text-sm text-primary-foreground/68">Paid</p>
              <p className="mt-2 text-2xl font-semibold">
                {payload ? formatMoney(payload.totals.paidMinor) : "--"}
              </p>
            </article>
            <article className="rounded-[1.5rem] bg-white/12 p-5 backdrop-blur-sm">
              <p className="text-sm text-primary-foreground/68">Refunded</p>
              <p className="mt-2 text-2xl font-semibold">
                {payload ? formatMoney(payload.totals.refundedMinor) : "--"}
              </p>
            </article>
            <article className="rounded-[1.5rem] bg-white/12 p-5 backdrop-blur-sm">
              <p className="text-sm text-primary-foreground/68">Net</p>
              <p className="mt-2 text-2xl font-semibold">
                {payload ? formatMoney(payload.totals.netMinor) : "--"}
              </p>
            </article>
          </div>
        </article>

        <article className="rounded-[2rem] border border-border/70 bg-background/80 p-6 shadow-[0_20px_60px_rgba(34,22,72,0.08)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/70">Filter view</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight">Refine the dashboard snapshot</h3>
            </div>
          </div>

          <form className="mt-5 space-y-4" onSubmit={onApplyFilters}>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">Event ID</span>
              <input
                type="text"
                value={eventIdInput}
                onChange={(event) => setEventIdInput(event.target.value)}
                placeholder="All events"
                className="h-12 w-full rounded-2xl border border-input bg-background px-4 text-sm shadow-sm"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-foreground">From</span>
                <input
                  type="date"
                  value={fromDateInput}
                  onChange={(event) => setFromDateInput(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-input bg-background px-4 text-sm shadow-sm"
                />
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-foreground">To</span>
                <input
                  type="date"
                  value={toDateInput}
                  onChange={(event) => setToDateInput(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-input bg-background px-4 text-sm shadow-sm"
                />
              </label>
            </div>

            {inlineValidationError && (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                {inlineValidationError}
              </p>
            )}

            <Button className="h-12 w-full rounded-2xl" type="submit" disabled={Boolean(inlineValidationError) || isLoading}>
              {isLoading ? "Loading..." : "Apply reporting scope"}
            </Button>
          </form>
        </article>
      </section>

      {errorMessage && (
        <article className="rounded-[1.5rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {errorMessage}
        </article>
      )}

      {!errorMessage && isLoading && (
        <article className="rounded-[1.75rem] border border-border bg-background/80 p-6 text-sm text-muted-foreground shadow-sm backdrop-blur">
          Loading revenue metrics...
        </article>
      )}

      {!errorMessage && !isLoading && payload && (
        <>
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <article className="rounded-[2rem] border border-border/70 bg-background/80 p-6 shadow-[0_20px_60px_rgba(34,22,72,0.06)] backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/70">Quick actions</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight">Move into the next useful workflow</h3>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {quickActions.map((action) => {
                  const Icon = action.icon

                  return (
                    <Link
                      key={action.href}
                      href={action.href}
                      className="group rounded-[1.5rem] border border-border/70 bg-white/75 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_18px_44px_rgba(52,34,120,0.12)] dark:bg-white/6"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-white/10 dark:text-primary-foreground">
                          <Icon className="size-5" />
                        </span>
                        <ArrowRight className="size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-primary" />
                      </div>
                      <h4 className="mt-5 text-lg font-semibold tracking-tight text-foreground">{action.title}</h4>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{action.description}</p>
                    </Link>
                  )
                })}
              </div>
            </article>

            <article className="rounded-[2rem] border border-border/70 bg-background/80 p-6 shadow-[0_20px_60px_rgba(34,22,72,0.06)] backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/70">Order status mix</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight">How today&apos;s scope is distributed</h3>

              <div className="mt-6 space-y-4">
                {[
                  ["Paid", payload.statusCounts.paid, "bg-primary"],
                  ["Pending", payload.statusCounts.pending, "bg-amber-400"],
                  ["Refunded", payload.statusCounts.refunded, "bg-slate-400"],
                  ["Cancelled", payload.statusCounts.cancelled, "bg-rose-400"],
                ].map(([label, value, colorClass]) => {
                  const total =
                    payload.statusCounts.paid +
                    payload.statusCounts.pending +
                    payload.statusCounts.refunded +
                    payload.statusCounts.cancelled
                  const width = total === 0 ? 0 : Math.max(8, Math.round((Number(value) / total) * 100))

                  return (
                    <div key={String(label)}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">{label}</span>
                        <span className="text-muted-foreground">{value}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-muted">
                        <div className={`h-2.5 rounded-full ${colorClass}`} style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-6 rounded-[1.5rem] bg-muted/70 p-4 text-sm text-muted-foreground">
                Generated {new Date(payload.generatedAt).toLocaleString()} for operator review.
              </div>
            </article>
          </section>

          <article className="rounded-[2rem] border border-border/70 bg-background/80 p-6 shadow-[0_20px_60px_rgba(34,22,72,0.06)] backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/70">Daily trend</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">Finance-safe movement across the selected window</h3>
              </div>
              <div className="rounded-full border border-border/70 bg-muted/60 px-4 py-2 text-sm text-muted-foreground">
                Event: {payload.filters.eventId ?? "All events"}
              </div>
            </div>

            {payload.trend.length === 0 ? (
              <p className="mt-5 rounded-[1.5rem] border border-border/70 p-4 text-sm text-muted-foreground">
                No synced orders found for the selected filters.
              </p>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-3 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Orders</th>
                      <th className="px-4 py-2">Gross</th>
                      <th className="px-4 py-2">Paid</th>
                      <th className="px-4 py-2">Refunded</th>
                      <th className="px-4 py-2">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.trend.map((bucket) => (
                      <tr key={bucket.bucket} className="rounded-[1.25rem] bg-white/75 shadow-sm dark:bg-white/6">
                        <td className="rounded-l-[1.25rem] px-4 py-4 font-medium text-foreground">{bucket.bucket}</td>
                        <td className="px-4 py-4 text-muted-foreground">{bucket.orderCount}</td>
                        <td className="px-4 py-4 text-foreground">{formatMoney(bucket.grossMinor)}</td>
                        <td className="px-4 py-4 text-foreground">{formatMoney(bucket.paidMinor)}</td>
                        <td className="px-4 py-4 text-foreground">{formatMoney(bucket.refundedMinor)}</td>
                        <td className="rounded-r-[1.25rem] px-4 py-4 font-semibold text-foreground">
                          {formatMoney(bucket.netMinor)}
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
