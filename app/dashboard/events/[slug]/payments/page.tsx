"use client"

import { use, useEffect, useMemo, useState } from "react"
import { CalendarRange, CreditCard, HandCoins, MapPin, ShieldCheck } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useQuery } from "convex/react"
import { api } from "@/lib/convex/api"
import { useEventBySlug } from "@/lib/convex/hooks/events"
import { formatMoney } from "@/lib/format"

type RevenueResponse = {
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
}

type ReconciliationResponse = {
  totals: {
    rows: number
    outstandingMinor: number
  }
  rows: Array<{
    orderId: string | null
    providerOrderId: string | null
    eventId: string
    eventSlug: string
    eventTitle: string | null
    normalizedStatus: "paid" | "refunded" | "cancelled" | "pending"
    amountDueMinor: number | null
    totalAmountMinor: number | null
    currency: string | null
    orderedAt: string | null
    refundedAt: string | null
    outstandingMinor: number
    reasons: Array<string>
  }>
}

type MetricCard = {
  label: string
  value: string
  desc: string
  icon: typeof HandCoins
}

type AttendeeLedgerRow = {
  _id: string
  orderId: string
  location: string | null
  amountDueMinor: number
  orderTotalAmountMinor: number | null
  orderAmountDueMinor: number | null
  orderStatus: "paid" | "refunded" | "cancelled" | "pending" | null
}

type LocationSummary = {
  location: string
  orderCount: number
  attendeeCount: number
  totalMinor: number
  paidMinor: number
  outstandingMinor: number
}

