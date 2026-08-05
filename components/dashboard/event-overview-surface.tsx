"use client"

import Link from "next/link"
import { use, useEffect, useMemo, useState } from "react"
import { ArrowRight, BedDouble, CreditCard, Users, WalletCards } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import { useEventDashboard } from "@/components/dashboard/event-dashboard-context"
import { formatMoney } from "@/lib/format"
import { useAccommodationSummaryForEventForOverview, useEventAllocationSummaryForOverview } from "@/lib/convex/hooks/accommodation"
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
import type { DashboardQueryStatus } from "@/lib/dashboard/query-state"

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

function MetricIcon({ metric }: { metric: EventOverviewProjection["metrics"][number] }) {
  const Icon = metric.key === "attendance" ? Users : metric.key === "orders" ? WalletCards : metric.key === "money" ? CreditCard : BedDouble
  return <Icon className="size-5" aria-hidden="true" />
}

function metricPresentationState(
  metric: EventOverviewProjection["metrics"][number]
): DashboardQueryStatus {
  if (metric.state.status !== "ready") return metric.state.status
  if (!metric.values) return "unavailable"
  if (
    (metric.key === "attendance" || metric.key === "orders") &&
    Number(metric.values.total) === 0
  ) {
    return "empty"
  }
  if (
    metric.key === "accommodation" &&
    (Number(metric.values.hotelsLinked) === 0 ||
      Number(metric.values.assignableSlots) === 0)
  ) {
    return "unconfigured"
  }
  return "ready"
}

function metricValue(
  metric: EventOverviewProjection["metrics"][number],
  onRetry: () => void
) {
  const state = metricPresentationState(metric)
  if (state !== "ready") {
    const message = "message" in metric.state ? metric.state.message : undefined
    return <DashboardQueryState state={state} message={message} onRetry={state === "error" ? onRetry : undefined} />
  }
  if (!metric.values) return null
  if (metric.key === "attendance") return Number(metric.values.total).toLocaleString()
  if (metric.key === "orders") return Number(metric.values.total).toLocaleString()
  if (metric.key === "money") return formatMoney(Number(metric.values.orderValueMinor))
  return `${Number(metric.values.assignableSlots).toLocaleString()} slots`
}

function domainState(
  domain: FetchState<unknown>,
  onRetry: () => void
) {
  const hasData = domain.status === "ready" && domain.data !== undefined
  const state: DashboardQueryStatus = domain.status === "ready" && !hasData ? "unavailable" : domain.status
  const message = "message" in domain ? domain.message : undefined
  return <DashboardQueryState state={state} message={message} onRetry={state === "error" ? onRetry : undefined} />
}

