"use client"

import Link from "next/link"
import { use, useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import {
  ArrowRight,
  CalendarRange,
  CreditCard,
  HandCoins,
  Link2,
  Users,
} from "lucide-react"
import { useMutation } from "convex/react"

import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/format"
import { useEventBySlug } from "@/lib/convex/hooks/events"

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

type OrdersResponse = {
  page: {
    number: number
    size: number
    totalRows: number
    totalPages: number
  }
  rows: Array<{
    orderId: string
    eventId: string
    eventTitle: string | null
    normalizedStatus: "paid" | "refunded" | "cancelled" | "pending"
    isArchived: boolean
    amountDueMinor: number | null
    totalAmountMinor: number | null
    currency: string | null
    orderedAt: string | null
    buyerName: string | null
    buyerEmail: string | null
  }>
}

type AttendeesResponse = {
  page: {
    number: number
    size: number
    totalRows: number
    totalPages: number
  }
  rows: Array<{
    attendeeId: string
    attendeeName: string | null
    attendeeEmail: string | null
    genderType: string | null
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

type Grouping = "order" | "family" | "attendee"

function formatDateTime(value: string | null) {
  if (!value) return "—"
  return format(new Date(value), "PP p")
}

function statusLabel(status: string) {
  if (status === "paid") return "Paid"
  if (status === "refunded") return "Refunded"
  if (status === "cancelled") return "Cancelled"
  return "Pending"
}

function groupingLabel(grouping: Grouping) {
  if (grouping === "family") return "Family"
  if (grouping === "attendee") return "Attendees"
  return "Order"
}

export default function EventOverviewSurface({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const event = useEventBySlug(slug)
  const [grouping, setGrouping] = useState<Grouping>("order")
  const [revenue, setRevenue] = useState<RevenueResponse | null>(null)
  const [orders, setOrders] = useState<OrdersResponse | null>(null)
  const [attendees, setAttendees] = useState<AttendeesResponse | null>(null)
  const [reconciliation, setReconciliation] = useState<ReconciliationResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async (abortSignal: AbortSignal) => {
    if (!event?._id) return

    const to = new Date().toISOString()
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - 30)
    const from = fromDate.toISOString()

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const query = new URLSearchParams({
        eventId: event._id,
        from,
        to,
      })

      const ordersQuery = new URLSearchParams(query)
      ordersQuery.set("page", "1")
      ordersQuery.set("pageSize", "8")

      const attendeesQuery = new URLSearchParams(query)
      attendeesQuery.set("page", "1")
      attendeesQuery.set("pageSize", "8")

      const [revenueResponse, ordersResponse, attendeesResponse, reconciliationResponse] =
        await Promise.all([
          fetch(`/api/dashboard/revenue?${query.toString()}`, {
            signal: abortSignal,
          }),
          fetch(`/api/dashboard/orders?${ordersQuery.toString()}`, {
            signal: abortSignal,
          }),
          fetch(`/api/dashboard/attendees?${attendeesQuery.toString()}`, {
            signal: abortSignal,
          }),
          fetch(`/api/dashboard/reconciliation?${query.toString()}`, {
            signal: abortSignal,
          }),
        ])

      if (!revenueResponse.ok || !ordersResponse.ok || !attendeesResponse.ok || !reconciliationResponse.ok) {
        throw new Error("Failed to load event overview data")
      }

      setRevenue((await revenueResponse.json()) as RevenueResponse)
      setOrders((await ordersResponse.json()) as OrdersResponse)
      setAttendees((await attendeesResponse.json()) as AttendeesResponse)
      setReconciliation((await reconciliationResponse.json()) as ReconciliationResponse)
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return
      setErrorMessage("Network error while loading the event overview.")
    } finally {
      setIsLoading(false)
    }
  }, [event?._id])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const familyGroups = useMemo(() => {
    const rows = orders?.rows ?? []
    const groups = new Map<
      string,
      {
        label: string
        contactEmail: string
        orderCount: number
        totalMinor: number
        dueMinor: number
        paidCount: number
        pendingCount: number
        latestOrderAt: string | null
      }
    >()

    for (const row of rows) {
      const label = row.buyerName?.trim() || row.buyerEmail?.trim() || "Unassigned attendee"
      const key = label.toLowerCase()
      const totalMinor = row.totalAmountMinor ?? row.amountDueMinor ?? 0
      const dueMinor = row.amountDueMinor ?? row.totalAmountMinor ?? 0

      if (!groups.has(key)) {
        groups.set(key, {
          label,
          contactEmail: row.buyerEmail ?? "—",
          orderCount: 0,
          totalMinor: 0,
          dueMinor: 0,
          paidCount: 0,
          pendingCount: 0,
          latestOrderAt: row.orderedAt,
        })
      }

      const group = groups.get(key)!
      group.orderCount += 1
      group.totalMinor += totalMinor
      group.dueMinor += dueMinor
      if (row.normalizedStatus === "paid") group.paidCount += 1
      if (row.normalizedStatus === "pending") group.pendingCount += 1
      if (!group.latestOrderAt || (row.orderedAt && row.orderedAt > group.latestOrderAt)) {
        group.latestOrderAt = row.orderedAt
      }
    }

    return Array.from(groups.values()).sort((a, b) => b.totalMinor - a.totalMinor)
  }, [orders])

  const orderRows = orders?.rows ?? []
  const attendeeRows = attendees?.rows ?? []
  const issueRows = reconciliation?.rows ?? []
  const hasAccommodation = Boolean(event.accommodationEnabled)

  const totalContactPeople = attendees?.page.totalRows ?? 0
  const totalOrders = orders?.page.totalRows ?? 0

  if (!event) return null

  return (
    <section className="space-y-6">
      <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <p className="text-[10px] font-black tracking-[0.22em] text-muted-foreground uppercase">
                Event overview
              </p>
              <CardTitle className="text-3xl font-bold tracking-tight">
                {event.title}
              </CardTitle>
              <CardDescription className="max-w-2xl text-muted-foreground/80">
                Active grouping: <span className="font-semibold text-foreground">{groupingLabel(grouping)}</span>. Use the filters below to scan order status, then jump into manage orders or edit flows.
              </CardDescription>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild className="rounded-xl shadow-lg shadow-primary/20">
                <Link href={`/dashboard/manage-orders?eventId=${event._id}`}>
                  Manage orders
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-xl">
                <Link href={`/dashboard/events/${slug}/attendees`}>
                  Attendees
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-xl">
                <Link href={`/dashboard/events/${slug}/settings`}>
                  Edit event
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Order value",
            value: revenue ? formatMoney(revenue.totals.orderValueMinor) : "--",
            desc: "Canonical revenue in scope",
            icon: HandCoins,
          },
          {
            label: "Paid",
            value: revenue ? formatMoney(revenue.totals.paidMinor) : "--",
            desc: "Cash collected so far",
            icon: CreditCard,
          },
          {
            label: "Outstanding",
            value: reconciliation ? formatMoney(reconciliation.totals.outstandingMinor) : "--",
            desc: `${reconciliation?.totals.rows ?? 0} follow-up rows`,
            icon: CalendarRange,
          },
          {
            label: "Attendees",
            value: totalContactPeople.toLocaleString(),
            desc: `${totalOrders.toLocaleString()} orders in scope`,
            icon: Users,
          },
        ].map((card) => {
          const Icon = card.icon

          return (
            <Card key={card.label} className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
              <CardContent className="flex items-start justify-between gap-4 p-6">
                <div className="space-y-2">
                  <p className="text-[10px] font-black tracking-[0.22em] text-muted-foreground uppercase">
                    {card.label}
                  </p>
                  <p className="text-3xl font-bold tracking-tight text-foreground">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.desc}</p>
                </div>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
          <CardHeader>
            <CardTitle>Order status mix</CardTitle>
            <CardDescription>See the active event status split before drilling down.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading || !revenue ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                  <Skeleton className="h-2 rounded-full" />
                </div>
              ))
            ) : (
              ([
                ["Paid", revenue.statusCounts.paid, "bg-emerald-500"],
                ["Pending", revenue.statusCounts.pending, "bg-amber-400"],
                ["Refunded", revenue.statusCounts.refunded, "bg-slate-500"],
                ["Cancelled", revenue.statusCounts.cancelled, "bg-destructive"],
              ] as const).map(([label, value, colorClass]) => {
                const total = revenue.statusCounts.paid + revenue.statusCounts.pending + revenue.statusCounts.refunded + revenue.statusCounts.cancelled
                const width = total === 0 ? 0 : Math.max(6, Math.round((value / total) * 100))

                return (
                  <div key={label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-foreground">{label}</span>
                      <span className="tabular-nums text-muted-foreground">{value}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
                      <div className={cn("h-full rounded-full", colorClass)} style={{ width: `${width}%` }} />
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
          <CardHeader>
            <CardTitle>Quick routes</CardTitle>
            <CardDescription>Jump from this overview into the next operator task.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                href: `/dashboard/manage-orders?eventId=${event._id}`,
                title: "Manage orders",
                desc: "Work the canonical order ledger.",
              },
              {
                href: `/dashboard/events/${slug}/attendees`,
                title: "Attendees",
                desc: "Review names, emails, and follow-up.",
              },
              {
                href: `/dashboard/events/${slug}/settings`,
                title: "Edit event",
                desc: "Adjust the event configuration.",
              },
              {
                href: hasAccommodation ? `/dashboard/events/${slug}/accommodation` : `/dashboard/events/${slug}/settings`,
                title: hasAccommodation ? "Rooms" : "Enable rooms",
                desc: hasAccommodation ? "Room assignment and hotel links." : "Turn on accommodation first.",
              },
            ].map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="group flex items-start justify-between gap-4 rounded-2xl border border-border/50 bg-background/50 p-4 transition-all hover:border-primary/40 hover:bg-muted/30"
              >
                <div>
                  <h3 className="font-bold text-foreground group-hover:text-primary">{item.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20 xl:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Active grouping</CardTitle>
                <CardDescription>Default is order, with family and attendee views available.</CardDescription>
              </div>
              <Badge variant="outline">{groupingLabel(grouping)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {([
                ["order", "Order"],
                ["family", "Family"],
                ["attendee", "Attendees"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGrouping(value)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-semibold transition-all",
                    grouping === value
                      ? "border-primary bg-primary text-white shadow-sm"
                      : "border-border/50 bg-background/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-2xl" />
                ))}
              </div>
            ) : grouping === "order" ? (
              <div className="overflow-x-auto rounded-2xl border border-border/50 bg-background/50">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-border/40 bg-muted/30 text-left text-[10px] font-black tracking-[0.2em] text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-3">Order</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Ordered</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {orderRows.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={4}>
                          No orders found for this event window.
                        </td>
                      </tr>
                    ) : (
                      orderRows.map((row) => {
                        const amount = row.amountDueMinor ?? row.totalAmountMinor ?? 0
                        return (
                          <tr key={row.orderId} className="transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                            <td className="px-4 py-3">
                              <div className="font-medium text-foreground">
                                {row.buyerName ?? row.buyerEmail ?? "Unassigned attendee"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {row.buyerEmail ?? "No email"}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {statusLabel(row.normalizedStatus)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums text-foreground">
                              {formatMoney(amount)}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{formatDateTime(row.orderedAt)}</td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : grouping === "family" ? (
              <div className="grid gap-3">
                {familyGroups.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border/50 bg-background/50 p-6 text-sm text-muted-foreground">
                    No family groups available in the current window.
                  </p>
                ) : (
                  familyGroups.map((group) => (
                    <div key={group.label} className="rounded-2xl border border-border/50 bg-background/50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="font-bold text-foreground">{group.label}</h3>
                          <p className="text-xs text-muted-foreground">{group.contactEmail}</p>
                        </div>
                        <div className="flex gap-3 text-sm">
                          <div className="text-right">
                            <p className="text-[10px] font-black tracking-[0.2em] text-muted-foreground uppercase">Orders</p>
                            <p className="font-semibold text-foreground">{group.orderCount}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-black tracking-[0.2em] text-muted-foreground uppercase">Due</p>
                            <p className="font-semibold text-foreground">{formatMoney(group.dueMinor)}</p>
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        {group.paidCount} paid · {group.pendingCount} pending · last order {formatDateTime(group.latestOrderAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border/50 bg-background/50">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-border/40 bg-muted/30 text-left text-[10px] font-black tracking-[0.2em] text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-3">Attendee</th>
                      <th className="px-4 py-3">Room</th>
                      <th className="px-4 py-3">Event</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {attendeeRows.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={3}>
                          No attendees found for this event window.
                        </td>
                      </tr>
                    ) : (
                      attendeeRows.map((row) => (
                        <tr key={row.attendeeId} className="transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground">
                                {row.attendeeName ?? "Unnamed attendee"}
                            </div>
                            <div className="text-xs text-muted-foreground">{row.attendeeEmail ?? "No email"}</div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {row.roomStatus.status === "assigned"
                              ? `${row.roomStatus.roomLabel} · ${row.roomStatus.hotelName}`
                              : "Unassigned"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{row.eventTitle ?? "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/40 bg-white/40 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/20">
          <CardHeader>
            <CardTitle>Reconciliation follow-up</CardTitle>
            <CardDescription>Focus on the rows that still need operator attention.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading || !reconciliation ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)
            ) : issueRows.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border/50 bg-background/50 p-4 text-sm text-muted-foreground">
                No reconciliation issues in scope.
              </p>
            ) : (
              issueRows.slice(0, 4).map((issue) => (
                <div key={`${issue.orderId ?? issue.providerOrderId ?? issue.eventId}`} className="rounded-2xl border border-border/50 bg-background/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{issue.eventTitle ?? event.title}</p>
                      <p className="text-xs text-muted-foreground">{statusLabel(issue.normalizedStatus)}</p>
                    </div>
                    <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      {formatMoney(issue.outstandingMinor)}
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {issue.reasons.join(" · ")}
                  </p>
                </div>
              ))
            )}

            <Button asChild variant="outline" className="w-full rounded-xl">
              <Link href={`/dashboard/reconciliation?eventId=${event._id}`}>
                Review reconciliation
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
