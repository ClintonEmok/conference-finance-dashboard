"use client"

import Link from "next/link"
import {
  ArrowRight,
  CalendarRange,
  HandCoins,
  RefreshCcwDot,
} from "lucide-react"
import { SyntheticEvent, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatMoney } from "@/lib/format"

type RevenueResponse = {
  generatedAt: string
  filters: {
    eventId: string | null
    from: string
    to: string
    trendGranularity: "day"
  }
  availableEvents: Array<{
    eventId: string
    slug: string
    title: string | null
    startsAt: number | null
    currency: string | null
  }>
  totals: {
    orderValueMinor: number
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
    orderValueMinor: number
    paidMinor: number
    refundedMinor: number
    netMinor: number
    orderCount: number
  }>
}

type GenderType = "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"

function formatGenderLabel(value: GenderType | null) {
  if (value === "MALE") return "Male"
  if (value === "FEMALE") return "Female"
  if (value === "MIXED") return "Mixed"
  if (value === "UNKNOWN") return "Unknown"
  return "Not set"
}

type AttendeesSnippetPayload = {
  rows: Array<{
    attendeeId: string
    attendeeName: string | null
    attendeeEmail: string | null
    genderType: GenderType | null
    eventTitle: string | null
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
  }>
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatEventStartsAt(value: number | null) {
  if (!value) return "Date not set"

  return format(new Date(value), "MMM d, yyyy")
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
    title: "Manage orders",
    description: "Work the canonical order queue and drill into contact people.",
    href: "/dashboard/manage-orders",
    icon: HandCoins,
  },
  {
    title: "Open event overviews",
    description: "Jump to the per-event overview surface for the current event.",
    href: "/dashboard/events",
    icon: CalendarRange,
  },
  {
    title: "Financial drilldown",
    description: "Scan revenue, balances, and collection follow-up in one place.",
    href: "/dashboard/financial",
    icon: ArrowRight,
  },
  {
    title: "Review reconciliation",
    description: "Track unpaid, cancelled, and refund cases for follow-up.",
    href: "/dashboard/reconciliation",
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
  const [toDateInput, setToDateInput] = useState(() =>
    toDateInputValue(new Date())
  )

  const [appliedEventId, setAppliedEventId] = useState("")
  const [appliedFromDate, setAppliedFromDate] = useState(fromDateInput)
  const [appliedToDate, setAppliedToDate] = useState(toDateInput)

  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [payload, setPayload] = useState<RevenueResponse | null>(null)
  const [attendeesPayload, setAttendeesPayload] =
    useState<AttendeesSnippetPayload | null>(null)
  const visibleEvents = payload?.availableEvents.slice(0, 6) ?? []

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

        const attendeesQuery = new URLSearchParams(query)
        attendeesQuery.set("page", "1")
        attendeesQuery.set("pageSize", "6")

        const [response, attResponse] = await Promise.all([
          fetch(`/api/dashboard/revenue?${query.toString()}`, {
            signal: controller.signal,
          }),
          fetch(`/api/dashboard/attendees?${attendeesQuery.toString()}`, {
            signal: controller.signal,
          }),
        ])

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { message?: string }
          } | null
          setPayload(null)
          setAttendeesPayload(null)
          setErrorMessage(
            body?.error?.message ??
              `Failed to load revenue metrics (${response.status}).`
          )
          return
        }

        if (attResponse.ok) {
          const attBody = (await attResponse.json()) as AttendeesSnippetPayload
          setAttendeesPayload(attBody)
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

  function onApplyFilters(event: SyntheticEvent) {
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
      <header className="mb-4">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Global overview
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Live ops health across orders, balances, and event drilldowns.
        </p>
      </header>

      <article className="rounded-3xl border border-border/50 bg-card/40 p-6 shadow-sm backdrop-blur-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="text-[10px] font-bold tracking-[0.22em] text-muted-foreground uppercase">
              Canonical overview
            </p>
            <h3 className="text-3xl font-bold tracking-tight text-foreground">
              See global status, then jump straight to the right event.
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              Use this surface to spot revenue movement, collection gaps, and
              the event overviews that need operator attention.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild className="h-11 rounded-xl px-5 shadow-lg shadow-primary/20">
              <Link href="/dashboard/manage-orders">Open manage orders</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 rounded-xl border-border/60 bg-background/70 px-5 backdrop-blur"
            >
              <Link href="/dashboard/events">Browse event overviews</Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="h-11 rounded-xl px-5 text-foreground"
            >
              <Link href="/dashboard/financial">Open financial drilldown</Link>
            </Button>
          </div>
        </div>
      </article>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <article
                key={i}
                className="relative flex flex-col justify-center overflow-hidden rounded-xl border border-[rgba(113,84,255,0.4)] bg-[linear-gradient(145deg,rgba(113,84,255,0.92),rgba(83,56,171,0.88))] p-5 shadow-[0_12px_32px_rgba(78,52,166,0.14)]"
              >
                <Skeleton className="h-3 w-16 bg-white/20" />
                <Skeleton className="mt-3 h-8 w-24 bg-white/30" />
              </article>
            ))
          : [
              {
                label: "Order value",
                value: payload
                  ? formatMoney(payload.totals.orderValueMinor)
                  : "--",
              },
              {
                label: "Paid",
                value: payload ? formatMoney(payload.totals.paidMinor) : "--",
              },
              {
                label: "Refunded",
                value: payload
                  ? formatMoney(payload.totals.refundedMinor)
                  : "--",
              },
              {
                label: "Net",
                value: payload ? formatMoney(payload.totals.netMinor) : "--",
              },
            ].map((metric) => (
              <article
                key={metric.label}
                className="relative flex flex-col justify-center overflow-hidden rounded-xl border border-[rgba(113,84,255,0.4)] bg-[linear-gradient(145deg,rgba(113,84,255,0.92),rgba(83,56,171,0.88))] p-5 shadow-[0_12px_32px_rgba(78,52,166,0.14)] transition-transform hover:scale-[1.02]"
              >
                <p className="relative z-10 text-[11px] font-semibold tracking-[0.18em] text-white/70 uppercase">
                  {metric.label}
                </p>
                <p className="relative z-10 mt-2 text-2xl font-bold text-white">
                  {metric.value}
                </p>
              </article>
            ))}
      </div>

      {errorMessage && (
        <article className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {errorMessage}
        </article>
      )}

      {!errorMessage && (
        <>
          {visibleEvents.length > 0 && (
            <article className="rounded-3xl border border-border/50 bg-card/40 p-6 shadow-sm backdrop-blur-xl">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
                    Event overviews
                  </p>
                  <h3 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                    Jump into an event-level overview
                  </h3>
                </div>
                <Link
                  href="/dashboard/events"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View all events
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleEvents.map((event) => (
                  <div
                    key={event.eventId}
                    className="rounded-2xl border border-border/50 bg-background/50 p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-lg font-bold text-foreground">
                          {event.title ?? event.slug}
                        </h4>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatEventStartsAt(event.startsAt)} · {event.currency ?? "Currency unset"}
                        </p>
                      </div>
                      <CalendarRange className="size-5 text-primary" />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button asChild size="sm" className="rounded-xl">
                        <Link href={`/dashboard/events/${event.slug}/overview`}>
                          Open overview
                        </Link>
                      </Button>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="rounded-xl"
                      >
                        <Link href="/dashboard/manage-orders">Manage orders</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          )}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            {/* Main Data Column */}
            <div className="space-y-6">
              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="text-[11px] font-semibold tracking-[0.18em] text-foreground text-muted-foreground uppercase">
                    Global order trend
                  </h3>
                  <p className="mt-1 text-sm font-semibold tracking-tight text-foreground">
                    Movement across the active overview window
                  </p>
                </div>

                {isLoading ? (
                  <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/40 pb-2 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/20 text-left text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                          <th className="px-4 py-3 font-semibold">Date</th>
                          <th className="px-4 py-3 font-semibold">Event</th>
                          <th className="px-4 py-3 text-right font-semibold">
                            Orders
                          </th>
                          <th className="px-4 py-3 text-right font-semibold">
                            Order value
                          </th>
                          <th className="px-4 py-3 text-right font-semibold">
                            Net
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i}>
                            <td className="px-4 py-3">
                              <Skeleton className="h-3 w-20" />
                            </td>
                            <td className="px-4 py-3">
                              <Skeleton className="h-3 w-24" />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Skeleton className="ml-auto h-3 w-8" />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Skeleton className="ml-auto h-3 w-16" />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Skeleton className="ml-auto h-3 w-16" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : payload?.trend.length === 0 ? (
                  <p className="rounded-xl border border-white/60 bg-white/50 p-4 text-xs text-muted-foreground shadow-sm dark:border-white/10 dark:bg-white/5">
                    No synced orders found for the current overview window.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/40 pb-2 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/20 text-left text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                          <th className="px-4 py-3 font-semibold">Date</th>
                          <th className="px-4 py-3 font-semibold">Event</th>
                          <th className="px-4 py-3 text-right font-semibold">
                            Orders
                          </th>
                          <th className="px-4 py-3 text-right font-semibold">
                            Order value
                          </th>
                          <th className="px-4 py-3 text-right font-semibold">
                            Net
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {payload?.trend.map((bucket) => (
                          <tr
                            key={bucket.bucket}
                            className="transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <td className="px-4 py-3 font-medium text-foreground">
                              {bucket.bucket}
                            </td>
                            <td className="max-w-[120px] truncate px-4 py-3 text-muted-foreground">
                              {bucket.eventLabel}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-muted-foreground tabular-nums">
                              {bucket.orderCount}
                            </td>
                            <td className="px-4 py-3 text-right text-foreground tabular-nums">
                              {formatMoney(bucket.orderValueMinor)}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-foreground tabular-nums">
                              {formatMoney(bucket.netMinor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Contact people snippet */}
              <div className="flex flex-col gap-3 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[11px] font-semibold tracking-[0.18em] text-foreground text-muted-foreground uppercase">
                      Latest contact people
                    </h3>
                    <p className="mt-1 text-sm font-semibold tracking-tight text-foreground">
                      Recent contact people in scope
                    </p>
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    className="h-8 rounded-md border-white/60 bg-white/40 px-3 text-xs backdrop-blur-md hover:bg-white/60 dark:border-white/10 dark:bg-white/5"
                  >
                    <Link href="/dashboard/attendees">
                      View all contact people <ArrowRight className="ml-1 size-3" />
                    </Link>
                  </Button>
                </div>

                {isLoading ? (
                  <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/40 pb-2 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/20 text-left text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                          <th className="px-4 py-3 font-semibold">Contact person</th>
                          <th className="px-4 py-3 font-semibold">Event</th>
                          <th className="px-4 py-3 font-semibold">Room</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <tr key={i}>
                            <td className="px-4 py-3">
                              <Skeleton className="mb-1.5 h-3 w-24" />
                              <Skeleton className="h-2 w-32" />
                            </td>
                            <td className="px-4 py-3">
                              <Skeleton className="h-3 w-20" />
                            </td>
                            <td className="px-4 py-3">
                              <Skeleton className="mb-1.5 h-3 w-16" />
                              <Skeleton className="h-2 w-20" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : !attendeesPayload || attendeesPayload.rows.length === 0 ? (
                  <p className="rounded-xl border border-white/60 bg-white/50 p-4 text-xs text-muted-foreground shadow-sm dark:border-white/10 dark:bg-white/5">
                    No contact people found for the current overview window.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/40 pb-2 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/20 text-left text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                          <th className="px-4 py-3 font-semibold">Contact person</th>
                          <th className="px-4 py-3 font-semibold">Event</th>
                          <th className="px-4 py-3 font-semibold">Room</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {attendeesPayload.rows.map((row) => (
                          <tr
                            key={row.attendeeId}
                            className="transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-foreground">
                                {row.attendeeName ?? "Unnamed contact person"}
                              </div>
                              <div className="max-w-[120px] truncate text-muted-foreground">
                                {row.attendeeEmail ?? "-"}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              <div className="max-w-[100px] truncate">
                                {row.eventTitle ?? "-"}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {row.roomStatus.status === "assigned" ? (
                                <div>
                                  <div className="max-w-[100px] truncate font-medium text-foreground">
                                    {row.roomStatus.roomLabel}
                                  </div>
                                  <div className="max-w-[120px] truncate text-[11px]">
                                    {row.roomStatus.hotelName}
                                  </div>
                                </div>
                              ) : (
                                "Unassigned"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Right Sidebar Column */}
            <div className="space-y-6">
              <div>
                <h3 className="text-[11px] font-semibold tracking-[0.18em] text-foreground text-muted-foreground uppercase">
                  Order status mix
                </h3>
                <div className="mt-3 space-y-4 rounded-xl border border-white/60 bg-white/40 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5">
                  {isLoading || !payload
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <div key={i}>
                          <div className="mb-2 flex items-center justify-between">
                            <Skeleton className="h-2.5 w-12" />
                            <Skeleton className="h-2.5 w-8" />
                          </div>
                          <Skeleton className="h-1.5 w-full rounded-full" />
                        </div>
                      ))
                    : [
                        [
                          "Paid",
                          payload.statusCounts.paid,
                          "bg-[linear-gradient(135deg,#7154ff,#5238aa)] text-white",
                        ],
                        [
                          "Pending",
                          payload.statusCounts.pending,
                          "bg-amber-400 text-amber-950",
                        ],
                        [
                          "Refunded",
                          payload.statusCounts.refunded,
                          "bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-slate-100",
                        ],
                        [
                          "Cancelled",
                          payload.statusCounts.cancelled,
                          "bg-destructive/60 text-destructive",
                        ],
                      ].map(([label, value, colorClass]) => {
                        const statusCounts = payload?.statusCounts
                        const total =
                          statusCounts.paid +
                          statusCounts.pending +
                          statusCounts.refunded +
                          statusCounts.cancelled
                        const numericValue = Number(value)
                        const width =
                          total === 0 || numericValue === 0
                            ? 0
                            : Math.max(
                                6,
                                Math.round((numericValue / total) * 100)
                              )

                        return (
                          <div key={String(label)}>
                            <div className="mb-1.5 flex items-center justify-between text-xs">
                              <span className="font-semibold text-foreground">
                                {label}
                              </span>
                              <span className="text-muted-foreground tabular-nums">
                                {value}
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
                              <div
                                className={`h-full rounded-full ${colorClass}`}
                                style={{ width: `${width}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                </div>
              </div>

              <div>
                <h3 className="text-[11px] font-semibold tracking-[0.18em] text-foreground text-muted-foreground uppercase">
                  Quick actions
                </h3>
                <div className="mt-3 flex flex-col gap-2">
                  {quickActions.map((action) => {
                    const Icon = action.icon
                    return (
                      <Link
                        key={action.href}
                        href={action.href}
                        className="group flex items-center justify-between rounded-xl border border-white/60 bg-white/40 p-3 shadow-sm backdrop-blur-md transition-all hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[linear-gradient(135deg,#7154ff,#5238aa)] text-white shadow-sm">
                            <Icon className="size-3.5" />
                          </div>
                          <span className="truncate text-[13px] font-semibold text-foreground">
                            {action.title}
                          </span>
                        </div>
                        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
