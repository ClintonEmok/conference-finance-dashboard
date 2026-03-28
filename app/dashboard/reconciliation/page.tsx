"use client"

import Link from "next/link"
import {
  ArrowRight,
  HandCoins,
  SearchCheck,
} from "lucide-react"
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"

import { OrderAttendeeBreakdown } from "@/components/dashboard/order-attendee-breakdown"
import { buildReconciliationFollowUpHref } from "@/lib/domain/finance/reconciliation-follow-up"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

type CanonicalOrderStatus = "paid" | "refunded" | "cancelled" | "pending"

type ReconciliationPayload = {
  generatedAt: string
  filters: {
    eventId: string | null
    from: string
    to: string
    status: CanonicalOrderStatus | null
  }
  availableEvents: Array<{
    providerEventId: string
    name: string | null
  }>
  totals: {
    rows: number
    outstandingMinor: number
  }
  rows: Array<{
    providerOrderId: string
    providerEventId: string
    eventName: string | null
    normalizedStatus: CanonicalOrderStatus
    totalAmountMinor: number
    currency: string | null
    orderedAt: string | null
    refundedAt: string | null
    outstandingMinor: number
    reasons: Array<
      | "pending-payment"
      | "cancelled-with-amount"
      | "missing-amount"
      | "refund-without-refunded-at"
    >
  }>
  cursor: string | null
  hasMore: boolean
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

function formatReason(reason: string) {
  switch (reason) {
    case "pending-payment":
      return "Outstanding pending payment"
    case "cancelled-with-amount":
      return "Cancelled order still has amount"
    case "missing-amount":
      return "Missing amount"
    case "refund-without-refunded-at":
      return "Refunded status missing refunded timestamp"
    default:
      return reason
  }
}

export default function ReconciliationPage() {
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

  const [isLoading, setIsLoading] = useState(true)
  const [isFetchingMore, setIsFetchingMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [payload, setPayload] = useState<ReconciliationPayload | null>(null)
  const [rows, setRows] = useState<ReconciliationPayload["rows"]>([])
  const [resolvedAttendeeIdsByOrderId, setResolvedAttendeeIdsByOrderId] =
    useState<Record<string, string>>({})

  const handleResolvedAttendeeId = useCallback(
    ({
      providerOrderId,
      attendeeId,
    }: {
      providerOrderId: string
      attendeeId: string | null
    }) => {
      setResolvedAttendeeIdsByOrderId((previous) => {
        const trimmedAttendeeId = attendeeId?.trim() || null

        if (!trimmedAttendeeId) {
          if (!(providerOrderId in previous)) {
            return previous
          }

          const next = { ...previous }
          delete next[providerOrderId]
          return next
        }

        if (previous[providerOrderId] === trimmedAttendeeId) {
          return previous
        }

        return {
          ...previous,
          [providerOrderId]: trimmedAttendeeId,
        }
      })
    },
    []
  )

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

  const loadReconciliation = useCallback(async (isInitial: boolean) => {
    const fromIso = toIsoBoundary(appliedFrom, "start")
    const toIso = toIsoBoundary(appliedTo, "end")

    if (!fromIso || !toIso) {
      setErrorMessage("Active filter dates are invalid.")
      return
    }

    if (isInitial) {
      setIsLoading(true)
      setRows([])
    } else {
      setIsFetchingMore(true)
    }

    setErrorMessage(null)

    try {
      const query = new URLSearchParams()
      query.set("from", fromIso)
      query.set("to", toIso)
      if (appliedEventId.trim()) query.set("eventId", appliedEventId.trim())
      if (appliedStatus !== "all") query.set("status", appliedStatus)
      if (!isInitial && payload?.cursor) query.set("cursor", payload.cursor)

      const response = await fetch(`/api/dashboard/reconciliation?${query.toString()}`)
      if (!response.ok) throw new Error("Failed to load data")

      const body = (await response.json()) as ReconciliationPayload
      setPayload(body)
      setRows((prev) => (isInitial ? body.rows : [...prev, ...body.rows]))
    } catch (error) {
      setErrorMessage("Error loading reconciliation data.")
    } finally {
      setIsLoading(false)
      setIsFetchingMore(false)
    }
  }, [appliedEventId, appliedFrom, appliedStatus, appliedTo, payload?.cursor])

  useEffect(() => {
    loadReconciliation(true)
  }, [appliedEventId, appliedFrom, appliedStatus, appliedTo])

  // Infinite scroll observer
  const observerTarget = useCallback((node: HTMLDivElement | null) => {
    if (!node || isFetchingMore || !payload?.hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadReconciliation(false)
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [isFetchingMore, payload?.hasMore, loadReconciliation])

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
  }

  return (
    <section className="space-y-8">


      {errorMessage && (
        <article className="rounded-2xl border border-destructive/20 bg-destructive/5 px-6 py-4 text-sm font-medium text-destructive animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="size-2 rounded-full bg-destructive animate-pulse" />
            {errorMessage}
          </div>
        </article>
      )}

      {!errorMessage && payload && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xl font-bold tracking-tight text-foreground">Flagged Orders</h3>
            <p className="text-xs font-medium text-muted-foreground">{payload.totals.rows} items found</p>
          </div>
          
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.length === 0 && !isLoading ? (
              <div className="col-span-full rounded-3xl border border-dashed border-border/50 bg-card/20 p-12 text-center">
                <p className="text-sm font-medium text-muted-foreground">All clear! No reconciliation candidates found.</p>
              </div>
            ) : (
              rows.map((row) => {
                const followUpHref = buildReconciliationFollowUpHref({
                  attendeeId: resolvedAttendeeIdsByOrderId[row.providerOrderId] ?? null,
                  providerOrderId: row.providerOrderId,
                  providerEventId: row.providerEventId,
                })

                return (
                  <article 
                    key={row.providerOrderId}
                    className="flex flex-col overflow-hidden rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl transition-all hover:border-primary/30"
                  >
                    <div className="p-5 pb-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-primary/70">
                            {row.providerOrderId}
                          </p>
                          <h4 className="mt-1 truncate font-bold text-foreground">
                            {row.eventName ?? "Unknown event"}
                          </h4>
                          <p className="text-[10px] font-medium text-muted-foreground mt-0.5">
                            {row.orderedAt ? new Date(row.orderedAt).toLocaleString() : "Recently ordered"}
                          </p>
                        </div>
                        <Badge
                          variant={
                            row.normalizedStatus === "cancelled"
                              ? "destructive"
                              : row.normalizedStatus === "refunded"
                                ? "outline"
                                : "secondary"
                          }
                          className="rounded-lg h-6 text-[10px] font-bold uppercase tracking-wider"
                        >
                          {row.normalizedStatus}
                        </Badge>
                      </div>

                      <div className="mt-6 grid grid-cols-2 gap-3 rounded-2xl border border-border/40 bg-background/30 p-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Amount</p>
                          <p className="mt-0.5 font-bold text-foreground">{formatMoney(row.totalAmountMinor)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Outstanding</p>
                          <p className="mt-0.5 font-bold text-orange-600">{formatMoney(row.outstandingMinor)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-5 pt-4 space-y-4">
                      {row.reasons.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {row.reasons.map((reason) => (
                            <span key={reason} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/30">
                              {formatReason(reason)}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="rounded-2xl border border-border/30 bg-background/20 p-1">
                        <OrderAttendeeBreakdown
                          orderId={row.providerOrderId}
                          eventId={row.providerEventId}
                          onResolvedAttendeeId={handleResolvedAttendeeId}
                        />
                      </div>

                      <Button asChild className="w-full rounded-2xl h-10 shadow-sm" size="sm">
                        <Link href={followUpHref}>
                          Open Follow-up
                          <ArrowRight className="ml-2 size-4" />
                        </Link>
                      </Button>
                    </div>
                  </article>
                )
              })
            )}
            
            {(isLoading || isFetchingMore) && (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-3xl border border-border/50 bg-card/20 p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-6 w-16 ml-auto" />
                  </div>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-16 w-full rounded-2xl" />
                  <Skeleton className="h-10 w-full rounded-2xl" />
                </div>
              ))
            )}
            <div ref={observerTarget} className="h-10 col-span-full opacity-0" />
          </div>
        </div>
      )}
    </section>
  )
}
