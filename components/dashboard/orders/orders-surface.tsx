"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react"
import { useQuery } from "convex/react"
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Calendar,
  ExternalLink,
  FileDown,
  Filter,
  Search,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api } from "@/lib/convex/api"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Id } from "@/convex/_generated/dataModel"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"

type CanonicalOrderStatus = "paid" | "refunded" | "cancelled" | "pending"

type OrdersPayload = {
  generatedAt: string
  filters: {
    eventId: string | null
    from: string | null
    to: string | null
    status: CanonicalOrderStatus | null
    location: string | null
    page: number
    pageSize: number
  }
  page: {
    number: number
    size: number
    totalRows: number
    totalPages: number
  }
  totals: {
    amountDueMinor: number
    matchedAmountMinor: number
    outstandingAmountMinor: number
  }
  rows: Array<{
    orderId: string
    eventId: string
    eventTitle: string | null
    normalizedStatus: CanonicalOrderStatus
    isArchived: boolean
    archivedAt: string | null
    archiveReason: string | null
    amountDueMinor: number | null
    matchedAmountMinor: number | null
    outstandingAmountMinor: number | null
    totalAmountMinor: number | null
    currency: string | null
    orderedAt: string | null
    buyerName: string | null
    buyerEmail: string | null
  }>
}

type PageProps = {
  slug: string
  event: EventDashboardEvent
}

function moneyDisplay(value: number | null) {
  return typeof value === "number" ? formatMoney(value) : "Unavailable"
}