export default function EventOverviewSurface({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const { event } = useEventDashboard()
  const accommodationSummary = useAccommodationSummaryForEventForOverview(event?.accommodationEnabled ? event._id : undefined)
  const allocationSummary = useEventAllocationSummaryForOverview(event?.accommodationEnabled ? event._id : undefined)
  const [revenue, setRevenue] = useState<FetchState<RevenuePayload>>(loading)
  const [orders, setOrders] = useState<FetchState<OrdersPayload>>(loading)
  const [attendees, setAttendees] = useState<FetchState<AttendeesPayload>>(loading)
  const [reconciliation, setReconciliation] = useState<FetchState<ReconciliationPayload>>(loading)
  const [requestAttempt, setRequestAttempt] = useState(0)

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
  }, [event, scope, requestAttempt])

  const accommodation = useMemo<FetchState<AccommodationPayload>>(() => {
    if (!event?.accommodationEnabled) return { status: "disabled" }
    if (accommodationSummary.status === "pending" || allocationSummary.status === "pending") return { status: "loading" }
    if (accommodationSummary.status === "error") return { status: "error", message: accommodationSummary.message }
    if (allocationSummary.status === "error") return { status: "error", message: allocationSummary.message }
    return {
      status: "ready",
      data: {
        summary: {
          hotelsLinked: accommodationSummary.data.hotelsLinked,
          totalSlots: accommodationSummary.data.totalSlots,
          assignableSlots: accommodationSummary.data.assignableSlots,
          submissionsCount: accommodationSummary.data.submissionsCount,
          unassignedAttendeesCount: allocationSummary.data?.unassignedAttendeesCount ?? 0,
        },
      },
    }
  }, [accommodationSummary, allocationSummary, event?.accommodationEnabled])

  const projection = projectEventOverview({
    event: { id: event._id, slug: event.slug, title: event.title, startsAt: event.startsAt, accommodationEnabled: event.accommodationEnabled },
    scope,
    revenue,
    orders,
    attendees,
    reconciliation,
    accommodation,
  })
  const moneyMetric = projection.metrics.find((metric) => metric.key === "money")
  const hasPendingData = projection.metrics.some((metric) => metric.state.status === "loading")
  const hasUnavailableData = projection.metrics.some((metric) => metric.state.status === "error" || metric.state.status === "unavailable")
  const hasRequestError = [revenue, orders, attendees, reconciliation].some((domain) => domain.status === "error")
  const retryRequests = () => setRequestAttempt((attempt) => attempt + 1)

  return (
    <section className="min-w-0 space-y-6" aria-labelledby="event-overview-title">
      <Card className="min-w-0">
        <CardHeader>
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">Event overview</p>
          <CardTitle id="event-overview-title" className="break-words text-3xl">{event.title}</CardTitle>
          <CardDescription>{scope?.label ?? "Event lifetime is unavailable until this event has a valid start date."}</CardDescription>
        </CardHeader>
      </Card>

      {hasRequestError ? (
        <DashboardQueryState
          state="error"
          title="Overview data is unavailable"
          message="One or more event metrics could not be loaded. Try again to refresh the existing overview reads."
          onRetry={retryRequests}
          className="rounded-xl border border-destructive/20 bg-destructive/5 p-4"
        />
      ) : null}

      <Card className="min-w-0" aria-labelledby="overview-attention-title">
        <CardHeader><CardTitle id="overview-attention-title">What needs attention</CardTitle><CardDescription>Only confirmed operational exceptions appear here.</CardDescription></CardHeader>
        <CardContent className="min-w-0 space-y-3">
          {hasPendingData ? (
            <DashboardQueryState
              state="loading"
              title="Checking for follow-up"
              message="The overview is still loading current event exceptions."
            />
          ) : projection.exceptions.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{hasUnavailableData ? "Some overview data is unavailable; no additional exception was confirmed." : "No follow-up needed."}</p>
          ) : projection.exceptions.map((exception) => (
              <div key={exception.key} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
               <div className="min-w-0"><p className="font-semibold">{exception.title}</p><p className="break-words text-sm text-muted-foreground">{exception.reason}</p></div>
               <Button asChild variant="outline" size="sm"><Link href={exception.href}>Open {exception.title.toLowerCase()} <ArrowRight className="ml-2 size-4" aria-hidden="true" /></Link></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {projection.metrics.map((metric) => (
          <Card key={metric.key} className="min-w-0">
            <CardHeader className="flex flex-row items-start justify-between space-y-0"><div className="min-w-0"><CardDescription>{metric.label}</CardDescription><div className="mt-2 text-2xl font-semibold">{metricValue(metric, retryRequests)}</div></div><div className="rounded-xl bg-primary/10 p-3 text-primary"><MetricIcon metric={metric} /></div></CardHeader>
            <CardContent className="min-w-0 space-y-3"><p className="break-words text-xs text-muted-foreground">{metric.scope}</p><Button asChild variant="ghost" size="sm" className="px-0"><Link href={metric.href}>Open details <ArrowRight className="ml-2 size-4" aria-hidden="true" /></Link></Button></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-3">
        <Card className="min-w-0"><CardHeader><CardTitle>Paid</CardTitle><CardDescription>Total paid this event</CardDescription></CardHeader><CardContent className="min-w-0 text-2xl font-semibold">{revenue.status === "ready" && revenue.data ? formatMoney(revenue.data.totals.paidMinor) : domainState(revenue, retryRequests)}</CardContent></Card>
        <Card className="min-w-0"><CardHeader><CardTitle>Outstanding</CardTitle><CardDescription>Reconciliation balance</CardDescription></CardHeader><CardContent className="min-w-0 text-2xl font-semibold">{moneyMetric?.state.status === "ready" && moneyMetric.values ? formatMoney(Number(moneyMetric.values.outstandingMinor)) : moneyMetric ? <DashboardQueryState state={moneyMetric.state.status === "ready" ? "unavailable" : moneyMetric.state.status} message={"message" in moneyMetric.state ? moneyMetric.state.message : undefined} onRetry={moneyMetric.state.status === "error" ? retryRequests : undefined} /> : null}</CardContent></Card>
        <Card className="min-w-0"><CardHeader><CardTitle>Next setup</CardTitle><CardDescription>Keep this event operational</CardDescription></CardHeader><CardContent><Button asChild variant="outline"><Link href={`/dashboard/events/${slug}/settings`}>Event Settings <ArrowRight className="ml-2 size-4" aria-hidden="true" /></Link></Button></CardContent></Card>
      </div>
    </section>
  )
}