function normalizeLocation(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : "Unspecified"
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

export default function EventPaymentsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const event = useEventBySlug(slug)
  const attendeeRows = useQuery(
    api.attendees.getAttendeesWithTickets,
    event?._id ? { eventId: event._id } : "skip"
  )
  const [revenue, setRevenue] = useState<RevenueResponse | null>(null)
  const [reconciliation, setReconciliation] = useState<ReconciliationResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!event?._id) return

    const controller = new AbortController()
    const to = new Date().toISOString()
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - 30)
    const from = fromDate.toISOString()

    async function load() {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const query = new URLSearchParams({
          eventId: event._id,
          from,
          to,
        })

        const [revenueResponse, reconciliationResponse] = await Promise.all([
          fetch(`/api/dashboard/revenue?${query.toString()}`, { signal: controller.signal }),
          fetch(`/api/dashboard/reconciliation?${query.toString()}`, { signal: controller.signal }),
        ])

        if (!revenueResponse.ok || !reconciliationResponse.ok) {
          throw new Error("Failed to load finance overview data")
        }

        setRevenue((await revenueResponse.json()) as RevenueResponse)
        setReconciliation((await reconciliationResponse.json()) as ReconciliationResponse)
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return
        setErrorMessage("Network error while loading the finance overview.")
      } finally {
        setIsLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [event?._id])

  const metrics = useMemo<MetricCard[]>(() => {
    const paidMinor =
      revenue && reconciliation
        ? Math.max(revenue.totals.orderValueMinor - reconciliation.totals.outstandingMinor, 0)
        : null

    return [
      {
        label: "Order value",
        value: revenue ? formatMoney(revenue.totals.orderValueMinor) : "--",
        desc: "Gross order value in scope",
        icon: HandCoins,
      },
      {
        label: "Paid",
        value: paidMinor === null ? "--" : formatMoney(paidMinor),
        desc: "Gross value minus amount left",
        icon: CreditCard,
      },
      {
        label: "Outstanding",
        value: reconciliation ? formatMoney(reconciliation.totals.outstandingMinor) : "--",
        desc: `${reconciliation?.totals.rows ?? 0} rows still need attention`,
        icon: CalendarRange,
      },
      {
        label: "Donations",
        value: revenue ? formatMoney(revenue.totals.netMinor) : "--",
        desc: "Net donations in scope",
        icon: ShieldCheck,
      },
    ]
  }, [reconciliation, revenue])

  const locationSummaries = useMemo<LocationSummary[]>(() => {
    if (!attendeeRows?.length) return []

    const orders = new Map<
      string,
      {
        location: string
        attendeeCount: number
        totalMinor: number
        paidMinor: number
        outstandingMinor: number
      }
    >()

    for (const row of attendeeRows as AttendeeLedgerRow[]) {
      const existing = orders.get(row.orderId)
      const rowLocation = normalizeLocation(row.location)
      if (!existing) {
        const totalMinor = row.orderTotalAmountMinor ?? 0
        const outstandingMinor = row.orderAmountDueMinor ?? 0
        orders.set(row.orderId, {
          location: rowLocation,
          attendeeCount: 1,
          totalMinor,
          paidMinor: Math.max(totalMinor - outstandingMinor, 0),
          outstandingMinor,
        })
      } else {
        existing.attendeeCount += 1
        if (existing.location === "Unspecified" && rowLocation !== "Unspecified") {
          existing.location = rowLocation
        }
      }
    }

    const byLocation = new Map<string, LocationSummary>()

    for (const order of orders.values()) {
      const current = byLocation.get(order.location) ?? {
        location: order.location,
        orderCount: 0,
        attendeeCount: 0,
        totalMinor: 0,
        paidMinor: 0,
        outstandingMinor: 0,
      }

      current.orderCount += 1
      current.attendeeCount += order.attendeeCount
      current.totalMinor += order.totalMinor
      current.paidMinor += order.paidMinor
      current.outstandingMinor += order.outstandingMinor
      byLocation.set(order.location, current)
    }

    return Array.from(byLocation.values()).sort((a, b) => b.totalMinor - a.totalMinor)
  }, [attendeeRows])

  const maxLocationMinor = locationSummaries.reduce((max, item) => Math.max(max, item.totalMinor), 0)
  if (!event) return null

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-medium text-destructive">
          Could not load finance data.
          <div className="mt-1 text-xs opacity-80">{errorMessage}</div>
        </div>
      )}

      <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
        <CardHeader>
          <div className="space-y-3">
            <p className="text-[10px] font-black tracking-[0.22em] text-muted-foreground uppercase">
              Finance overview
            </p>
            <CardTitle className="text-3xl font-bold tracking-tight">{event.title}</CardTitle>
            <CardDescription className="max-w-2xl text-muted-foreground/80">
              Live tracker for money in, money out, and where the remaining balance sits across locations.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon

          return (
            <Card key={metric.label} className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
              <CardContent className="flex items-start justify-between gap-4 p-6">
                <div className="space-y-2">
                  <p className="text-[10px] font-black tracking-[0.22em] text-muted-foreground uppercase">{metric.label}</p>
                  <p className="text-3xl font-bold tracking-tight text-foreground">{metric.value}</p>
                  <p className="text-xs text-muted-foreground">{metric.desc}</p>
                </div>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" />
            Grouped by location
          </CardTitle>
          <CardDescription>Order-level payment load grouped by attendee location.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {attendeeRows === undefined ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)
          ) : locationSummaries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/50 bg-background/40 p-6 text-sm text-muted-foreground">
              No attendee location data yet.
            </div>
          ) : (
            locationSummaries.map((item) => {
              const width = maxLocationMinor === 0 ? 0 : Math.max(8, Math.round((item.totalMinor / maxLocationMinor) * 100))
              const paidRate = item.totalMinor === 0 ? 0 : (item.paidMinor / item.totalMinor) * 100

              return (
                <div key={item.location} className="space-y-2 rounded-2xl border border-border/50 bg-background/50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-foreground">{item.location}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.orderCount} orders · {item.attendeeCount} attendees
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                        {formatMoney(item.totalMinor)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatPercent(paidRate)} collected
                      </p>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{formatMoney(item.paidMinor)} paid</span>
                    <span>{formatMoney(item.outstandingMinor)} outstanding</span>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

    </div>
  )
}
