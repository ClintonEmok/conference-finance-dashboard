"use client"

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  FileDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  Calendar,
  Layers,
  ShoppingBag,
  ExternalLink,
  Archive,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

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
  availableEvents: Array<{
    eventId: string
    title: string | null
  }>
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
    totalAmountMinor: number | null
    currency: string | null
    orderedAt: string | null
    buyerName: string | null
    buyerEmail: string | null
  }>
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

import { formatMoney } from "@/lib/format"

export default function OrdersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialEventId = searchParams.get("eventId") ?? ""
  const [eventIdInput, setEventIdInput] = useState(initialEventId)
  const [statusInput, setStatusInput] = useState<"all" | CanonicalOrderStatus>(
    "all"
  )
  const [fromInput, setFromInput] = useState(() => {
    const today = new Date()
    return toDateInputValue(
      new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)
    )
  })
  const [toInput, setToInput] = useState(() => toDateInputValue(new Date()))

  const [appliedEventId, setAppliedEventId] = useState(initialEventId)
  const [appliedStatus, setAppliedStatus] = useState<
    "all" | CanonicalOrderStatus
  >("all")
  const [appliedFrom, setAppliedFrom] = useState(fromInput)
  const [appliedTo, setAppliedTo] = useState(toInput)
  const [page, setPage] = useState(1)

  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [payload, setPayload] = useState<OrdersPayload | null>(null)

  const dateValidationError = useMemo(() => {
    const fromIso = toIsoBoundary(fromInput, "start")
    const toIso = toIsoBoundary(toInput, "end")
    if (!fromIso || !toIso) return "Select valid from/to dates."
    if (new Date(fromIso).getTime() > new Date(toIso).getTime())
      return "From date must be before or equal to To date."
    return null
  }, [fromInput, toInput])

  useEffect(() => {
    const fromIso = toIsoBoundary(appliedFrom, "start")
    const toIso = toIsoBoundary(appliedTo, "end")
    if (!fromIso || !toIso) return

    const controller = new AbortController()
    async function loadOrders() {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        const query = new URLSearchParams({
          from: fromIso!,
          to: toIso!,
          page: String(page),
          pageSize: "25",
        })
        if (appliedEventId.trim()) query.set("eventId", appliedEventId.trim())
        if (appliedStatus !== "all") query.set("status", appliedStatus)

        const response = await fetch(
          `/api/dashboard/orders?${query.toString()}`,
          { signal: controller.signal }
        )
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
  }, [appliedEventId, appliedFrom, appliedStatus, appliedTo, page])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (dateValidationError) return
    setAppliedEventId(eventIdInput)
    setAppliedStatus(statusInput)
    setAppliedFrom(fromInput)
    setAppliedTo(toInput)
    setPage(1)
  }

  function exportCsv() {
    const fromIso = toIsoBoundary(appliedFrom, "start")
    const toIso = toIsoBoundary(appliedTo, "end")
    if (!fromIso || !toIso) return
    const query = new URLSearchParams({ from: fromIso, to: toIso })
    if (appliedEventId.trim()) query.set("eventId", appliedEventId.trim())
    if (appliedStatus !== "all") query.set("status", appliedStatus)
    window.location.assign(`/api/dashboard/orders/export?${query.toString()}`)
  }

  return (
    <div className="animate-in space-y-8 duration-700 fade-in">
      <header className="flex flex-col gap-4 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
            Manage Orders
            {payload && (
              <Badge
                variant="outline"
                className="ml-2 flex h-5 items-center font-mono text-[10px] tracking-wider uppercase"
              >
                {payload.page.totalRows} Total
              </Badge>
            )}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Primary operator view for the canonical order ledger.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={exportCsv}
            className="h-11 rounded-2xl px-5 shadow-sm transition-all active:scale-95"
          >
            <FileDown className="mr-2 size-4 text-primary" />
            Export CSV
          </Button>
        </div>
      </header>

      {/* Quick Summary / Status Stats at Top */}
      {payload && (
        <div className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-xl border border-border/50 bg-card/40 p-6 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShoppingBag className="size-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Amount Due
                </p>
                <p className="mt-0.5 text-xl font-bold">
                  {formatMoney(
                    payload.rows.reduce(
                      (acc, r) => acc + (r.amountDueMinor ?? 0),
                      0
                    )
                  )}
                </p>
                <p className="mt-0.5 text-[9px] font-medium text-muted-foreground/60 italic">
                  Current page due total
                </p>
              </div>
            </div>
          </article>
          <article className="rounded-xl border border-border/50 bg-card/40 p-6 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                <ExternalLink className="size-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Settled Rate
                </p>
                <p className="mt-0.5 text-xl font-bold">
                  {Math.round(
                    (payload.rows.filter((r) => r.normalizedStatus === "paid")
                      .length /
                      payload.rows.length) *
                    100 || 0
                  )}
                  %
                </p>
                <p className="mt-0.5 text-[9px] font-medium text-muted-foreground/60 italic">
                  Paid vs Total (Page)
                </p>
              </div>
            </div>
          </article>
          <article className="flex items-center overflow-hidden rounded-lg border border-border/50 bg-card/40 p-6 backdrop-blur-xl">
            <div className="p-2 text-[11px] leading-tight font-medium text-muted-foreground/40 italic">
              Detailed charts and forecasting available in the Financial
              Overview.
            </div>
          </article>
        </div>
      )}

      {/* Filter Bar */}
      <article className="rounded-xl border border-border/50 bg-card/40 p-6 backdrop-blur-xl">
        <form
          className="flex flex-wrap items-end gap-4"
          onSubmit={applyFilters}
        >
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <label className="ml-1 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              <Layers className="size-3" /> Event context
            </label>
            <select
              value={eventIdInput}
              onChange={(e) => setEventIdInput(e.target.value)}
              className="h-11 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm transition-all focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All Events</option>
              {payload?.availableEvents.map((e) => (
                <option key={e.eventId} value={e.eventId}>
                  {e.title?.trim() || e.eventId}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[150px] flex-1 space-y-1.5">
            <label className="ml-1 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              <Filter className="size-3" /> Status
            </label>
            <select
              value={statusInput}
              onChange={(e) => setStatusInput(e.target.value as any)}
              className="h-11 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm transition-all focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All Statuses</option>
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
                type="date"
                value={fromInput}
                onChange={(e) => setFromInput(e.target.value)}
                className="h-11 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm transition-all focus:ring-2 focus:ring-primary/20"
              />
              <input
                type="date"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                className="h-11 w-full rounded-lg border border-border/40 bg-background/50 px-4 text-sm transition-all focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="h-11 rounded-2xl bg-primary px-8 text-white shadow-lg shadow-primary/20 transition-all active:scale-95"
          >
            <Search className="mr-2 size-4" />
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
        <article className="animate-in rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-bold text-destructive slide-in-from-top-2">
          {errorMessage}
        </article>
      )}

      {/* Main Content Area */}
      <article className="overflow-hidden rounded-xl border border-border/50 bg-card/40 shadow-sm backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-border/30 bg-muted/50">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold tracking-wider text-muted-foreground/70 uppercase">
                  Order ID / Date
                </th>
                <th className="px-6 py-4 text-[10px] font-bold tracking-wider text-muted-foreground/70 uppercase">
                  Buyer
                </th>
                <th className="px-6 py-4 text-[10px] font-bold tracking-wider text-muted-foreground/70 uppercase">
                  Event
                </th>
                <th className="px-6 py-4 text-right text-[10px] font-bold tracking-wider text-muted-foreground/70 uppercase">
                  Amount
                </th>
                <th className="px-6 py-4 text-center text-[10px] font-bold tracking-wider text-muted-foreground/70 uppercase">
                  Status
                </th>
                <th className="w-10 px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/10">
                    <td className="px-6 py-5">
                      <div className="space-y-2">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <Skeleton className="h-4 w-28" />
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex justify-end">
                        <Skeleton className="h-4 w-16" />
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col items-center gap-1.5">
                        <Skeleton className="h-6 w-16 rounded-lg" />
                        <Skeleton className="h-2 w-10" />
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <Skeleton className="ml-auto size-8 rounded-full" />
                    </td>
                  </tr>
                ))
              ) : payload?.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center font-medium text-muted-foreground italic"
                  >
                    No orders found matching the criteria.
                  </td>
                </tr>
              ) : (
                payload?.rows.map((row) =>
                  (() => {
                    const displayOrderId = row.orderId?.trim() || "—"
                    const displayAmount =
                      typeof row.amountDueMinor === "number"
                        ? formatMoney(row.amountDueMinor)
                        : "Missing amount"

                    return (
                      <tr
                        key={`${row.orderId}-${row.eventId}-${row.orderedAt ?? "na"}`}
                        onClick={() => {
                          if (!row.orderId) {
                            return
                          }
                          router.push(
                            `/dashboard/manage-orders/${row.orderId}?eventId=${row.eventId}`
                          )
                        }}
                        className="group cursor-pointer transition-colors hover:bg-muted/30"
                      >
                        <td className="px-6 py-5">
                          <div className="font-mono text-[10px] font-bold text-primary/70">
                            {displayOrderId}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.orderedAt
                              ? new Date(row.orderedAt).toLocaleString(
                                "en-GB",
                                {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )
                              : "-"}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="font-bold text-foreground">
                            {row.buyerName || "Anonymous"}
                          </div>
                          <div className="text-[11px] text-muted-foreground/60">
                            {row.buyerEmail}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-xs font-semibold">
                            {row.eventTitle ?? "Unknown event"}
                          </div>
                        </td>
                        <td className="px-6 py-5 text-right font-bold tabular-nums">
                          {displayAmount}
                        </td>
                        <td className="px-6 py-5 text-center">
                          <div className="flex flex-col items-center gap-1.5">
                            <Badge
                              variant={
                                row.normalizedStatus === "paid"
                                  ? "secondary"
                                  : row.normalizedStatus === "cancelled"
                                    ? "destructive"
                                    : "outline"
                              }
                              className={cn(
                                "h-6 rounded-lg px-2 text-[10px] font-bold tracking-wider uppercase",
                                row.normalizedStatus === "paid" &&
                                "border-none bg-emerald-500/10 text-emerald-600",
                                row.normalizedStatus === "pending" &&
                                "border-none bg-orange-500/10 text-orange-600"
                              )}
                            >
                              {row.normalizedStatus}
                            </Badge>
                            {row.isArchived && (
                              <div className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground/50 uppercase">
                                <Archive className="size-2.5" /> Archived
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex size-8 items-center justify-center rounded-full bg-muted/40 text-muted-foreground/40 transition-all group-hover:bg-primary/10 group-hover:text-primary">
                            <ChevronRight className="size-4" />
                          </div>
                        </td>
                      </tr>
                    )
                  })()
                )
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {payload && payload.page.totalPages > 1 && (
          <footer className="flex items-center justify-between border-t border-border/30 bg-muted/20 px-8 py-5">
            <p className="text-xs font-medium text-muted-foreground">
              Showing{" "}
              <span className="text-foreground">{payload.rows.length}</span> of{" "}
              <span className="text-foreground">{payload.page.totalRows}</span>{" "}
              entries
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={payload.page.number <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="h-9 rounded-xl px-4 transition-all active:scale-95"
              >
                <ChevronLeft className="mr-2 size-4" />
                Previous
              </Button>
              <div className="px-4 text-xs font-bold tracking-widest text-muted-foreground/60 uppercase">
                {payload.page.number} / {payload.page.totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={payload.page.number >= payload.page.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-9 rounded-xl px-4 transition-all active:scale-95"
              >
                Next
                <ChevronRight className="ml-2 size-4" />
              </Button>
            </div>
          </footer>
        )}
      </article>
    </div>
  )
}
