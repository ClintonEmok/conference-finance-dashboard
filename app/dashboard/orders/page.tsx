"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
    providerEventId: string
    name: string | null
  }>
  page: {
    number: number
    size: number
    totalRows: number
    totalPages: number
  }
  rows: Array<{
    providerOrderId: string
    providerEventId: string
    eventName: string | null
    normalizedStatus: CanonicalOrderStatus
    totalAmountMinor: number
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

function formatMoney(minor: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

export default function OrdersPage() {
  const [eventIdInput, setEventIdInput] = useState("")
  const [statusInput, setStatusInput] = useState<"all" | CanonicalOrderStatus>(
    "all"
  )
  const [fromInput, setFromInput] = useState(() => {
    const today = new Date()
    const from = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)
    return toDateInputValue(from)
  })
  const [toInput, setToInput] = useState(() => toDateInputValue(new Date()))

  const [appliedEventId, setAppliedEventId] = useState("")
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

    if (!fromIso || !toIso) {
      return "Select valid from/to dates."
    }

    if (new Date(fromIso).getTime() > new Date(toIso).getTime()) {
      return "From date must be before or equal to To date."
    }

    return null
  }, [fromInput, toInput])

  useEffect(() => {
    const fromIso = toIsoBoundary(appliedFrom, "start")
    const toIso = toIsoBoundary(appliedTo, "end")

    if (!fromIso || !toIso) {
      setErrorMessage("Active filter dates are invalid.")
      setPayload(null)
      setIsLoading(false)
      return
    }

    const safeFromIso = fromIso
    const safeToIso = toIso
    const controller = new AbortController()

    async function loadOrders() {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const query = new URLSearchParams()
        query.set("from", safeFromIso)
        query.set("to", safeToIso)
        query.set("page", String(page))
        query.set("pageSize", "25")

        if (appliedEventId.trim()) {
          query.set("eventId", appliedEventId.trim())
        }

        if (appliedStatus !== "all") {
          query.set("status", appliedStatus)
        }

        const response = await fetch(
          `/api/dashboard/orders?${query.toString()}`,
          {
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { message?: string }
          } | null
          setPayload(null)
          setErrorMessage(
            body?.error?.message ??
              `Failed to load orders (${response.status}).`
          )
          return
        }

        const body = (await response.json()) as OrdersPayload
        setPayload(body)
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return
        }

        setPayload(null)
        setErrorMessage("Network error while loading order ledger.")
      } finally {
        setIsLoading(false)
      }
    }

    loadOrders()

    return () => {
      controller.abort()
    }
  }, [appliedEventId, appliedFrom, appliedStatus, appliedTo, page])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (dateValidationError) {
      setErrorMessage(dateValidationError)
      return
    }

    setAppliedEventId(eventIdInput)
    setAppliedStatus(statusInput)
    setAppliedFrom(fromInput)
    setAppliedTo(toInput)
    setPage(1)
  }

  function exportCsv() {
    const fromIso = toIsoBoundary(appliedFrom, "start")
    const toIso = toIsoBoundary(appliedTo, "end")

    if (!fromIso || !toIso) {
      setErrorMessage("Cannot export CSV because active dates are invalid.")
      return
    }

    const query = new URLSearchParams()
    query.set("from", fromIso)
    query.set("to", toIso)

    if (appliedEventId.trim()) {
      query.set("eventId", appliedEventId.trim())
    }

    if (appliedStatus !== "all") {
      query.set("status", appliedStatus)
    }

    window.location.assign(`/api/dashboard/orders/export?${query.toString()}`)
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Order drilldown</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Inspect filtered Ticket Tailor order rows and export the current
          scope.
        </p>
      </header>

      <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <form className="space-y-4" onSubmit={applyFilters}>
          <div className="grid gap-4 md:grid-cols-4">
            <label className="space-y-1">
              <span className="text-sm font-medium">Event ID</span>
              <select
                value={eventIdInput}
                onChange={(event) => setEventIdInput(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">All events</option>
                {(payload?.availableEvents ?? []).map((event) => (
                  <option
                    key={event.providerEventId}
                    value={event.providerEventId}
                  >
                    {event.name?.trim() || event.providerEventId}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">Status</span>
              <select
                value={statusInput}
                onChange={(event) =>
                  setStatusInput(
                    event.target.value as "all" | CanonicalOrderStatus
                  )
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="paid">Paid</option>
                <option value="refunded">Refunded</option>
                <option value="cancelled">Cancelled</option>
                <option value="pending">Pending</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">From</span>
              <input
                type="date"
                value={fromInput}
                onChange={(event) => setFromInput(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium">To</span>
              <input
                type="date"
                value={toInput}
                onChange={(event) => setToInput(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          {dateValidationError && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
              {dateValidationError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              disabled={Boolean(dateValidationError) || isLoading}
            >
              {isLoading ? "Loading…" : "Apply filters"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={exportCsv}
              disabled={isLoading}
            >
              Export CSV
            </Button>
          </div>
        </form>
      </article>

      {errorMessage && (
        <article className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {errorMessage}
        </article>
      )}

      {!errorMessage && isLoading && (
        <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="space-y-3">
            <Skeleton className="h-4 w-[200px]" />
            <div className="flex flex-col gap-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-[140px]" />
                  <Skeleton className="h-12 w-[100px]" />
                  <Skeleton className="h-12 w-[120px]" />
                  <Skeleton className="h-12 w-[80px]" />
                  <Skeleton className="h-12 w-[100px]" />
                  <Skeleton className="h-12 w-[120px]" />
                </div>
              ))}
            </div>
          </div>
        </article>
      )}

      {!errorMessage && !isLoading && payload && (
        <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Showing page {payload.page.number} of {payload.page.totalPages} (
              {payload.page.totalRows} rows)
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={payload.page.number <= 1 || isLoading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={
                  payload.page.number >= payload.page.totalPages || isLoading
                }
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>

          {payload.rows.length === 0 ? (
            <p className="rounded-md border border-border/70 p-3 text-sm text-muted-foreground">
              No orders found for the selected filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-medium text-muted-foreground">
                      Ordered
                    </TableHead>
                    <TableHead className="font-medium text-muted-foreground">
                      Order
                    </TableHead>
                    <TableHead className="font-medium text-muted-foreground">
                      Event
                    </TableHead>
                    <TableHead className="font-medium text-muted-foreground">
                      Status
                    </TableHead>
                    <TableHead className="font-medium text-muted-foreground">
                      Amount
                    </TableHead>
                    <TableHead className="font-medium text-muted-foreground">
                      Buyer
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payload.rows.map((row) => (
                    <TableRow key={row.providerOrderId}>
                      <TableCell className="font-mono text-xs">
                        {row.orderedAt
                          ? new Date(row.orderedAt).toLocaleString()
                          : "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.providerOrderId}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          {row.eventName ?? "Unknown event"}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {row.providerEventId}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.normalizedStatus === "cancelled"
                              ? "destructive"
                              : row.normalizedStatus === "refunded"
                                ? "outline"
                                : "secondary"
                          }
                        >
                          {row.normalizedStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatMoney(row.totalAmountMinor)}</TableCell>
                      <TableCell>
                        <div className="text-xs">{row.buyerName ?? "-"}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {row.buyerEmail ?? "-"}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </article>
      )}
    </section>
  )
}
