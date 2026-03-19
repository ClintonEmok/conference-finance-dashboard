"use client"

import Link from "next/link"
import { ArrowRight, BedDouble, CalendarRange, HandCoins, RefreshCcwDot, Users } from "lucide-react"
import { FormEvent, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type RevenueResponse = {
  generatedAt: string
  filters: {
    eventId: string | null
    from: string
    to: string
    trendGranularity: "day"
  }
  availableEvents: Array<{
    providerEventId: string
    name: string | null
  }>
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
    eventLabel: string
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
    title: "Open financial workspace",
    description: "Start with revenue, ledger, and collections in one route.",
    href: "/dashboard/financial",
    icon: HandCoins,
  },
  {
    title: "Review outstanding balances",
    description: "Start with collection follow-up and resolve unpaid orders.",
    href: "/dashboard/reconciliation",
    icon: ArrowRight,
  },
  {
    title: "Open attendee follow-up",
    description: "Check attendee context before sending someone into room placement.",
    href: "/dashboard/attendees",
    icon: Users,
  },
  {
    title: "Manage room placement",
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
      <section className="space-y-4">
        <article className="overflow-hidden rounded-xl bg-[linear-gradient(145deg,rgba(113,84,255,0.97),rgba(83,56,171,0.94))] p-6 text-primary-foreground shadow-[0_20px_56px_rgba(78,52,166,0.24)] md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-foreground/70">
                Overview
              </p>
              <h2 className="mt-2.5 text-2xl font-semibold tracking-tight md:text-[2rem]">
                One live picture of conference finance and operator flow.
              </h2>
              <p className="mt-3 max-w-xl text-[13px] leading-6 text-primary-foreground/82 md:text-sm">
                Start with the current financial picture, then move directly into balances, attendee checks,
                and room placement without losing the thread.
              </p>
            </div>

            <div className="min-w-[210px] rounded-lg border border-white/18 bg-white/10 p-4 backdrop-blur">
              <p className="text-[10px] uppercase tracking-[0.18em] text-primary-foreground/70">Reporting scope</p>
              <p className="mt-2 text-xs font-medium">
                {payload?.filters.eventId ?? "All events"}
              </p>
              <div className="mt-3 flex items-start gap-2.5 text-xs text-primary-foreground/82">
                <CalendarRange className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p>{payload ? new Date(payload.filters.from).toLocaleDateString() : appliedFromDate}</p>
                  <p>{payload ? new Date(payload.filters.to).toLocaleDateString() : appliedToDate}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-lg bg-white/12 p-4 backdrop-blur-sm">
              <p className="text-xs text-primary-foreground/68">Gross</p>
              <p className="mt-1.5 text-xl font-semibold">
                {payload ? formatMoney(payload.totals.grossMinor) : "--"}
              </p>
            </article>
            <article className="rounded-lg bg-white/12 p-4 backdrop-blur-sm">
              <p className="text-xs text-primary-foreground/68">Paid</p>
              <p className="mt-1.5 text-xl font-semibold">
                {payload ? formatMoney(payload.totals.paidMinor) : "--"}
              </p>
            </article>
            <article className="rounded-lg bg-white/12 p-4 backdrop-blur-sm">
              <p className="text-xs text-primary-foreground/68">Refunded</p>
              <p className="mt-1.5 text-xl font-semibold">
                {payload ? formatMoney(payload.totals.refundedMinor) : "--"}
              </p>
            </article>
            <article className="rounded-lg bg-white/12 p-4 backdrop-blur-sm">
              <p className="text-xs text-primary-foreground/68">Net</p>
              <p className="mt-1.5 text-xl font-semibold">
                {payload ? formatMoney(payload.totals.netMinor) : "--"}
              </p>
            </article>
          </div>
        </article>

        <Card className="bg-background/85 backdrop-blur">
          <CardHeader className="pb-3">
            <CardDescription className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/70">
              Filter view
            </CardDescription>
            <CardTitle className="text-base">Refine the dashboard snapshot</CardTitle>
          </CardHeader>

          <CardContent>
          <form className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(180px,0.7fr)_minmax(180px,0.7fr)_150px] lg:items-end" onSubmit={onApplyFilters}>
            <label className="space-y-2 text-sm">
              <span className="text-xs font-medium text-foreground">Event ID</span>
              <select
                value={eventIdInput}
                onChange={(event) => setEventIdInput(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm"
              >
                <option value="">All events</option>
                {(payload?.availableEvents ?? []).map((event) => (
                  <option key={event.providerEventId} value={event.providerEventId}>
                    {event.name?.trim() || event.providerEventId}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-xs font-medium text-foreground">From</span>
                <input
                  type="date"
                  value={fromDateInput}
                  onChange={(event) => setFromDateInput(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm"
                />
              </label>

              <label className="space-y-2 text-sm">
                <span className="text-xs font-medium text-foreground">To</span>
                <input
                  type="date"
                  value={toDateInput}
                  onChange={(event) => setToDateInput(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs shadow-sm"
                />
              </label>
            </div>

            {inlineValidationError && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 lg:col-span-4 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                {inlineValidationError}
              </p>
            )}

            <Button className="h-9 w-full rounded-md text-xs lg:self-end" type="submit" disabled={Boolean(inlineValidationError) || isLoading}>
              {isLoading ? "Loading..." : "Apply reporting scope"}
            </Button>
          </form>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <article className="rounded-xl bg-[linear-gradient(145deg,rgba(113,84,255,0.94),rgba(82,56,170,0.92))] p-5 text-primary-foreground shadow-[0_18px_44px_rgba(74,48,164,0.2)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground/70">
            Today&apos;s focus
          </p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <h3 className="text-xl font-semibold tracking-tight">Clear balances, confirm attendees, then place the final rooms.</h3>
              <p className="mt-2 text-xs leading-5 text-primary-foreground/82">
                Keep the daily operator loop visible in the main dashboard instead of the sidebar.
              </p>
            </div>

            <Button asChild variant="secondary" className="h-9 rounded-md bg-white px-3 text-xs text-primary hover:bg-white/92">
              <Link href="/dashboard/reconciliation">
                Start follow-up
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-md bg-white/12 px-4 py-3 text-xs">
              <p className="text-primary-foreground/70">Flow</p>
              <p className="mt-1 font-semibold">Balances to rooms</p>
            </div>
            <div className="rounded-md bg-white/12 px-4 py-3 text-xs">
              <p className="text-primary-foreground/70">State</p>
              <p className="mt-1 font-semibold">MVP-ready loop</p>
            </div>
          </div>
        </article>

        <Card className="bg-background/85 backdrop-blur">
          <CardHeader>
            <CardDescription className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/70">
              Reporting notes
            </CardDescription>
            <CardTitle className="text-lg">What to review next</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <div className="rounded-md border border-border/70 bg-background px-3 py-3">
              Start in outstanding balances when an order still has money to collect.
            </div>
            <div className="rounded-md border border-border/70 bg-background px-3 py-3">
              Use attendee follow-up when a payment issue needs person-level context.
            </div>
            <div className="rounded-md border border-border/70 bg-background px-3 py-3">
              Move to room placement only after attendee and finance context are clear.
            </div>
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
          Loading revenue metrics...
        </article>
      )}

      {!errorMessage && !isLoading && payload && (
        <>
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <Card className="bg-background/85 backdrop-blur">
              <CardHeader>
                <CardDescription className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/70">
                  Quick actions
                </CardDescription>
                <CardTitle className="text-lg">Move into the next useful workflow</CardTitle>
              </CardHeader>

              <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {quickActions.map((action) => {
                  const Icon = action.icon

                  return (
                    <Link
                      key={action.href}
                      href={action.href}
                      className="group rounded-lg border border-border/70 bg-white/75 p-4 shadow-sm transition-all duration-200 hover:border-primary/20 hover:shadow-[0_12px_24px_rgba(52,34,120,0.08)] dark:bg-white/6"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary dark:bg-white/10 dark:text-primary-foreground">
                          <Icon className="size-4" />
                        </span>
                        <ArrowRight className="size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-primary" />
                      </div>
                      <h4 className="mt-4 text-sm font-semibold tracking-tight text-foreground">{action.title}</h4>
                      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{action.description}</p>
                    </Link>
                  )
                })}
              </div>
              </CardContent>
            </Card>

            <Card className="bg-background/85 backdrop-blur">
              <CardHeader>
                <CardDescription className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/70">
                  Order status mix
                </CardDescription>
                <CardTitle className="text-lg">How today&apos;s scope is distributed</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
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
                  const numericValue = Number(value)
                  const width = total === 0 || numericValue === 0 ? 0 : Math.max(8, Math.round((numericValue / total) * 100))

                  return (
                    <div key={String(label)}>
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">{label}</span>
                        <span className="text-muted-foreground">{value}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div className={`h-2 rounded-full ${colorClass}`} style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  )
                })}
              </CardContent>

              <div className="mx-5 mb-5 rounded-lg bg-muted/70 p-3 text-xs text-muted-foreground">
                Generated {new Date(payload.generatedAt).toLocaleString()} for operator review.
              </div>
            </Card>
          </section>

          <Card className="bg-background/85 backdrop-blur">
            <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardDescription className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/70">Daily trend</CardDescription>
                <CardTitle className="mt-1 text-lg">Finance-safe movement across the selected window</CardTitle>
              </div>
            </div>
            </CardHeader>

            {payload.trend.length === 0 ? (
              <CardContent>
              <p className="rounded-lg border border-border/70 p-4 text-xs text-muted-foreground">
                No synced orders found for the selected filters.
              </p>
              </CardContent>
            ) : (
              <CardContent>
              <div className="overflow-x-auto">
                <div className="mb-3 text-xs text-muted-foreground">
                  Daily trend is aggregated across the selected event scope, so the event filter above determines which event data is included.
                </div>
                <table className="min-w-full border-separate border-spacing-y-2.5 text-xs">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Event</th>
                      <th className="px-3 py-2">Orders</th>
                      <th className="px-3 py-2">Gross</th>
                      <th className="px-3 py-2">Paid</th>
                      <th className="px-3 py-2">Refunded</th>
                      <th className="px-3 py-2">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.trend.map((bucket) => (
                      <tr key={bucket.bucket} className="rounded-lg bg-white/75 shadow-sm dark:bg-white/6">
                        <td className="rounded-l-lg px-3 py-3 font-medium text-foreground">{bucket.bucket}</td>
                        <td className="px-3 py-3 text-muted-foreground">{bucket.eventLabel}</td>
                        <td className="px-3 py-3 text-muted-foreground">{bucket.orderCount}</td>
                        <td className="px-3 py-3 text-foreground">{formatMoney(bucket.grossMinor)}</td>
                        <td className="px-3 py-3 text-foreground">{formatMoney(bucket.paidMinor)}</td>
                        <td className="px-3 py-3 text-foreground">{formatMoney(bucket.refundedMinor)}</td>
                        <td className="rounded-r-lg px-3 py-3 font-semibold text-foreground">
                          {formatMoney(bucket.netMinor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </CardContent>
            )}
          </Card>
        </>
      )}
    </section>
  )
}
