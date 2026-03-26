"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
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
import { Skeleton } from "@/components/ui/skeleton"

type GenderType = "MALE" | "FEMALE" | "MIXED" | "UNKNOWN"

type AttendeesPayload = {
  generatedAt: string
  filters: {
    eventId: string | null
    from: string
    to: string
    search: string | null
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
    attendeeId: string
    providerAttendeeId: string | null
    providerIssuedTicketId: string | null
    providerOrderId: string
    providerEventId: string
    eventName: string | null
    attendeeName: string | null
    attendeeEmail: string | null
    genderType: GenderType | null
    ticketTypeLabel: string | null
    normalizedStatus: "paid" | "refunded" | "cancelled" | "pending"
    totalAmountMinor: number
    outstandingAmountMinor: number
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
    orderedAt: string | null
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

function formatGenderLabel(value: GenderType | null) {
  if (value === "MALE") return "Male"
  if (value === "FEMALE") return "Female"
  if (value === "MIXED") return "Mixed"
  if (value === "UNKNOWN") return "Unknown"
  return "Not set"
}

export default function AttendeesPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [eventIdInput, setEventIdInput] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [fromInput, setFromInput] = useState(() => {
    const today = new Date()
    const from = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)
    return toDateInputValue(from)
  })
  const [toInput, setToInput] = useState(() => toDateInputValue(new Date()))

  const [appliedEventId, setAppliedEventId] = useState("")
  const [appliedSearch, setAppliedSearch] = useState("")
  const [appliedFrom, setAppliedFrom] = useState(fromInput)
  const [appliedTo, setAppliedTo] = useState(toInput)
  const [page, setPage] = useState(1)

  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [payload, setPayload] = useState<AttendeesPayload | null>(null)

  const source = searchParams.get("source")
  const focusedOrderId = searchParams.get("orderId")

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
    const nextEventId = searchParams.get("eventId") ?? ""
    const nextSearch = searchParams.get("search") ?? ""

    setEventIdInput(nextEventId)
    setSearchInput(nextSearch)
    setAppliedEventId(nextEventId)
    setAppliedSearch(nextSearch)
    setPage(1)
  }, [searchParams])

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

    async function loadAttendees() {
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

        if (appliedSearch.trim()) {
          query.set("search", appliedSearch.trim())
        }

        const response = await fetch(
          `/api/dashboard/attendees?${query.toString()}`,
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
              `Failed to load attendees (${response.status}).`
          )
          return
        }

        const body = (await response.json()) as AttendeesPayload
        setPayload(body)
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return
        }

        setPayload(null)
        setErrorMessage("Network error while loading attendee ledger.")
      } finally {
        setIsLoading(false)
      }
    }

    loadAttendees()

    return () => {
      controller.abort()
    }
  }, [appliedEventId, appliedFrom, appliedSearch, appliedTo, page])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (dateValidationError) {
      setErrorMessage(dateValidationError)
      return
    }

    setAppliedEventId(eventIdInput)
    setAppliedSearch(searchInput)
    setAppliedFrom(fromInput)
    setAppliedTo(toInput)
    setPage(1)
  }

  function renderRoomStatus(
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
  ) {
    if (roomStatus.status === "assigned") {
      return (
        <div>
          <div className="text-xs font-medium">{roomStatus.roomLabel}</div>
          <div className="text-[11px] text-muted-foreground">
            {roomStatus.hotelName} · {roomStatus.roomTypeLabel}
          </div>
        </div>
      )
    }

    return <span className="text-xs text-muted-foreground">Unassigned</span>
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Attendees</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review real attendee rows synced from Ticket Tailor with order finance
          context and room status.
        </p>
      </header>

      {(source === "outstanding-balances" ||
        source === "reconciliation" ||
        focusedOrderId) && (
        <article className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-100">
          {focusedOrderId
            ? `Showing attendee follow-up for order ${focusedOrderId}. Open the relevant attendee detail to continue into room assignment if needed.`
            : "Showing attendee follow-up from reconciliation."}
        </article>
      )}

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
              <span className="text-sm font-medium">Search</span>
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Name, email, ticket, or order"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
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
                  <Skeleton className="h-12 w-[150px]" />
                  <Skeleton className="h-12 w-[100px]" />
                  <Skeleton className="h-12 w-[120px]" />
                  <Skeleton className="h-12 w-[80px]" />
                  <Skeleton className="h-12 w-[100px]" />
                  <Skeleton className="h-12 w-[100px]" />
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
              No attendees found for the selected filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-medium text-muted-foreground">
                      Attendee
                    </TableHead>
                    <TableHead className="font-medium text-muted-foreground">
                      Gender
                    </TableHead>
                    <TableHead className="font-medium text-muted-foreground">
                      Order
                    </TableHead>
                    <TableHead className="font-medium text-muted-foreground">
                      Room
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payload.rows.map((row) => (
                    <TableRow
                      key={row.attendeeId}
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                      onClick={() => {
                        const params = new URLSearchParams()
                        params.set(
                          "search",
                          appliedSearch || row.providerOrderId
                        )
                        params.set(
                          "eventId",
                          appliedEventId || row.providerEventId
                        )
                        params.set("source", source ?? "attendee-ledger")
                        router.push(
                          `/dashboard/attendees/${row.attendeeId}?${params.toString()}`
                        )
                      }}
                    >
                      <TableCell>
                        <div className="text-xs font-medium">
                          {row.attendeeName ?? "Unnamed attendee"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {row.attendeeEmail ?? "-"}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {row.providerIssuedTicketId ??
                            row.providerAttendeeId ??
                            row.attendeeId}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {formatGenderLabel(row.genderType)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-xs">
                          {row.providerOrderId}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {row.eventName ?? row.providerEventId}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {row.orderedAt
                            ? new Date(row.orderedAt).toLocaleString()
                            : "Order date unavailable"}
                        </div>
                      </TableCell>
                      <TableCell>{renderRoomStatus(row.roomStatus)}</TableCell>
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
