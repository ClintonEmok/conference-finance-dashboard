"use client"

import Link from "next/link"
import { ArrowRight, BedDouble, CalendarRange, HandCoins, RefreshCcwDot, Users } from "lucide-react"
import { FormEvent, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

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
    providerOrderId: string
    eventName: string | null
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
  const [attendeesPayload, setAttendeesPayload] = useState<AttendeesSnippetPayload | null>(null)

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
          fetch(`/api/dashboard/revenue?${query.toString()}`, { signal: controller.signal }),
          fetch(`/api/dashboard/attendees?${attendeesQuery.toString()}`, { signal: controller.signal })
        ])

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null
          setPayload(null)
          setAttendeesPayload(null)
          setErrorMessage(body?.error?.message ?? `Failed to load revenue metrics (${response.status}).`)
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
      <header className="mb-4">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Live snapshot of conference finance and attendee flow.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <article key={i} className="relative flex flex-col justify-center overflow-hidden rounded-xl border border-[rgba(113,84,255,0.4)] bg-[linear-gradient(145deg,rgba(113,84,255,0.92),rgba(83,56,171,0.88))] p-5 shadow-[0_12px_32px_rgba(78,52,166,0.14)]">
              <Skeleton className="h-3 w-16 bg-white/20" />
              <Skeleton className="mt-3 h-8 w-24 bg-white/30" />
            </article>
          ))
        ) : [
          { label: "Gross", value: payload ? formatMoney(payload.totals.grossMinor) : "--" },
          { label: "Paid", value: payload ? formatMoney(payload.totals.paidMinor) : "--" },
          { label: "Refunded", value: payload ? formatMoney(payload.totals.refundedMinor) : "--" },
          { label: "Net", value: payload ? formatMoney(payload.totals.netMinor) : "--" },
        ].map((metric) => (
          <article key={metric.label} className="relative flex flex-col justify-center overflow-hidden rounded-xl border border-[rgba(113,84,255,0.4)] bg-[linear-gradient(145deg,rgba(113,84,255,0.92),rgba(83,56,171,0.88))] p-5 shadow-[0_12px_32px_rgba(78,52,166,0.14)] transition-transform hover:scale-[1.02]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 relative z-10">{metric.label}</p>
            <p className="mt-2 text-2xl font-bold text-white relative z-10">{metric.value}</p>
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
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            {/* Main Data Column */}
            <div className="space-y-6">
              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="text-[11px] font-semibold text-foreground uppercase tracking-[0.18em] text-muted-foreground">Daily trend</h3>
                  <p className="text-sm font-semibold text-foreground mt-1 tracking-tight">Movement across the active window</p>
                </div>

                {isLoading ? (
                  <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/40 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5 pb-2">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/20 text-left text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          <th className="px-4 py-3 font-semibold">Date</th>
                          <th className="px-4 py-3 font-semibold">Event</th>
                          <th className="px-4 py-3 font-semibold text-right">Orders</th>
                          <th className="px-4 py-3 font-semibold text-right">Gross</th>
                          <th className="px-4 py-3 font-semibold text-right">Net</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i}>
                            <td className="px-4 py-3"><Skeleton className="h-3 w-20" /></td>
                            <td className="px-4 py-3"><Skeleton className="h-3 w-24" /></td>
                            <td className="px-4 py-3 text-right"><Skeleton className="h-3 w-8 ml-auto" /></td>
                            <td className="px-4 py-3 text-right"><Skeleton className="h-3 w-16 ml-auto" /></td>
                            <td className="px-4 py-3 text-right"><Skeleton className="h-3 w-16 ml-auto" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : payload?.trend.length === 0 ? (
                  <p className="rounded-xl border border-white/60 bg-white/50 p-4 text-xs text-muted-foreground shadow-sm dark:border-white/10 dark:bg-white/5">
                    No synced orders found for the default scope.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/40 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5 pb-2">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/20 text-left text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          <th className="px-4 py-3 font-semibold">Date</th>
                          <th className="px-4 py-3 font-semibold">Event</th>
                          <th className="px-4 py-3 font-semibold text-right">Orders</th>
                          <th className="px-4 py-3 font-semibold text-right">Gross</th>
                          <th className="px-4 py-3 font-semibold text-right">Net</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {payload!.trend.map((bucket) => (
                          <tr key={bucket.bucket} className="transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                            <td className="px-4 py-3 font-medium text-foreground">{bucket.bucket}</td>
                            <td className="px-4 py-3 text-muted-foreground truncate max-w-[120px]">{bucket.eventLabel}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium text-muted-foreground">{bucket.orderCount}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatMoney(bucket.grossMinor)}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">{formatMoney(bucket.netMinor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Attendees snippet */}
              <div className="flex flex-col gap-3 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[11px] font-semibold text-foreground uppercase tracking-[0.18em] text-muted-foreground">Latest attendees</h3>
                    <p className="text-sm font-semibold text-foreground mt-1 tracking-tight">Recent signups in scope</p>
                  </div>
                  <Button asChild variant="outline" className="h-8 rounded-md text-xs px-3 bg-white/40 border-white/60 dark:bg-white/5 dark:border-white/10 backdrop-blur-md hover:bg-white/60">
                    <Link href="/dashboard/attendees">
                      View all <ArrowRight className="ml-1 size-3" />
                    </Link>
                  </Button>
                </div>

                {isLoading ? (
                  <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/40 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5 pb-2">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/20 text-left text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          <th className="px-4 py-3 font-semibold">Attendee</th>
                          <th className="px-4 py-3 font-semibold">Event</th>
                          <th className="px-4 py-3 font-semibold">Room</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <tr key={i}>
                            <td className="px-4 py-3">
                              <Skeleton className="h-3 w-24 mb-1.5" />
                              <Skeleton className="h-2 w-32" />
                            </td>
                            <td className="px-4 py-3"><Skeleton className="h-3 w-20" /></td>
                            <td className="px-4 py-3">
                              <Skeleton className="h-3 w-16 mb-1.5" />
                              <Skeleton className="h-2 w-20" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : !attendeesPayload || attendeesPayload.rows.length === 0 ? (
                  <p className="rounded-xl border border-white/60 bg-white/50 p-4 text-xs text-muted-foreground shadow-sm dark:border-white/10 dark:bg-white/5">
                    No attendees found for the default scope.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/40 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5 pb-2">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/20 text-left text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          <th className="px-4 py-3 font-semibold">Attendee</th>
                          <th className="px-4 py-3 font-semibold">Event</th>
                          <th className="px-4 py-3 font-semibold">Room</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {attendeesPayload.rows.map((row) => (
                          <tr key={row.attendeeId} className="transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                            <td className="px-4 py-3">
                              <div className="font-medium text-foreground">{row.attendeeName ?? "Unnamed attendee"}</div>
                              <div className="text-muted-foreground truncate max-w-[120px]">{row.attendeeEmail ?? "-"}</div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              <div className="truncate max-w-[100px]">{row.eventName ?? "-"}</div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {row.roomStatus.status === "assigned" ? (
                                <div>
                                  <div className="font-medium text-foreground truncate max-w-[100px]">{row.roomStatus.roomLabel}</div>
                                  <div className="text-[11px] truncate max-w-[120px]">{row.roomStatus.hotelName}</div>
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
                <h3 className="text-[11px] font-semibold text-foreground uppercase tracking-[0.18em] text-muted-foreground">Status mix</h3>
                <div className="mt-3 space-y-4 rounded-xl border border-white/60 bg-white/40 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5">
                  {isLoading || !payload ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i}>
                        <div className="mb-2 flex items-center justify-between">
                          <Skeleton className="h-2.5 w-12" />
                          <Skeleton className="h-2.5 w-8" />
                        </div>
                        <Skeleton className="h-1.5 w-full rounded-full" />
                      </div>
                    ))
                  ) : [
                    ["Paid", payload.statusCounts.paid, "bg-[linear-gradient(135deg,#7154ff,#5238aa)] text-white"],
                    ["Pending", payload.statusCounts.pending, "bg-amber-400 text-amber-950"],
                    ["Refunded", payload.statusCounts.refunded, "bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-slate-100"],
                    ["Cancelled", payload.statusCounts.cancelled, "bg-destructive/60 text-destructive"],
                  ].map(([label, value, colorClass]) => {
                    const statusCounts = payload!.statusCounts
                    const total =
                      statusCounts.paid +
                      statusCounts.pending +
                      statusCounts.refunded +
                      statusCounts.cancelled
                    const numericValue = Number(value)
                    const width = total === 0 || numericValue === 0 ? 0 : Math.max(6, Math.round((numericValue / total) * 100))

                    return (
                      <div key={String(label)}>
                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground">{label}</span>
                          <span className="text-muted-foreground tabular-nums">{value}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
                          <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <h3 className="text-[11px] font-semibold text-foreground uppercase tracking-[0.18em] text-muted-foreground">Quick actions</h3>
                <div className="mt-3 flex flex-col gap-2">
                  {quickActions.map((action) => {
                    const Icon = action.icon
                    return (
                      <Link
                        key={action.href}
                        href={action.href}
                        className="group flex items-center justify-between rounded-xl border border-white/60 bg-white/40 p-3 shadow-sm backdrop-blur-md transition-all hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[linear-gradient(135deg,#7154ff,#5238aa)] text-white shadow-sm">
                            <Icon className="size-3.5" />
                          </div>
                          <span className="truncate text-[13px] font-semibold text-foreground">
                            {action.title}
                          </span>
                        </div>
                        <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground shrink-0" />
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
