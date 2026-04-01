"use client"

import Link from "next/link"
import { ArrowRight, HandCoins, SearchCheck } from "lucide-react"
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
    eventId: string
    title: string | null
  }>
  totals: {
    rows: number
    outstandingMinor: number
  }
  rows: Array<{
    orderId: string | null
    eventId: string
    eventTitle: string | null
    normalizedStatus: CanonicalOrderStatus
    amountDueMinor: number | null
    totalAmountMinor: number | null
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

import { formatMoney } from "@/lib/format"

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
      orderId,
      attendeeId,
    }: {
      orderId: string
      attendeeId: string | null
    }) => {
      setResolvedAttendeeIdsByOrderId((previous) => {
        const trimmedAttendeeId = attendeeId?.trim() || null

        if (!trimmedAttendeeId) {
          if (!(orderId in previous)) {
            return previous
          }

          const next = { ...previous }
          delete next[orderId]
          return next
        }

        if (previous[orderId] === trimmedAttendeeId) {
          return previous
        }

        return {
          ...previous,
          [orderId]: trimmedAttendeeId,
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

  const loadReconciliation = useCallback(
    async (isInitial: boolean) => {
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

        const response = await fetch(
          `/api/dashboard/reconciliation?${query.toString()}`
        )
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
    },
    [appliedEventId, appliedFrom, appliedStatus, appliedTo, payload?.cursor]
  )

  useEffect(() => {
    loadReconciliation(true)
  }, [appliedEventId, appliedFrom, appliedStatus, appliedTo])

  // Infinite scroll observer
  const observerTarget = useCallback(
    (node: HTMLDivElement | null) => {
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
    },
    [isFetchingMore, payload?.hasMore, loadReconciliation]
  )

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
        <article className="animate-in rounded-2xl border border-destructive/20 bg-destructive/5 px-6 py-4 text-sm font-medium text-destructive slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="size-2 animate-pulse rounded-full bg-destructive" />
            {errorMessage}
          </div>
        </article>
      )}

      {!errorMessage && payload && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xl font-bold tracking-tight text-foreground">
              Overview Payment Progress
            </h3>
            <p className="text-xs font-medium text-muted-foreground">
              {payload.totals.rows} items found
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.length === 0 && !isLoading ? (
              <div className="col-span-full rounded-3xl border border-dashed border-border/50 bg-card/20 p-12 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  All clear! No reconciliation candidates found.
                </p>
              </div>
            ) : (
              rows.map((row) => {
                const displayId = row.orderId ?? row.eventId
                const followUpHref = buildReconciliationFollowUpHref({
                  attendeeId:
                    resolvedAttendeeIdsByOrderId[row.orderId ?? ""] ?? null,
                  orderId: row.orderId ?? undefined,
                  providerEventId: row.eventId,
                })

                return (
                  <article
                    key={displayId}
                    className="flex flex-col overflow-hidden rounded-xl border border-border/50 bg-card/40 backdrop-blur-xl transition-all hover:border-primary/30"
                  >
                    <div className="p-5 pb-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[10px] font-bold tracking-wider text-primary/70 uppercase">
                            <span className="text-muted-foreground/60">
                              ID:{" "}
                            </span>
                            {row.orderId ?? "—"}
                          </p>
                          <h4 className="mt-1 truncate font-bold text-foreground">
                            {row.eventTitle ?? "Unknown event"}
                          </h4>
                          <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">
                            {row.orderedAt
                              ? new Date(row.orderedAt).toLocaleString()
                              : "Recently ordered"}
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
                          className="h-6 rounded-lg text-[10px] font-bold tracking-wider uppercase"
                        >
                          {row.normalizedStatus}
                        </Badge>
                      </div>

                      <div className="mt-6 grid grid-cols-2 gap-3 rounded-2xl border border-border/40 bg-background/30 p-4">
                        <div>
                          <p className="text-[10px] font-bold tracking-wider text-muted-foreground/60 uppercase">
                            Amount Due
                          </p>
                          <p className="mt-0.5 font-bold text-foreground">
                            {typeof row.amountDueMinor === "number"
                              ? formatMoney(row.amountDueMinor)
                              : "Missing amount"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold tracking-wider text-muted-foreground/60 uppercase">
                            Outstanding
                          </p>
                          <p className="mt-0.5 font-bold text-orange-600">
                            {formatMoney(row.outstandingMinor)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 p-5 pt-4">
                      {row.reasons.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {row.reasons.map((reason) => (
                            <span
                              key={reason}
                              className="inline-flex items-center rounded-md border border-border/30 bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                            >
                              {formatReason(reason)}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="rounded-2xl border border-border/30 bg-background/20 p-1">
                        <OrderAttendeeBreakdown
                          orderId={row.orderId ?? ""}
                          onResolvedAttendeeId={handleResolvedAttendeeId}
                        />
                      </div>

                      <Button
                        asChild
                        className="h-10 w-full rounded-2xl shadow-sm"
                        size="sm"
                      >
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

            {(isLoading || isFetchingMore) &&
              Array.from({ length: 6 }).map((_, i) => (
                <Card
                  key={i}
                  className="flex flex-col overflow-hidden border-border/50 bg-card/40 backdrop-blur-xl"
                >
                  <CardHeader className="space-y-2 p-5 pb-0">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-2.5 w-24" />
                  </CardHeader>
                  <CardContent className="space-y-5 p-5 pt-6">
                    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border/40 bg-background/30 p-4">
                      <div className="space-y-1.5">
                        <Skeleton className="h-2.5 w-12" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                      <div className="flex flex-col items-end space-y-1.5">
                        <Skeleton className="h-2.5 w-16" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-20 w-full rounded-2xl" />
                    </div>

                    <Skeleton className="h-10 w-full rounded-2xl" />
                  </CardContent>
                </Card>
              ))}
            <div
              ref={observerTarget}
              className="col-span-full h-10 opacity-0"
            />
          </div>
        </div>
      )}
    </section>
  )
}
