"use client"

import Link from "next/link"
import { Fragment, use, useEffect, useMemo, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Calendar,
  FileDown,
  Filter,
  Search,
  ShoppingBag,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api } from "@/lib/convex/api"
import { useEventBySlug } from "@/lib/convex/hooks/events"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Id } from "@/convex/_generated/dataModel"

type CanonicalOrderStatus = "paid" | "refunded" | "cancelled" | "pending"

type OrdersPayload = {
  generatedAt: string
  filters: {
    eventId: string | null
    from: string
    to: string
    status: CanonicalOrderStatus | null
    page: number
    pageSize: number
  }
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
  params: Promise<{ slug: string }>
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10)
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

export default function EventOrdersPage({ params }: PageProps) {
  const { slug } = use(params)
  const router = useRouter()
  const event = useEventBySlug(slug)

  const [searchInput, setSearchInput] = useState("")
  const [statusInput, setStatusInput] = useState<"all" | CanonicalOrderStatus>(
    "all"
  )
  const [fromInput, setFromInput] = useState(() => {
    const today = new Date()
    return toDateInputValue(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000))
  })
  const [toInput, setToInput] = useState(() => toDateInputValue(new Date()))

  const [appliedSearch, setAppliedSearch] = useState("")
  const [appliedStatus, setAppliedStatus] = useState<"all" | CanonicalOrderStatus>(
    "all"
  )
  const [appliedFrom, setAppliedFrom] = useState(fromInput)
  const [appliedTo, setAppliedTo] = useState(toInput)
  const [page, setPage] = useState(1)
  const [payload, setPayload] = useState<OrdersPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const dateValidationError = useMemo(() => {
    const fromIso = toIsoBoundary(fromInput, "start")
    const toIso = toIsoBoundary(toInput, "end")
    if (!fromIso || !toIso) return "Select valid from/to dates."
    if (new Date(fromIso).getTime() > new Date(toIso).getTime()) {
      return "From date must be before or equal to To date."
    }
    return null
  }, [fromInput, toInput])

  useEffect(() => {
    if (!event) return

    const fromIso = toIsoBoundary(appliedFrom, "start")
    const toIso = toIsoBoundary(appliedTo, "end")
    if (!fromIso || !toIso) return
    const safeFromIso = fromIso
    const safeToIso = toIso

    const controller = new AbortController()

    async function loadOrders() {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const query = new URLSearchParams()
        query.set("eventId", event._id)
        query.set("from", safeFromIso)
        query.set("to", safeToIso)
        query.set("page", String(page))
        query.set("pageSize", "25")

        if (appliedStatus !== "all") query.set("status", appliedStatus)

        const response = await fetch(`/api/dashboard/orders?${query.toString()}`, {
          signal: controller.signal,
        })

        if (!response.ok) throw new Error("Failed to load orders")

        const body = (await response.json()) as OrdersPayload
        setPayload(body)
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return
        setErrorMessage("Network error while loading order ledger.")
      } finally {
        setIsLoading(false)
      }
    }

    loadOrders()
    return () => controller.abort()
  }, [appliedFrom, appliedStatus, appliedTo, event, page])

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

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (dateValidationError) return
    setAppliedSearch(searchInput)
    setAppliedStatus(statusInput)
    setAppliedFrom(fromInput)
    setAppliedTo(toInput)
    setPage(1)
  }

  function exportCsv() {
    if (!event) return
    const fromIso = toIsoBoundary(appliedFrom, "start")
    const toIso = toIsoBoundary(appliedTo, "end")
    if (!fromIso || !toIso) return
    const safeFromIso = fromIso
    const safeToIso = toIso

    const query = new URLSearchParams()
    query.set("eventId", event._id)
    query.set("from", safeFromIso)
    query.set("to", safeToIso)
    if (appliedStatus !== "all") query.set("status", appliedStatus)
    window.location.assign(`/api/dashboard/orders/export?${query.toString()}`)
  }

  if (event === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    )
  }

  if (event === null) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/40 p-10 text-center">
        <h1 className="text-2xl font-bold">Event not found</h1>
        <p className="mt-2 text-muted-foreground">The slug “{slug}” does not exist.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Orders
            </h1>
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {event.slug}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            {event.title} · canonical event-scoped ledger
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={exportCsv}
            className="h-11 rounded-2xl px-5 shadow-sm"
          >
            <FileDown className="mr-2 size-4 text-primary" />
            Export CSV
          </Button>
        </div>
      </header>

      {payload && (
        <div className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-xl border border-border/50 bg-card/40 p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShoppingBag className="size-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Amount Due
                </p>
                <p className="mt-0.5 text-xl font-bold">
                  {formatMoney(payload.rows.reduce((sum, row) => sum + (row.amountDueMinor ?? 0), 0))}
                </p>
              </div>
            </div>
          </article>
          <article className="rounded-xl border border-border/50 bg-card/40 p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                <Calendar className="size-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Amount Paid
                </p>
                <p className="mt-0.5 text-xl font-bold text-emerald-600">
                  {formatMoney(payload.rows.reduce((sum, row) => sum + (row.matchedAmountMinor ?? 0), 0))}
                </p>
              </div>
            </div>
          </article>
          <article className="rounded-xl border border-border/50 bg-card/40 p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600">
                <ShoppingBag className="size-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Amount Left
                </p>
                <p className="mt-0.5 text-xl font-bold text-rose-600">
                  {formatMoney(payload.rows.reduce((sum, row) => sum + (row.outstandingAmountMinor ?? 0), 0))}
                </p>
              </div>
            </div>
          </article>
        </div>
      )}

      <article className="rounded-xl border border-border/50 bg-card/40 p-6">
        <form className="flex flex-wrap items-end gap-4" onSubmit={applyFilters}>
          <div className="min-w-[220px] flex-1 space-y-1.5">
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

          <div className="min-w-[150px] flex-1 space-y-1.5">
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

          <div className="min-w-[280px] flex-1 space-y-1.5">
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
              }}
              className="rounded-xl h-8 px-3 text-xs"
            >
              Retry
            </Button>
          </div>
        </article>
      )}

      <article className="overflow-hidden rounded-xl border border-border/50 bg-card/40">
        <div className="overflow-x-auto">
          <Table>
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
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-6 py-5" colSpan={7}>
                      <Skeleton className="h-8 w-full rounded-xl" />
                    </TableCell>
                  </TableRow>
                ))
              ) : visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    No records match these filters
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((row) => (
                  <Fragment key={row.orderId}>
                    <TableRow
                      onClick={() => router.push(`/dashboard/events/${slug}/orders/${row.orderId}`)}
                      className="cursor-pointer transition-colors hover:bg-muted/30"
                    >
                      <TableCell className="px-6 py-5">
                        <div className="font-mono text-[10px] font-bold text-primary/70">{row.orderId}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {row.orderedAt ? new Date(row.orderedAt).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }) : "-"}
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-5">
                        <div className="font-bold text-foreground">{row.buyerName || "Anonymous"}</div>
                        <div className="text-[11px] text-muted-foreground/60">{row.buyerEmail}</div>
                      </TableCell>