function formatNlDateTime(value: string | null) {
  if (!value) return "-"

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return parsed.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function toIsoBoundary(value: string, boundary: "start" | "end") {
  if (!value.trim()) return null
  const suffix = boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z"
  const parsed = new Date(`${value}${suffix}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function OrderAttendeeRows({ orderId }: { orderId: string }) {
  const data = useQuery(api.orders.getOrderWithAttendees, {
    orderId: orderId as Id<"orders">,
  })

  if (data === undefined) {
    return (
      <TableRow className="border-border/10 bg-muted/10">
        <TableCell colSpan={7} className="px-6 py-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </TableCell>
      </TableRow>
    )
  }

  if (!data?.attendees.length) {
    return null
  }

  return (
    <TableRow className="border-border/10 bg-muted/20">
      <TableCell colSpan={7} className="px-6 py-4">
        <div className="space-y-2 rounded-xl border border-border/30 bg-background/70 p-3">
          <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
            Attendees
          </p>
          <div className="grid gap-2">
            {data.attendees.map((attendee) => (
              <div
                key={attendee.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {attendee.name}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {attendee.ticketTypeLabel}
                  </p>
                </div>
                <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                  {formatMoney(attendee.amountDueMinor)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function OrdersSurface({ slug, event }: PageProps) {
  const router = useRouter()
  const eventLocations = useQuery(
    api.reports.getEventLocations,
    event?._id ? { eventId: event._id } : ("skip" as const)
  ) as string[] | undefined

  const [searchInput, setSearchInput] = useState("")
  const [statusInput, setStatusInput] = useState<"all" | CanonicalOrderStatus>(
    "all"
  )
  const [locationInput, setLocationInput] = useState("all")
  const [fromInput, setFromInput] = useState("")
  const [toInput, setToInput] = useState("")

  const [appliedSearch, setAppliedSearch] = useState("")
  const [appliedStatus, setAppliedStatus] = useState<"all" | CanonicalOrderStatus>(
    "all"
  )
  const [appliedLocation, setAppliedLocation] = useState("all")
  const [appliedFrom, setAppliedFrom] = useState("")
  const [appliedTo, setAppliedTo] = useState("")
  const [page, setPage] = useState(1)
  const [payload, setPayload] = useState<OrdersPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)

  const dateValidationError = useMemo(() => {
    const fromIso = toIsoBoundary(fromInput, "start")
    const toIso = toIsoBoundary(toInput, "end")
    if (!fromIso || !toIso) return null
    if (new Date(fromIso).getTime() > new Date(toIso).getTime()) {
      return "From date must be before or equal to To date."
    }
    return null
  }, [fromInput, toInput])

  useEffect(() => {
    if (!event) return

    const fromIso = toIsoBoundary(appliedFrom, "start")
    const toIso = toIsoBoundary(appliedTo, "end")

    const controller = new AbortController()

    async function loadOrders() {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const query = new URLSearchParams()
        query.set("eventId", event._id)
        query.set("page", String(page))
        query.set("pageSize", "25")

        if (fromIso) query.set("from", fromIso)
        if (toIso) query.set("to", toIso)

        if (appliedStatus !== "all") query.set("status", appliedStatus)
        if (appliedLocation !== "all") query.set("location", appliedLocation)

        const response = await fetch(`/api/dashboard/orders?${query.toString()}`, {
          signal: controller.signal,
        })

        if (!response.ok) throw new Error("Failed to load orders")

        const body = (await response.json()) as OrdersPayload
        setPayload(body)
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return
        setErrorMessage("Network error while loading orders.")
      } finally {
        setIsLoading(false)
      }
    }

    loadOrders()
    return () => controller.abort()
  }, [appliedFrom, appliedLocation, appliedStatus, appliedTo, event, loadAttempt, page])

  const visibleRows = useMemo(() => {
    const rows = payload?.rows ?? []
    const search = appliedSearch.trim().toLowerCase()

    if (!search) return rows

    return rows.filter((row) => {
      const haystack = [row.orderId, row.buyerName, row.buyerEmail, row.eventTitle]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(search)
    })
  }, [appliedSearch, payload?.rows])

  const displayTotalRows = visibleRows.length === 0 ? 0 : payload?.page.totalRows ?? 0
  const showPagination = Boolean(
    payload && visibleRows.length > 0 && payload.page.totalPages > 1
  )

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (dateValidationError) return
    setAppliedSearch(searchInput)
    setAppliedStatus(statusInput)
    setAppliedLocation(locationInput)
    setAppliedFrom(fromInput)
    setAppliedTo(toInput)
    setPage(1)
  }

  function exportCsv() {
    if (!event) return
    const fromIso = toIsoBoundary(appliedFrom, "start")
    const toIso = toIsoBoundary(appliedTo, "end")

    const query = new URLSearchParams()
    query.set("eventId", event._id)
    if (fromIso) query.set("from", fromIso)
    if (toIso) query.set("to", toIso)
    if (appliedStatus !== "all") query.set("status", appliedStatus)
    if (appliedLocation !== "all") query.set("location", appliedLocation)
    window.location.assign(`/api/dashboard/orders/export?${query.toString()}`)
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Orders</p>
          <p className="text-xs text-muted-foreground">{event.title} · {event.slug}</p>
        </div>
        <Button variant="outline" onClick={exportCsv} className="h-9 rounded-lg px-4">
          <FileDown className="mr-2 size-4 text-primary" />
          Export CSV
        </Button>
      </div>

      <article className="min-w-0 rounded-xl border border-border/50 bg-card/40 p-4 md:p-6">
        <form className="flex min-w-0 flex-col items-stretch gap-4 md:flex-row md:flex-wrap md:items-end" onSubmit={applyFilters}>
          <div className="min-w-0 flex-1 space-y-1.5">
            <label className="ml-1 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              <Search className="size-3" /> Search
            </label>
            <input
              aria-label="Search orders"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-11 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm"
              placeholder="Order id, contact person, email, event"
            />
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <label className="ml-1 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              <Filter className="size-3" /> Status
            </label>
            <select
              aria-label="Filter by status"
              value={statusInput}
              onChange={(e) => setStatusInput(e.target.value as any)}
              className="h-11 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="paid">Paid</option>
              <option value="refunded">Refunded</option>
              <option value="cancelled">Cancelled</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <label className="ml-1 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              <Filter className="size-3" /> Location
            </label>
            <select
              aria-label="Filter by location"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              className="h-11 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm"
            >
              <option value="all">All locations</option>
              {(eventLocations ?? []).map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <label className="ml-1 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              <Calendar className="size-3" /> Date range
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                aria-label="From date"
                type="date"
                value={fromInput}
                onChange={(e) => setFromInput(e.target.value)}
                className="h-11 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm"
              />
              <input
                aria-label="To date"
                type="date"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                className="h-11 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm"
              />
            </div>
          </div>

          <Button type="submit" disabled={isLoading} className="h-11 rounded-2xl px-8">
            Apply Filters
          </Button>
        </form>
        {dateValidationError && (
          <p className="mt-3 px-1 text-[11px] font-bold text-destructive">
            {dateValidationError}
          </p>
        )}
      </article>

      {errorMessage && (
        <article className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-destructive">{errorMessage}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPage(1)
                setIsLoading(true)
                setErrorMessage(null)
                setLoadAttempt((attempt) => attempt + 1)
              }}
              className="rounded-xl h-8 px-3 text-xs"
            >
              Retry
            </Button>
          </div>
        </article>
      )}

      <article className="min-w-0 overflow-hidden rounded-xl border border-border/50 bg-card/40">
          <Table>
            <TableCaption>Orders</TableCaption>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="px-6 py-4 text-[10px] font-bold tracking-wider uppercase">Order</TableHead>
                <TableHead className="px-6 py-4 text-[10px] font-bold tracking-wider uppercase">Contact person</TableHead>
                <TableHead className="px-6 py-4 text-[10px] font-bold tracking-wider uppercase">Amount Due</TableHead>
                <TableHead className="px-6 py-4 text-[10px] font-bold tracking-wider uppercase">Amount Paid</TableHead>
                <TableHead className="px-6 py-4 text-[10px] font-bold tracking-wider uppercase">Amount Left</TableHead>
                <TableHead className="px-6 py-4 text-[10px] font-bold tracking-wider uppercase">Status</TableHead>
                <TableHead className="px-6 py-4" />
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border/20">
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="px-6 py-12">
                    <DashboardQueryState state="loading" message="Loading orders." className="text-center" />
                  </TableCell>
                </TableRow>
              ) : errorMessage ? (
                <TableRow>
                  <TableCell colSpan={7} className="px-6 py-12">
                    <DashboardQueryState state="error" message={errorMessage} onRetry={() => setLoadAttempt((attempt) => attempt + 1)} className="text-center" />
                  </TableCell>
                </TableRow>
              ) : payload === null ? (
                <TableRow>
                  <TableCell colSpan={7} className="px-6 py-12">
                    <DashboardQueryState state="unavailable" message="Orders are not available yet." className="text-center" />
                  </TableCell>
                </TableRow>
              ) : visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="px-6 py-12">
                    <DashboardQueryState state="empty" message="No records match these filters." className="text-center" />
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((row) => (
                  <Fragment key={row.orderId}>
                    <TableRow
                      onClick={() => {
                        router.push(`/dashboard/events/${slug}/orders/${row.orderId}`)
                      }}
                      className="cursor-pointer transition-colors hover:bg-muted/30"
                    >
                      <TableCell className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/events/${slug}/orders/${row.orderId}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="font-mono text-[10px] font-bold text-primary/70 underline-offset-2 hover:underline"
                          >
                            {row.orderId}
                          </Link>
                          <ExternalLink className="size-3 text-muted-foreground/60" aria-hidden="true" />
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{formatNlDateTime(row.orderedAt)}</div>
                      </TableCell>
                      <TableCell className="px-6 py-5">
                        <div className="font-bold text-foreground">{row.buyerName || "Anonymous"}</div>
                        <div className="text-[11px] text-muted-foreground/60">{row.buyerEmail}</div>
                      </TableCell>
<TableCell className="px-6 py-5 font-bold tabular-nums text-foreground">{moneyDisplay(row.amountDueMinor)}</TableCell>
<TableCell className="px-6 py-5 font-bold tabular-nums text-emerald-600">{moneyDisplay(row.matchedAmountMinor)}</TableCell>
<TableCell className="px-6 py-5 font-bold tabular-nums text-rose-600">{moneyDisplay(row.outstandingAmountMinor)}</TableCell>
                      <TableCell className="px-6 py-5">
                          <Badge
                           aria-label={`Order status: ${row.normalizedStatus}`}
                          variant={row.normalizedStatus === "paid" ? "secondary" : row.normalizedStatus === "cancelled" ? "destructive" : "outline"}
                          className={cn(
                            "h-6 rounded-lg px-2 text-[10px] font-bold tracking-wider uppercase",
                            row.normalizedStatus === "paid" && "border-none bg-emerald-500/10 text-emerald-600",
                            row.normalizedStatus === "pending" && "border-none bg-orange-500/10 text-orange-600"
                          )}
                        >
                          {row.normalizedStatus}
                        </Badge>
                        {row.isArchived && (
                          <div className="mt-1 flex items-center gap-1 text-[9px] font-bold text-muted-foreground/50 uppercase">
                            <Archive className="size-2.5" aria-hidden="true" /> Archived
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-6 py-5 text-right">
                         <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
                      </TableCell>
                    </TableRow>
                    <OrderAttendeeRows orderId={row.orderId} />
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>

        {payload && visibleRows.length > 0 && (
          <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border/30 bg-muted/20 px-4 py-5 md:px-8">
            <p className="text-xs font-medium text-muted-foreground">
              Showing <span className="text-foreground">{visibleRows.length}</span> of <span className="text-foreground">{displayTotalRows}</span> entries
            </p>
            {showPagination ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={payload.page.number <= 1} onClick={() => setPage((value) => value - 1)} className="h-9 rounded-xl px-4">
                  <ChevronLeft className="mr-2 size-4" /> Previous
                </Button>
                <div className="px-4 text-xs font-bold tracking-widest text-muted-foreground/60 uppercase">
                  {payload.page.number} / {payload.page.totalPages}
                </div>
                <Button variant="outline" size="sm" disabled={payload.page.number >= payload.page.totalPages} onClick={() => setPage((value) => value + 1)} className="h-9 rounded-xl px-4">
                  Next <ChevronRight className="ml-2 size-4" />
                </Button>
              </div>
            ) : null}
          </footer>
        )}
      </article>
    </div>
  )
}
