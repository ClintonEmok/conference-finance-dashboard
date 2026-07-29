"use client"

import Link from "next/link"
import { use, useEffect, useMemo, useState } from "react"
import { ArrowRight, BedDouble, CreditCard, Users, WalletCards } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatMoney } from "@/lib/format"
import { useEventBySlug } from "@/lib/convex/hooks/events"
import { useAccommodationSummaryForEvent, useEventAllocationSummary } from "@/lib/convex/hooks/accommodation"
import {
  createEventOverviewScope,
  projectEventOverview,
  type AccommodationPayload,
  type AttendeesPayload,
  type EventOverviewProjection,
  type OverviewDomain,
  type OrdersPayload,
  type ReconciliationPayload,
  type RevenuePayload,
} from "@/lib/domain/overview/event-overview"

type FetchState<T> = OverviewDomain<T>

const loading = <T,>(): FetchState<T> => ({ status: "loading" })

function scopeQuery(scope: { eventId: string; from: string; to: string }) {
  return new URLSearchParams({ eventId: scope.eventId, from: scope.from, to: scope.to })
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Overview data request failed (${response.status})`)
  return (await response.json()) as T
}

function stateMessage(status: string) {
  if (status === "loading") return "Loading…"
  if (status === "error") return "Could not load"
  if (status === "unavailable") return "Unavailable"
  if (status === "empty") return "No activity yet"
  if (status === "disabled") return "Not enabled"
  if (status === "unconfigured") return "Not configured"
  return "—"
}

function MetricIcon({ metric }: { metric: EventOverviewProjection["metrics"][number] }) {
  const Icon = metric.key === "attendance" ? Users : metric.key === "orders" ? WalletCards : metric.key === "money" ? CreditCard : BedDouble
  return <Icon className="size-5" aria-hidden="true" />
}

function metricValue(metric: EventOverviewProjection["metrics"][number]) {
  if (metric.state.status !== "ready" || !metric.values) return stateMessage(metric.state.status)
  if (metric.key === "attendance") return Number(metric.values.total) === 0 ? "No activity yet" : Number(metric.values.total).toLocaleString()
  if (metric.key === "orders") return Number(metric.values.total) === 0 ? "No activity yet" : Number(metric.values.total).toLocaleString()
  if (metric.key === "money") return Number(metric.values.orderValueMinor) === 0 ? "No activity yet" : formatMoney(Number(metric.values.orderValueMinor))
  if (Number(metric.values.hotelsLinked) === 0 || Number(metric.values.assignableSlots) === 0) return "Not configured"
  return `${Number(metric.values.assignableSlots).toLocaleString()} slots`
}

export default function EventOverviewSurface({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const event = useEventBySlug(slug)
  const accommodationSummary = useAccommodationSummaryForEvent(event?.accommodationEnabled ? event._id : undefined)
  const allocationSummary = useEventAllocationSummary(event?.accommodationEnabled ? event._id : undefined)
  const [revenue, setRevenue] = useState<FetchState<RevenuePayload>>(loading)
  const [orders, setOrders] = useState<FetchState<OrdersPayload>>(loading)
  const [attendees, setAttendees] = useState<FetchState<AttendeesPayload>>(loading)
  const [reconciliation, setReconciliation] = useState<FetchState<ReconciliationPayload>>(loading)

  const scope = useMemo(() => {
    if (!event) return null
    return createEventOverviewScope(
      { id: event._id, slug: event.slug, title: event.title, startsAt: event.startsAt, accommodationEnabled: event.accommodationEnabled },
      new Date(),
    )
  }, [event])

  useEffect(() => {
    if (!event || !scope) {
      if (event) {
        const unavailable = { status: "unavailable" as const, message: "The event start date is not available." }
        setRevenue(unavailable)
        setOrders(unavailable)
        setAttendees(unavailable)
        setReconciliation(unavailable)
      }
      return
    }

    const controller = new AbortController()
    const query = scopeQuery(scope)
    const ordersQuery = new URLSearchParams(query)
    ordersQuery.set("page", "1")
    ordersQuery.set("pageSize", "1")
    const attendeesQuery = new URLSearchParams(query)
    attendeesQuery.set("page", "1")
    attendeesQuery.set("pageSize", "1")

    setRevenue(loading)
    setOrders(loading)
    setAttendees(loading)
    setReconciliation(loading)

    void Promise.allSettled([
      getJson<RevenuePayload>(`/api/dashboard/revenue?${query}`, controller.signal),
      getJson<OrdersPayload>(`/api/dashboard/orders?${ordersQuery}`, controller.signal),
      getJson<AttendeesPayload>(`/api/dashboard/attendees?${attendeesQuery}`, controller.signal),
      getJson<ReconciliationPayload>(`/api/dashboard/reconciliation?${query}`, controller.signal),
    ]).then(([revenueResult, ordersResult, attendeesResult, reconciliationResult]) => {
      if (controller.signal.aborted) return
      const apply = <T,>(result: PromiseSettledResult<T>, setter: (state: FetchState<T>) => void) => {
        setter(result.status === "fulfilled" ? { status: "ready", data: result.value } : { status: "error", message: "Overview data could not be loaded." })
      }
      apply(revenueResult, setRevenue)
      apply(ordersResult, setOrders)
      apply(attendeesResult, setAttendees)
      apply(reconciliationResult, setReconciliation)
    })

    return () => controller.abort()
  }, [event, scope])

  const accommodation = useMemo<FetchState<AccommodationPayload>>(() => {
    if (!event?.accommodationEnabled) return { status: "disabled" }
    if (accommodationSummary === undefined || allocationSummary === undefined) return { status: "loading" }
    return {
      status: "ready",
      data: {
        summary: {
          hotelsLinked: accommodationSummary.hotelsLinked,
          totalSlots: accommodationSummary.totalSlots,
          assignableSlots: accommodationSummary.assignableSlots,
          submissionsCount: accommodationSummary.submissionsCount,
          unassignedAttendeesCount: allocationSummary.unassignedAttendeesCount,
        },
      },
    }
  }, [accommodationSummary, allocationSummary, event?.accommodationEnabled])

  if (event === undefined) {
    return <section className="space-y-6" aria-label="Loading event overview"><Skeleton className="h-40 rounded-2xl" /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-2xl" />)}</div></section>
  }

  if (event === null) {
    return <Card><CardHeader><CardTitle>Event not found</CardTitle><CardDescription>This event could not be resolved from the selected link.</CardDescription></CardHeader></Card>
  }

  const projection = projectEventOverview({
    event: { id: event._id, slug: event.slug, title: event.title, startsAt: event.startsAt, accommodationEnabled: event.accommodationEnabled },
    scope,
    revenue,
    orders,
    attendees,
    reconciliation,
    accommodation,
  })
  const hasUnavailableData = projection.metrics.some((metric) => metric.state.status === "error" || metric.state.status === "unavailable")

  return (
    <section className="space-y-6">
      <Card>
        <CardHeader>
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">Event overview</p>
          <CardTitle className="text-3xl">{event.title}</CardTitle>
          <CardDescription>{scope?.label ?? "Event lifetime is unavailable until this event has a valid start date."}</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader><CardTitle>What needs attention</CardTitle><CardDescription>Only confirmed operational exceptions appear here.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {projection.exceptions.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{hasUnavailableData ? "Some overview data is unavailable; no additional exception was confirmed." : "No follow-up needed."}</p>
          ) : projection.exceptions.map((exception) => (
            <div key={exception.key} className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-semibold">{exception.title}</p><p className="text-sm text-muted-foreground">{exception.reason}</p></div>
              <Button asChild variant="outline" size="sm"><Link href={exception.href}>Open {exception.title.toLowerCase()} <ArrowRight className="ml-2 size-4" /></Link></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {projection.metrics.map((metric) => (
          <Card key={metric.key}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0"><div><CardDescription>{metric.label}</CardDescription><CardTitle className="mt-2 text-2xl">{metricValue(metric)}</CardTitle></div><div className="rounded-xl bg-primary/10 p-3 text-primary"><MetricIcon metric={metric} /></div></CardHeader>
            <CardContent className="space-y-3"><p className="text-xs text-muted-foreground">{metric.scope}</p>{metric.state.status === "error" ? <p className="text-xs text-destructive">{metric.state.message}</p> : null}<Button asChild variant="ghost" size="sm" className="px-0"><Link href={metric.href}>Open details <ArrowRight className="ml-2 size-4" /></Link></Button></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle>Paid</CardTitle><CardDescription>Canonical event-start-to-now total</CardDescription></CardHeader><CardContent className="text-2xl font-semibold">{revenue.status === "ready" && revenue.data ? formatMoney(revenue.data.totals.paidMinor) : stateMessage(revenue.status)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Outstanding</CardTitle><CardDescription>Canonical reconciliation balance</CardDescription></CardHeader><CardContent className="text-2xl font-semibold">{reconciliation.status === "ready" && reconciliation.data ? formatMoney(reconciliation.data.totals.outstandingMinor) : stateMessage(reconciliation.status)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Next setup</CardTitle><CardDescription>Keep this event operational</CardDescription></CardHeader><CardContent><Button asChild variant="outline"><Link href={`/dashboard/events/${slug}/settings`}>Event Settings <ArrowRight className="ml-2 size-4" /></Link></Button></CardContent></Card>
      </div>
    </section>
  )
}