<TableCell className="px-6 py-5 font-bold tabular-nums text-foreground">{typeof row.amountDueMinor === "number" ? formatMoney(row.amountDueMinor) : formatMoney(0)}</TableCell>
<TableCell className="px-6 py-5 font-bold tabular-nums text-emerald-600">{typeof row.matchedAmountMinor === "number" ? formatMoney(row.matchedAmountMinor) : formatMoney(0)}</TableCell>
<TableCell className="px-6 py-5 font-bold tabular-nums text-rose-600">{typeof row.outstandingAmountMinor === "number" ? formatMoney(row.outstandingAmountMinor) : formatMoney(0)}</TableCell>
                      <TableCell className="px-6 py-5">
                        <Badge
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
                            <Archive className="size-2.5" /> Archived
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-6 py-5 text-right">
                        <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                    <OrderAttendeeRows orderId={row.orderId} />
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {payload && payload.page.totalPages > 1 && (
          <footer className="flex items-center justify-between border-t border-border/30 bg-muted/20 px-8 py-5">
            <p className="text-xs font-medium text-muted-foreground">
              Showing <span className="text-foreground">{visibleRows.length}</span> of <span className="text-foreground">{payload.page.totalRows}</span> entries
            </p>
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
          </footer>
        )}
      </article>
    </div>
  )
}
